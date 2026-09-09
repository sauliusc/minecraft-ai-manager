import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { handleMention } from '../services/serverGod/index.js';

const router = Router();

const mentionSchema = z.object({
  username: z.string().min(1).max(32),
  // Chat is capped well below this in game; the limit is here so an oversized
  // body cannot be used to run up a bill one token at a time.
  message: z.string().min(1).max(500),
});

/**
 * POST /api/servergod/mention — a player said the bot's name in chat.
 *
 * Answers with `{ reply }` when it has something to say. Everything else —
 * rate limited, disabled, model failure — returns 200 with no reply, because
 * the plugin's only sensible response to any of them is identical: stay quiet.
 * A server that announces "the AI is unavailable" every time a child says its
 * name is worse than one that says nothing.
 */
router.post('/mention', serviceTokenMiddleware, async (req: Request, res: Response): Promise<void> => {
  const parsed = mentionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'BAD_REQUEST', message: parsed.error.issues[0]?.message });
    return;
  }

  const result = await handleMention(parsed.data.username, parsed.data.message);
  if (result.spoke) {
    res.json({ reply: result.reply });
    return;
  }
  res.json({ reply: null, reason: result.reason });
});

export default router;
