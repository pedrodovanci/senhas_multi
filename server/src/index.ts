import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import { initDb } from "./database";
import { ConsolePrinter, NetworkPrinter } from "./services/PrinterService";

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Use NetworkPrinter if env var is set, otherwise ConsolePrinter
const printerHost = process.env.PRINTER_HOST;
const printer = printerHost
  ? new NetworkPrinter(printerHost)
  : new ConsolePrinter();

app.use(cors());
app.use(express.json());

// Helper to broadcast to all connected clients
const broadcast = (type: string, data: any) => {
  const message = JSON.stringify({ type, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

const startServer = async () => {
  const db = await initDb();

  // --- API Routes ---

  // Login
  app.post("/api/login", async (req, res) => {
    const { username, password, workstation_id } = req.body;

    // Find user
    const user = await db.get(
      "SELECT * FROM users WHERE username = ? AND password = ?",
      [username, password],
    );
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Credenciais inválidas" });
    }

    // If workstation provided, check lock
    if (workstation_id) {
      const workstation = await db.get(
        "SELECT * FROM workstations WHERE id = ?",
        [workstation_id],
      );
      if (!workstation) {
        return res.status(404).json({
          success: false,
          message: "Posto de trabalho não encontrado",
        });
      }

      if (
        workstation.current_user_id &&
        workstation.current_user_id !== user.id
      ) {
        return res.status(409).json({
          success: false,
          message: "Este posto de trabalho já está ocupado por outro usuário.",
        });
      }

      // Lock workstation
      await db.run(
        "UPDATE workstations SET current_user_id = ?, is_active = 1 WHERE id = ?",
        [user.id, workstation_id],
      );
      broadcast("workstation:updated", {
        id: workstation.id,
        current_user_id: user.id,
        is_active: 1,
      });
    }

    res.json({
      success: true,
      user: { id: user.id, username: user.username, role: user.role },
    });
  });

  // Logout
  app.post("/api/logout", async (req, res) => {
    const { user_id, workstation_id } = req.body;

    if (workstation_id) {
      // Release workstation
      await db.run(
        "UPDATE workstations SET current_user_id = NULL, is_active = 0 WHERE id = ? AND current_user_id = ?",
        [workstation_id, user_id],
      );
      broadcast("workstation:updated", {
        id: workstation_id,
        current_user_id: null,
        is_active: 0,
      });

      // Auto-mark current tickets as 'missed' if in attendance? Or just leave them?
      // Plan says: "Senhas em EM_ATENDIMENTO naquele guichê devem ser marcadas como NAO_COMPARECEU automaticamente."
      await db.run(
        `
            UPDATE tickets 
            SET status = 'missed', finished_at = CURRENT_TIMESTAMP 
            WHERE workstation_id = ? AND status = 'in_attendance'
          `,
        [workstation_id],
      );
    }

    res.json({ success: true });
  });

  // Workstations
  app.get("/api/workstations", async (req, res) => {
    const workstations = await db.all("SELECT * FROM workstations");
    res.json(workstations);
  });

  // Doctors
  app.get("/api/doctors", async (req, res) => {
    const doctors = await db.all("SELECT * FROM doctors");
    res.json(doctors);
  });

  // Tickets List
  app.get("/api/tickets", async (req, res) => {
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

    query += " ORDER BY t.created_at ASC";

    const tickets = await db.all(query);
    res.json(tickets);
  });

  // Create Ticket
  app.post("/api/tickets", async (req, res) => {
    const { doctor_id, type } = req.body; // type: 'consulta' | 'cirurgia'

    // Determine prefix based on type
    const prefix = type === "cirurgia" ? "S" : "C";

    // Get count for today to generate sequential number
    const countResult = await db.get(
      'SELECT count(*) as count FROM tickets WHERE date(created_at) = date("now")',
    );
    const nextNum = (countResult?.count || 0) + 1;
    const ticketNumber = `${prefix}${String(nextNum).padStart(3, "0")}`;

    const result = await db.run(
      "INSERT INTO tickets (number, doctor_id, type, status) VALUES (?, ?, ?, ?)",
      [ticketNumber, doctor_id, type || "consulta", "waiting"],
    );

    const newTicket = await db.get(
      `
      SELECT t.*, d.name as doctor_name 
      FROM tickets t 
      LEFT JOIN doctors d ON t.doctor_id = d.id 
      WHERE t.id = ?
    `,
      result.lastID,
    );

    broadcast("ticket:created", newTicket);

    // Print ticket
    try {
      await printer.printTicket(newTicket);
    } catch (err) {
      console.error("Failed to print ticket:", err);
    }

    res.json(newTicket);
  });

  // Get History (Last 10 called tickets)
  app.get("/api/tickets/history", async (req, res) => {
    const { limit } = req.query;
    let query = `
        SELECT t.*, d.name as doctor_name, w.code as workstation_code
        FROM tickets t
        LEFT JOIN doctors d ON t.doctor_id = d.id
        LEFT JOIN workstations w ON t.workstation_id = w.id
        WHERE t.status IN ('calling', 'in_attendance', 'finished', 'missed') 
        AND t.called_at IS NOT NULL
        AND date(t.created_at) = date("now")
        ORDER BY t.called_at DESC
    `;

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const history = await db.all(query);
    res.json(history);
  });

  // Get No-Show Tickets (Missed)
  app.get("/api/tickets/no-show", async (req, res) => {
    const missed = await db.all(`
        SELECT t.*, d.name as doctor_name
        FROM tickets t
        LEFT JOIN doctors d ON t.doctor_id = d.id
        WHERE t.status = 'missed' 
        AND date(t.created_at) = date("now")
        ORDER BY t.finished_at DESC
    `);
    res.json(missed);
  });

  // Requeue Ticket
  app.post("/api/tickets/:id/requeue", async (req, res) => {
    const { id } = req.params;

    const ticket = await db.get("SELECT * FROM tickets WHERE id = ?", [id]);

    if (!ticket) {
      return res.status(404).json({ message: "Senha não encontrada." });
    }

    if (ticket.status !== "missed") {
      return res.status(400).json({
        message: "Apenas senhas não comparecidas podem ser reinseridas.",
      });
    }

    // Update ticket
    await db.run(
      `
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
      `,
      [id],
    );

    const updatedTicket = await db.get(
      `
        SELECT t.*, d.name as doctor_name 
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        WHERE t.id = ?
      `,
      [id],
    );

    // Broadcast as created so it appears in waiting lists if frontend relies on it
    // But since we have specific handlers, let's just use requeued/updated
    // broadcast("ticket:created", updatedTicket);
    broadcast("ticket:requeued", updatedTicket);

    // Also broadcast updated so screens that might show it as missed update to waiting (remove from missed list)
    broadcast("ticket:updated", updatedTicket);

    res.json(updatedTicket);
  });

  // Recall Ticket
  app.post("/api/tickets/:id/recall", async (req, res) => {
    const { id } = req.params;
    const ticket = await db.get("SELECT * FROM tickets WHERE id = ?", [id]);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Broadcast calling event again
    broadcast("ticket:calling", ticket);
    res.json(ticket);
  });

  // Get Waiting Stats by Doctor
  app.get("/api/tickets/waiting-stats", async (req, res) => {
    // Get all doctors first
    const doctors = await db.all("SELECT * FROM doctors");

    // Get stats for each doctor
    const stats = await Promise.all(
      doctors.map(async (doc) => {
        // Waiting count for this doctor
        const waitingCount = await db.get(
          'SELECT count(*) as count FROM tickets WHERE status = "waiting" AND doctor_id = ? AND date(created_at) = date("now")',
          [doc.id],
        );

        // Oldest waiting ticket
        const oldest = await db.get(
          'SELECT created_at FROM tickets WHERE status = "waiting" AND doctor_id = ? AND date(created_at) = date("now") ORDER BY created_at ASC LIMIT 1',
          [doc.id],
        );

        let waitTimeStr = null;
        if (oldest) {
          // Calculate wait time
          // SQLite datetime is UTC or local string, assuming consistency.
          // Client will calculate diff, but we can send created_at
          waitTimeStr = oldest.created_at;
        }

        return {
          doctor_id: doc.id,
          doctor_name: doc.name,
          count: waitingCount?.count || 0,
          oldest_created_at: waitTimeStr,
        };
      }),
    );

    // Also get "No Doctor" / "Support" queue if any tickets have null doctor_id
    const supportCount = await db.get(
      'SELECT count(*) as count FROM tickets WHERE status = "waiting" AND doctor_id IS NULL AND date(created_at) = date("now")',
    );
    if (supportCount?.count > 0) {
      const oldest = await db.get(
        'SELECT created_at FROM tickets WHERE status = "waiting" AND doctor_id IS NULL AND date(created_at) = date("now") ORDER BY created_at ASC LIMIT 1',
      );
      stats.push({
        doctor_id: null,
        doctor_name: "Sem Médico / Apoio",
        count: supportCount.count,
        oldest_created_at: oldest?.created_at,
      });
    }

    res.json(stats);
  });

  // Call Next Ticket (FIFO)
  app.post("/api/tickets/call-next", async (req, res) => {
    const { workstation_id, user_id, doctor_id } = req.body;

    let query = 'SELECT * FROM tickets WHERE status = "waiting"';
    const params = [];

    if (doctor_id !== undefined) {
      if (doctor_id === null) {
        query += " AND doctor_id IS NULL";
      } else {
        query += " AND doctor_id = ?";
        params.push(doctor_id);
      }
    }

    query += " ORDER BY created_at ASC LIMIT 1";

    // Find oldest waiting ticket
    const ticket = await db.get(query, params);

    if (!ticket) {
      return res.status(404).json({ message: "Nenhuma senha aguardando." });
    }

    // Update ticket
    await db.run(
      `
        UPDATE tickets 
        SET status = 'calling', 
            workstation_id = ?, 
            called_by_user_id = ?, 
            called_at = CURRENT_TIMESTAMP,
            call_type = 'FIFO'
        WHERE id = ?
      `,
      [workstation_id, user_id, ticket.id],
    );

    const updatedTicket = await db.get(
      `
        SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        LEFT JOIN workstations w ON t.workstation_id = w.id
        WHERE t.id = ?
      `,
      ticket.id,
    );

    broadcast("ticket:calling", updatedTicket);
    res.json(updatedTicket);
  });

  // Call Specific Ticket
  app.post("/api/tickets/call-specific", async (req, res) => {
    const { workstation_id, user_id, ticket_id } = req.body;

    const ticket = await db.get(
      'SELECT * FROM tickets WHERE id = ? AND status = "waiting"',
      [ticket_id],
    );

    if (!ticket) {
      return res
        .status(404)
        .json({ message: "Senha não encontrada ou não está aguardando." });
    }

    // Update ticket
    await db.run(
      `
        UPDATE tickets 
        SET status = 'calling', 
            workstation_id = ?, 
            called_by_user_id = ?, 
            called_at = CURRENT_TIMESTAMP,
            is_specific_call = 1
        WHERE id = ?
      `,
      [workstation_id, user_id, ticket_id],
    );

    const updatedTicket = await db.get(
      `
        SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        LEFT JOIN workstations w ON t.workstation_id = w.id
        WHERE t.id = ?
      `,
      [ticket_id],
    );

    broadcast("ticket:calling", updatedTicket);
    res.json(updatedTicket);
  });

  // Call Random Ticket
  app.post("/api/tickets/call-random", async (req, res) => {
    const { workstation_id, user_id } = req.body;

    // Find ALL waiting tickets
    const tickets = await db.all(
      'SELECT * FROM tickets WHERE status = "waiting"',
    );

    if (tickets.length === 0) {
      return res.status(404).json({ message: "Nenhuma senha aguardando." });
    }

    // Pick random
    const ticket = tickets[Math.floor(Math.random() * tickets.length)];

    // Update ticket
    await db.run(
      `
        UPDATE tickets 
        SET status = 'calling', 
            workstation_id = ?, 
            called_by_user_id = ?, 
            called_at = CURRENT_TIMESTAMP,
            call_type = 'RANDOM'
        WHERE id = ?
      `,
      [workstation_id, user_id, ticket.id],
    );

    const updatedTicket = await db.get(
      `
        SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        LEFT JOIN workstations w ON t.workstation_id = w.id
        WHERE t.id = ?
      `,
      ticket.id,
    );

    broadcast("ticket:calling", updatedTicket);
    res.json(updatedTicket);
  });

  // Update Ticket Status (Start, Finish, Missed)
  app.put("/api/tickets/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'in_attendance', 'finished', 'missed'

    let query = "UPDATE tickets SET status = ?";
    const params = [status];

    if (status === "in_attendance") {
      query += ", started_at = CURRENT_TIMESTAMP";
    } else if (status === "finished" || status === "missed") {
      query += ", finished_at = CURRENT_TIMESTAMP";
    }

    query += " WHERE id = ?";
    params.push(id);

    await db.run(query, params);

    // Fetch full ticket details for broadcast
    const updatedTicket = await db.get(
      `
        SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
        FROM tickets t 
        LEFT JOIN doctors d ON t.doctor_id = d.id 
        LEFT JOIN workstations w ON t.workstation_id = w.id 
        WHERE t.id = ?
    `,
      id,
    );

    // Broadcast specific events based on status
    if (status === "in_attendance") {
      broadcast("ticket:started", updatedTicket);
    } else if (status === "finished") {
      broadcast("ticket:finished", updatedTicket);
    } else if (status === "missed") {
      broadcast("ticket:missed", updatedTicket); // Or ticket:finished with outcome
    } else {
      broadcast("ticket:updated", updatedTicket);
    }

    res.json(updatedTicket);
  });

  // Dashboard Stats
  app.get("/api/stats", async (req, res) => {
    const today = new Date().toISOString().split("T")[0];

    const totalTickets = await db.get(
      'SELECT count(*) as count FROM tickets WHERE date(created_at) = date("now")',
    );
    const waitingTickets = await db.get(
      'SELECT count(*) as count FROM tickets WHERE status = "waiting" AND date(created_at) = date("now")',
    );
    const attendedTickets = await db.get(
      'SELECT count(*) as count FROM tickets WHERE status = "finished" AND date(created_at) = date("now")',
    );

    // Avg wait time (called_at - created_at)
    const avgWait = await db.get(`
        SELECT AVG((julianday(called_at) - julianday(created_at)) * 24 * 60) as avg_min 
        FROM tickets 
        WHERE called_at IS NOT NULL AND date(created_at) = date("now")
      `);

    // Ranking by attendant (calls made)
    const ranking = await db.all(`
        SELECT u.username, COUNT(t.id) as count
        FROM tickets t
        JOIN users u ON t.called_by_user_id = u.id
        WHERE date(t.created_at) = date("now")
        GROUP BY u.username
        ORDER BY count DESC
        LIMIT 5
      `);

    // Avg service time by attendant (finished_at - started_at)
    const avgServiceTime = await db.all(`
        SELECT u.username, AVG((julianday(t.finished_at) - julianday(t.started_at)) * 24 * 60) as avg_min
        FROM tickets t
        JOIN users u ON t.called_by_user_id = u.id
        WHERE t.status = 'finished' AND date(t.created_at) = date("now")
        GROUP BY u.username
      `);

    // Tickets by type
    const byType = await db.all(`
        SELECT type, COUNT(*) as count
        FROM tickets
        WHERE date(created_at) = date("now")
        GROUP BY type
      `);

    // Missed count
    const missed = await db.get(
      'SELECT count(*) as count FROM tickets WHERE status = "missed" AND date(created_at) = date("now")',
    );

    res.json({
      total: totalTickets?.count || 0,
      waiting: waitingTickets?.count || 0,
      attended: attendedTickets?.count || 0,
      avgWaitTimeMinutes: Math.round(avgWait?.avg_min || 0),
      ranking,
      avgServiceTime: avgServiceTime.map((r) => ({
        ...r,
        avg_min: Math.round(r.avg_min || 0),
      })),
      byType,
      missed: missed?.count || 0,
    });
  });

  // --- WebSocket ---
  wss.on("connection", (ws) => {
    console.log("Client connected");
    ws.on("close", () => {
      console.log("Client disconnected");
    });
  });

  const PORT = 3000;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch(console.error);
