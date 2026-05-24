import supertest from 'supertest';
import { prisma } from './prisma.js';
import { signAccess } from './jwt.js';

export interface ExecutorResult {
  status: number;
  body: unknown;
}

export async function executeStoredAction(
  pendingId: string,
  _reviewerUserId: string
): Promise<ExecutorResult> {
  const pending = await prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingId } });
  const originalUser = await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } });

  // Temp token: autoConfirm=true forces adminActionMiddleware to pass through without re-queuing
  const tempToken = signAccess({
    sub: originalUser.id,
    email: originalUser.email,
    name: originalUser.name,
    role: originalUser.role,
    autoConfirm: true,
  });

  // Lazy import app to avoid circular dependency
  const { app } = await import('../index.js');
  const agent = supertest(app);
  const method = pending.method.toLowerCase() as 'post' | 'patch' | 'delete';

  const response = await (agent[method](pending.path) as supertest.Test)
    .set('Authorization', `Bearer ${tempToken}`)
    .set('X-Pending-Action-Id', pending.id)
    .send(pending.body as object);

  return { status: response.status, body: response.body };
}
