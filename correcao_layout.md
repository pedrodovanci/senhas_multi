# Revisão de Layout — Terminal do Atendente (`/atendente`)

> **Contexto:** O protótipo atual (Imagem 1) apresenta bom design visual e paleta de cores aprovada, mas a **disposição das informações e a hierarquia operacional** precisa ser revisada para refletir o fluxo real de trabalho, conforme o sistema de referência (EasySenha, Imagem 2).

---

## O Problema Central

O layout atual separa "Chamar Próximo" e "Chamar Aleatório" em dois blocos genéricos, sem nenhuma vinculação com os médicos/filas específicos. O atendente da clínica trabalha com **múltiplos médicos simultaneamente** — ele precisa ver de uma vez só: qual fila está maior, qual tem mais tempo de espera, e chamar a próxima senha de um médico específico com um único clique.

O sistema de referência resolve isso com **um card independente por médico**, cada um com sua própria fila, tempo de espera e botão de chamada. Esse modelo deve ser reproduzido no novo sistema.

---

## Mudanças Solicitadas na Tela `/atendente`

### 1. Remover os dois blocos genéricos ("Chamar Próximo" e "Chamar Aleatório")

**Situação atual:** Dois cards grandes centrais sem contexto de qual médico ou fila se referem.

**Como deve ficar:** Esses dois botões devem ser **movidos para dentro de cada card de médico** (ver item 2). A chamada sempre deve estar associada a uma fila específica.

---

### 2. Criar a grade de cards por médico — elemento principal da tela

Esta é a mudança mais importante. A área central da tela (que hoje é quase vazia quando não há atendimento) deve ser ocupada por uma **grade de cards, um para cada médico ativo**.

**Cada card deve conter:**

| Elemento | Detalhe |
|---|---|
| **Nome do médico** | Ex: `DR. CARLOS ROCHA` em destaque no topo do card |
| **Botão "CHAMAR SENHA"** | Botão primário, cor `#0097b2`, largura total do card |
| **Tempo de espera** | Da senha mais antiga daquela fila. Ex: `Espera: 00:03:42` |
| **Total de senhas** | Quantidade aguardando naquela fila. Ex: `3 senhas aguardando` |

**Comportamento visual dos cards:**
- Card com fila vazia: tom acinzentado, botão desabilitado, texto "Fila vazia"
- Card com senhas aguardando: destaque com borda colorida ou leve fundo colorido
- Card do médico sendo atendido no momento: indicador visual de "em atendimento"

**Layout da grade:**
- Desktop (≥1280px): 3 ou 4 cards por linha
- Tablet (768px–1279px): 2 cards por linha
- Os cards devem ter altura fixa para manter alinhamento visual

---

### 3. Adicionar o contador global de senhas aguardando

**Situação atual:** Não existe.

**Como deve ficar:** Uma barra ou faixa no topo da área de conteúdo (abaixo do header) mostrando:

```
SENHAS AGUARDANDO ATENDIMENTO: 07
```

Fundo escuro (`#0097b2` ou `#1a1a2e`), texto branco, fonte bold. Deve atualizar via WebSocket em tempo real.

---

### 4. Área de "senha em chamada atual" — reposicionar e simplificar

**Situação atual:** Ocupa a maior parte da tela com um ícone de monitor e texto "Posto Livre" mesmo quando há fila.

**Como deve ficar:** Reduzir essa área para uma **faixa de status no topo**, junto à barra superior (header). Ela deve mostrar:

- Estado vazio: `● POSTO LIVRE` em cinza
- Com senha chamada: `● EM CHAMADA: C029 — AGENDAMENTO CIRURGIAS` em verde/destaque
- Com atendimento ativo: `● ATENDENDO: C029 | 00:02:14` com cronômetro

Os botões de ação da senha atual (`INICIAR`, `FINALIZAR`, `NÃO COMPARECEU`, `RE-CHAMAR`) devem aparecer nessa mesma faixa, à direita, somente quando houver uma senha ativa.

---

### 5. Painel lateral direito — manter com ajustes

O painel lateral direito (`Fila de Espera` com abas Consultas/Cirurgias e Últimas Chamadas) está bem posicionado e pode ser mantido. Ajustes sugeridos:

- Aumentar o tamanho dos números de contagem (hoje estão pequenos)
- Na seção "Próximas Senhas", listar as 3 próximas senhas com código + médico + tempo de espera, em vez de só mostrar "Fila vazia"
- Na seção "Últimas Chamadas", mostrar também o nome do médico junto à senha

---

## Resumo Visual do Novo Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ [LOGO]  Terminal do Atendente · Guichê 01 · ONLINE       atendente ↪│
│ ─────────────────────────────────────────────────────────────────── │
│ ● EM CHAMADA: C029 — DR. CARLOS ROCHA     [INICIAR] [NÃO COMP.] ... │
├──────────────────────────────────────────────┬──────────────────────┤
│ SENHAS AGUARDANDO ATENDIMENTO: 07            │  Fila de Espera       │
│ ─────────────────────────────────────────── │  [CONSULTAS][CIRURG.] │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │                       │
│ │ DR. CARLOS  │ │ DRA. RAYSA  │ │ DR. EDU │ │  Próximas senhas:     │
│ │ ROCHA       │ │ MOREIRA     │ │ SILVA   │ │  C030 · Dr. Carlos    │
│ │[CHAMAR SENHA│ │[CHAMAR SENHA│ │[CHAMAR] │ │  C031 · Dra. Raysa    │
│ │Espera:02:14 │ │Espera:01:44 │ │Esp:00:59│ │  C032 · Dr. Eduardo   │
│ │2 aguardando │ │1 aguardando │ │1 aguard.│ │                       │
│ └─────────────┘ └─────────────┘ └─────────┘ │  Últimas chamadas:    │
│ ┌─────────────┐ ┌─────────────┐             │  C029 · Finalizado    │
│ │ *** APOIO **│ │ CIRURGIA    │             │  C028 · Finalizado    │
│ │[CHAMAR SENHA│ │[CHAMAR SENHA│             │                       │
│ │Espera:03:00 │ │Fila vazia   │             │                       │
│ │1 aguardando │ │(desabilitado│             │                       │
│ └─────────────┘ └─────────────┘             │                       │
└──────────────────────────────────────────────┴──────────────────────┘
```

---

## O que NÃO muda

- Paleta de cores (`#0097b2`, `#7ed957`, `#8baf3f`, `#b0cf53`, `#ffffff`) — **mantida**
- Header com logo, nome do atendente e status do guichê — **mantido**
- Painel lateral direito com abas Consultas/Cirurgias — **mantido com ajustes**
- Atualização em tempo real via WebSocket — **mantida**
- Todas as regras de negócio do plano de ação — **inalteradas**

---

## Referência de Componentes React a Criar/Alterar

| Componente | Ação |
|---|---|
| `<AttendantHeader />` | Adicionar faixa de status da senha atual + botões de ação |
| `<GlobalQueueCounter />` | Criar novo — barra com total de senhas aguardando |
| `<DoctorQueueCard />` | Criar novo — card individual por médico com botão próprio |
| `<DoctorQueueGrid />` | Criar novo — grade responsiva de DoctorQueueCards |
| `<SidePanel />` | Ajustar — ampliar números e listar senhas individualmente |
| `<CallButtons />` | Remover da área central — mover para dentro do AttendantHeader |

---

*Revisão de Layout v1.0 — Terminal do Atendente · Sistema de Senhas CCC*