import { validationResult } from 'express-validator';
import {
  TaskError,
  createTask,
  deleteTask,
  findTask,
  listTasksForDay,
  reorderTasks,
  summarizeTasks,
  updateTask,
} from '../taskRepository.js';

const badRequest = (res, errors) =>
  res.status(400).json({
    success: false,
    message: errors.array()[0]?.msg || 'Validation failed',
    errors: errors.array().map((e) => ({ path: e.path || e.param, msg: e.msg })),
  });

const notFound = (res) => res.status(404).json({ success: false, message: 'Task not found' });

const handleError = (res, label, error, message) => {
  if (error instanceof TaskError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error(`[tasks] ${label}:`, error.message || error);
  return res.status(500).json({ success: false, message });
};

const pickInput = (body) => ({
  title: typeof body.title === 'string' ? body.title.trim() : undefined,
  projectId: body.projectId,
  date: body.date,
  time: body.time,
  priority: body.priority,
  status: body.status,
  isCurrent: body.isCurrent,
  reminder: body.reminder,
});

export const getTasks = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    return res.json({ success: true, data: await listTasksForDay(req.user.id, req.query.date) });
  } catch (error) {
    return handleError(res, 'list failed', error, 'Failed to load tasks');
  }
};

export const getTaskSummary = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    return res.json({ success: true, data: await summarizeTasks(req.user.id, req.query.from, req.query.to) });
  } catch (error) {
    return handleError(res, 'summary failed', error, 'Failed to load the task summary');
  }
};

export const getTask = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const task = await findTask(req.user.id, req.params.id);
    if (!task) return notFound(res);
    return res.json({ success: true, data: task });
  } catch (error) {
    return handleError(res, 'load failed', error, 'Failed to load task');
  }
};

export const postTask = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const task = await createTask(req.user.id, pickInput(req.body));
    return res.status(201).json({ success: true, data: task });
  } catch (error) {
    return handleError(res, 'create failed', error, 'Failed to create task');
  }
};

export const patchTask = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const task = await updateTask(req.user.id, req.params.id, pickInput(req.body));
    if (!task) return notFound(res);
    return res.json({ success: true, data: task });
  } catch (error) {
    return handleError(res, 'update failed', error, 'Failed to update task');
  }
};

export const removeTask = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const deleted = await deleteTask(req.user.id, req.params.id);
    if (!deleted) return notFound(res);
    return res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    return handleError(res, 'delete failed', error, 'Failed to delete task');
  }
};

export const putTaskOrder = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    return res.json({ success: true, data: await reorderTasks(req.user.id, req.body.ids) });
  } catch (error) {
    return handleError(res, 'reorder failed', error, 'Failed to save the order');
  }
};
