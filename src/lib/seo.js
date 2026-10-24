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

const FONTS = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Cinzel:wght@400;600&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap';

/** The home page's list of real links, one per page. Lives outside the React shelf, so it is there with scripts off and after they run. */
export function renderLibraryList(books) {
  const items = pagesFor(books).map((book) => {
    const label = book.label && book.label !== book.title ? ` <span>${escapeHtml(book.label)}</span>` : '';
    return `      <li><a href="/${escapeHtml(book.slug)}">${escapeHtml(book.title)}</a>${label}</li>`;
  }).join('\n');
  return `<nav class="library" aria-label="The library">\n    <h2 class="library-title">The Library</h2>\n    <ul>\n${items}\n    </ul>\n  </nav>`;
}

// JSON for a <script type="application/ld+json"> block: every < becomes <, so the data can never close its own script.
const jsonForScript = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

const picturesOf = (book) => {
  if (book.gallery) return book.gallery.map((src, i) => [src, book.galleryAlts?.[i] ?? '']);
  if (book.leftImage) return [[book.leftImage, book.leftImageAlt ?? '']];
  return [];
};
const figure = ([src, alt]) => `<figure><img src="/${escapeHtml(src.replace(/^\/+/, ''))}" alt="${escapeHtml(alt)}" loading="lazy"></figure>`;

/** A tome's page: a complete document with the tome's own words in it, readable with no script. */
export function renderTomePage(book, { books }) {
  const title = titleFor(book);
  const description = descriptionFor(book);
  const canonical = canonicalFor(book);
  const image = imageFor(book);
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '919 Gaming', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: book.title, item: canonical }
    ]
  };
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    description && `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    '<link rel="icon" href="/assets/favicon.png" type="image/png">',
    '<meta name="theme-color" content="#c9a96a">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="919 Gaming">',
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    description && `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(image.url)}">`,
    `<meta property="og:image:alt" content="${escapeHtml(image.alt)}">`,
    `<meta name="twitter:card" content="${image.large ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    description && `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image.url)}">`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link href="${escapeHtml(FONTS)}" rel="stylesheet">`,
    '<link rel="stylesheet" href="/assets/tome-page.css">',
    `<script type="application/ld+json">${jsonForScript(breadcrumbs)}</script>`
  ].filter(Boolean).join('\n');

  const pictures = picturesOf(book).map(figure).join('\n');
  const paragraphs = [].concat(book.description ?? []).filter(Boolean).map((text) => `<p class="about">${escapeHtml(text)}</p>`).join('\n');
  const buy = book.buy?.length
    ? `<ul class="buy">\n${book.buy.map((row) => `<li><a href="${escapeHtml(row.url)}">${escapeHtml(row.label)}</a></li>`).join('\n')}\n</ul>`
    : '';
  const main = [
    book.label && `<p class="label">${escapeHtml(book.label)}</p>`,
    `<h1>${escapeHtml(book.title)}</h1>`,
    book.flavor && `<p class="flavor">${escapeHtml(book.flavor)}</p>`,
    book.quote && `<p class="quote">${escapeHtml(book.quote)}</p>`,
    pictures && `<div class="pictures">\n${pictures}\n</div>`,
    paragraphs,
    buy,
    `<p class="go"><a class="visit" href="${escapeHtml(book.url)}">Visit ${escapeHtml(book.host ?? book.url)}</a> <a class="shelf" href="/#${escapeHtml(book.slug)}">Open it on the shelf</a></p>`
  ].filter(Boolean).join('\n');

  const others = pagesFor(books).filter((other) => other.slug !== book.slug);
  const more = others.length
    ? `<nav class="more" aria-label="More from the library">\n<h2>More from the library</h2>\n<ul>\n${others.map((other) => `<li><a href="/${escapeHtml(other.slug)}">${escapeHtml(other.title)}</a>${other.label && other.label !== other.title ? ` <span>${escapeHtml(other.label)}</span>` : ''}</li>`).join('\n')}\n</ul>\n</nav>`
    : '';

  return `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body class="tome-page">\n<header class="tome-top"><a href="/">919 Gaming</a> <span>A Library of Worlds</span></header>\n<main class="sheet">\n${main}\n</main>\n${more}\n</body>\n</html>\n`;
}

/** sitemap.xml: the home page and every page, without a lastmod (a made-up date helps no one). */
export function renderSitemap(books) {
  const urls = [`${SITE}/`, ...pagesFor(books).map(canonicalFor)];
  const entries = urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}
