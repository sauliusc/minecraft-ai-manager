import express from 'express';

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`CraftControl API listening on port ${port}`);
});

export default app;
