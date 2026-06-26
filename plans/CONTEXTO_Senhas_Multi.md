# Contexto do Projeto — Senhas Multi (Sistema de Gestão de Atendimento / SGA)

> Documento de contexto para conversas futuras. Resume arquitetura, stack, banco de dados, API, telas e regras de negócio do projeto que está em `Projetos > CCC > Senhas_multi` no Google Drive. Inclui também as divergências entre o **planejamento original** e o **código realmente implementado**.

---

## 1. Visão geral

Sistema web de gerenciamento de filas e atendimento por senhas para o **CCC (Centro do Cérebro e Coluna)**. Cobre todo o ciclo da senha: emissão → fila → chamada → atendimento → finalização/ausência → estatísticas. Roda em **rede local**, acessado pelo navegador, sem instalação nos clientes (totem, terminais de atendente, painéis de TV, admin).

A pasta no Drive tem duas partes:
- **`Planejamento/`** — documentos de especificação original (mapa mental, schema, especificação).
- **`sistema_de_senhas/`** — o código real (repositório Git com `server`, `client`, `print-agent`).

---

## 2. ⚠️ Divergência importante: planejado vs. implementado

O planejamento e o código **não usam a mesma stack**. Vale ter isso em mente sempre.

| Camada | Planejamento original | Implementação real (código) |
|---|---|---|
| Backend | FastAPI (Python) + Uvicorn | **Node.js + Express 5 + TypeScript** |
| Banco | PostgreSQL | **SQLite** (arquivo `database.sqlite`, modo WAL) |
| Tempo real | WebSocket nativo FastAPI | **WebSocket via lib `ws`** |
| Deploy | Serviço Windows via NSSM | Roda via `nodemon`/`node` (NSSM ainda aplicável) |
| Frontend | React | **React 19 + Vite 7 + Tailwind + react-router 6** |

Os nomes de tabelas/estados também mudaram do schema planejado (em inglês: `WAITING`, `tickets`, `sectors`...) para o schema real em SQLite (estados em minúsculo: `waiting`, `calling`, `in_attendance`, `finished`, `missed`).

**Ao falar do estado atual do sistema, usar sempre a stack real (Node + SQLite).**

---

## 3. Stack real (código)

**Backend (`server/`)** — Node + Express 5 + TypeScript, executado com `nodemon src/index.ts`. Porta **3000**.
Dependências principais: `express`, `ws`, `sqlite`/`sqlite3`, `bcryptjs`, `jsonwebtoken`, `cors`, `dotenv`, `escpos` + `escpos-network`/`escpos-usb`, `node-fetch`. Dev: `typescript`, `ts-node`, `nodemon`, `jest`, `supertest`.

**Frontend (`client/`)** — React 19, Vite 7, Tailwind 3, `react-router-dom` 6, `lucide-react` (ícones), `clsx`, `tailwind-merge`. Porta dev **5173**. Scripts: `dev` (`vite --host`), `build` (`tsc -b && vite build`).

