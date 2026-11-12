import express from 'express';
import { query } from 'express-validator';
import { requireAuth } from '../auth/middleware/requireAuth.js';
import { isValidDateKey } from '../tasks/timezone.js';
import { getSnapshot } from './syncController.js';

const SNAPSHOT_MAX_DAYS = 400;

const snapshotRules = [
  query('from').custom(isValidDateKey).withMessage('from must be YYYY-MM-DD'),
  query('to')
    .custom(isValidDateKey)
    .withMessage('to must be YYYY-MM-DD')
    .custom((to, { req }) => {
      const days = (Date.parse(to) - Date.parse(req.query.from)) / 86_400_000;
      if (!(days >= 0)) throw new Error('to must not be before from');
      if (days > SNAPSHOT_MAX_DAYS) throw new Error(`The range is longer than ${SNAPSHOT_MAX_DAYS} days`);
      return true;
    }),
];

const router = express.Router();

router.use(requireAuth);
router.get('/snapshot', snapshotRules, getSnapshot);

export default router;
