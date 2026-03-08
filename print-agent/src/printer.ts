import escpos from 'escpos';
import USB from 'escpos-usb';
import { loadConfig } from './config';

// Force USB adapter usage since we know it's USB
escpos.USB = USB;

const config = loadConfig();

export const printTicket = (ticket: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const vid = parseInt(config.printer_vendor_id, 16);
      const pid = parseInt(config.printer_product_id, 16);

      const device = new USB(vid, pid);
      const printer = new escpos.Printer(device);

      device.open((err: Error | null) => {
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
