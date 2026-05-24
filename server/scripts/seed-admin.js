// Idempotent admin seeder — runs on every container start, does nothing if:
//   • ADMIN_EMAIL / ADMIN_PASSWORD env vars are not set
//   • a user with that email already exists
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  process.exit(0);
}

const prisma = new PrismaClient();

try {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists (${email}) — skipping seed`);
  } else {
    const hash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: { email, passwordHash: hash, role: 'SUPER_ADMIN', autoConfirm: true, name: process.env.ADMIN_NAME ?? 'Admin' },
    });
    console.log(`Admin account created: ${email}`);
    console.log('⚠  Change your password after first login!');
  }
} finally {
  await prisma.$disconnect();
}
