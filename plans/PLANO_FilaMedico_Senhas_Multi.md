# Fila do Médico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o segundo ciclo de chamada (médico → TV) descrito em `plans/SPEC_FilaMedico_Senhas_Multi.md`: atendente encaminha paciente finalizado para a fila de um médico; médico loga num terminal próprio e chama o paciente; a chamada aparece na mesma TV que já exibe as chamadas de guichê.

**Architecture:** Fila de pacientes encaminhados vive inteiramente em RAM (módulo isolado `server/src/doctorCallQueue.ts`), sem persistência. Login do médico é uma linha em `users` (`role='medico'`, `doctor_id` FK opcional 1:1) criada a partir do próprio formulário de "Médicos" no Admin. TV consome um evento novo (`doctor:calling`) através de uma fila de exibição com tempo mínimo (5s) que já existia como necessidade para os eventos de guichê também, evitando que uma chamada atropele a outra no mesmo card.

**Tech Stack:** Node 18+ / Express 5 / TypeScript / SQLite (`sqlite` + `sqlite3`) / `ws` no backend. React 19 / Vite 7 / TypeScript no frontend. Jest + Supertest (já instalados, não configurados) para testes de servidor. Vitest (já instalado, não configurado) para o utilitário puro do cliente.

## Global Constraints

- Nome do paciente nunca persiste em nenhum banco — só existe na RAM do processo Node, dentro do módulo `doctorCallQueue.ts` (spec, seção 2).
- A fila em memória é indexada por `doctorId`, nunca por sessão/login ativo (spec, seção 5) — funciona mesmo antes do médico logar no dia.
- Login de médico é sempre opcional e criado/editado exclusivamente pelo formulário "Médicos" do Admin — nunca pela tela de Usuários (spec, seções 4 e 10).
- O seletor de "Encaminhar para médico" no Attendant só lista médicos com login configurado, independente de estarem logados agora (spec, seção 6).
- TV usa um único card compartilhado — nunca dividir a tela. Tempo mínimo de exibição: 5000ms. Mesmo som de alerta para chamada de guichê e de médico (spec, seção 3).
- Toda mudança de schema em `server/src/database.ts` precisa funcionar tanto para banco novo (`CREATE TABLE IF NOT EXISTS`) quanto para banco existente (bloco de migração condicional) — siga exatamente o padrão já usado para a migração do papel `'cirurgia'` (linhas 43–66 do arquivo atual).
- Não usar Redis nesta implementação — é plano B documentado, fora de escopo (spec, seção 2).

---

## Visão geral das fases

- **Fase A — Infra de teste + fundação de dados (Tasks 1–6):** jest configurado, módulo de fila em memória, migrações de schema, JWT com `doctor_id`, evento `server:boot`.
- **Fase B — Endpoints (Tasks 7–11):** CRUD de médicos com login, exclusão de médico da listagem de usuários, login retornando `doctor_id`, encaminhamento, fila do médico.
- **Fase C — Fundação do cliente (Tasks 12–13):** tipos TypeScript, vitest configurado, fila de exibição da TV (lógica pura testada).
- **Fase D — UI (Tasks 14–18):** formulário de médicos, redirecionamento de login, modal de encaminhamento no Attendant, terminal do médico, TVPanel consumindo a nova fila de exibição.

---

### Task 1: Infra de teste do servidor (Jest + banco isolado)

**Files:**
- Create: `server/jest.config.js`, `server/jest.setup.js`
- Modify: `server/package.json`
- Modify: `server/src/database.ts:5-10`
- Modify: `server/src/index.ts:212-213`, `server/src/index.ts:1468-1518`, `server/src/index.ts:1539-1543`
- Test: `server/src/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: `initDb(dbPath: string = "./database.sqlite")` — aceita caminho do banco (use `":memory:"` em testes).
- Produces: `startServer(listen: boolean = true, dbPath: string = "./database.sqlite")` — repassa `dbPath` para `initDb`.
- Produces: `startServer(...)` agora retorna `{ app, httpServer, wss, db, recoveryInterval }` — todo teste que chama `startServer(false, ":memory:")` precisa `clearInterval(ctx.recoveryInterval)` no `afterAll`, **antes** de `db.close()`, ou o processo do Jest termina com exit code 1 mesmo com os testes passando (o `setInterval` de `scheduleTicketRecovery` continua rodando depois do banco fechado e lança `SQLITE_MISUSE`).
- Produces: `server/jest.setup.js` força `PRINTER_ENABLED=false` antes de qualquer teste — **crítico**: sem isso, qualquer teste que crie tickets via `POST /api/tickets` dispara impressão ESC/POS real contra o `PRINTER_HOST` configurado no `.env`, incluindo impressoras de produção.

- [ ] **Step 1: Escrever o teste que vai falhar**

Criar `server/src/__tests__/smoke.test.ts`:

```ts
import request from "supertest";
import { startServer } from "../index";

