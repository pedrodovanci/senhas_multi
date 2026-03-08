
import dotenv from "dotenv";
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

dotenv.config();

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.error('FATAL: JWT_SECRET não definido no .env. O servidor não pode iniciar.');
    process.exit(1);
}

export interface AuthRequest extends Request {
    user?: {
        id: number;
        username: string;
        role: string;
    };
}

export const generateToken = (user: { id: number; username: string; role: string }) => {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        SECRET_KEY,
        { expiresIn: '12h' }
    );
};

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ message: 'Token de autenticação não fornecido.' });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded as any;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token inválido ou expirado.' });
    }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Acesso restrito a administradores.' });
    }
    next();
};
