import test from 'node:test';
import assert from 'node:assert/strict';
import { statusBody } from './status.js';

test('the owner is logged in and God', () => {
  assert.deepEqual(statusBody({ loggedIn: true, isGod: true }), { loggedIn: true, isGod: true });
});

test('a trusted keeper who is not the owner is logged in and not God', () => {
  assert.deepEqual(statusBody({ loggedIn: true, isGod: false, trusted: true }), { loggedIn: true, isGod: false });
});

test('a signed-out visitor is neither', () => {
  assert.deepEqual(statusBody({ loggedIn: false, isGod: false }), { loggedIn: false, isGod: false });
});

test('isGod is never true without a login', () => {
  assert.deepEqual(statusBody({ loggedIn: false, isGod: true }), { loggedIn: false, isGod: false });
});

test('missing or odd input is signed out', () => {
  assert.deepEqual(statusBody(null), { loggedIn: false, isGod: false });
  assert.deepEqual(statusBody(undefined), { loggedIn: false, isGod: false });
  assert.deepEqual(statusBody({ loggedIn: 'yes', isGod: 'true' }), { loggedIn: false, isGod: false });
  assert.deepEqual(statusBody({ loggedIn: 1, isGod: 1 }), { loggedIn: false, isGod: false });
});

test('a logged-in session with isGod missing or not exactly true is not God', () => {
  assert.deepEqual(statusBody({ loggedIn: true }), { loggedIn: true, isGod: false });
  assert.deepEqual(statusBody({ loggedIn: true, isGod: 'true' }), { loggedIn: true, isGod: false });
});
