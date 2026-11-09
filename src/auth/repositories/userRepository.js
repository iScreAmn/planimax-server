import { prisma } from '../../config/prisma.js';

export const USER_ROLES = ['user', 'admin'];
export const USER_STATUSES = ['pending', 'approved', 'rejected'];

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  status: user.status,
  reviewedAt: user.reviewedAt,
  createdAt: user.createdAt,
});

export const findByEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return prisma.user.findUnique({ where: { email: normalized } });
};

export const findById = (id) => {
  const normalized = String(id || '').trim();
  if (!normalized) return null;
  return prisma.user.findUnique({ where: { id: normalized } });
};

export const createUser = ({ email, name, passwordHash, role = 'user', status = 'pending' }) =>
  prisma.user.create({
    data: {
      email: normalizeEmail(email),
      name,
      passwordHash,
      role,
      status,
      reviewedAt: status === 'pending' ? null : new Date(),
    },
  });

export const listUsers = async ({ status } = {}) => {
  const where = status ? { status } : {};
  const [rows, grouped] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' } }),
    prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(USER_STATUSES.map((key) => [key, 0]));
  grouped.forEach((row) => {
    counts[row.status] = row._count._all;
  });

  return { items: rows.map(toPublicUser), counts };
};

const updateById = async (id, data) => {
  try {
    return await prisma.user.update({ where: { id }, data });
  } catch (error) {
    if (error.code === 'P2025') return null;
    throw error;
  }
};

export const updateStatus = (id, status) => updateById(id, { status, reviewedAt: new Date() });

export const updateRole = (id, role) => updateById(id, { role });

export const deleteUser = async (id) => {
  try {
    return await prisma.user.delete({ where: { id } });
  } catch (error) {
    if (error.code === 'P2025') return null;
    throw error;
  }
};
