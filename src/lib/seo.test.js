import test from 'node:test';
import assert from 'node:assert/strict';
import { books } from '../books.js';
import { SITE, escapeHtml, pagesFor, titleFor, descriptionFor, canonicalFor, imageFor, renderSitemap, renderLibraryList, renderTomePage } from './seo.js';

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

// ---- the library list and a tome's page ----

const trio = [tome({ slug: 'a', title: 'Alpha', label: 'First' }), tome({ kind: 'journal', slug: 'j', title: 'Journal' }), tome({ slug: 'b', title: 'Beta', label: 'Second' }), tome({ slug: 'c', title: 'Gamma', label: 'Third' })];
const ldOf = (html) => JSON.parse(html.split('<script type="application/ld+json">')[1].split('</script>')[0]);

test('the library list links every page once with a real anchor, and never the journal', () => {
  const html = renderLibraryList(trio);
  for (const [slug, title, label] of [['a', 'Alpha', 'First'], ['b', 'Beta', 'Second'], ['c', 'Gamma', 'Third']]) {
    assert.equal(html.split(`<a href="/${slug}">${title}</a>`).length - 1, 1, slug);
    assert.ok(html.includes(label));
  }
  assert.ok(!html.includes('Journal') && !html.includes('href="/j"'));
});

test('the library list is a named nav with an h2', () => {
  const html = renderLibraryList(trio);
  assert.ok(html.startsWith('<nav class="library" aria-label="The library">'));
  assert.ok(html.includes('<h2'));
  assert.ok(html.includes('<ul>') && html.trim().endsWith('</nav>'));
});

test('a page has the title, description and canonical link', () => {
  const html = renderTomePage(trio[0], { books: trio });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes(`<title>${escapeHtml(titleFor(trio[0]))}</title>`));
  assert.ok(html.includes(`<meta name="description" content="${escapeHtml(descriptionFor(trio[0]))}">`));
  assert.ok(html.includes('<link rel="canonical" href="https://919gaming.com/a">'));
  assert.ok(html.includes('<link rel="stylesheet" href="/assets/tome-page.css">'));
});

