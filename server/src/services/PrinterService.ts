import { Socket } from 'net';

export interface IPrinter {
  printTicket(ticket: any): Promise<void>;
}

export class ConsolePrinter implements IPrinter {
  async printTicket(ticket: any): Promise<void> {
    console.log('--------------------------------');
    console.log('         CENTRO DO CEREBRO      ');
    console.log('             E COLUNA           ');
    console.log('--------------------------------');
    console.log(`SENHA: ${ticket.number}`);
    console.log(`TIPO:  ${ticket.type.toUpperCase()}`);
    console.log(`DATA:  ${new Date().toLocaleString()}`);
    console.log('--------------------------------');
    console.log('Aguarde ser chamado no painel.');
    console.log('--------------------------------');
  }
}

export class NetworkPrinter implements IPrinter {
  private host: string;
  private port: number;

  constructor(host: string, port: number = 9100) {
    this.host = host;
    this.port = port;
  }

  async printTicket(ticket: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new Socket();
      
      client.connect(this.port, this.host, () => {
        // ESC/POS Commands
        const ESC = '\x1b';
        const GS = '\x1d';
        const LF = '\x0a';
        
        const commands = [
          ESC + '@', // Initialize
          ESC + 'a' + '\x01', // Center align
          ESC + '!' + '\x38', // Double height & width
          'CENTRO DO CEREBRO\n',
          'E COLUNA\n',
          ESC + '!' + '\x00', // Normal font
          '--------------------------------\n',
          ESC + '!' + '\x38', // Double height & width
          `SENHA: ${ticket.number}\n`,
          ESC + '!' + '\x00', // Normal font
          `TIPO: ${ticket.type.toUpperCase()}\n`,
          `DATA: ${new Date().toLocaleString()}\n`,
          '--------------------------------\n',
          'Aguarde ser chamado no painel.\n',
          LF, LF, LF, // Feed lines
          GS + 'V' + '\x41' + '\x00', // Cut paper
        ].join('');

        client.write(commands, () => {
          client.end();
          resolve();
        });
      });

      client.on('error', (err) => {
        console.error('Printer error:', err);
        reject(err);
      });
    });
  }
}
