import test from 'node:test';
import assert from 'node:assert/strict';
import { books } from '../books.js';
import { SITE, escapeHtml, pagesFor, titleFor, descriptionFor, canonicalFor, imageFor, renderSitemap } from './seo.js';

const tome = (over = {}) => ({
  kind: 'project', slug: 'alpha', title: 'Alpha', label: 'The Label',
  flavor: 'First sentence here.', description: 'Second sentence follows.',
  url: 'https://alpha.example/', host: 'alpha.example', ...over
});
const sentence = (word, length) => `${word} `.repeat(Math.ceil(length / (word.length + 1))).trim().slice(0, length - 1).trimEnd() + '.';

test('escapeHtml escapes & < > " and the apostrophe', () => {
  assert.equal(escapeHtml('A&B <i>"x"</i> it\'s'), 'A&amp;B &lt;i&gt;&quot;x&quot;&lt;/i&gt; it&#39;s');
});

test('pagesFor keeps tomes with a slug, drops the journal even with one, and keeps shelf order', () => {
  const list = [tome({ slug: 'a' }), tome({ kind: 'journal', slug: 'j' }), tome({ slug: undefined }), tome({ slug: 'c' })];
  assert.deepEqual(pagesFor(list).map((b) => b.slug), ['a', 'c']);
});

test('titleFor joins title, label and the site name', () => {
  assert.equal(titleFor(tome()), 'Alpha — The Label | 919 Gaming');
});

test('titleFor drops a label equal to the title', () => {
  assert.equal(titleFor(tome({ title: 'Fleet 919', label: 'Fleet 919' })), 'Fleet 919 | 919 Gaming');
});

test('titleFor lets seo.title win', () => {
  assert.equal(titleFor(tome({ seo: { title: 'Mine' } })), 'Mine');
});

test('descriptionFor takes whole sentences, flavour first, up to 155 characters', () => {
  const s1 = sentence('Alpha', 60), s2 = sentence('Beta', 60), s3 = sentence('Gamma', 60);
  assert.equal(descriptionFor(tome({ flavor: s1, description: [s2, s3] })), `${s1} ${s2}`);
});

test('descriptionFor includes a second sentence that makes exactly 155 characters and leaves out one that makes 156', () => {
  const first = sentence('Alpha', 77);
  assert.equal(descriptionFor(tome({ flavor: first, description: sentence('Beta', 77) })).length, 155);
  assert.equal(descriptionFor(tome({ flavor: sentence('Alpha', 78), description: sentence('Beta', 77) })).length, 78);
});

test('descriptionFor cuts a long sentence that starts with an abbreviation at a word, not at the abbreviation', () => {
  const out = descriptionFor(tome({ flavor: `A.N.C.H.O.R. ${sentence('Alpha', 150)}`, description: undefined }));
  assert.ok(out.endsWith('…') && out.startsWith('A.N.C.H.O.R. Alpha') && out.length > 100, out);
});

test('descriptionFor cuts a first sentence that is too long at a word and ends with an ellipsis', () => {
  const long = sentence('banana', 220); // 7 characters a word, so a cut in the middle of a word cannot land on a space by chance
  const out = descriptionFor(tome({ flavor: long, description: undefined }));
  assert.ok(out.length <= 155, `length ${out.length}`);
  assert.ok(out.endsWith('…'));
  assert.ok(long.startsWith(out.slice(0, -1)) && long[out.length - 1] === ' ', 'cut at a word boundary');
});

test('descriptionFor treats a lowercase word after a full stop as the same sentence', () => {
  const out = descriptionFor(tome({ flavor: `${sentence('Alpha', 100)} ${sentence('beta', 100)}`, description: undefined }));
  assert.ok(out.endsWith('…'), out);
});

test('descriptionFor lets seo.description win', () => {
  assert.equal(descriptionFor(tome({ seo: { description: 'Mine.' } })), 'Mine.');
});

test('descriptionFor reads a description given as a list of paragraphs', () => {
  assert.equal(descriptionFor(tome({ flavor: 'One.', description: ['Two.', 'Three.'] })), 'One. Two. Three.');
});

