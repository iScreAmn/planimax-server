import { prisma } from '../config/prisma.js';
import { dbToDateKey } from '../tasks/timezone.js';
import { restoreTask } from '../tasks/taskRepository.js';
import { restoreProject } from '../projects/projectRepository.js';

export const TRASH_RETENTION_DAYS = 30;
export const TRASH_TYPES = ['task', 'note'];

const DAY_MS = 86_400_000;
const PREVIEW_LENGTH = 160;

export const purgeAt = (deletedAt, retentionDays = TRASH_RETENTION_DAYS) =>
  retentionDays ? new Date(deletedAt.getTime() + retentionDays * DAY_MS) : null;

export const expiryCutoff = (now = new Date(), retentionDays = TRASH_RETENTION_DAYS) =>
  new Date(now.getTime() - retentionDays * DAY_MS);

export const notePreview = (notes) => notes.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH);

const toTrashTask = (retentionDays) => (task) => ({
  type: 'task',
  id: task.id,
  title: task.title,
  deletedAt: task.deletedAt,
  purgeAt: purgeAt(task.deletedAt, retentionDays),
  archived: Boolean(task.archivedAt),
  date: dbToDateKey(task.date),
  time: task.time,
  status: task.status,
  priority: task.priority,
  note: task.project ? { id: task.project.id, name: task.project.name, color: task.project.color } : null,
});

const toTrashNote = (retentionDays) => (project) => ({
  type: 'note',
  id: project.id,
  title: project.name,
  deletedAt: project.deletedAt,
  purgeAt: purgeAt(project.deletedAt, retentionDays),
  color: project.color,
  preview: notePreview(project.notes),
  taskCount: project._count.tasks,
});

export const retentionFor = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trashRetentionDays: true } });
  return user ? user.trashRetentionDays : TRASH_RETENTION_DAYS;
};

export const listTrash = async (userId, retentionDays = TRASH_RETENTION_DAYS) => {
  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: { userId, deletedAt: { not: null } },
      include: { project: { select: { id: true, name: true, color: true } } },
    }),
    prisma.project.findMany({
      where: { userId, deletedAt: { not: null } },
      include: { _count: { select: { tasks: { where: { deletedAt: null } } } } },
    }),
  ]);
  return [...tasks.map(toTrashTask(retentionDays)), ...projects.map(toTrashNote(retentionDays))].sort(
    (a, b) => b.deletedAt.getTime() - a.deletedAt.getTime(),
  );
};

export const restoreFromTrash = (userId, type, id) =>
  type === 'task' ? restoreTask(userId, id) : restoreProject(userId, id);

export const deleteForever = async (userId, type, id) => {
  const where = { id, userId, deletedAt: { not: null } };
  const { count } = type === 'task'
    ? await prisma.task.deleteMany({ where })
    : await prisma.project.deleteMany({ where });
  return count > 0;
};

export const emptyTrash = async (userId) => {
  const where = { userId, deletedAt: { not: null } };
  const [tasks, projects] = await prisma.$transaction([
    prisma.task.deleteMany({ where }),
    prisma.project.deleteMany({ where }),
  ]);
  return { tasks: tasks.count, notes: projects.count };
};

export const purgeExpired = async (now = new Date()) => {
  const users = await prisma.user.findMany({
    where: { trashRetentionDays: { not: null } },
    select: { id: true, trashRetentionDays: true },
  });
  const totals = { tasks: 0, notes: 0 };
  for (const user of users) {
    const where = { userId: user.id, deletedAt: { lt: expiryCutoff(now, user.trashRetentionDays) } };
    const [tasks, projects] = await prisma.$transaction([
      prisma.task.deleteMany({ where }),
      prisma.project.deleteMany({ where }),
    ]);
    totals.tasks += tasks.count;
    totals.notes += projects.count;
  }
  return totals;
};
