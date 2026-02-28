# Correções de Bugs — Sistema de Senhas CCC

> Documento baseado na análise do código-fonte (`client/` e `server/`). Cada correção indica o arquivo exato, o trecho atual e o que deve ser alterado.

---

## Bug 1 — `/painel` duplica o histórico de senhas

### Causa Raiz

No `TVPanel.tsx`, o `useEffect` que busca o estado inicial via `fetch('/api/tickets/history')` define `currentTicket` como a senha mais recente **e** o `useEffect` do WebSocket escuta `ticket:calling` e também atualiza `currentTicket`. Na inicialização, se já houver uma senha no estado `calling` no banco, ela aparece tanto no fetch inicial quanto no próximo evento WebSocket recebido, causando a duplicação no histórico.

Além disso, a lógica de mover `currentTicket` para o histórico dentro do `setCurrentTicket` usando o callback `prev =>` com um `setHistory` aninhado é problemática: ela pode executar fora de ordem dependendo do ciclo de render do React.

### Arquivo: `client/src/pages/TVPanel.tsx`

**Substituir o `useEffect` do WebSocket inteiro (linhas ~52–80) por:**

```tsx
useEffect(() => {
  if (!socketContext || !socketContext.socket) return;

  const handleCalling = (ticket: Ticket) => {
    // Apply filters
    if (filterType && ticket.type !== filterType) return;
    if (filterDoctor && ticket.doctor_id !== Number(filterDoctor)) return;

    // Play sound
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }

    // Move current to history BEFORE setting the new current
    // Use functional updates to avoid stale closures
    setCurrentTicket(prev => {
      if (prev && prev.id !== ticket.id) {
        setHistory(h => {
          const alreadyInHistory = h.some(t => t.id === prev.id);
          if (alreadyInHistory) return h;
          return [prev, ...h].slice(0, 5);
        });
      }
      return ticket;
    });
  };

  const handleUpdated = (ticket: Ticket) => {
    setCurrentTicket(prev => prev?.id === ticket.id ? ticket : prev);
    setHistory(prev => prev.map(t => t.id === ticket.id ? ticket : t));
  };

  socketContext.on('ticket:calling', handleCalling);
  socketContext.on('ticket:started', handleUpdated);
  socketContext.on('ticket:finished', handleUpdated);

  return () => {
    socketContext.off('ticket:calling', handleCalling);
    socketContext.off('ticket:started', handleUpdated);
    socketContext.off('ticket:finished', handleUpdated);
  };
}, [socketContext, filterType, filterDoctor]); // <- dependências corretas
```

**O que mudou:**
- Adicionado `filterType` e `filterDoctor` no array de dependências do `useEffect` (antes estava vazio `[]`, o que fazia o closure capturar os valores iniciais e nunca atualizar).
- Adicionada a verificação `alreadyInHistory` antes de empurrar para o histórico, evitando duplicatas quando o componente re-executa os effects.
- A separação clara entre "mover para histórico" e "definir novo current" garante a ordem de execução.

---

## Bug 2 — Cronômetro zerado no card do médico (`/atendente`)

### Causa Raiz

O campo `oldest_created_at` retornado pelo endpoint `/api/tickets/queue-stats` vem do SQLite como string no formato `"2024-01-15 14:32:00"` (sem timezone, sem o `T` separador, sem `Z`). Quando o JavaScript faz `new Date("2024-01-15 14:32:00")`, o comportamento é **undefined** em alguns browsers — retorna `Invalid Date` ou interpreta como UTC dependendo do engine.

No `DoctorQueueCard.tsx`, a função `getWaitTime()` faz:
```ts
const start = new Date(oldestTicketTime).getTime(); // NaN em alguns casos
const diff = Math.max(0, Math.floor((currentTime - start) / 1000)); // Math.max(0, NaN) = 0
```

`Math.max(0, NaN)` retorna `0`, por isso o cronômetro sempre mostra `00:00:00`.

### Correção em dois pontos:

**Ponto A — Servidor: `server/src/index.ts`**

Na query do endpoint `/api/tickets/queue-stats`, formatar o `oldest_created_at` com timezone ISO:

```ts
// Localizar a query de queue-stats (em torno da linha 280)
// Alterar de:
const oldest = await db.get(
  'SELECT created_at FROM tickets WHERE ...'
);
// ...
oldest_created_at: oldest?.created_at,

// Para — adicionar o replace para garantir formato ISO:
oldest_created_at: oldest?.created_at
  ? oldest.created_at.replace(' ', 'T') + 'Z'
  : null,
```

**Ponto B — Frontend: `client/src/components/DoctorQueueCard.tsx`**

Tornar o parse mais robusto na função `getWaitTime()`:

