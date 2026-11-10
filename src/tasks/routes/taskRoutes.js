import express from 'express';
import {
  getTask,
  getTaskSummary,
  getTasks,
  patchTask,
  postTask,
  putTaskOrder,
  removeTask,
} from '../controllers/taskController.js';
import {
  createTaskRules,
  listTasksRules,
  reorderTasksRules,
  summaryRules,
  taskIdRules,
  updateTaskRules,
} from '../validators/taskValidator.js';
import { requireAuth } from '../../auth/middleware/requireAuth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', listTasksRules, getTasks);
router.get('/summary', summaryRules, getTaskSummary);
router.post('/', createTaskRules, postTask);
router.put('/order', reorderTasksRules, putTaskOrder);
router.get('/:id', taskIdRules, getTask);
router.patch('/:id', updateTaskRules, patchTask);
router.delete('/:id', taskIdRules, removeTask);

export default router;
