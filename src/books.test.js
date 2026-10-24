import test from 'node:test';
import assert from 'node:assert/strict';
import { books } from './books.js';

const pages = books.filter((b) => b.kind !== 'journal');

test('every tome except the journal has a slug, and the journal has none', () => {
  for (const b of pages) assert.equal(typeof b.slug, 'string', `${b.title} has no slug`);
  for (const b of books.filter((x) => x.kind === 'journal')) assert.equal(b.slug, undefined);
});

test('the slugs are the six agreed addresses, in shelf order', () => {
  assert.deepEqual(pages.map((b) => b.slug), ['mustr', 'the-blooming', 'squall-riders', 'fleet-919', 'anchor', 'case-file-1031']);
});

test('slugs are unique and url-safe', () => {
  const slugs = pages.map((b) => b.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('a gallery has one non-empty alt per picture, and a leftImage has an alt', () => {
  for (const b of books) {
    if (b.gallery) {
      assert.equal(b.galleryAlts?.length, b.gallery.length, `${b.title}: one alt per gallery picture`);
      for (const alt of b.galleryAlts) assert.ok(alt.trim().length > 0, `${b.title}: empty gallery alt`);
    }
    if (b.leftImage) assert.ok(b.leftImageAlt?.trim().length > 0, `${b.title}: leftImage needs leftImageAlt`);
  }
});

test('The Blooming names its share image', () => {
  const blooming = books.find((b) => b.slug === 'the-blooming');
  assert.equal(blooming.seo?.image, 'https://thebloom.919gaming.com/assets/share.jpg');
  assert.ok(blooming.seo?.imageAlt?.trim().length > 0);
});
