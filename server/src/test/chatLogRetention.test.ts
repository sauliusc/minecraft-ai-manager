import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { chatLog: { deleteMany: vi.fn() } },
}));

import { prisma } from '../lib/prisma.js';
import { pruneChatLog, retentionDays } from '../services/chatLogRetention.js';

const ORIGINAL = process.env.CHAT_LOG_RETENTION_DAYS;

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.chatLog.deleteMany as any).mockResolvedValue({ count: 0 });
  delete process.env.CHAT_LOG_RETENTION_DAYS;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CHAT_LOG_RETENTION_DAYS;
  else process.env.CHAT_LOG_RETENTION_DAYS = ORIGINAL;
});

describe('retentionDays', () => {
  it('defaults to 30 days', () => {
    expect(retentionDays()).toBe(30);
  });

  it('honours CHAT_LOG_RETENTION_DAYS', () => {
    process.env.CHAT_LOG_RETENTION_DAYS = '7';
    expect(retentionDays()).toBe(7);
  });

  it('falls back to the default for nonsense values rather than deleting everything', () => {
    for (const bad of ['0', '-5', 'abc', '']) {
      process.env.CHAT_LOG_RETENTION_DAYS = bad;
      expect(retentionDays()).toBe(30);
    }
  });
});

describe('pruneChatLog', () => {
  it('deletes only entries older than the window', async () => {
    const now = new Date('2026-08-21T00:00:00Z');

    await pruneChatLog(now);

    expect(prisma.chatLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-07-22T00:00:00Z') } },
    });
  });

  it('reports how many rows it removed', async () => {
    (prisma.chatLog.deleteMany as any).mockResolvedValue({ count: 42 });
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await pruneChatLog()).toBe(42);

    consoleLog.mockRestore();
  });
});
