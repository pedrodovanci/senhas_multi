
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

(async () => {
    try {
        const db = await open({
            filename: path.resolve(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });
        
        const user = await db.get("SELECT * FROM users WHERE username = 'atendente'");
        if (user) {
            console.log('User found:', user);
            const isHashed = user.password.startsWith('$2b$');
            console.log('Is password hashed?', isHashed);
        } else {
            console.log('User "atendente" not found');
            const allUsers = await db.all("SELECT username, role, password FROM users");
            console.log('Available users:', JSON.stringify(allUsers, null, 2));
        }
    } catch (err) {
        console.error(err);
    }
})();
