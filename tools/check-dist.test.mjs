import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderLibraryList, renderTomePage, renderSitemap } from '../src/lib/seo.js';
import { checkDist } from './check-dist.mjs';

const make = (slug, title, extra = {}) => ({ kind: 'project', slug, title, label: 'A label', flavor: 'Some flavour.', url: `https://${slug}.example/`, host: `${slug}.example`, ...extra });
const books = [make('a', 'Alpha'), { kind: 'journal', title: 'Journal', label: 'About' }, make('b', 'Beta')];

// builds a small dist/ in a temp folder; a file given as null is left out
function withDist(over, check, list = books) {
  const dir = mkdtempSync(join(tmpdir(), 'dist-check-'));
  try {
    const files = {
      'index.html': `<html><body>${renderLibraryList(list)}</body></html>`,
      'sitemap.xml': renderSitemap(list),
      'robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://919gaming.com/sitemap.xml\n',
      ...Object.fromEntries(list.filter((b) => b.slug).map((b) => [`${b.slug}.html`, renderTomePage(b, { books: list })])),
      ...over
    };
    for (const [name, text] of Object.entries(files)) if (text !== null) writeFileSync(join(dir, name), text);
    check(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('passes a complete dist', () => {
  withDist({}, (dir) => assert.deepEqual(checkDist(dir, books), []));
});

test('reports a missing page file', () => {
  withDist({ 'b.html': null }, (dir) => assert.deepEqual(checkDist(dir, books), ['b.html is missing']));
});

test('reports a page without a canonical link', () => {
  withDist({ 'a.html': '<html><head></head></html>' }, (dir) => assert.deepEqual(checkDist(dir, books), ['a.html has no canonical link']));
});

test('reports a home page with no library list, and no link to a page', () => {
  withDist({ 'index.html': '<html><body></body></html>' }, (dir) => {
    assert.deepEqual(checkDist(dir, books), ['the home page has no library list', 'the home page does not link to /a', 'the home page does not link to /b']);
  });
  withDist({ 'index.html': '<html><body><nav class="library"><a href="/a">Alpha</a></nav></body></html>' }, (dir) => {
    assert.deepEqual(checkDist(dir, books), ['the home page does not link to /b']);
  });
});

test('reports a sitemap that misses a page, and a missing sitemap', () => {
  withDist({ 'sitemap.xml': renderSitemap([books[0]]) }, (dir) => assert.deepEqual(checkDist(dir, books), ['sitemap.xml does not list https://919gaming.com/b']));
  withDist({ 'sitemap.xml': null }, (dir) => assert.deepEqual(checkDist(dir, books), ['sitemap.xml is missing']));
});

test('reports a robots.txt with no Sitemap line, and a missing one', () => {
  withDist({ 'robots.txt': 'User-agent: *\nAllow: /\n' }, (dir) => assert.deepEqual(checkDist(dir, books), ['robots.txt has no Sitemap line']));
  withDist({ 'robots.txt': null }, (dir) => assert.deepEqual(checkDist(dir, books), ['robots.txt is missing']));
});

test('does not count a Sitemap mentioned only in a comment', () => {
  withDist({ 'robots.txt': '# Sitemap: https://919gaming.com/sitemap.xml\nUser-agent: *\nAllow: /\n' }, (dir) => assert.deepEqual(checkDist(dir, books), ['robots.txt has no Sitemap line']));
});

test('reports a missing home page', () => {
  withDist({ 'index.html': null }, (dir) => assert.deepEqual(checkDist(dir, books), ['index.html is missing']));
});

test('reports a tome with a slug and no title', () => {
  const untitled = [...books, make('c', undefined)];
  withDist({}, (dir) => assert.ok(checkDist(dir, untitled).includes('c: no title')), books);
});

test('reports a sitemap that leaves out the home page', () => {
  const noHome = '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://919gaming.com/a</loc></url><url><loc>https://919gaming.com/b</loc></url></urlset>';
  withDist({ 'sitemap.xml': noHome }, (dir) => assert.deepEqual(checkDist(dir, books), ['sitemap.xml does not list https://919gaming.com/']));
});

test('allows a title of exactly 60 characters and reports one of 61', () => {
  const sixty = [make('a', 'Alpha', { seo: { title: 'x'.repeat(60) } }), books[2]];
  withDist({}, (dir) => assert.deepEqual(checkDist(dir, sixty), []), sixty);
  const sixtyOne = [make('a', 'Alpha', { seo: { title: 'x'.repeat(61) } }), books[2]];
  withDist({}, (dir) => assert.deepEqual(checkDist(dir, sixtyOne), ['a: the title is 61 characters, over 60']), sixtyOne);
});

test('reports a title over 60 characters', () => {
  const long = [make('a', 'A very long title that goes on and on past the sixty character limit'), books[2]];
  withDist({}, (dir) => {
    const problems = checkDist(dir, long);
    assert.ok(problems.some((p) => p.startsWith('a: the title is ') && p.endsWith('characters, over 60')), problems.join(' | '));
  }, long);
});
