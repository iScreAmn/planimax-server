import { verifyAccessToken } from '../services/tokenService.js';
import { findById, toPublicUser } from '../repositories/userRepository.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';

const unauthorized = (res) => res.status(401).json({ success: false, message: 'Unauthorized' });

export const requireAuth = async (req, res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (typeof token !== 'string' || !token) return unauthorized(res);

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return unauthorized(res);
  }

  try {
    const user = await findById(payload.sub);
    if (!user || user.status !== 'approved') return unauthorized(res);

    if (String(payload.pwdAt || '') !== new Date(user.passwordUpdatedAt).toISOString()) {
      return unauthorized(res);
    }

    req.user = toPublicUser(user);
    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return next();
  };
