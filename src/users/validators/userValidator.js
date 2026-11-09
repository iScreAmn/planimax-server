import { body, param, query } from 'express-validator';
import { USER_ROLES, USER_STATUSES } from '../../auth/repositories/userRepository.js';

const userIdRule = param('id').isUUID().withMessage('Invalid id');

export const listUsersRules = [query('status').optional({ values: 'falsy' }).isIn(USER_STATUSES)];

export const updateStatusRules = [
  userIdRule,
  body('status').isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected'),
];

export const updateRoleRules = [
  userIdRule,
  body('role').isIn(USER_ROLES).withMessage('Role must be user or admin'),
];

export const deleteUserRules = [userIdRule];
