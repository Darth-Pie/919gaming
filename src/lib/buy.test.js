import test from 'node:test';
import assert from 'node:assert/strict';
import { buyRows } from './buy.js';

const formats = [{ name: 'paperback', label: 'Paperback' }, { name: 'hardcover', label: 'Hardcover' }, { name: 'ebook', label: 'eBook' }];

test('makes a row for each format, linked to its short link on the origin, in order', () => {
  assert.deepEqual(buyRows('https://thebloom.919gaming.com', formats), [
    { label: 'Paperback', url: 'https://thebloom.919gaming.com/buy/paperback' },
    { label: 'Hardcover', url: 'https://thebloom.919gaming.com/buy/hardcover' },
    { label: 'eBook', url: 'https://thebloom.919gaming.com/buy/ebook' }
  ]);
});

test('an origin with a trailing slash gives addresses with a single slash before /buy', () => {
  const rows = buyRows('https://thebloom.919gaming.com/', formats);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].url, 'https://thebloom.919gaming.com/buy/paperback');
  assert.equal(rows[2].url, 'https://thebloom.919gaming.com/buy/ebook');
});

test('no formats, no rows', () => {
  assert.deepEqual(buyRows('https://thebloom.919gaming.com', []), []);
});
