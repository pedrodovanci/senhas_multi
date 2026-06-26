# Spec — Fila do Médico (v2, item #2)

> Companion de `CONTEXTO_Senhas_Multi.md` e `DECISOES_v2_Senhas_Multi.md` (seções 14–15). Detalha a implementação do item #2 das melhorias: segundo ciclo de chamada (médico → TV), só na Recepção 1, reaproveitando a mecânica existente de chamada/broadcast WebSocket.

---

## 1. Objetivo

Ao finalizar um atendimento na recepção, o atendente pode **opcionalmente** encaminhar o paciente (identificado pela senha + nome) para a fila de um médico cadastrado. O médico loga num terminal próprio, vê sua fila e chama o paciente quando estiver pronto. A chamada do médico aparece na **mesma TV** que já exibe as chamadas de guichê.

## 2. Fora de escopo (não-objetivos)

- Não persiste nome de paciente em nenhum banco (SQLite ou Supabase) — vive só na RAM do processo Node.
- Não rastreia "em atendimento" / "finalizado" do lado do médico — uma vez chamado, o item simplesmente sai da fila; não há mais nenhum estado de sistema para esse ciclo.
- Redis é plano B documentado (já decidido em `DECISOES_v2_Senhas_Multi.md`), não faz parte desta implementação.
- Recepção 2 e 3 não usam esta feature (já decidido — fila de médico é exclusiva da Recepção 1).

---

## 3. TV (tela compartilhada — sem dividir)

O layout do `TVPanel` continua o mesmo: um card de destaque + sidebar "Últimas Chamadas". Nada é dividido em zonas.

- Toda chamada (de guichê **ou** de médico) entra numa **fila de exibição** no próprio componente `TVPanel`. A TV mostra um item por vez, avançando para o próximo só depois de um **tempo mínimo de exibição de 5s** (valor inicial, fácil de ajustar depois).
- O conteúdo do card muda conforme o tipo da chamada na vez:
  - Guichê (fluxo atual, inalterado): "Local de Atendimento: GUICHÊ X" + médico associado à consulta.
  - Médico (novo): nome do paciente + "Sala: X" + nome do médico.
- Em rajada (várias chamadas em poucos segundos), a TV fica um pouco atrasada em relação ao tempo real, mostrando uma por vez na ordem de chegada — aceitável, já que a senha já avançou no backend independente da TV.
- Mesmo som de alerta para os dois tipos de chamada (sem segundo arquivo de áudio).
- A sidebar "Últimas Chamadas" passa a registrar chamadas de médico também (hoje só lista chamadas de guichê, vindas de `/api/tickets/history`); como a chamada de médico não tem linha de ticket equivalente, ela é adicionada à lista do lado do cliente, a partir do próprio evento recebido.

## 4. Modelo de dados

- **`users.role`**: adiciona `'medico'` ao `CHECK` (hoje `admin`, `attendant`, `cirurgia`).
- **`users.doctor_id`** (nova coluna, nullable, `FK doctors.id`): só preenchida quando `role = 'medico'`. Um médico tem **0 ou 1** login vinculado (relação opcional 1:1, garantida na criação).
- **`doctors.room`** (nova coluna, texto — ex.: "Sala 3"): exibida na TV e no cabeçalho do terminal do médico.
- **Admin → aba "Médicos"**: o formulário de médico (que já tem nome/prefixo/especialidade) ganha `sala/consultório` e dois campos **opcionais**: `nome de usuário` e `senha`.
  - Em branco → médico fica só como referência (sem login), igual hoje.
  - Preenchidos → cria/atualiza, nos bastidores, a linha em `users` (`role = 'medico'`, `doctor_id` apontando para esse médico).
  - Editar um médico que já tem login: username aparece preenchido (editável); senha aparece em branco com placeholder "deixe em branco para manter a atual".
- **Admin → aba "Usuários"**: deixa de listar contas com `role = 'medico'` — a gestão delas é 100% pela aba Médicos, para não ter duas telas editando a mesma credencial.

## 5. Fila em memória (módulo isolado)

