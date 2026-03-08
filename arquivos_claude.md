### 1. Criação de Senhas (Agendamento Cirúrgico / Outros)
A lógica está dividida entre o Frontend (tela onde clica no botão) e o Backend (onde a senha é gravada no banco).

- Frontend (Tela de Recepção): Reception.tsx Aqui ficam os botões que enviam o tipo "outros" e o subtipo "agendamento_cirurgico" ou "apoio".

// Trecho de d:\sistema_de_senhas\client\src\pages\Reception.tsx
<button
  onClick={() => generateTicket(null, 'agendamento_cirurgico')} // Envia subtipo aqui
  disabled={loading}
  className="..."
>
  <Scissors className="w-10 h-10 text-secondary" />
  <span className="text-lg font-bold text-gray-800">Agendamento Cirúrgico</span>
</button>

Backend (API de Criação): index.ts Aqui o servidor recebe o pedido e cria a senha no banco de dados.

// Trecho de d:\sistema_de_senhas\server\src\index.ts
app.post("/api/tickets", verifyToken, async (req, res) => {
  const { doctor_id, type, subtype } = req.body; // Recebe o subtype aqui

  // Define prefixo (Modificado recentemente para suportar AP)
  let prefix = type === "outros" ? "O" : "C";
  if (subtype === "apoio") { prefix = "AP"; }

  // ... lógica de numeração e inserção no banco
});

### 2. Tela do Atendente (Onde as senhas aparecem)
O arquivo principal da tela do atendente é o Attendant.tsx .
Ele usa um componente interno chamado DoctorQueueGrid (linha 515) para listar as filas de espera.

- Arquivo Principal: Attendant.tsx

// Trecho de d:\sistema_de_senhas\client\src\pages\Attendant.tsx
<main className="flex-1 p-6 overflow-hidden">
  {/* Área Principal: Grid de Médicos/Filas */}
  <div className="h-full overflow-y-auto pb-20">
    <DoctorQueueGrid
      onCall={handleCallNext}
      disabled={loading || !!currentTicket}
      refreshTrigger={refreshTrigger}
    />
  </div>
</main>

### 3. Banco de Dados / Modelo
A estrutura da senha é definida no banco de dados (SQLite) e tipada no TypeScript para o Frontend.

- Estrutura do Banco (Schema): database.ts

// Trecho de d:\sistema_de_senhas\server\src\database.ts
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT, -- Ex: C001, O001, AP001
  type TEXT CHECK(type IN ('consulta', 'outros')),
  subtype TEXT, -- Aqui fica 'agendamento_cirurgico' ou 'apoio'
  doctor_id INTEGER,
  status TEXT DEFAULT 'waiting',
  // ... outros campos
);

Modelo TypeScript (Interface): types.ts

// Trecho de d:\sistema_de_senhas\client\src\types.ts
export interface Ticket {
  id: number;
  number: string;
  status: "waiting" | "calling" | "in_attendance" | "finished" | "missed";
  type: "consulta" | "cirurgia"; // Nota: O tipo 'outros' não está explícito aqui, pode precisar atualizar
  doctor_id: number;
  // ...
}