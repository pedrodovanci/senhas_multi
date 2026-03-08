# Arquitetura de Impressão — Agente Local ESC/POS

> Decisão: impressora Epson conectada via USB em 1 PC da recepção. O sistema web roda em servidor separado. A impressão é feita por um agente local instalado no PC da recepção.

---

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        REDE LOCAL DA CLÍNICA                    │
│                                                                 │
│  ┌──────────────────┐    WebSocket    ┌────────────────────┐   │
│  │  SERVIDOR        │ ◄────────────── │  PC DA RECEPÇÃO    │   │
│  │  (Windows)       │                 │                    │   │
│  │  FastAPI/Node    │ ──────────────► │  Navegador Chrome  │   │
│  │  porta 3000      │   ticket:created│  /recepcao/consultas│   │
│  └──────────────────┘                 │                    │   │
│                                       │  Agente Local .exe │   │
│                                       │  (roda em background)  │
│                                       │        │           │   │
│                                       └────────┼───────────┘   │
│                                                │ USB            │
│                                       ┌────────▼───────────┐   │
│                                       │  IMPRESSORA EPSON  │   │
│                                       │  (térmica)         │   │
│                                       └────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Fluxo completo:**
1. Recepcionista clica no médico
2. Servidor cria a senha e faz broadcast ticket:created
3. Agente recebe o evento
4. Agente imprime — sem verificação nenhuma

---

## O que é o Agente Local

Um executável `.exe` simples desenvolvido em **Node.js + pkg** (para gerar o `.exe` sem precisar instalar Node no PC da recepção). Ele:

- Roda em background ao iniciar o Windows (via Task Scheduler ou pasta Startup)
- Abre uma conexão WebSocket permanente com o servidor
- Escuta apenas o evento `ticket:created`
- Compara o `workstation_id` do ticket com o ID configurado localmente
- Se corresponder: imprime via ESC/POS na porta USB

O agente **não tem interface gráfica** — aparece apenas na bandeja do sistema (system tray) com um ícone de status (verde = conectado, vermelho = sem conexão com servidor).

---

## Estrutura do Projeto do Agente

Criar como projeto separado dentro do repositório:

```
sistema-senhas/
├── backend/          ← já existe
├── frontend/         ← já existe
└── print-agent/      ← NOVO
    ├── src/
    │   ├── index.ts          ← ponto de entrada, conexão WebSocket
    │   ├── printer.ts        ← comunicação ESC/POS com a Epson
    │   ├── config.ts         ← lê configurações do config.json
    │   └── tray.ts           ← ícone na bandeja do sistema
    ├── config.json           ← configuração local do posto
    ├── package.json
    └── README-instalacao.txt ← instruções para a clínica
```

---

## Arquivo de Configuração (`config.json`)

Este arquivo fica no PC da recepção e define qual posto ele representa e como se conectar ao servidor:

```json
{
  "server_url": "ws://192.168.0.130:3000",
  "workstation_id": 1,
  "printer_port": "USB001",
  "printer_vendor_id": "0x04b8",
  "printer_product_id": "0x0202",
  "reconnect_interval_ms": 3000
}
```

| Campo | Descrição |
|---|---|
| `server_url` | IP do servidor na rede local + porta WebSocket |
| `workstation_id` | ID do posto de trabalho no banco (deve corresponder ao Guichê da recepcionista) |
| `printer_port` | Porta USB da impressora (verificar no Gerenciador de Dispositivos do Windows) |
| `printer_vendor_id` | Vendor ID da Epson (padrão: `0x04b8`) |
| `printer_product_id` | Product ID do modelo específico (verificar na documentação da impressora) |
| `reconnect_interval_ms` | Intervalo de reconexão se perder conexão com o servidor |

---

## Código do Agente (`src/index.ts`)

```typescript
import WebSocket from 'ws';
import { printTicket } from './printer';
import { loadConfig } from './config';
import { createTrayIcon } from './tray';

const config = loadConfig();
let ws: WebSocket;
let tray: any;

const connect = () => {
  console.log(`[Agente] Conectando ao servidor: ${config.server_url}`);
  ws = new WebSocket(config.server_url);

  ws.on('open', () => {
    console.log('[Agente] Conectado ao servidor.');
    tray?.setStatus('connected');
  });

  ws.on('message', async (raw: string) => {
    try {
      const { type, data } = JSON.parse(raw.toString());

      if (type !== 'ticket:created') return;

      // Verificar se o ticket pertence a ESTE posto de trabalho
      // O evento ticket:created não tem workstation_id (ainda não foi chamado),
      // então o agente imprime TODOS os tickets criados.
      // Se no futuro houver múltiplos postos de impressão, filtrar por workstation_id aqui.
      console.log(`[Agente] Novo ticket recebido: ${data.number} — Imprimindo...`);

      await printTicket(data);

      console.log(`[Agente] Ticket ${data.number} impresso com sucesso.`);
    } catch (err) {
      console.error('[Agente] Erro ao processar mensagem:', err);
    }
  });

  ws.on('close', () => {
    console.log('[Agente] Conexão perdida. Reconectando...');
    tray?.setStatus('disconnected');
    setTimeout(connect, config.reconnect_interval_ms);
  });

  ws.on('error', (err) => {
    console.error('[Agente] Erro WebSocket:', err.message);
    ws.terminate();
  });
};

tray = createTrayIcon();
connect();
```

