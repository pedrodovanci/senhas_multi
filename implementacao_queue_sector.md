# Guia de Implementação — Fila por Setor (Queue Sector)

## Contexto

Este documento orienta a implementação da separação de filas entre a **Recepção** e o **Agendamento Cirúrgico**. O objetivo é que senhas do tipo `agendamento_cirurgico` sejam direcionadas diretamente ao setor cirúrgico, sem aparecer na fila da recepção.

---

## 1. Banco de Dados

### 1.1 Migração — Adicionar coluna `queue_sector`

Execute o comando abaixo diretamente no banco SQLite ou adicione-o ao script de inicialização em `database.ts`:

```sql
ALTER TABLE tickets ADD COLUMN queue_sector TEXT NOT NULL DEFAULT 'recepcao';
```

> **Importante:** O `DEFAULT 'recepcao'` garante que todos os registros existentes sejam atribuídos automaticamente à fila da recepção, sem quebrar dados históricos.

### 1.2 Schema atualizado da tabela `tickets`

```sql
CREATE TABLE IF NOT EXISTS tickets (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  number             TEXT,
  type               TEXT CHECK(type IN ('consulta', 'outros')),
  subtype            TEXT,                          -- 'agendamento_cirurgico' | 'apoio' | NULL
  queue_sector       TEXT NOT NULL DEFAULT 'recepcao', -- 'recepcao' | 'cirurgia'  ← NOVO
  doctor_id          INTEGER,
  workstation_id     INTEGER,
  called_by_user_id  INTEGER,
  status             TEXT DEFAULT 'waiting',
  call_type          TEXT,
  is_specific_call   INTEGER DEFAULT 0,
  requeue_count      INTEGER DEFAULT 0,
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  called_at          DATETIME,
  started_at         DATETIME,
  finished_at        DATETIME,
  requeued_at        DATETIME
);
```

### 1.3 Regra de negócio dos setores

| `subtype`               | `queue_sector` | Prefixo da senha |
|-------------------------|----------------|------------------|
| `agendamento_cirurgico` | `cirurgia`     | `AC`             |
| `apoio`                 | `recepcao`     | `AP`             |
| `NULL` (consulta)       | `recepcao`     | `C`              |

### 1.4 Criar usuário do setor cirúrgico

No painel de administração, cadastre o(s) usuário(s) do Agendamento Cirúrgico com o role `cirurgia`:

```sql
INSERT INTO users (username, password, role, active)
VALUES ('agendamento_cirurgico', '<senha_hash>', 'cirurgia', 1);
```

> O hash da senha deve ser gerado com `bcrypt`. Prefira criar pelo painel admin se ele já suportar o novo role.

---

## 2. Backend — `server/src/index.ts`

### 2.1 `POST /api/tickets` — Criação da senha

Adicionar lógica para definir `queue_sector` e o novo prefixo `AC`:

```typescript
const { doctor_id, type, subtype } = req.body;

let prefix = type === "outros" ? "O" : "C";
if (subtype === "apoio")                 prefix = "AP";
if (subtype === "agendamento_cirurgico") prefix = "AC";  // ← NOVO

// Define o setor destino da senha
const queue_sector = subtype === "agendamento_cirurgico" ? "cirurgia" : "recepcao"; // ← NOVO

// INSERT incluindo queue_sector
await db.run(
  "INSERT INTO tickets (number, doctor_id, type, subtype, queue_sector, status) VALUES (?, ?, ?, ?, ?, ?)",
  [ticketNumber, doctor_id || null, type || "consulta", subtype || null, queue_sector, "waiting"]
);
```

### 2.2 `GET /api/tickets` — Listagem com filtro por setor

Adicionar suporte ao query param `queue_sector`:

```typescript
const { status, queue_sector } = req.query;

// ... query base ...

if (queue_sector) {
  query += " AND t.queue_sector = ?";
  params.push(queue_sector);
}
```

**Exemplos de uso:**
- `GET /api/tickets?status=waiting&queue_sector=recepcao` → fila da recepção
- `GET /api/tickets?status=waiting&queue_sector=cirurgia` → fila do agendamento cirúrgico

### 2.3 `POST /api/tickets/call-next` — Chamada FIFO com filtro de setor

Receber `queue_sector` no body e aplicar no filtro:

```typescript
const { workstation_id, user_id, doctor_id, queue_sector } = req.body; // ← queue_sector NOVO

// Na query de busca do próximo ticket:
if (queue_sector) {
  query += " AND queue_sector = ?";
  params.push(queue_sector);
} else {
  // Segurança: padrão é recepção, nunca chama senhas de cirurgia por acidente
  query += " AND queue_sector = 'recepcao'";
}
```

### 2.4 `GET /api/tickets/waiting-stats` — Estatísticas por setor

Adicionar filtro de setor para que os contadores de cada painel sejam independentes:

```typescript
const { queue_sector } = req.query;
const sectorFilter = queue_sector
  ? `AND queue_sector = '${queue_sector}'`
  : `AND queue_sector = 'recepcao'`;

// Usar sectorFilter em todas as queries internas deste endpoint
```

---

## 3. Frontend — `client/src/types.ts`

### 3.1 Interface `User` — adicionar role `cirurgia`

```typescript
export interface User {
  id: number;
  username: string;
  role: "admin" | "attendant" | "cirurgia"; // ← "cirurgia" NOVO
  active?: boolean;
}
```

### 3.2 Interface `Ticket` — adicionar `queue_sector` e `subtype`

