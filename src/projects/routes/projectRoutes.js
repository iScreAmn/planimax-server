import express from 'express';
import {
  getProjects,
  getProject,
  postProject,
  patchProject,
  removeProject,
} from '../controllers/projectController.js';
import {
  createProjectRules,
  updateProjectRules,
  projectIdRules,
} from '../validators/projectValidator.js';
import { requireAuth } from '../../auth/middleware/requireAuth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getProjects);
router.post('/', createProjectRules, postProject);
router.get('/:id', projectIdRules, getProject);
router.patch('/:id', updateProjectRules, patchProject);
router.delete('/:id', projectIdRules, removeProject);

export default router;