---

## Código da Impressora (`src/printer.ts`)

Usar a biblioteca `escpos` + `escpos-usb`:

```typescript
import escpos from 'escpos';
import USB from 'escpos-usb';
import { loadConfig } from './config';

const config = loadConfig();

export const printTicket = (ticket: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const device = new USB(
        parseInt(config.printer_vendor_id),
        parseInt(config.printer_product_id)
      );

      const printer = new escpos.Printer(device);

      device.open((err: Error) => {
        if (err) {
          console.error('[Printer] Impressora não encontrada:', err.message);
          // NÃO rejeitar — apenas logar. A senha já foi gerada no sistema.
          return resolve();
        }

        const now = new Date().toLocaleString('pt-BR');

        printer
          .font('a')
          .align('ct')
          .style('b')
          .size(1, 1)
          .text('Centro do Cerebro e Coluna')
          .style('normal')
          .size(0, 0)
          .text('Sistema de Atendimento')
          .text('--------------------------------')
          .text('')
          .align('ct')
          .style('b')
          .size(0, 0)
          .text('SENHA')
          .size(3, 3)
          .text(ticket.number)
          .size(0, 0)
          .text('')
          .style('b')
          .text(ticket.type?.toUpperCase() || 'CONSULTA')
          .style('normal')
          .text('')
          .text(ticket.doctor_name || '')
          .text('--------------------------------')
          .size(0, 0)
          .text(now)
          .text('')
          .text('Aguarde ser chamado no painel.')
          .text('Obrigado pela preferencia.')
          .text('')
          .text('')
          .cut()
          .close(() => resolve());
      });

    } catch (err) {
      console.error('[Printer] Erro inesperado:', err);
      resolve(); // Nunca rejeitar — não bloquear o fluxo
    }
  });
};
```

---

## Dependências do Agente (`package.json`)

```json
{
  "name": "ccc-print-agent",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "pkg . --target node18-win-x64 --output dist/ccc-agente-impressao.exe"
  },
  "dependencies": {
    "escpos": "^3.0.0-alpha.6",
    "escpos-usb": "^3.0.0-alpha.6",
    "ws": "^8.0.0",
    "systray2": "^1.0.0"
  },
  "devDependencies": {
    "@types/ws": "^8.0.0",
    "pkg": "^5.8.0",
    "ts-node": "^10.0.0",
    "typescript": "^5.0.0"
  },
  "pkg": {
    "assets": ["config.json"],
    "targets": ["node18-win-x64"]
  }
}
```

---

## Geração do Executável

```bash
# No ambiente de desenvolvimento:
cd print-agent
npm install
npm run build

# Saída:
dist/ccc-agente-impressao.exe   ← este arquivo vai para o PC da recepção
config.json                      ← configurar antes de copiar
```

O arquivo `config.json` deve ser editado com o IP do servidor e os dados da impressora **antes** de copiar para o PC da recepção.

---

## Instalação no PC da Recepção

1. Copiar `ccc-agente-impressao.exe` e `config.json` para `C:\CCC\Agente\`
2. Editar o `config.json` com o IP do servidor e porta USB da impressora
3. Criar atalho do `.exe` na pasta de Inicialização do Windows:
   ```
   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
   ```
4. Testar: executar manualmente e verificar o ícone verde na bandeja
5. Gerar uma senha de teste no sistema e confirmar impressão

---

## Tratamento de Erros

| Situação | Comportamento |
|---|---|
| Impressora desligada ou sem papel | Agente loga o erro, **não bloqueia** a geração da senha |
| Servidor fora do ar | Agente tenta reconectar a cada 3 segundos, ícone fica vermelho |
| PC da recepção reiniciado | Agente inicia automaticamente pelo Startup do Windows |
| Agente não está rodando | Senha é gerada normalmente, apenas não imprime o papel |
| Ticket gerado enquanto agente estava offline | **Não imprime retroativamente** — apenas tickets recebidos em tempo real são impressos |

> **Nota sobre o último ponto:** Se o agente cair por alguns minutos e voltar, ele não vai reimprimir os tickets perdidos. Se isso for um problema operacional, pode ser adicionado um endpoint `GET /api/tickets/unprinted` que o agente consulta ao reconectar. Implementar apenas se necessário.

---

## Resumo

| Item | Detalhe |
|---|---|
| Linguagem do agente | Node.js + TypeScript |
| Distribuição | `.exe` gerado com `pkg` (sem instalar Node no PC) |
| Comunicação | WebSocket com o servidor (mesmo protocolo já usado pelo frontend) |
| Impressão | ESC/POS via USB com biblioteca `escpos` |
| Inicialização | Automática via pasta Startup do Windows |
| Impacto no sistema principal | Zero — o agente é completamente independente |

---

*Arquitetura de Impressão v1.0 — Sistema de Senhas CCC*
