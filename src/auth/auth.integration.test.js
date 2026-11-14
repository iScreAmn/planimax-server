import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const enabled = process.env.RUN_INTEGRATION === '1';
const options = { skip: enabled ? false : 'set RUN_INTEGRATION=1 to run against the database' };

const PASSWORD = 'integration-password';
const users = {};
let prisma;
let server;
let baseUrl;

const parseCookies = (response) =>
  Object.fromEntries(
    response.headers.getSetCookie().map((line) => {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      return [pair.slice(0, index), pair.slice(index + 1)];
    }),
  );

const cookieHeader = (cookies) =>
  Object.entries(cookies)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

const call = async (method, path, { cookies = {}, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Cookie: cookieHeader(cookies),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json, cookies: parseCookies(response) };
};

const login = async (user) => {
  const result = await call('POST', '/api/auth/login', { body: { email: user.email, password: PASSWORD } });
  assert.equal(result.status, 200);
  assert.ok(result.cookies.pm_access);
  assert.ok(result.cookies.pm_refresh);
  return result.cookies;
};

const refresh = (cookies) => call('POST', '/api/auth/refresh', { cookies: { pm_refresh: cookies.pm_refresh } });

const me = (cookies) => call('GET', '/api/auth/me', { cookies: { pm_access: cookies.pm_access } });

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

before(async () => {
  if (!enabled) return;
  ({ prisma } = await import('../config/prisma.js'));
  const { default: app } = await import('../app.js');

  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  for (const key of ['alice', 'bob']) {
    users[key] = await prisma.user.create({
      data: {
        email: `it-${key}-${crypto.randomUUID()}@planimax.test`,
        name: `Integration ${key}`,
        passwordHash,
        status: 'approved',
        reviewedAt: new Date(),
      },
    });
  }

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!enabled) return;
  await new Promise((resolve) => server.close(resolve));
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((user) => user.id) } } });
  await prisma.$disconnect();
});

test('login opens a session and logout closes it immediately', options, async () => {
  const cookies = await login(users.alice);
  assert.equal((await me(cookies)).status, 200);

  assert.equal((await call('POST', '/api/auth/logout', { cookies })).status, 200);

  assert.equal((await me(cookies)).status, 401);
  assert.equal((await refresh(cookies)).status, 401);
});

