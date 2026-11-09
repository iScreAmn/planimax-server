import { prisma } from '../config/prisma.js';
import { dateKeyToDb, dbToDateKey, utcToZonedDateTime, zonedTimeToUtc } from './timezone.js';

export const TASK_STATUSES = ['todo', 'done'];
export const TASK_PRIORITIES = ['low', 'normal', 'high'];

/** Reminders set this far in the past are rejected (allows for slow form submits). */
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

/** Tasks of one list share a date and the "main" (high priority) flag. */
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

/**
 * Returns the reminder columns to write, or null when nothing changes.
 * Re-saving the same moment keeps the delivery state, so a sent reminder is never sent twice.
 */
const reminderChanges = (existing, input, now) => {
  if (input === undefined) return null;
  if (input === null) return existing?.reminderAt ? clearedReminder : null;

  const at = zonedTimeToUtc(input.date, input.time, input.timezone);
  if (
    existing?.reminderAt &&
    existing.reminderAt.getTime() === at.getTime() &&
    existing.reminderTimezone === input.timezone
  ) {
    // Saving a failed reminder again is the user's way to retry it (e.g. after fixing the config).
    if (existing.reminderStatus !== 'failed') return null;
    return {
      reminderStatus: 'scheduled',
      reminderNextAttemptAt: now,
      reminderClaimedAt: null,
      reminderAttempts: 0,
      reminderLastError: null,
    };
  }
  if (at.getTime() < now.getTime() - REMINDER_PAST_TOLERANCE_MS) {
    throw new TaskError(400, 'Reminder time is in the past');
  }
  return {
    ...clearedReminder,
    reminderAt: at,
    reminderTimezone: input.timezone,
    reminderStatus: 'scheduled',
    reminderNextAttemptAt: at,
  };
};

/** Completing a task cancels a pending reminder; reopening it restores one that is still ahead. */
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
      OR: [{ date: dateKeyToDb(date) }, { date: null, status: 'todo' }, { isCurrent: true }],
    },
    include: { project: projectSelect },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  return tasks.map(toPublicTask);
};

export const findTask = async (userId, id) => {
  const task = await prisma.task.findFirst({ where: { id, userId }, include: { project: projectSelect } });
  return task ? toPublicTask(task) : null;
};

export const createTask = (userId, input, now = new Date()) =>
  prisma.$transaction(async (tx) => {
    const date = input.date ?? null;
    const priority = input.priority ?? 'normal';
    const status = input.status ?? 'todo';
    if (input.projectId) await assertProject(tx, userId, input.projectId);

    const data = {
      userId,
      title: input.title,
      projectId: input.projectId ?? null,
      date: dateKeyToDb(date),
      time: input.time ?? null,
      priority,
      status,
      completedAt: status === 'done' ? now : null,
      position: await nextPosition(tx, userId, date, priority),
      ...(reminderChanges(null, input.reminder, now) ?? {}),
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

    Object.assign(data, reminderChanges(existing, input.reminder, now) ?? {});
    applyStatusRules({ ...existing, ...data }, data, now);

    const task = await tx.task.update({ where: { id }, data, include: { project: projectSelect } });
    return toPublicTask(task);
  });

export const deleteTask = async (userId, id) => {
  const { count } = await prisma.task.deleteMany({ where: { id, userId } });
  return count > 0;
};

/** Stores the order of one list: the position of each task becomes its index in `ids`. */
export const reorderTasks = (userId, ids) =>
  prisma.$transaction(async (tx) => {
    const owned = await tx.task.count({ where: { userId, id: { in: ids } } });
    if (owned !== ids.length) throw new TaskError(404, 'Task not found');
    await Promise.all(
      ids.map((id, position) => tx.task.update({ where: { id }, data: { position } })),
    );
    return ids.map((id, position) => ({ id, position }));
  });
