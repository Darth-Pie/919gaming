import test from 'node:test';
import assert from 'node:assert/strict';
import { bookIndexForHash } from './hash.js';

const books = [{ title: 'A' }, { slug: 'the-blooming', title: 'B' }, { slug: 'other', title: 'C' }];

test('finds the book whose slug the hash names', () => {
  assert.equal(bookIndexForHash(books, '#the-blooming'), 1);
  assert.equal(bookIndexForHash(books, '#other'), 2);
});

test('reads the slug without regard to case, and with or without the #', () => {
  assert.equal(bookIndexForHash(books, '#THE-BLOOMING'), 1);
  assert.equal(bookIndexForHash(books, 'the-blooming'), 1);
});

test('matches a slug written with capitals in the book data', () => {
  assert.equal(bookIndexForHash([{ slug: 'The-Blooming' }], '#the-blooming'), 0);
});

test('reads an escaped slug', () => {
  assert.equal(bookIndexForHash(books, '#the%2Dblooming'), 1);
});

test('gives null for an empty hash, a bare #, and a slug no book has', () => {
  assert.equal(bookIndexForHash(books, ''), null);
  assert.equal(bookIndexForHash(books, '#'), null);
  assert.equal(bookIndexForHash(books, '#nonsense'), null);
});

test('gives null, and does not throw, for a malformed escape', () => {
  assert.equal(bookIndexForHash(books, '#%E0%A4%A'), null);
});

test('never matches a book that has no slug', () => {
  assert.equal(bookIndexForHash([{ title: 'x' }], '#'), null);
  assert.equal(bookIndexForHash([{ title: 'x' }], '#undefined'), null);
});

test('the first book with the slug wins', () => {
  assert.equal(bookIndexForHash([{ slug: 'same' }, { slug: 'same' }], '#same'), 0);
});
