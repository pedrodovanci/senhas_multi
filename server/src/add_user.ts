import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async () => {
    const db = await open({
      filename: './database.sqlite',
      driver: sqlite3.Database
    });

    try {
        await db.run("INSERT INTO users (username, password, role) VALUES ('atendente', '123456', 'attendant')");
        console.log("User 'atendente' created.");
    } catch (e) {
        console.log("User exists, updating password...");
        await db.run("UPDATE users SET password = '123456' WHERE username = 'atendente'");
        console.log("User 'atendente' password updated.");
    }
})();
