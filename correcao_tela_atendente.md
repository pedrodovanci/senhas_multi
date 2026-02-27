# Revisão de Layout v2.0 — Terminal do Atendente (`/atendente`)

> **Contexto:** Com base no layout atual (já aprovado na v1.0), esta revisão elimina o painel lateral fixo e substitui por botões de ação contextuais na barra de status, além de adicionar a rota de reingresso de senhas não comparecidas.

---

## Resumo das Mudanças

| # | Mudança | Tipo |
|---|---|---|
| 1 | Eliminar o card "Próximas Senhas" do painel lateral | Remoção |
| 2 | Mover "Histórico Recente" para botão na barra de status | Refatoração |
| 3 | Adicionar botão "Atendimento" com lista de senhas aguardando | Novo |
| 4 | Adicionar botão e rota para reingresso de não comparecidos | Novo |

---

## Mudança 1 — Eliminar o Painel Lateral

**O que remover:** O painel lateral direito inteiro, contendo as seções "Próximas Senhas" e "Histórico Recente".

**Justificativa:** As informações de próximas senhas já estão visíveis nos próprios cards de médico (campo FILA + tempo de espera). O histórico passa a ser acessado sob demanda via botão, evitando poluição visual permanente na tela.

**Impacto no layout:** Com a remoção do painel, os cards de médico devem expandir para ocupar toda a largura da tela (layout full-width), aproveitando melhor o espaço horizontal.

---

## Mudança 2 — Histórico como Botão Modal

### Posicionamento

Na barra de status (faixa `#0097b2` com "SENHAS AGUARDANDO ATENDIMENTO"), adicionar dois botões à direita, antes do indicador "TERMINAL: G01":

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚡ SENHAS AGUARDANDO ATENDIMENTO: 03   [HISTÓRICO]  [ATENDIMENTO]  TERMINAL: G01 │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Estética dos botões na barra:**
- Fundo: branco com 20% de opacidade (efeito glass sobre o azul)
- Texto: branco, bold, fonte pequena (~12px)
- Borda: 1px branco com 40% de opacidade
- Hover: fundo branco com 30% de opacidade
- Ícone + texto: `🕐 HISTÓRICO` e `📋 ATENDIMENTO`

---

### Comportamento do Modal "Histórico"

**Trigger:** Clique no botão `HISTÓRICO` na barra de status.

**O que exibe:** Modal centralizado com histórico de **todos os terminais**, ordenado do mais recente para o mais antigo.

**Colunas da lista:**

| Coluna | Exemplo | Detalhe |
|---|---|---|
| Código da Senha | `C029` | Bold, fonte maior |
| Guichê que chamou | `G01` | Badge colorido |
| Horário | `14:32` | Formato hh:mm |
| Status | `FINALIZADO` / `EM ATENDIMENTO` / `NÃO COMPARECEU` | Badge colorido por status |

**Exemplo visual da linha:**
```
C029  ·  G01  ·  14:32  ●  FINALIZADO
C028  ·  G03  ·  14:30  ●  EM ATENDIMENTO
C027  ·  G01  ·  14:28  ●  NÃO COMPARECEU
```

**Especificações do modal:**
- Título: `Histórico de Chamadas — Hoje`
- Largura: 560px, altura máxima: 70vh com scroll interno
- Filtro opcional no topo: `Todos os terminais ▾` (dropdown para filtrar por guichê específico)
- Atualização: o histórico deve atualizar via WebSocket enquanto o modal estiver aberto (sem precisar fechar e reabrir)
- Fechar: botão X no canto superior direito ou clique fora do modal

**Cores dos badges de status:**
- `FINALIZADO` → verde (`#7ed957`)
- `EM ATENDIMENTO` → azul (`#0097b2`)
- `NÃO COMPARECEU` → vermelho (`#e74c3c`)
- `AGUARDANDO` → cinza (`#95a5a6`)

---

## Mudança 3 — Botão "Atendimento" com Lista de Senhas Aguardando

### Objetivo

Permitir que o atendente chame **uma senha específica fora da ordem FIFO**, visualizando todas as senhas que ainda aguardam atendimento em todos os médicos.

### Comportamento do Modal "Atendimento"

**Trigger:** Clique no botão `ATENDIMENTO` na barra de status.

**O que exibe:** Modal com todas as senhas no status `AGUARDANDO`, agrupadas por médico.

**Estrutura da lista:**

```
DR. JOÃO SILVA
  C001  ·  Espera: 00:04:32  [CHAMAR]
  C004  ·  Espera: 00:03:10  [CHAMAR]
  C005  ·  Espera: 00:02:55  [CHAMAR]

DRA. MARIA SOUZA
  (fila vazia)

DR. CARLOS ROCHA
  C007  ·  Espera: 00:01:20  [CHAMAR]
```

**Especificações do modal:**
- Título: `Senhas Aguardando Atendimento`
- Largura: 620px, altura máxima: 75vh com scroll interno
- Cada linha de senha: código em bold + tempo de espera + botão `[CHAMAR]` à direita
- Ao clicar em `[CHAMAR]`: executa o mesmo fluxo de chamada do botão "CHAMAR SENHA" do card (emite WS `TICKET_CALLED`, registra `call_type = SPECIFIC`), fecha o modal e atualiza a tela
- Senhas com tempo de espera acima de 10 minutos: destacar o tempo em vermelho
- Atualização em tempo real via WebSocket enquanto o modal estiver aberto

