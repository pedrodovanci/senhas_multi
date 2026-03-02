# Correções Operacionais — Sistema de Senhas CCC

> Documento baseado na análise do código-fonte real. Cobre três pontos levantados na revisão operacional: concorrência de guichês, comportamento do painel de TV e recuperação após queda de energia.

---

## Problema 1 — Condição de Corrida com 12 Guichês Simultâneos

### O que está acontecendo

Os endpoints `POST /api/tickets/call-next` e `POST /api/tickets/call-specific` fazem dois passos separados sem proteção de transação:

```
Passo 1: SELECT * FROM tickets WHERE status = 'waiting' ... LIMIT 1
Passo 2: UPDATE tickets SET status = 'calling' WHERE id = ?
```

Com 12 guichês ativos, dois atendentes podem executar o Passo 1 ao mesmo tempo, ambos pegando a mesma senha, e então ambos executarem o Passo 2 — chamando a mesma senha em dois guichês diferentes. É raro, mas inevitável sob uso intenso.

Adicionalmente, o banco não está configurado com WAL mode, o que significa que qualquer escrita bloqueia **todas** as leituras simultâneas, tornando o sistema mais lento sob carga.

### Correções necessárias

**Arquivo: `server/src/database.ts`**

Adicionar configurações de performance e segurança logo após o `open()`:

```ts
export const initDb = async () => {
  const db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database,
  });

  // ADICIONAR estas linhas imediatamente após o open():
  await db.run('PRAGMA journal_mode = WAL');       // Permite leituras simultâneas durante escritas
  await db.run('PRAGMA busy_timeout = 5000');      // Aguarda até 5s se o banco estiver travado, em vez de dar erro
  await db.run('PRAGMA synchronous = NORMAL');     // Balanceio entre segurança e performance

  // ... resto do initDb permanece igual
};
```

**Arquivo: `server/src/index.ts` — endpoint `call-next`**

Substituir o endpoint inteiro por versão com transação atômica:

```ts
app.post('/api/tickets/call-next', async (req, res) => {
  const { workstation_id, user_id, doctor_id } = req.body;

  try {
    await db.run('BEGIN IMMEDIATE'); // Bloqueia outras escritas durante a operação

    let query = 'SELECT * FROM tickets WHERE status = "waiting"';
    const params: any[] = [];

    if (doctor_id !== undefined) {
      if (doctor_id === null) {
        query += ' AND doctor_id IS NULL';
      } else {
        query += ' AND doctor_id = ?';
        params.push(doctor_id);
      }
    }
    query += ' ORDER BY created_at ASC LIMIT 1';

    const ticket = await db.get(query, params);

    if (!ticket) {
      await db.run('ROLLBACK');
      return res.status(404).json({ message: 'Nenhuma senha aguardando.' });
    }

    await db.run(
      `UPDATE tickets 
       SET status = 'calling', 
           workstation_id = ?, 
           called_by_user_id = ?, 
           called_at = CURRENT_TIMESTAMP,
           call_type = 'FIFO'
       WHERE id = ? AND status = 'waiting'`, // Cláusula AND status = 'waiting' como segunda barreira
      [workstation_id, user_id, ticket.id]
    );

    await db.run('COMMIT');

    const updatedTicket = await db.get(
      `SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
       FROM tickets t 
       LEFT JOIN doctors d ON t.doctor_id = d.id 
       LEFT JOIN workstations w ON t.workstation_id = w.id
       WHERE t.id = ?`,
      ticket.id
    );

    broadcast('ticket:calling', updatedTicket);
    res.json(updatedTicket);

  } catch (err: any) {
    await db.run('ROLLBACK').catch(() => {}); // Garante rollback mesmo se já foi revertido
    console.error('call-next error:', err);
    res.status(500).json({ message: 'Erro ao chamar senha. Tente novamente.' });
  }
});
```

**Arquivo: `server/src/index.ts` — endpoint `call-specific`**

Mesma correção para chamada específica:

