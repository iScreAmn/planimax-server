import { body } from 'express-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const NAME_MAX_LENGTH = 60;

const emailRule = () =>
  body('email')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Enter your email')
    .isEmail()
    .withMessage('Enter a valid email')
    .isLength({ max: 254 });

export const registerRules = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters')
    .isLength({ max: NAME_MAX_LENGTH })
    .withMessage(`Name must be at most ${NAME_MAX_LENGTH} characters`),
  emailRule(),
  body('password')
    .isString()
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES)
    .withMessage(`Password is too long: at most ${PASSWORD_MAX_BYTES} bytes (non-Latin characters take 2 or more)`),
];

export const loginRules = [
  emailRule(),
  body('password').isString().notEmpty().withMessage('Enter your password'),
];
