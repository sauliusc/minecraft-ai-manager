import express, { Request, Response, NextFunction } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
const APP_VERSION: string = pkg.version;
const GIT_SHA: string = (process.env.GIT_SHA ?? 'dev').slice(0, 7);
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth.js';
import { playersRouter } from './routes/players.js';
import { challengesRouter } from './routes/challenges.js';
import { rewardsRouter } from './routes/rewards.js';
import { bridgeRouter } from './routes/bridge.js';
import { eventsRouter } from './routes/events.js';
import { moderationRouter } from './routes/moderation.js';
import { broadcastRouter } from './routes/broadcast.js';
import { analyticsRouter } from './routes/analytics.js';
import { npcsRouter } from './routes/npcs.js';
import { economyRouter } from './routes/economy.js';
import { clansRouter } from './routes/clans.js';
import { cosmeticsRouter } from './routes/cosmetics.js';
import { voteRouter } from './routes/vote.js';
import { minecraftRouter } from './routes/minecraft.js';
import { aiRouter } from './routes/ai.js';
import { weekThemeRouter } from './routes/weekTheme.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim());

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded, try again in a minute', statusCode: 429 },
});
app.use('/api', globalLimiter);

app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/version', (_req, res) => {
  res.json({ version: APP_VERSION, gitSha: GIT_SHA });
});

app.use('/api/auth', authRouter);
app.use('/api/players', playersRouter);
app.use('/api/challenges', challengesRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/bridge', bridgeRouter);
app.use('/api/events', eventsRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/broadcast', broadcastRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/npcs', npcsRouter);
app.use('/api/economy', economyRouter);
app.use('/api/clans', clansRouter);
app.use('/api/cosmetics', cosmeticsRouter);
app.use('/api/vote', voteRouter);
app.use('/api/minecraft', minecraftRouter);
app.use('/api/ai', aiRouter);
app.use('/api/ai/week-theme', weekThemeRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`CraftControl API listening on port ${port}`);
  });
}

export default app;
