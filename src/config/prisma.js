import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

export const pingDB = async () => {
  await prisma.$queryRaw`SELECT 1`;
};

export const disconnectDB = () => prisma.$disconnect();
