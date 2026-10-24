// What a search engine is told about each tome: the page's title, description, canonical address, share image, and the sitemap.
// Pure functions of the data in books.js (no imports, no DOM), so they run in Node at build time and are tested with `node --test`
// (seo.test.js). The page and list renderers that build on these live in this file too (added below).

export const SITE = 'https://919gaming.com';

const LOGO = `${SITE}/assets/919gaming.png`;
const DESCRIPTION_LIMIT = 155;

/** Text for HTML text, an attribute, JSON-LD (inside a script) or XML. */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The tomes that get a page of their own: those with a slug, except the personal journal, in shelf order. */
export function pagesFor(books) {
  return books.filter((book) => book.slug && book.kind !== 'journal');
}

/** `seo.title`, else "<title> — <label> | 919 Gaming" (or "<title> | 919 Gaming" when the label repeats the title). */
export function titleFor(book) {
  if (book.seo?.title) return book.seo.title;
  const head = book.label && book.label !== book.title ? `${book.title} — ${book.label}` : book.title;
  return `${head} | 919 Gaming`;
}

// A sentence ends at . ! or ? (a closing quote or bracket may follow) and the next one starts with a capital, a digit or an opening
// quote, unless the full stop closes an abbreviation of single letters such as "A.N.C.H.O.R."; no character is ever dropped.
const sentencesOf = (text) => text.split(/(?<=[.!?]["”’)]*)(?<!\b(?:[A-Za-z]\.){2,}["”’)]*)\s+(?=["“‘(]?[A-Z0-9])/);

/**
 * `seo.description`, else the flavour followed by the description's sentences: whole sentences only, as many as fit in 155
 * characters; when even the first is longer, it is cut at a word and ends with an ellipsis.
 */
export function descriptionFor(book) {
  if (book.seo?.description) return book.seo.description;
  const text = [book.flavor, ...[].concat(book.description ?? [])].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const sentences = sentencesOf(text);
  let out = '';
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > DESCRIPTION_LIMIT) break;
    out = next;
  }
  if (out) return out;
  const cut = sentences[0].slice(0, DESCRIPTION_LIMIT - 1);
  const at = cut.lastIndexOf(' ');
  return `${at > 0 ? cut.slice(0, at) : cut}…`;
}

/** The page's own address, with no trailing slash. */
export function canonicalFor(book) {
  return `${SITE}/${book.slug}`;
}

/** The share image: `seo.image` made absolute (a large card), else the site logo (a small one). */
export function imageFor(book) {
  const image = book.seo?.image;
  if (!image) return { url: LOGO, alt: '919 Gaming', large: false };
  const url = image.startsWith('http') ? image : `${SITE}/${image.replace(/^\/+/, '')}`;
  return { url, alt: book.seo.imageAlt ?? book.title, large: true };
}

/** sitemap.xml: the home page and every page, without a lastmod (a made-up date helps no one). */
export function renderSitemap(books) {
  const urls = [`${SITE}/`, ...pagesFor(books).map(canonicalFor)];
  const entries = urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}
