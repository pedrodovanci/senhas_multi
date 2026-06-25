import dotenv from "dotenv";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import crypto from "crypto";

dotenv.config();

let SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
  console.warn(
    "WARN: JWT_SECRET não encontrado no .env. Gerando um novo segredo...",
  );

  // Generate a random secret
  const newSecret = crypto.randomBytes(32).toString("hex");
  const envPath = path.resolve(process.cwd(), ".env");

  try {
    // Check if .env exists
    if (fs.existsSync(envPath)) {
      // Append to existing .env
      fs.appendFileSync(envPath, `\nJWT_SECRET=${newSecret}\n`);
    } else {
      // Create new .env
      fs.writeFileSync(envPath, `JWT_SECRET=${newSecret}\n`);
    }

    // Update process.env
    process.env.JWT_SECRET = newSecret;
    SECRET_KEY = newSecret;

    console.log("SUCCESS: Novo JWT_SECRET gerado e salvo no .env.");
  } catch (error) {
    console.error("ERROR: Falha ao escrever no arquivo .env:", error);
    // Fallback for this session only if file write fails
    process.env.JWT_SECRET = newSecret;
    SECRET_KEY = newSecret;
  }
}

if (!SECRET_KEY) {
  console.error(
    "FATAL: JWT_SECRET não definido e falha ao gerar. O servidor não pode iniciar.",
  );
  process.exit(1);
}

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
    doctor_id?: number;
  };
}

export const generateToken = (user: {
  id: number;
  username: string;
  role: string;
  doctor_id?: number | null;
}) => {
  const payload: Record<string, unknown> = {
    id: user.id,
    username: user.username,
    role: user.role,
  };
  if (user.doctor_id != null) {
    payload.doctor_id = user.doctor_id;
  }
  return jwt.sign(payload, SECRET_KEY, { expiresIn: "12h" });
};

export const verifyToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res
      .status(403)
      .json({ message: "Token de autenticação não fornecido." });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded as any;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user || req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Acesso restrito a administradores." });
  }
  next();
};

export const requireMedico = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user || req.user.role !== "medico" || !req.user.doctor_id) {
    return res
      .status(403)
      .json({ message: "Acesso restrito a médicos com fila habilitada." });
  }
  next();
};