test('logout revokes every token produced by parallel refreshes', options, async () => {
  const initial = await login(users.alice);
  const [first, second] = await Promise.all([refresh(initial), refresh(initial)]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.notEqual(first.cookies.pm_refresh, second.cookies.pm_refresh);

  assert.equal((await call('POST', '/api/auth/logout', { cookies: first.cookies })).status, 200);

  assert.equal((await refresh(second.cookies)).status, 401);
  assert.equal((await me(second.cookies)).status, 401);
  assert.equal((await refresh(initial)).status, 401);
  assert.equal((await me(initial)).status, 401);
});

test('reusing a rotated refresh token after the grace period revokes that session only', options, async () => {
  const stolen = await login(users.alice);
  const otherDevice = await login(users.alice);

  const rotated = await refresh(stolen);
  assert.equal(rotated.status, 200);

  await prisma.refreshToken.update({
    where: { tokenHash: hashToken(stolen.pm_refresh) },
    data: { rotatedAt: new Date(Date.now() - 5 * 60 * 1000) },
  });

  assert.equal((await refresh(stolen)).status, 401);
  assert.equal((await refresh(rotated.cookies)).status, 401);
  assert.equal((await me(rotated.cookies)).status, 401);

  assert.equal((await me(otherDevice)).status, 200);
  assert.equal((await refresh(otherDevice)).status, 200);
});

test('logging out on one device keeps the other device signed in', options, async () => {
  const phone = await login(users.alice);
  const laptop = await login(users.alice);

  await call('POST', '/api/auth/logout', { cookies: phone });

  assert.equal((await me(phone)).status, 401);
  assert.equal((await me(laptop)).status, 200);
});

test('requests without a valid session are rejected', options, async () => {
  assert.equal((await call('GET', '/api/tasks?date=2026-11-14')).status, 401);
  assert.equal((await call('GET', '/api/projects', { cookies: { pm_access: 'not-a-token' } })).status, 401);
  assert.equal((await call('GET', '/api/sync/snapshot?from=2026-11-01&to=2026-11-14')).status, 401);
});

test('a user cannot read or change projects and tasks of another user', options, async () => {
  const alice = await login(users.alice);
  const bob = await login(users.bob);

  const project = await call('POST', '/api/projects', {
    cookies: alice,
    body: { name: 'Alice project', color: '#112233', inPlanner: true },
  });
  assert.equal(project.status, 201);
  const projectId = project.json.data.id;

  const task = await call('POST', '/api/tasks', {
    cookies: alice,
    body: { title: 'Alice task', date: '2026-11-14', projectId },
  });
  assert.equal(task.status, 201);
  const taskId = task.json.data.id;

  assert.equal((await call('GET', `/api/projects/${projectId}`, { cookies: bob })).status, 404);
  assert.equal(
    (await call('PATCH', `/api/projects/${projectId}`, { cookies: bob, body: { name: 'Hacked' } })).status,
    404,
  );
  assert.equal((await call('DELETE', `/api/projects/${projectId}`, { cookies: bob })).json.data.deleted, false);

  assert.equal((await call('GET', `/api/tasks/${taskId}`, { cookies: bob })).status, 404);
  assert.equal((await call('PATCH', `/api/tasks/${taskId}`, { cookies: bob, body: { title: 'Hacked' } })).status, 404);
  assert.equal((await call('DELETE', `/api/tasks/${taskId}`, { cookies: bob })).json.data.deleted, false);
  assert.deepEqual((await call('PUT', '/api/tasks/order', { cookies: bob, body: { ids: [taskId] } })).json.data, []);

  assert.equal(
    (await call('POST', '/api/tasks', { cookies: bob, body: { title: 'Bob task', projectId } })).status,
    400,
  );
  assert.equal(
    (await call('POST', '/api/tasks', { cookies: bob, body: { id: taskId, title: 'Bob task' } })).status,
    409,
  );
  assert.equal(
    (await call('POST', '/api/projects', { cookies: bob, body: { id: projectId, name: 'Bob', color: '#000000' } }))
      .status,
    409,
  );

  const bobTasks = await call('GET', '/api/tasks?date=2026-11-14', { cookies: bob });
  assert.deepEqual(bobTasks.json.data, []);
  const bobSnapshot = await call('GET', '/api/sync/snapshot?from=2026-11-01&to=2026-11-30', { cookies: bob });
  assert.deepEqual(bobSnapshot.json.data.projects, []);
  assert.deepEqual(bobSnapshot.json.data.tasks, []);

  const untouched = await call('GET', `/api/tasks/${taskId}`, { cookies: alice });
  assert.equal(untouched.json.data.title, 'Alice task');
  const untouchedProject = await call('GET', `/api/projects/${projectId}`, { cookies: alice });
  assert.equal(untouchedProject.json.data.name, 'Alice project');
});

test('a regular user cannot reach the admin API', options, async () => {
  const bob = await login(users.bob);
  assert.equal((await call('GET', '/api/users', { cookies: bob })).status, 403);
  assert.equal(
    (await call('PATCH', `/api/users/${users.alice.id}/status`, { cookies: bob, body: { status: 'rejected' } })).status,
    403,
  );
  assert.equal((await call('DELETE', `/api/users/${users.alice.id}`, { cookies: bob })).status, 403);
});

test('rejecting a user ends their sessions', options, async () => {
  const bob = await login(users.bob);
  await prisma.user.update({ where: { id: users.bob.id }, data: { status: 'rejected' } });
  try {
    assert.equal((await me(bob)).status, 401);
    assert.equal((await refresh(bob)).status, 401);
  } finally {
    await prisma.user.update({ where: { id: users.bob.id }, data: { status: 'approved' } });
  }
});

test('registration rejects passwords longer than 72 bytes', options, async () => {
  const result = await call('POST', '/api/auth/register', {
    body: { name: 'Long password', email: `it-long-${crypto.randomUUID()}@planimax.test`, password: 'п'.repeat(40) },
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.errors[0].path, 'password');
});
