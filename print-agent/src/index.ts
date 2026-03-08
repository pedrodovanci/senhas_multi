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

  ws.on('message', async (raw: any) => {
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

try {
  tray = createTrayIcon();
} catch (e) {
  console.log('[Agente] Rodando sem bandeja do sistema (provavelmente ambiente de desenvolvimento)');
}

connect();
