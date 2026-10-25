// The real Worker (its default export), asked for /keepers-secrets/status with and without a keeper cookie.
// The cookie is signed here the way the Worker signs it: base64url(payload JSON) + '.' + base64url(HMAC-SHA-256).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from './worker.js';

const SECRET = 'test-secret';
const OWNER = '161833822307090432';
const env = { AUTH_SECRET: { get: async () => SECRET } };
const ctx = { waitUntil() {} };

function token(payload, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

async function status(cookie) {
  const headers = cookie ? { Cookie: `keeper_auth=${cookie}` } : {};
  const res = await worker.fetch(new Request('https://919gaming.com/keepers-secrets/status', { headers }), env, ctx);
  return { res, body: await res.json() };
}

test('a signed-out visitor gets a JSON answer that is neither logged in nor God, and is never cached', async () => {
  const { res, body } = await status(null);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.equal(res.headers.get('cache-control'), 'no-store, private');
  assert.deepEqual(body, { loggedIn: false, isGod: false });
});

test('the owner is logged in and God', async () => {
  const { body } = await status(token({ id: OWNER, username: 'owner', isGod: true, trusted: true, exp: inAnHour() }));
  assert.deepEqual(body, { loggedIn: true, isGod: true });
});

test('a trusted keeper who is not the owner is logged in and not God', async () => {
  const { body } = await status(token({ id: '42', username: 'keeper', isGod: false, trusted: true, exp: inAnHour() }));
  assert.deepEqual(body, { loggedIn: true, isGod: false });
});

test('a cookie signed with another secret is signed out, even when it claims to be the owner', async () => {
  const { body } = await status(token({ id: OWNER, username: 'owner', isGod: true, exp: inAnHour() }, 'not-the-secret'));
  assert.deepEqual(body, { loggedIn: false, isGod: false });
});

test('an expired cookie is signed out', async () => {
  const { body } = await status(token({ id: OWNER, username: 'owner', isGod: true, exp: Math.floor(Date.now() / 1000) - 60 }));
  assert.deepEqual(body, { loggedIn: false, isGod: false });
});
