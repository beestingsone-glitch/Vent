import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db, SUPER_ADMIN_EMAIL, UserRecord } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'privacy-chat-secure-jwt-secret-key-999';

export interface AuthRequest extends Request {
  user?: UserRecord;
}

export function generateToken(user: UserRecord): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyTokenString(token: string): { id: string; email: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyTokenString(token);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
    return;
  }

  const user = db.findUserById(payload.id);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: User not found' });
    return;
  }

  if (user.is_banned) {
    res.status(403).json({ error: 'Account has been banned or suspended' });
    return;
  }

  req.user = user;
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const isSuperAdmin = req.user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() || req.user.role === 'admin';
  if (!isSuperAdmin) {
    res.status(403).json({ error: 'Forbidden: Super Admin access required' });
    return;
  }

  next();
}
