import express from 'express';
import cookieParser from 'cookie-parser';
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
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.use(notFoundMiddleware);
app.use(errorMiddleware);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`CraftControl API listening on port ${port}`);
  });
}

export default app;
