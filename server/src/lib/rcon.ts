import { Rcon } from 'rcon-client';

const RCON_HOST = process.env.MINECRAFT_HOST ?? 'minecraft';
const RCON_PORT = parseInt(process.env.RCON_PORT ?? '25575');
const RCON_PASSWORD = process.env.RCON_PASSWORD ?? '';

export async function withRcon<T>(fn: (rcon: Rcon) => Promise<T>): Promise<T> {
  const rcon = new Rcon({ host: RCON_HOST, port: RCON_PORT, password: RCON_PASSWORD, timeout: 5000 });
  await rcon.connect();
  try {
    return await fn(rcon);
  } finally {
    await rcon.end();
  }
}