test('descriptionFor keeps a text with no full stop whole, and does not split inside an abbreviation like A.N.C.H.O.R.', () => {
  assert.equal(descriptionFor(tome({ flavor: 'No full stop here', description: undefined })), 'No full stop here');
  assert.equal(descriptionFor(tome({ flavor: 'A.N.C.H.O.R. is the archive.', description: 'It logs everything.' })), 'A.N.C.H.O.R. is the archive. It logs everything.');
});

test('canonicalFor is the site address and the slug, with no trailing slash', () => {
  assert.equal(canonicalFor(tome()), `${SITE}/alpha`);
  assert.equal(SITE, 'https://919gaming.com');
});

test('imageFor falls back to the logo and a small card', () => {
  assert.deepEqual(imageFor(tome()), { url: 'https://919gaming.com/assets/919gaming.png', alt: '919 Gaming', large: false });
});

test('imageFor keeps an absolute image and makes a relative one absolute', () => {
  assert.deepEqual(imageFor(tome({ seo: { image: 'https://x.example/a.jpg', imageAlt: 'A' } })), { url: 'https://x.example/a.jpg', alt: 'A', large: true });
  assert.equal(imageFor(tome({ seo: { image: 'assets/a.jpg', imageAlt: 'A' } })).url, 'https://919gaming.com/assets/a.jpg');
  assert.equal(imageFor(tome({ seo: { image: '/assets/a.jpg', imageAlt: 'A' } })).url, 'https://919gaming.com/assets/a.jpg');
});

test('renderSitemap lists the home page and each page once, escapes &, and has no lastmod', () => {
  const xml = renderSitemap([tome({ slug: 'a' }), tome({ kind: 'journal', slug: 'j' }), tome({ slug: 'b&c' })]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.equal(xml.split('<loc>').length - 1, 3);
  for (const loc of ['https://919gaming.com/', 'https://919gaming.com/a', 'https://919gaming.com/b&amp;c']) assert.ok(xml.includes(`<loc>${loc}</loc>`), loc);
  assert.ok(!xml.includes('/j<'));
  assert.ok(!xml.includes('lastmod'));
});

const pages = pagesFor(books);

test('every real page has a title of at most 60 characters, and the titles are unique', () => {
  const titles = pages.map(titleFor);
  for (const t of titles) assert.ok(t.length <= 60, `${t} is ${t.length}`);
  assert.equal(new Set(titles).size, titles.length);
});

test('every real description is 50 to 160 characters, and the canonicals are unique', () => {
  for (const b of pages) {
    const d = descriptionFor(b);
    assert.ok(d.length >= 50 && d.length <= 160, `${b.slug}: ${d.length}`);
  }
  assert.equal(new Set(pages.map(canonicalFor)).size, pages.length);
});

test('the six derived titles and descriptions are the ones the owner reviewed', () => {
  const reviewed = {
    mustr: ['mustr — Community Platform · Self-Hosted | 919 Gaming', 'Every fellowship needs a ledger — a place the muster is called and kept.'],
    'the-blooming': ['The Blooming — A Horror One-Shot | 919 Gaming', 'Four strangers, one flower, and a night that does not end the way any of them was promised.'],
    'squall-riders': ['Squall Riders — Pantheon: Rise of the Fallen | 919 Gaming', 'A storm gathers on the horizon of a fallen world, and riders are answering its call. The muster has only just begun.'],
    'fleet-919': ['Fleet 919 | 919 Gaming', 'A fleet has been charted beyond the edge of the map, and 919 has raised its flag among the stars. Set your course, and the fleet will find you.'],
    anchor: ['A.N.C.H.O.R. — The Campaign Archive | 919 Gaming', 'Every person met, every room entered, every debt still owed — logged, cross-referenced, and kept. The table forgets by the following Tuesday.'],
    'case-file-1031': ['Case File 1031 — Interactive Horror · 2026 | 919 Gaming', 'Four investigators collected the evidence. You are the analyst who reviews it, alone.']
  };
  assert.deepEqual(pages.map((b) => b.slug), Object.keys(reviewed));
  for (const b of pages) assert.deepEqual([titleFor(b), descriptionFor(b)], reviewed[b.slug], b.slug);
});
