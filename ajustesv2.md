# Ajustes e Correções — SGA v2

Documento com todos os ajustes alinhados após análise do código. Organizados por prioridade.

---

## 🔴 Prioridade Alta

### 1. Redirecionamento automático ao expirar o token JWT

**Arquivos:** `client/src/` — criar `utils/api.ts` e atualizar todos os fetches

Criar um wrapper centralizado para todas as requisições. Qualquer resposta 401 deve disparar `AuthContext.logout()` (para manter o estado do React consistente) e redirecionar para `/login`.

```ts
// client/src/utils/api.ts — NOVO ARQUIVO
import { API_URL } from '../config';

type FetchOptions = RequestInit & {
  token?: string | null;
  onUnauthorized?: () => void;
};

export async function apiFetch(path: string, options: FetchOptions = {}): Promise<Response> {
  const { token, onUnauthorized, method, body, headers: inputHeaders, ...rest } = options;

  const headers: HeadersInit = {};

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const hasContentType = (() => {
    if (!inputHeaders) return false;
    if (inputHeaders instanceof Headers) {
      return inputHeaders.has('Content-Type') || inputHeaders.has('content-type');
    }
    if (Array.isArray(inputHeaders)) {
      return inputHeaders.some(([k]) => k.toLowerCase() === 'content-type');
    }
    return Object.keys(inputHeaders).some((k) => k.toLowerCase() === 'content-type');
  })();

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isGetLike = !method || ['GET', 'HEAD'].includes(method.toUpperCase());

  if (!hasContentType && body && !isFormData && !isGetLike) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    body,
    headers: { ...(inputHeaders || {}), ...headers },
    ...rest,
  });

  if (res.status === 401) {
    if (onUnauthorized) onUnauthorized();
    window.location.href = '/login?expired=1';
  }

  return res;
}
```

```tsx
// client/src/pages/Login.tsx — exibir aviso se ?expired=1
const [searchParams] = useSearchParams();
const sessionExpired = searchParams.get('expired') === '1';

// No JSX, antes do formulário:
{sessionExpired && (
  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-center mb-4">
    <p className="text-yellow-800 text-sm font-medium">Sua sessão expirou. Faça login novamente.</p>
  </div>
)}
```

Substituir todos os `fetch(`${API_URL}/api/...`)` existentes por `apiFetch('/api/...')` nos arquivos:
- `Attendant.tsx`
- `Reception.tsx`
- `Admin.tsx`
- `DoctorQueueGrid.tsx`
- `HistoryModal.tsx`
- `AttendanceModal.tsx`
- `RequeueModal.tsx`
- `DoctorsManager.tsx`
- `UsersManager.tsx`

---

### 2. Liberar guichê automaticamente ao fechar o browser

**Arquivo:** `server/src/index.ts` — seção WebSocket

Quando um cliente WebSocket desconectar, aguardar 2 minutos antes de liberar o guichê. Isso evita liberar por queda de rede momentânea.

```ts
// Mapa: workstationId -> { userId, timeout }
const wsSessions = new Map<number, {
  userId: number;
  releaseTimeout: ReturnType<typeof setTimeout> | null;
}>();

wss.on('connection', (ws, req) => {
  console.log('Client connected');

  let workstationId: number | null = null;
  let userId: number | null = null;

  // Cliente envia mensagem de autenticação após conectar
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'auth' && msg.token && msg.workstation_id) {
        const secret = process.env.JWT_SECRET;
        if (!secret) return;
        const decoded = jwt.verify(msg.token, secret);
        workstationId = Number(msg.workstation_id);
        userId = Number(decoded.id);

        if (!Number.isFinite(workstationId) || !Number.isFinite(userId)) return;

        const prev = wsSessions.get(workstationId);
        if (prev?.releaseTimeout) clearTimeout(prev.releaseTimeout);
        wsSessions.set(workstationId, { userId, releaseTimeout: null });
      }
    } catch {}
  });

  ws.on('close', () => {
    console.log('Client disconnected');

    if (workstationId && userId) {
      // Aguardar 2 minutos antes de liberar
      const timeout = setTimeout(async () => {
        await db.run(
          'UPDATE workstations SET current_user_id = NULL, is_active = 0 WHERE id = ? AND current_user_id = ?',
          [workstationId, userId]
        );
        broadcast('workstation:updated', {
          id: workstationId,
          current_user_id: null,
          is_active: 0,
        });
        console.log(`[WS] Guichê ${workstationId} liberado por timeout de desconexão.`);
      }, 2 * 60 * 1000); // 2 minutos

      wsSessions.set(workstationId, { userId, releaseTimeout: timeout });
    }
  });
});
```

