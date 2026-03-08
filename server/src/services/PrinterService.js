"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkPrinter = exports.WindowsPrinter = exports.ConsolePrinter = void 0;
const net_1 = require("net");
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
class ConsolePrinter {
    printTicket(ticket) {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
}
exports.ConsolePrinter = ConsolePrinter;
class WindowsPrinter {
    printTicket(ticket) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const text = `
CENTRO DO CEREBRO E COLUNA
--------------------------------
SENHA: ${ticket.number}
TIPO:  ${ticket.type.toUpperCase()}
DATA:  ${new Date().toLocaleString()}
--------------------------------
Aguarde ser chamado no painel.
--------------------------------
      `;
                const tempPath = path_1.default.join(os_1.default.tmpdir(), `ticket-${ticket.number}.txt`);
                try {
                    fs_1.default.writeFileSync(tempPath, text);
                    // Use PowerShell to print to default printer
                    const command = `powershell -Command "Get-Content '${tempPath}' | Out-Printer"`;
                    (0, child_process_1.exec)(command, (error, stdout, stderr) => {
                        // Cleanup
                        try {
                            fs_1.default.unlinkSync(tempPath);
                        }
                        catch (e) { }
                        if (error) {
                            console.error('Windows print error:', error);
                            reject(error);
                        }
                        else {
                            resolve();
                        }
                    });
                }
                catch (err) {
                    reject(err);
                }
            });
        });
    }
}
exports.WindowsPrinter = WindowsPrinter;
class NetworkPrinter {
    constructor(host, port = 9100) {
        this.host = host;
        this.port = port;
    }
    printTicket(ticket) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const client = new net_1.Socket();
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
        });
    }
}
exports.NetworkPrinter = NetworkPrinter;
