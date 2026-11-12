import express from 'express';
import { requireAuth } from '../auth/middleware/requireAuth.js';
import { dateRangeRules } from '../tasks/validators/taskValidator.js';
import { getSnapshot } from './syncController.js';

const SNAPSHOT_MAX_DAYS = 400;

const router = express.Router();

router.use(requireAuth);
router.get('/snapshot', dateRangeRules(SNAPSHOT_MAX_DAYS), getSnapshot);

export default router;