```ts
app.post('/api/tickets/call-specific', async (req, res) => {
  const { workstation_id, user_id, ticket_id } = req.body;

  try {
    await db.run('BEGIN IMMEDIATE');

    const ticket = await db.get(
      'SELECT * FROM tickets WHERE id = ? AND status = "waiting"',
      [ticket_id]
    );

    if (!ticket) {
      await db.run('ROLLBACK');
      return res.status(404).json({ message: 'Senha não encontrada ou já foi chamada.' });
    }

    await db.run(
      `UPDATE tickets 
       SET status = 'calling', 
           workstation_id = ?, 
           called_by_user_id = ?, 
           called_at = CURRENT_TIMESTAMP,
           is_specific_call = 1
       WHERE id = ? AND status = 'waiting'`,
      [workstation_id, user_id, ticket_id]
    );

    await db.run('COMMIT');

    const updatedTicket = await db.get(
      `SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
       FROM tickets t 
       LEFT JOIN doctors d ON t.doctor_id = d.id 
       LEFT JOIN workstations w ON t.workstation_id = w.id
       WHERE t.id = ?`,
      [ticket_id]
    );

    broadcast('ticket:calling', updatedTicket);
    res.json(updatedTicket);

  } catch (err: any) {
    await db.run('ROLLBACK').catch(() => {});
    console.error('call-specific error:', err);
    res.status(500).json({ message: 'Erro ao chamar senha. Tente novamente.' });
  }
});
```

### Por que `BEGIN IMMEDIATE` e não `BEGIN`?

O SQLite tem três modos de transação. O `BEGIN IMMEDIATE` adquire o lock de escrita **no início**, impedindo que outro processo inicie uma escrita concorrente enquanto esta estiver em andamento. O `BEGIN` comum só adquire o lock no primeiro `UPDATE`, deixando uma janela de vulnerabilidade entre o `SELECT` e o `UPDATE`.

---

## Problema 2 — Painel de TV exibindo status desnecessários

### O que está acontecendo

O `TVPanel.tsx` escuta três eventos WebSocket:

```ts
socketContext.on('ticket:calling', handleCalling);   // Correto — nova chamada
socketContext.on('ticket:started', handleUpdated);   // Problema — atualiza display para "EM ATENDIMENTO"
socketContext.on('ticket:finished', handleUpdated);  // Problema — atualiza display para "FINALIZADO"
```

Com 12 guichês ativos, o painel vai alternar entre esses status constantemente, substituindo senhas chamadas por mensagens de status que o paciente na sala de espera não precisa ver — e atrapalhando quem acabou de ser chamado e está procurando seu número.

### Correção

**Arquivo: `client/src/pages/TVPanel.tsx`**

Remover os dois listeners desnecessários e simplificar o `useEffect` do WebSocket:

```tsx
// SUBSTITUIR o useEffect do WebSocket inteiro por:
useEffect(() => {
  if (!socketContext || !socketContext.socket) return;

  const handleCalling = (ticket: Ticket) => {
    if (filterType && ticket.type !== filterType) return;
    if (filterDoctor && ticket.doctor_id !== Number(filterDoctor)) return;

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }

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

  socketContext.on('ticket:calling', handleCalling);
  // REMOVIDOS: ticket:started e ticket:finished — TV só exibe chamadas

  return () => {
    socketContext.off('ticket:calling', handleCalling);
  };
}, [socketContext, filterType, filterDoctor]);
```

Também remover o badge de status que muda de cor no display principal, substituindo por um badge fixo:

```tsx
// REMOVER este bloco condicional do badge de status:
<div className={`absolute top-0 left-0 w-full py-4 font-bold text-xl uppercase tracking-[0.5em] ${
  currentTicket.status === 'calling' ? 'bg-yellow-500 text-yellow-900 animate-pulse' :
  currentTicket.status === 'in_attendance' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
}`}>
  {currentTicket.status === 'calling' ? 'CHAMANDO' : 
   currentTicket.status === 'in_attendance' ? 'EM ATENDIMENTO' : 
   currentTicket.status === 'finished' ? 'ATENDIMENTO FINALIZADO' : 'AGUARDE'}
</div>

// SUBSTITUIR por badge fixo — TV sempre exibe como "CHAMANDO":
<div className="absolute top-0 left-0 w-full py-4 font-bold text-xl uppercase tracking-[0.5em] bg-yellow-500 text-yellow-900 animate-pulse">
  CHAMANDO
</div>
```

