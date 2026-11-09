import express from 'express';
import { getUsers, patchUserRole, patchUserStatus } from '../controllers/userController.js';
import { listUsersRules, updateRoleRules, updateStatusRules } from '../validators/userValidator.js';
import { requireAuth, requireRole } from '../../auth/middleware/requireAuth.js';

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', listUsersRules, getUsers);
router.patch('/:id/status', updateStatusRules, patchUserStatus);
router.patch('/:id/role', updateRoleRules, patchUserRole);

export default router;
