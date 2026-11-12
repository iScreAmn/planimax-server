import { prisma } from '../config/prisma.js';
import { dateKeyToDb, dbToDateKey, utcToZonedDateTime, zonedTimeToUtc } from './timezone.js';

export const TASK_STATUSES = ['todo', 'done'];
export const TASK_PRIORITIES = ['low', 'normal', 'high'];

const REMINDER_PAST_TOLERANCE_MS = 60 * 1000;

export class TaskError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'TaskError';
    this.status = status;
  }
}

const projectSelect = { select: { id: true, name: true, color: true, inPlanner: true } };

const toPublicReminder = (task) => {
  if (!task.reminderAt) return null;
  const timezone = task.reminderTimezone || 'UTC';
  const local = utcToZonedDateTime(task.reminderAt, timezone);
  return {
    at: task.reminderAt,
    timezone,
    date: local.date,
    time: local.time,
    status: task.reminderStatus,
    attempts: task.reminderAttempts,
    sentAt: task.reminderSentAt,
    lastError: task.reminderLastError,
  };
};

export const toPublicTask = (task) => ({
  id: task.id,
  title: task.title,
  projectId: task.projectId,
  project: task.project ?? null,
  date: dbToDateKey(task.date),
  time: task.time,
  priority: task.priority,
  status: task.status,
  position: task.position,
  isCurrent: task.isCurrent,
  completedAt: task.completedAt,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  reminder: toPublicReminder(task),
});

const groupWhere = (userId, date, priority) => ({
  userId,
  date: dateKeyToDb(date),
  priority: priority === 'high' ? 'high' : { in: ['low', 'normal'] },
});

const nextPosition = async (tx, userId, date, priority) => {
  const { _max } = await tx.task.aggregate({
    where: groupWhere(userId, date, priority),
    _max: { position: true },
  });
  return (_max.position ?? -1) + 1;
};

const assertProject = async (tx, userId, projectId) => {
  const project = await tx.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new TaskError(400, 'Project not found');
  if (!project.inPlanner) throw new TaskError(400, 'Project is not added to Planner');
};

const clearedReminder = {
  reminderAt: null,
  reminderTimezone: null,
  reminderStatus: null,
  reminderNextAttemptAt: null,
  reminderClaimedAt: null,
  reminderAttempts: 0,
  reminderSentAt: null,
  reminderLastError: null,
};

const MISSED_REMINDER_ERROR = 'The reminder time passed before this change reached the server';

const reminderChanges = (existing, input, now, changedAt) => {
  if (input === undefined) return null;
  if (input === null) return existing?.reminderAt ? clearedReminder : null;

  const at = zonedTimeToUtc(input.date, input.time, input.timezone);
  if (
    existing?.reminderAt &&
    existing.reminderAt.getTime() === at.getTime() &&
    existing.reminderTimezone === input.timezone
  ) {
    if (existing.reminderStatus !== 'failed') return null;
    if (changedAt && changedAt.getTime() <= existing.updatedAt.getTime()) return null;
    return {
      reminderStatus: 'scheduled',
      reminderNextAttemptAt: now,
      reminderClaimedAt: null,
      reminderAttempts: 0,
      reminderLastError: null,
    };
  }
  if (at.getTime() < now.getTime() - REMINDER_PAST_TOLERANCE_MS) {
    const madeAt = changedAt ?? now;
    if (at.getTime() < madeAt.getTime() - REMINDER_PAST_TOLERANCE_MS) {
      throw new TaskError(400, 'Reminder time is in the past');
    }
    return {
      ...clearedReminder,
      reminderAt: at,
      reminderTimezone: input.timezone,
      reminderStatus: 'failed',
      reminderLastError: MISSED_REMINDER_ERROR,
    };
  }
  return {
    ...clearedReminder,
    reminderAt: at,
    reminderTimezone: input.timezone,
    reminderStatus: 'scheduled',
    reminderNextAttemptAt: at,
  };
};

const applyStatusRules = (state, data, now) => {
  if (state.status === 'done') {
    if (state.reminderStatus === 'scheduled' || state.reminderStatus === 'failed') {
      data.reminderStatus = 'canceled';
      data.reminderNextAttemptAt = null;
    }
    return;
  }
  if (state.reminderStatus === 'canceled' && state.reminderAt && state.reminderAt > now) {
    Object.assign(data, {
      reminderStatus: 'scheduled',
      reminderNextAttemptAt: state.reminderAt,
      reminderClaimedAt: null,
      reminderAttempts: 0,
      reminderLastError: null,
    });
  }
};

export const listTasksForDay = async (userId, date) => {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      OR: [
        { date: dateKeyToDb(date) },
        { date: null, status: 'todo' },
        { date: { lt: dateKeyToDb(date) }, status: 'todo' },
        { isCurrent: true },
      ],
    },
    include: { project: projectSelect },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  return tasks.map(toPublicTask);
};

