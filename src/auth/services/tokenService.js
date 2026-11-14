import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma.js';

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const DEFAULT_REFRESH_TTL_DAYS = 30;
const JWT_ALGORITHM = 'HS256';

const REFRESH_TTL_DAYS = (() => {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_REFRESH_TTL_DAYS;
})();

export const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
export const REFRESH_REUSE_GRACE_MS = 60 * 1000;

export const ACCESS_TTL_MS = (() => {
  const match = String(ACCESS_TTL).match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000;
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  return Number(match[1]) * unit;
})();

const getSecret = () => {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      pwdAt: new Date(user.passwordUpdatedAt).toISOString(),
    },
    getSecret(),
    { algorithm: JWT_ALGORITHM, expiresIn: Math.floor(ACCESS_TTL_MS / 1000) },
  );

export const verifyAccessToken = (token) => jwt.verify(token, getSecret(), { algorithms: [JWT_ALGORITHM] });

export const issueRefreshToken = async (userId, { userAgent, ip } = {}) => {
  const token = crypto.randomBytes(48).toString('base64url');

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
      ip: ip || null,
    },
  });

  return token;
};

const isToken = (token) => typeof token === 'string' && token.length > 0 && token.length <= 256;

export const findValidRefreshToken = async (token) => {
  if (!isToken(token)) return null;

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true, rotatedAt: true },
  });

  const now = Date.now();
  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < now) return null;
  if (stored.rotatedAt && stored.rotatedAt.getTime() < now - REFRESH_REUSE_GRACE_MS) return null;
  return stored;
};

export const markRefreshTokenRotated = (id) =>
  prisma.refreshToken.updateMany({
    where: { id, rotatedAt: null },
    data: { rotatedAt: new Date() },
  });

export const revokeRefreshToken = async (token) => {
  if (!isToken(token)) return;
  const tokenHash = hashToken(token);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, select: { userId: true } });
  if (!stored) return;
  const graceStart = new Date(Date.now() - REFRESH_REUSE_GRACE_MS);
  await prisma.refreshToken.updateMany({
    where: {
      userId: stored.userId,
      revokedAt: null,
      OR: [{ tokenHash }, { rotatedAt: { gt: graceStart } }],
    },
    data: { revokedAt: new Date() },
  });
};

export const revokeAllUserTokens = (userId) =>
  prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export const deleteExpiredTokens = () =>
  prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
