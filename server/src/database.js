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
exports.initDb = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const bcrypt_1 = __importDefault(require("bcrypt"));
const initDb = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Initializing database...");
    const db = yield (0, sqlite_1.open)({
        filename: "./database.sqlite",
        driver: sqlite3_1.default.Database,
    });
    // Performance and Safety settings
    yield db.run("PRAGMA journal_mode = WAL"); // Allows simultaneous readers during writers
    yield db.run("PRAGMA busy_timeout = 5000"); // Wait up to 5s if locked
    yield db.run("PRAGMA synchronous = NORMAL"); // Balance between safety and performance
    // Check if users table needs migration for 'cirurgia' role
    const usersTable = yield db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
    if (usersTable && !usersTable.sql.includes("'cirurgia'")) {
        console.log("Migrating users table to support 'cirurgia' role...");
        yield db.run("PRAGMA foreign_keys=OFF");
        yield db.run("ALTER TABLE users RENAME TO users_old");
        yield db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT CHECK(role IN ('admin', 'attendant', 'cirurgia')),
        active BOOLEAN DEFAULT 1
      )
    `);
        yield db.run("INSERT INTO users (id, username, password, role, active) SELECT id, username, password, role, active FROM users_old");
        yield db.run("DROP TABLE users_old");
        yield db.run("PRAGMA foreign_keys=ON");
        console.log("Users table migrated.");
    }
    // Check if tickets table needs migration for 'outros' type
    const ticketsTable = yield db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='tickets'");
    if (ticketsTable && !ticketsTable.sql.includes("'outros'")) {
        console.log("Migrating tickets table to support 'outros' type...");
        yield db.run("PRAGMA foreign_keys=OFF");
        yield db.run("ALTER TABLE tickets RENAME TO tickets_old");
        yield db.run(`
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
        // Copy data - handle potential missing columns in old table by selecting common columns explicitly
        // Assuming old table might not have subtype, queue_sector, etc. if very old, but we just added them via migrations
        // If we just ran migrations, the columns exist in tickets_old (which was tickets a moment ago).
        // However, if the old schema had a CHECK constraint, we need to be careful.
        // The previous migrations added columns to the table. So tickets_old SHOULD have them.
        yield db.run(`
      INSERT INTO tickets (
        id, number, doctor_id, type, subtype, queue_sector, status, 
        workstation_id, called_by_user_id, created_at, called_at, 
        started_at, finished_at, requeued_at, requeue_count, 
        call_type, is_specific_call
      ) 
      SELECT 
        id, number, doctor_id, type, subtype, queue_sector, status, 
        workstation_id, called_by_user_id, created_at, called_at, 
        started_at, finished_at, requeued_at, requeue_count, 
        call_type, is_specific_call
      FROM tickets_old
    `);
        yield db.run("DROP TABLE tickets_old");
        yield db.run("PRAGMA foreign_keys=ON");
        console.log("Tickets table migrated.");
    }
    // Recreate tables to ensure schema compliance with the new plan
    yield db.exec(`
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
      specialization TEXT
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
    try {
        yield db.run("ALTER TABLE tickets ADD COLUMN requeued_at DATETIME");
        console.log("Migration: Added requeued_at");
    }
    catch (e) {
        console.log("Migration skipped (requeued_at):", e.message);
    }
    try {
        yield db.run("ALTER TABLE tickets ADD COLUMN requeue_count INTEGER DEFAULT 0");
        console.log("Migration: Added requeue_count");
    }
    catch (e) {
        console.log("Migration skipped (requeue_count):", e.message);
    }
    try {
        yield db.run("ALTER TABLE tickets ADD COLUMN is_specific_call BOOLEAN DEFAULT 0");
        console.log("Migration: Added is_specific_call column");
    }
    catch (e) {
        if (!e.message.includes("duplicate column")) {
            console.error("Migration error (is_specific_call):", e);
        }
        else {
            console.log("Migration skipped (is_specific_call): duplicate column");
        }
    }
    try {
        yield db.run("ALTER TABLE tickets ADD COLUMN subtype TEXT");
        console.log("Migration: Added subtype");
    }
    catch (e) {
        console.log("Migration skipped (subtype):", e.message);
    }
    try {
        yield db.run("ALTER TABLE tickets ADD COLUMN queue_sector TEXT NOT NULL DEFAULT 'recepcao'");
        console.log("Migration: Added queue_sector");
    }
    catch (e) {
        console.log("Migration skipped (queue_sector):", e.message);
    }
    // Seed initial data if empty
    const userCount = yield db.get("SELECT count(*) as count FROM users");
    if (userCount.count === 0) {
        const adminHash = yield bcrypt_1.default.hash("admin", 10);
        const attendantHash = yield bcrypt_1.default.hash("1234", 10);
        yield db.exec(`
      INSERT INTO users (username, password, role) VALUES ('admin', '${adminHash}', 'admin');
      INSERT INTO users (username, password, role) VALUES ('atendente1', '${attendantHash}', 'attendant');
      INSERT INTO users (username, password, role) VALUES ('atendente2', '${attendantHash}', 'attendant');
      INSERT INTO users (username, password, role) VALUES ('agendamento_cirurgico', '${attendantHash}', 'cirurgia');
    `);
    }
    // Migration: Hash existing plain text passwords
    const users = yield db.all("SELECT * FROM users");
    for (const user of users) {
        if (!user.password.startsWith("$2b$")) {
            const hashedPassword = yield bcrypt_1.default.hash(user.password, 10);
            yield db.run("UPDATE users SET password = ? WHERE id = ?", [
                hashedPassword,
                user.id,
            ]);
            console.log(`Migrated password for user ${user.username}`);
        }
    }
    const wsCount = yield db.get("SELECT count(*) as count FROM workstations");
    if (wsCount.count === 0) {
        // Create G01 to G12
        for (let i = 1; i <= 12; i++) {
            const num = String(i).padStart(2, "0");
            yield db.run(`INSERT INTO workstations (code, name) VALUES ('G${num}', 'Guichê ${num}')`);
        }
    }
    // Ensure RET01 exists (Retirada de Senhas)
    const ret01Check = yield db.get("SELECT * FROM workstations WHERE code = 'RET01'");
    if (!ret01Check) {
        yield db.run("INSERT INTO workstations (code, name) VALUES ('RET01', 'Retirada de Senhas')");
        console.log("Created special workstation: RET01 (Retirada de Senhas)");
    }
    // Ensure CIR01 exists (Posto Cirurgia)
    const cir01Check = yield db.get("SELECT * FROM workstations WHERE code = 'CIR01'");
    if (!cir01Check) {
        yield db.run("INSERT INTO workstations (code, name) VALUES ('CIR01', 'Posto Cirurgia')");
        console.log("Created special workstation: CIR01 (Posto Cirurgia)");
    }
    // Ensure 'totem' user exists for auto-login
    const totemUser = yield db.get("SELECT * FROM users WHERE username = 'totem'");
    if (!totemUser) {
        const totemHash = yield bcrypt_1.default.hash("totem", 10);
        yield db.run("INSERT INTO users (username, password, role) VALUES ('totem', ?, 'attendant')", [totemHash]);
        console.log("Created special user: totem");
    }
    // Ensure 'agendamento_cirurgico' user exists
    const cirurgiaUser = yield db.get("SELECT * FROM users WHERE username = 'agendamento_cirurgico'");
    if (!cirurgiaUser) {
        const cirurgiaHash = yield bcrypt_1.default.hash("123456", 10); // Password from guide/request if specified, or default
        try {
            yield db.run("INSERT INTO users (username, password, role) VALUES ('agendamento_cirurgico', ?, 'cirurgia')", [cirurgiaHash]);
            console.log("Created special user: agendamento_cirurgico");
        }
        catch (e) {
            console.error("Failed to create agendamento_cirurgico user (possibly due to CHECK constraint on old DB):", e.message);
            // Fallback: try to create as attendant if cirurgia fails? No, that would break logic.
            // We'll leave the error log.
        }
    }
    const docCount = yield db.get("SELECT count(*) as count FROM doctors");
    if (docCount.count === 0) {
        yield db.exec(`
      INSERT INTO doctors (name, specialization) VALUES ('Dr. João Silva', 'Neurologia');
      INSERT INTO doctors (name, specialization) VALUES ('Dra. Maria Souza', 'Neurocirurgia');
      INSERT INTO doctors (name, specialization) VALUES ('Dr. Carlos Rocha', 'Ortopedia');
      INSERT INTO doctors (name, specialization) VALUES ('Dr. Ana Costa', 'Cirurgia Geral');
    `);
    }
    return db;
});
exports.initDb = initDb;
