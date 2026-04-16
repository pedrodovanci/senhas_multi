import fs from 'fs';
import path from 'path';

export interface Config {
  server_url: string;
  workstation_id: number;
  printer_port: string;
  printer_vendor_id: string;
  printer_product_id: string;
  printer_host?: string;
  printer_network_port?: number;
  printer_mode?: "usb" | "network";
  reconnect_interval_ms: number;
}

export const loadConfig = (): Config => {
  // Tenta carregar config.json do diretório atual ou do diretório do executável
  const configPaths = [
    path.join(process.cwd(), 'config.json'),
    path.join(path.dirname(process.execPath), 'config.json'),
    path.join(__dirname, '../config.json')
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.error(`Erro ao ler config de ${configPath}:`, err);
      }
    }
  }

  // Fallback default
  console.warn('Arquivo config.json não encontrado. Usando padrões.');
  return {
    server_url: "ws://localhost:3000",
    workstation_id: 1,
    printer_port: "USB001",
    printer_vendor_id: "0x04b8",
    printer_product_id: "0x0202",
    printer_mode: "usb",
    reconnect_interval_ms: 3000
  };
};
