"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = exports.verifyToken = exports.generateToken = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
dotenv_1.default.config();
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.error('FATAL: JWT_SECRET não definido no .env. O servidor não pode iniciar.');
    process.exit(1);
}
const generateToken = (user) => {
    return jsonwebtoken_1.default.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '12h' });
};
exports.generateToken = generateToken;
const verifyToken = (req, res, next) => {
    var _a;
    const token = (_a = req.headers['authorization']) === null || _a === void 0 ? void 0 : _a.split(' ')[1];
    if (!token) {
        return res.status(403).json({ message: 'Token de autenticação não fornecido.' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    }
    catch (err) {
        return res.status(401).json({ message: 'Token inválido ou expirado.' });
    }
};
exports.verifyToken = verifyToken;
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Acesso restrito a administradores.' });
    }
    next();
};
exports.requireAdmin = requireAdmin;
