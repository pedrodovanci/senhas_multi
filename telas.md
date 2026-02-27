Gostaria de gerar as telas para um Sistema de Gestão de Atendimentoweb para uma clínica médica chamada "Centro do Cérebro e Coluna". O sistema deve ser moderno, limpo e responsivo.

**Paleta de Cores:** #0097b2 (Azul Principal), #7ed957 (Verde Claro), #8baf3f (Verde Médio), #b0cf53 (Verde Lima) e #ffffff (Branco).
**Logo:** Deixe um espaço reservado no topo esquerdo de todas as telas para a logo da clínica.

O sistema possui diferentes módulos baseados na URL e no usuário. Preciso das seguintes 4 telas principais:

---
### TELA 0: Login e Seleção de Posto de Trabalho

URL: /login
Usuário: Atendente ou Administrador.
Objetivo: Autenticar o usuário e definir em qual guichê/sala ele operará durante a sessão.

Elementos:

Card Central de Login:

Espaço para a Logo do "Centro do Cérebro e Coluna".
Campo de Texto: "Usuário" (vinculado à tabela users).
Campo de Texto: "Senha" (tipo password).
Seleção de Local (Workstation):
Dropdown (Menu de seleção): "Selecione seu Guichê/Sala".
Este campo deve listar as opções da tabela workstations (ex: Guichê 01, Guichê 02, Sala de Triagem).

Botão de Ação:
Botão "ENTRAR NO SISTEMA" em destaque com a cor #0097b2.

Estética:
Fundo limpo (cinza muito claro ou branco).

O card de login deve ter bordas arredondadas e uma sombra suave.
### TELA 1: Geração de Senha (Recepção Consultas)
**URL:** `/recepcao/consultas`
**Usuário:** Atendente (Uso Desktop)
**Objetivo:** O atendente seleciona para qual médico o paciente deseja atendimento para gerar uma senha.
**Elementos:**
1.  Título: "Gerar Senha - Consultas".
2.  Uma lista ou grade de botões grandes, um para cada médico disponível (Ex: "Dr. João Silva", "Dra. Maria Souza", "Dr. Carlos Rocha").
3.  Ao clicar no nome do médico, o sistema deve confirmar a geração da senha.

---
### TELA 2: Terminal do Atendente (A tela mais importante)
**URL:** `/atendente`
**Usuário:** Atendente (Uso Desktop)
**Objetivo:** Painel de controle operacional para chamar e gerenciar pacientes.

**Layout Principal:**
1.  **Barra Superior:** Mostra o nome do atendente logado e o número do guichê atual.
2.  **Área de Atendimento Atual (Destaque):**
    * Mostra a senha que está sendo atendida no momento (Ex: "Em atendimento: C005").
    * Botões de ação para esta senha: "INICIAR ATENDIMENTO", "FINALIZAR", "NÃO COMPARECEU" e "RE-CHAMAR" (chamar novamente na TV).
    * Um cronômetro mostrando o tempo do atendimento atual.
3.  **Visão Geral das Filas (Crucial):**
    * Cards separados para cada fila/médico (Ex: Card "Dr. João", Card "Dra. Maria").
    * Dentro de cada card:
        * Quantidade de senhas aguardando naquela fila.
        * Tempo de espera da próxima senha da fila.
        * **Um botão "CHAMAR PRÓXIMA" específico dentro de cada card.**
4.  **Botão de Chamada Específica:**
    * Um botão ou link secundário "Visualizar Lista Completa / Chamada Específica".
    * Ao clicar, deve abrir uma modal ou lista mostrando todas as senhas em espera (Número, Nome da Fila, Tempo de Espera), permitindo que o atendente clique em *qualquer* senha para chamá-la fora da ordem.
5. **Indicador visual da senha atualmente em chamada, diferente das demais.
6. **Indicação visual clara quando não houver senha em atendimento.
---

### TELA 4: Painel de TV (Sala de Espera)
**URL:** `/painel`
**Usuário:** Visualização Pública (TV Full HD)
**Objetivo:** Exibir a senha chamada de forma clara e o histórico.

**Layout:**
1.  **Área Principal (Destaque Gigante):**
    * A última senha chamada (Ex: "SENHA: A054").
    * O local para onde se dirigir (Ex: "GUICHÊ 09" ou "SALA 2").
    * Use cores contrastantes para chamar atenção (ex: fundo azul com texto branco ou amarelo).
2.  **Barra Lateral ou Inferior (Histórico):**
    * Lista das últimas 4 ou 5 senhas chamadas anteriormente (Senha + Guichê + Hora).
3.  **Rodapé:** Espaço para notícias ou mensagens institucionais (ticker).
4. **Quando uma nova senha for chamada, destacar visualmente com animação suave.
---

### TELA 5: Admin (Dashboard e Estatísticas)
**URL:** `/admin`
**Usuário:** Gestor/Administrador (Uso Desktop)
**Objetivo:** Visão gerencial da clínica.

**Elementos:**
1.  Menu lateral para cadastro (Usuários, Médicos/Serviços, Guichês).
2.  **Dashboard de Métricas (Gráficos e Cards):**
    * Cards com totais do dia: "Total de Senhas", "Tempo Médio de Espera (TME)", "Tempo Médio de Atendimento (TMA)".
    * Gráfico de barras: "Senhas atendidas por Atendente".
    * Gráfico de linha: "Fluxo de pacientes por hora do dia".
    * Filtros de data no topo (Hoje, Ontem, Últimos 7 dias, Mês atual).

### Estados da Interface (Importante)

Todas as telas devem considerar diferentes estados de uso:

Estado vazio:
- Exibir mensagem amigável quando não houver senhas na fila
- Exemplo: "Nenhum paciente aguardando"

Estado carregando:
- Mostrar indicador de carregamento (spinner ou skeleton)

Estado ativo:
- Mostrar dados reais normalmente

Estado de confirmação:
- Ao gerar senha, mostrar modal com a senha gerada em destaque
- Exemplo:
  SENHA GERADA
  C045

Estado de erro:
- Mostrar mensagem clara se ocorrer falha de comunicação