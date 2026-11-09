import { body, param, query } from 'express-validator';
import { TASK_PRIORITIES, TASK_STATUSES } from '../taskRepository.js';
import { isValidDateKey, isValidTime, isValidTimeZone } from '../timezone.js';

export const TITLE_MAX_LENGTH = 200;
const REORDER_MAX_IDS = 500;

export const taskIdRules = [param('id').isUUID().withMessage('Invalid id')];

export const listTasksRules = [
  query('date').custom(isValidDateKey).withMessage('Date must be YYYY-MM-DD'),
];

const titleRule = () =>
  body('title')
    .isString()
    .withMessage('Enter a task title')
    .trim()
    .notEmpty()
    .withMessage('Enter a task title')
    .isLength({ max: TITLE_MAX_LENGTH })
    .withMessage(`Title is longer than ${TITLE_MAX_LENGTH} characters`);

const nullable = (field, check, message) =>
  body(field)
    .optional()
    .custom((value) => value === null || check(value))
    .withMessage(message);

const reminderRule = () =>
  body('reminder')
    .optional()
    .custom((value) => {
      if (value === null) return true;
      if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid reminder');
      if (!isValidDateKey(value.date)) throw new Error('Reminder date must be YYYY-MM-DD');
      if (!isValidTime(value.time)) throw new Error('Reminder time must be HH:MM');
      if (!isValidTimeZone(value.timezone)) throw new Error('Unknown time zone');
      return true;
    });

const sharedRules = () => [
  nullable('projectId', (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v), 'Invalid project'),
  nullable('date', isValidDateKey, 'Date must be YYYY-MM-DD'),
  nullable('time', isValidTime, 'Time must be HH:MM'),
  body('priority').optional().isIn(TASK_PRIORITIES).withMessage('Invalid priority'),
  body('status').optional().isIn(TASK_STATUSES).withMessage('Invalid status'),
  reminderRule(),
];

export const createTaskRules = [titleRule(), ...sharedRules()];

export const updateTaskRules = [
  ...taskIdRules,
  titleRule().optional(),
  ...sharedRules(),
  body('isCurrent').optional().isBoolean({ strict: true }).withMessage('Invalid current flag'),
];

export const reorderTasksRules = [
  body('ids')
    .isArray({ min: 1, max: REORDER_MAX_IDS })
    .withMessage('ids must be a non-empty array')
    .custom((ids) => new Set(ids).size === ids.length)
    .withMessage('ids must be unique'),
  body('ids.*').isUUID().withMessage('Invalid id'),
];
