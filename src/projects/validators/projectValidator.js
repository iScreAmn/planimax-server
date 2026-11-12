import { body, param } from 'express-validator';

export const NAME_MAX_LENGTH = 30;
export const NOTES_MAX_LENGTH = 50_000;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const projectIdRules = [param('id').isUUID().withMessage('Некорректный id')];

const nameRule = () =>
  body('name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Укажите название')
    .isLength({ max: NAME_MAX_LENGTH })
    .withMessage(`Название длиннее ${NAME_MAX_LENGTH} символов`);

const colorRule = () => body('color').isString().matches(COLOR_PATTERN).withMessage('Цвет в формате #rrggbb');

export const createProjectRules = [
  nameRule(),
  colorRule(),
  body('inPlanner').optional().isBoolean({ strict: true }),
];

export const updateProjectRules = [
  ...projectIdRules,
  nameRule().optional(),
  colorRule().optional(),
  body('notes')
    .optional()
    .isString()
    .isLength({ max: NOTES_MAX_LENGTH })
    .withMessage('Заметка слишком длинная'),
  body('expectedUpdatedAt')
    .if((value, { req }) => value !== undefined || req.body?.notes !== undefined)
    .custom((value) => {
      if (typeof value !== 'string') return false;
      const version = new Date(value);
      return Number.isFinite(version.getTime()) && version.toISOString() === value;
    })
    .withMessage('A valid project version is required to save notes'),
  body('inPlanner').optional().isBoolean({ strict: true }),
];