export const summarizeTasks = async (userId, from, to) => {
  const groups = await prisma.task.groupBy({
    by: ['date', 'status'],
    where: { userId, date: { gte: dateKeyToDb(from), lte: dateKeyToDb(to) } },
    _count: { _all: true },
  });

  const days = new Map();
  for (const group of groups) {
    const date = dbToDateKey(group.date);
    const day = days.get(date) ?? { date, total: 0, done: 0 };
    day.total += group._count._all;
    if (group.status === 'done') day.done += group._count._all;
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
};

export const findTask = async (userId, id) => {
  const task = await prisma.task.findFirst({ where: { id, userId }, include: { project: projectSelect } });
  return task ? toPublicTask(task) : null;
};

const findOwnedTask = async (userId, id) => {
  const task = await prisma.task.findUnique({ where: { id }, include: { project: projectSelect } });
  if (!task) return null;
  if (task.userId !== userId) throw new TaskError(409, 'This task id is already taken');
  return toPublicTask(task);
};

const isUniqueViolation = (error) => error?.code === 'P2002';

export const createTask = async (userId, input, now = new Date()) => {
  if (input.id) {
    const existing = await findOwnedTask(userId, input.id);
    if (existing) return { task: existing, created: false };
  }
  try {
    return { task: await insertTask(userId, input, now), created: true };
  } catch (error) {
    if (!input.id || !isUniqueViolation(error)) throw error;
    const existing = await findOwnedTask(userId, input.id);
    if (!existing) throw error;
    return { task: existing, created: false };
  }
};

const insertTask = (userId, input, now) =>
  prisma.$transaction(async (tx) => {
    const date = input.date ?? null;
    const priority = input.priority ?? 'normal';
    const status = input.status ?? 'todo';
    if (input.projectId) await assertProject(tx, userId, input.projectId);

    const data = {
      ...(input.id ? { id: input.id } : {}),
      userId,
      title: input.title,
      projectId: input.projectId ?? null,
      date: dateKeyToDb(date),
      time: input.time ?? null,
      priority,
      status,
      completedAt: status === 'done' ? now : null,
      position: await nextPosition(tx, userId, date, priority),
      ...(reminderChanges(null, input.reminder, now, input.changedAt) ?? {}),
    };
    applyStatusRules({ ...data }, data, now);

    const task = await tx.task.create({ data, include: { project: projectSelect } });
    return toPublicTask(task);
  });

export const updateTask = (userId, id, input, now = new Date()) =>
  prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const data = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.time !== undefined) data.time = input.time;

    if (input.projectId !== undefined && input.projectId !== existing.projectId) {
      if (input.projectId) await assertProject(tx, userId, input.projectId);
      data.projectId = input.projectId;
    }

    const date = input.date !== undefined ? input.date : dbToDateKey(existing.date);
    const priority = input.priority ?? existing.priority;
    const movedDate = date !== dbToDateKey(existing.date);
    const movedList = movedDate || (priority === 'high') !== (existing.priority === 'high');
    if (movedDate) data.date = dateKeyToDb(date);
    if (priority !== existing.priority) data.priority = priority;
    if (movedList) data.position = await nextPosition(tx, userId, date, priority);

    const status = input.status ?? existing.status;
    if (status !== existing.status) {
      data.status = status;
      data.completedAt = status === 'done' ? now : null;
    }

    let isCurrent = input.isCurrent ?? existing.isCurrent;
    if (status === 'done') {
      if (input.isCurrent === true) throw new TaskError(409, 'A completed task cannot be the current one');
      isCurrent = false;
    }
    if (isCurrent !== existing.isCurrent) data.isCurrent = isCurrent;
    if (isCurrent && !existing.isCurrent) {
      await tx.task.updateMany({ where: { userId, isCurrent: true }, data: { isCurrent: false } });
    }

    Object.assign(data, reminderChanges(existing, input.reminder, now, input.changedAt) ?? {});
    applyStatusRules({ ...existing, ...data }, data, now);

    const task = await tx.task.update({ where: { id }, data, include: { project: projectSelect } });
    return toPublicTask(task);
  });

export const deleteTask = async (userId, id) => {
  const { count } = await prisma.task.deleteMany({ where: { id, userId } });
  return count > 0;
};

export const reorderTasks = (userId, ids) =>
  prisma.$transaction(async (tx) => {
    const owned = await tx.task.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
    const ownedIds = new Set(owned.map((task) => task.id));
    const order = ids
      .map((id, position) => ({ id, position }))
      .filter(({ id }) => ownedIds.has(id));
    await Promise.all(
      order.map(({ id, position }) => tx.task.update({ where: { id }, data: { position } })),
    );
    return order;
  });

const DAY_MS = 86_400_000;

export const listTasksForSnapshot = async (userId, from, to) => {
  const fromDb = dateKeyToDb(from);
  const toDb = dateKeyToDb(to);
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      OR: [
        { status: 'todo' },
        { date: { gte: fromDb, lte: toDb } },
        {
          date: null,
          completedAt: { gte: new Date(fromDb.getTime() - DAY_MS), lt: new Date(toDb.getTime() + 2 * DAY_MS) },
        },
      ],
    },
    include: { project: projectSelect },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  return tasks.map(toPublicTask);
};
