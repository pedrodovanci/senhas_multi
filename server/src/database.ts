import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcrypt";

export const initDb = async () => {
  const db = await open({
    filename: "./database.sqlite",
    driver: sqlite3.Database,
  });

  // Performance and Safety settings
  await db.run("PRAGMA journal_mode = WAL"); // Allows simultaneous readers during writers
  await db.run("PRAGMA busy_timeout = 5000"); // Wait up to 5s if locked
  await db.run("PRAGMA synchronous = NORMAL"); // Balance between safety and performance

  // Recreate tables to ensure schema compliance with the new plan
  await db.exec(`
    -- USERS
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT CHECK(role IN ('admin', 'attendant')),
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
      specialization TEXT
    );

    -- TICKETS (Senhas)
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT, -- C001, etc.
      type TEXT CHECK(type IN ('consulta', 'cirurgia')),
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

    -- Migrations: Add new columns if they don't exist
    try {
        await db.run("ALTER TABLE tickets ADD COLUMN requeued_at DATETIME");
    } catch (e) {
        // Column probably exists
    }

    try {
        await db.run("ALTER TABLE tickets ADD COLUMN requeue_count INTEGER DEFAULT 0");
    } catch (e) {
        // Column probably exists
    }

    try {
        await db.run("ALTER TABLE tickets ADD COLUMN is_specific_call BOOLEAN DEFAULT 0");
        console.log("Migration: Added is_specific_call column");
    } catch (e: any) {
        if (!e.message.includes("duplicate column")) {
            console.error("Migration error (is_specific_call):", e);
        }
    }
  `);

  // Seed initial data if empty
  const userCount = await db.get("SELECT count(*) as count FROM users");
  if (userCount.count === 0) {
    const adminHash = await bcrypt.hash("admin", 10);
    const attendantHash = await bcrypt.hash("1234", 10);

    await db.exec(`
      INSERT INTO users (username, password, role) VALUES ('admin', '${adminHash}', 'admin');
      INSERT INTO users (username, password, role) VALUES ('atendente1', '${attendantHash}', 'attendant');
      INSERT INTO users (username, password, role) VALUES ('atendente2', '${attendantHash}', 'attendant');
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
      await db.run(
        `INSERT INTO workstations (code, name) VALUES ('G${num}', 'Guichê ${num}')`,
      );
    }
  }

  const docCount = await db.get("SELECT count(*) as count FROM doctors");
  if (docCount.count === 0) {
    await db.exec(`
      INSERT INTO doctors (name, specialization) VALUES ('Dr. João Silva', 'Neurologia');
      INSERT INTO doctors (name, specialization) VALUES ('Dra. Maria Souza', 'Neurocirurgia');
      INSERT INTO doctors (name, specialization) VALUES ('Dr. Carlos Rocha', 'Ortopedia');
      INSERT INTO doctors (name, specialization) VALUES ('Dr. Ana Costa', 'Cirurgia Geral');
    `);
  }

  return db;
};
