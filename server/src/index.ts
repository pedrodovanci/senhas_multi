import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import net from "net";
import dotenv from "dotenv";
import { initDb } from "./database";
import jwt from "jsonwebtoken";
import {
  generateToken,
  verifyToken,
  requireAdmin,
  AuthRequest,
} from "./middleware/auth";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const PRINT_DEDUPE_WINDOW_MS = 5000;
const recentPrints = new Map<string, number>();

const shouldPrintTicket = (ticket: any) => {
  const key = String(ticket?.id ?? ticket?.number ?? "");
  if (!key) return true;

  const now = Date.now();
  const last = recentPrints.get(key);
  if (typeof last === "number" && now - last < PRINT_DEDUPE_WINDOW_MS) {
    return false;
  }

  recentPrints.set(key, now);

  for (const [k, ts] of recentPrints.entries()) {
    if (now - ts > PRINT_DEDUPE_WINDOW_MS * 10) {
      recentPrints.delete(k);
    }
  }

  return true;
};

app.use(cors());
app.use(express.json());

const dayRangeUTC3 = () => {
  const now = new Date();
  const utc3Str = new Date(now.getTime() - 3 * 3600000).toISOString();
  const todayStr = utc3Str.split("T")[0];
  
  const startUTC3 = new Date(todayStr + "T00:00:00.000-03:00");
  const endUTC3 = new Date(todayStr + "T23:59:59.999-03:00");
  
  const toSql = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  return { start: toSql(startUTC3), end: toSql(endUTC3) };
};

const toIsoUtc = (raw: unknown) => {
  if (!raw) return raw;
  if (typeof raw !== "string") return raw;
  if (raw.includes("T")) return raw;
  return raw.replace(" ", "T") + ".000Z";
};

const RESERVED_TICKET_PREFIXES = new Set(["AC", "APO", "C", "O"]);

const normalizeDoctorPrefix = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 2 || normalized.length > 4) return null;
  if (RESERVED_TICKET_PREFIXES.has(normalized)) return null;
  return normalized;
};

const getPrinterConfig = () => {
  const host = process.env.PRINTER_HOST;
  if (!host) return null;

  const enabledRaw = String(process.env.PRINTER_ENABLED ?? "true").toLowerCase();
  const enabled = ["1", "true", "yes", "on"].includes(enabledRaw);
  if (!enabled) return null;

  const port = Number(process.env.PRINTER_PORT ?? 9100);
  if (!Number.isFinite(port) || port <= 0) return null;

  return { host, port };
};

const formatTicketLabel = (ticket: any) => {
  const label = ticket?.subtype
    ? String(ticket.subtype).replace(/_/g, " ")
    : String(ticket?.type || "consulta");
  return label.toUpperCase();
};

const buildEscPosPayload = (ticket: any) => {
  const now = new Date().toLocaleString("pt-BR");
  const sep = "--------------------------------";
  const parts: Array<string | Buffer> = [];

  parts.push(Buffer.from([0x1b, 0x40]));
  parts.push(Buffer.from([0x1b, 0x61, 0x01]));
  parts.push(Buffer.from([0x1b, 0x45, 0x01]));
  parts.push("Centro do Cerebro e Coluna\n");
  parts.push(Buffer.from([0x1b, 0x45, 0x00]));
  parts.push("Sistema de Atendimento\n");
  parts.push(`${sep}\n\n`);

  parts.push(Buffer.from([0x1b, 0x45, 0x01]));
  parts.push("SENHA\n");
  parts.push(Buffer.from([0x1d, 0x21, 0x22]));
  parts.push(`${ticket.number}\n`);
  parts.push(Buffer.from([0x1d, 0x21, 0x00]));
  parts.push(Buffer.from([0x1b, 0x45, 0x00]));
  parts.push("\n");

  parts.push(Buffer.from([0x1b, 0x45, 0x01]));
  parts.push(`${formatTicketLabel(ticket)}\n`);
  parts.push(Buffer.from([0x1b, 0x45, 0x00]));
  parts.push("\n");

  if (ticket.doctor_name) {
    parts.push(`${ticket.doctor_name}\n`);
  }

  parts.push(`${sep}\n`);
  parts.push(`${now}\n\n`);
  parts.push("Aguarde ser chamado no painel.\n");
  parts.push("Obrigado pela preferencia.\n\n\n");
  parts.push(Buffer.from([0x1d, 0x56, 0x41, 0x00]));

  return Buffer.concat(
    parts.map((p) => (typeof p === "string" ? Buffer.from(p, "utf8") : p)),
  );
};

