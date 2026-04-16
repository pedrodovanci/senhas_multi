# Senhas Multi

Este é um sistema completo de gerenciamento de filas e atendimento, composto por um backend em Node.js e um frontend em React. O sistema suporta emissão de senhas, chamadas por painel de TV, terminais de atendimento e administração.

## 🚀 Como Iniciar

O projeto é dividido em `server` (backend) e `client` (frontend). É necessário iniciar ambos os serviços simultaneamente.

### 1. Iniciar o Backend (Servidor)

Abra um terminal na pasta raiz do projeto e execute:

```bash
cd server
npm install
npm run dev
```

O servidor iniciará na porta **3000** (http://localhost:3000).
*O banco de dados SQLite será criado automaticamente na primeira execução.*

### 2. Iniciar o Frontend (Cliente)

Abra **outro** terminal na pasta raiz do projeto e execute:

```bash
cd client
npm install
npm run dev
```

O frontend iniciará geralmente na porta **5173** (http://localhost:5173), ou outra disponível indicada no terminal.

---

## 🔗 URLs do Sistema

Após iniciar o frontend, você pode acessar as seguintes rotas no navegador:

| Módulo | URL (Exemplo) | Descrição |
|---|---|---|
| **Login** | `/login` | Tela de autenticação para atendentes e administradores. |
| **Recepção / Totem** | `/recepcao/consultas` | Interface para o paciente retirar sua senha (Consultas/Outros). |
| **Terminal do Atendente** | `/atendente` | Painel para chamar senhas, visualizar fila e histórico. |
| **Painel de TV** | `/painel` | Exibição pública das senhas chamadas (com alerta sonoro). |
| **Display (Layout alternativo)** | `/display` | Exibição pública das senhas chamadas (layout alternativo). |
| **Administração** | `/admin` | Dashboard para gerenciar usuários, médicos e estatísticas. |

---

## 👤 Usuários Padrão

O banco de dados é inicializado com os seguintes usuários para testes:

| Usuário | Senha | Perfil |
|---|---|---|
| `admin` | `admin` | Administrador |
| `atendente1` | `1234` | Atendente |
| `atendente2` | `1234` | Atendente |
| `atendente` | `123456` | Atendente |

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React, Vite, Tailwind CSS, Lucide Icons, React Router DOM.
- **Backend:** Node.js, Express, SQLite, WebSocket (ws).
- **Comunicação:** API REST e WebSocket para atualizações em tempo real (chamadas de senha, atualizações de fila).

## 📝 Notas Importantes

- **Banco de Dados:** O sistema utiliza um arquivo local `database.sqlite` dentro da pasta `server`. Se precisar resetar o banco, basta apagar este arquivo e reiniciar o servidor.
- **Impressão:** O sistema pode imprimir senhas quando configurado (via impressora em rede no backend e/ou via agente opcional `print-agent`). Ele também funciona sem impressora (apenas gerando a senha na tela).
- **Áudio:** O Painel de TV toca um alerta sonoro ao chamar uma senha. Alguns navegadores bloqueiam autoplay; por isso pode ser necessário clicar no botão “Clique para ativar o som”.
