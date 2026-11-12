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

export const updateProject = async (userId, id, { name, color, notes, inPlanner, expectedUpdatedAt }) => {
  const data = {};
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;
  if (notes !== undefined) data.notes = notes;
  if (inPlanner !== undefined) data.inPlanner = inPlanner;

  const where = { id, userId };
  if (notes !== undefined) {
    if (typeof expectedUpdatedAt !== 'string') {
      throw new TypeError('Saving project notes requires an expected version');
    }
    where.updatedAt = new Date(expectedUpdatedAt);
    data.updatedAt = new Date(Math.max(Date.now(), where.updatedAt.getTime() + 1));
  }

  try {
    const project = await prisma.project.update({ where, data });
    return { project: toPublic(project) };
  } catch (error) {
    if (error?.code !== 'P2025') throw error;
    const exists = notes !== undefined && await findProject(userId, id);
    return { project: null, conflict: Boolean(exists) };
  }
};

export const deleteProject = async (userId, id) => {
  const { count } = await prisma.project.deleteMany({ where: { id, userId } });
  return count > 0;
};
