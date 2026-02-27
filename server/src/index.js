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
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const database_1 = require("./database");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server: httpServer });
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
const startServer = () => __awaiter(void 0, void 0, void 0, function* () {
    const db = yield (0, database_1.initDb)();
    // --- API Routes ---
    // Login
    app.post('/api/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { username, password, workstation_id } = req.body;
        // Find user
        const user = yield db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }
        // If workstation provided, check lock
        if (workstation_id) {
            const workstation = yield db.get('SELECT * FROM workstations WHERE id = ?', [workstation_id]);
            if (!workstation) {
                return res.status(404).json({ success: false, message: 'Posto de trabalho não encontrado' });
            }
            if (workstation.current_user_id && workstation.current_user_id !== user.id) {
                return res.status(409).json({ success: false, message: 'Este posto de trabalho já está ocupado por outro usuário.' });
            }
            // Lock workstation
            yield db.run('UPDATE workstations SET current_user_id = ?, is_active = 1 WHERE id = ?', [user.id, workstation_id]);
            broadcast('workstation:updated', { id: workstation.id, current_user_id: user.id, is_active: 1 });
        }
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    }));
    // Logout
    app.post('/api/logout', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { user_id, workstation_id } = req.body;
        if (workstation_id) {
            // Release workstation
            yield db.run('UPDATE workstations SET current_user_id = NULL, is_active = 0 WHERE id = ? AND current_user_id = ?', [workstation_id, user_id]);
            broadcast('workstation:updated', { id: workstation_id, current_user_id: null, is_active: 0 });
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
    app.get('/api/workstations', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const workstations = yield db.all('SELECT * FROM workstations');
        res.json(workstations);
    }));
    // Doctors
    app.get('/api/doctors', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const doctors = yield db.all('SELECT * FROM doctors');
        res.json(doctors);
    }));
    // Tickets List
    app.get('/api/tickets', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { status } = req.query;
        let query = `
      SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
      FROM tickets t 
      LEFT JOIN doctors d ON t.doctor_id = d.id 
      LEFT JOIN workstations w ON t.workstation_id = w.id
    `;
        if (status) {
            query += ` WHERE t.status = '${status}'`;
        }
        query += ' ORDER BY t.created_at ASC';
        const tickets = yield db.all(query);
        res.json(tickets);
    }));
    // Create Ticket
    app.post('/api/tickets', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { doctor_id, type } = req.body; // type: 'consulta' | 'cirurgia'
        // Determine prefix based on type
        const prefix = type === 'cirurgia' ? 'S' : 'C';
        // Get count for today to generate sequential number
        const countResult = yield db.get('SELECT count(*) as count FROM tickets WHERE date(created_at) = date("now")');
        const nextNum = ((countResult === null || countResult === void 0 ? void 0 : countResult.count) || 0) + 1;
        const ticketNumber = `${prefix}${String(nextNum).padStart(3, '0')}`;
        const result = yield db.run('INSERT INTO tickets (number, doctor_id, type, status) VALUES (?, ?, ?, ?)', [ticketNumber, doctor_id, type || 'consulta', 'waiting']);
        const newTicket = yield db.get(`
      SELECT t.*, d.name as doctor_name 
      FROM tickets t 
      LEFT JOIN doctors d ON t.doctor_id = d.id 
      WHERE t.id = ?
    `, result.lastID);
        broadcast('ticket:created', newTicket);
        res.json(newTicket);
    }));
    // Call Next Ticket (FIFO)
    app.post('/api/tickets/call-next', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { workstation_id, user_id } = req.body;
        // Find oldest waiting ticket
        const ticket = yield db.get('SELECT * FROM tickets WHERE status = "waiting" ORDER BY created_at ASC LIMIT 1');
        if (!ticket) {
            return res.status(404).json({ message: 'Nenhuma senha aguardando.' });
        }
        // Update ticket
        yield db.run(`
        UPDATE tickets 
        SET status = 'calling', 
            workstation_id = ?, 
            called_by_user_id = ?, 
            called_at = CURRENT_TIMESTAMP,
            call_type = 'FIFO'
        WHERE id = ?
      `, [workstation_id, user_id, ticket.id]);
        const updatedTicket = yield db.get(`
        SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        LEFT JOIN workstations w ON t.workstation_id = w.id
        WHERE t.id = ?
      `, ticket.id);
        broadcast('ticket:calling', updatedTicket);
        res.json(updatedTicket);
    }));
    // Call Random Ticket
    app.post('/api/tickets/call-random', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { workstation_id, user_id } = req.body;
        // Find ALL waiting tickets
        const tickets = yield db.all('SELECT * FROM tickets WHERE status = "waiting"');
        if (tickets.length === 0) {
            return res.status(404).json({ message: 'Nenhuma senha aguardando.' });
        }
        // Pick random
        const ticket = tickets[Math.floor(Math.random() * tickets.length)];
        // Update ticket
        yield db.run(`
        UPDATE tickets 
        SET status = 'calling', 
            workstation_id = ?, 
            called_by_user_id = ?, 
            called_at = CURRENT_TIMESTAMP,
            call_type = 'RANDOM'
        WHERE id = ?
      `, [workstation_id, user_id, ticket.id]);
        const updatedTicket = yield db.get(`
        SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        LEFT JOIN workstations w ON t.workstation_id = w.id
        WHERE t.id = ?
      `, ticket.id);
        broadcast('ticket:calling', updatedTicket);
        res.json(updatedTicket);
    }));
    // Update Ticket Status (Start, Finish, Missed)
    app.put('/api/tickets/:id/status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = req.params;
        const { status } = req.body; // 'in_attendance', 'finished', 'missed'
        let query = 'UPDATE tickets SET status = ?';
        const params = [status];
        if (status === 'in_attendance') {
            query += ', started_at = CURRENT_TIMESTAMP';
        }
        else if (status === 'finished' || status === 'missed') {
            query += ', finished_at = CURRENT_TIMESTAMP';
        }
        query += ' WHERE id = ?';
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
        if (status === 'in_attendance') {
            broadcast('ticket:started', updatedTicket);
        }
        else if (status === 'finished') {
            broadcast('ticket:finished', updatedTicket);
        }
        else if (status === 'missed') {
            broadcast('ticket:missed', updatedTicket); // Or ticket:finished with outcome
        }
        else {
            broadcast('ticket:updated', updatedTicket);
        }
        res.json(updatedTicket);
    }));
    // Dashboard Stats
    app.get('/api/stats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const today = new Date().toISOString().split('T')[0];
        const totalTickets = yield db.get('SELECT count(*) as count FROM tickets WHERE date(created_at) = date("now")');
        const waitingTickets = yield db.get('SELECT count(*) as count FROM tickets WHERE status = "waiting" AND date(created_at) = date("now")');
        const attendedTickets = yield db.get('SELECT count(*) as count FROM tickets WHERE status = "finished" AND date(created_at) = date("now")');
        // Avg wait time (called_at - created_at)
        const avgWait = yield db.get(`
        SELECT AVG((julianday(called_at) - julianday(created_at)) * 24 * 60) as avg_min 
        FROM tickets 
        WHERE called_at IS NOT NULL AND date(created_at) = date("now")
      `);
        res.json({
            total: (totalTickets === null || totalTickets === void 0 ? void 0 : totalTickets.count) || 0,
            waiting: (waitingTickets === null || waitingTickets === void 0 ? void 0 : waitingTickets.count) || 0,
            attended: (attendedTickets === null || attendedTickets === void 0 ? void 0 : attendedTickets.count) || 0,
            avgWaitTimeMinutes: Math.round((avgWait === null || avgWait === void 0 ? void 0 : avgWait.avg_min) || 0)
        });
    }));
    // --- WebSocket ---
    wss.on('connection', (ws) => {
        console.log('Client connected');
        ws.on('close', () => {
            console.log('Client disconnected');
        });
    });
    const PORT = 3000;
    httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
startServer().catch(console.error);