Reaproveitando a decisão já tomada (terreno preparado para Redis): um módulo único, hoje implementado com `Map`, com toda a fila do dia escondida atrás de funções — nada acessa o `Map` diretamente fora desse módulo.

```
adicionar(doctorId, entry)        // entry = { id, ticketNumber, patientName, ticketId, forwardedAt }
listar(doctorId)                  // fila daquele médico, em ordem de chegada
chamarProximo(doctorId)           // remove e retorna o primeiro (FIFO)
chamarEspecifico(doctorId, entryId) // remove e retorna um item específico (fora de ordem)
remover(doctorId, entryId)        // cancelar um encaminhamento errado
limpar(doctorId)                  // esvaziar a fila
```

A fila é **independente de sessão/login ativo**: é indexada por `doctorId`, não por "médico logado agora". Isso é proposital — o paciente pode chegar e ser encaminhado antes do médico logar no terminal; quando ele logar, a fila já estará lá esperando.

## 6. Fluxo do atendente

Ponto de integração: `Attendant.tsx`, barra de ações quando o ticket está `in_attendance` (hoje só tem o botão "FINALIZAR ATENDIMENTO").

- Novo botão **"ENCAMINHAR PARA MÉDICO"** ao lado do "FINALIZAR ATENDIMENTO". Abre um modal:
  - Seletor de médico — lista **apenas médicos com login configurado** (têm `username`/`senha` cadastrados no admin), independente de estarem logados no momento. Médicos sem login não aparecem (não haveria como ninguém chamar essa fila).
  - Campo "nome do paciente" — obrigatório.
  - Confirmar.
- A confirmação dispara **um único request novo**: `POST /api/tickets/:id/forward-to-doctor` `{ doctor_id, patient_name }`. No backend, essa rota finaliza o ticket (mesmo efeito de `status: finished`) **e** adiciona o paciente na fila do médico, numa coisa só — evita o atendente precisar lembrar de dois passos, e evita estado intermediário se uma das duas ações falhasse isoladamente.
- "FINALIZAR ATENDIMENTO" sem encaminhar continua exatamente como hoje, sem nenhuma mudança.
- Se não houver **nenhum** médico com login configurado no sistema, o botão "ENCAMINHAR PARA MÉDICO" fica escondido (em vez de abrir um modal com lista vazia).

**Idempotência (evitar encaminhar o mesmo paciente duas vezes):**
- Client-side: o botão de confirmar fica desabilitado (`disabled`/`loading`, mesmo padrão já usado em `updateStatus` no `Attendant.tsx`) entre o clique e a resposta do servidor — evita duplo-clique acidental.
- Server-side (a trava real): `forward-to-doctor` finaliza o ticket com `UPDATE tickets SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'in_attendance'`. Se `changes === 0` (já não estava `in_attendance` — outra requisição já processou), responde 409 e **não** chama `adicionar()` na fila do médico. Mesmo padrão de concorrência já usado em `call-next`/`call-specific` (`CONTEXTO_Senhas_Multi.md`, seção 9). Só depois de confirmar `changes === 1` é que o paciente entra na fila do médico.
- Reforço estrutural: depois de um encaminhamento bem-sucedido, `currentTicket` vira `null` no Attendant (mesma lógica que já existe para `finished`/`missed`), então o botão "ENCAMINHAR PARA MÉDICO" desaparece da tela — não há como clicar de novo pelo fluxo normal da UI.

## 7. Terminal do médico

- Nova rota `/medico`, nova página (mesmo padrão visual do `Attendant.tsx`, bem mais simples).
- Login: mesmo fluxo de autenticação (`/api/login`), mas **sem** a etapa de selecionar guichê — médico não trava guichê.
- Tela: cabeçalho com nome do médico + sala; lista da fila dele (senha, nome do paciente, tempo esperando); botão "Chamar próximo" (FIFO); clique em qualquer linha da lista chama aquele item específico (fora de ordem).
- Depois de chamado, o item simplesmente sai da lista. Não há "em atendimento"/"finalizado" do lado do médico — esse ciclo não persiste nenhum estado adicional (ver seção 2).

