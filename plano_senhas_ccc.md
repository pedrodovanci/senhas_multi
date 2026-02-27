**SISTEMA DE SENHAS CCC**

Plano de Ação para Desenvolvimento

*Clínica Médica · Módulo de Consultas*

**1. Visão Geral do Sistema**

O Sistema de Senhas CCC é uma aplicação web para gerenciamento de filas
de atendimento da recepção da clínica médica. O sistema deve operar com
12 guichês de atendimento, exibição em 4 TVs via HDMI e impressão de
senhas físicas via impressora Epson.

**1.1 Stack de Desenvolvimento --- APROVADO**

  ------------------------------------------------------------------------
  **Tecnologia**        **Papel**             **Justificativa**
  --------------------- --------------------- ----------------------------
  FastAPI (Python)      Backend / API REST +  Leve, async nativo,
                        WebSocket             WebSocket integrado, ideal
                                              para filas em tempo real

  SQLite                Banco de dados        Zero configuração, arquivo
                        (dev/teste)           único, fácil reset entre
                                              testes

  PostgreSQL            Banco de dados        Migração simples via
                        (produção)            SQLAlchemy, mesmo código ORM

  WebSocket             Comunicação em tempo  Permite push de novas senhas
                        real                  sem polling no frontend

  React                 Frontend (todas as    SPA permite múltiplas views
                        telas)                ricas; SSE/WS nativos
  ------------------------------------------------------------------------

⚠️ Observação importante: para produção, migrar o banco para PostgreSQL
trocando apenas a connection string no arquivo de configuração. O ORM
(SQLAlchemy) abstrai as diferenças.

**2. Regras de Negócio Obrigatórias**

**2.1 Fila e Senhas**

-   As senhas devem ser únicas dentro de um mesmo dia. O contador
    reinicia à meia-noite (00:00).

-   Formato obrigatório: prefixo de tipo + número sequencial diário.
    Ex.: C001, C002\... (C = Consulta).

-   Uma senha só pode ter um dos seguintes estados: AGUARDANDO → CHAMADA
    → EM_ATENDIMENTO → FINALIZADA \| NAO_COMPARECEU.

-   Não é permitido chamar uma senha que não esteja no estado
    AGUARDANDO.

-   Não é permitido finalizar ou marcar como não comparecido uma senha
    que não esteja em EM_ATENDIMENTO.

**2.2 Guichês e Atendentes**

-   Cada guichê possui um identificador fixo (G01 a G12).

-   Um atendente só pode estar logado em um único guichê por vez.
    Tentativas de login duplo devem ser bloqueadas com mensagem de erro.

-   Um guichê só pode ter um atendente ativo por vez. Se o guichê já
    estiver ocupado, o login deve ser negado.

-   Ao encerrar sessão (logout), o guichê é liberado automaticamente.
    Senhas em EM_ATENDIMENTO naquele guichê devem ser marcadas como
    NAO_COMPARECEU automaticamente.

-   O sistema deve registrar log com: atendente, guichê, senha, horário
    de início e fim de cada atendimento.

**2.3 Chamada Aleatória**

-   O atendente pode optar por \'Chamar Próxima\' (ordem FIFO) ou
    \'Chamar Aleatória\' (qualquer senha AGUARDANDO).

-   Ambas as ações devem ser registradas no log com o tipo de chamada
    utilizado.

**3. Arquitetura Técnica**

**3.1 Estrutura de Diretórios**

**O projeto deve ser organizado em dois repositórios/pastas
principais:**

