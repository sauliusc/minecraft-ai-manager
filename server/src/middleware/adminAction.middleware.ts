import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import type { AuthenticatedRequest } from './auth.middleware.js';

interface ActionMeta {
  resource: string;
}

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const clone = JSON.parse(JSON.stringify(body));
  const sensitiveKeys = /password|secret|token|hash|key/i;
  function scrub(obj: Record<string, unknown>) {
    for (const key of Object.keys(obj)) {
      if (sensitiveKeys.test(key)) {
        delete obj[key];
      } else if (obj[key] && typeof obj[key] === 'object') {
        scrub(obj[key] as Record<string, unknown>);
      }
    }
  }
  scrub(clone as Record<string, unknown>);
  return clone;
}

function extractIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function buildAction(method: string, resource: string, req: Request): string {
  if (method === 'POST') return `Created ${resource}`;
  if (method === 'PATCH') return `Updated ${resource} ${req.params.id ?? ''}`.trim();
  if (method === 'DELETE') return `Deleted ${resource} ${req.params.id ?? ''}`.trim();
  return `${method} ${resource}`;
}

export function adminActionMiddleware(meta: ActionMeta) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) return next();
    if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return next();

    const action = buildAction(req.method, meta.resource, req);
    const ip = extractIp(req);
    const pendingActionId = req.headers['x-pending-action-id'] as string | undefined;

    // Only intercept SUPER_ADMIN users; let others fall through to handler's role checks
    if (user.role !== 'SUPER_ADMIN') return next();

    if (user.autoConfirm) {
      // Skip duplicate log entry for re-executions of pending actions
      if (pendingActionId) return next();

      // Patch res.json to log after response
      const originalJson = res.json.bind(res);
      let capturedStatus = 200;
      const origStatus = res.status.bind(res);
      res.status = (code: number) => { capturedStatus = code; return origStatus(code); };
      res.json = (body: unknown) => {
        const result = originalJson(body);
        const rawId = req.params.id ?? (body as any)?.id;
        const resourceId: string | undefined = typeof rawId === 'string' ? rawId : undefined;
        prisma.activityLog.create({
          data: {
            userId: user.sub,
            userEmail: user.email,
            action,
            resource: meta.resource,
            resourceId,
            method: req.method,
            path: req.originalUrl,
            requestBody: sanitizeBody(req.body) as any,
            ipAddress: ip,
            status: capturedStatus >= 400 ? 'FAILED' : 'SUCCESS',
          },
        }).catch((e: Error) => console.error('[ActivityLog]', e.message));
        return result;
      };
      return next();
    }

    // autoConfirm=false — store as pending, return 202
    const [pending] = await Promise.all([
      prisma.pendingAction.create({
        data: {
          userId: user.sub,
          userEmail: user.email,
          action,
          resource: meta.resource,
          method: req.method,
          path: req.originalUrl,
          body: (req.body ?? {}) as any,
          status: 'PENDING',
        },
      }),
    ]);

    await prisma.activityLog.create({
      data: {
        userId: user.sub,
        userEmail: user.email,
        action,
        resource: meta.resource,
        method: req.method,
        path: req.originalUrl,
        requestBody: sanitizeBody(req.body) as any,
        ipAddress: ip,
        status: 'PENDING',
        pendingActionId: pending.id,
      },
    });

    res.status(202).json({
      pendingActionId: pending.id,
      message: 'Action requires confirmation by a SUPER_ADMIN with autoConfirm enabled',
    });
  };
}
