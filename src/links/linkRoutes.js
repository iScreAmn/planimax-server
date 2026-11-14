import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth/middleware/requireAuth.js';
import { LinkPreviewError, fetchLinkPreview } from './linkPreview.js';

const router = express.Router();

router.use(requireAuth);

const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many link previews. Try again later.' }),
});

router.post('/preview', previewLimiter, async (req, res) => {
  try {
    return res.json({ success: true, data: await fetchLinkPreview(req.body?.url) });
  } catch (error) {
    if (error instanceof LinkPreviewError) {
      const status = error.code === 'INVALID_URL' ? 400 : 422;
      return res.status(status).json({ success: false, code: error.code, message: error.message });
    }
    console.error('[links] preview failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Failed to load the link preview' });
  }
});

export default router;
