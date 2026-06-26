# Resumo das decisões — Senhas Multi v2

> O que foi decidido nesta conversa sobre as melhorias do sistema de senhas do CCC. Companion do documento de contexto principal (`CONTEXTO_Senhas_Multi.md`, seções 14–15).

---

## Princípio que guiou tudo

**Operação local e offline-first; nuvem só para o que é inerentemente consolidado.**
A fila ao vivo nunca pode depender de internet. Só o que precisa juntar as três recepções (estatísticas do master) vai para a nuvem.

---

## Contexto de implantação

Três recepções, cada uma com sistema **sob medida** (pasta/servidor/SQLite próprios), não um sistema universal.

- **Recepção 1 (Piso superior):** tem totem (o PC do totem é o servidor; TV embutida). **É aqui que entra a fila dos médicos.** Já está rodando, sem essa função ainda.
- **Recepção 2 (Consultas):** sem totem (atendente retira a senha por um PC). 12 guichês. Sem fila de médicos.
- **Recepção 3 (Exames):** tem totem. 11 guichês. Fluxo próprio (Agendar/Realizar exame; prioridades Normal/Preferencial/Prioritário). Sem médicos e sem fila de médicos.

---

## As 4 melhorias

### #1 — Estatísticas
- O endpoint `/api/stats` já existe e calcula bastante coisa; **não funciona hoje por algum motivo a diagnosticar.**
- Suspeitos: token/`requireAdmin` (401/403), fuso UTC vs UTC-3 jogando registros fora da janela do dia (zera médias), ou a tela não consumindo o endpoint.
- **Diagnosticar primeiro, expandir métricas depois.**

### #2 — Fila dos médicos (só Recepção 1)
- Ao finalizar um atendimento, o atendente pode **encaminhar** o paciente para a fila de um médico cadastrado. Encaminhar é **opcional** — finalizar sem encaminhar continua igual.
- O médico vê sua fila e **chama a senha na TV dele** (reaproveita a mecânica de chamada/broadcast que já existe).
- Paciente identificado pelo **número da senha**.
- **Nome do paciente fica só na RAM do servidor** (`Map`), nunca persiste em banco. Necessário durante o ciclo, descartável depois.
- **Terreno preparado para Redis:** acesso à fila isolado atrás de um módulo único (`adicionar` / `listar` / `remover` / `limpar`). Redis é plano B, só se o restart no meio do dia se mostrar doloroso.
- Cuidado de privacidade: nome é dado de saúde — garantir que **nunca** vaza para o caminho analítico/Supabase.

### #3 — Acabar com o F5 (primeiro a fazer)
- Problemas: liberar guichê ocupado e cadastrar médico novo só refletem após F5 (ruim, ainda mais no totem sem teclado).
- A infra **já existe** (WebSocket + `broadcast` + `workstation:updated`); as telas é que não escutam os eventos.
- Solução: telas reagirem aos eventos já emitidos + emitir evento ao criar médico.
- **Alto valor, baixo risco. É o primeiro passo.**

### #4 — Supabase (por último)
- Entra como **banco analítico central**, não como banco operacional.
- Justificado pela necessidade do **usuário master ver o macro das três recepções** (sem isso, nem se justificaria).

---

## Arquitetura de dados

### SQLite local (uma instância por recepção) — fonte da verdade
- Funciona offline. Mantém o modelo "pasta + `.bat` + agendador".
- Guarda: login de **atendentes e admins**, **médicos**, e **atendimentos finalizados** (com flag `synced`).

### Supabase (central) — analítico
- Recebe só **atendimentos finalizados, sem nome de paciente**.
- **Sync periódico (5–15 min ou fim do expediente), nunca a cada minuto.**
- Sync marca `synced = true` **sem apagar** do SQLite → Supabase é sempre reconstruível a partir dos locais.
- Guarda também o **login master** e os dados consolidados.

### Níveis de acesso
- **Atendente / totem / admin da recepção** → login **local (SQLite)**, offline-first.
- **Admin da recepção** é usuário **operacional** (gerencia guichês, usuários, médicos, senhas) e vê estatísticas **da própria recepção lendo o SQLite local** (Opção A — não toca no Supabase).
- **Master** → login **no Supabase**, puramente analítico, sem função operacional. Vê as três recepções.
- **Tela do master:** interface nova e separada, autentica no Supabase, mostra o consolidado.
- Sem duplicação: SQLite = atendentes + admins; Supabase = master + dados consolidados.

---

## Ordem de execução

1. **#3 — Sem F5** (rápido, baixo risco, melhora as três, ensina o padrão de telas reagindo a eventos).
2. **#1 — Estatísticas** (diagnosticar, depois expandir).
3. **#2 — Fila dos médicos** (Recepção 1, RAM via módulo isolado).
4. **#4 — Supabase + tela master** (banco analítico central).

---

## Pontos em aberto / a confirmar na implementação

- Confirmar a causa real do `/api/stats` não funcionar (token? fuso? consumo da tela?).
- Definir o modelo exato da fila dos médicos em memória (estrutura do `Map`, chave por médico).
- Definir o schema analítico no Supabase (quais campos do atendimento, como marcar a recepção de origem para o filtro de permissão).
- Definir estratégia de re-sync / idempotência (evitar duplicar registros se um sync falhar no meio).
