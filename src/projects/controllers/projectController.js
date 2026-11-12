import { validationResult } from 'express-validator';
import {
  ProjectError,
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
  if (error instanceof ProjectError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  }
  console.error(`[projects] ${label}:`, error.message || error);
  return res.status(500).json({ success: false, message });
};

export const getProjects = async (req, res) => {
  try {
    return res.json({ success: true, data: await listProjects(req.user.id) });
  } catch (error) {
    return serverError(res, 'не удалось получить список', error, 'Failed to load projects');
  }
};

export const getProject = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  try {
    const project = await findProject(req.user.id, req.params.id);
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
    const { project, created } = await createProject(req.user.id, {
      id: req.body.id,
      name: req.body.name.trim(),
      color: req.body.color.toLowerCase(),
      inPlanner: req.body.inPlanner,
    });
    return res.status(created ? 201 : 200).json({ success: true, data: project });
  } catch (error) {
    return serverError(res, 'не удалось создать проект', error, 'Failed to create project');
  }
};

export const patchProject = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors);

  const { name, color, notes, inPlanner, expectedUpdatedAt, expectedNotesVersion } = req.body;
  try {
    const project = await updateProject(req.user.id, req.params.id, {
      name: typeof name === 'string' ? name.trim() : undefined,
      color: typeof color === 'string' ? color.toLowerCase() : undefined,
      notes,
      inPlanner,
      expectedUpdatedAt,
      expectedNotesVersion,
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
    const deleted = await deleteProject(req.user.id, req.params.id);
    return res.json({ success: true, data: { id: req.params.id, deleted } });
  } catch (error) {
    return serverError(res, 'не удалось удалить проект', error, 'Failed to delete project');
  }
};
