import express from 'express';
import { body, param, query } from 'express-validator';
import { requireAuth } from '../auth/middleware/requireAuth.js';
import { isValidDateKey } from '../tasks/timezone.js';
import { getArchive, getArchiveSummary, postComplete, postPlanToday, removeArchived } from './archiveController.js';

const idRule = param('id').isUUID().withMessage('Invalid id');

const summaryRules = [
  query('since').optional().isISO8601().withMessage('Invalid date'),
  query('noteId').optional().isUUID().withMessage('Invalid note id'),
];

const router = express.Router();

router.use(requireAuth);

router.get('/', getArchive);
router.get('/summary', summaryRules, getArchiveSummary);
router.post('/:id/plan', [idRule, body('today').custom(isValidDateKey).withMessage('Date must be YYYY-MM-DD')], postPlanToday);
router.post('/:id/complete', [idRule], postComplete);
router.delete('/:id', [idRule], removeArchived);

export default router;
