import { prisma } from '../config/prisma.js';
import { dateKeyToDb, dbToDateKey } from '../tasks/timezone.js';
import { archiveCutoffs } from './archiveRules.js';

const DAY_MS = 86_400_000;
const LIST_LIMIT = 2000;

const userSettingsSelect = {
  id: true,
  timezone: true,
  archiveCompleted: true,
  archiveOverdue: true,
  archivePurgeDays: true,
};

export const archiveForUser = async (user, now = new Date()) => {
  const { monthStart, monthStartAt, overdueBefore } = archiveCutoffs(now, user.timezone);
  const base = { userId: user.id, archivedAt: null, deletedAt: null };
  let completed = 0;
  let overdue = 0;
  let purged = 0;

  if (user.archiveCompleted) {
    ({ count: completed } = await prisma.task.updateMany({
      where: {
        ...base,
        status: 'done',
        OR: [{ date: { lt: dateKeyToDb(monthStart) } }, { date: null, completedAt: { lt: monthStartAt } }],
      },
      data: { archivedAt: now, archiveReason: 'completed', isCurrent: false },
    }));
  }

  if (user.archiveOverdue) {
    ({ count: overdue } = await prisma.task.updateMany({
      where: { ...base, status: 'todo', date: { lt: dateKeyToDb(overdueBefore) } },
      data: { archivedAt: now, archiveReason: 'overdue', isCurrent: false },
    }));
  }

  if (user.archivePurgeDays) {
    ({ count: purged } = await prisma.task.deleteMany({
      where: {
        userId: user.id,
        deletedAt: null,
        archivedAt: { lt: new Date(now.getTime() - user.archivePurgeDays * DAY_MS) },
      },
    }));
  }

  return { completed, overdue, purged };
};

export const archiveUserById = async (userId, now = new Date()) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSettingsSelect });
  return user ? archiveForUser(user, now) : null;
};

export const runArchive = async (now = new Date()) => {
  const users = await prisma.user.findMany({ select: userSettingsSelect });
  const totals = { completed: 0, overdue: 0, purged: 0 };
  for (const user of users) {
    const result = await archiveForUser(user, now);
    totals.completed += result.completed;
    totals.overdue += result.overdue;
    totals.purged += result.purged;
  }
  return totals;
};

const toArchiveTask = (task) => ({
  id: task.id,
  title: task.title,
  date: dbToDateKey(task.date),
  time: task.time,
  status: task.status,
  priority: task.priority,
  completedAt: task.completedAt,
  archivedAt: task.archivedAt,
  archiveReason: task.archiveReason,
  note:
    task.project && !task.project.deletedAt
      ? { id: task.project.id, name: task.project.name, color: task.project.color }
      : null,
});

export const listArchive = async (userId) => {
  const tasks = await prisma.task.findMany({
    where: { userId, deletedAt: null, archivedAt: { not: null } },
    include: { project: { select: { id: true, name: true, color: true, deletedAt: true } } },
    orderBy: [{ date: 'desc' }, { completedAt: 'desc' }],
    take: LIST_LIMIT,
  });
  return tasks.map(toArchiveTask);
};

export const archiveSummary = async (userId, { since, noteId } = {}) => {
  const where = { userId, deletedAt: null, archivedAt: { not: null }, ...(noteId ? { projectId: noteId } : {}) };
  const [total, overdue, overdueSince] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.count({ where: { ...where, archiveReason: 'overdue' } }),
    since
      ? prisma.task.count({ where: { ...where, archiveReason: 'overdue', archivedAt: { gt: since } } })
      : Promise.resolve(0),
  ]);
  return { total, overdue, overdueSince };
};

export const deleteArchivedForever = async (userId, id) => {
  const { count } = await prisma.task.deleteMany({ where: { id, userId, deletedAt: null, archivedAt: { not: null } } });
  return count > 0;
};
