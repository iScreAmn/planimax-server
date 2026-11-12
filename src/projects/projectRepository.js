import { prisma } from '../config/prisma.js';

export class ProjectError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ProjectError';
    this.status = status;
    this.code = code;
  }
}

export const toPublicProject = (project) => ({
  id: project.id,
  name: project.name,
  color: project.color,
  notes: project.notes,
  notesVersion: project.notesVersion,
  inPlanner: project.inPlanner,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

export const listProjects = async (userId) =>
  (await prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(
    toPublicProject,
  );

export const findProject = async (userId, id) => {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  return project ? toPublicProject(project) : null;
};

const findOwnedProject = async (userId, id) => {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return null;
  if (project.userId !== userId) throw new ProjectError(409, 'This project id is already taken');
  return toPublicProject(project);
};

export const createProject = async (userId, { id, name, color, inPlanner }) => {
  if (id) {
    const existing = await findOwnedProject(userId, id);
    if (existing) return { project: existing, created: false };
  }
  try {
    const project = await prisma.project.create({
      data: { ...(id ? { id } : {}), userId, name, color, inPlanner: Boolean(inPlanner) },
    });
    return { project: toPublicProject(project), created: true };
  } catch (error) {
    if (!id || error?.code !== 'P2002') throw error;
    const existing = await findOwnedProject(userId, id);
    if (!existing) throw error;
    return { project: existing, created: false };
  }
};

const notesConflict = () =>
  new ProjectError(409, 'Project notes changed since this version', 'PROJECT_NOTES_CONFLICT');

const matchesVersion = (project, { expectedNotesVersion, expectedUpdatedAt }) =>
  expectedNotesVersion !== undefined
    ? project.notesVersion === expectedNotesVersion
    : project.updatedAt.getTime() === new Date(expectedUpdatedAt).getTime();

export const updateProject = (userId, id, input) =>
  prisma.$transaction(async (tx) => {
    const existing = await tx.project.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const data = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.color !== undefined) data.color = input.color;
    if (input.inPlanner !== undefined) data.inPlanner = input.inPlanner;

    if (input.notes !== undefined && input.notes !== existing.notes) {
      if (!matchesVersion(existing, input)) throw notesConflict();
      data.notes = input.notes;
      data.notesVersion = existing.notesVersion + 1;
      data.updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
    }

    if (Object.keys(data).length === 0) return toPublicProject(existing);

    try {
      const project = await tx.project.update({
        where: { id, notesVersion: existing.notesVersion },
        data,
      });
      return toPublicProject(project);
    } catch (error) {
      if (error?.code === 'P2025') throw notesConflict();
      throw error;
    }
  });

export const deleteProject = async (userId, id) => {
  const { count } = await prisma.project.deleteMany({ where: { id, userId } });
  return count > 0;
};
