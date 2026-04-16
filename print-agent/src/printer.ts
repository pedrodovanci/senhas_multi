import escpos from 'escpos';
import USB from 'escpos-usb';
import net from 'net';
import { loadConfig } from './config';

// Force USB adapter usage since we know it's USB
escpos.USB = USB;

const config = loadConfig();

const resolvePrintMode = () => {
  if (config.printer_mode) return config.printer_mode;
  if (config.printer_host) return 'network';
  return 'usb';
};

const formatTypeLabel = (ticket: any) => {
  const label = ticket?.subtype
    ? String(ticket.subtype).replace(/_/g, ' ')
    : String(ticket?.type || 'consulta');
  return label.toUpperCase();
};

const buildEscPosPayload = (ticket: any) => {
  const now = new Date().toLocaleString('pt-BR');
  const sep = '--------------------------------';
  const lines: Array<string | Buffer> = [];

  lines.push(Buffer.from([0x1b, 0x40])); // ESC @ init
  lines.push(Buffer.from([0x1b, 0x61, 0x01])); // ESC a 1 (center)
  lines.push(Buffer.from([0x1b, 0x45, 0x01])); // ESC E 1 (bold on)
  lines.push('Centro do Cerebro e Coluna\n');
  lines.push(Buffer.from([0x1b, 0x45, 0x00])); // bold off
  lines.push('Sistema de Atendimento\n');
  lines.push(`${sep}\n\n`);

  lines.push(Buffer.from([0x1b, 0x45, 0x01])); // bold on
  lines.push('SENHA\n');
  lines.push(Buffer.from([0x1d, 0x21, 0x22])); // GS ! (3x width/height)
  lines.push(`${ticket.number}\n`);
  lines.push(Buffer.from([0x1d, 0x21, 0x00])); // normal size
  lines.push(Buffer.from([0x1b, 0x45, 0x00])); // bold off
  lines.push('\n');
  lines.push(Buffer.from([0x1b, 0x45, 0x01])); // bold on
  lines.push(`${formatTypeLabel(ticket)}\n`);
  lines.push(Buffer.from([0x1b, 0x45, 0x00])); // bold off
  lines.push('\n');

  if (ticket.doctor_name) {
    lines.push(`${ticket.doctor_name}\n`);
  }

  lines.push(`${sep}\n`);
  lines.push(`${now}\n\n`);
  lines.push('Aguarde ser chamado no painel.\n');
  lines.push('Obrigado pela preferencia.\n\n\n');
  lines.push(Buffer.from([0x1d, 0x56, 0x41, 0x00])); // GS V A 0 (cut)

  return Buffer.concat(
    lines.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : p)),
  );
};

const printViaNetwork = (ticket: any): Promise<void> => {
  return new Promise((resolve) => {
    const host = config.printer_host;
    const port = Number(config.printer_network_port ?? 9100);

    if (!host) return resolve();

    const payload = buildEscPosPayload(ticket);
    const socket = net.createConnection({ host, port }, () => {
      socket.write(payload);
      socket.end();
    });

    socket.on('error', (err) => {
      console.error('[Printer] Erro ao imprimir via rede:', err.message);
      resolve();
    });

    socket.on('close', () => resolve());
  });
};

const printViaUsb = (ticket: any): Promise<void> => {
  return new Promise((resolve) => {
    try {
      const vid = parseInt(config.printer_vendor_id, 16);
      const pid = parseInt(config.printer_product_id, 16);

      const device = new USB(vid, pid);
      const printer = new escpos.Printer(device);

      device.open((err: Error | null) => {
        if (err) {
          console.error('[Printer] Impressora não encontrada:', err.message);
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
          .text(formatTypeLabel(ticket))
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
      resolve();
    }
  });
};

export const printTicket = (ticket: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const mode = resolvePrintMode();
      const job = mode === 'network' ? printViaNetwork(ticket) : printViaUsb(ticket);
      job.then(resolve).catch(() => resolve());
    } catch (err) {
      console.error('[Printer] Erro inesperado:', err);
      resolve(); // Nunca rejeitar — não bloquear o fluxo
    }
  });
};
