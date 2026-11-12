import { validationResult } from 'express-validator';
import { listProjects } from '../projects/projectRepository.js';
import { listTasksForSnapshot } from '../tasks/taskRepository.js';

export const getSnapshot = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0]?.msg || 'Validation failed',
      errors: errors.array().map((e) => ({ path: e.path || e.param, msg: e.msg })),
    });
  }

  const { from, to } = req.query;
  try {
    const serverTime = new Date().toISOString();
    const [projects, tasks] = await Promise.all([
      listProjects(req.user.id),
      listTasksForSnapshot(req.user.id, from, to),
    ]);
    return res.json({ success: true, data: { serverTime, range: { from, to }, projects, tasks } });
  } catch (error) {
    console.error('[sync] snapshot failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Failed to load the snapshot' });
  }
};
