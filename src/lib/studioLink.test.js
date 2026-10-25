import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_URL, shouldShowStudioLink, buildStudioLink, addStudioLink } from './studioLink.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// A small stand-in for the parts of a document the module uses. Assigning innerHTML on any element throws,
// so a module that builds markup from a string cannot pass.
function fakeDoc({ withNav = true } = {}) {
  const make = (tag, ns) => {
    const el = {
      tag,
      ns,
      attrs: {},
      children: [],
      setAttribute(name, value) { this.attrs[name] = String(value); },
      appendChild(child) { this.children.push(child); return child; },
    };
    Object.defineProperty(el, 'innerHTML', { get: () => '', set() { throw new Error('innerHTML is not allowed'); } });
    return el;
  };
  const nav = make('div');
  nav.querySelector = (selector) =>
    selector === '[data-studio-link]' ? nav.children.find((c) => c.attrs && 'data-studio-link' in c.attrs) ?? null : null;
  return {
    nav,
    createElement: (tag) => make(tag),
    createElementNS: (ns, tag) => make(tag, ns),
    createTextNode: (text) => ({ nodeType: 3, text }),
    querySelector: (selector) => (selector === '.top-nav' && withNav ? nav : null),
  };
}

// A fetch stand-in that records what it was asked and answers with a JSON body.
function fetchAnswering(body, { ok = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok, json: async () => body }; };
  return { fetchImpl, calls };
}

const OWNER = { loggedIn: true, isGod: true };
const linksIn = (doc) => doc.nav.children.filter((c) => c.attrs && 'data-studio-link' in c.attrs);

test('shouldShowStudioLink is true only for a logged-in owner, by strict equality', () => {
  assert.equal(shouldShowStudioLink(OWNER), true);
  for (const odd of [
    { loggedIn: true, isGod: false },
    { loggedIn: false, isGod: true },
    { loggedIn: true },
    { isGod: true },
    { loggedIn: 'true', isGod: 'true' },
    { loggedIn: 1, isGod: 1 },
    { loggedIn: true, isGod: 'true' },
    { loggedIn: true, isGod: 1 },
    { loggedIn: 'true', isGod: true },
    { loggedIn: 1, isGod: true },
    {},
    null,
    undefined,
    'yes',
    42,
  ]) {
    assert.equal(shouldShowStudioLink(odd), false, JSON.stringify(odd));
  }
});

test('shows for the owner, once, even if asked twice', async () => {
  const doc = fakeDoc();
  const { fetchImpl } = fetchAnswering(OWNER);
  assert.equal(await addStudioLink({ doc, fetchImpl }), true);
  assert.equal(await addStudioLink({ doc, fetchImpl }), true);
  assert.equal(linksIn(doc).length, 1);
  assert.equal(doc.nav.children.at(-1), linksIn(doc)[0], 'the link is the nav\'s last entry');
});

test('shows nothing for a signed-out visitor, a keeper who is not the owner, or an odd answer', async () => {
  // the control: the same harness does show the link for the owner, so "nothing" below means something
  const control = fakeDoc();
  await addStudioLink({ doc: control, fetchImpl: fetchAnswering(OWNER).fetchImpl });
  assert.equal(linksIn(control).length, 1);

  for (const answer of [
    { loggedIn: false, isGod: false },
    { loggedIn: true, isGod: false },
    { loggedIn: false, isGod: true },
    { loggedIn: true },
    {},
    null,
    'God',
  ]) {
    const doc = fakeDoc();
    assert.equal(await addStudioLink({ doc, fetchImpl: fetchAnswering(answer).fetchImpl }), false, JSON.stringify(answer));
    assert.equal(doc.nav.children.length, 0, JSON.stringify(answer));
  }
});

test('survives a rejected request, a non-OK answer, and a body that is not JSON', async () => {
  const outcomes = [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, json: async () => OWNER }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('not JSON'); } }),
  ];
  for (const fetchImpl of outcomes) {
    const doc = fakeDoc();
    assert.equal(await addStudioLink({ doc, fetchImpl }), false);
    assert.equal(doc.nav.children.length, 0);
  }
});

test('does nothing, and asks nothing, when the nav is absent', async () => {
  const doc = fakeDoc({ withNav: false });
  const { fetchImpl, calls } = fetchAnswering(OWNER);
  assert.equal(await addStudioLink({ doc, fetchImpl }), false);
  assert.equal(calls.length, 0);
});

test('asks the status path with the page cookies', async () => {
  const doc = fakeDoc();
  const { fetchImpl, calls } = fetchAnswering(OWNER);
  await addStudioLink({ doc, fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/keepers-secrets/status');
  assert.equal(calls[0].init.credentials, 'same-origin');
});

test('builds the link with DOM methods: the address, the marker, the aria-hidden mark and the text Studio', () => {
  const doc = fakeDoc();
  const link = buildStudioLink(doc);
  assert.equal(link.tag, 'a');
  assert.equal(link.attrs.href, STUDIO_URL);
  assert.equal(STUDIO_URL, 'https://studio.919gaming.com/');
  assert.ok('data-studio-link' in link.attrs);

  const [svg, text] = link.children;
  assert.equal(svg.tag, 'svg');
  assert.equal(svg.ns, SVG_NS);
  assert.equal(svg.attrs.viewBox, '0 0 60 60');
  assert.equal(svg.attrs.fill, 'currentColor');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  const [path] = svg.children;
  assert.equal(path.tag, 'path');
  assert.equal(path.ns, SVG_NS);
  assert.equal(path.attrs.d, 'M30 6 L34 26 L54 30 L34 34 L30 54 L26 34 L6 30 L26 26 Z');
  assert.deepEqual(text, { nodeType: 3, text: 'Studio' });
  assert.equal(link.children.length, 2);
});
