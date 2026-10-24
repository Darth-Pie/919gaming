// A Vite plugin that makes the crawlable parts of the site from src/books.js, the same data the shelf is drawn from:
//   - replaces <!-- LIBRARY --> in index.html with the list of links to every tome's page;
//   - emits <slug>.html for each tome and sitemap.xml at the root of dist/;
//   - in `vite dev`, answers /<slug> and /sitemap.xml from the same renderers, so a page can be looked at without a build.
// Node built-ins only; the renderers are the pure functions in src/lib/seo.js (tested there). tools/check-dist.mjs checks the result.
import { books } from '../src/books.js';
import { pagesFor, renderLibraryList, renderTomePage, renderSitemap } from '../src/lib/seo.js';

export default function seoPages() {
  const pages = pagesFor(books);
  return {
    name: 'seo-pages',

    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace('<!-- LIBRARY -->', renderLibraryList(books))
    },

    generateBundle() {
      for (const book of pages) {
        this.emitFile({ type: 'asset', fileName: `${book.slug}.html`, source: renderTomePage(book, { books }) });
      }
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(books) });
    },

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        const book = pages.find((page) => `/${page.slug}` === path);
        if (book) {
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(renderTomePage(book, { books }));
        } else if (path === '/sitemap.xml') {
          response.setHeader('Content-Type', 'application/xml; charset=utf-8');
          response.end(renderSitemap(books));
        } else {
          next();
        }
      });
    }
  };
}
