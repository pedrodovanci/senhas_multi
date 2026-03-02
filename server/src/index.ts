import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import bcrypt from "bcrypt";
import { initDb } from "./database";
import {
  generateToken,
  verifyToken,
  requireAdmin,
  AuthRequest,
} from "./middleware/auth";
import {
  ConsolePrinter,
  NetworkPrinter,
  WindowsPrinter,
  IPrinter,
} from "./services/PrinterService";

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Initialize Printer
const printerHost = process.env.PRINTER_HOST;
let printer: IPrinter;

if (printerHost) {
  printer = new NetworkPrinter(printerHost);
} else if (process.platform === "win32") {
  printer = new WindowsPrinter();
} else {
  printer = new ConsolePrinter();
}

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

  // Startup Cleanup: Reset stuck tickets
  const stuckTickets = await db.all(
    `SELECT id, number, status FROM tickets 
     WHERE status IN ('calling', 'in_attendance')
     AND date(created_at) = date('now')`,
  );

  if (stuckTickets.length > 0) {
    console.log(
      `[Startup] Found ${stuckTickets.length} stuck tickets. Returning to queue...`,
    );

    await db.run(
      `UPDATE tickets 
       SET status = 'waiting',
           workstation_id = NULL,
           called_by_user_id = NULL,
           called_at = NULL,
           started_at = NULL
       WHERE status IN ('calling', 'in_attendance')
       AND date(created_at) = date('now')`,
    );

    stuckTickets.forEach((t) => {
      console.log(
        `[Startup] Ticket ${t.number} (${t.status}) returned to 'waiting'.`,
      );
    });
  }

  // Release locked workstations
  await db.run(`UPDATE workstations SET current_user_id = NULL, is_active = 0`);
  console.log("[Startup] Workstations released.");

  // --- API Routes ---

  // Login
  app.post("/api/login", async (req, res) => {
    const { username, password, workstation_id } = req.body;

    // Find user
    const user = await db.get("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Credenciais inválidas" });
    }

    // Compare password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Credenciais inválidas" });
    }

    // Generate Token
    const token = generateToken(user);

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
      token,
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

  // Create Doctor
  app.post("/api/doctors", verifyToken, requireAdmin, async (req, res) => {
    const { name, specialization } = req.body;
    try {
      const result = await db.run(
        "INSERT INTO doctors (name, specialization) VALUES (?, ?)",
        [name, specialization],
      );
      const newDoctor = await db.get("SELECT * FROM doctors WHERE id = ?", [
        result.lastID,
      ]);
      res.json(newDoctor);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update Doctor
  app.put("/api/doctors/:id", verifyToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, specialization } = req.body;
    try {
      await db.run(
        "UPDATE doctors SET name = ?, specialization = ? WHERE id = ?",
        [name, specialization, id],
      );
      res.json({ id, name, specialization });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Doctor
  app.delete(
    "/api/doctors/:id",
    verifyToken,
    requireAdmin,
    async (req, res) => {
      const { id } = req.params;
      try {
        await db.run("DELETE FROM doctors WHERE id = ?", [id]);
        res.json({ message: "Deleted" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Users
  app.get("/api/users", verifyToken, requireAdmin, async (req, res) => {
    const users = await db.all("SELECT id, username, role, active FROM users");
    res.json(users);
  });

  // Create User
  app.post("/api/users", verifyToken, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await db.run(
        "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
        [username, hashedPassword, role],
      );
      const newUser = await db.get(
        "SELECT id, username, role, active FROM users WHERE id = ?",
        [result.lastID],
      );
      res.json(newUser);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update User
  app.put("/api/users/:id", verifyToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, password, role, active } = req.body;
    try {
      if (password && password.trim() !== "") {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.run(
          "UPDATE users SET username = ?, password = ?, role = ?, active = ? WHERE id = ?",
          [username, hashedPassword, role, active, id],
        );
      } else {
        await db.run(
          "UPDATE users SET username = ?, role = ?, active = ? WHERE id = ?",
          [username, role, active, id],
        );
      }
      res.json({ id, username, role, active });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete User
  app.delete("/api/users/:id", verifyToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      await db.run("DELETE FROM users WHERE id = ?", [id]);
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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

    const params: any[] = [];

    // Always filter by today's date for operational views
    // Use /api/tickets/history for historical data
    query += " WHERE date(t.created_at) = date('now')";

    if (status) {
      query += " AND t.status = ?";
      params.push(status);
    }

    query += " ORDER BY t.created_at ASC";

    const tickets = await db.all(query, params);
    res.json(tickets);
  });

  // Create Ticket
  app.post("/api/tickets", verifyToken, async (req, res) => {
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
    let printError = null;
    try {
      await printer.printTicket(newTicket);
    } catch (err: any) {
      console.error("Failed to print ticket:", err);
      printError = "Falha ao imprimir: " + (err.message || "Erro desconhecido");
    }

    res.json({ ...newTicket, printError });
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

    const params: any[] = [];

    if (limit) {
      query += " LIMIT ?";
      params.push(limit);
    }

    const history = await db.all(query, params);
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
  app.post("/api/tickets/:id/requeue", verifyToken, async (req, res) => {
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
  app.post("/api/tickets/:id/recall", verifyToken, async (req, res) => {
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
            } else {
              // Assume 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DDTHH:MM:SS.000Z'
              waitTimeStr = raw.replace(" ", "T") + ".000Z";
            }
          } else {
            waitTimeStr = raw;
          }
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
  app.post("/api/tickets/call-next", verifyToken, async (req, res) => {
    const { workstation_id, user_id, doctor_id } = req.body;

    try {
      await db.run("BEGIN IMMEDIATE"); // Locks db for writing

      let query =
        'SELECT * FROM tickets WHERE status = "waiting" AND date(created_at) = date("now")';
      const params: any[] = [];

      if (doctor_id !== undefined) {
        if (doctor_id === null) {
          query += " AND doctor_id IS NULL";
        } else {
          query += " AND doctor_id = ?";
          params.push(doctor_id);
        }
      }

      query += " ORDER BY created_at ASC LIMIT 1";

      const ticket = await db.get(query, params);

      if (!ticket) {
        await db.run("ROLLBACK");
        return res.status(404).json({ message: "Nenhuma senha aguardando." });
      }

      // Update ticket
      const result = await db.run(
        `
          UPDATE tickets 
          SET status = 'calling', 
              workstation_id = ?, 
              called_by_user_id = ?, 
              called_at = CURRENT_TIMESTAMP,
              call_type = 'FIFO'
          WHERE id = ? AND status = 'waiting'
        `,
        [workstation_id, user_id, ticket.id],
      );

      if (result.changes === 0) {
        await db.run("ROLLBACK");
        return res
          .status(409)
          .json({ message: "Senha já foi chamada por outro atendente." });
      }

      await db.run("COMMIT");

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

      if (!updatedTicket) {
        throw new Error("Erro ao recuperar senha atualizada (call-next)");
      }

      broadcast("ticket:calling", updatedTicket);
      res.json(updatedTicket);
    } catch (err: any) {
      await db.run("ROLLBACK").catch(() => {});
      console.error("call-next error:", err);
      res
        .status(500)
        .json({ message: "Erro ao chamar senha. Tente novamente." });
    }
  });

  // Call Specific Ticket
  app.post("/api/tickets/call-specific", verifyToken, async (req, res) => {
    const { workstation_id, user_id, ticket_id } = req.body;
    console.log(
      `[call-specific] Request: workstation_id=${workstation_id}, user_id=${user_id}, ticket_id=${ticket_id}`,
    );

    try {
      await db.run("BEGIN IMMEDIATE");

      const ticket = await db.get(
        'SELECT * FROM tickets WHERE id = ? AND status = "waiting" AND date(created_at) = date("now")',
        [ticket_id],
      );

      if (!ticket) {
        await db.run("ROLLBACK");
        return res
          .status(404)
          .json({ message: "Senha não encontrada ou já foi chamada." });
      }

      // Update ticket
      const result = await db.run(
        `
          UPDATE tickets 
          SET status = 'calling', 
              workstation_id = ?, 
              called_by_user_id = ?, 
              called_at = CURRENT_TIMESTAMP,
              is_specific_call = 1
          WHERE id = ? AND status = 'waiting'
        `,
        [workstation_id, user_id, ticket_id],
      );

      if (result.changes === 0) {
        await db.run("ROLLBACK");
        return res
          .status(409)
          .json({ message: "Senha já foi chamada por outro atendente." });
      }

      await db.run("COMMIT");

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

      if (!updatedTicket) {
        throw new Error("Erro ao recuperar senha atualizada");
      }

      broadcast("ticket:calling", updatedTicket);
      res.json(updatedTicket);
    } catch (err: any) {
      await db.run("ROLLBACK").catch(() => {});
      console.error("call-specific error:", err);
      res
        .status(500)
        .json({ message: "Erro ao chamar senha. Tente novamente." });
    }
  });

  // Call Random Ticket
  app.post("/api/tickets/call-random", verifyToken, async (req, res) => {
    const { workstation_id, user_id } = req.body;

    // Find ALL waiting tickets
    const tickets = await db.all(
      'SELECT * FROM tickets WHERE status = "waiting" AND date(created_at) = date("now")',
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
  app.put("/api/tickets/:id/status", verifyToken, async (req, res) => {
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
  app.get("/api/stats", verifyToken, requireAdmin, async (req, res) => {
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