```ts
// client/src/contexts/SocketContext.tsx — enviar auth após conectar
ws.onopen = () => {
  console.log('Connected to WebSocket');
  setSocket(ws);

  // Enviar autenticação para o servidor rastrear a sessão
  const token = auth.token;
  const wsData = auth.workstation;
  if (token && wsData) {
    ws.send(JSON.stringify({
      type: 'auth',
      token,
      workstation_id: wsData.id,
    }));
  }
};
```

---

### 3. Job automático para tickets presos em `calling` ou `in_attendance`

**Arquivo:** `server/src/index.ts` — adicionar após inicialização do banco

Tickets em `calling` há mais de 15 minutos ou `in_attendance` há mais de 4 horas sem atualização são automaticamente marcados como `missed`.

```ts
// Adicionar dentro de startServer(), após o startup cleanup
const CALLING_TIMEOUT_MIN = 15;
const ATTENDANCE_TIMEOUT_HOURS = 4;

setInterval(async () => {
  const { start, end } = dayRangeUTC3(); // item 4

  // Tickets em 'calling' há mais de 15 minutos
  const stuckCalling = await db.all(`
    SELECT id, number FROM tickets
    WHERE status = 'calling'
    AND called_at IS NOT NULL
    AND (julianday('now') - julianday(called_at)) * 24 * 60 > ?
    AND created_at BETWEEN ? AND ?
  `, [CALLING_TIMEOUT_MIN, start, end]);

  for (const t of stuckCalling) {
    await db.run(
      `UPDATE tickets SET status = 'missed', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'calling'`,
      [t.id],
    );
    const updated = await db.get(`
      SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
      FROM tickets t
      LEFT JOIN doctors d ON t.doctor_id = d.id
      LEFT JOIN workstations w ON t.workstation_id = w.id
      WHERE t.id = ?`, [t.id]);
    broadcast('ticket:missed', updated);
    console.log(`[Job] Ticket ${t.number} marcado como missed por timeout de calling.`);
  }

  // Tickets em 'in_attendance' há mais de 4 horas
  const stuckAttendance = await db.all(`
    SELECT id, number FROM tickets
    WHERE status = 'in_attendance'
    AND started_at IS NOT NULL
    AND (julianday('now') - julianday(started_at)) * 24 > ?
    AND created_at BETWEEN ? AND ?
  `, [ATTENDANCE_TIMEOUT_HOURS, start, end]);

  for (const t of stuckAttendance) {
    await db.run(
      `UPDATE tickets SET status = 'missed', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'in_attendance'`,
      [t.id],
    );
    const updated = await db.get(`
      SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
      FROM tickets t
      LEFT JOIN doctors d ON t.doctor_id = d.id
      LEFT JOIN workstations w ON t.workstation_id = w.id
      WHERE t.id = ?`, [t.id]);
    broadcast('ticket:missed', updated);
    console.log(`[Job] Ticket ${t.number} marcado como missed por timeout de atendimento.`);
  }
}, 60 * 1000); // Roda a cada 1 minuto
```

---

### 4. Fuso horário — zerar numeração à meia-noite de Brasília

**Arquivo:** `server/src/index.ts` — todas as queries com `date('now')`

São José do Rio Preto é UTC-3 (sem horário de verão). Para evitar bugs perto da meia-noite, em vez de depender de `date('now', '-3 hours')` isolado, calcular um intervalo de “início/fim do dia” em JavaScript (no fuso UTC-3) e usar esse intervalo como parâmetro nas queries do SQLite:

```ts
// Ex.: gerar { start, end } no horário UTC-3 e comparar por intervalo:
// WHERE created_at BETWEEN ? AND ?
```

---

## 🟠 Prioridade Média

### 5. Reconexão WebSocket — refetch do estado atual

**Arquivo:** `client/src/contexts/SocketContext.tsx`

Ao reconectar, disparar um evento customizado para que os componentes saibam que devem refazer seus fetches.

```ts
// SocketContext.tsx — adicionar callback onReconnect
interface SocketContextType {
  socket: WebSocket | null;
  on: <T>(event: string, callback: (data: T) => void) => void;
  off: <T>(event: string, callback: (data: T) => void) => void;
  isConnected: boolean; // NOVO
}

// No connect():
let isFirstConnection = true;

ws.onopen = () => {
  console.log('Connected to WebSocket');
  setSocket(ws);
  setIsConnected(true);

  if (!isFirstConnection) {
    // Disparar evento interno de reconexão
    const callbacks = listeners.get('ws:reconnected');
    callbacks?.forEach(cb => cb(undefined));
  }
  isFirstConnection = false;

  // ... envio de auth (ver item 2)
};

ws.onclose = () => {
  setSocket(null);
  setIsConnected(false);
  isFirstConnection = false;
  reconnectInterval = setTimeout(connect, 3000);
};
```