**Aviso de reinício do servidor (perda de fila):** como a fila vive só em RAM, um restart do processo (deploy, queda de energia, crash) a esvazia silenciosamente. Pra não deixar o médico achar que "fila vazia" = "nenhum paciente", o terminal precisa distinguir isso de uma reconexão normal de rede:
- O servidor gera um `bootId` (aleatório) uma vez, ao iniciar o processo.
- Toda nova conexão WebSocket recebe esse `bootId` imediatamente (evento `server:boot`, enviado direto pro cliente que acabou de conectar, não é broadcast).
- O terminal do médico guarda o último `bootId` visto em `localStorage`. Se o valor recebido for diferente do guardado (e já havia um valor guardado antes — não é o primeiro login), mostra um banner fixo e dismissível: "O servidor foi reiniciado — a fila pode ter sido perdida, confira com a recepção quem já foi encaminhado." Em seguida atualiza o `localStorage` com o novo `bootId` e refaz `GET /api/doctor-queue/mine`.
- Limitação aceita: o aviso é genérico (não dá pra saber *quem* exatamente se perdeu, só que algo pode ter se perdido) — é o máximo que se pode garantir sem persistir a fila em disco, o que está fora de escopo (seção 2).

## 8. Endpoints novos

| Rota | Quem | Função |
|---|---|---|
| `POST /api/tickets/:id/forward-to-doctor` | atendente | `{ doctor_id, patient_name }` — finaliza o ticket + enfileira no médico |
| `GET /api/doctor-queue/mine` | médico | lista a fila do médico logado (doctor_id vem do JWT) |
| `POST /api/doctor-queue/call-next` | médico | chama o próximo (FIFO) |
| `POST /api/doctor-queue/call/:entryId` | médico | chama um item específico (fora de ordem) |

## 9. Eventos WebSocket novos

- `doctor:queue-updated` — disparado quando a fila de um médico muda (encaminhado ou chamado). O terminal do médico escuta e atualiza a lista sem F5 (mesmo padrão do item #3 já implementado).
- `doctor:calling` — disparado quando o médico chama alguém. A TV consome esse evento na fila de exibição (seção 3). Payload: `{ ticketNumber, patientName, doctorName, room }`.
- `server:boot` — enviado direto (não broadcast) pra cada cliente assim que a conexão WebSocket é aberta. Payload: `{ bootId }`. Usado pelo terminal do médico pra detectar reinício do servidor (seção 7).

---

## 10. Decisões confirmadas nesta rodada

- TV: card único compartilhado (sem dividir tela), fila de exibição com mínimo de 5s por chamada, mesmo som para os dois tipos.
- Login do médico é opcional e configurado direto no formulário de "Médicos" (não na tela de Usuários).
- Tela de Usuários não lista mais contas de médico.
- Seletor de "encaminhar para médico" no Attendant só mostra médicos com login configurado, independente de estarem logados agora.
- Atendente pode encaminhar para qualquer médico com login (não restrito ao médico já vinculado à senha, quando houver).
- Médicos sem login configurado não têm nenhum tratamento especial: simplesmente não aparecem no seletor de encaminhamento, e o fluxo de "Finalizar atendimento" continua idêntico ao atual.
- Se não houver nenhum médico com login no sistema, o botão "ENCAMINHAR PARA MÉDICO" fica escondido no Attendant.
- Nome do paciente é sempre digitado manualmente pelo atendente no momento do encaminhamento (não existe em nenhum outro lugar do sistema pra reaproveitar).
- Idempotência do encaminhamento garantida no servidor (`UPDATE ... WHERE status = 'in_attendance'` + checar `changes`), reaproveitando o padrão de concorrência já usado em `call-next`/`call-specific`. Botão desabilitado durante o request é só reforço de UX, não a defesa principal.
- Terminal do médico mostra aviso de reinício do servidor via `bootId` comparado contra `localStorage`, distinguindo restart real de reconexão de rede normal.

## 11. Pontos abertos para a etapa de implementação

- Valor exato dos 5s de exibição mínima na TV pode precisar de ajuste fino depois de observar uso real.
- Regras de validação de username/senha do médico devem reaproveitar o que já existe na criação de usuários (não inventar regra nova).