> **Regra de negócio a registrar:** Chamadas feitas por este modal devem ser registradas no `attendance_logs` com `call_type = SPECIFIC` (distinto de `FIFO` e `RANDOM`).

---

## Mudança 4 — Reingresso de Não Comparecidos

### Contexto

Quando um paciente não comparece e a senha é marcada como `NAO_COMPARECEU`, ela sai da fila permanentemente. Em alguns casos, o paciente chega atrasado e o atendente precisa reinseri-lo na fila sem gerar uma nova senha.

### Nova Rota no Backend

```
POST /tickets/{ticket_id}/requeue
```

**Regras de negócio:**
- Apenas senhas com status `NAO_COMPARECEU` podem ser reinseridas
- Ao reingressar, o status volta para `AGUARDANDO`
- O campo `requeued_at` deve ser registrado (adicionar coluna na tabela `tickets`)
- O campo `requeue_count` deve ser incrementado (adicionar coluna na tabela `tickets` com default 0)
- A senha reinserida entra no **final da fila** do médico correspondente (não volta para a posição original)
- Emitir evento WebSocket `TICKET_REQUEUED` com payload `{ ticket: {...} }` para atualizar todos os terminais

**Atualização no modelo `tickets`:**
```
tickets
  + requeued_at       DATETIME nullable
  + requeue_count     INTEGER default 0
```

### Acesso no Frontend — Botão na Barra de Status

Adicionar um terceiro botão na barra de status:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚡ SENHAS AGUARDANDO: 03   [HISTÓRICO]  [ATENDIMENTO]  [NÃO COMPARECIDOS]  TERMINAL: G01 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Comportamento do Modal "Não Comparecidos"

**Trigger:** Clique no botão `NÃO COMPARECIDOS` na barra de status.

**O que exibe:** Modal listando todas as senhas com status `NAO_COMPARECEU` do dia atual.

**Estrutura da lista:**

```
C027  ·  Dr. João Silva  ·  Não compareceu às 13:45  [REINGRESSAR]
C019  ·  Dra. Maria Souza  ·  Não compareceu às 11:20  [REINGRESSAR]
```

**Especificações:**
- Título: `Senhas Não Comparecidas — Hoje`
- Largura: 600px
- Cada linha: código da senha + médico + horário em que foi marcada como não comparecida + botão `[REINGRESSAR]`
- Se `requeue_count > 0`, exibir badge `↩ 2ª vez` ao lado do código para indicar que já foi reinserida antes
- Ao clicar em `[REINGRESSAR]`: chamar `POST /tickets/{id}/requeue`, exibir toast de confirmação `"Senha C027 reinserida na fila"`, remover a senha da lista do modal
- Se não houver senhas não comparecidas: exibir mensagem `"Nenhuma senha não comparecida hoje"`

### Confirmação de Ação

Antes de reingressar, exibir diálogo de confirmação simples:

```
┌──────────────────────────────────────┐
│  Reinserir senha C027?               │
│  Dr. João Silva · Fila atual: 3      │
│                                      │
│  [CANCELAR]          [REINGRESSAR]   │
└──────────────────────────────────────┘
```

---

## Layout Final da Barra de Status

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚡ SENHAS AGUARDANDO ATENDIMENTO: 03  [🕐 HISTÓRICO] [📋 ATENDIMENTO] [↩ NÃO COMP.]  G01  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Em telas menores (< 1280px), os rótulos dos botões podem ser ocultados, mantendo apenas os ícones com tooltip.

---

## Resumo de Componentes React

| Componente | Ação |
|---|---|
| `<SidePanel />` | **Remover** completamente |
| `<DoctorQueueGrid />` | Alterar para `width: 100%` (ocupar tela toda sem painel lateral) |
| `<StatusBar />` | Adicionar 3 botões: Histórico, Atendimento, Não Comparecidos |
| `<HistoryModal />` | **Criar** — lista de chamadas de todos os terminais |
| `<AttendanceModal />` | **Criar** — lista de senhas aguardando com botão chamar específica |
| `<RequeueModal />` | **Criar** — lista de não comparecidos com botão reingressar |
| `<ConfirmDialog />` | **Criar** — diálogo de confirmação reutilizável |

## Resumo de Endpoints Backend

| Método | Rota | Função |
|---|---|---|
| `GET` | `/tickets/history?date=today` | Retorna histórico do dia com filtro opcional por guichê |
| `GET` | `/tickets/waiting` | Retorna todas as senhas `AGUARDANDO`, agrupadas por médico |
| `GET` | `/tickets/no-show?date=today` | Retorna senhas `NAO_COMPARECEU` do dia |
| `POST` | `/tickets/{id}/requeue` | Reinsere senha na fila, registra `requeued_at` e incrementa `requeue_count` |

---

*Revisão de Layout v2.0 — Terminal do Atendente · Sistema de Senhas CCC*