```ts
// Display.tsx e TVPanel.tsx — escutar reconexão
socketContext.on('ws:reconnected', () => {
  // Refetch do histórico e estado atual
  apiFetch(`/api/tickets/history?limit=7`)
    .then(res => res.json())
    .then(data => { if (Array.isArray(data)) setHistory(data); });
});
```

```ts
// Attendant.tsx — escutar reconexão
socketContext.on('ws:reconnected', () => {
  fetchData(); // já existe, só chamar novamente
});
```

---

### 6. Indicador visual de conexão WebSocket

**Arquivos:** `Display.tsx`, `TVPanel.tsx`, `Attendant.tsx`

```tsx
// Componente reutilizável — client/src/components/ConnectionStatus.tsx
import { useSocket } from '../contexts/SocketContext';

export const ConnectionStatus: React.FC = () => {
  const ctx = useSocket();
  const isConnected = ctx?.isConnected ?? false;

  if (isConnected) return null; // Não mostrar quando conectado

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg animate-pulse">
      <span className="w-2 h-2 bg-white rounded-full"></span>
      <span className="text-sm font-bold">Reconectando...</span>
    </div>
  );
};
```

Adicionar `<ConnectionStatus />` no final do JSX de `Display.tsx`, `TVPanel.tsx` e `Attendant.tsx`.

---

### 7. Aviso de áudio bloqueado no painel

**Arquivos:** `Display.tsx`, `TVPanel.tsx`

```tsx
const [audioUnlocked, setAudioUnlocked] = useState(false);

const unlockAudio = () => {
  if (audioRef.current) {
    // Tocar e pausar imediatamente — só para desbloquear
    audioRef.current.play().then(() => {
      audioRef.current!.pause();
      audioRef.current!.currentTime = 0;
      setAudioUnlocked(true);
    }).catch(() => {});
  }
};

// No JSX — exibir enquanto não desbloqueado:
{!audioUnlocked && (
  <button
    onClick={unlockAudio}
    className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-yellow-400 text-yellow-900 px-4 py-2 rounded-full shadow-lg font-bold text-sm animate-pulse"
  >
    🔇 Clique para ativar o som
  </button>
)}
```

---

### 8. Validação de `doctor_id` no servidor

**Arquivo:** `server/src/index.ts` — rota `POST /api/tickets`

Antes de implementar validação rígida de `type/subtype`, alinhar o mapa completo de valores válidos que o sistema usa hoje (incluindo fluxos como `agendamento_cirurgico`, `apoio`, e possíveis novos tipos/filas). A validação deve refletir esse mapa para não quebrar funcionalidades existentes.

---

### 9. Proteção contra finalização dupla de ticket

**Arquivo:** `server/src/index.ts` — rota `PUT /api/tickets/:id/status`

```ts
app.put('/api/tickets/:id/status', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Buscar ticket atual
  const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
  if (!ticket) {
    return res.status(404).json({ message: 'Senha não encontrada.' });
  }

  // Validar transições permitidas
  const validTransitions: Record<string, string[]> = {
    'calling':       ['in_attendance', 'missed'],
    'in_attendance': ['finished', 'missed'],
  };

  const allowed = validTransitions[ticket.status] || [];
  if (!allowed.includes(status)) {
    return res.status(409).json({
      message: `Transição inválida: ${ticket.status} → ${status}`
    });
  }

  // ... resto da lógica existente
});
```

---

## 🟡 Prioridade Baixa

### 10. Arquivamento diário e tabela de métricas

**Arquivo:** `server/src/database.ts` — adicionar tabela, e `server/src/index.ts` — adicionar job noturno

#### Criar tabela `daily_stats`

