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

export const listProjects = async () =>
  (await prisma.project.findMany({ orderBy: { createdAt: 'asc' } })).map(toPublic);

export const findProject = async (id) => {
  const project = await prisma.project.findUnique({ where: { id } });
  return project ? toPublic(project) : null;
};

export const createProject = async ({ name, color, inPlanner }) =>
  toPublic(await prisma.project.create({ data: { name, color, inPlanner: Boolean(inPlanner) } }));

export const updateProject = async (id, { name, color, notes, inPlanner }) => {
  const data = {};
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;
  if (notes !== undefined) data.notes = notes;
  if (inPlanner !== undefined) data.inPlanner = inPlanner;

  try {
    return toPublic(await prisma.project.update({ where: { id }, data }));
  } catch (error) {
    if (error.code === 'P2025') return null;
    throw error;
  }
};

export const deleteProject = async (id) => {
  try {
    await prisma.project.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error.code === 'P2025') return false;
    throw error;
  }
};