const printTicketToNetwork = async (ticket: any) => {
  const cfg = getPrinterConfig();
  if (!cfg) return;
  if (!shouldPrintTicket(ticket)) {
    console.warn(
      `[Printer] Impressão duplicada evitada para ticket ${ticket?.number ?? ""}`,
    );
    return;
  }

  await new Promise<void>((resolve) => {
    const payload = buildEscPosPayload(ticket);

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    const socket = net.createConnection({ host: cfg.host, port: cfg.port });
    socket.setTimeout(5000);

    socket.on("connect", () => {
      socket.end(payload);
    });

    socket.on("timeout", () => {
      console.error(
        `[Printer] Timeout ao imprimir (${cfg.host}:${cfg.port})`,
      );
      socket.destroy();
      done();
    });

    socket.on("error", (err) => {
      console.error(
        `[Printer] Erro ao imprimir (${cfg.host}:${cfg.port}):`,
        err.message,
      );
      done();
    });

    socket.on("close", () => {
      console.log(
        `[Printer] Ticket ${ticket?.number ?? ""} enviado para ${cfg.host}:${cfg.port}`,
      );
      done();
    });
  });
};

const normalizeWorkstationCode = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 2 || normalized.length > 10) return null;
  return normalized;
};

// Helper to broadcast to all connected clients
const broadcast = (type: string, data: any) => {
  const message = JSON.stringify({ type, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

const startServer = async (listen: boolean = true) => {
  const db = await initDb();

  // Removemos a lógica de marcar tickets como "missed" na inicialização 
  // para garantir que o sistema não volte zerado após queda de energia.
  console.log("[Startup] Mantendo estado das senhas para recuperação de queda de energia.");

  // Release locked workstations
  await db.run(`UPDATE workstations SET current_user_id = NULL`);
  console.log("[Startup] Workstations released.");
  const printerHost = process.env.PRINTER_HOST;
  const printerEnabledRaw = String(process.env.PRINTER_ENABLED ?? "true").toLowerCase();
  const printerEnabled = ["1", "true", "yes", "on"].includes(printerEnabledRaw);
  const printerPort = Number(process.env.PRINTER_PORT ?? 9100);
  if (!printerHost) {
    console.warn("[Startup] Impressora desativada: PRINTER_HOST não configurado.");
  } else if (!printerEnabled) {
    console.warn("[Startup] Impressora desativada: PRINTER_ENABLED=false.");
  } else if (!Number.isFinite(printerPort) || printerPort <= 0) {
    console.warn("[Startup] Impressora desativada: PRINTER_PORT inválido.");
  } else {
    console.log(`[Startup] Impressora configurada: ${printerHost}:${printerPort}`);
  }

  // --- API Routes ---

  app.get("/assets/audio/alert.mp3", (req, res) => {
    const p1 = path.resolve(process.cwd(), "..", "dragon-studio-alert-444816.mp3");
    const p2 = path.resolve(process.cwd(), "dragon-studio-alert-444816.mp3");
    if (fs.existsSync(p1)) return res.sendFile(p1);
    if (fs.existsSync(p2)) return res.sendFile(p2);
    res.status(404).send("Not found");
  });

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

      if (!workstation.is_active) {
        return res.status(400).json({
          success: false,
          message: "Este posto de trabalho está desativado.",
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
        "UPDATE workstations SET current_user_id = ? WHERE id = ?",
        [user.id, workstation_id],
      );
      broadcast("workstation:updated", {
        id: workstation.id,
        current_user_id: user.id,
      });
    }

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  });

  app.post("/api/totem-login", async (req, res) => {
    const { workstation_id } = req.body;

    if (!workstation_id) {
      return res.status(400).json({
        success: false,
        message: "Posto de trabalho obrigatório",
      });
    }

    const user = await db.get("SELECT * FROM users WHERE username = 'totem'");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário totem não encontrado",
      });
    }

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

    if (!workstation.is_active) {
      return res.status(400).json({
        success: false,
        message: "Este posto de trabalho está desativado.",
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

    await db.run(
      "UPDATE workstations SET current_user_id = ? WHERE id = ?",
      [user.id, workstation_id],
    );
    broadcast("workstation:updated", {
      id: workstation.id,
      current_user_id: user.id,
    });

    const token = generateToken(user);
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
        "UPDATE workstations SET current_user_id = NULL WHERE id = ? AND current_user_id = ?",
        [workstation_id, user_id],
      );
      broadcast("workstation:updated", {
        id: workstation_id,
        current_user_id: null,
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
    const workstations = await db.all(
      "SELECT * FROM workstations WHERE is_active = 1",
    );
    res.json(workstations);
  });

  app.get("/api/admin/workstations", verifyToken, requireAdmin, async (_req, res) => {
    const workstations = await db.all("SELECT * FROM workstations");
    res.json(workstations);
  });

  app.post(
    "/api/admin/workstations",
    verifyToken,
    requireAdmin,
    async (req, res) => {
      const { code, name, is_active } = req.body ?? {};
      const normalizedCode = normalizeWorkstationCode(code);
      const normalizedName =
        typeof name === "string" ? name.trim().slice(0, 100) : "";

      if (!normalizedCode) {
        return res.status(400).json({ error: "Código inválido." });
      }
      if (!normalizedName) {
        return res.status(400).json({ error: "Nome inválido." });
      }

      const conflict = await db.get(
        "SELECT id FROM workstations WHERE lower(code) = lower(?) LIMIT 1",
        [normalizedCode],
      );
      if (conflict) {
        return res.status(409).json({ error: "Código já está em uso." });
      }

      const activeValue =
        typeof is_active === "boolean" ? (is_active ? 1 : 0) : 1;

      const result = await db.run(
        "INSERT INTO workstations (code, name, is_active) VALUES (?, ?, ?)",
        [normalizedCode, normalizedName, activeValue],
      );
      const created = await db.get("SELECT * FROM workstations WHERE id = ?", [
        result.lastID,
      ]);
      res.json(created);
    },
  );

  app.put(
    "/api/admin/workstations/:id",
    verifyToken,
    requireAdmin,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "ID inválido." });
      }

      const existing = await db.get("SELECT * FROM workstations WHERE id = ?", [
        id,
      ]);
      if (!existing) {
        return res.status(404).json({ error: "Guichê não encontrado." });
      }

      const { name, is_active } = req.body ?? {};
      const nextName =
        typeof name === "string" ? name.trim().slice(0, 100) : null;

      let nextActive: number | null = null;
      if (typeof is_active === "boolean") {
        nextActive = is_active ? 1 : 0;
      }

      if (nextActive === 0 && existing.current_user_id) {
        return res
          .status(409)
          .json({ error: "Não é possível desativar um guichê ocupado." });
      }

      const newName = nextName ?? existing.name;
      const newActive = nextActive ?? existing.is_active ?? 1;

      await db.run("UPDATE workstations SET name = ?, is_active = ? WHERE id = ?", [
        newName,
        newActive,
        id,
      ]);

      const updated = await db.get("SELECT * FROM workstations WHERE id = ?", [
        id,
      ]);
      res.json(updated);
    },
  );

  // Doctors
  app.get("/api/doctors", async (req, res) => {
    const doctors = await db.all("SELECT * FROM doctors");
    res.json(doctors);
  });

  // Create Doctor
  app.post("/api/doctors", verifyToken, requireAdmin, async (req, res) => {
    const { name, specialization, prefix } = req.body;
    try {
      const normalizedPrefix = normalizeDoctorPrefix(prefix);
      if (!normalizedPrefix) {
        return res.status(400).json({
          error:
            "Prefixo inválido. Use 2–4 caracteres (letras/números), e não use prefixos reservados.",
        });
      }

      const conflict = await db.get(
        "SELECT id FROM doctors WHERE lower(prefix) = lower(?) LIMIT 1",
        [normalizedPrefix],
      );
      if (conflict) {
        return res.status(409).json({ error: "Prefixo já está em uso." });
      }

      const result = await db.run(
        "INSERT INTO doctors (name, specialization, prefix) VALUES (?, ?, ?)",
        [name, specialization, normalizedPrefix],
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
    const { name, specialization, prefix } = req.body;
    try {
      const normalizedPrefix = normalizeDoctorPrefix(prefix);
      if (!normalizedPrefix) {
        return res.status(400).json({
          error:
            "Prefixo inválido. Use 2–4 caracteres (letras/números), e não use prefixos reservados.",
        });
      }

      const conflict = await db.get(
        "SELECT id FROM doctors WHERE id <> ? AND lower(prefix) = lower(?) LIMIT 1",
        [id, normalizedPrefix],
      );
      if (conflict) {
        return res.status(409).json({ error: "Prefixo já está em uso." });
      }

      await db.run(
        "UPDATE doctors SET name = ?, specialization = ?, prefix = ? WHERE id = ?",
        [name, specialization, normalizedPrefix, id],
      );
      const updated = await db.get("SELECT * FROM doctors WHERE id = ?", [id]);
      res.json(updated);
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
    const { status, queue_sector } = req.query;
    let query = `
      SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
      FROM tickets t 
      LEFT JOIN doctors d ON t.doctor_id = d.id 
      LEFT JOIN workstations w ON t.workstation_id = w.id
    `;

    const params: any[] = [];
    const rng = dayRangeUTC3();

    // Always filter by today's date for operational views
    // Use /api/tickets/history for historical data
    query += " WHERE t.created_at BETWEEN ? AND ?";
    params.push(rng.start, rng.end);

    if (status) {
      query += " AND t.status = ?";
      params.push(status);
    }

    if (queue_sector) {
      query += " AND t.queue_sector = ?";
      params.push(queue_sector);
    }

    query += " ORDER BY t.created_at ASC";

    const tickets = await db.all(query, params);
    res.json(tickets);
  });

  // Create Ticket
  app.post("/api/tickets", verifyToken, async (req, res) => {
    const { doctor_id, type, subtype } = req.body; // type: 'consulta' | 'outros'
    // subtype (optional): 'agendamento_cirurgico' | 'apoio'

    // Determine prefix based on type
    let prefix = type === "outros" ? "O" : "C";

    if (subtype === "apoio") {
      prefix = "APO";
    }

    if (subtype === "agendamento_cirurgico") {
      prefix = "AC";
    }

    const queue_sector =
      subtype === "agendamento_cirurgico" ? "cirurgia" : "recepcao";

    try {
      await db.run("BEGIN IMMEDIATE");

      if (type !== "outros" && !subtype && doctor_id) {
        const doctor = await db.get("SELECT prefix FROM doctors WHERE id = ?", [
          doctor_id,
        ]);
        const normalized = normalizeDoctorPrefix(doctor?.prefix);
        if (normalized) {
          prefix = normalized;
        }
      }

      const rng = dayRangeUTC3();
      const prefixKey = String(prefix).toLowerCase();
      const startIndex = prefixKey.length + 1;
      const maxRow = await db.get(
        `
          SELECT MAX(CAST(SUBSTR(number, ?) AS INTEGER)) as max_num
          FROM tickets
          WHERE lower(number) LIKE ?
          AND created_at BETWEEN ? AND ?
        `,
        [startIndex, `${prefixKey}%`, rng.start, rng.end],
      );
      const nextNum = (maxRow?.max_num || 0) + 1;
      const ticketNumber = `${prefix}${String(nextNum).padStart(3, "0")}`;

      const result = await db.run(
        "INSERT INTO tickets (number, doctor_id, type, subtype, queue_sector, status) VALUES (?, ?, ?, ?, ?, ?)",
        [
          ticketNumber,
          doctor_id || null,
          type || "consulta",
          subtype || null,
          queue_sector,
          "waiting",
        ],
      );

      await db.run("COMMIT");

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
      void printTicketToNetwork(newTicket);

      res.json(newTicket);
    } catch (err: any) {
      await db.run("ROLLBACK").catch(() => {});
      console.error("Error creating ticket:", err);
      res
        .status(500)
        .json({ message: "Failed to create ticket", error: err.message });
    }
  });

  // Get History (Last 10 called tickets)
  app.get("/api/tickets/history", async (req, res) => {
    const { limit, queue_sector } = req.query;
    let query = `
        SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
        FROM tickets t
        LEFT JOIN doctors d ON t.doctor_id = d.id
        LEFT JOIN workstations w ON t.workstation_id = w.id
        WHERE t.status IN ('calling', 'in_attendance', 'finished', 'missed') 
        AND t.called_at IS NOT NULL
        AND t.created_at BETWEEN ? AND ?
    `;

    const rng = dayRangeUTC3();
    const params: any[] = [rng.start, rng.end];

    if (queue_sector) {
      query += " AND t.queue_sector = ?";
      params.push(queue_sector);
    }

    query += " ORDER BY t.called_at DESC";

    if (limit) {
      query += " LIMIT ?";
      params.push(limit);
    }

    const history = await db.all(query, params);
    res.json(
      history.map((t: any) => ({
        ...t,
        created_at: toIsoUtc(t.created_at),
        called_at: toIsoUtc(t.called_at),
        started_at: toIsoUtc(t.started_at),
        finished_at: toIsoUtc(t.finished_at),
      })),
    );
  });

  // Get No-Show Tickets (Missed)
  app.get("/api/tickets/no-show", async (req, res) => {
    const { queue_sector } = req.query;
    let query = `
        SELECT t.*, d.name as doctor_name
        FROM tickets t
        LEFT JOIN doctors d ON t.doctor_id = d.id
        WHERE t.status = 'missed' 
        AND t.created_at BETWEEN ? AND ?
    `;
    const rng = dayRangeUTC3();
    const params: any[] = [rng.start, rng.end];

    if (queue_sector) {
      query += " AND t.queue_sector = ?";
      params.push(queue_sector);
    }

    query += " ORDER BY t.finished_at DESC";

    const missed = await db.all(query, params);
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
    const ticket = await db.get(
      `
        SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
        FROM tickets t
        LEFT JOIN doctors d ON t.doctor_id = d.id
        LEFT JOIN workstations w ON t.workstation_id = w.id
        WHERE t.id = ?
      `,
      [id],
    );

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Broadcast calling event again
    broadcast("ticket:calling", ticket);
    res.json(ticket);
  });

  // Get Waiting Stats by Doctor
  app.get("/api/tickets/waiting-stats", async (req, res) => {
    const { queue_sector } = req.query;
    const sectorValue =
      typeof queue_sector === "string" ? queue_sector : "recepcao";

    // Get all doctors first
    const doctors = await db.all("SELECT * FROM doctors");

    // Get stats for each doctor
    const stats = await Promise.all(
      doctors.map(async (doc) => {
        // Waiting count for this doctor
        const rng = dayRangeUTC3();
        const waitingCount = await db.get(
          `SELECT count(*) as count FROM tickets WHERE status = "waiting" AND doctor_id = ? AND created_at BETWEEN ? AND ? AND queue_sector = ?`,
          [doc.id, rng.start, rng.end, sectorValue],
        );

        // Oldest waiting ticket
        const oldest = await db.get(
          `SELECT created_at FROM tickets WHERE status = "waiting" AND doctor_id = ? AND created_at BETWEEN ? AND ? AND queue_sector = ? ORDER BY created_at ASC LIMIT 1`,
          [doc.id, rng.start, rng.end, sectorValue],
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
    const rngS = dayRangeUTC3();
    const supportCount = await db.get(
      `SELECT count(*) as count FROM tickets WHERE status = "waiting" AND doctor_id IS NULL AND created_at BETWEEN ? AND ? AND queue_sector = ?`,
      [rngS.start, rngS.end, sectorValue],
    );
    if (supportCount?.count > 0) {
      const oldest = await db.get(
        `SELECT created_at FROM tickets WHERE status = "waiting" AND doctor_id IS NULL AND created_at BETWEEN ? AND ? AND queue_sector = ? ORDER BY created_at ASC LIMIT 1`,
        [rngS.start, rngS.end, sectorValue],
      );

      let waitTimeStr = null;
      if (oldest) {
        const raw = oldest.created_at;
        if (raw && typeof raw === "string") {
          if (raw.includes("T")) {
            waitTimeStr = raw;
          } else {
            waitTimeStr = raw.replace(" ", "T") + ".000Z";
          }
        } else {
          waitTimeStr = raw;
        }
      }

      stats.push({
        doctor_id: null,
        doctor_name:
          sectorValue === "cirurgia" ? "Agendamento Cirurgia" : "Apoio",
        count: supportCount.count,
        oldest_created_at: waitTimeStr,
      });
    }

    res.json(stats);
  });

  // Call Next Ticket (FIFO)
  app.post("/api/tickets/call-next", verifyToken, async (req, res) => {
    const { workstation_id, user_id, doctor_id, queue_sector } = req.body;

    try {
      await db.run("BEGIN IMMEDIATE"); // Locks db for writing

      let query =
        'SELECT * FROM tickets WHERE status = "waiting" AND created_at BETWEEN ? AND ?';
      const rng = dayRangeUTC3();
      const params: any[] = [rng.start, rng.end];

      if (queue_sector) {
        query += " AND queue_sector = ?";
        params.push(queue_sector);
      } else {
        query += " AND queue_sector = 'recepcao'";
      }

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
        'SELECT * FROM tickets WHERE id = ? AND status = "waiting" AND created_at BETWEEN ? AND ?',
        [ticket_id, dayRangeUTC3().start, dayRangeUTC3().end],
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

    try {
      await db.run("BEGIN IMMEDIATE");

      const rng = dayRangeUTC3();
      const tickets = await db.all(
        'SELECT * FROM tickets WHERE status = "waiting" AND created_at BETWEEN ? AND ?',
        [rng.start, rng.end]
      );

      if (tickets.length === 0) {
        await db.run("ROLLBACK");
        return res.status(404).json({ message: "Nenhuma senha aguardando." });
      }

      const ticket = tickets[Math.floor(Math.random() * tickets.length)];

      const result = await db.run(
        `
          UPDATE tickets 
          SET status = 'calling', 
              workstation_id = ?, 
              called_by_user_id = ?, 
              called_at = CURRENT_TIMESTAMP,
              call_type = 'RANDOM'
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

      broadcast("ticket:calling", updatedTicket);
      res.json(updatedTicket);
    } catch (err: any) {
      await db.run("ROLLBACK").catch(() => {});
      console.error("call-random error:", err);
      res
        .status(500)
        .json({ message: "Erro ao chamar senha. Tente novamente." });
    }
  });

  // Update Ticket Status (Start, Finish, Missed)
  app.put("/api/tickets/:id/status", verifyToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'in_attendance', 'finished', 'missed'

    const current = await db.get("SELECT status FROM tickets WHERE id = ?", [id]);
    if (!current) {
      return res.status(404).json({ message: "Senha não encontrada." });
    }
    if (status === "in_attendance" && current.status !== "calling") {
      return res.status(400).json({ message: "Transição inválida." });
    }
    if ((status === "finished" || status === "missed") && current.status !== "in_attendance" && !(status === "missed" && current.status === "calling")) {
      return res.status(400).json({ message: "Transição inválida." });
    }

    if (status === "in_attendance") {
      await db.run(
        "UPDATE tickets SET status = 'in_attendance', started_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'calling'",
        [id]
      );
    } else if (status === "finished") {
      await db.run(
        "UPDATE tickets SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'in_attendance'",
        [id]
      );
    } else if (status === "missed") {
      await db.run(
        "UPDATE tickets SET status = 'missed', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND (status = 'in_attendance' OR status = 'calling')",
        [id]
      );
    } else {
      await db.run("UPDATE tickets SET status = ? WHERE id = ?", [status, id]);
    }

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
    const rng = dayRangeUTC3();
    const totalTickets = await db.get(
      'SELECT count(*) as count FROM tickets WHERE created_at BETWEEN ? AND ?',
      [rng.start, rng.end]
    );
    const waitingTickets = await db.get(
      'SELECT count(*) as count FROM tickets WHERE status = "waiting" AND created_at BETWEEN ? AND ?',
      [rng.start, rng.end]
    );
    const attendedTickets = await db.get(
      'SELECT count(*) as count FROM tickets WHERE status = "finished" AND created_at BETWEEN ? AND ?',
      [rng.start, rng.end]
    );

    // Avg wait time (called_at - created_at)
    const avgWait = await db.get(`
        SELECT AVG((julianday(called_at) - julianday(created_at)) * 24 * 60) as avg_min 
        FROM tickets 
        WHERE called_at IS NOT NULL AND created_at BETWEEN ? AND ?
      `, [rng.start, rng.end]);

    // Ranking by attendant (calls made)
    const ranking = await db.all(`
        SELECT u.username, COUNT(t.id) as count
        FROM tickets t
        JOIN users u ON t.called_by_user_id = u.id
        WHERE t.created_at BETWEEN ? AND ?
        GROUP BY u.username
        ORDER BY count DESC
        LIMIT 5
      `, [rng.start, rng.end]);

    // Avg service time by attendant (finished_at - started_at)
    const avgServiceTime = await db.all(`
        SELECT u.username, AVG((julianday(t.finished_at) - julianday(t.started_at)) * 24 * 60) as avg_min
        FROM tickets t
        JOIN users u ON t.called_by_user_id = u.id
        WHERE t.status = 'finished' AND t.created_at BETWEEN ? AND ?
        GROUP BY u.username
      `, [rng.start, rng.end]);

    // Tickets by type
    const byType = await db.all(`
        SELECT type, COUNT(*) as count
        FROM tickets
        WHERE created_at BETWEEN ? AND ?
        GROUP BY type
      `, [rng.start, rng.end]);

    // Missed count
    const missed = await db.get(
      'SELECT count(*) as count FROM tickets WHERE status = "missed" AND created_at BETWEEN ? AND ?',
      [rng.start, rng.end]
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

  const staticRootCandidates = [
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "../client/dist"),
  ];

  const staticRoot = staticRootCandidates.find((p) =>
    fs.existsSync(path.join(p, "index.html")),
  );

  if (staticRoot) {
    const clientIndexPath = path.join(staticRoot, "index.html");
    app.use(express.static(staticRoot));
    app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
      res.sendFile(clientIndexPath);
    });
  }

  // --- WebSocket ---
  const wsSessions = new Map<number, { userId: number; timer: NodeJS.Timeout | null }>();
  wss.on("connection", (ws) => {
    let wsWorkstation: number | null = null;
    let wsUser: number | null = null;
    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === "auth" && msg?.token && msg?.workstation_id) {
          const secret = process.env.JWT_SECRET;
          if (!secret) return;
          const decoded: any = jwt.verify(msg.token, secret);
          wsWorkstation = Number(msg.workstation_id);
          wsUser = Number(decoded?.id || decoded?.user?.id);
          if (!Number.isFinite(wsWorkstation) || !Number.isFinite(wsUser)) return;
          const prev = wsSessions.get(wsWorkstation);
          if (prev?.timer) {
            clearTimeout(prev.timer);
          }
          wsSessions.set(wsWorkstation, { userId: wsUser, timer: null });
          await db.run(
            "UPDATE workstations SET current_user_id = ? WHERE id = ?",
            [wsUser, wsWorkstation]
          );
          broadcast("workstation:updated", { id: wsWorkstation, current_user_id: wsUser });
        }
      } catch {
      }
    });
    ws.on("close", async () => {
      if (wsWorkstation && wsUser) {
        const key = wsWorkstation;
        const current = wsSessions.get(key);
        if (current) {
          if (current.timer) clearTimeout(current.timer);
          current.timer = setTimeout(async () => {
            const wsRow = await db.get("SELECT current_user_id FROM workstations WHERE id = ?", [key]);
            if (wsRow && wsRow.current_user_id === wsUser) {
              await db.run(
                "UPDATE workstations SET current_user_id = NULL WHERE id = ? AND current_user_id = ?",
                [key, wsUser]
              );
              broadcast("workstation:updated", { id: key, current_user_id: null });
            }
          }, 120000);
          wsSessions.set(key, current);
        }
      }
    });
  });

  const scheduleTicketRecovery = () => {
    const run = async () => {
      const rng = dayRangeUTC3();
      const callingIds = await db.all(
        `SELECT id FROM tickets WHERE status = 'calling' AND called_at IS NOT NULL AND created_at BETWEEN ? AND ? AND (julianday('now') - julianday(called_at)) * 24 * 60 > 15`,
        [rng.start, rng.end]
      );
      if (callingIds.length > 0) {
        const ids = callingIds.map((r: any) => r.id);
        await db.run(
          `UPDATE tickets SET status = 'missed', finished_at = CURRENT_TIMESTAMP WHERE status = 'calling' AND id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
        for (const id of ids) {
          const t = await db.get(
            `SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
             FROM tickets t 
             LEFT JOIN doctors d ON t.doctor_id = d.id 
             LEFT JOIN workstations w ON t.workstation_id = w.id 
             WHERE t.id = ?`,
            [id]
          );
          if (t) broadcast("ticket:missed", t);
        }
      }
      const inAttendanceIds = await db.all(
        `SELECT id FROM tickets WHERE status = 'in_attendance' AND started_at IS NOT NULL AND created_at BETWEEN ? AND ? AND (julianday('now') - julianday(started_at)) * 24 * 60 > 240`,
        [rng.start, rng.end]
      );
      if (inAttendanceIds.length > 0) {
        const ids = inAttendanceIds.map((r: any) => r.id);
        await db.run(
          `UPDATE tickets SET status = 'missed', finished_at = CURRENT_TIMESTAMP WHERE status = 'in_attendance' AND id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
        for (const id of ids) {
          const t = await db.get(
            `SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
             FROM tickets t 
             LEFT JOIN doctors d ON t.doctor_id = d.id 
             LEFT JOIN workstations w ON t.workstation_id = w.id 
             WHERE t.id = ?`,
            [id]
          );
          if (t) broadcast("ticket:missed", t);
        }
      }
    };
    setInterval(run, 60000);
  };
  scheduleTicketRecovery();

  if (listen) {
    const PORT = process.env.PORT || 3000;
    const server = httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log("Shutting down server...");
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  return { app, httpServer, wss, db };
};

if (require.main === module) {
  startServer().catch(console.error);
}

export { app, httpServer, wss, startServer };
