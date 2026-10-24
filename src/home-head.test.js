import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// What the home page's <head> tells a search engine and a link preview, read from index.html as text.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const publicFile = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url));

const decode = (text) => text.split('&amp;').join('&').split('&quot;').join('"').split('&#39;').join("'");
const meta = (attr, key) => {
  const found = head.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`));
  return found ? decode(found[1]) : null;
};
const count = (needle) => head.split(needle).length - 1;

const TITLE = '919 Gaming — Horror One-Shots, RPG Campaigns & Games';
const DESCRIPTION = 'A library of worlds from 919 Gaming: The Blooming, a horror one-shot in print; the A.N.C.H.O.R. campaign archive; Case File 1031, interactive horror.';
const SHARE_TITLE = '919 Gaming — A Library of Worlds';
const HOME = 'https://919gaming.com/';
const CARD = 'https://919gaming.com/assets/share-card.jpg';

// width and height from a JPEG's start-of-frame marker
function jpegSize(bytes) {
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return null;
}

test('the title is the approved one, and at most 60 characters', () => {
  const found = head.match(/<title>([^<]*)<\/title>/);
  assert.equal(decode(found[1]), TITLE);
  assert.ok(TITLE.length <= 60);
  assert.equal(count('<title>'), 1);
});

test('the description is the approved one, 120 to 160 characters, once', () => {
  assert.equal(meta('name', 'description'), DESCRIPTION);
  assert.ok(DESCRIPTION.length >= 120 && DESCRIPTION.length <= 160, String(DESCRIPTION.length));
  assert.equal(count('name="description"'), 1);
});

test('the canonical link is the home page address, once', () => {
  assert.ok(head.includes(`<link rel="canonical" href="${HOME}" />`));
  assert.equal(count('rel="canonical"'), 1);
});

test('the Open Graph and Twitter tags carry the share title, the description and the address', () => {
  assert.equal(meta('property', 'og:title'), SHARE_TITLE);
  assert.equal(meta('property', 'og:description'), DESCRIPTION);
  assert.equal(meta('property', 'og:url'), HOME);
  assert.equal(meta('property', 'og:site_name'), '919 Gaming');
  assert.equal(meta('name', 'twitter:title'), SHARE_TITLE);
  assert.equal(meta('name', 'twitter:description'), DESCRIPTION);
});

test('the share image is the 1200 by 630 card, in the tags and in the file', () => {
  assert.equal(meta('property', 'og:image'), CARD);
  assert.equal(meta('name', 'twitter:image'), CARD);
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta('property', 'og:image:width'), '1200');
  assert.equal(meta('property', 'og:image:height'), '630');
  assert.ok(meta('property', 'og:image:alt')?.length > 10);
  assert.deepEqual(jpegSize(publicFile('assets/share-card.jpg')), [1200, 630]);
});

test('the structured data parses and holds an Organization and a WebSite', () => {
  const block = head.split('<script type="application/ld+json">')[1]?.split('</script>')[0];
  assert.ok(block, 'no JSON-LD block');
  assert.ok(!block.includes('</'), 'the data cannot close its own script');
  const ld = JSON.parse(block);
  assert.equal(ld['@context'], 'https://schema.org');
  const [org, site] = ['Organization', 'WebSite'].map((type) => ld['@graph'].find((node) => node['@type'] === type));
  assert.deepEqual(org, {
    '@type': 'Organization', '@id': `${HOME}#organization`, name: '919 Gaming', url: HOME,
    logo: 'https://919gaming.com/assets/favicon.png', sameAs: ['https://discord.gg/fleet919']
  });
  assert.deepEqual(site, { '@type': 'WebSite', '@id': `${HOME}#website`, name: '919 Gaming', url: HOME, inLanguage: 'en', publisher: { '@id': `${HOME}#organization` } });
  assert.equal(ld['@graph'].length, 2);
});

test('the Organization logo is a square PNG of at least 112 pixels', () => {
  const logo = publicFile('assets/favicon.png');
  const [width, height] = [logo.readUInt32BE(16), logo.readUInt32BE(20)];
  assert.equal(width, height);
  assert.ok(width >= 112);
});
