import { ACCESS_TTL_MS, REFRESH_TTL_MS } from '../services/tokenService.js';

export const ACCESS_COOKIE = 'pm_access';
export const REFRESH_COOKIE = 'pm_refresh';

const REFRESH_COOKIE_PATH = '/api/auth';

const baseOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
});

export const setAuthCookies = (res, { accessToken, refreshToken }) => {
  const options = baseOptions();

  res.cookie(ACCESS_COOKIE, accessToken, { ...options, path: '/', maxAge: ACCESS_TTL_MS });

  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...options,
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TTL_MS,
    });
  }
};

export const clearAuthCookies = (res) => {
  const options = baseOptions();
  res.clearCookie(ACCESS_COOKIE, { ...options, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...options, path: REFRESH_COOKIE_PATH });
};
