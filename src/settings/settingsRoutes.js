import express from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '../auth/middleware/requireAuth.js';
import { prisma } from '../config/prisma.js';
import { isValidTimeZone } from '../tasks/timezone.js';
import { ARCHIVE_PURGE_OPTIONS, TRASH_RETENTION_OPTIONS } from '../archive/archiveRules.js';
import { archiveUserById } from '../archive/archiveRepository.js';

const settingsSelect = {
  timezone: true,
  trashRetentionDays: true,
  archiveCompleted: true,
  archiveOverdue: true,
  archivePurgeDays: true,
};

const nullableOption = (options) => (value) => value === null || options.includes(value);

const updateRules = [
  body('timezone').optional().custom(isValidTimeZone).withMessage('Invalid time zone'),
  body('trashRetentionDays').optional({ values: 'undefined' }).custom(nullableOption(TRASH_RETENTION_OPTIONS)).withMessage('Invalid retention'),
  body('archiveCompleted').optional().isBoolean({ strict: true }).withMessage('Invalid value'),
  body('archiveOverdue').optional().isBoolean({ strict: true }).withMessage('Invalid value'),
  body('archivePurgeDays').optional({ values: 'undefined' }).custom(nullableOption(ARCHIVE_PURGE_OPTIONS)).withMessage('Invalid period'),
];

const FIELDS = Object.keys(settingsSelect);

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const settings = await prisma.user.findUnique({ where: { id: req.user.id }, select: settingsSelect });
    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error('[settings] load failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
});

router.patch('/', updateRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0]?.msg || 'Validation failed' });
  }
  const data = Object.fromEntries(FIELDS.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  try {
    const settings = await prisma.user.update({ where: { id: req.user.id }, data, select: settingsSelect });
    if ('archiveCompleted' in data || 'archiveOverdue' in data || 'archivePurgeDays' in data || 'timezone' in data) {
      await archiveUserById(req.user.id);
    }
    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error('[settings] update failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Failed to save settings' });
  }
});

export default router;