**sistema-senhas/**

> ├── backend/
>
> ├── app/
>
> ├── models.py \# SQLAlchemy ORM models
>
> ├── schemas.py \# Pydantic request/response schemas
>
> ├── database.py \# Conexão SQLite/PostgreSQL
>
> ├── routers/ \# tickets.py, attendants.py, stats.py, ws.py
>
> ├── services/ \# queue_service.py, print_service.py
>
> └── config.py \# Variáveis de ambiente
>
> ├── main.py
>
> └── requirements.txt
>
> └── frontend/
>
> ├── src/
>
> ├── pages/ \# AttendantPanel, TVDisplay, TicketGenerator, Stats
>
> ├── components/ \# TicketCard, QueueList, CallButton
>
> └── hooks/ \# useWebSocket.js

**3.2 Modelos de Dados**

  -----------------------------------------------------------------------
  **Tabela**        **Campos principais**
  ----------------- -----------------------------------------------------
  tickets           id, code (C001), type, status, created_at, called_at,
                    started_at, finished_at, called_by_user_id, booth_id,
                    call_type (FIFO\|RANDOM)

  users             id, username, password_hash, role (ATTENDANT\|ADMIN),
                    active

  booths            id, code (G01-G12), current_user_id (FK nullable),
                    is_active

  attendance_logs   id, ticket_id, user_id, booth_id, started_at,
                    finished_at, duration_seconds, outcome
  -----------------------------------------------------------------------

**4. WebSocket --- Atualização em Tempo Real**

**4.1 Especificação do Protocolo**

O backend deve expor um endpoint WebSocket em ws://\[servidor\]/ws. Cada
cliente frontend conecta ao inicializar e mantém a conexão aberta.

**Eventos que o servidor deve emitir (broadcast para todos os clientes
conectados):**

  -------------------------------------------------------------------------
  **Evento (type)** **Payload**                   **Quando emitir**
  ----------------- ----------------------------- -------------------------
  TICKET_CREATED    { ticket: {\...} }            Nova senha
                                                  gerada/impressa

  TICKET_CALLED     { ticket: {\...}, booth:      Senha chamada pelo
                    \'G01\' }                     atendente

  TICKET_STARTED    { ticket: {\...} }            Atendimento iniciado

  TICKET_FINISHED   { ticket: {\...}, outcome:    Finalizado ou não
                    \'FINALIZADA\' }              compareceu

  BOOTH_STATUS      { booths: \[\...\] }          Mudança em qualquer
                                                  guichê
  -------------------------------------------------------------------------

**Formato padrão de todas as mensagens WebSocket:**

{ \"type\": \"TICKET_CREATED\", \"payload\": { \... }, \"timestamp\":
\"2024-01-01T10:00:00Z\" }

**4.2 Implementação no Frontend**

-   Criar hook customizado useWebSocket(url) que gerencia conexão,
    reconexão automática (com backoff exponencial) e dispatch de
    eventos.

-   A tela do atendente deve escutar TICKET_CREATED e atualizar a lista
    de senhas aguardando sem recarregar a página.

-   A TV deve escutar TICKET_CALLED e atualizar o display imediatamente.

-   Implementar reconexão automática com intervalo crescente: 1s, 2s,
    4s, 8s, máximo 30s.

**5. Especificação das Telas**

**5.1 Painel Geral do Atendente**

Rota: /atendente \| Acesso: requer login + guichê selecionado

  -----------------------------------------------------------------------
  **Funcionalidade**   **Comportamento esperado**
  -------------------- --------------------------------------------------
  Login no guichê      Atendente seleciona seu guichê ao logar. Sistema
                       valida que não há outro atendente ativo no guichê.
                       Erro claro se guichê ocupado.

  Chamar próxima senha Chama a senha mais antiga com status AGUARDANDO
                       (FIFO). Emite broadcast WS TICKET_CALLED.

  Chamar senha         Seleciona aleatoriamente qualquer senha
  aleatória            AGUARDANDO. Registra call_type = RANDOM.

  Iniciar atendimento  Muda status para EM_ATENDIMENTO. Registra
                       started_at.

  Finalizar            Muda status para FINALIZADA. Registra finished_at
  atendimento          e duração.

  Marcar não           Muda status para NAO_COMPARECEU. Libera fila para
  compareceu           próxima.

  Histórico de         Painel lateral mostra últimas senhas chamadas e
  chamadas             qual atendente chamou cada uma.

  Atualização          Via WebSocket --- lista de senhas aguardando
  automática           atualiza automaticamente ao receber
                       TICKET_CREATED. NÃO usar polling/refresh de
                       página.
  -----------------------------------------------------------------------

**5.2 Chamada de Senha (TV)**

Rota: /tv \| Acesso: público (sem autenticação)

  -----------------------------------------------------------------------
  **Elemento**         **Especificação**
  -------------------- --------------------------------------------------
  Senha em destaque    Fonte mínima 200px, centralizado, cor de alto
                       contraste. Ex.: \'C042\'

  Guichê               Exibir junto à senha: \'Guichê G05\'. Fonte mínima
                       120px.

  Alerta sonoro        Tocar som ao receber evento TICKET_CALLED via
                       WebSocket.

  Últimas chamadas     Listar as 5 últimas senhas chamadas (senha +
                       guichê + horário). Atualização via WS.

  Letras grandes       Toda a interface deve ser legível a pelo menos 5
                       metros de distância.

  Sem interação        Tela passiva, apenas exibe dados recebidos via
                       WebSocket.
  -----------------------------------------------------------------------

**5.3 Gerar Senhas (Recepção)**

Rota: /gerar \| Acesso: usuário autenticado com role ATTENDANT

  -----------------------------------------------------------------------
  **Funcionalidade**   **Especificação**
  -------------------- --------------------------------------------------
  Selecionar médico    Lista de médicos disponíveis exibida na tela.
                       Associar senha ao médico selecionado.

  Setor Cirurgia       Incluir setor \'Cirurgia\' como opção de tipo de
                       atendimento.

  Gerar senha          Criar registro no banco, retornar código (ex:
                       C043), emitir WS TICKET_CREATED.

  Imprimir             Enviar dados para impressora Epson via ESC/POS.
                       Imprimir: código da senha, data/hora,
                       médico/setor, número na fila.

  Feedback visual      Exibir senha gerada na tela por 5 segundos após
                       impressão.
  -----------------------------------------------------------------------

**5.4 Estatísticas (Admin)**

Rota: /admin/estatisticas \| Acesso: role ADMIN

  -----------------------------------------------------------------------
  **Métrica**             **Detalhamento**
  ----------------------- -----------------------------------------------
  Tempo de atendimento    Média, mínimo e máximo por dia/semana/mês.
                          Filtro por período.

  Ranking de chamadas     Lista de usuários ordenada por quantidade de
                          senhas chamadas no período.

  Tempo por atendente     Tempo médio de atendimento individual de cada
                          usuário.

  Tipos de senha mais     Gráfico de pizza ou barras: atendimento vs.
  chamados                apoio vs. cirurgia.

  Senhas não comparecidas Total e percentual de NAO_COMPARECEU por
                          período.
  -----------------------------------------------------------------------

**6. Integração com Impressora Epson (ESC/POS)**

-   Usar a biblioteca python-escpos para comunicação com a impressora.

-   Adicionar python-escpos ao requirements.txt.

-   Criar serviço print_service.py com função print_ticket(ticket_data)
    que formata e imprime o ticket.

-   Conteúdo do ticket impresso: Nome da clínica, data e hora, código da
    senha (fonte grande), médico/setor, número na fila, rodapé
    institucional.

-   Tratar erros de impressora (offline, papel acabando) e retornar
    mensagem de erro clara ao frontend sem derrubar o sistema.

-   Configurar a porta/IP da impressora via variável de ambiente
    PRINTER_ADDRESS no config.py.

**7. Autenticação e Segurança**

-   Usar JWT (python-jose) com expiração configurável via variável de
    ambiente (padrão: 8 horas).

-   Senhas de usuários armazenadas com bcrypt (passlib\[bcrypt\]).

-   Dois papéis: ATTENDANT (acesso às telas operacionais) e ADMIN
    (acesso a estatísticas e gestão de usuários).

-   Middleware FastAPI para verificar JWT em todas as rotas protegidas.

-   Endpoint de login retorna access_token. Frontend armazena no
    localStorage com chave \'ccc_token\'.

-   Rota /tv é pública (sem autenticação) pois é exibida em TV.

-   Rota /gerar requer autenticação, mas não requer guichê ativo.

**8. Plano de Entregas --- Sprints**

  ----------------------------------------------------------------------------
  **Sprint**    **Duração**   **Entregáveis**
  ------------- ------------- ------------------------------------------------
  Sprint 1 ---  5 dias        Estrutura do projeto, modelos de banco,
  Base                        migrations, CRUD de senhas, autenticação JWT,
                              testes unitários do queue_service.py

  Sprint 2 ---  5 dias        Servidor WebSocket, hook useWebSocket no React,
  WebSocket +                 tela do atendente completa, login no guichê,
  Atendente                   chamar/iniciar/finalizar atendimento

  Sprint 3 ---  4 dias        Tela TV com display em destaque e som, tela de
  TV + Gerar                  geração de senhas, listagem de médicos,
  Senhas                      integração impressora Epson

  Sprint 4 ---  4 dias        Tela de estatísticas, dashboard admin, gestão de
  Admin +                     usuários, ajustes de UX, testes de integração
  Ajustes                     

  Sprint 5 ---  3 dias        Testes em ambiente real (Windows desktop + TVs
  Homologação                 HDMI), ajuste de fontes para TV, validação com
                              usuários, documentação de deploy
  ----------------------------------------------------------------------------

**9. Precauções e Pontos de Atenção**

**9.1 Concorrência**

-   Usar transações de banco com SELECT FOR UPDATE (ou equivalente
    SQLite) ao gerar e chamar senhas para evitar condição de corrida
    entre múltiplos atendentes.

-   Implementar lock por guichê no login para evitar dois atendentes
    logando no mesmo guichê simultaneamente.

**9.2 Performance das TVs**

-   Testar a latência do WebSocket com 4 TVs conectadas simultaneamente.

-   O servidor Windows desktop deve ter o FastAPI rodando como serviço
    (usar NSSM ou Task Scheduler) para sobreviver a reboots.

-   Configurar CORS para permitir apenas origens internas (IP da rede
    local da clínica).

**9.3 Migração SQLite → PostgreSQL**

-   Manter a connection string em variável de ambiente DATABASE_URL.

-   Dev/teste: DATABASE_URL=sqlite:///./senhas.db

-   Produção: DATABASE_URL=postgresql://user:pass@localhost/senhas_ccc

-   Não usar nenhuma feature exclusiva do SQLite. Testar queries no
    PostgreSQL antes do go-live.

**9.4 Reinício Diário do Contador**

-   Implementar um scheduler (APScheduler ou Celery Beat) para zerar o
    contador de senhas à meia-noite.

-   Alternativamente, calcular o código da senha com base na contagem de
    senhas do dia atual ao invés de um contador global.

**10. Checklist de Entrega Final**

  -----------------------------------------------------------------------
  **Item**                      **Critério de aceite**
  ----------------------------- -----------------------------------------
  Senhas únicas por dia         Impossível criar duas senhas com o mesmo
                                código no mesmo dia

  Login duplo bloqueado         Erro claro ao tentar logar no mesmo
                                guichê que outro atendente

  Atualização em tempo real     Nova senha aparece no painel do atendente
                                em menos de 1 segundo via WS

  TV legível                    Senha e guichê visíveis a 5 metros de
                                distância

  Som na TV                     Alerta sonoro ao chamar senha

  Impressão Epson               Ticket impresso com todos os campos em
                                menos de 3 segundos

  Estatísticas                  Todos os 4 indicadores funcionando com
                                dados reais

  Troca SQLite→PG               Sistema funciona sem alteração de código,
                                apenas mudando DATABASE_URL

  Logs de atendimento           Todo atendimento registrado com
                                atendente, guichê, duração e outcome

  Deploy Windows                Instruções de instalação e início
                                automático como serviço
  -----------------------------------------------------------------------

*Sistema de Senhas CCC · Versão 1.0 · Plano de Ação*