import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcryptjs";

export const initDb = async () => {
  console.log("Initializing database...");
  const db = await open({
    filename: "./database.sqlite",
    driver: sqlite3.Database,
  });

  // Performance and Safety settings
  await db.run("PRAGMA journal_mode = WAL"); // Allows simultaneous readers during writers
  await db.run("PRAGMA busy_timeout = 5000"); // Wait up to 5s if locked
  await db.run("PRAGMA synchronous = NORMAL"); // Balance between safety and performance

  // Check for interrupted migration
  const ticketsOld = await db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tickets_old'",
  );
  if (ticketsOld) {
    console.warn(
      "Found tickets_old table. Previous migration might have failed. Restoring...",
    );
    await db.run("DROP TABLE IF EXISTS tickets");
    await db.run("ALTER TABLE tickets_old RENAME TO tickets");
    console.log("Restored tickets table from tickets_old.");
  }

  // Check for interrupted users migration
  const usersOld = await db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='users_old'",
  );
  if (usersOld) {
    console.warn(
      "Found users_old table. Previous migration might have failed. Restoring...",
    );
    await db.run("DROP TABLE IF EXISTS users");
    await db.run("ALTER TABLE users_old RENAME TO users");
    console.log("Restored users table from users_old.");
  }

  // Check if users table needs migration for 'cirurgia' role
  const usersTable = await db.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
  );
  if (usersTable && !usersTable.sql.includes("'cirurgia'")) {
    console.log("Migrating users table to support 'cirurgia' role...");
    await db.run("PRAGMA foreign_keys=OFF");
    await db.run("ALTER TABLE users RENAME TO users_old");
    await db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT CHECK(role IN ('admin', 'attendant', 'cirurgia')),
        active BOOLEAN DEFAULT 1
      )
    `);
    await db.run(
      "INSERT INTO users (id, username, password, role, active) SELECT id, username, password, role, active FROM users_old",
    );
    await db.run("DROP TABLE users_old");
    await db.run("PRAGMA foreign_keys=ON");
    console.log("Users table migrated.");
  }

  // Check if tickets table needs migration for 'outros' type
  const ticketsTable = await db.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='tickets'",
  );
  if (ticketsTable && !ticketsTable.sql.includes("'outros'")) {
    console.log("Migrating tickets table to support 'outros' type...");

    // Get existing columns
    const columns = await db.all("PRAGMA table_info(tickets)");
    const columnNames = columns.map((c: any) => c.name);

    await db.run("PRAGMA foreign_keys=OFF");
    await db.run("ALTER TABLE tickets RENAME TO tickets_old");

    await db.run(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT,
        doctor_id INTEGER,
        type TEXT CHECK(type IN ('consulta', 'cirurgia', 'outros')),
        subtype TEXT, -- 'agendamento_cirurgico', 'apoio', etc.
        queue_sector TEXT DEFAULT 'recepcao', -- 'recepcao', 'cirurgia'
        status TEXT CHECK(status IN ('waiting', 'calling', 'in_attendance', 'finished', 'missed')),
        workstation_id INTEGER,
        called_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        called_at DATETIME,
        started_at DATETIME,
        finished_at DATETIME,
        requeued_at DATETIME,
        requeue_count INTEGER DEFAULT 0,
        call_type TEXT,
        is_specific_call BOOLEAN DEFAULT 0,
        FOREIGN KEY(doctor_id) REFERENCES doctors(id),
        FOREIGN KEY(workstation_id) REFERENCES workstations(id),
        FOREIGN KEY(called_by_user_id) REFERENCES users(id)
      )
    `);

    // Prepare column mapping for INSERT
    const newColumns = [
      "id",
      "number",
      "doctor_id",
      "type",
      "subtype",
      "queue_sector",
      "status",
      "workstation_id",
      "called_by_user_id",
      "created_at",
      "called_at",
      "started_at",
      "finished_at",
      "requeued_at",
      "requeue_count",
      "call_type",
      "is_specific_call",
    ];

    const selectColumns = newColumns.map((col) => {
      if (columnNames.includes(col)) {
        return col;
      } else {
        // Default values for new columns
        if (col === "queue_sector") return "'recepcao'";
        if (col === "requeue_count") return "0";
        if (col === "is_specific_call") return "0";
        return "NULL";
      }
    });

    const insertSql = `
      INSERT INTO tickets (${newColumns.join(", ")}) 
      SELECT ${selectColumns.join(", ")} FROM tickets_old
    `;

    await db.run(insertSql);

    await db.run("DROP TABLE tickets_old");
    await db.run("PRAGMA foreign_keys=ON");
    console.log("Tickets table migrated.");
  }

  // Recreate tables to ensure schema compliance with the new plan
  await db.exec(`
    -- USERS
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT CHECK(role IN ('admin', 'attendant', 'cirurgia')),
      active BOOLEAN DEFAULT 1
    );

    -- WORKSTATIONS (Guichês)
    CREATE TABLE IF NOT EXISTS workstations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE, -- G01, G02, etc.
      name TEXT, -- Optional descriptive name
      current_user_id INTEGER, -- Lock mechanism
      is_active BOOLEAN DEFAULT 1,
      FOREIGN KEY(current_user_id) REFERENCES users(id)
    );

    -- DOCTORS (Maintained for assignment context)
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      specialization TEXT,
      prefix TEXT
    );

    -- TICKETS (Senhas)
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT, -- C001, etc.
      type TEXT CHECK(type IN ('consulta', 'outros')),
      subtype TEXT,
      queue_sector TEXT NOT NULL DEFAULT 'recepcao', -- 'recepcao' | 'cirurgia'
      doctor_id INTEGER,
      status TEXT CHECK(status IN ('waiting', 'calling', 'in_attendance', 'finished', 'missed')) DEFAULT 'waiting',
      call_type TEXT CHECK(call_type IN ('FIFO', 'RANDOM')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      called_at DATETIME,
      started_at DATETIME,
      finished_at DATETIME,
      workstation_id INTEGER,
      called_by_user_id INTEGER,
      FOREIGN KEY(doctor_id) REFERENCES doctors(id),
      FOREIGN KEY(workstation_id) REFERENCES workstations(id),
      FOREIGN KEY(called_by_user_id) REFERENCES users(id)
    );
  `);

  // Migrations: Add new columns if they don't exist
  console.log("Running migrations...");

  const ticketColumns = await db.all("PRAGMA table_info(tickets)");
  const ticketColumnNames = ticketColumns.map((c: any) => c.name);

  if (!ticketColumnNames.includes("requeued_at")) {
    await db.run("ALTER TABLE tickets ADD COLUMN requeued_at DATETIME");
    console.log("Migration: Added requeued_at");
  }

  if (!ticketColumnNames.includes("requeue_count")) {
    await db.run(
      "ALTER TABLE tickets ADD COLUMN requeue_count INTEGER DEFAULT 0",
    );
    console.log("Migration: Added requeue_count");
  }

  if (!ticketColumnNames.includes("is_specific_call")) {
    await db.run(
      "ALTER TABLE tickets ADD COLUMN is_specific_call BOOLEAN DEFAULT 0",
    );
    console.log("Migration: Added is_specific_call column");
  }

  if (!ticketColumnNames.includes("subtype")) {
    await db.run("ALTER TABLE tickets ADD COLUMN subtype TEXT");
    console.log("Migration: Added subtype");
  }

  if (!ticketColumnNames.includes("queue_sector")) {
    await db.run(
      "ALTER TABLE tickets ADD COLUMN queue_sector TEXT NOT NULL DEFAULT 'recepcao'",
    );
    console.log("Migration: Added queue_sector");
  }

  const doctorColumns = await db.all("PRAGMA table_info(doctors)");
  const doctorColumnNames = doctorColumns.map((c: any) => c.name);

  if (!doctorColumnNames.includes("prefix")) {
    await db.run("ALTER TABLE doctors ADD COLUMN prefix TEXT");
    console.log("Migration: Added doctors.prefix");
  }

  const workstationColumns = await db.all(
    "PRAGMA table_info(workstations)",
  );
  const workstationColumnNames = workstationColumns.map((c: any) => c.name);

  if (!workstationColumnNames.includes("is_active")) {
    await db.run(
      "ALTER TABLE workstations ADD COLUMN is_active BOOLEAN DEFAULT 1",
    );
    console.log("Migration: Added workstations.is_active");
  }

  const reservedPrefixes = new Set(["AC", "APO", "C", "O"]);
  const normalizePrefix = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);

  const proposePrefix = (name: string) => {
    const cleaned = name
      .toUpperCase()
      .replace(/\b(dr|dra|doutor|doutora)\b\.?/g, "")
      .replace(/[^A-Z0-9\s]/g, " ")
      .trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "dr";
    const first = parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const initials = normalizePrefix(`${first[0] ?? ""}${last[0] ?? ""}`);
    const firstTwo = normalizePrefix(first.slice(0, 2));
    const lastTwo = normalizePrefix(last.slice(0, 2));
    const firstLast3 = normalizePrefix(`${first[0] ?? ""}${last.slice(0, 2)}`);
    return [initials, firstLast3, lastTwo, firstTwo].find(Boolean) || "dr";
  };

  const existingDoctors = await db.all("SELECT id, name, prefix FROM doctors");
  const used = new Set<string>(
    existingDoctors
      .map((d: any) => (d.prefix ? normalizePrefix(String(d.prefix)) : ""))
      .filter(Boolean),
  );

  for (const doc of existingDoctors) {
    const current = doc.prefix ? normalizePrefix(String(doc.prefix)) : "";
    if (current && !reservedPrefixes.has(current)) continue;

    let candidate = proposePrefix(String(doc.name || ""));
    if (reservedPrefixes.has(candidate) || !candidate) {
      candidate = normalizePrefix(String(doc.name || "").slice(0, 2)) || "dr";
    }

    if (reservedPrefixes.has(candidate) || candidate.length < 2) {
      candidate = "DR";
    }

    let finalPrefix = candidate;
    const base = candidate;
    for (let i = 1; i <= 20 && (reservedPrefixes.has(finalPrefix) || used.has(finalPrefix)); i++) {
      finalPrefix = normalizePrefix(`${base}${i}`);
    }

    if (!finalPrefix || reservedPrefixes.has(finalPrefix) || used.has(finalPrefix)) {
      finalPrefix = normalizePrefix(`D${doc.id}`) || `D${doc.id}`;
    }

    await db.run("UPDATE doctors SET prefix = ? WHERE id = ?", [finalPrefix, doc.id]);
    used.add(finalPrefix);
  }

  // Seed initial data if empty
  const userCount = await db.get("SELECT count(*) as count FROM users");
  if (userCount.count === 0) {
    const adminHash = await bcrypt.hash("admin", 10);
    const attendantHash = await bcrypt.hash("1234", 10);

    await db.exec(`
      INSERT INTO users (username, password, role) VALUES ('admin', '${adminHash}', 'admin');
      INSERT INTO users (username, password, role) VALUES ('atendente1', '${attendantHash}', 'attendant');
      INSERT INTO users (username, password, role) VALUES ('atendente2', '${attendantHash}', 'attendant');
      INSERT INTO users (username, password, role) VALUES ('agendamento_cirurgico', '${attendantHash}', 'cirurgia');
    `);
  }

  // Migration: Hash existing plain text passwords
  const users = await db.all("SELECT * FROM users");
  for (const user of users) {
    if (!user.password.startsWith("$2b$")) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await db.run("UPDATE users SET password = ? WHERE id = ?", [
        hashedPassword,
        user.id,
      ]);
      console.log(`Migrated password for user ${user.username}`);
    }
  }

  const wsCount = await db.get("SELECT count(*) as count FROM workstations");
  if (wsCount.count === 0) {
    // Create G01 to G12
    for (let i = 1; i <= 12; i++) {
      const num = String(i).padStart(2, "0");
      const activeValue = i <= 4 ? 1 : 0;
      await db.run(
        `INSERT INTO workstations (code, name, is_active) VALUES ('G${num}', 'Guichê ${num}', ${activeValue})`,
      );
    }
  }

  // Ensure RET01 exists (Retirada de Senhas)
  const ret01Check = await db.get(
    "SELECT * FROM workstations WHERE code = 'RET01'",
  );
  if (!ret01Check) {
    await db.run(
      "INSERT INTO workstations (code, name) VALUES ('RET01', 'Retirada de Senhas')",
    );
    console.log("Created special workstation: RET01 (Retirada de Senhas)");
  }

  // Ensure CIR01 exists (Posto Cirurgia)
  const cir01Check = await db.get(
    "SELECT * FROM workstations WHERE code = 'CIR01'",
  );
  if (!cir01Check) {
    await db.run(
      "INSERT INTO workstations (code, name) VALUES ('CIR01', 'Posto Cirurgia')",
    );
    console.log("Created special workstation: CIR01 (Posto Cirurgia)");
  }

  // Ensure 'totem' user exists for auto-login
  const totemUser = await db.get(
    "SELECT * FROM users WHERE username = 'totem'",
  );
  if (!totemUser) {
    const totemHash = await bcrypt.hash("totem", 10);
    await db.run(
      "INSERT INTO users (username, password, role) VALUES ('totem', ?, 'attendant')",
      [totemHash],
    );
    console.log("Created special user: totem");
  }

  // Ensure 'agendamento_cirurgico' user exists
  const cirurgiaUser = await db.get(
    "SELECT * FROM users WHERE username = 'agendamento_cirurgico'",
  );
  if (!cirurgiaUser) {
    const cirurgiaHash = await bcrypt.hash("123456", 10); // Password from guide/request if specified, or default
    try {
      await db.run(
        "INSERT INTO users (username, password, role) VALUES ('agendamento_cirurgico', ?, 'cirurgia')",
        [cirurgiaHash],
      );
      console.log("Created special user: agendamento_cirurgico");
    } catch (e: any) {
      console.error(
        "Failed to create agendamento_cirurgico user (possibly due to CHECK constraint on old DB):",
        e.message,
      );
      // Fallback: try to create as attendant if cirurgia fails? No, that would break logic.
      // We'll leave the error log.
    }
  }

  const docCount = await db.get("SELECT count(*) as count FROM doctors");
  if (docCount.count === 0) {
    await db.exec(`
      INSERT INTO doctors (name, specialization, prefix) VALUES ('Dr. João Silva', 'Neurologia', 'JS');
      INSERT INTO doctors (name, specialization, prefix) VALUES ('Dra. Maria Souza', 'Neurocirurgia', 'MS');
      INSERT INTO doctors (name, specialization, prefix) VALUES ('Dr. Carlos Rocha', 'Ortopedia', 'CR');
      INSERT INTO doctors (name, specialization, prefix) VALUES ('Dr. Ana Costa', 'Cirurgia Geral', 'AN');
    `);
  }

  const uvRow: any = await db.get("PRAGMA user_version");
  const userVersion = Number(uvRow?.user_version || 0);
  if (userVersion < 1) {
    await db.run("UPDATE workstations SET is_active = 1");

    for (let i = 5; i <= 12; i++) {
      const num = String(i).padStart(2, "0");
      await db.run(
        "UPDATE workstations SET is_active = 0 WHERE code = ? AND name = ?",
        [`G${num}`, `Guichê ${num}`],
      );
    }

    await db.run("PRAGMA user_version = 1");
  }

  if (userVersion < 2) {
    await db.run(`
      UPDATE tickets
      SET number = 'APO' || SUBSTR(number, 3)
      WHERE subtype = 'apoio'
        AND upper(number) LIKE 'AP%'
        AND upper(number) NOT LIKE 'APO%'
    `);
    await db.run("PRAGMA user_version = 2");
  }

  return db;
};
