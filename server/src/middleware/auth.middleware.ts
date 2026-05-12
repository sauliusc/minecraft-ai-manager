import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../lib/jwt.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccess(token);
    (req as Request & { user: typeof payload }).user = payload;
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