```typescript
export interface Ticket {
  id: number;
  number: string;
  status: "waiting" | "calling" | "in_attendance" | "finished" | "missed";
  type: "consulta" | "outros";  // ← corrigido (era "cirurgia")
  subtype?: string | null;       // ← NOVO
  queue_sector: "recepcao" | "cirurgia"; // ← NOVO
  doctor_id: number;
  // ... demais campos inalterados
}
```

---

## 4. Frontend — `client/src/pages/Attendant.tsx`

### 4.1 Detectar o setor do usuário logado

Logo no início do componente, derivar o setor a partir do `user.role`:

```typescript
const queueSector = user?.role === "cirurgia" ? "cirurgia" : "recepcao";
```

Isso é suficiente para que o mesmo componente `Attendant` sirva para ambos os setores — sem duplicar código.

### 4.2 `fetchData` — buscar apenas senhas do setor correto

```typescript
// Tickets em espera
const ticketsRes = await fetch(
  `${API_URL}/api/tickets?status=waiting&queue_sector=${queueSector}`,
  { headers: { Authorization: `Bearer ${token}` } }
);

// Ticket ativo do atendente
const myActiveRes = await fetch(
  `${API_URL}/api/tickets?queue_sector=${queueSector}`,
  { headers: { Authorization: `Bearer ${token}` } }
);
```

### 4.3 Evento de socket `ticket:created` — ignorar senhas de outros setores

```typescript
const handleCreated = (newTicket: Ticket) => {
  if (newTicket.queue_sector !== queueSector) return; // ← NOVO: ignora setor errado
  setTickets((prev) => {
    if (prev.find((t) => t.id === newTicket.id)) return prev;
    return [...prev, newTicket];
  });
  setRefreshTrigger((prev) => prev + 1);
};
```

### 4.4 `handleCallNext` — enviar o setor na chamada

```typescript
body: JSON.stringify({
  workstation_id: workstation?.id,
  user_id: user?.id,
  doctor_id: doctorId,
  queue_sector: queueSector, // ← NOVO
})
```

### 4.5 Badge visual do setor no header

Adicionar indicador visual para o atendente saber em qual fila está operando:

```tsx
<div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
  queueSector === "cirurgia"
    ? "bg-purple-100 text-purple-700"
    : "bg-blue-100 text-blue-700"
}`}>
  {queueSector === "cirurgia" ? "Agendamento Cirúrgico" : "Recepção"}
</div>
```

### 4.6 Passar `queueSector` para o `DoctorQueueGrid`

```tsx
<DoctorQueueGrid
  onCall={handleCallNext}
  disabled={loading || !!currentTicket}
  refreshTrigger={refreshTrigger}
  queueSector={queueSector} // ← NOVO
/>
```

---

## 5. Componente `DoctorQueueGrid` — ajuste necessário

Este componente não foi incluído nos arquivos enviados, mas precisa ser atualizado para receber e usar a prop `queueSector`.

### 5.1 Adicionar a prop

```typescript
interface DoctorQueueGridProps {
  onCall: (doctorId: number | null) => void;
  disabled: boolean;
  refreshTrigger: number;
  queueSector: "recepcao" | "cirurgia"; // ← NOVO
}
```

### 5.2 Repassar no fetch de `waiting-stats`

Onde o componente busca as estatísticas de fila por médico, adicionar o parâmetro:

```typescript
const res = await fetch(
  `${API_URL}/api/tickets/waiting-stats?queue_sector=${queueSector}`,
  { headers: { Authorization: `Bearer ${token}` } }
);
```

---

## 6. Fluxo completo após a implementação

```
Paciente chega na recepção
        │
        ├─► Quer consulta médica
        │         │
        │         └─► Recepcionista emite senha tipo "consulta"
        │               queue_sector = 'recepcao'
        │               Aparece na fila da RECEPÇÃO ✓
        │               Não aparece no Agendamento Cirúrgico ✓
        │
        └─► Quer agendar cirurgia
                  │
                  └─► Recepcionista emite senha "Agendamento Cirúrgico"
                        queue_sector = 'cirurgia'
                        Prefixo: AC001, AC002...
                        Aparece na fila do AGENDAMENTO CIRÚRGICO ✓
                        Não aparece na recepção ✓
```

---

## 7. Checklist de implementação

- [x] Executar migration `ALTER TABLE tickets ADD COLUMN queue_sector`
- [x] Atualizar `database.ts` com o novo schema
- [x] Atualizar `index.ts` — criação de ticket com `queue_sector`
- [x] Atualizar `index.ts` — filtro em `GET /api/tickets`
- [x] Atualizar `index.ts` — filtro em `POST /api/tickets/call-next`
- [x] Atualizar `index.ts` — filtro em `GET /api/tickets/waiting-stats`
- [x] Atualizar `types.ts` — interface `Ticket` e `User`
- [x] Atualizar `Attendant.tsx` — derivar `queueSector` do role
- [x] Atualizar `Attendant.tsx` — filtrar fetch, socket e chamadas
- [x] Atualizar `DoctorQueueGrid` — aceitar e usar prop `queueSector`
- [x] Criar usuário com role `cirurgia` no painel admin
- [x] Testar emissão de senha AC e verificar que não aparece na recepção
- [x] Testar login do usuário cirurgia e verificar que só vê fila AC
- [x] Garantir isolamento de setores nos modais (Histórico, Atendimento, Reingressar)

## Próximos Passos
- Monitorar logs para garantir que a migração do banco ocorreu corretamente.
- Verificar se a impressão de senhas está correta para o novo setor.
