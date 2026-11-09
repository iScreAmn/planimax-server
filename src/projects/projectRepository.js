import { prisma } from '../config/prisma.js';

const toPublic = (project) => ({
  id: project.id,
  name: project.name,
  color: project.color,
  notes: project.notes,
  inPlanner: project.inPlanner,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

export const listProjects = async (userId) =>
  (await prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(
    toPublic,
  );

export const findProject = async (userId, id) => {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  return project ? toPublic(project) : null;
};

export const createProject = async (userId, { name, color, inPlanner }) =>
  toPublic(
    await prisma.project.create({ data: { userId, name, color, inPlanner: Boolean(inPlanner) } }),
  );

export const updateProject = async (userId, id, { name, color, notes, inPlanner }) => {
  const data = {};
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;
  if (notes !== undefined) data.notes = notes;
  if (inPlanner !== undefined) data.inPlanner = inPlanner;

  const { count } = await prisma.project.updateMany({ where: { id, userId }, data });
  if (count === 0) return null;
  return findProject(userId, id);
};

export const deleteProject = async (userId, id) => {
  const { count } = await prisma.project.deleteMany({ where: { id, userId } });
  return count > 0;
};