O painel de TV passa a ter um único comportamento: exibir a senha chamada com o badge "CHAMANDO" e manter o histórico das últimas chamadas. Nenhum status intermediário é exibido.

---

## Problema 3 — Recuperação após Queda de Energia

### O que está acontecendo

O banco de dados (`database.sqlite`) **persiste entre reinicializações** — as senhas do dia não são perdidas. O contador é calculado dinamicamente:

```sql
SELECT count(*) as count FROM tickets WHERE date(created_at) = date("now")
```

Portanto, se caíram 47 senhas antes da queda, a próxima após religar será C048. **Esse comportamento já está correto.**

### O problema real: senhas travadas em status intermediários

Se a queda acontecer com senhas nos status `calling` ou `in_attendance`, elas ficam presas nesses status no banco. Quando o sistema volta:
- O atendente não consegue chamar nova senha (pensa que já tem uma ativa)
- A senha travada aparece como "em atendimento" mas ninguém está atendendo
- O painel de TV pode exibir uma senha fantasma

### Correção: rotina de limpeza no startup

**Arquivo: `server/src/index.ts` — dentro da função `startServer()`, logo após o `initDb()`:**

```ts
const startServer = async () => {
  const db = await initDb();

  // ADICIONAR: Rotina de recuperação pós-queda
  // Executar sempre que o servidor iniciar
  const stuckTickets = await db.all(
    `SELECT id, number, status FROM tickets 
     WHERE status IN ('calling', 'in_attendance')
     AND date(created_at) = date('now')`
  );

  if (stuckTickets.length > 0) {
    console.log(`[Startup] Encontradas ${stuckTickets.length} senha(s) travada(s). Devolvendo para fila...`);

    await db.run(
      `UPDATE tickets 
       SET status = 'waiting',
           workstation_id = NULL,
           called_by_user_id = NULL,
           called_at = NULL,
           started_at = NULL
       WHERE status IN ('calling', 'in_attendance')
       AND date(created_at) = date('now')`
    );

    stuckTickets.forEach(t => {
      console.log(`[Startup] Senha ${t.number} (${t.status}) devolvida para 'waiting'.`);
    });
  }

  // Liberar workstations travadas (atendentes que não fizeram logout antes da queda)
  await db.run(
    `UPDATE workstations SET current_user_id = NULL, is_active = 0`
  );
  console.log('[Startup] Workstations liberadas.');

  // ... resto do startServer permanece igual (rotas, WebSocket, etc.)
};
```

### Por que devolver para `waiting` em vez de `missed`?

Ao devolver para `waiting`, a senha volta para a fila e o paciente pode ser chamado normalmente quando o atendente logar novamente. Marcar como `missed` seria injusto — o paciente não faltou, houve uma queda técnica.

As workstations são liberadas completamente porque os atendentes precisarão fazer login novamente ao religar os computadores — o estado de "quem está em qual guichê" é sempre reconstruído no login.

### Comportamento completo após religar

| Situação antes da queda | Após religar |
|---|---|
| Senhas `waiting` | Permanecem `waiting`, voltam à fila normalmente |
| Senhas `calling` | Voltam para `waiting` automaticamente |
| Senhas `in_attendance` | Voltam para `waiting` automaticamente |
| Senhas `finished` / `missed` | Permanecem como estavam, não são alteradas |
| Workstations com atendente logado | Liberadas — atendentes fazem login novamente |
| Contador de senhas do dia | Continua do número correto (C048, C049...) |

---

## Resumo das Alterações

| Problema | Arquivo(s) | Alteração |
|---|---|---|
| Concorrência de guichês | `server/src/database.ts` | Adicionar PRAGMA WAL + busy_timeout |
| Concorrência de guichês | `server/src/index.ts` | Envolver `call-next` e `call-specific` em `BEGIN IMMEDIATE` |
| TV exibe status desnecessários | `client/src/pages/TVPanel.tsx` | Remover listeners de `ticket:started` e `ticket:finished`; badge fixo "CHAMANDO" |
| Senhas travadas pós-queda | `server/src/index.ts` | Rotina de limpeza no startup — devolve senhas intermediárias para `waiting` |

---

*Correções Operacionais v1.0 — Sistema de Senhas CCC*