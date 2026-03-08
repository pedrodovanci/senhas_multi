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
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
(() => __awaiter(void 0, void 0, void 0, function* () {
    const db = yield (0, sqlite_1.open)({
        filename: './database.sqlite',
        driver: sqlite3_1.default.Database
    });
    try {
        yield db.run("INSERT INTO users (username, password, role) VALUES ('atendente', '123456', 'attendant')");
        console.log("User 'atendente' created.");
    }
    catch (e) {
        console.log("User exists, updating password...");
        yield db.run("UPDATE users SET password = '123456' WHERE username = 'atendente'");
        console.log("User 'atendente' password updated.");
    }
}))();