```ts
// Em database.ts, dentro do db.exec() de criação de tabelas:
CREATE TABLE IF NOT EXISTS daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- 'YYYY-MM-DD'
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  type TEXT NOT NULL,              -- 'consulta' | 'apoio' | 'agendamento_cirurgico' | 'outros'
  total_attended INTEGER DEFAULT 0,
  total_missed INTEGER DEFAULT 0,
  avg_wait_minutes REAL DEFAULT 0,
  avg_service_minutes REAL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

#### Job de arquivamento (roda às 23h55 todo dia)

```ts
// Em index.ts, dentro de startServer():
const scheduleArchiveJob = () => {
  const now = new Date();
  // Calcular ms até 23h55 no horário local (UTC-3)
  const target = new Date(now);
  target.setHours(23, 55, 0, 0);
  if (now >= target) target.setDate(target.getDate() + 1);

  const delay = target.getTime() - now.getTime();

  setTimeout(async () => {
    await runArchiveJob();
    scheduleArchiveJob(); // Reagendar para o próximo dia
  }, delay);
};

const runArchiveJob = async () => {
  console.log('[Archive] Iniciando arquivamento do dia...');
  const today = new Date();
  today.setHours(today.getHours() - 3); // UTC-3
  const dateStr = today.toISOString().split('T')[0];

  // Agregar por funcionário e tipo
  const rows = await db.all(`
    SELECT
      t.called_by_user_id as user_id,
      u.username,
      t.type,
      t.subtype,
      COUNT(CASE WHEN t.status = 'finished' THEN 1 END) as total_attended,
      COUNT(CASE WHEN t.status = 'missed' THEN 1 END) as total_missed,
      AVG(CASE WHEN t.called_at IS NOT NULL
        THEN (julianday(t.called_at) - julianday(t.created_at)) * 24 * 60
      END) as avg_wait_minutes,
      AVG(CASE WHEN t.started_at IS NOT NULL AND t.finished_at IS NOT NULL
        THEN (julianday(t.finished_at) - julianday(t.started_at)) * 24 * 60
      END) as avg_service_minutes
    FROM tickets t
    JOIN users u ON t.called_by_user_id = u.id
    WHERE date(t.created_at, '-3 hours') = ?
    AND t.called_by_user_id IS NOT NULL
    GROUP BY t.called_by_user_id, t.type, t.subtype
  `, [dateStr]);

  for (const row of rows) {
    const type = row.subtype || row.type;
    await db.run(`
      INSERT INTO daily_stats (date, user_id, username, type, total_attended, total_missed, avg_wait_minutes, avg_service_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [dateStr, row.user_id, row.username, type,
        row.total_attended, row.total_missed,
        Math.round(row.avg_wait_minutes || 0),
        Math.round(row.avg_service_minutes || 0)]);
  }

  console.log(`[Archive] Dia ${dateStr} arquivado. ${rows.length} registros salvos.`);
};

scheduleArchiveJob();
```

#### Nova rota para o Admin acessar histórico

```ts
// GET /api/stats/history?start=2026-01-01&end=2026-03-01
app.get('/api/stats/history', verifyToken, requireAdmin, async (req, res) => {
  const { start, end } = req.query;
  const rows = await db.all(`
    SELECT * FROM daily_stats
    WHERE date >= ? AND date <= ?
    ORDER BY date DESC, total_attended DESC
  `, [start || '2000-01-01', end || '2099-12-31']);
  res.json(rows);
});
```

---

### 11. Indicador de posto ocupado no seletor de guichê (Login)

**Arquivo:** `client/src/pages/Login.tsx`

Atualmente o login retorna erro 409 apenas após o submit. Melhorar a UX marcando visualmente os guichês já ocupados no select, para o atendente saber antes de tentar.

```tsx
// Buscar workstations com status de ocupação
// A rota /api/workstations já retorna current_user_id
{workstations.map(ws => (
  <option
    key={ws.id}
    value={ws.id}
    disabled={!!ws.current_user_id && ws.code !== 'RET01'}
  >
    {ws.name}{ws.current_user_id ? ' — Ocupado' : ''}
  </option>
))}
```

---

## Resumo de Arquivos Afetados

| Arquivo | Itens |
|---------|-------|
| `server/src/index.ts` | 1, 2, 3, 4, 8, 9, 10 |
| `server/src/database.ts` | 4, 10 |
| `client/src/utils/api.ts` | 1 (novo arquivo) |
| `client/src/contexts/SocketContext.tsx` | 2, 5, 6 |
| `client/src/components/ConnectionStatus.tsx` | 6 (novo arquivo) |
| `client/src/pages/Login.tsx` | 1, 11 |
| `client/src/pages/Attendant.tsx` | 1, 5 |
| `client/src/pages/Display.tsx` | 1, 5, 6, 7 |
| `client/src/pages/TVPanel.tsx` | 1, 5, 6, 7 |
| `client/src/pages/Admin.tsx` | 1, 10 |
| `client/src/pages/Reception.tsx` | 1 |
| Todos os modais/componentes com fetch | 1 |
