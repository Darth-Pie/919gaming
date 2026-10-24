// The check that runs after `vite build` (npm run build): it reads the built dist/ and fails when the crawlable parts are not all there,
// so a broken generation stops the deploy instead of shipping. Run as a script it checks ./dist against the real books.js.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SITE, pagesFor, titleFor, canonicalFor } from '../src/lib/seo.js';

const TITLE_LIMIT = 60;

/**
 * @param {string} distDir the built site
 * @param {object[]} books the data the pages were made from
 * @returns {string[]} the problems, one line each; empty means the dist is clean
 */
export function checkDist(distDir, books) {
  const problems = [];
  const read = (name) => {
    try {
      return readFileSync(join(distDir, name), 'utf8');
    } catch {
      return null;
    }
  };
  const pages = pagesFor(books);

  for (const book of pages) {
    if (!book.title) problems.push(`${book.slug}: no title`);
    else if (titleFor(book).length > TITLE_LIMIT) problems.push(`${book.slug}: the title is ${titleFor(book).length} characters, over ${TITLE_LIMIT}`);
  }

  const home = read('index.html');
  if (home === null) {
    problems.push('index.html is missing');
  } else {
    if (!home.includes('class="library"')) problems.push('the home page has no library list');
    for (const book of pages) if (!home.includes(`href="/${book.slug}"`)) problems.push(`the home page does not link to /${book.slug}`);

    const canonical = home.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0];
    if (!canonical?.includes(`href="${SITE}/"`)) problems.push(`the home page has no canonical link to ${SITE}/`);

    const card = home.match(/<meta[^>]*property="og:image"[^>]*>/)?.[0]?.match(/content="([^"]*)"/)?.[1];
    if (!card) problems.push('the home page has no og:image tag');
    else if (!card.startsWith(`${SITE}/`)) problems.push(`the home page share image is not on ${SITE}/`);
    else if (!existsSync(join(distDir, card.slice(SITE.length + 1)))) problems.push(`the share image ${card.slice(SITE.length + 1)} is missing from dist`);
  }

  for (const book of pages) {
    const html = read(`${book.slug}.html`);
    if (html === null) problems.push(`${book.slug}.html is missing`);
    else if (!html.includes(`<link rel="canonical" href="${canonicalFor(book)}">`)) problems.push(`${book.slug}.html has no canonical link`);
  }

  const sitemap = read('sitemap.xml');
  if (sitemap === null) {
    problems.push('sitemap.xml is missing');
  } else {
    for (const url of [`${SITE}/`, ...pages.map(canonicalFor)]) if (!sitemap.includes(`<loc>${url}</loc>`)) problems.push(`sitemap.xml does not list ${url}`);
  }

  const robots = read('robots.txt');
  if (robots === null) problems.push('robots.txt is missing');
  else if (!/^Sitemap:/mi.test(robots)) problems.push('robots.txt has no Sitemap line');

  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { books } = await import('../src/books.js');
  const dist = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
  const problems = checkDist(dist, books);
  if (problems.length) {
    console.error(`dist check: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`dist check: ${pagesFor(books).length} pages, the library list, the home canonical and share image, sitemap.xml and robots.txt are all there`);
}
