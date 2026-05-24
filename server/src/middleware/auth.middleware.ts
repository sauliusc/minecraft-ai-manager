import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../lib/jwt.js';

export interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
    name: string;
    autoConfirm: boolean;
  };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccess(token);
    (req as AuthenticatedRequest).user = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name ?? '',
      autoConfirm: payload.autoConfirm ?? false,
    };
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

export function serviceTokenMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || token !== process.env.BRIDGE_SECRET) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid service token' });
    return;
  }
  next();
}

export const requireAutoConfirm = (req: Request, res: Response, next: NextFunction): void => {
  const user = (req as AuthenticatedRequest).user;
  if (!user?.autoConfirm) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'This action requires autoConfirm=true', statusCode: 403 });
    return;
  }
  next();
};