describe("smoke", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  it("responde 401 sem token em rota protegida", async () => {
    const res = await request(ctx.app).get("/api/users");
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha (initDb ainda não aceita parâmetro)**

Run: `cd server && npx jest src/__tests__/smoke.test.ts`
Expected: FAIL — `jest: command not found` ou erro de config, porque `jest.config.js` ainda não existe.

- [ ] **Step 3: Criar a configuração do Jest**

Criar `server/jest.config.js`:

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
};
```

- [ ] **Step 4: Atualizar o script de teste**

Em `server/package.json`, trocar a linha:

```json
    "test": "echo \"Error: no test specified\" && exit 1",
```

por:

```json
    "test": "jest",
```

- [ ] **Step 5: Tornar `initDb` parametrizável**

Em `server/src/database.ts`, trocar (linhas 5–10):

```ts
export const initDb = async () => {
  console.log("Initializing database...");
  const db = await open({
    filename: "./database.sqlite",
    driver: sqlite3.Database,
  });
```

por:

```ts
export const initDb = async (dbPath: string = "./database.sqlite") => {
  console.log("Initializing database...");
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
```

- [ ] **Step 6: Tornar `startServer` parametrizável**

Em `server/src/index.ts`, trocar (linha 212–213):

```ts
const startServer = async (listen: boolean = true) => {
  const db = await initDb();
```

por:

```ts
const startServer = async (
  listen: boolean = true,
  dbPath: string = "./database.sqlite",
) => {
  const db = await initDb(dbPath);
```

- [ ] **Step 7: Permitir limpar o timer de recuperação de senhas em testes**

`scheduleTicketRecovery()` agenda um `setInterval` que roda a cada 60s e nunca é limpo — em produção isso é o comportamento desejado (o processo nunca para), mas em testes, depois do `db.close()`, esse timer continua disparando e tenta consultar um banco já fechado, lançando `SQLITE_MISUSE` e fazendo o processo do Jest sair com código de erro mesmo com todos os testes passando.

Em `server/src/index.ts`, trocar (final da função `scheduleTicketRecovery` e sua chamada):

```ts
    };
    setInterval(run, 60000);
  };
  scheduleTicketRecovery();
```

por:

```ts
    };
    return setInterval(run, 60000);
  };
  const recoveryInterval = scheduleTicketRecovery();
```

E trocar o `return` final de `startServer`:

```ts
  return { app, httpServer, wss, db };
```

por:

```ts
  return { app, httpServer, wss, db, recoveryInterval };
```

- [ ] **Step 8: Rodar e confirmar que passa, com saída limpa**

Run: `cd server && npx jest src/__tests__/smoke.test.ts`
Expected: PASS — 1 teste passando, e o processo termina com exit code 0 (sem `SQLITE_MISUSE` nem aviso de "Jest did not exit one second after the test run").

- [ ] **Step 9: Desabilitar a impressão real (ESC/POS) durante os testes**

`index.ts` chama `dotenv.config()` ao ser importado, carregando `PRINTER_HOST`/`PRINTER_PORT`/`PRINTER_ENABLED` do `.env` real do servidor. Várias rotas de ticket (`POST /api/tickets`, usada em testes futuros das Tasks 10/11) disparam impressão de verdade via socket TCP (`printTicketToNetwork`), de forma fire-and-forget, sem nenhum mock. Se o `.env` tiver `PRINTER_ENABLED=true` com um host real, **toda execução da suíte de testes manda tickets físicos pra essa impressora** — incluindo impressoras de produção, se o `.env` de desenvolvimento apontar para uma.

Criar `server/jest.setup.js`:

```js
// Desabilita a impressao ESC/POS real durante os testes, ANTES de qualquer
// modulo (index.ts) chamar dotenv.config() e carregar PRINTER_HOST/PRINTER_ENABLED
// do .env real. dotenv.config() nao sobrescreve variaveis ja definidas em
// process.env, entao isso vence o valor do .env.
process.env.PRINTER_ENABLED = "false";
```

Em `server/jest.config.js`, trocar:

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
};
```

por:

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  setupFiles: ["<rootDir>/jest.setup.js"],
};
```

- [ ] **Step 10: Confirmar que nenhuma impressão real acontece**

Run: `cd server && npx jest 2>&1 | grep -i "printer\|enviado"`
Expected: nenhuma linha `[Printer] Ticket ... enviado` aparece. Deve aparecer só `[Startup] Impressora desativada: PRINTER_ENABLED=false.` no log de cada suíte.

- [ ] **Step 11: Commit**

```bash
git add server/jest.config.js server/jest.setup.js server/package.json server/src/database.ts server/src/index.ts server/src/__tests__/smoke.test.ts
git commit -m "test: configura jest+supertest com banco isolado em memória"
```

---

### Task 2: Módulo isolado da fila do médico (RAM)

**Files:**
- Create: `server/src/doctorCallQueue.ts`
- Test: `server/src/__tests__/doctorCallQueue.test.ts`

**Interfaces:**
- Produces: `interface DoctorQueueEntry { id: string; ticketId: number; ticketNumber: string; patientName: string; forwardedAt: string }`
- Produces: `adicionar(doctorId: number, entry: { ticketId: number; ticketNumber: string; patientName: string }): DoctorQueueEntry`
- Produces: `listar(doctorId: number): DoctorQueueEntry[]`
- Produces: `chamarProximo(doctorId: number): DoctorQueueEntry | null`
- Produces: `chamarEspecifico(doctorId: number, entryId: string): DoctorQueueEntry | null`
- Produces: `remover(doctorId: number, entryId: string): boolean`
- Produces: `limpar(doctorId: number): void`
- Consumes: nada (módulo puro, sem dependência de banco ou Express).

- [ ] **Step 1: Escrever os testes que vão falhar**

Criar `server/src/__tests__/doctorCallQueue.test.ts`:

```ts
import {
  adicionar,
  listar,
  chamarProximo,
  chamarEspecifico,
  remover,
  limpar,
} from "../doctorCallQueue";

describe("doctorCallQueue", () => {
  it("adiciona e lista em ordem de chegada (FIFO)", () => {
    const doctorId = 1001;
    adicionar(doctorId, { ticketId: 1, ticketNumber: "C001", patientName: "Ana" });
    adicionar(doctorId, { ticketId: 2, ticketNumber: "C002", patientName: "Bruno" });

    const fila = listar(doctorId);
    expect(fila.map((e) => e.ticketNumber)).toEqual(["C001", "C002"]);
  });

  it("chamarProximo remove e retorna o primeiro da fila", () => {
    const doctorId = 1002;
    adicionar(doctorId, { ticketId: 3, ticketNumber: "C003", patientName: "Carla" });
    adicionar(doctorId, { ticketId: 4, ticketNumber: "C004", patientName: "Davi" });

    const chamado = chamarProximo(doctorId);
    expect(chamado?.ticketNumber).toBe("C003");
    expect(listar(doctorId).map((e) => e.ticketNumber)).toEqual(["C004"]);
  });

  it("chamarProximo retorna null quando a fila está vazia", () => {
    expect(chamarProximo(9999)).toBeNull();
  });

  it("chamarEspecifico remove um item fora de ordem", () => {
    const doctorId = 1003;
    adicionar(doctorId, { ticketId: 5, ticketNumber: "C005", patientName: "Elis" });
    const segunda = adicionar(doctorId, { ticketId: 6, ticketNumber: "C006", patientName: "Fabio" });
    adicionar(doctorId, { ticketId: 7, ticketNumber: "C007", patientName: "Gisele" });

    const chamado = chamarEspecifico(doctorId, segunda.id);
    expect(chamado?.ticketNumber).toBe("C006");
    expect(listar(doctorId).map((e) => e.ticketNumber)).toEqual(["C005", "C007"]);
  });

  it("remover tira um item específico sem chamar", () => {
    const doctorId = 1004;
    const entry = adicionar(doctorId, { ticketId: 8, ticketNumber: "C008", patientName: "Hugo" });
    expect(remover(doctorId, entry.id)).toBe(true);
    expect(listar(doctorId)).toEqual([]);
  });

  it("limpar esvazia a fila inteira", () => {
    const doctorId = 1005;
    adicionar(doctorId, { ticketId: 9, ticketNumber: "C009", patientName: "Iris" });
    limpar(doctorId);
    expect(listar(doctorId)).toEqual([]);
  });

  it("filas de médicos diferentes não se misturam", () => {
    adicionar(2001, { ticketId: 10, ticketNumber: "C010", patientName: "Joao" });
    adicionar(2002, { ticketId: 11, ticketNumber: "C011", patientName: "Karla" });
    expect(listar(2001).map((e) => e.ticketNumber)).toEqual(["C010"]);
    expect(listar(2002).map((e) => e.ticketNumber)).toEqual(["C011"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/doctorCallQueue.test.ts`
Expected: FAIL — `Cannot find module '../doctorCallQueue'`

- [ ] **Step 3: Implementar o módulo**

Criar `server/src/doctorCallQueue.ts`:

```ts
export interface DoctorQueueEntry {
  id: string;
  ticketId: number;
  ticketNumber: string;
  patientName: string;
  forwardedAt: string;
}

const queues = new Map<number, DoctorQueueEntry[]>();
let nextEntryId = 1;

export const adicionar = (
  doctorId: number,
  entry: { ticketId: number; ticketNumber: string; patientName: string },
): DoctorQueueEntry => {
  const fullEntry: DoctorQueueEntry = {
    id: String(nextEntryId++),
    ticketId: entry.ticketId,
    ticketNumber: entry.ticketNumber,
    patientName: entry.patientName,
    forwardedAt: new Date().toISOString(),
  };
  const queue = queues.get(doctorId) ?? [];
  queue.push(fullEntry);
  queues.set(doctorId, queue);
  return fullEntry;
};

export const listar = (doctorId: number): DoctorQueueEntry[] => {
  return queues.get(doctorId) ?? [];
};

export const chamarProximo = (doctorId: number): DoctorQueueEntry | null => {
  const queue = queues.get(doctorId);
  if (!queue || queue.length === 0) return null;
  const [entry] = queue.splice(0, 1);
  return entry;
};

export const chamarEspecifico = (
  doctorId: number,
  entryId: string,
): DoctorQueueEntry | null => {
  const queue = queues.get(doctorId);
  if (!queue) return null;
  const index = queue.findIndex((e) => e.id === entryId);
  if (index === -1) return null;
  const [entry] = queue.splice(index, 1);
  return entry;
};

export const remover = (doctorId: number, entryId: string): boolean => {
  const queue = queues.get(doctorId);
  if (!queue) return false;
  const index = queue.findIndex((e) => e.id === entryId);
  if (index === -1) return false;
  queue.splice(index, 1);
  return true;
};

export const limpar = (doctorId: number): void => {
  queues.delete(doctorId);
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/doctorCallQueue.test.ts`
Expected: PASS — 7 testes passando.

- [ ] **Step 5: Commit**

```bash
git add server/src/doctorCallQueue.ts server/src/__tests__/doctorCallQueue.test.ts
git commit -m "feat: adiciona modulo isolado de fila do medico em memoria"
```

---

### Task 3: Migração — coluna `doctors.room`

**Files:**
- Modify: `server/src/database.ts:174-179` (CREATE TABLE base)
- Modify: `server/src/database.ts:240-246` (bloco de migrações incrementais de `doctors`)
- Test: `server/src/__tests__/database.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: `initDb(dbPath)` de Task 1.
- Produces: coluna `doctors.room TEXT` (nullable), disponível em qualquer `SELECT * FROM doctors`.

- [ ] **Step 1: Escrever o teste que vai falhar**

Criar `server/src/__tests__/database.test.ts`:

```ts
import { initDb } from "../database";

describe("database migrations", () => {
  it("cria a coluna doctors.room", async () => {
    const db = await initDb(":memory:");
    const columns = await db.all("PRAGMA table_info(doctors)");
    const names = columns.map((c: any) => c.name);
    expect(names).toContain("room");
    await db.close();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/database.test.ts`
Expected: FAIL — `expect(names).toContain("room")` falha porque a coluna não existe.

- [ ] **Step 3: Adicionar `room` na criação base da tabela**

Em `server/src/database.ts`, trocar (linhas 174–179):

```ts
    -- DOCTORS (Maintained for assignment context)
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      specialization TEXT,
      prefix TEXT
    );
```

por:

```ts
    -- DOCTORS (Maintained for assignment context)
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      specialization TEXT,
      prefix TEXT,
      room TEXT
    );
```

- [ ] **Step 4: Adicionar migração incremental para bancos existentes**

Em `server/src/database.ts`, depois do bloco (linhas 243–246):

```ts
  if (!doctorColumnNames.includes("prefix")) {
    await db.run("ALTER TABLE doctors ADD COLUMN prefix TEXT");
    console.log("Migration: Added doctors.prefix");
  }
```

adicionar imediatamente depois:

```ts

  if (!doctorColumnNames.includes("room")) {
    await db.run("ALTER TABLE doctors ADD COLUMN room TEXT");
    console.log("Migration: Added doctors.room");
  }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/database.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/database.ts server/src/__tests__/database.test.ts
git commit -m "feat: adiciona coluna doctors.room"
```

---

### Task 4: Migração — `users.role='medico'` + `users.doctor_id`

**Files:**
- Modify: `server/src/database.ts:43-66` (logo após o bloco de migração do papel `cirurgia`)
- Modify: `server/src/database.ts:155-161` (CREATE TABLE base de `users`)
- Modify: `server/src/__tests__/database.test.ts`

**Interfaces:**
- Consumes: `initDb(dbPath)` de Task 1.
- Produces: `users.role` aceita `'medico'`; `users.doctor_id INTEGER UNIQUE REFERENCES doctors(id)` (nullable, único quando não-nulo — garante 0 ou 1 login por médico).

- [ ] **Step 1: Escrever o teste que vai falhar**

Em `server/src/__tests__/database.test.ts`, adicionar dentro do `describe` existente:

```ts
  it("aceita role 'medico' e tem coluna doctor_id única", async () => {
    const db = await initDb(":memory:");
    const columns = await db.all("PRAGMA table_info(users)");
    const names = columns.map((c: any) => c.name);
    expect(names).toContain("doctor_id");

    const insertResult = await db.run(
      "INSERT INTO doctors (name, specialization, prefix) VALUES ('Dr. Teste', 'Clinica', 'TST')",
    );
    const doctorId = insertResult.lastID;

    await db.run(
      "INSERT INTO users (username, password, role, doctor_id) VALUES (?, ?, 'medico', ?)",
      ["medico_teste", "hash", doctorId],
    );

    await expect(
      db.run(
        "INSERT INTO users (username, password, role, doctor_id) VALUES (?, ?, 'medico', ?)",
        ["medico_teste2", "hash", doctorId],
      ),
    ).rejects.toThrow();

    await db.close();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/database.test.ts`
Expected: FAIL — `doctor_id` não existe na tabela `users` ainda.

- [ ] **Step 3: Atualizar a criação base da tabela `users`**

Em `server/src/database.ts`, trocar (linhas 155–161):

```ts
    -- USERS
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT CHECK(role IN ('admin', 'attendant', 'cirurgia')),
      active BOOLEAN DEFAULT 1
    );
```

por:

```ts
    -- USERS
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT CHECK(role IN ('admin', 'attendant', 'cirurgia', 'medico')),
      active BOOLEAN DEFAULT 1,
      doctor_id INTEGER UNIQUE REFERENCES doctors(id)
    );
```

- [ ] **Step 4: Adicionar bloco de migração para bancos existentes**

Em `server/src/database.ts`, imediatamente depois do bloco de migração do papel `cirurgia` (que termina na linha 66 com `console.log("Users table migrated.");` e `}`), adicionar:

```ts

  // Check if users table needs migration for 'medico' role + doctor_id
  const usersTableForMedico = await db.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
  );
  if (usersTableForMedico && !usersTableForMedico.sql.includes("'medico'")) {
    console.log("Migrating users table to support 'medico' role...");
    await db.run("PRAGMA foreign_keys=OFF");
    await db.run("ALTER TABLE users RENAME TO users_old");
    await db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT CHECK(role IN ('admin', 'attendant', 'cirurgia', 'medico')),
        active BOOLEAN DEFAULT 1,
        doctor_id INTEGER UNIQUE REFERENCES doctors(id)
      )
    `);
    await db.run(
      "INSERT INTO users (id, username, password, role, active) SELECT id, username, password, role, active FROM users_old",
    );
    await db.run("DROP TABLE users_old");
    await db.run("PRAGMA foreign_keys=ON");
    console.log("Users table migrated for 'medico' role.");
  }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/database.test.ts`
Expected: PASS — 2 testes passando.

- [ ] **Step 6: Commit**

```bash
git add server/src/database.ts server/src/__tests__/database.test.ts
git commit -m "feat: adiciona role medico e coluna users.doctor_id (1:1 opcional)"
```

---

### Task 5: `doctor_id` no JWT + middleware `requireMedico`

**Files:**
- Modify: `server/src/middleware/auth.ts:51-69` (tipo `AuthRequest` e `generateToken`)
- Modify: `server/src/middleware/auth.ts:93-104` (adicionar `requireMedico` depois de `requireAdmin`)
- Test: `server/src/__tests__/auth.test.ts` (novo arquivo)

**Interfaces:**
- Produces: `AuthRequest.user.doctor_id?: number`
- Produces: `generateToken(user: { id; username; role; doctor_id?: number | null }): string`
- Produces: `requireMedico(req, res, next)` — 403 se `role !== 'medico'` ou sem `doctor_id`.

- [ ] **Step 1: Escrever o teste que vai falhar**

Criar `server/src/__tests__/auth.test.ts`:

```ts
import jwt from "jsonwebtoken";
import { generateToken, requireMedico, AuthRequest } from "../middleware/auth";

describe("auth middleware - medico", () => {
  it("generateToken inclui doctor_id quando presente", () => {
    const token = generateToken({
      id: 1,
      username: "medico1",
      role: "medico",
      doctor_id: 42,
    });
    const decoded = jwt.decode(token) as any;
    expect(decoded.doctor_id).toBe(42);
  });

  it("generateToken omite doctor_id quando ausente", () => {
    const token = generateToken({ id: 2, username: "atendente1", role: "attendant" });
    const decoded = jwt.decode(token) as any;
    expect(decoded.doctor_id).toBeUndefined();
  });

  it("requireMedico bloqueia quem não é medico", () => {
    const req = { user: { id: 1, username: "x", role: "attendant" } } as AuthRequest;
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) } as any;
    const next = jest.fn();

    requireMedico(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireMedico bloqueia medico sem doctor_id", () => {
    const req = { user: { id: 1, username: "x", role: "medico" } } as AuthRequest;
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) } as any;
    const next = jest.fn();

    requireMedico(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireMedico libera medico com doctor_id", () => {
    const req = { user: { id: 1, username: "x", role: "medico", doctor_id: 42 } } as AuthRequest;
    const res = {} as any;
    const next = jest.fn();

    requireMedico(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/auth.test.ts`
Expected: FAIL — `requireMedico` não existe, e `generateToken` ignora `doctor_id`.

- [ ] **Step 3: Atualizar o tipo `AuthRequest` e `generateToken`**

Em `server/src/middleware/auth.ts`, trocar (linhas 51–69):

```ts
export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

export const generateToken = (user: {
  id: number;
  username: string;
  role: string;
}) => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET_KEY,
    { expiresIn: "12h" },
  );
};
```

por:

```ts
export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
    doctor_id?: number;
  };
}

export const generateToken = (user: {
  id: number;
  username: string;
  role: string;
  doctor_id?: number | null;
}) => {
  const payload: Record<string, unknown> = {
    id: user.id,
    username: user.username,
    role: user.role,
  };
  if (user.doctor_id != null) {
    payload.doctor_id = user.doctor_id;
  }
  return jwt.sign(payload, SECRET_KEY, { expiresIn: "12h" });
};
```

- [ ] **Step 4: Adicionar `requireMedico`**

Em `server/src/middleware/auth.ts`, depois do final de `requireAdmin` (linhas 93–104), adicionar:

```ts

export const requireMedico = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user || req.user.role !== "medico" || !req.user.doctor_id) {
    return res
      .status(403)
      .json({ message: "Acesso restrito a médicos com fila habilitada." });
  }
  next();
};
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/auth.test.ts`
Expected: PASS — 5 testes passando.

- [ ] **Step 6: Commit**

```bash
git add server/src/middleware/auth.ts server/src/__tests__/auth.test.ts
git commit -m "feat: doctor_id no JWT e middleware requireMedico"
```

---

### Task 6: Evento `server:boot` no WebSocket

**Files:**
- Modify: `server/src/index.ts:1-9` (imports)
- Modify: `server/src/index.ts:24-26` (depois de `recentPrints`)
- Modify: `server/src/index.ts:1416` (handler de `connection`)
- Test: `server/src/__tests__/serverBoot.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: `wss` (já existente, módulo-scoped).
- Produces: toda nova conexão WebSocket recebe `{ type: "server:boot", data: { bootId: string } }` imediatamente ao conectar.

- [ ] **Step 1: Escrever o teste que vai falhar**

Criar `server/src/__tests__/serverBoot.test.ts`:

```ts
import WebSocket from "ws";
import { startServer } from "../index";

describe("server:boot", () => {
  it("envia bootId para todo cliente que conecta", async () => {
    const ctx = await startServer(false, ":memory:");
    const server = ctx.httpServer.listen(0);
    const port = (server.address() as any).port;

    const received: any[] = [];
    const ws = new WebSocket(`ws://localhost:${port}`);

    await new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        received.push(JSON.parse(data.toString()));
        resolve();
      });
    });

    expect(received[0].type).toBe("server:boot");
    expect(typeof received[0].data.bootId).toBe("string");
    expect(received[0].data.bootId.length).toBeGreaterThan(0);

    ws.close();
    server.close();
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/serverBoot.test.ts`
Expected: FAIL — timeout, porque nenhuma mensagem é enviada na conexão.

- [ ] **Step 3: Importar `crypto` e gerar o `bootId`**

Em `server/src/index.ts`, trocar (linha 9):

```ts
import dotenv from "dotenv";
```

por:

```ts
import dotenv from "dotenv";
import crypto from "crypto";
```

Em seguida, trocar (linha 26):

```ts
const recentPrints = new Map<string, number>();
```

por:

```ts
const recentPrints = new Map<string, number>();
const SERVER_BOOT_ID = crypto.randomUUID();
```

- [ ] **Step 4: Enviar `server:boot` em toda nova conexão**

Em `server/src/index.ts`, trocar (linha 1416):

```ts
  wss.on("connection", (ws) => {
    let wsWorkstation: number | null = null;
```

por:

```ts
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "server:boot", data: { bootId: SERVER_BOOT_ID } }));
    let wsWorkstation: number | null = null;
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/serverBoot.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts server/src/__tests__/serverBoot.test.ts
git commit -m "feat: emite server:boot ao conectar no websocket"
```

---

### Task 7: `/api/doctors` com sala + login opcional (username/senha)

**Files:**
- Modify: `server/src/index.ts:544-631` (rotas GET/POST/PUT/DELETE `/api/doctors`)
- Test: `server/src/__tests__/doctors.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: `startServer(false, ":memory:")` de Task 1; `bcrypt` (já importado em `index.ts`); `doctor_id` no JWT de Task 5 (o teste decodifica o token em vez de ler `loginRes.body.user.doctor_id`, porque esse campo na resposta JSON do `/api/login` só é adicionado na Task 9 — verificar pelo token evita uma dependência incorreta de uma task posterior).
- Produces: `GET /api/doctors` retorna `{ ..., room, medico_username }` por linha; aceita `?has_login=true`.
- Produces: `POST /api/doctors` e `PUT /api/doctors/:id` aceitam `room`, `username`, `password` opcionais; criam/atualizam o login vinculado.
- Produces: `DELETE /api/doctors/:id` remove também o login vinculado (se houver).