**print-agent/** — agente de impressão opcional separado (TypeScript), com `config.json` próprio. Alternativa à impressão direta feita pelo servidor.

**Banco** — SQLite local em `server/database.sqlite`. PRAGMAs: `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`. Para resetar: apagar o arquivo e reiniciar.

---

## 4. Estrutura de pastas (resumida)

```
sistema_de_senhas/
├── README.md
├── server/                  # Backend Node + Express + SQLite
│   ├── src/
│   │   ├── index.ts         # ~49KB: TODAS as rotas, WebSocket, impressão, recovery
│   │   ├── database.ts      # ~16KB: init do schema SQLite, migrações, seeds
│   │   └── middleware/       # auth (generateToken, verifyToken, requireAdmin)
│   ├── package.json
│   └── database.sqlite      # banco local (gitignored)
├── client/                  # Frontend React + Vite
│   └── src/
│       ├── App.tsx          # Rotas + providers (Auth, Socket, Toast) + ErrorBoundary
│       ├── pages/           # Login, Reception, Attendant, TVPanel, Display, Admin
│       ├── contexts/        # AuthContext, SocketContext, ToastContext
│       ├── components/, utils/, assets/
│       ├── config.ts, types.ts
├── print-agent/             # Agente de impressão opcional (ESC/POS)
├── release_senhas/, images/
```

---

## 5. Banco de dados (schema SQLite real)

Quatro tabelas principais (criadas/migradas em `database.ts`):

**`users`** — `id`, `username` (único), `password` (hash bcrypt), `role` CHECK ∈ (`admin`, `attendant`, `cirurgia`), `active`.

**`workstations`** (guichês) — `id`, `code` (único, ex.: `G01`), `name`, `current_user_id` (mecanismo de lock — quem está logado no guichê), `is_active`.

**`doctors`** — `id`, `name`, `specialization`, `prefix` (prefixo de senha do médico, normalizado/único).

**`tickets`** (senhas) — `id`, `number` (ex.: `C001`), `type` CHECK ∈ (`consulta`, `outros`), `subtype` (ex.: `agendamento_cirurgico`, `apoio`), `queue_sector` (`recepcao` | `cirurgia`), `doctor_id`, `status` CHECK ∈ (`waiting`, `calling`, `in_attendance`, `finished`, `missed`), `call_type` (`FIFO` | `RANDOM`), `is_specific_call`, `requeue_count`, timestamps: `created_at`, `called_at`, `started_at`, `finished_at`, `requeued_at`, `workstation_id`, `called_by_user_id`.

**Observações de schema:**
- Migrações são feitas em código (checagens de `PRAGMA table_info` + `ALTER TABLE`), com `PRAGMA user_version` para versionar (v1, v2 já aplicadas).
- Não há tabela `ticket_logs` no código real (existia no planejamento).
- Prefixos reservados de senha: `AC` (agendamento cirúrgico), `APO` (apoio), `C` (consulta), `O` (outros). Médicos não podem usar esses prefixos.

**Seeds automáticos** (quando o banco está vazio):
- Usuários: `admin`/`admin` (admin), `atendente1` e `atendente2` (`1234`), `agendamento_cirurgico` (`123456`, role cirurgia), `totem` (auto-login do totem).
- Guichês `G01`–`G12` (apenas G01–G04 ativos por padrão), + especiais `RET01` (Retirada de Senhas) e `CIR01` (Posto Cirurgia).
- 4 médicos de exemplo (Dr. João Silva, Dra. Maria Souza, etc.).
- Senhas em texto plano são migradas para hash bcrypt no boot.

---

## 6. Telas / Rotas do frontend (`App.tsx`)

| Rota | Componente | Função |
|---|---|---|
| `/login` | `Login` | Autenticação (atendente/admin) + seleção de guichê |
| `/recepcao/consultas` | `Reception` | Totem: paciente gera senha (seleciona serviço/médico/prioridade) |
| `/atendente` | `Attendant` | Terminal: chamar próximo, rechamar, iniciar/finalizar, marcar ausência, chamar específica/aleatória |
| `/painel` | `TVPanel` | Painel de TV: senha atual + guichê + alerta sonoro (TTS/áudio) |
| `/display` | `Display` | Layout alternativo de exibição pública |
| `/admin` | `Admin` | Dashboard: usuários, médicos, guichês, estatísticas |
| `/` | → redireciona para `/login` | |

Providers globais: `ToastProvider` → `AuthProvider` → `SocketProvider` → `BrowserRouter`. Há um `ErrorBoundary` de classe envolvendo tudo, com tela de fallback ("Algo deu errado").

---

## 7. API (backend `index.ts`)

Autenticação por **JWT** (`generateToken`/`verifyToken`), middleware `requireAdmin` para rotas administrativas. `JWT_SECRET` vem do `.env`.

**Auth & guichê**
- `POST /api/login` — valida user/senha (bcrypt), gera token; se `workstation_id` informado, faz lock do guichê (rejeita se ocupado/desativado).
- `POST /api/totem-login` — login automático do usuário `totem` num guichê.
- `POST /api/logout` — libera o guichê; marca como `missed` senhas `in_attendance` daquele guichê.

**Workstations**
- `GET /api/workstations` (ativos), `GET/POST/PUT /api/admin/workstations`, `POST /api/admin/workstations/:id/release`.

**Doctors**
- `GET /api/doctors`, `POST/PUT/DELETE /api/doctors/:id` (admin). Prefixo validado/normalizado.

**Users**
- `GET/POST/PUT/DELETE /api/users` (admin).

**Tickets** (núcleo)
- `GET /api/tickets` — fila do dia (filtros `status`, `queue_sector`).
- `POST /api/tickets` — cria senha; gera número sequencial por prefixo **reiniciado diariamente** (faixa de data em UTC-3); transação `BEGIN IMMEDIATE`; dispara impressão e broadcast `ticket:created`.
- `GET /api/tickets/history` — últimas chamadas do dia.
- `GET /api/tickets/no-show` — senhas `missed`.
- `GET /api/tickets/waiting-stats` — contagem de espera por médico + fila de apoio/cirurgia.
- `POST /api/tickets/call-next` — chama próximo FIFO (transação, lock por status).
- `POST /api/tickets/call-specific` — chama senha específica.
- `POST /api/tickets/call-random` — chama aleatória.
- `POST /api/tickets/:id/recall` — rechama (rebroadcast `ticket:calling`).
- `POST /api/tickets/:id/requeue` — devolve senha `missed` para a fila (`waiting`), limpando dados de chamada e incrementando `requeue_count`.
- `PUT /api/tickets/:id/status` — transições `in_attendance` / `finished` / `missed` com validação de estado.

**Estatísticas**
- `GET /api/stats` (admin) — total/aguardando/atendidas, tempo médio de espera e de atendimento, ranking de atendentes, contagem por tipo, no-shows.

**Estático** — em produção, o Express serve o build do client (`client/dist` ou `public`) com fallback SPA.

---

## 8. Tempo real (WebSocket)

Servidor `ws` acoplado ao HTTP server. Função `broadcast(type, data)` envia a todos os clientes conectados.

**Eventos emitidos:** `ticket:created`, `ticket:calling`, `ticket:started`, `ticket:finished`, `ticket:missed`, `ticket:requeued`, `ticket:updated`, `workstation:updated`.

**Autenticação WS:** cliente envia `{type:"auth", token, workstation_id}`; servidor valida o JWT, associa usuário ↔ guichê e atualiza `current_user_id`. No `close`, há um timer (~120s) que libera o guichê se o usuário não reconectar.

---

## 9. Regras de negócio relevantes

- **Numeração diária por setor/prefixo:** número da senha reinicia a cada dia, calculado por faixa de data **UTC-3** (função `dayRangeUTC3`). Formato `PREFIX + NNN` (ex.: `C001`, `APO012`, `AC003`).
- **Concorrência:** chamadas usam `BEGIN IMMEDIATE` + `UPDATE ... WHERE status='waiting'`, evitando que dois atendentes chamem a mesma senha (checa `result.changes === 0` → 409).
- **Lock de guichê:** um guichê só pode ter um usuário ativo; tentativa de ocupar guichê de outro retorna 409.
- **Recuperação de queda de energia:** no boot, o estado das senhas é **preservado** (não zera). Guichês são liberados no startup.
- **Recovery automático (timer 60s):** senhas em `calling` há >15min viram `missed`; senhas em `in_attendance` há >240min viram `missed` (com broadcast).
- **Dedup de impressão:** janela de 5s evita imprimir a mesma senha duas vezes.

---

## 10. Impressão (ESC/POS)

- O servidor monta um payload **ESC/POS** (`buildEscPosPayload`) com cabeçalho "Centro do Cérebro e Coluna", número da senha em destaque, tipo/médico, data/hora e corte de papel.
- Envio via **socket TCP** direto para a impressora de rede (`PRINTER_HOST`/`PRINTER_PORT`, padrão 9100), controlado por env (`PRINTER_ENABLED`).
- Funciona **sem impressora** (apenas mostra a senha na tela).
- `print-agent/` é uma alternativa: agente local opcional que imprime, com `config.json` próprio.

---

## 11. Configuração / Deploy

- **`.env` do server:** `JWT_SECRET`, `PORT`, `PRINTER_HOST`, `PRINTER_PORT`, `PRINTER_ENABLED`. (`.env` está gitignored.)
- **Subir local:** `cd server && npm install && npm run dev` (porta 3000) e, em outro terminal, `cd client && npm install && npm run dev` (porta 5173).
- **Produção:** `server` faz `npm run build` (tsc → `dist`) e `start:prod` (`node dist/index.js`); pode rodar como serviço do Windows via **NSSM**. O client buildado é servido pelo próprio Express.
- `.gitignore` cobre `node_modules`, `dist`, `*.sqlite*`, `.env*`, `print-agent/config.json`.

---

## 12. Setores / fluxos previstos

Dois grandes setores no planejamento: **Consultas** e **Exames** (com Cirurgia incluída depois). No código, os fluxos giram em torno de:
- `queue_sector = 'recepcao'` — fila geral (consultas, outros, apoio).
- `queue_sector = 'cirurgia'` — fila de agendamento cirúrgico (role `cirurgia`, usuário `agendamento_cirurgico`).

Tipos de senha: `consulta` (prefixo do médico ou `C`), `outros` (`O`), apoio (`APO`), agendamento cirúrgico (`AC`).

---

## 13. Pontos de atenção / dívidas técnicas

- **Senhas padrão fracas** em produção (`admin/admin`, `1234`) — trocar antes de uso real.
- **SQLite** limita concorrência de escrita; o sistema mitiga com WAL + `BEGIN IMMEDIATE`, mas para múltiplas recepções com servidores separados o planejamento previa Postgres.
- **Sem `ticket_logs`**: auditoria completa de cada mudança de status (prevista no plano) não está implementada.
- **Fuso fixo UTC-3** embutido no código (datas do dia) — atenção em horário de verão / outros fusos.
- Planejamento e código divergem; documentação do `Planejamento/` descreve uma arquitetura (FastAPI/Postgres) que **não** é a implementada.

---

## 14. Cenário de implantação (as três recepções)

O sistema **não é universal**: cada recepção recebe uma versão **sob medida** (fork/pasta própria, servidor próprio, SQLite próprio). Uma correção comum (ex.: bug do F5) precisa ser aplicada nas três.

| Recepção | Totem? | Guichês | Fila de médicos? | Observações |
|---|---|---|---|---|
| **1 — Piso superior** | Sim (PC do totem é o servidor; TV embutida exibe a senha) | — | **Sim** | Onde entra a nova função do médico chamar o paciente |
| **2 — Consultas** | Não (atendente retira a senha por um PC) | 12 | Não | Fluxo de consultas por médico, sem fila de médico |
| **3 — Exames** | Sim | 11 | Não | Fluxo próprio (Agendar/Realizar exame; prioridades Normal/Preferencial/Prioritário). Sem nomes de médicos nem fila |

Como cada recepção roda isolada, a fila de médicos **só existe no código da Recepção 1** — não há necessidade de flag de habilitação.

---

## 15. Arquitetura decidida para a v2 (evolução)

Decisões tomadas para as melhorias planejadas. **Princípio-guia: operação local e offline-first; nuvem só para o que é inerentemente consolidado.**

### 15.1 Fila dos médicos (somente Recepção 1)
- Segundo ciclo de chamada (médico → TV), sobreposto ao fluxo atual, **reaproveitando a mecânica existente** de chamada/broadcast WebSocket.
- O paciente é encaminhado **pelo número da senha** (ex.: `C012`); o médico chama a senha na TV dele.
- Encaminhar é **opcional** — finalizar o atendimento sem encaminhar continua funcionando como hoje.
- **Nome do paciente:** necessário **durante** o ciclo (atendente digita → médico vê na fila → chama), mas **não persiste** em banco nenhum. Fica na **RAM do servidor** (um `Map`).
- **Terreno preparado para Redis:** todo acesso à fila fica **isolado atrás de um módulo único** (`adicionar(senha)`, `listar()`, `remover(senha)`, `limpar()`). Hoje `Map`; trocar por Redis no futuro reescreve só esse módulo. Não espalhar acesso ao `Map` pelo resto do código.
- Redis é **plano B documentado**, não item da v2 — só entra se o restart do servidor durante o dia se mostrar frequente/doloroso na prática.
- **Privacidade:** o nome é dado de saúde; a fronteira "nome só no curto prazo, nunca no caminho analítico/Supabase" deve ser explícita no código.

### 15.2 Banco operacional — SQLite local (uma instância por recepção)
- **Fonte da verdade** da operação. Funciona offline. Mantém o modelo "pasta + `.bat` + agendador de tarefas".
- Armazena: **login de atendentes e admins** (usuários operacionais, `role` incluindo `admin`), **médicos** (para entrega de senhas) e **atendimentos finalizados**.
- Cada atendimento finalizado recebe uma flag tipo **`synced`** (`false` ao finalizar).

### 15.3 Banco analítico — Supabase (central, as três recepções)
- Recebe **apenas atendimentos finalizados, sem nome de paciente**, via sincronização.
- **Sync periódico**, *não* a cada minuto: a cada **5–15 min** ou no **fim do expediente** (estatística não é tempo real).
- O sync pega os registros `synced = false`, envia e marca `synced = true` — **sem apagar do SQLite**. O Supabase é sempre **reconstruível** a partir dos SQLites locais.
- Limpeza de registros antigos *já sincronizados* no SQLite é manutenção ocasional, não parte do fluxo de sync.
- Armazena também o **login master** e os dados analíticos consolidados.

### 15.4 Níveis de acesso
- **Login operacional** (atendente, totem, **admin da recepção**) → **SQLite local**, offline-first. O admin é, antes de tudo, usuário operacional (gerencia guichês, usuários, médicos, senhas).
- **Estatísticas do admin da recepção** → **lidas localmente do próprio SQLite** (Opção A escolhida). O admin só vê a própria recepção e não toca no Supabase.
- **Login master** → **Supabase**, criatura puramente analítica, sem função operacional. Vê o **macro das três recepções**.
- **Tela do master:** nova interface separada (quarto "produto"/rota protegida), autentica no Supabase, exibe o consolidado das três recepções.
- **Sem duplicação:** SQLite guarda atendentes + admins; Supabase guarda master + dados consolidados.

### 15.5 Itens #1 e #3 das melhorias
- **#3 (atualização sem F5):** a infra já existe (WebSocket + `broadcast` + evento `workstation:updated`). O problema é que telas (login, lista de médicos do totem) **não escutam** os eventos. Solução: telas reagirem aos eventos já emitidos (e adicionar evento ao criar médico). Alto valor, baixo risco — **primeiro passo recomendado**.
- **#1 (estatísticas):** `/api/stats` já existe e calcula bastante coisa. **Diagnosticar antes** por que não funciona hoje (suspeitos: token/`requireAdmin`, fuso UTC vs UTC-3 jogando registros fora da janela, ou a tela não consome o endpoint). Só depois expandir métricas.

### 15.6 Ordem de execução recomendada
1. **#3 (sem F5)** — rápido, baixo risco, melhora as três recepções, ensina o padrão "telas reagindo a eventos" (reusado na fila do médico).
2. **#1 (estatísticas)** — diagnosticar e depois expandir.
3. **#2 (fila dos médicos)** — feature nova na Recepção 1, RAM via módulo isolado.
4. **#4 (Supabase + master)** — por último; banco analítico central + tela master.

---

*Gerado a partir da análise da pasta `Projetos > CCC > Senhas_multi` no Google Drive (planejamento + código-fonte de server, client e print-agent). Seções 14–15 acrescentadas após decisões de arquitetura da v2.*
