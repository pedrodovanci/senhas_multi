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
const initDb = () => __awaiter(void 0, void 0, void 0, function* () {
    const db = yield (0, sqlite_1.open)({
        filename: './database.sqlite',
        driver: sqlite3_1.default.Database
    });
    // Recreate tables to ensure schema compliance with the new plan
    yield db.exec(`
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
  `);
    // Seed initial data if empty
    const userCount = yield db.get('SELECT count(*) as count FROM users');
    if (userCount.count === 0) {
        yield db.exec(`
      INSERT INTO users (username, password, role) VALUES ('admin', 'admin', 'admin');
      INSERT INTO users (username, password, role) VALUES ('atendente1', '1234', 'attendant');
      INSERT INTO users (username, password, role) VALUES ('atendente2', '1234', 'attendant');
    `);
    }
    const wsCount = yield db.get('SELECT count(*) as count FROM workstations');
    if (wsCount.count === 0) {
        // Create G01 to G12
        for (let i = 1; i <= 12; i++) {
            const num = String(i).padStart(2, '0');
            yield db.run(`INSERT INTO workstations (code, name) VALUES ('G${num}', 'Guichê ${num}')`);
        }
    }
    const docCount = yield db.get('SELECT count(*) as count FROM doctors');
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
