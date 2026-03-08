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
exports.startServer = exports.wss = exports.httpServer = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const database_1 = require("./database");
const auth_1 = require("./middleware/auth");
const PrinterService_1 = require("./services/PrinterService");
const app = (0, express_1.default)();
exports.app = app;
const httpServer = (0, http_1.createServer)(app);
exports.httpServer = httpServer;
const wss = new ws_1.WebSocketServer({ server: httpServer });
exports.wss = wss;
// Initialize Printer
const printerHost = process.env.PRINTER_HOST;
let printer;
if (printerHost) {
    printer = new PrinterService_1.NetworkPrinter(printerHost);
}
else if (process.platform === "win32") {
    printer = new PrinterService_1.WindowsPrinter();
}
else {
    printer = new PrinterService_1.ConsolePrinter();
}
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Helper to broadcast to all connected clients
const broadcast = (type, data) => {
    const message = JSON.stringify({ type, data });
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(message);
        }
    });
};
const startServer = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (listen = true) {
    const db = yield (0, database_1.initDb)();
    // Startup Cleanup: Reset stuck tickets
    const stuckTickets = yield db.all(`SELECT id, number, status FROM tickets 
     WHERE status IN ('calling', 'in_attendance')
     AND date(created_at) = date('now')`);
    if (stuckTickets.length > 0) {
        console.log(`[Startup] Found ${stuckTickets.length} stuck tickets. Returning to queue...`);
        yield db.run(`UPDATE tickets 
       SET status = 'waiting',
           workstation_id = NULL,
           called_by_user_id = NULL,
           called_at = NULL,
           started_at = NULL
       WHERE status IN ('calling', 'in_attendance')
       AND date(created_at) = date('now')`);
        stuckTickets.forEach((t) => {
            console.log(`[Startup] Ticket ${t.number} (${t.status}) returned to 'waiting'.`);
        });
    }
    // Release locked workstations
    yield db.run(`UPDATE workstations SET current_user_id = NULL, is_active = 0`);
    console.log("[Startup] Workstations released.");
    // --- API Routes ---
    // Login
    app.post("/api/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { username, password, workstation_id } = req.body;
        // Find user
        const user = yield db.get("SELECT * FROM users WHERE username = ?", [
            username,
        ]);
        if (!user) {
            return res
                .status(401)
                .json({ success: false, message: "Credenciais inválidas" });
        }
        // Compare password
        const match = yield bcrypt_1.default.compare(password, user.password);
        if (!match) {
            return res
                .status(401)
                .json({ success: false, message: "Credenciais inválidas" });
        }
        // Generate Token
        const token = (0, auth_1.generateToken)(user);
        // If workstation provided, check lock
        if (workstation_id) {
            const workstation = yield db.get("SELECT * FROM workstations WHERE id = ?", [workstation_id]);
            if (!workstation) {
                return res.status(404).json({
                    success: false,
                    message: "Posto de trabalho não encontrado",
                });
            }
            if (workstation.current_user_id &&
                workstation.current_user_id !== user.id) {
                return res.status(409).json({
                    success: false,
                    message: "Este posto de trabalho já está ocupado por outro usuário.",
                });
            }
            // Lock workstation
            yield db.run("UPDATE workstations SET current_user_id = ?, is_active = 1 WHERE id = ?", [user.id, workstation_id]);
            broadcast("workstation:updated", {
                id: workstation.id,
                current_user_id: user.id,
                is_active: 1,
            });
        }
        res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username, role: user.role },
        });
    }));
    app.post("/api/totem-login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { workstation_id } = req.body;
        if (!workstation_id) {
            return res.status(400).json({
                success: false,
                message: "Posto de trabalho obrigatório",
            });
        }
        const user = yield db.get("SELECT * FROM users WHERE username = 'totem'");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Usuário totem não encontrado",
            });
        }
        const workstation = yield db.get("SELECT * FROM workstations WHERE id = ?", [workstation_id]);
        if (!workstation) {
            return res.status(404).json({
                success: false,
                message: "Posto de trabalho não encontrado",
            });
        }
        if (workstation.current_user_id && workstation.current_user_id !== user.id) {
            return res.status(409).json({
                success: false,
                message: "Este posto de trabalho já está ocupado por outro usuário.",
            });
        }
        yield db.run("UPDATE workstations SET current_user_id = ?, is_active = 1 WHERE id = ?", [user.id, workstation_id]);
        broadcast("workstation:updated", {
            id: workstation.id,
            current_user_id: user.id,
            is_active: 1,
        });
        const token = (0, auth_1.generateToken)(user);
        res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username, role: user.role },
        });
    }));
    // Logout
    app.post("/api/logout", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { user_id, workstation_id } = req.body;
        if (workstation_id) {
            // Release workstation
            yield db.run("UPDATE workstations SET current_user_id = NULL, is_active = 0 WHERE id = ? AND current_user_id = ?", [workstation_id, user_id]);
            broadcast("workstation:updated", {
                id: workstation_id,
                current_user_id: null,
                is_active: 0,
            });
            // Auto-mark current tickets as 'missed' if in attendance? Or just leave them?
            // Plan says: "Senhas em EM_ATENDIMENTO naquele guichê devem ser marcadas como NAO_COMPARECEU automaticamente."
            yield db.run(`
            UPDATE tickets 
            SET status = 'missed', finished_at = CURRENT_TIMESTAMP 
            WHERE workstation_id = ? AND status = 'in_attendance'
          `, [workstation_id]);
        }
        res.json({ success: true });
    }));
    // Workstations
    app.get("/api/workstations", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const workstations = yield db.all("SELECT * FROM workstations");
        res.json(workstations);
    }));
    // Doctors
    app.get("/api/doctors", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const doctors = yield db.all("SELECT * FROM doctors");
        res.json(doctors);
    }));
    // Create Doctor
    app.post("/api/doctors", auth_1.verifyToken, auth_1.requireAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { name, specialization } = req.body;
        try {
            const result = yield db.run("INSERT INTO doctors (name, specialization) VALUES (?, ?)", [name, specialization]);
            const newDoctor = yield db.get("SELECT * FROM doctors WHERE id = ?", [
                result.lastID,
            ]);
            res.json(newDoctor);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }));
    // Update Doctor
    app.put("/api/doctors/:id", auth_1.verifyToken, auth_1.requireAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = req.params;
        const { name, specialization } = req.body;
        try {
            yield db.run("UPDATE doctors SET name = ?, specialization = ? WHERE id = ?", [name, specialization, id]);
            res.json({ id, name, specialization });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }));
    // Delete Doctor
    app.delete("/api/doctors/:id", auth_1.verifyToken, auth_1.requireAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            yield db.run("DELETE FROM doctors WHERE id = ?", [id]);
            res.json({ message: "Deleted" });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }));
    // Users
    app.get("/api/users", auth_1.verifyToken, auth_1.requireAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const users = yield db.all("SELECT id, username, role, active FROM users");
        res.json(users);
    }));
    // Create User
    app.post("/api/users", auth_1.verifyToken, auth_1.requireAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { username, password, role } = req.body;
        try {
            const hashedPassword = yield bcrypt_1.default.hash(password, 10);
            const result = yield db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, hashedPassword, role]);
            const newUser = yield db.get("SELECT id, username, role, active FROM users WHERE id = ?", [result.lastID]);
            res.json(newUser);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }));
    // Update User
    app.put("/api/users/:id", auth_1.verifyToken, auth_1.requireAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = req.params;
        const { username, password, role, active } = req.body;
        try {
            if (password && password.trim() !== "") {
                const hashedPassword = yield bcrypt_1.default.hash(password, 10);
                yield db.run("UPDATE users SET username = ?, password = ?, role = ?, active = ? WHERE id = ?", [username, hashedPassword, role, active, id]);
            }
            else {
                yield db.run("UPDATE users SET username = ?, role = ?, active = ? WHERE id = ?", [username, role, active, id]);
            }
            res.json({ id, username, role, active });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }));
    // Delete User
    app.delete("/api/users/:id", auth_1.verifyToken, auth_1.requireAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            yield db.run("DELETE FROM users WHERE id = ?", [id]);
            res.json({ message: "Deleted" });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }));
    // Tickets List
    app.get("/api/tickets", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { status, queue_sector } = req.query;
        let query = `
      SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
      FROM tickets t 
      LEFT JOIN doctors d ON t.doctor_id = d.id 
      LEFT JOIN workstations w ON t.workstation_id = w.id
    `;
        const params = [];
        // Always filter by today's date for operational views
        // Use /api/tickets/history for historical data
        query += " WHERE date(t.created_at) = date('now')";
        if (status) {
            query += " AND t.status = ?";
            params.push(status);
        }
        if (queue_sector) {
            query += " AND t.queue_sector = ?";
            params.push(queue_sector);
        }
        query += " ORDER BY t.created_at ASC";
        const tickets = yield db.all(query, params);
        res.json(tickets);
    }));
    // Create Ticket
    app.post("/api/tickets", auth_1.verifyToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { doctor_id, type, subtype } = req.body; // type: 'consulta' | 'outros'
        // subtype (optional): 'agendamento_cirurgico' | 'apoio'
        // Determine prefix based on type
        let prefix = type === "outros" ? "O" : "C";
        if (subtype === "apoio") {
            prefix = "AP";
        }
        if (subtype === "agendamento_cirurgico") {
            prefix = "AC";
        }
        const queue_sector = subtype === "agendamento_cirurgico" ? "cirurgia" : "recepcao";
        try {
            yield db.run("BEGIN IMMEDIATE");
            const countResult = yield db.get('SELECT count(*) as count FROM tickets WHERE date(created_at) = date("now")');
            const nextNum = ((countResult === null || countResult === void 0 ? void 0 : countResult.count) || 0) + 1;
            const ticketNumber = `${prefix}${String(nextNum).padStart(3, "0")}`;
            const result = yield db.run("INSERT INTO tickets (number, doctor_id, type, subtype, queue_sector, status) VALUES (?, ?, ?, ?, ?, ?)", [ticketNumber, doctor_id || null, type || "consulta", subtype || null, queue_sector, "waiting"]);
            yield db.run("COMMIT");
            const newTicket = yield db.get(`
        SELECT t.*, d.name as doctor_name 
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        WHERE t.id = ?
      `, result.lastID);
            broadcast("ticket:created", newTicket);
            // Print ticket
            let printError = null;
            try {
                yield printer.printTicket(newTicket);
            }
            catch (err) {
                console.error("Failed to print ticket:", err);
                printError = "Falha ao imprimir: " + (err.message || "Erro desconhecido");
            }
            res.json(Object.assign(Object.assign({}, newTicket), { printError }));
        }
        catch (err) {
            yield db.run("ROLLBACK").catch(() => { });
            console.error("Error creating ticket:", err);
            res.status(500).json({ message: "Failed to create ticket", error: err.message });
        }
    }));
    // Get History (Last 10 called tickets)
    app.get("/api/tickets/history", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { limit, queue_sector } = req.query;
        let query = `
        SELECT t.*, d.name as doctor_name, w.code as workstation_code
        FROM tickets t
        LEFT JOIN doctors d ON t.doctor_id = d.id
        LEFT JOIN workstations w ON t.workstation_id = w.id
        WHERE t.status IN ('calling', 'in_attendance', 'finished', 'missed') 
        AND t.called_at IS NOT NULL
        AND date(t.created_at) = date("now")
    `;
        const params = [];
        if (queue_sector) {
            query += " AND t.queue_sector = ?";
            params.push(queue_sector);
        }
        query += " ORDER BY t.called_at DESC";
        if (limit) {
            query += " LIMIT ?";
            params.push(limit);
        }
        const history = yield db.all(query, params);
        res.json(history);
    }));
    // Get No-Show Tickets (Missed)
    app.get("/api/tickets/no-show", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { queue_sector } = req.query;
        let query = `
        SELECT t.*, d.name as doctor_name
        FROM tickets t
        LEFT JOIN doctors d ON t.doctor_id = d.id
        WHERE t.status = 'missed' 
        AND date(t.created_at) = date("now")
    `;
        const params = [];
        if (queue_sector) {
            query += " AND t.queue_sector = ?";
            params.push(queue_sector);
        }
        query += " ORDER BY t.finished_at DESC";
        const missed = yield db.all(query, params);
        res.json(missed);
    }));
    // Requeue Ticket
    app.post("/api/tickets/:id/requeue", auth_1.verifyToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = req.params;
        const ticket = yield db.get("SELECT * FROM tickets WHERE id = ?", [id]);
        if (!ticket) {
            return res.status(404).json({ message: "Senha não encontrada." });
        }
        if (ticket.status !== "missed") {
            return res.status(400).json({
                message: "Apenas senhas não comparecidas podem ser reinseridas.",
            });
        }
        // Update ticket
        yield db.run(`
        UPDATE tickets 
        SET status = 'waiting', 
            requeued_at = CURRENT_TIMESTAMP,
            requeue_count = IFNULL(requeue_count, 0) + 1,
            -- Clear calling data so it looks like new waiting
            called_at = NULL,
            started_at = NULL,
            finished_at = NULL,
            workstation_id = NULL,
            called_by_user_id = NULL
        WHERE id = ?
      `, [id]);
        const updatedTicket = yield db.get(`
        SELECT t.*, d.name as doctor_name 
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        WHERE t.id = ?
      `, [id]);
        // Broadcast as created so it appears in waiting lists if frontend relies on it
        // But since we have specific handlers, let's just use requeued/updated
        // broadcast("ticket:created", updatedTicket);
        broadcast("ticket:requeued", updatedTicket);
        // Also broadcast updated so screens that might show it as missed update to waiting (remove from missed list)
        broadcast("ticket:updated", updatedTicket);
        res.json(updatedTicket);
    }));
    // Recall Ticket
    app.post("/api/tickets/:id/recall", auth_1.verifyToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = req.params;
        const ticket = yield db.get("SELECT * FROM tickets WHERE id = ?", [id]);
        if (!ticket) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        // Broadcast calling event again
        broadcast("ticket:calling", ticket);
        res.json(ticket);
    }));
    // Get Waiting Stats by Doctor
    app.get("/api/tickets/waiting-stats", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { queue_sector } = req.query;
        const sectorValue = typeof queue_sector === "string" ? queue_sector : "recepcao";
        // Get all doctors first
        const doctors = yield db.all("SELECT * FROM doctors");
        // Get stats for each doctor
        const stats = yield Promise.all(doctors.map((doc) => __awaiter(void 0, void 0, void 0, function* () {
            // Waiting count for this doctor
            const waitingCount = yield db.get(`SELECT count(*) as count FROM tickets WHERE status = "waiting" AND doctor_id = ? AND date(created_at) = date("now") AND queue_sector = ?`, [doc.id, sectorValue]);
            // Oldest waiting ticket
            const oldest = yield db.get(`SELECT created_at FROM tickets WHERE status = "waiting" AND doctor_id = ? AND date(created_at) = date("now") AND queue_sector = ? ORDER BY created_at ASC LIMIT 1`, [doc.id, sectorValue]);
            // Format oldest_created_at to ISO string for consistent frontend parsing
            let waitTimeStr = null;
            if (oldest) {
                // SQLite CURRENT_TIMESTAMP is 'YYYY-MM-DD HH:MM:SS' (UTC)
                // We convert it to ISO 8601 'YYYY-MM-DDTHH:MM:SS.000Z'
                const raw = oldest.created_at;
                if (raw && typeof raw === "string") {
                    // Check if it already looks like ISO (has T)
                    if (raw.includes("T")) {
                        waitTimeStr = raw; // Already ISO-ish
                    }
                    else {
                        // Assume 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DDTHH:MM:SS.000Z'
                        waitTimeStr = raw.replace(" ", "T") + ".000Z";
                    }
                }
                else {
                    waitTimeStr = raw;
                }
            }
            return {
                doctor_id: doc.id,
                doctor_name: doc.name,
                count: (waitingCount === null || waitingCount === void 0 ? void 0 : waitingCount.count) || 0,
                oldest_created_at: waitTimeStr,
            };
        })));
        // Also get "No Doctor" / "Support" queue if any tickets have null doctor_id
        const supportCount = yield db.get(`SELECT count(*) as count FROM tickets WHERE status = "waiting" AND doctor_id IS NULL AND date(created_at) = date("now") AND queue_sector = ?`, [sectorValue]);
        if ((supportCount === null || supportCount === void 0 ? void 0 : supportCount.count) > 0) {
            const oldest = yield db.get(`SELECT created_at FROM tickets WHERE status = "waiting" AND doctor_id IS NULL AND date(created_at) = date("now") AND queue_sector = ? ORDER BY created_at ASC LIMIT 1`, [sectorValue]);
            let waitTimeStr = null;
            if (oldest) {
                const raw = oldest.created_at;
                if (raw && typeof raw === "string") {
                    if (raw.includes("T")) {
                        waitTimeStr = raw;
                    }
                    else {
                        waitTimeStr = raw.replace(" ", "T") + ".000Z";
                    }
                }
                else {
                    waitTimeStr = raw;
                }
            }
            stats.push({
                doctor_id: null,
                doctor_name: sectorValue === "cirurgia" ? "Agendamento Cirurgia" : "Apoio",
                count: supportCount.count,
                oldest_created_at: waitTimeStr,
            });
        }
        res.json(stats);
    }));
    // Call Next Ticket (FIFO)
    app.post("/api/tickets/call-next", auth_1.verifyToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { workstation_id, user_id, doctor_id, queue_sector } = req.body;
        try {
            yield db.run("BEGIN IMMEDIATE"); // Locks db for writing
            let query = 'SELECT * FROM tickets WHERE status = "waiting" AND date(created_at) = date("now")';
            const params = [];
            if (queue_sector) {
                query += " AND queue_sector = ?";
                params.push(queue_sector);
            }
            else {
                query += " AND queue_sector = 'recepcao'";
            }
            if (doctor_id !== undefined) {
                if (doctor_id === null) {
                    query += " AND doctor_id IS NULL";
                }
                else {
                    query += " AND doctor_id = ?";
                    params.push(doctor_id);
                }
            }
            query += " ORDER BY created_at ASC LIMIT 1";
            const ticket = yield db.get(query, params);
            if (!ticket) {
                yield db.run("ROLLBACK");
                return res.status(404).json({ message: "Nenhuma senha aguardando." });
            }
            // Update ticket
            const result = yield db.run(`
          UPDATE tickets 
          SET status = 'calling', 
              workstation_id = ?, 
              called_by_user_id = ?, 
              called_at = CURRENT_TIMESTAMP,
              call_type = 'FIFO'
          WHERE id = ? AND status = 'waiting'
        `, [workstation_id, user_id, ticket.id]);
            if (result.changes === 0) {
                yield db.run("ROLLBACK");
                return res
                    .status(409)
                    .json({ message: "Senha já foi chamada por outro atendente." });
            }
            yield db.run("COMMIT");
            const updatedTicket = yield db.get(`
          SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
          FROM tickets t 
          LEFT JOIN doctors d ON t.doctor_id = d.id 
          LEFT JOIN workstations w ON t.workstation_id = w.id
          WHERE t.id = ?
        `, ticket.id);
            if (!updatedTicket) {
                throw new Error("Erro ao recuperar senha atualizada (call-next)");
            }
            broadcast("ticket:calling", updatedTicket);
            res.json(updatedTicket);
        }
        catch (err) {
            yield db.run("ROLLBACK").catch(() => { });
            console.error("call-next error:", err);
            res
                .status(500)
                .json({ message: "Erro ao chamar senha. Tente novamente." });
        }
    }));
    // Call Specific Ticket
    app.post("/api/tickets/call-specific", auth_1.verifyToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { workstation_id, user_id, ticket_id } = req.body;
        console.log(`[call-specific] Request: workstation_id=${workstation_id}, user_id=${user_id}, ticket_id=${ticket_id}`);
        try {
            yield db.run("BEGIN IMMEDIATE");
            const ticket = yield db.get('SELECT * FROM tickets WHERE id = ? AND status = "waiting" AND date(created_at) = date("now")', [ticket_id]);
            if (!ticket) {
                yield db.run("ROLLBACK");
                return res
                    .status(404)
                    .json({ message: "Senha não encontrada ou já foi chamada." });
            }
            // Update ticket
            const result = yield db.run(`
          UPDATE tickets 
          SET status = 'calling', 
              workstation_id = ?, 
              called_by_user_id = ?, 
              called_at = CURRENT_TIMESTAMP,
              is_specific_call = 1
          WHERE id = ? AND status = 'waiting'
        `, [workstation_id, user_id, ticket_id]);
            if (result.changes === 0) {
                yield db.run("ROLLBACK");
                return res
                    .status(409)
                    .json({ message: "Senha já foi chamada por outro atendente." });
            }
            yield db.run("COMMIT");
            const updatedTicket = yield db.get(`
          SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
          FROM tickets t 
          LEFT JOIN doctors d ON t.doctor_id = d.id 
          LEFT JOIN workstations w ON t.workstation_id = w.id
          WHERE t.id = ?
        `, [ticket_id]);
            if (!updatedTicket) {
                throw new Error("Erro ao recuperar senha atualizada");
            }
            broadcast("ticket:calling", updatedTicket);
            res.json(updatedTicket);
        }
        catch (err) {
            yield db.run("ROLLBACK").catch(() => { });
            console.error("call-specific error:", err);
            res
                .status(500)
                .json({ message: "Erro ao chamar senha. Tente novamente." });
        }
    }));
    // Call Random Ticket
    app.post("/api/tickets/call-random", auth_1.verifyToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { workstation_id, user_id } = req.body;
        try {
            yield db.run("BEGIN IMMEDIATE");
            const tickets = yield db.all('SELECT * FROM tickets WHERE status = "waiting" AND date(created_at) = date("now")');
            if (tickets.length === 0) {
                yield db.run("ROLLBACK");
                return res.status(404).json({ message: "Nenhuma senha aguardando." });
            }
            const ticket = tickets[Math.floor(Math.random() * tickets.length)];
            const result = yield db.run(`
          UPDATE tickets 
          SET status = 'calling', 
              workstation_id = ?, 
              called_by_user_id = ?, 
              called_at = CURRENT_TIMESTAMP,
              call_type = 'RANDOM'
          WHERE id = ? AND status = 'waiting'
        `, [workstation_id, user_id, ticket.id]);
            if (result.changes === 0) {
                yield db.run("ROLLBACK");
                return res
                    .status(409)
                    .json({ message: "Senha já foi chamada por outro atendente." });
            }
            yield db.run("COMMIT");
            const updatedTicket = yield db.get(`
          SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
          FROM tickets t 
          LEFT JOIN doctors d ON t.doctor_id = d.id 
          LEFT JOIN workstations w ON t.workstation_id = w.id
          WHERE t.id = ?
        `, ticket.id);
            broadcast("ticket:calling", updatedTicket);
            res.json(updatedTicket);
        }
        catch (err) {
            yield db.run("ROLLBACK").catch(() => { });
            console.error("call-random error:", err);
            res
                .status(500)
                .json({ message: "Erro ao chamar senha. Tente novamente." });
        }
    }));
    // Update Ticket Status (Start, Finish, Missed)
    app.put("/api/tickets/:id/status", auth_1.verifyToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = req.params;
        const { status } = req.body; // 'in_attendance', 'finished', 'missed'
        let query = "UPDATE tickets SET status = ?";
        const params = [status];
        if (status === "in_attendance") {
            query += ", started_at = CURRENT_TIMESTAMP";
        }
        else if (status === "finished" || status === "missed") {
            query += ", finished_at = CURRENT_TIMESTAMP";
        }
        query += " WHERE id = ?";
        params.push(id);
        yield db.run(query, params);
        // Fetch full ticket details for broadcast
        const updatedTicket = yield db.get(`
        SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        LEFT JOIN workstations w ON t.workstation_id = w.id 
        WHERE t.id = ?
    `, id);
        // Broadcast specific events based on status
        if (status === "in_attendance") {
            broadcast("ticket:started", updatedTicket);
        }
        else if (status === "finished") {
            broadcast("ticket:finished", updatedTicket);
        }
        else if (status === "missed") {
            broadcast("ticket:missed", updatedTicket); // Or ticket:finished with outcome
        }
        else {
            broadcast("ticket:updated", updatedTicket);
        }
        res.json(updatedTicket);
    }));
    // Dashboard Stats
    app.get("/api/stats", auth_1.verifyToken, auth_1.requireAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const today = new Date().toISOString().split("T")[0];
        const totalTickets = yield db.get('SELECT count(*) as count FROM tickets WHERE date(created_at) = date("now")');
        const waitingTickets = yield db.get('SELECT count(*) as count FROM tickets WHERE status = "waiting" AND date(created_at) = date("now")');
        const attendedTickets = yield db.get('SELECT count(*) as count FROM tickets WHERE status = "finished" AND date(created_at) = date("now")');
        // Avg wait time (called_at - created_at)
        const avgWait = yield db.get(`
        SELECT AVG((julianday(called_at) - julianday(created_at)) * 24 * 60) as avg_min 
        FROM tickets 
        WHERE called_at IS NOT NULL AND date(created_at) = date("now")
      `);
        // Ranking by attendant (calls made)
        const ranking = yield db.all(`
        SELECT u.username, COUNT(t.id) as count
        FROM tickets t
        JOIN users u ON t.called_by_user_id = u.id
        WHERE date(t.created_at) = date("now")
        GROUP BY u.username
        ORDER BY count DESC
        LIMIT 5
      `);
        // Avg service time by attendant (finished_at - started_at)
        const avgServiceTime = yield db.all(`
        SELECT u.username, AVG((julianday(t.finished_at) - julianday(t.started_at)) * 24 * 60) as avg_min
        FROM tickets t
        JOIN users u ON t.called_by_user_id = u.id
        WHERE t.status = 'finished' AND date(t.created_at) = date("now")
        GROUP BY u.username
      `);
        // Tickets by type
        const byType = yield db.all(`
        SELECT type, COUNT(*) as count
        FROM tickets
        WHERE date(created_at) = date("now")
        GROUP BY type
      `);
        // Missed count
        const missed = yield db.get('SELECT count(*) as count FROM tickets WHERE status = "missed" AND date(created_at) = date("now")');
        res.json({
            total: (totalTickets === null || totalTickets === void 0 ? void 0 : totalTickets.count) || 0,
            waiting: (waitingTickets === null || waitingTickets === void 0 ? void 0 : waitingTickets.count) || 0,
            attended: (attendedTickets === null || attendedTickets === void 0 ? void 0 : attendedTickets.count) || 0,
            avgWaitTimeMinutes: Math.round((avgWait === null || avgWait === void 0 ? void 0 : avgWait.avg_min) || 0),
            ranking,
            avgServiceTime: avgServiceTime.map((r) => (Object.assign(Object.assign({}, r), { avg_min: Math.round(r.avg_min || 0) }))),
            byType,
            missed: (missed === null || missed === void 0 ? void 0 : missed.count) || 0,
        });
    }));
    // --- WebSocket ---
    wss.on("connection", (ws) => {
        console.log("Client connected");
        ws.on("close", () => {
            console.log("Client disconnected");
        });
    });
    if (listen) {
        const PORT = 3000;
        httpServer.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    }
    return { app, httpServer, wss, db };
});
exports.startServer = startServer;
if (require.main === module) {
    startServer().catch(console.error);
}
