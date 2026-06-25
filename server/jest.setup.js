// Desabilita a impressao ESC/POS real durante os testes, ANTES de qualquer
// modulo (index.ts) chamar dotenv.config() e carregar PRINTER_HOST/PRINTER_ENABLED
// do .env real. dotenv.config() nao sobrescreve variaveis ja definidas em
// process.env, entao isso vence o valor do .env.
process.env.PRINTER_ENABLED = "false";
