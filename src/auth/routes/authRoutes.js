import express from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, refresh, logout, me } from '../controllers/authController.js';
import { registerRules, loginRules } from '../validators/authValidator.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

const limiter = (max, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, message }),
  });

const loginLimiter = limiter(20, 'Too many sign-in attempts. Try again later.');
const registerLimiter = limiter(5, 'Too many registration attempts. Try again later.');

router.post('/register', registerLimiter, registerRules, register);
router.post('/login', loginLimiter, loginRules, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