```ts
// Substituir:
const getWaitTime = () => {
  if (!oldestTicketTime) return '00:00:00';
  const start = new Date(oldestTicketTime).getTime();
  const diff = Math.max(0, Math.floor((currentTime - start) / 1000));
  // ...
};

// Por:
const getWaitTime = () => {
  if (!oldestTicketTime) return '00:00:00';

  // Normalizar formato SQLite para ISO 8601
  const normalized = oldestTicketTime.includes('T')
    ? oldestTicketTime
    : oldestTicketTime.replace(' ', 'T') + 'Z';

  const start = new Date(normalized).getTime();

  if (isNaN(start)) return '00:00:00'; // Proteção contra formato inválido

  const diff = Math.max(0, Math.floor((currentTime - start) / 1000));
  const hours = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;

  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
```

> **Nota:** Aplicar a mesma correção de normalização no `TicketTimer` em `Attendant.tsx`, que já tem o tratamento mas pode receber `started_at` em formato inconsistente do banco:
> ```ts
> // Linha ~27 de Attendant.tsx — já está correto, manter como está:
> const dateStr = startTime.includes('Z')
>   ? startTime
>   : startTime.replace(' ', 'T') + 'Z';
> ```
> O `TicketTimer` já trata isso corretamente. O `DoctorQueueCard` não tratava — agora vai.

---

## Bug 3 — Impressão em `/recepcao/consultas` deve disparar direto sem passar pelo modal

### Contexto atual

O fluxo atual em `Reception.tsx` é:
1. Clica no médico → `generateTicket()` → backend cria senha → exibe modal de confirmação
2. Usuário clica manualmente em "Imprimir e Fechar" → `window.print()` → fecha modal

### Comportamento desejado

1. Clica no médico → backend cria senha
2. **Impressão dispara automaticamente** (`window.print()`) sem necessidade de clique adicional
3. Se não houver impressora, `window.print()` ainda abre o diálogo do Windows/OS — isso é o comportamento correto e esperado pelo navegador
4. **Mesmo sem impressora configurada**, a senha deve ser gerada normalmente — o erro de impressão não deve bloquear o fluxo

### Arquivo: `client/src/pages/Reception.tsx`

**Substituir a função `generateTicket` por:**

```tsx
const generateTicket = async (doctorId: number) => {
  setLoading(true);
  try {
    const res = await fetch('http://localhost:3000/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctor_id: doctorId,
        type: ticketType
      })
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.message || 'Erro ao gerar senha');
      return;
    }

    const data = await res.json();
    setLastTicket(data);

    // Disparar impressão automaticamente após um tick
    // para garantir que o layout de impressão está montado no DOM
    setTimeout(() => {
      window.print();
      // Fechar modal após a impressão (ou cancelamento do diálogo)
      setTimeout(() => setLastTicket(null), 1500);
    }, 300);

  } catch (err) {
    console.error(err);
    alert('Erro ao gerar senha');
  } finally {
    setLoading(false);
  }
};
```

**Remover o botão "Imprimir e Fechar" do modal**, pois a impressão agora é automática. Substituir o botão por um indicador visual:

```tsx
// Dentro do modal, onde estava o botão "Imprimir e Fechar":
// Remover:
<button
  onClick={() => {
    window.print();
    setTimeout(() => setLastTicket(null), 1000);
  }}
  className="..."
>
  Imprimir e Fechar
</button>

// Substituir por (mensagem simples, o modal fecha sozinho):
<p className="text-sm text-gray-400 mt-4">
  Imprimindo automaticamente...
</p>
```

### Sobre o erro "impressora não encontrada"

O `window.print()` abre o diálogo de impressão nativo do sistema operacional. Se nenhuma impressora estiver instalada, o próprio Windows exibe a mensagem de erro adequada — **o sistema web não tem como detectar isso diretamente**.

O que o servidor já faz corretamente (em `index.ts` na criação do ticket):
```ts
try {
  await printer.printTicket(newTicket);
} catch (err) {
  console.error('Failed to print ticket:', err); // Loga mas não bloqueia
}
res.json(newTicket); // Retorna a senha normalmente mesmo se falhar a impressão
```

A senha **já é gerada independentemente** de a impressão ter sucesso ou não. O comportamento está correto no servidor. Nenhuma alteração necessária no backend para este ponto.

---

## Resumo das Alterações

| Bug | Arquivo(s) | Tipo de alteração |
|---|---|---|
| Duplicação no `/painel` | `client/src/pages/TVPanel.tsx` | Refatorar lógica do `useEffect` do WebSocket |
| Cronômetro zerado | `server/src/index.ts` + `client/src/components/DoctorQueueCard.tsx` | Normalizar formato de data SQLite → ISO 8601 |
| Impressão automática | `client/src/pages/Reception.tsx` | Chamar `window.print()` automaticamente no `generateTicket` |

---

*Correções v1.0 — Sistema de Senhas CCC*