- [ ] **Step 1: Escrever os testes que vão falhar**

Criar `server/src/__tests__/doctors.test.ts`:

```ts
import request from "supertest";
import jwt from "jsonwebtoken";
import { startServer } from "../index";

describe("/api/doctors com login de medico", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
    const login = await request(ctx.app)
      .post("/api/login")
      .send({ username: "admin", password: "admin" });
    adminToken = login.body.token;
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  it("cria medico sem login quando username/senha não são enviados", async () => {
    const res = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dr. Sem Login", specialization: "Clinica", prefix: "DSL", room: "Sala 1" });

    expect(res.status).toBe(200);
    expect(res.body.room).toBe("Sala 1");
    expect(res.body.medico_username).toBeNull();
  });

  it("cria medico com login quando username/senha são enviados", async () => {
    const res = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Com Login",
        specialization: "Clinica",
        prefix: "DCL",
        room: "Sala 2",
        username: "dr_login",
        password: "senha123",
      });

    expect(res.status).toBe(200);
    expect(res.body.medico_username).toBe("dr_login");

    const loginRes = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_login", password: "senha123" });
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.user.role).toBe("medico");
    const decoded = jwt.decode(loginRes.body.token) as any;
    expect(decoded.doctor_id).toBe(res.body.id);
  });

  it("GET /api/doctors?has_login=true só retorna medicos com login", async () => {
    const res = await request(ctx.app).get("/api/doctors?has_login=true");
    expect(res.status).toBe(200);
    expect(res.body.every((d: any) => d.medico_username)).toBe(true);
    expect(res.body.some((d: any) => d.medico_username === "dr_login")).toBe(true);
  });

  it("PUT adiciona login depois, sem ter sido criado na criação", async () => {
    const created = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dr. Tardio", specialization: "Clinica", prefix: "DTD" });

    const updated = await request(ctx.app)
      .put(`/api/doctors/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Tardio",
        specialization: "Clinica",
        prefix: "DTD",
        username: "dr_tardio",
        password: "outrasenha",
      });

    expect(updated.body.medico_username).toBe("dr_tardio");
  });

  it("PUT sem senha mantém a senha atual (login continua funcionando)", async () => {
    const created = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Manter",
        specialization: "Clinica",
        prefix: "DMT",
        username: "dr_manter",
        password: "senhaoriginal",
      });

    await request(ctx.app)
      .put(`/api/doctors/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dr. Manter Editado", specialization: "Clinica", prefix: "DMT", username: "dr_manter" });

    const loginRes = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_manter", password: "senhaoriginal" });
    expect(loginRes.body.success).toBe(true);
  });

  it("DELETE remove também o login vinculado", async () => {
    const created = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Removido",
        specialization: "Clinica",
        prefix: "DRM",
        username: "dr_removido",
        password: "senha",
      });

    await request(ctx.app)
      .delete(`/api/doctors/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const loginRes = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_removido", password: "senha" });
    expect(loginRes.body.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/doctors.test.ts`
Expected: FAIL — `medico_username` é `undefined`, login com `dr_login` não existe.

- [ ] **Step 3: Substituir as quatro rotas de `/api/doctors`**

Em `server/src/index.ts`, substituir todo o bloco das linhas 543–631 (do comentário `// Doctors` até o fechamento da rota `DELETE`) por:

```ts
  // Doctors
  app.get("/api/doctors", async (req, res) => {
    const { has_login } = req.query;
    let query = `
      SELECT d.*, u.username as medico_username
      FROM doctors d
      LEFT JOIN users u ON u.doctor_id = d.id AND u.role = 'medico'
    `;
    if (has_login === "true") {
      query += " WHERE u.id IS NOT NULL";
    }
    const doctors = await db.all(query);
    res.json(doctors);
  });

  // Create Doctor
  app.post("/api/doctors", verifyToken, requireAdmin, async (req, res) => {
    const { name, specialization, prefix, room, username, password } = req.body;
    try {
      const normalizedPrefix = normalizeDoctorPrefix(prefix);
      if (!normalizedPrefix) {
        return res.status(400).json({
          error:
            "Prefixo inválido. Use 2–4 caracteres (letras/números), e não use prefixos reservados.",
        });
      }

      const conflict = await db.get(
        "SELECT id FROM doctors WHERE lower(prefix) = lower(?) LIMIT 1",
        [normalizedPrefix],
      );
      if (conflict) {
        return res.status(409).json({ error: "Prefixo já está em uso." });
      }

      const wantsLogin = !!(username && String(username).trim() && password && String(password).trim());
      if (wantsLogin) {
        const userConflict = await db.get(
          "SELECT id FROM users WHERE lower(username) = lower(?) LIMIT 1",
          [String(username).trim()],
        );
        if (userConflict) {
          return res.status(409).json({ error: "Nome de usuário já está em uso." });
        }
      }

      const result = await db.run(
        "INSERT INTO doctors (name, specialization, prefix, room) VALUES (?, ?, ?, ?)",
        [name, specialization, normalizedPrefix, room || null],
      );
      const doctorId = result.lastID;

      if (wantsLogin) {
        const hashedPassword = await bcrypt.hash(String(password).trim(), 10);
        await db.run(
          "INSERT INTO users (username, password, role, doctor_id) VALUES (?, ?, 'medico', ?)",
          [String(username).trim(), hashedPassword, doctorId],
        );
      }

      const newDoctor = await db.get(
        `
          SELECT d.*, u.username as medico_username
          FROM doctors d
          LEFT JOIN users u ON u.doctor_id = d.id AND u.role = 'medico'
          WHERE d.id = ?
        `,
        [doctorId],
      );
      broadcast("doctor:created", newDoctor);
      res.json(newDoctor);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update Doctor
  app.put("/api/doctors/:id", verifyToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, specialization, prefix, room, username, password } = req.body;
    try {
      const normalizedPrefix = normalizeDoctorPrefix(prefix);
      if (!normalizedPrefix) {
        return res.status(400).json({
          error:
            "Prefixo inválido. Use 2–4 caracteres (letras/números), e não use prefixos reservados.",
        });
      }

      const conflict = await db.get(
        "SELECT id FROM doctors WHERE id <> ? AND lower(prefix) = lower(?) LIMIT 1",
        [id, normalizedPrefix],
      );
      if (conflict) {
        return res.status(409).json({ error: "Prefixo já está em uso." });
      }

      await db.run(
        "UPDATE doctors SET name = ?, specialization = ?, prefix = ?, room = ? WHERE id = ?",
        [name, specialization, normalizedPrefix, room || null, id],
      );

      if (username && String(username).trim()) {
        const trimmedUsername = String(username).trim();
        const existingLogin = await db.get(
          "SELECT id FROM users WHERE doctor_id = ? AND role = 'medico'",
          [id],
        );

        const userConflict = await db.get(
          "SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ?",
          [trimmedUsername, existingLogin?.id ?? -1],
        );
        if (userConflict) {
          return res.status(409).json({ error: "Nome de usuário já está em uso." });
        }

        if (existingLogin) {
          if (password && String(password).trim()) {
            const hashedPassword = await bcrypt.hash(String(password).trim(), 10);
            await db.run("UPDATE users SET username = ?, password = ? WHERE id = ?", [
              trimmedUsername,
              hashedPassword,
              existingLogin.id,
            ]);
          } else {
            await db.run("UPDATE users SET username = ? WHERE id = ?", [
              trimmedUsername,
              existingLogin.id,
            ]);
          }
        } else if (password && String(password).trim()) {
          const hashedPassword = await bcrypt.hash(String(password).trim(), 10);
          await db.run(
            "INSERT INTO users (username, password, role, doctor_id) VALUES (?, ?, 'medico', ?)",
            [trimmedUsername, hashedPassword, id],
          );
        }
      }

      const updated = await db.get(
        `
          SELECT d.*, u.username as medico_username
          FROM doctors d
          LEFT JOIN users u ON u.doctor_id = d.id AND u.role = 'medico'
          WHERE d.id = ?
        `,
        [id],
      );
      broadcast("doctor:updated", updated);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Doctor
  app.delete(
    "/api/doctors/:id",
    verifyToken,
    requireAdmin,
    async (req, res) => {
      const { id } = req.params;
      try {
        await db.run("DELETE FROM users WHERE doctor_id = ? AND role = 'medico'", [id]);
        await db.run("DELETE FROM doctors WHERE id = ?", [id]);
        broadcast("doctor:deleted", { id: Number(id) });
        res.json({ message: "Deleted" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/doctors.test.ts`
Expected: PASS — 6 testes passando.

- [ ] **Step 5: Rodar a suíte inteira para garantir que nada quebrou**

Run: `cd server && npx jest`
Expected: PASS em todos os arquivos de teste já criados (Tasks 1–7).

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts server/src/__tests__/doctors.test.ts
git commit -m "feat: medico com login opcional direto no formulario de Medicos"
```

---

### Task 8: `/api/users` deixa de listar/criar contas `medico`

**Files:**
- Modify: `server/src/index.ts:634-679` (`GET`, `POST`, `PUT` `/api/users`)
- Test: `server/src/__tests__/users.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: `startServer(false, ":memory:")` de Task 1.
- Produces: `GET /api/users` nunca retorna linhas com `role = 'medico'`; `POST`/`PUT /api/users` rejeitam `role: 'medico'` com 400.

- [ ] **Step 1: Escrever os testes que vão falhar**

Criar `server/src/__tests__/users.test.ts`:

```ts
import request from "supertest";
import { startServer } from "../index";

describe("/api/users exclui medico", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
    const login = await request(ctx.app)
      .post("/api/login")
      .send({ username: "admin", password: "admin" });
    adminToken = login.body.token;

    const doctor = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Oculto",
        specialization: "Clinica",
        prefix: "DOC",
        username: "dr_oculto",
        password: "senha",
      });
    expect(doctor.body.medico_username).toBe("dr_oculto");
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  it("GET /api/users não inclui contas medico", async () => {
    const res = await request(ctx.app)
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.some((u: any) => u.username === "dr_oculto")).toBe(false);
  });

  it("POST /api/users rejeita role medico", async () => {
    const res = await request(ctx.app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ username: "tentativa_medico", password: "senha", role: "medico" });

    expect(res.status).toBe(400);
  });

  it("PUT /api/users/:id rejeita role medico", async () => {
    const attendant = await request(ctx.app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ username: "atendente_normal", password: "senha", role: "attendant" });

    const res = await request(ctx.app)
      .put(`/api/users/${attendant.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ username: "atendente_normal", role: "medico", active: true });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/users.test.ts`
Expected: FAIL — `dr_oculto` aparece em `GET /api/users`; `POST`/`PUT` aceitam `role: 'medico'` sem erro.

- [ ] **Step 3: Atualizar `GET /api/users`**

Em `server/src/index.ts`, trocar (linhas 634–637):

```ts
  app.get("/api/users", verifyToken, requireAdmin, async (req, res) => {
    const users = await db.all("SELECT id, username, role, active FROM users");
    res.json(users);
  });
```

por:

```ts
  app.get("/api/users", verifyToken, requireAdmin, async (req, res) => {
    const users = await db.all(
      "SELECT id, username, role, active FROM users WHERE role != 'medico'",
    );
    res.json(users);
  });
```

- [ ] **Step 4: Bloquear `role: 'medico'` em `POST /api/users`**

Trocar (linhas 640–642):

```ts
  app.post("/api/users", verifyToken, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    try {
```

por:

```ts
  app.post("/api/users", verifyToken, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    if (role === "medico") {
      return res
        .status(400)
        .json({ error: "Contas de médico são criadas na tela de Médicos." });
    }
    try {
```

- [ ] **Step 5: Bloquear `role: 'medico'` em `PUT /api/users/:id`**

Trocar (linhas 659–662):

```ts
  app.put("/api/users/:id", verifyToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, password, role, active } = req.body;
    try {
```

por:

```ts
  app.put("/api/users/:id", verifyToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, password, role, active } = req.body;
    if (role === "medico") {
      return res
        .status(400)
        .json({ error: "Contas de médico são editadas na tela de Médicos." });
    }
    try {
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/users.test.ts`
Expected: PASS — 3 testes passando.

- [ ] **Step 7: Commit**

```bash
git add server/src/index.ts server/src/__tests__/users.test.ts
git commit -m "feat: tela de usuarios deixa de listar/criar contas medico"
```

---

### Task 9: `/api/login` retorna `doctor_id`

**Files:**
- Modify: `server/src/index.ts:313-317`
- Test: `server/src/__tests__/login.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: `generateToken` de Task 5 (já aceita `doctor_id`); coluna `users.doctor_id` de Task 4.
- Produces: resposta de `/api/login` inclui `user.doctor_id` (número ou `null`); token JWT do médico carrega `doctor_id`.

- [ ] **Step 1: Escrever o teste que vai falhar**

Criar `server/src/__tests__/login.test.ts`:

```ts
import request from "supertest";
import jwt from "jsonwebtoken";
import { startServer } from "../index";

describe("/api/login com doctor_id", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
    const adminLogin = await request(ctx.app)
      .post("/api/login")
      .send({ username: "admin", password: "admin" });
    adminToken = adminLogin.body.token;
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  it("login de medico retorna doctor_id no user e no token", async () => {
    const doctor = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Login Test",
        specialization: "Clinica",
        prefix: "DLT",
        username: "dr_login_test",
        password: "senha123",
      });

    const res = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_login_test", password: "senha123" });

    expect(res.body.user.doctor_id).toBe(doctor.body.id);

    const decoded = jwt.decode(res.body.token) as any;
    expect(decoded.doctor_id).toBe(doctor.body.id);
  });

  it("login de atendente retorna doctor_id null", async () => {
    const res = await request(ctx.app)
      .post("/api/login")
      .send({ username: "atendente1", password: "1234" });

    expect(res.body.user.doctor_id).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/login.test.ts`
Expected: FAIL — `res.body.user.doctor_id` é `undefined`.

- [ ] **Step 3: Atualizar a resposta de `/api/login`**

Em `server/src/index.ts`, trocar (linhas 313–317):

```ts
    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  });
```

por:

```ts
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        doctor_id: user.doctor_id ?? null,
      },
    });
  });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/login.test.ts`
Expected: PASS — 2 testes passando.

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/src/__tests__/login.test.ts
git commit -m "feat: login retorna doctor_id para contas medico"
```

---

### Task 10: `POST /api/tickets/:id/forward-to-doctor`

**Files:**
- Modify: `server/src/index.ts:1-18` (import do módulo de fila)
- Modify: `server/src/index.ts:1322-1324` (logo depois do fechamento da rota `PUT /api/tickets/:id/status`)
- Test: `server/src/__tests__/forwardToDoctor.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: `adicionar` de `doctorCallQueue.ts` (Task 2); `broadcast` (já existente em `index.ts`).
- Produces: `POST /api/tickets/:id/forward-to-doctor` `{ doctor_id, patient_name }` → finaliza o ticket (`status='in_attendance' → 'finished'`) e adiciona na fila do médico, numa transação lógica única; 409 se o ticket já não estava `in_attendance` (idempotência); 400 se o médico não tem login configurado.

- [ ] **Step 1: Escrever os testes que vão falhar**

Criar `server/src/__tests__/forwardToDoctor.test.ts`:

```ts
import request from "supertest";
import { startServer } from "../index";

describe("POST /api/tickets/:id/forward-to-doctor", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;
  let doctorId: number;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
    const login = await request(ctx.app)
      .post("/api/login")
      .send({ username: "admin", password: "admin" });
    adminToken = login.body.token;

    const doctor = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Fila",
        specialization: "Clinica",
        prefix: "DFL",
        room: "Sala 5",
        username: "dr_fila",
        password: "senha",
      });
    doctorId = doctor.body.id;
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  const criarTicketEmAtendimento = async () => {
    const ws = await ctx.db.get("SELECT id FROM workstations WHERE code = 'G01'");
    const created = await request(ctx.app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "outros" });

    await ctx.db.run(
      "UPDATE tickets SET status = 'calling', workstation_id = ?, called_at = CURRENT_TIMESTAMP WHERE id = ?",
      [ws.id, created.body.id],
    );
    await ctx.db.run(
      "UPDATE tickets SET status = 'in_attendance', started_at = CURRENT_TIMESTAMP WHERE id = ?",
      [created.body.id],
    );
    return created.body.id;
  };

  it("encaminha com sucesso: finaliza o ticket e adiciona na fila do medico", async () => {
    const ticketId = await criarTicketEmAtendimento();

    const res = await request(ctx.app)
      .post(`/api/tickets/${ticketId}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: doctorId, patient_name: "Paciente Teste" });

    expect(res.status).toBe(200);
    expect(res.body.entry.patientName).toBe("Paciente Teste");

    const ticket = await ctx.db.get("SELECT status FROM tickets WHERE id = ?", [ticketId]);
    expect(ticket.status).toBe("finished");
  });

  it("rejeita 400 quando medico não tem login", async () => {
    const semLoginDoctor = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dr. Sem Fila", specialization: "Clinica", prefix: "DSF" });

    const ticketId = await criarTicketEmAtendimento();

    const res = await request(ctx.app)
      .post(`/api/tickets/${ticketId}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: semLoginDoctor.body.id, patient_name: "Paciente X" });

    expect(res.status).toBe(400);
  });

  it("idempotente: a segunda chamada retorna 409 e não duplica na fila", async () => {
    const ticketId = await criarTicketEmAtendimento();

    const primeira = await request(ctx.app)
      .post(`/api/tickets/${ticketId}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: doctorId, patient_name: "Duplicado" });
    expect(primeira.status).toBe(200);

    const segunda = await request(ctx.app)
      .post(`/api/tickets/${ticketId}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: doctorId, patient_name: "Duplicado" });
    expect(segunda.status).toBe(409);

    const medicoLogin = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_fila", password: "senha" });
    const fila = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoLogin.body.token}`);

    const ocorrencias = fila.body.filter((e: any) => e.patientName === "Duplicado");
    expect(ocorrencias.length).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/forwardToDoctor.test.ts`
Expected: FAIL — rota não existe (404) e `/api/doctor-queue/mine` também não existe ainda (essa parte será resolvida na Task 11; por ora espere falha por rota ausente).

- [ ] **Step 3: Importar o módulo da fila**

Em `server/src/index.ts`, na lista de imports do topo (linha 1–18), adicionar:

```ts
import { adicionar as adicionarNaFilaDoMedico } from "./doctorCallQueue";
```

- [ ] **Step 4: Adicionar a rota**

Em `server/src/index.ts`, imediatamente depois do fechamento da rota `PUT /api/tickets/:id/status` (linha 1323, `});`), adicionar:

```ts

  // Forward to Doctor (finaliza o atendimento e encaminha para a fila do medico)
  app.post(
    "/api/tickets/:id/forward-to-doctor",
    verifyToken,
    async (req, res) => {
      const { id } = req.params;
      const { doctor_id, patient_name } = req.body;

      if (!doctor_id || typeof patient_name !== "string" || !patient_name.trim()) {
        return res
          .status(400)
          .json({ message: "Médico e nome do paciente são obrigatórios." });
      }

      const medicoUser = await db.get(
        "SELECT id FROM users WHERE doctor_id = ? AND role = 'medico' AND active = 1",
        [doctor_id],
      );
      if (!medicoUser) {
        return res
          .status(400)
          .json({ message: "Médico selecionado não tem fila habilitada." });
      }

      const result = await db.run(
        "UPDATE tickets SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'in_attendance'",
        [id],
      );

      if (result.changes === 0) {
        return res.status(409).json({ message: "Atendimento já foi finalizado." });
      }

      const updatedTicket = await db.get(
        `
          SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
          FROM tickets t
          LEFT JOIN doctors d ON t.doctor_id = d.id
          LEFT JOIN workstations w ON t.workstation_id = w.id
          WHERE t.id = ?
        `,
        id,
      );

      const entry = adicionarNaFilaDoMedico(Number(doctor_id), {
        ticketId: Number(id),
        ticketNumber: updatedTicket.number,
        patientName: patient_name.trim(),
      });

      broadcast("ticket:finished", updatedTicket);
      broadcast("doctor:queue-updated", { doctor_id: Number(doctor_id) });

      res.json({ success: true, ticket: updatedTicket, entry });
    },
  );
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/forwardToDoctor.test.ts`
Expected: ainda FAIL no teste de idempotência, porque `GET /api/doctor-queue/mine` (usado para verificar duplicação) só é criado na Task 11. Os dois primeiros testes (`encaminha com sucesso` e `rejeita 400`) devem passar; o teste `idempotente` falha em `request(ctx.app).get("/api/doctor-queue/mine")` com 404 — isso é esperado nesta task. Confirme que **só** essa rota está faltando (404 nela), não um erro diferente.

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts server/src/__tests__/forwardToDoctor.test.ts
git commit -m "feat: endpoint de encaminhamento de paciente para fila do medico"
```

---

### Task 11: `/api/doctor-queue/mine`, `call-next`, `call/:entryId`

**Files:**
- Modify: `server/src/index.ts` (import, junto ao import de `adicionar` feito na Task 10)
- Modify: `server/src/index.ts` (logo depois da rota `forward-to-doctor` adicionada na Task 10)
- Modify: `server/src/middleware/auth.ts` (nenhuma mudança — só consumo de `requireMedico` da Task 5)
- Test: `server/src/__tests__/forwardToDoctor.test.ts` (reexecutar — o teste de idempotência passa a 100% nesta task)
- Test: `server/src/__tests__/doctorQueueEndpoints.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: `listar`, `chamarProximo`, `chamarEspecifico` de `doctorCallQueue.ts` (Task 2); `requireMedico` (Task 5).
- Produces: `GET /api/doctor-queue/mine` (médico, lê `doctor_id` do JWT); `POST /api/doctor-queue/call-next`; `POST /api/doctor-queue/call/:entryId`. Os dois últimos emitem `doctor:calling` (consumido pela TV) e `doctor:queue-updated`.
- Atenção de tipos: no Express 5, `req.params.entryId` é tipado `string | string[] | undefined`, não `string` puro. Como `chamarEspecifico(doctorId, entryId: string)` (Task 2) exige `string` estrito e o `tsconfig.json` tem `strict: true`, a rota `call/:entryId` precisa converter explicitamente com `String(req.params.entryId)` — não relaxe a assinatura de `chamarEspecifico`, que já está correta e testada.
- Atenção de isolamento entre testes: todos os `it()` deste arquivo reaproveitam o mesmo `doctorId` (e portanto a mesma fila em memória) criado no `beforeAll`. O teste "lista a fila do medico logado" precisa drenar (`call-next`) o paciente que ele mesmo encaminhou, senão ele sobra na fila e quebra a ordem FIFO esperada pelo teste seguinte ("call-next remove o primeiro da fila").

- [ ] **Step 1: Escrever os testes que vão falhar**

Criar `server/src/__tests__/doctorQueueEndpoints.test.ts`:

```ts
import request from "supertest";
import { startServer } from "../index";

describe("/api/doctor-queue", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken: string;
  let medicoToken: string;
  let doctorId: number;

  beforeAll(async () => {
    ctx = await startServer(false, ":memory:");
    const adminLogin = await request(ctx.app)
      .post("/api/login")
      .send({ username: "admin", password: "admin" });
    adminToken = adminLogin.body.token;

    const doctor = await request(ctx.app)
      .post("/api/doctors")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Dr. Fila Endpoints",
        specialization: "Clinica",
        prefix: "DFE",
        room: "Sala 9",
        username: "dr_fila_endpoints",
        password: "senha",
      });
    doctorId = doctor.body.id;

    const medicoLogin = await request(ctx.app)
      .post("/api/login")
      .send({ username: "dr_fila_endpoints", password: "senha" });
    medicoToken = medicoLogin.body.token;
  });

  afterAll(async () => {
    clearInterval(ctx.recoveryInterval);
    await ctx.db.close();
  });

  const encaminhar = async (patientName: string) => {
    const created = await request(ctx.app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "outros" });
    const ws = await ctx.db.get("SELECT id FROM workstations WHERE code = 'G01'");
    await ctx.db.run(
      "UPDATE tickets SET status = 'in_attendance', workstation_id = ?, called_at = CURRENT_TIMESTAMP, started_at = CURRENT_TIMESTAMP WHERE id = ?",
      [ws.id, created.body.id],
    );
    return request(ctx.app)
      .post(`/api/tickets/${created.body.id}/forward-to-doctor`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctor_id: doctorId, patient_name: patientName });
  };

  it("GET /api/doctor-queue/mine exige role medico", async () => {
    const res = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/doctor-queue/mine lista a fila do medico logado", async () => {
    await encaminhar("Paciente Mine");

    const res = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoToken}`);

    expect(res.status).toBe(200);
    expect(res.body.some((e: any) => e.patientName === "Paciente Mine")).toBe(true);

    // Drena a fila pra não contaminar os testes seguintes (mesmo doctorId em todo o describe)
    await request(ctx.app)
      .post("/api/doctor-queue/call-next")
      .set("Authorization", `Bearer ${medicoToken}`);
  });

  it("POST call-next remove o primeiro da fila e retorna 404 quando vazia", async () => {
    await encaminhar("Paciente CallNext");

    const chamado = await request(ctx.app)
      .post("/api/doctor-queue/call-next")
      .set("Authorization", `Bearer ${medicoToken}`);
    expect(chamado.status).toBe(200);
    expect(chamado.body.patientName).toBe("Paciente CallNext");

    const filaVazia = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoToken}`);
    expect(filaVazia.body.find((e: any) => e.patientName === "Paciente CallNext")).toBeUndefined();
  });

  it("POST call/:entryId chama um item especifico fora de ordem", async () => {
    await encaminhar("Primeiro da Fila");
    await encaminhar("Segundo da Fila");

    const filaAntes = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoToken}`);
    const segundo = filaAntes.body.find((e: any) => e.patientName === "Segundo da Fila");

    const chamado = await request(ctx.app)
      .post(`/api/doctor-queue/call/${segundo.id}`)
      .set("Authorization", `Bearer ${medicoToken}`);

    expect(chamado.status).toBe(200);
    expect(chamado.body.patientName).toBe("Segundo da Fila");

    const filaDepois = await request(ctx.app)
      .get("/api/doctor-queue/mine")
      .set("Authorization", `Bearer ${medicoToken}`);
    expect(filaDepois.body.map((e: any) => e.patientName)).toContain("Primeiro da Fila");
    expect(filaDepois.body.map((e: any) => e.patientName)).not.toContain("Segundo da Fila");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd server && npx jest src/__tests__/doctorQueueEndpoints.test.ts`
Expected: FAIL — as três rotas ainda não existem (404).

- [ ] **Step 3: Importar as funções restantes do módulo**

Em `server/src/index.ts`, trocar a linha de import adicionada na Task 10:

```ts
import { adicionar as adicionarNaFilaDoMedico } from "./doctorCallQueue";
```

por:

```ts
import {
  adicionar as adicionarNaFilaDoMedico,
  listar as listarFilaDoMedico,
  chamarProximo as chamarProximoNaFilaDoMedico,
  chamarEspecifico as chamarEspecificoNaFilaDoMedico,
} from "./doctorCallQueue";
```

- [ ] **Step 4: Importar `requireMedico` e `AuthRequest`**

Em `server/src/index.ts`, localizar a linha de import existente:

```ts
import {
  generateToken,
  verifyToken,
  requireAdmin,
  AuthRequest,
} from "./middleware/auth";
```

e trocar por:

```ts
import {
  generateToken,
  verifyToken,
  requireAdmin,
  requireMedico,
  AuthRequest,
} from "./middleware/auth";
```

- [ ] **Step 5: Adicionar as três rotas**

Em `server/src/index.ts`, imediatamente depois do fechamento da rota `forward-to-doctor` (adicionada na Task 10), adicionar:

```ts

  // Doctor Queue (fila do medico, em memoria)
  app.get(
    "/api/doctor-queue/mine",
    verifyToken,
    requireMedico,
    async (req: AuthRequest, res) => {
      const entries = listarFilaDoMedico(req.user!.doctor_id!);
      res.json(entries);
    },
  );

  app.post(
    "/api/doctor-queue/call-next",
    verifyToken,
    requireMedico,
    async (req: AuthRequest, res) => {
      const doctorId = req.user!.doctor_id!;
      const entry = chamarProximoNaFilaDoMedico(doctorId);
      if (!entry) {
        return res.status(404).json({ message: "Fila vazia." });
      }
      const doctor = await db.get("SELECT name, room FROM doctors WHERE id = ?", [doctorId]);
      broadcast("doctor:calling", {
        ticketNumber: entry.ticketNumber,
        patientName: entry.patientName,
        doctorName: doctor?.name ?? "",
        room: doctor?.room ?? "",
      });
      broadcast("doctor:queue-updated", { doctor_id: doctorId });
      res.json(entry);
    },
  );

  app.post(
    "/api/doctor-queue/call/:entryId",
    verifyToken,
    requireMedico,
    async (req: AuthRequest, res) => {
      const doctorId = req.user!.doctor_id!;
      const entryId = String(req.params.entryId);
      const entry = chamarEspecificoNaFilaDoMedico(doctorId, entryId);
      if (!entry) {
        return res.status(404).json({ message: "Paciente não encontrado na fila." });
      }
      const doctor = await db.get("SELECT name, room FROM doctors WHERE id = ?", [doctorId]);
      broadcast("doctor:calling", {
        ticketNumber: entry.ticketNumber,
        patientName: entry.patientName,
        doctorName: doctor?.name ?? "",
        room: doctor?.room ?? "",
      });
      broadcast("doctor:queue-updated", { doctor_id: doctorId });
      res.json(entry);
    },
  );
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd server && npx jest src/__tests__/doctorQueueEndpoints.test.ts`
Expected: PASS — 4 testes passando.

- [ ] **Step 7: Reexecutar a suíte inteira (a Task 10 tinha uma falha esperada que agora deve sumir)**

Run: `cd server && npx jest`
Expected: PASS em todos os arquivos de teste, incluindo `forwardToDoctor.test.ts` (teste de idempotência completo).

- [ ] **Step 8: Commit**

```bash
git add server/src/index.ts server/src/__tests__/doctorQueueEndpoints.test.ts
git commit -m "feat: endpoints da fila do medico (mine, call-next, call especifico)"
```

---

### Task 12: Tipos TypeScript do cliente

**Files:**
- Modify: `client/src/types.ts` (completo)

**Interfaces:**
- Produces: `User.role` aceita `"medico"`; `User.doctor_id?: number | null`.
- Produces: `Doctor.room?: string | null`; `Doctor.medico_username?: string | null`.
- Produces: `interface DoctorQueueEntry { id: string; ticketId: number; ticketNumber: string; patientName: string; forwardedAt: string }`.
- Produces: `interface DoctorCallingPayload { ticketNumber: string; patientName: string; doctorName: string; room: string }`.

Esta task não tem teste automatizado — é só extensão de tipos (TypeScript falha em build se algo usar incorretamente, o que é verificado na Task 18 quando `TVPanel.tsx` é compilado).

- [ ] **Step 1: Substituir o arquivo inteiro**

Substituir todo o conteúdo de `client/src/types.ts` por:

```ts
export interface User {
  id: number;
  username: string;
  role: "admin" | "attendant" | "cirurgia" | "medico";
  active?: boolean;
  doctor_id?: number | null;
}

export interface Workstation {
  id: number;
  code: string;
  name: string;
  current_user_id?: number | null;
  is_active?: boolean;
}

export interface Doctor {
  id: number;
  name: string;
  specialization: string;
  prefix?: string | null;
  room?: string | null;
  medico_username?: string | null;
}

export interface Ticket {
  id: number;
  number: string;
  status: "waiting" | "calling" | "in_attendance" | "finished" | "missed";
  type: "consulta" | "outros";
  subtype?: string | null;
  queue_sector: "recepcao" | "cirurgia";
  doctor_id: number;
  workstation_id?: number;
  created_at: string;
  called_at?: string;
  started_at?: string;
  finished_at?: string;
  requeued_at?: string;
  requeue_count?: number;
  call_type?: "FIFO" | "RANDOM";
  is_specific_call?: boolean;
  doctor_name?: string;
  workstation_name?: string;
  workstation_code?: string;
  printError?: string;
}

export interface QueueStat {
  doctor_id: number | null;
  doctor_name: string;
  count: number;
  oldest_created_at: string | null;
}

export interface DoctorQueueEntry {
  id: string;
  ticketId: number;
  ticketNumber: string;
  patientName: string;
  forwardedAt: string;
}

export interface DoctorCallingPayload {
  ticketNumber: string;
  patientName: string;
  doctorName: string;
  room: string;
}
```

- [ ] **Step 2: Confirmar que o client ainda compila**

Run: `cd client && npx tsc -b --noEmit`
Expected: **um erro**, não "sem erros" — `TS2322` em `client/src/components/UsersManager.tsx:109`: `Type '"admin" | "attendant" | "cirurgia" | "medico"' is not assignable to type '"admin" | "attendant" | "cirurgia"'`. Ampliar `User.role` globalmente quebra esse componente, que tem seu próprio literal de tipo mais restrito para `formData.role`. Corrigir antes de seguir — ver Step 3.

- [ ] **Step 3: Corrigir `UsersManager.tsx`**

Em `client/src/components/UsersManager.tsx`, trocar (dentro de `openModal`):

```tsx
        username: user.username,
        password: "",
        role: user.role,
        active: user.active !== undefined ? user.active : true,
```

por:

```tsx
        username: user.username,
        password: "",
        // GET /api/users nunca retorna role 'medico' (Task 8) — contas de médico
        // são geridas só pela tela de Médicos.
        role: user.role as "admin" | "attendant" | "cirurgia",
        active: user.active !== undefined ? user.active : true,
```

- [ ] **Step 4: Confirmar que compila limpo agora**

Run: `cd client && npx tsc -b --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add client/src/types.ts client/src/components/UsersManager.tsx
git commit -m "feat: tipos para medico, doctor_id, room e fila do medico"
```

---

### Task 13: Vitest configurado + fila de exibição da TV (lógica pura)

**Files:**
- Modify: `client/vite.config.ts`
- Modify: `client/package.json` (script `test`)
- Create: `client/src/utils/callDisplayQueue.ts`
- Test: `client/src/utils/callDisplayQueue.test.ts`

**Interfaces:**
- Produces: `class CallDisplayQueue<T>` com `constructor(options: { minDisplayMs: number; onShow: (item: T) => void; setTimer?; clearTimer? })` e métodos `push(item: T): void` e `destroy(): void` — `destroy()` cancela o timer pendente e esvazia a fila; a Task 18 precisa chamá-lo no cleanup do `useEffect` do `TVPanel`, senão um timer pendente pode disparar `onShow` (chamando `setState`) depois do componente desmontado.
- Consumes: nada (classe pura, sem React, sem socket) — será conectada à UI na Task 18.

- [ ] **Step 1: Escrever os testes que vão falhar**

Criar `client/src/utils/callDisplayQueue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CallDisplayQueue } from "./callDisplayQueue";

describe("CallDisplayQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra o primeiro item imediatamente", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith("C001");
  });

  it("enfileira chamadas que chegam antes do tempo minimo passar", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    queue.push("C002");
    queue.push("C003");

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith("C001");
  });

  it("mostra o proximo da fila só depois do tempo minimo", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    queue.push("C002");

    vi.advanceTimersByTime(4999);
    expect(onShow).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(onShow).toHaveBeenCalledTimes(2);
    expect(onShow).toHaveBeenLastCalledWith("C002");
  });

  it("respeita a ordem de chegada (FIFO) entre tres chamadas em rajada", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    queue.push("C002");
    queue.push("C003");

    vi.advanceTimersByTime(5000);
    expect(onShow).toHaveBeenLastCalledWith("C002");

    vi.advanceTimersByTime(5000);
    expect(onShow).toHaveBeenLastCalledWith("C003");
  });

  it("nao agenda novo timer quando a fila esvazia", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    vi.advanceTimersByTime(5000);
    expect(onShow).toHaveBeenCalledTimes(1);

    queue.push("C002");
    expect(onShow).toHaveBeenCalledTimes(2);
  });

  it("destroy cancela o timer pendente e impede novas exibições agendadas", () => {
    const onShow = vi.fn();
    const queue = new CallDisplayQueue<string>({ minDisplayMs: 5000, onShow });

    queue.push("C001");
    queue.push("C002");

    queue.destroy();
    vi.advanceTimersByTime(10000);

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith("C001");
  });
});

describe("CallDisplayQueue sem mock de timer (reproduz checagem de receiver do navegador)", () => {
  it("nao lanca 'Illegal invocation' usando setTimeout/clearTimeout globais reais", () => {
    // No navegador, setTimeout/clearTimeout são métodos de Window e lançam
    // TypeError se invocados com `this` diferente de window — isso não
    // reproduz em Node (onde são funções soltas), então simulamos a checagem
    // de receiver aqui pra pegar essa regressão sem precisar de jsdom/browser.
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;

    function strictSetTimeout(this: unknown, cb: () => void, ms: number) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return realSetTimeout(cb, ms);
    }
    function strictClearTimeout(this: unknown, handle: ReturnType<typeof setTimeout>) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return realClearTimeout(handle);
    }

    globalThis.setTimeout = strictSetTimeout as typeof setTimeout;
    globalThis.clearTimeout = strictClearTimeout as typeof clearTimeout;

    try {
      const onShow = vi.fn();
      const queue = new CallDisplayQueue<string>({ minDisplayMs: 10, onShow });

      expect(() => queue.push("C001")).not.toThrow();
      expect(() => queue.destroy()).not.toThrow();
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }
  });
});
```

**Por que este teste existe:** descoberto em teste manual no navegador real (Task de verificação pós-implementação) — `npx vitest run` com `testEnvironment: 'node'` nunca detectou isso, porque em Node `setTimeout`/`clearTimeout` são funções soltas sem checagem de receiver. No navegador, `this.setTimer(...)` (armazenando `setTimeout` direto e invocando como método) lança `TypeError: Illegal invocation` **depois** de `onShow` já ter disparado — ou seja, a chamada aparece na tela, mas o timer de avanço nunca é agendado e a fila trava para sempre a partir da primeira chamada. Sem o teste acima (que simula a checagem estrita de `this` que o navegador faz), essa regressão passaria silenciosamente por toda a suíte.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd client && npx vitest run src/utils/callDisplayQueue.test.ts`
Expected: FAIL — `Cannot find module './callDisplayQueue'` (o comando também vai falhar antes disso se o `test` runner do vitest não estiver habilitado no `vite.config.ts`; resolva isso no Step 3 também).

- [ ] **Step 3: Habilitar o vitest no `vite.config.ts`**

Substituir todo o conteúdo de `client/vite.config.ts` por:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 4: Adicionar o script de teste**

Em `client/package.json`, na seção `scripts`, adicionar depois de `"lint": "eslint ."`:

```json
    "test": "vitest run",
```

- [ ] **Step 5: Implementar `CallDisplayQueue`**

Criar `client/src/utils/callDisplayQueue.ts`:

```ts
type TimerHandle = ReturnType<typeof setTimeout>;

interface CallDisplayQueueOptions<T> {
  minDisplayMs: number;
  onShow: (item: T) => void;
  setTimer?: (cb: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

export class CallDisplayQueue<T> {
  private queue: T[] = [];
  private showing = false;
  private timer: TimerHandle | null = null;
  private readonly minDisplayMs: number;
  private readonly onShow: (item: T) => void;
  private readonly setTimer: (cb: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;

  constructor(options: CallDisplayQueueOptions<T>) {
    this.minDisplayMs = options.minDisplayMs;
    this.onShow = options.onShow;
    // setTimeout/clearTimeout são métodos de Window e exigem `this === window`
    // quando chamados nativamente. Armazená-los direto em this.setTimer e
    // invocá-los como this.setTimer(...) muda o receiver e lança
    // "TypeError: Illegal invocation" no navegador (não reproduz em Node).
    // O wrapper em arrow function invoca como chamada solta, sem esse problema.
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  push(item: T): void {
    if (!this.showing) {
      this.showNext(item);
      return;
    }
    this.queue.push(item);
  }

  destroy(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    this.queue = [];
    this.showing = false;
  }

  private showNext(item: T): void {
    this.showing = true;
    this.onShow(item);
    this.timer = this.setTimer(() => {
      this.timer = null;
      const next = this.queue.shift();
      if (next !== undefined) {
        this.showNext(next);
      } else {
        this.showing = false;
      }
    }, this.minDisplayMs);
  }
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd client && npx vitest run src/utils/callDisplayQueue.test.ts`
Expected: PASS — 7 testes passando.

- [ ] **Step 7: Confirmar que o client compila limpo**

Run: `cd client && npx tsc -b --noEmit`
Expected: sem erros. `client/tsconfig.app.json` tem `noUnusedLocals`/`noUnusedParameters` estritos — sem o método `destroy()` do Step 5, os campos `timer`/`clearTimer` ficariam escritos mas nunca lidos/chamados, e o build falharia com TS6133.

- [ ] **Step 8: Commit**

```bash
git add client/vite.config.ts client/package.json client/src/utils/callDisplayQueue.ts client/src/utils/callDisplayQueue.test.ts
git commit -m "test: configura vitest e implementa fila de exibicao com tempo minimo"
```

---

### Task 14: `DoctorsManager.tsx` — sala + login opcional

**Files:**
- Modify: `client/src/components/DoctorsManager.tsx` (completo)

**Interfaces:**
- Consumes: `GET/POST/PUT /api/doctors` de Task 7 (já retornam/aceitam `room`, `username`, `password`, `medico_username`).
- Produces: nenhuma interface nova para outras tasks consumirem — é uma folha da árvore de dependências.

Esta task é client-only e não tem suíte automatizada (o projeto não tem testes de componente React configurados — ver Global Constraints). A verificação é manual, com o servidor e o cliente de dev rodando.

- [ ] **Step 1: Substituir o arquivo inteiro**

Substituir todo o conteúdo de `client/src/components/DoctorsManager.tsx` por:

```tsx
import React, { useState, useEffect } from "react";
import type { Doctor } from "../types";
import { BaseModal } from "./BaseModal";
import { Edit, Trash, Plus, KeyRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import { apiFetch } from "../utils/api";

export const DoctorsManager: React.FC = () => {
  const { token, logout } = useAuth();
  const socketContext = useSocket();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    specialization: "",
    prefix: "",
    room: "",
    username: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) fetchDoctors();
  }, [token]);

  useEffect(() => {
    if (!socketContext || !socketContext.socket) return;

    const handleCreated = (doctor: Doctor) => {
      setDoctors((prev) =>
        prev.some((d) => d.id === doctor.id) ? prev : [...prev, doctor],
      );
    };
    const handleUpdated = (doctor: Doctor) => {
      setDoctors((prev) =>
        prev.map((d) => (d.id === doctor.id ? doctor : d)),
      );
    };
    const handleDeleted = (payload: { id: number }) => {
      setDoctors((prev) => prev.filter((d) => d.id !== payload.id));
    };
    const handleReconnected = () => fetchDoctors();

    socketContext.on("doctor:created", handleCreated);
    socketContext.on("doctor:updated", handleUpdated);
    socketContext.on("doctor:deleted", handleDeleted);
    socketContext.on("ws:reconnected", handleReconnected);
    return () => {
      socketContext.off("doctor:created", handleCreated);
      socketContext.off("doctor:updated", handleUpdated);
      socketContext.off("doctor:deleted", handleDeleted);
      socketContext.off("ws:reconnected", handleReconnected);
    };
  }, [socketContext]);

  const fetchDoctors = async () => {
    try {
      const res = await apiFetch(`/api/doctors`, {
        token,
        onUnauthorized: logout,
      });
      if (!res.ok) {
        throw new Error("Falha ao carregar médicos");
      }
      const data = await res.json();
      setDoctors(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        specialization: formData.specialization,
        prefix: formData.prefix,
        room: formData.room,
        username: formData.username,
        password: formData.password,
      };

      if (editingDoctor) {
        const res = await apiFetch(`/api/doctors/${editingDoctor.id}`, {
          token,
          onUnauthorized: logout,
          method: "PUT",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const message =
            data?.error || data?.message || "Erro ao salvar médico";
          alert(message);
          return;
        }
      } else {
        const res = await apiFetch(`/api/doctors`, {
          token,
          onUnauthorized: logout,
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const message =
            data?.error || data?.message || "Erro ao salvar médico";
          alert(message);
          return;
        }
      }
      await fetchDoctors();
      closeModal();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar médico");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este médico?")) return;
    try {
      const res = await apiFetch(`/api/doctors/${id}`, {
        token,
        onUnauthorized: logout,
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error || data?.message || "Erro ao excluir médico";
        alert(message);
        return;
      }
      await fetchDoctors();
    } catch (error) {
      console.error(error);
      alert("Erro ao excluir médico");
    }
  };

  const openModal = (doctor?: Doctor) => {
    if (doctor) {
      setEditingDoctor(doctor);
      setFormData({
        name: doctor.name,
        specialization: doctor.specialization,
        prefix: doctor.prefix || "",
        room: doctor.room || "",
        username: doctor.medico_username || "",
        password: "",
      });
    } else {
      setEditingDoctor(null);
      setFormData({
        name: "",
        specialization: "",
        prefix: "",
        room: "",
        username: "",
        password: "",
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDoctor(null);
    setFormData({
      name: "",
      specialization: "",
      prefix: "",
      room: "",
      username: "",
      password: "",
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Gerenciar Médicos</h2>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={20} /> Novo Médico
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="p-4 text-sm font-semibold text-gray-600">Nome</th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Prefixo
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Especialidade
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Sala
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Login
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600 text-right">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((doctor) => (
              <tr
                key={doctor.id}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td className="p-4 font-medium text-gray-800">{doctor.name}</td>
                <td className="p-4 font-mono text-gray-800">
                  {(doctor.prefix || "").toUpperCase()}
                </td>
                <td className="p-4 text-gray-600">{doctor.specialization}</td>
                <td className="p-4 text-gray-600">{doctor.room || "—"}</td>
                <td className="p-4">
                  {doctor.medico_username ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700">
                      <KeyRound size={12} /> {doctor.medico_username}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-500">
                      Sem login
                    </span>
                  )}
                </td>
                <td className="p-4 flex justify-end gap-2">
                  <button
                    onClick={() => openModal(doctor)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(doctor.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {doctors.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400">
                  Nenhum médico cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BaseModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingDoctor ? "Editar Médico" : "Novo Médico"}
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prefixo (2–4 caracteres)
            </label>
            <input
              type="text"
              required
              value={formData.prefix}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                })
              }
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Especialidade
            </label>
            <input
              type="text"
              required
              value={formData.specialization}
              onChange={(e) =>
                setFormData({ ...formData, specialization: e.target.value })
              }
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sala / Consultório
            </label>
            <input
              type="text"
              value={formData.room}
              onChange={(e) =>
                setFormData({ ...formData, room: e.target.value })
              }
              placeholder="Ex.: Sala 3"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 mb-3">
              Login para chamar pacientes pelo terminal (opcional). Deixe em
              branco se este médico não vai usar a fila.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome de usuário
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha{" "}
                  {editingDoctor?.medico_username && (
                    <span className="text-gray-400 font-normal">
                      (deixe em branco para manter a atual)
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </BaseModal>
    </div>
  );
};
```

- [ ] **Step 2: Verificar manualmente**

Run: `cd server && npm run dev` (porta 3000) e, em outro terminal, `cd client && npm run dev` (porta 5173).

1. Logar como `admin`/`admin`, ir em Admin → Médicos.
2. Criar um médico novo sem usuário/senha → confirmar que a coluna "Login" mostra "Sem login".
3. Editar esse mesmo médico e preencher usuário/senha → salvar → confirmar que a coluna "Login" passa a mostrar o usuário com o ícone de chave.
4. Editar de novo, trocar só o nome, deixar senha em branco → salvar → confirmar que não dá erro e o login antigo continua exibido.
5. Criar um segundo médico já com usuário/senha preenchidos na criação → confirmar que aparece com login imediatamente.

Expected: os 5 passos funcionam sem erro de console e sem precisar de F5 entre as ações (eventos de socket já cobrem isso).

- [ ] **Step 3: Confirmar que o client compila**

Run: `cd client && npx tsc -b --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/DoctorsManager.tsx
git commit -m "feat: formulario de medicos ganha sala e login opcional"
```

---

### Task 15: `Login.tsx` redireciona médico para `/medico`

**Files:**
- Modify: `client/src/pages/Login.tsx:85-91`

**Interfaces:**
- Consumes: `data.user.role === 'medico'` (já retornado por `/api/login`, Task 9). A rota `/medico` em si é criada na Task 17 — até lá, o redirecionamento aponta para uma rota que ainda não existe (ver Step 3).

- [ ] **Step 1: Editar o redirecionamento**

Em `client/src/pages/Login.tsx`, trocar (linhas 85–91):

```tsx
        if (selectedWs?.code === 'RET01' || selectedWs?.name?.toLowerCase().includes('retirada')) {
            navigate('/recepcao/consultas');
        } else if (data.user.role === 'admin') {
            navigate('/admin');
        } else {
            navigate('/atendente');
        }
```

por:

```tsx
        if (selectedWs?.code === 'RET01' || selectedWs?.name?.toLowerCase().includes('retirada')) {
            navigate('/recepcao/consultas');
        } else if (data.user.role === 'admin') {
            navigate('/admin');
        } else if (data.user.role === 'medico') {
            navigate('/medico');
        } else {
            navigate('/atendente');
        }
```

- [ ] **Step 2: Verificar manualmente (parcial — a rota só existe na Task 17)**

Run: `cd client && npx tsc -b --noEmit`
Expected: sem erros de tipo (a string `'/medico'` é só um literal de rota, não depende da rota existir para compilar).

Não teste o login de médico de ponta a ponta ainda — `/medico` devolve a tela de fallback do React Router até a Task 17 existir. A verificação completa deste fluxo acontece no Step 2 da Task 17.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Login.tsx
git commit -m "feat: login redireciona medico para /medico"
```

---

### Task 16: Modal "Encaminhar para médico" + wiring no `Attendant.tsx`

**Files:**
- Create: `client/src/components/ForwardToDoctorModal.tsx`
- Modify: `client/src/pages/Attendant.tsx`

**Interfaces:**
- Consumes: `POST /api/tickets/:id/forward-to-doctor` (Task 10); `GET /api/doctors?has_login=true` (Task 7); eventos `doctor:created`/`doctor:updated`/`doctor:deleted` (já emitidos desde antes desta spec).
- Produces: nenhuma interface nova para outras tasks — folha da árvore.

Esta task é client-only, verificação manual (mesmo motivo da Task 14).

- [ ] **Step 1: Criar o modal**

Criar `client/src/components/ForwardToDoctorModal.tsx`:

```tsx
import React, { useState, useEffect } from "react";
import { BaseModal } from "./BaseModal";
import type { Doctor } from "../types";
import { Send } from "lucide-react";

interface ForwardToDoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctors: Doctor[];
  onConfirm: (doctorId: number, patientName: string) => Promise<boolean>;
}

export const ForwardToDoctorModal: React.FC<ForwardToDoctorModalProps> = ({
  isOpen,
  onClose,
  doctors,
  onConfirm,
}) => {
  const [doctorId, setDoctorId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDoctorId(doctors[0] ? String(doctors[0].id) : "");
      setPatientName("");
    }
  }, [isOpen, doctors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorId || !patientName.trim()) return;

    setSubmitting(true);
    try {
      const success = await onConfirm(Number(doctorId), patientName.trim());
      if (success) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Encaminhar para médico">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Médico
          </label>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            required
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
          >
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome do paciente
          </label>
          <input
            type="text"
            required
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            placeholder="Nome completo"
          />
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !doctorId || !patientName.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Send size={16} />
            {submitting ? "Enviando..." : "Encaminhar"}
          </button>
        </div>
      </form>
    </BaseModal>
  );
};
```

- [ ] **Step 2: Importar dependências novas em `Attendant.tsx`**

Em `client/src/pages/Attendant.tsx`, trocar a linha 1:

```tsx
import React, { useState, useEffect } from "react";
```

por:

```tsx
import React, { useState, useEffect, useCallback } from "react";
```

e trocar (linhas 4–25, lista de imports):

```tsx
import type { Ticket } from "../types";
import {
  Monitor,
  User,
  Clock,
  Bell,
  CheckCircle,
  Play,
  LogOut,
  UserX,
  Activity,
  History,
  ClipboardList,
  RotateCcw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import Logo from "../components/Logo";
import DoctorQueueGrid from "../components/DoctorQueueGrid";
import { HistoryModal } from "../components/HistoryModal";
import { AttendanceModal } from "../components/AttendanceModal";
import { RequeueModal } from "../components/RequeueModal";
```

por:

```tsx
import type { Ticket, Doctor } from "../types";
import {
  Monitor,
  User,
  Clock,
  Bell,
  CheckCircle,
  Play,
  LogOut,
  UserX,
  Activity,
  History,
  ClipboardList,
  RotateCcw,
  Stethoscope,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import Logo from "../components/Logo";
import DoctorQueueGrid from "../components/DoctorQueueGrid";
import { HistoryModal } from "../components/HistoryModal";
import { AttendanceModal } from "../components/AttendanceModal";
import { RequeueModal } from "../components/RequeueModal";
import { ForwardToDoctorModal } from "../components/ForwardToDoctorModal";
```

- [ ] **Step 3: Adicionar estado e o fetch de médicos com login**

Em `client/src/pages/Attendant.tsx`, trocar (linhas 75–78):

```tsx
  // Modals
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isRequeueOpen, setIsRequeueOpen] = useState(false);
```

por:

```tsx
  // Modals
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isRequeueOpen, setIsRequeueOpen] = useState(false);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [doctorsWithLogin, setDoctorsWithLogin] = useState<Doctor[]>([]);

  const fetchDoctorsWithLogin = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/doctors?has_login=true`, {
        token,
        onUnauthorized: logout,
      });
      const data = await res.json();
      setDoctorsWithLogin(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }, [token, logout]);

  useEffect(() => {
    fetchDoctorsWithLogin();
  }, [fetchDoctorsWithLogin]);

  useEffect(() => {
    if (!socketContext || !socketContext.socket) return;
    const handler = () => fetchDoctorsWithLogin();
    socketContext.on("doctor:created", handler);
    socketContext.on("doctor:updated", handler);
    socketContext.on("doctor:deleted", handler);
    return () => {
      socketContext.off("doctor:created", handler);
      socketContext.off("doctor:updated", handler);
      socketContext.off("doctor:deleted", handler);
    };
  }, [socketContext, fetchDoctorsWithLogin]);
```

- [ ] **Step 4: Adicionar o handler de encaminhamento**

Em `client/src/pages/Attendant.tsx`, imediatamente depois do fechamento da função `updateStatus` (depois de `};` na linha 340), adicionar:

```tsx

  const handleForwardToDoctor = async (
    doctorId: number,
    patientName: string,
  ): Promise<boolean> => {
    if (!currentTicket) return false;
    try {
      const res = await apiFetch(
        `/api/tickets/${currentTicket.id}/forward-to-doctor`,
        {
          method: "POST",
          token,
          onUnauthorized: logout,
          body: JSON.stringify({ doctor_id: doctorId, patient_name: patientName }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.message || "Erro ao encaminhar paciente");
        return false;
      }
      setCurrentTicket(null);
      return true;
    } catch (err) {
      console.error(err);
      alert("Erro ao encaminhar paciente");
      return false;
    }
  };
```

- [ ] **Step 5: Adicionar o botão ao lado de "FINALIZAR ATENDIMENTO"**

Em `client/src/pages/Attendant.tsx`, trocar (linhas 456–465):

```tsx
            {currentTicket.status === "in_attendance" && (
              <button
                onClick={() => updateStatus("finished")}
                disabled={loading}
                className="bg-white text-gray-900 hover:bg-gray-100 px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg"
              >
                <CheckCircle className="w-5 h-5 text-green-600" /> FINALIZAR
                ATENDIMENTO
              </button>
            )}
```

por:

```tsx
            {currentTicket.status === "in_attendance" && (
              <>
                <button
                  onClick={() => updateStatus("finished")}
                  disabled={loading}
                  className="bg-white text-gray-900 hover:bg-gray-100 px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg"
                >
                  <CheckCircle className="w-5 h-5 text-green-600" /> FINALIZAR
                  ATENDIMENTO
                </button>
                {doctorsWithLogin.length > 0 && (
                  <button
                    onClick={() => setIsForwardOpen(true)}
                    disabled={loading}
                    className="bg-blue-500/20 hover:bg-blue-500/40 text-blue-100 border border-blue-400/50 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                  >
                    <Stethoscope className="w-4 h-4" /> ENCAMINHAR PARA MÉDICO
                  </button>
                )}
              </>
            )}
```

- [ ] **Step 6: Renderizar o modal**

Em `client/src/pages/Attendant.tsx`, localizar onde `<RequeueModal` é renderizado (próximo ao final do JSX, junto aos outros modais) e adicionar imediatamente depois do seu fechamento (`/>`):

```tsx
      <ForwardToDoctorModal
        isOpen={isForwardOpen}
        onClose={() => setIsForwardOpen(false)}
        doctors={doctorsWithLogin}
        onConfirm={handleForwardToDoctor}
      />
```

- [ ] **Step 7: Verificar manualmente**

Run: `cd server && npm run dev` e `cd client && npm run dev` (se ainda não estiverem rodando).

1. Sem nenhum médico com login cadastrado: logar como atendente, chamar uma senha, iniciar atendimento → confirmar que o botão "ENCAMINHAR PARA MÉDICO" **não aparece**.
2. Cadastrar um médico com login (Admin → Médicos, Task 14) → voltar para a tela do atendente sem F5 → confirmar que o botão passa a aparecer (reage ao evento `doctor:created`).
3. Clicar em "ENCAMINHAR PARA MÉDICO", escolher o médico, digitar um nome de paciente, confirmar → confirmar que o atendimento desaparece da barra (igual a "Finalizar") e nenhum erro aparece no console.
4. Tentar clicar duas vezes rápido no botão "Encaminhar" dentro do modal → confirmar que o botão fica desabilitado durante o envio (não duplica).

Expected: os 4 passos funcionam como descrito.

- [ ] **Step 8: Confirmar que o client compila**

Run: `cd client && npx tsc -b --noEmit`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/ForwardToDoctorModal.tsx client/src/pages/Attendant.tsx
git commit -m "feat: botao e modal de encaminhar paciente para medico no Attendant"
```

---

### Task 17: Terminal do médico (`/medico`) + aviso de reinício do servidor

**Files:**
- Create: `client/src/pages/DoctorTerminal.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/doctor-queue/mine`, `POST /api/doctor-queue/call-next`, `POST /api/doctor-queue/call/:entryId` (Task 11); evento `doctor:queue-updated` (Task 11); evento `server:boot` (Task 6); `User.doctor_id` (Task 12).
- Produces: rota `/medico` funcionando — fecha o redirecionamento deixado pendente na Task 15.

Esta task é client-only, verificação manual.

- [ ] **Step 1: Criar a página**

Criar `client/src/pages/DoctorTerminal.tsx`:

```tsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import { apiFetch } from "../utils/api";
import Logo from "../components/Logo";
import type { DoctorQueueEntry } from "../types";
import { LogOut, Bell, AlertTriangle, Users } from "lucide-react";

const BOOT_ID_STORAGE_KEY = "medico_last_boot_id";

const DoctorTerminal: React.FC = () => {
  const { user, token, logout } = useAuth();
  const socketContext = useSocket();
  const navigate = useNavigate();

  const [queue, setQueue] = useState<DoctorQueueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [restartWarning, setRestartWarning] = useState(false);

  const fetchQueue = useCallback(async () => {
    const res = await apiFetch("/api/doctor-queue/mine", {
      token,
      onUnauthorized: logout,
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) setQueue(data);
  }, [token, logout]);

  useEffect(() => {
    if (!user || !token) {
      navigate("/login");
      return;
    }
    fetchQueue();
  }, [user, token, navigate, fetchQueue]);

  useEffect(() => {
    if (!socketContext || !socketContext.socket) return;

    const handleQueueUpdated = (payload: { doctor_id: number }) => {
      if (payload.doctor_id !== user?.doctor_id) return;
      fetchQueue();
    };

    const handleServerBoot = (payload: { bootId: string }) => {
      const lastSeen = localStorage.getItem(BOOT_ID_STORAGE_KEY);
      if (lastSeen && lastSeen !== payload.bootId) {
        setRestartWarning(true);
        fetchQueue();
      }
      localStorage.setItem(BOOT_ID_STORAGE_KEY, payload.bootId);
    };

    socketContext.on("doctor:queue-updated", handleQueueUpdated);
    socketContext.on("server:boot", handleServerBoot);
    return () => {
      socketContext.off("doctor:queue-updated", handleQueueUpdated);
      socketContext.off("server:boot", handleServerBoot);
    };
  }, [socketContext, user, fetchQueue]);

  const callNext = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/doctor-queue/call-next", {
        method: "POST",
        token,
        onUnauthorized: logout,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.message || "Erro ao chamar paciente");
        return;
      }
      await fetchQueue();
    } finally {
      setLoading(false);
    }
  };

  const callSpecific = async (entryId: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/doctor-queue/call/${entryId}`, {
        method: "POST",
        token,
        onUnauthorized: logout,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.message || "Erro ao chamar paciente");
        return;
      }
      await fetchQueue();
    } finally {
      setLoading(false);
    }
  };

  const formatWaitTime = (forwardedAt: string) => {
    const start = new Date(
      forwardedAt.includes("Z") ? forwardedAt : forwardedAt + "Z",
    ).getTime();
    const diffMin = Math.max(0, Math.floor((Date.now() - start) / 60000));
    return `${diffMin} min`;
  };

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col">
      <header className="bg-white shadow-sm p-4 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center gap-4">
          <Logo theme="dark" />
          <div>
            <p className="text-sm font-bold text-gray-800">{user?.username}</p>
            <p className="text-xs text-gray-500 uppercase">Médico</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Sair"
        >
          <LogOut className="w-6 h-6" />
        </button>
      </header>

      {restartWarning && (
        <div className="bg-yellow-100 border-b border-yellow-300 text-yellow-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">
              O servidor foi reiniciado — a fila pode ter sido perdida. Confira
              com a recepção quem já foi encaminhado.
            </span>
          </div>
          <button
            onClick={() => setRestartWarning(false)}
            className="text-yellow-800 hover:text-yellow-900 font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      <main className="flex-1 p-6 max-w-3xl w-full mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="w-5 h-5" /> Minha fila ({queue.length})
          </h1>
          <button
            onClick={callNext}
            disabled={loading || queue.length === 0}
            className="bg-primary text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            <Bell className="w-5 h-5" /> CHAMAR PRÓXIMO
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {queue.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              Nenhum paciente encaminhado.
            </div>
          ) : (
            queue.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="font-black text-xl text-gray-800 w-20">
                    {entry.ticketNumber}
                  </span>
                  <div>
                    <div className="font-bold text-gray-800">
                      {entry.patientName}
                    </div>
                    <div className="text-xs text-gray-400">
                      Esperando há {formatWaitTime(entry.forwardedAt)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => callSpecific(entry.id)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-bold rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  CHAMAR
                </button>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default DoctorTerminal;
```

- [ ] **Step 2: Adicionar a rota**

Em `client/src/App.tsx`, trocar (linha 12):

```tsx
import Admin from "./pages/Admin";
```

por:

```tsx
import Admin from "./pages/Admin";
import DoctorTerminal from "./pages/DoctorTerminal";
```

e trocar (linha 75):

```tsx
                <Route path="/admin" element={<Admin />} />
```

por:

```tsx
                <Route path="/admin" element={<Admin />} />
                <Route path="/medico" element={<DoctorTerminal />} />
```

- [ ] **Step 3: Verificar manualmente o fluxo completo**

Com servidor e cliente de dev rodando:

1. Em Admin → Médicos, criar um médico com login (ex.: `dr_teste` / `senha123`), sala "Sala 7".
2. Deslogar e logar em `/login` com `dr_teste`/`senha123`, sem selecionar guichê → confirmar que cai direto em `/medico`.
3. Confirmar que a fila aparece vazia ("Nenhum paciente encaminhado").
4. Em outra aba, logar como atendente, chamar uma senha, iniciar atendimento, clicar "ENCAMINHAR PARA MÉDICO", escolher `dr_teste`, digitar um nome → confirmar.
5. Voltar para a aba do médico **sem recarregar** → confirmar que o paciente aparece na fila automaticamente (via `doctor:queue-updated`).
6. Clicar "CHAMAR PRÓXIMO" → confirmar que o paciente sai da lista.
7. Parar o servidor (`Ctrl+C` no terminal do `npm run dev` do server) e iniciar de novo → na aba do médico, sem recarregar a página, aguardar a reconexão automática do WebSocket (~3s) → confirmar que aparece o banner amarelo de "servidor foi reiniciado".

Expected: todos os 7 passos funcionam como descrito.

- [ ] **Step 4: Confirmar que o client compila**

Run: `cd client && npx tsc -b --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/DoctorTerminal.tsx client/src/App.tsx
git commit -m "feat: terminal do medico com aviso de reinicio do servidor"
```

---

### Task 18: `TVPanel.tsx` consome a fila de exibição e a chamada do médico

**Files:**
- Modify: `client/src/pages/TVPanel.tsx` (completo)

**Interfaces:**
- Consumes: `CallDisplayQueue` (Task 13); `DoctorCallingPayload` (Task 12); evento `doctor:calling` (Task 11).
- Produces: nenhuma interface nova para outras tasks — última task do plano.

Verificação manual (sem suíte de componente, ver Global Constraints). A lógica de timing já foi validada isoladamente na Task 13 — aqui só confirmamos a integração visual.

- [ ] **Step 1: Substituir o arquivo inteiro**

Substituir todo o conteúdo de `client/src/pages/TVPanel.tsx` por:

```tsx
import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { useSearchParams } from "react-router-dom";
import type { Ticket, DoctorCallingPayload } from "../types";
import { History, Monitor } from "lucide-react";
import { apiFetch } from "../utils/api";
import { API_URL } from "../config";
import ConnectionStatus from "../components/ConnectionStatus";
import QueueLayout from "../components/QueueLayout";
import { CallDisplayQueue } from "../utils/callDisplayQueue";

const CALL_DISPLAY_MIN_MS = 5000;

type DisplayCall =
  | { kind: "guiche"; ticket: Ticket }
  | { kind: "medico"; call: DoctorCallingPayload };

interface HistoryEntry {
  id: string;
  number: string;
  location: string;
  calledAt: string | null;
}

const formatWorkstation = (name?: string, code?: string): string => {
  if (name) return name.toUpperCase();
  const digits = (code ?? "").replace(/[^0-9]/g, "");
  if (digits) return `GUICHÊ ${digits}`;
  return "GUICHÊ --";
};

const toHistoryEntry = (call: DisplayCall): HistoryEntry => {
  if (call.kind === "guiche") {
    return {
      id: `ticket-${call.ticket.id}`,
      number: call.ticket.number,
      location: formatWorkstation(call.ticket.workstation_name, call.ticket.workstation_code),
      calledAt: call.ticket.called_at ?? null,
    };
  }
  return {
    id: `medico-${call.call.ticketNumber}-${Date.now()}`,
    number: call.call.ticketNumber,
    location: call.call.room ? call.call.room.toUpperCase() : "CONSULTÓRIO",
    calledAt: new Date().toISOString(),
  };
};

const TVPanel: React.FC = () => {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get("type"); // consulta | cirurgia
  const filterDoctor = searchParams.get("doctor_id");

  const socketContext = useSocket();
  const [currentCall, setCurrentCall] = useState<DisplayCall | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isCalling, setIsCalling] = useState(false);
  const blinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCall = (call: DisplayCall) => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current
        .play()
        .catch((e) =>
          console.log("Audio play failed (user interaction needed?):", e),
        );
    }

    setCurrentCall(call);
    setIsCalling(true);
    if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
    blinkTimeoutRef.current = setTimeout(() => setIsCalling(false), CALL_DISPLAY_MIN_MS);

    setHistory((prev) => {
      const entry = toHistoryEntry(call);
      const filtered = prev.filter((h) => h.id !== entry.id);
      return [entry, ...filtered].slice(0, 7);
    });
  };

  const displayQueueRef = useRef<CallDisplayQueue<DisplayCall> | null>(null);
  if (!displayQueueRef.current) {
    displayQueueRef.current = new CallDisplayQueue<DisplayCall>({
      minDisplayMs: CALL_DISPLAY_MIN_MS,
      onShow: showCall,
    });
  }

  // Cancela qualquer timer pendente da fila de exibição ao desmontar, pra não
  // disparar onShow (setState) depois que o componente já saiu de tela.
  useEffect(() => {
    return () => {
      displayQueueRef.current?.destroy();
    };
  }, []);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize audio and fetch initial state
  useEffect(() => {
    const src = `${API_URL}/assets/audio/alert.mp3?v=${Date.now()}`;
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.addEventListener("error", () => {
      console.error("Falha ao carregar áudio:", src);
    });
    audioRef.current = audio;

    const matchesFilter = (ticket: Ticket) => {
      if (
        filterType &&
        filterType !== "undefined" &&
        ticket.type !== filterType
      ) {
        return false;
      }
      if (
        filterDoctor &&
        filterDoctor !== "undefined" &&
        ticket.doctor_id !== Number(filterDoctor)
      ) {
        return false;
      }
      return true;
    };

    const fetchState = async () => {
      try {
        const histRes = await apiFetch(`/api/tickets/history?limit=7`);
        const histData: Ticket[] = await histRes.json();

        const filteredHistory = Array.isArray(histData)
          ? histData.filter(matchesFilter)
          : [];
        setHistory(
          filteredHistory
            .slice(0, 7)
            .map((ticket) => toHistoryEntry({ kind: "guiche", ticket })),
        );

        const callingRes = await apiFetch(`/api/tickets?status=calling`);
        const callingData: Ticket[] = await callingRes.json();
        const filteredCalling = Array.isArray(callingData)
          ? callingData.filter(matchesFilter)
          : [];

        if (filteredCalling.length > 0) {
          setCurrentCall({ kind: "guiche", ticket: filteredCalling[0] });
        } else if (filteredHistory.length > 0) {
          setCurrentCall({ kind: "guiche", ticket: filteredHistory[0] });
        } else {
          setCurrentCall(null);
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchState();
  }, [filterType, filterDoctor]);

  useEffect(() => {
    if (socketContext && socketContext.socket) {
      const handleCalling = (ticket: Ticket) => {
        if (
          filterType &&
          filterType !== "undefined" &&
          ticket.type !== filterType
        ) {
          return;
        }
        if (
          filterDoctor &&
          filterDoctor !== "undefined" &&
          ticket.doctor_id !== Number(filterDoctor)
        ) {
          return;
        }

        displayQueueRef.current?.push({ kind: "guiche", ticket });
      };

      const handleDoctorCalling = (payload: DoctorCallingPayload) => {
        displayQueueRef.current?.push({ kind: "medico", call: payload });
      };

      socketContext.on("ticket:calling", handleCalling);
      socketContext.on("doctor:calling", handleDoctorCalling);

      const handleReconnected = () => {
        Promise.all([
          apiFetch(`/api/tickets/history?limit=7`).then((r) => r.json()),
          apiFetch(`/api/tickets?status=calling`).then((r) => r.json()),
        ])
          .then(([hist, calling]) => {
            const matchesFilter = (ticket: Ticket) => {
              if (
                filterType &&
                filterType !== "undefined" &&
                ticket.type !== filterType
              ) {
                return false;
              }
              if (
                filterDoctor &&
                filterDoctor !== "undefined" &&
                ticket.doctor_id !== Number(filterDoctor)
              ) {
                return false;
              }
              return true;
            };

            const histData: Ticket[] = Array.isArray(hist)
              ? hist.filter(matchesFilter)
              : [];
            const callingData: Ticket[] = Array.isArray(calling)
              ? calling.filter(matchesFilter)
              : [];
            setHistory(
              histData
                .slice(0, 7)
                .map((ticket) => toHistoryEntry({ kind: "guiche", ticket })),
            );
            if (callingData.length > 0) {
              setCurrentCall({ kind: "guiche", ticket: callingData[0] });
            } else if (histData.length > 0) {
              setCurrentCall({ kind: "guiche", ticket: histData[0] });
            } else {
              setCurrentCall(null);
            }
          })
          .catch(() => {});
      };
      socketContext.on("ws:reconnected", handleReconnected);

      return () => {
        socketContext.off("ticket:calling", handleCalling);
        socketContext.off("doctor:calling", handleDoctorCalling);
        socketContext.off("ws:reconnected", handleReconnected);
      };
    }
  }, [socketContext, filterType, filterDoctor]);

  const unlockAudio = () => {
    if (audioRef.current) {
      audioRef.current
        .play()
        .then(() => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          setAudioUnlocked(true);
        })
        .catch(() => {});
    }
  };

  const headerContent = (
    <div className="flex justify-between items-center w-full h-full px-8">
      <div className="flex items-center gap-4">
        <img 
          src="/logo-instagram.png" 
          alt="Logo" 
          className="h-16 object-contain"
        />
        <h1 className="text-2xl font-bold text-gray-700 uppercase tracking-widest">
          Centro do Cérebro e Coluna
        </h1>
      </div>
      
      <div className="text-right">
        <div className="text-4xl font-mono font-bold text-gray-800">
          {currentTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div className="text-gray-600 font-medium uppercase text-sm mt-1">
          {currentTime.toLocaleDateString([], {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
      </div>
    </div>
  );

  return (
    <QueueLayout headerContent={headerContent}>
      {!audioUnlocked && (
        <button
          onClick={unlockAudio}
          className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-yellow-400 text-yellow-900 px-4 py-2 rounded-full shadow-lg font-bold text-sm"
        >
          🔇 Clique para ativar o som
        </button>
      )}
      <ConnectionStatus />
      <div className="w-full h-full flex relative">
        <div
          className="w-[40%] h-full z-30"
          style={{
            paddingTop: "clamp(0.4rem, 2vh, 2.5rem)",
            paddingLeft: "clamp(0.4rem, 2vw, 2.5rem)",
          }}
        >
          <div
            className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-xl"
            style={{ padding: "clamp(0.6rem, 1.4vw, 1.6rem)" }}
          >
            <h2
              className="text-white font-bold uppercase tracking-widest flex items-center border-b border-white/20"
              style={{
                fontSize: "clamp(0.95rem, 1.6vw, 1.6rem)",
                gap: "clamp(0.35rem, 0.8vw, 1rem)",
                marginBottom: "clamp(0.6rem, 1.2vw, 1.3rem)",
                paddingBottom: "clamp(0.45rem, 0.9vw, 1rem)",
              }}
            >
              <History
                className="text-white"
                style={{
                  width: "clamp(1.05rem, 1.6vw, 2rem)",
                  height: "clamp(1.05rem, 1.6vw, 2rem)",
                }}
              />
              Últimas Chamadas
            </h2>

            <div
              style={{
                display: "grid",
                rowGap: "clamp(0.45rem, 1vw, 1.05rem)",
              }}
            >
              {history.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="flex justify-between items-center bg-white/10 rounded-xl border border-white/10"
                  style={{
                    padding: "clamp(0.5rem, 1.1vw, 1.15rem)",
                  }}
                >
                  <div
                    className="flex items-center"
                    style={{ gap: "clamp(0.5rem, 1.5vw, 1.75rem)" }}
                  >
                    <span
                      className="font-black text-white"
                      style={{ fontSize: "clamp(1.3rem, 3vw, 3.2rem)" }}
                    >
                      {entry.number}
                    </span>
                    <span
                      className="font-bold text-white/90 uppercase"
                      style={{ fontSize: "clamp(0.95rem, 1.8vw, 1.9rem)" }}
                    >
                      {entry.location}
                    </span>
                  </div>
                  <span
                    className="text-white/60 font-mono"
                    style={{ fontSize: "clamp(0.85rem, 1.4vw, 1.7rem)" }}
                  >
                    {entry.calledAt
                      ? new Date(entry.calledAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="w-[60%] h-full flex flex-col items-center justify-center"
          style={{
            paddingRight: "clamp(0.4rem, 2vw, 2.5rem)",
            paddingBottom: "clamp(0.4rem, 2vh, 2.5rem)",
          }}
        >
          {currentCall ? (
            <div className={`flex flex-col items-center w-full max-w-2xl transition-all duration-500 ${isCalling ? "scale-105" : ""}`}>
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">
                  Senha
                </h2>
                <div className="text-[12rem] leading-none font-black text-gray-800 tracking-tighter">
                  {currentCall.kind === "guiche"
                    ? currentCall.ticket.number
                    : currentCall.call.ticketNumber}
                </div>
              </div>

              <div className="w-full space-y-8">
                {currentCall.kind === "guiche" ? (
                  <>
                    <div className="bg-white rounded-2xl shadow-lg p-8 border-l-8 border-primary">
                      <div className="text-gray-400 uppercase tracking-widest text-sm font-bold mb-2">
                        Local de Atendimento
                      </div>
                      <div className="text-5xl font-bold text-primary flex items-center gap-4">
                        <Monitor className="w-12 h-12" />
                        {formatWorkstation(
                          currentCall.ticket.workstation_name,
                          currentCall.ticket.workstation_code,
                        )}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg p-8 border-l-8 border-secondary">
                      <div className="text-gray-400 uppercase tracking-widest text-sm font-bold mb-2">
                        Profissional
                      </div>
                      <div className="text-4xl font-medium text-gray-800">
                        {currentCall.ticket.doctor_name || "Clínico Geral"}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-white rounded-2xl shadow-lg p-8 border-l-8 border-primary">
                      <div className="text-gray-400 uppercase tracking-widest text-sm font-bold mb-2">
                        Paciente
                      </div>
                      <div className="text-5xl font-bold text-primary">
                        {currentCall.call.patientName}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg p-8 border-l-8 border-secondary">
                      <div className="text-gray-400 uppercase tracking-widest text-sm font-bold mb-2">
                        Dirija-se a
                      </div>
                      <div className="text-4xl font-medium text-gray-800 flex items-center gap-4">
                        <Monitor className="w-10 h-10" />
                        {currentCall.call.room || "Consultório"} —{" "}
                        {currentCall.call.doctorName}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div
                className={`mt-12 py-4 px-12 bg-yellow-400 text-yellow-900 rounded-full text-2xl font-bold uppercase tracking-widest shadow-lg ${isCalling ? "animate-pulse" : ""}`}
              >
                {currentCall.kind === "guiche" &&
                currentCall.ticket.status === "in_attendance"
                  ? "Em atendimento"
                  : "Chamando"}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 opacity-60">
              <Monitor className="w-32 h-32 mb-6" />
              <div className="text-4xl font-light">Aguardando chamada...</div>
            </div>
          )}
        </div>
      </div>
    </QueueLayout>
  );
};

export default TVPanel;
```

- [ ] **Step 2: Confirmar que o client compila**

Run: `cd client && npx tsc -b --noEmit`
Expected: sem erros.

- [ ] **Step 3: Verificar manualmente**

Com servidor e cliente de dev rodando, abrir `/painel` numa aba (simulando a TV):

1. Como atendente, chamar uma senha de guichê → confirmar que aparece no card grande normalmente (igual ao comportamento anterior).
2. Repetir o passo 1 mais 2 vezes em sequência rápida (chamar 3 senhas em menos de 5s, de guichês diferentes se possível) → confirmar que a TV mostra cada uma por pelo menos ~5s antes de passar para a próxima, em ordem (não pula nenhuma).
3. Como médico (terminal `/medico`, Task 17), clicar "CHAMAR PRÓXIMO" com alguém na fila → confirmar que aparece no mesmo card grande da TV, mostrando nome do paciente, sala e nome do médico (em vez de guichê).
4. Disparar uma chamada de guichê e, dentro de 5s, uma chamada de médico → confirmar que a segunda entra na fila e só aparece depois do tempo mínimo da primeira (nenhuma sobrescreve a outra instantaneamente).
5. Confirmar que a lista "Últimas Chamadas" na lateral inclui tanto chamadas de guichê quanto de médico, sem misturar formato.

Expected: todos os 5 passos funcionam como descrito, com o mesmo som de alerta tocando para os dois tipos de chamada.

- [ ] **Step 4: Rodar a suíte de testes do cliente inteira por garantia**

Run: `cd client && npx vitest run`
Expected: PASS (os testes de `callDisplayQueue.test.ts` continuam passando — esta task não mexeu na classe, só no componente que a consome).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TVPanel.tsx
git commit -m "feat: TVPanel consome fila de exibicao e chamada de medico"
```

---

## Verificação final de cobertura do spec

- **Spec §3 (TV):** Task 13 (lógica) + Task 18 (integração) — card único, fila com 5s mínimo, mesmo som, histórico unificado.
- **Spec §4 (modelo de dados):** Tasks 3, 4, 7, 8 — `doctors.room`, `users.role='medico'` + `doctor_id` único, formulário consolidado, Usuários sem médicos.
- **Spec §5 (fila em memória):** Task 2 — `adicionar`/`listar`/`chamarProximo`/`chamarEspecifico`/`remover`/`limpar`.
- **Spec §6 (fluxo do atendente):** Tasks 7 (filtro `has_login`), 10 (endpoint + idempotência), 16 (UI).
- **Spec §7 (terminal do médico + aviso de boot):** Tasks 6, 9, 11, 17.
- **Spec §8 (endpoints):** Tasks 7, 10, 11.
- **Spec §9 (eventos WS):** `doctor:queue-updated`/`doctor:calling` (Task 11), `server:boot` (Task 6).
- **Spec §10/11 (decisões e pontos abertos):** cobertos em todas as tasks acima; o valor de 5s (Task 13/18) e a validação de senha (reaproveitada de `UsersManager`, Tasks 7/14) seguem como ajuste fino pós-implementação, conforme já esperado pelo spec.

