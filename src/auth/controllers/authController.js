import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import * as tokenService from '../services/tokenService.js';
import * as userRepository from '../repositories/userRepository.js';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '../utils/cookies.js';

export const BCRYPT_ROUNDS = 12;

const INVALID_CREDENTIALS = 'Invalid email or password';

const DUMMY_HASH = '$2b$12$Qk6JKKbUUjCdKV0n3fr5JuT5M5zql78hlWk2uw6QMaGEKlcQ9icwK';

const STATUS_MESSAGES = {
  pending: 'Your account is waiting for administrator approval',
  rejected: 'Your registration was rejected by the administrator',
};

const badRequest = (res, errors) =>
  res.status(400).json({
    success: false,
    message: errors.array()[0]?.msg || 'Validation failed',
    errors: errors.array().map((e) => ({ path: e.path || e.param, msg: e.msg })),
  });

const unauthorized = (res) => res.status(401).json({ success: false, message: 'Unauthorized' });

const requestMeta = (req) => ({
  userAgent: req.get('user-agent') || '',
  ip: req.ip || '',
});

const issueSession = async (res, user, req) => {
  const accessToken = tokenService.signAccessToken(user);
  const refreshToken = await tokenService.issueRefreshToken(user.id, requestMeta(req));
  setAuthCookies(res, { accessToken, refreshToken });
};

export const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const email = userRepository.normalizeEmail(req.body.email);
    if (await userRepository.findByEmail(email)) {
      return res
        .status(409)
        .json({ success: false, message: 'An account with this email already exists' });
    }

    const user = await userRepository.createUser({
      email,
      name: req.body.name.trim(),
      passwordHash: await bcrypt.hash(req.body.password, BCRYPT_ROUNDS),
    });

    return res.status(201).json({ success: true, data: { user: userRepository.toPublicUser(user) } });
  } catch (error) {
    if (error.code === 'P2002') {
      return res
        .status(409)
        .json({ success: false, message: 'An account with this email already exists' });
    }
    console.error('[auth] register error:', error);
    return res.status(500).json({ success: false, message: 'Failed to register' });
  }
};

export const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const password = String(req.body.password);
    const user = await userRepository.findByEmail(req.body.email);

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ success: false, message: INVALID_CREDENTIALS });
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: INVALID_CREDENTIALS });
    }

    if (user.status !== 'approved') {
      return res.status(403).json({
        success: false,
        code: `account_${user.status}`,
        message: STATUS_MESSAGES[user.status],
      });
    }

    await issueSession(res, user, req);
    return res.json({ success: true, data: { user: userRepository.toPublicUser(user) } });
  } catch (error) {
    console.error('[auth] login error:', error);
    return res.status(500).json({ success: false, message: 'Failed to sign in' });
  }
};

export const refresh = async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    const stored = await tokenService.findValidRefreshToken(token);

    if (!stored) {
      clearAuthCookies(res);
      return unauthorized(res);
    }

    const user = await userRepository.findById(stored.userId);

    if (!user || user.status !== 'approved') {
      await tokenService.revokeRefreshToken(token);
      clearAuthCookies(res);
      return unauthorized(res);
    }

    await tokenService.markRefreshTokenRotated(stored.id);
    await issueSession(res, user, req);
    return res.json({ success: true, data: { user: userRepository.toPublicUser(user) } });
  } catch (error) {
    console.error('[auth] refresh error:', error);
    return res.status(500).json({ success: false, message: 'Failed to refresh session' });
  }
};

export const logout = async (req, res) => {
  try {
    await tokenService.revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  } catch (error) {
    console.error('[auth] logout error:', error);
  }
  clearAuthCookies(res);
  return res.json({ success: true });
};

export const me = (req, res) => res.json({ success: true, data: { user: req.user } });
