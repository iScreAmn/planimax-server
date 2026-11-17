import express from 'express';
import { param } from 'express-validator';
import { requireAuth } from '../auth/middleware/requireAuth.js';
import { getTrash, postRestore, removeAll, removeForever } from './trashController.js';
import { TRASH_TYPES } from './trashRepository.js';

const itemRules = [
  param('type').isIn(TRASH_TYPES).withMessage('Unknown item type'),
  param('id').isUUID().withMessage('Invalid id'),
];

const router = express.Router();

router.use(requireAuth);

router.get('/', getTrash);
router.delete('/', removeAll);
router.post('/:type/:id/restore', itemRules, postRestore);
router.delete('/:type/:id', itemRules, removeForever);

export default router;
