// The owner's link to the studio (studio.919gaming.com) in the home page's top-right nav.
//
// The page asks GET /keepers-secrets/status once it has loaded; only when the answer says the visitor is logged in
// AND is the owner (isGod) does a "Studio" entry get added to the existing .top-nav, last, in the same style as its
// neighbours (the nav's own CSS styles any a and svg inside it). Nobody else ever gets the entry, so there is nothing
// to hide or flash, and it is not in the generated pages or the sitemap (tools/check-dist.mjs fails the build if it
// is). Hiding it is a courtesy, not security: the studio's own Discord login is what protects the studio.
//
// Every failure (no nav, no network, an answer that is not OK or not JSON) means no link and no thrown error, so the
// shelf, the apparitions and the ghost carry on.

export const STUDIO_URL = 'https://studio.919gaming.com/';

const STATUS_PATH = '/keepers-secrets/status';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MARK = 'M30 6 L34 26 L54 30 L34 34 L30 54 L26 34 L6 30 L26 26 Z'; // the sparkle the other nav entries use

/** True only for a logged-in owner, by strict equality: no other answer shows the link. */
export function shouldShowStudioLink(status) {
  return typeof status === 'object' && status !== null && status.loggedIn === true && status.isGod === true;
}

/** The nav entry, built with DOM methods only (no markup strings). */
export function buildStudioLink(doc) {
  const link = doc.createElement('a');
  link.setAttribute('href', STUDIO_URL);
  link.setAttribute('data-studio-link', '');

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', MARK);
  svg.appendChild(path);

  link.appendChild(svg);
  link.appendChild(doc.createTextNode('Studio'));
  return link;
}

/**
 * Adds the entry for the owner. Resolves true when the owner's entry is in the nav (added now or already there),
 * false in every other case, including every error; it never rejects. With no nav it asks nothing.
 */
export async function addStudioLink({ doc, fetchImpl } = {}) {
  try {
    const page = doc ?? document;
    const nav = page.querySelector('.top-nav');
    if (!nav) return false;
    const res = await (fetchImpl ?? fetch)(STATUS_PATH, { credentials: 'same-origin' });
    if (!res.ok) return false;
    if (!shouldShowStudioLink(await res.json())) return false;
    if (!nav.querySelector('[data-studio-link]')) nav.appendChild(buildStudioLink(page));
    return true;
  } catch {
    return false;
  }
}

/** Called once by the home page's entry point; not awaited, and its result is ignored. */
export function startStudioLink() {
  addStudioLink().catch(() => {});
}
