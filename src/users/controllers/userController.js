import { validationResult } from 'express-validator';
import {
  findById,
  listUsers,
  toPublicUser,
  updateRole,
  updateStatus,
} from '../../auth/repositories/userRepository.js';
import { revokeAllUserTokens } from '../../auth/services/tokenService.js';

const badRequest = (res, errors) =>
  res.status(400).json({
    success: false,
    message: errors.array()[0]?.msg || 'Validation failed',
    errors: errors.array().map((e) => ({ path: e.path || e.param, msg: e.msg })),
  });

const notFound = (res) => res.status(404).json({ success: false, message: 'User not found' });

const conflict = (res, message) => res.status(409).json({ success: false, message });

const serverError = (res, label, error, message) => {
  console.error(`[users] ${label}:`, error.message || error);
  return res.status(500).json({ success: false, message });
};

export const getUsers = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    return res.json({ success: true, data: await listUsers({ status: req.query.status || undefined }) });
  } catch (error) {
    return serverError(res, 'list failed', error, 'Failed to load users');
  }
};

export const patchUserStatus = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  if (req.params.id === req.user.id) {
    return conflict(res, 'You cannot change your own status');
  }

  try {
    const user = await updateStatus(req.params.id, req.body.status);
    if (!user) return notFound(res);

    if (user.status === 'rejected') await revokeAllUserTokens(user.id);

    return res.json({ success: true, data: toPublicUser(user) });
  } catch (error) {
    return serverError(res, 'status update failed', error, 'Failed to update user status');
  }
};

export const patchUserRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  if (req.params.id === req.user.id) {
    return conflict(res, 'You cannot change your own role');
  }

  try {
    const existing = await findById(req.params.id);
    if (!existing) return notFound(res);
    if (existing.status !== 'approved') {
      return conflict(res, 'Only approved users can change role');
    }

    const user = await updateRole(existing.id, req.body.role);
    return res.json({ success: true, data: toPublicUser(user) });
  } catch (error) {
    return serverError(res, 'role update failed', error, 'Failed to update user role');
  }
};
