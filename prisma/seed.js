import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';

const BCRYPT_ROUNDS = 12;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const seed = async () => {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.ADMIN_NAME || 'Administrator').trim().slice(0, 60);

  if (!email) {
    console.warn('[seed] ADMIN_EMAIL is not set, nothing to do');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`[seed] ADMIN_EMAIL is not a valid email: ${email}`);
  }

  let admin = await prisma.user.findUnique({ where: { email } });

  if (admin) {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'admin', status: 'approved', reviewedAt: admin.reviewedAt ?? new Date() },
    });
    console.log(`[seed] ${email} already exists, ensured role=admin and status=approved`);
  } else {
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new Error(
        `[seed] ADMIN_PASSWORD must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`,
      );
    }
    admin = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        role: 'admin',
        status: 'approved',
        reviewedAt: new Date(),
      },
    });
    console.log(`[seed] created admin ${email}`);
  }

  const { count } = await prisma.project.updateMany({
    where: { userId: null },
    data: { userId: admin.id },
  });
  if (count > 0) console.log(`[seed] assigned ${count} project(s) without owner to ${email}`);
};

seed()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
