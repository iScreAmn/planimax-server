import { validationResult } from 'express-validator';
import {
  listProjects,
  findProject,
  createProject,
  updateProject,
  deleteProject,
} from '../projectRepository.js';

const badRequest = (res, errors) =>
  res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors: errors.array().map((e) => ({ path: e.path || e.param, msg: e.msg })),
  });

const notFound = (res) => res.status(404).json({ success: false, message: 'Project not found' });

const serverError = (res, label, error, message) => {
  console.error(`[projects] ${label}:`, error.message || error);
  return res.status(500).json({ success: false, message });
};

export const getProjects = async (req, res) => {
  try {
    return res.json({ success: true, data: await listProjects() });
  } catch (error) {
    return serverError(res, 'не удалось получить список', error, 'Failed to load projects');
  }
};

export const getProject = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const project = await findProject(req.params.id);
    if (!project) return notFound(res);
    return res.json({ success: true, data: project });
  } catch (error) {
    return serverError(res, 'не удалось получить проект', error, 'Failed to load project');
  }
};

export const postProject = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const project = await createProject({
      name: req.body.name.trim(),
      color: req.body.color.toLowerCase(),
      inPlanner: req.body.inPlanner,
    });
    return res.status(201).json({ success: true, data: project });
  } catch (error) {
    return serverError(res, 'не удалось создать проект', error, 'Failed to create project');
  }
};

export const patchProject = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  const { name, color, notes, inPlanner } = req.body;
  try {
    const project = await updateProject(req.params.id, {
      name: typeof name === 'string' ? name.trim() : undefined,
      color: typeof color === 'string' ? color.toLowerCase() : undefined,
      notes,
      inPlanner,
    });
    if (!project) return notFound(res);
    return res.json({ success: true, data: project });
  } catch (error) {
    return serverError(res, 'не удалось обновить проект', error, 'Failed to update project');
  }
};

export const removeProject = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const deleted = await deleteProject(req.params.id);
    if (!deleted) return notFound(res);
    return res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    return serverError(res, 'не удалось удалить проект', error, 'Failed to delete project');
  }
};