test('a page has Open Graph and Twitter tags, a small card for the logo and a large one for a set image', () => {
  const plain = renderTomePage(trio[0], { books: trio });
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:site_name', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(plain.includes(`"${tag}"`), tag);
  assert.ok(plain.includes('<meta name="twitter:card" content="summary">'));
  assert.ok(plain.includes('<meta property="og:image" content="https://919gaming.com/assets/919gaming.png">'));
  const withImage = renderTomePage(tome({ seo: { image: 'https://x.example/card.jpg', imageAlt: 'A card' } }), { books: trio });
  assert.ok(withImage.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(withImage.includes('<meta property="og:image" content="https://x.example/card.jpg">'));
  assert.ok(withImage.includes('<meta property="og:image:alt" content="A card">'));
});

test('the h1 is the title, and the body holds the flavour, the quote and each description paragraph', () => {
  const html = renderTomePage(tome({ title: 'Alpha', flavor: 'The flavour.', quote: '“A quote.”', description: ['Para one.', 'Para two.'] }), { books: trio });
  assert.ok(html.includes('<h1>Alpha</h1>'));
  // in their own elements: the same words are also in the description tag, so a bare includes() would not show them missing from the body
  for (const markup of ['<p class="flavor">The flavour.</p>', '<p class="quote">“A quote.”</p>', '<p class="about">Para one.</p>', '<p class="about">Para two.</p>']) assert.ok(html.includes(markup), markup);
});

test('a page shows its pictures with their alt text, lazy-loaded', () => {
  const gallery = renderTomePage(tome({ gallery: ['assets/x.webp', 'assets/y.webp'], galleryAlts: ['An X.', 'A Y.'] }), { books: trio });
  assert.ok(gallery.includes('<img src="/assets/x.webp" alt="An X." loading="lazy">'));
  assert.ok(gallery.includes('<img src="/assets/y.webp" alt="A Y." loading="lazy">'));
  const left = renderTomePage(tome({ leftImage: 'assets/z.webp', leftImageAlt: 'A Z.' }), { books: trio });
  assert.ok(left.includes('<img src="/assets/z.webp" alt="A Z." loading="lazy">'));
});

test("a page lists a book's buy rows as links", () => {
  const html = renderTomePage(tome({ buy: [{ label: 'Paperback', url: 'https://thebloom.919gaming.com/buy/paperback' }, { label: 'eBook', url: 'https://thebloom.919gaming.com/buy/ebook' }] }), { books: trio });
  assert.ok(html.includes('<a href="https://thebloom.919gaming.com/buy/paperback">Paperback</a>'));
  assert.ok(html.includes('<a href="https://thebloom.919gaming.com/buy/ebook">eBook</a>'));
});

test("a page links to the project's own address, to /#slug and to the other pages, but not to itself", () => {
  const html = renderTomePage(trio[0], { books: trio });
  assert.ok(html.includes('href="https://alpha.example/"'));
  assert.ok(html.includes('href="/#a"'));
  assert.ok(html.includes('href="/b"') && html.includes('href="/c"') && html.includes('href="/"'));
  assert.ok(!html.includes('href="/a"') && !html.includes('href="/j"'));
});

test('a page escapes a title, label, flavour and address with markup in them, everywhere they appear', () => {
  const evil = tome({ title: 'A&B <i>"x"</i>', label: 'L&"M"', flavor: '<script>alert(1)</script> &', description: 'D & "E".', url: 'https://e.example/?a=1&b=2' });
  const html = renderTomePage(evil, { books: [evil] });
  assert.ok(!html.includes('<i>"x"</i>') && !html.includes('<script>alert') && !html.includes('?a=1&b=2'));
  assert.ok(html.includes('A&amp;B &lt;i&gt;&quot;x&quot;&lt;/i&gt;'));
  assert.ok(html.includes('?a=1&amp;b=2'));
  const ld = html.split('<script type="application/ld+json">')[1].split('</script>')[0];
  assert.ok(!ld.includes('<'), 'JSON-LD cannot close its own script');
  assert.equal(JSON.parse(ld).itemListElement[1].name, 'A&B <i>"x"</i>');
});

test('the JSON-LD parses and holds a BreadcrumbList with two items', () => {
  const ld = ldOf(renderTomePage(trio[0], { books: trio }));
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'BreadcrumbList');
  assert.deepEqual(ld.itemListElement.map((i) => [i.position, i.name, i.item]), [[1, '919 Gaming', 'https://919gaming.com/'], [2, 'Alpha', 'https://919gaming.com/a']]);
});

test('a book with only a slug, title, label, address and host renders a complete page', () => {
  const bare = { kind: 'project', slug: 'bare', title: 'Bare', label: 'Label', url: 'https://bare.example/', host: 'bare.example' };
  const html = renderTomePage(bare, { books: [bare] });
  assert.ok(html.includes('<h1>Bare</h1>') && html.includes('<link rel="canonical" href="https://919gaming.com/bare">'));
  assert.ok(!html.includes('undefined') && !html.includes('null'));
  assert.ok(!html.includes('<p class="flavor"></p>') && !html.includes('<ul class="buy">') && !html.includes('<figure'));
  assert.ok(!html.includes('name="description"'), 'no empty description tag');
  for (const tag of ['main', 'header', 'nav', 'head', 'body', 'html']) {
    const opened = html.split(`<${tag}>`).length - 1 + html.split(`<${tag} `).length - 1; // `<head` alone would also count <header
    assert.equal(opened, html.split(`</${tag}>`).length - 1, tag);
  }
});

test('a page has no executable script, only the JSON-LD data block', () => {
  const html = renderTomePage(trio[0], { books: trio });
  assert.equal(html.split('<script').length - 1, 1);
  assert.ok(html.includes('<script type="application/ld+json">'));
});

test('every real page renders with its canonical link and a description tag', () => {
  for (const b of pagesFor(books)) {
    const html = renderTomePage(b, { books });
    assert.ok(html.includes(`<link rel="canonical" href="${canonicalFor(b)}">`), b.slug);
    assert.ok(html.includes('name="description"'), b.slug);
  }
});
