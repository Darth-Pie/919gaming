# 919gaming.com: a crawlable library and a page for each tome: design

Date: 2026-10-24. Status: approved in conversation (the design was presented whole and approved); this document is for the
owner's review. Covers the `919gaming` repository (part A), and one small optional part in the `thebloom` repository (part B).

## Goal

Make it possible for a search engine, and for a visitor with scripts off, to get from 919gaming.com to every project and to read
about each one:

- a plain list of real links to every project sits on the home page, outside the React shelf;
- each tome has its own address, title, description, canonical link and share tags, with the tome's words in the page itself;
- a sitemap lists them, and the generated pages come from the same `src/books.js` that draws the shelf, so adding a project
  stays a one-object edit.

## Decisions (owner, 2026-10-24)

- **Approach: static pages generated at build time** by a small Vite plugin, not pages rendered by the Worker and not hand-written pages.
- **Six tomes get a page; The Keeper's Journal does not** (it is the owner's personal page).
- **The words are the owner's existing ones.** Titles and descriptions default to what `books.js` already says; the owner reads the
  table below before anything is pushed, and can replace any string. No new marketing copy is written.
- **Part B (the Book structured data on the Bloom site) is separate and optional**: it has its own repository, deploy and approval.

## Facts this rests on (checked 2026-10-24)

- **How the site is served.** The Worker (`src/worker.js`) passes every path it does not own to `env.ASSETS.fetch(request)`
  (`wrangler.jsonc`: `run_worker_first: true`, no `html_handling`, no `not_found_handling`). The defaults apply: a file `foo.html` is
  served at `/foo` (no trailing slash) and `foo/index.html` at `/foo/` (Cloudflare Workers docs, "Static Site Generation").
- **What a crawler sees today.** The static home page holds the masthead, the shelf line and the top bar. The shelf is built by React
  into `#shelf-root`; its spines are `div role="button"`, and a tome's text exists only when it is opened. No project name except The
  Blooming appears in the HTML, and no link leads to any project site except the top-bar "The Blooming" link.
- **The data.** `src/books.js` has seven entries; it imports only `./lib/buy.js`, so Node can import it. Only The Blooming has a `slug`.
  Descriptions run 160 to 340 characters (mustr has a `flavor` and no `description`). Pages are short and are directory entries:
  they give a project an address on the home domain and a crawlable path, and will not outrank the project's own site.
- **Build and deploy.** `npm run build` is `vite build`; Cloudflare's Git build runs it on every push to `main`, and the site deploys
  20 to 40 seconds later (seen on the last three pushes). A failing build step therefore stops a bad deploy.
- **`robots.txt` and `sitemap.xml`.** `/robots.txt` is Cloudflare's managed file: comments only (content signals), no `Sitemap:`
  line and no rules. `/sitemap.xml` is a 404.

## 1. The data (`src/books.js`)

- **`slug`** on the six tomes: `mustr`, `the-blooming` (already there), `squall-riders`, `fleet-919`, `anchor`, `case-file-1031`.
  These are public once indexed; renaming one later needs a redirect. The `#slug` deep link already uses `slug`, so
  `919gaming.com/#squall-riders` starts working too.
- **`seo`** (optional) per tome: `{ title, description, image, imageAlt }`. Each field overrides the default below. The Blooming sets
  `image: 'https://thebloom.919gaming.com/assets/share.jpg'` (1200 × 630, public) and an `imageAlt`.
- **Alt text** for pictures the page shows: `galleryAlts` (a list, parallel to `gallery`) and `leftImageAlt`. Written by looking at
  each picture; a purely decorative one gets `''`.

## 2. The pure renderer (`src/lib/seo.js`)

No imports; plain functions, tested with `node --test`.

- `SITE`: `'https://919gaming.com'`.
- `pagesFor(books)`: the books that get a page (a `slug`, and `kind` not `'journal'`), in shelf order.
- `titleFor(book)`: `seo.title`, else `"<title> — <label> | 919 Gaming"`, or `"<title> | 919 Gaming"` when label and title are the same.
- `descriptionFor(book)`: `seo.description`, else the flavour followed by the description's sentences, whole sentences only, as many as fit
  in 155 characters; when even the first sentence is longer, cut at a word and end with `…`.
- `canonicalFor(book)`: `SITE + '/' + slug`.
- `renderLibraryList(books)`, `renderTomePage(book, { books })`, `renderSitemap(books)`, and `escapeHtml(text)`, which every piece of
  text passes through on the way into HTML or JSON-LD.

## 3. The build (`tools/seo-plugin.mjs`, `tools/check-dist.mjs`, `vite.config.js`, `package.json`)

- **The Vite plugin** (Node built-ins only) imports `books.js` and `seo.js` and:
  - replaces a `<!-- LIBRARY -->` placeholder in `index.html` with `renderLibraryList(books)` (in `vite dev` as well as in a build);
  - emits `<slug>.html` for each page and `sitemap.xml` as assets at the root of `dist/`;
  - in `vite dev`, answers `/<slug>` from the same renderer, so a page can be looked at without a build.
- **`tools/check-dist.mjs`** runs after the build (`"build": "vite build && node tools/check-dist.mjs"`) and fails it when: a page file is
  missing or has no canonical link; the home page lacks the library list or a link to a page; the sitemap is missing a page; `robots.txt` has
  no `Sitemap:` line; or a book with a `slug` has no title or a title over 60 characters.

## 4. The home page list

`<nav class="library" aria-label="The library">` with an `h2` "The Library" and a `<ul>` of links, one per page, each as the title and
the label: `<a href="/the-blooming">The Blooming</a> A Horror One-Shot`. It sits below the shelf, **outside `#shelf-root`**, so React never
replaces it and it stays in the page after scripts run. Small gilt Cinzel type, centred, wrapping on a phone; the fixed footer line must
not cover it.

## 5. A tome page

A plain document, no JavaScript. Head: the title; the description; `<link rel="canonical">`; Open Graph and Twitter tags (the image is
`seo.image`, else the site logo, and the Twitter card is `summary_large_image` only when an image is set); the favicon; the same Google
Fonts link as the home page; `/assets/tome-page.css`; and a `BreadcrumbList` JSON-LD (Home > the tome). Body:

- a link back to the home page; the label; the `h1`; the flavour; the quote (The Blooming only);
- the pictures (`leftImage`, or `gallery`), with their alt text and `loading="lazy"`;
- the description paragraphs;
- for a `book` tome, the buy buttons from its `buy` list (they already point at the Bloom site's `/buy/<name>` short links);
- "Visit <host>" to the project's own address, "Open it on the shelf" to `/#<slug>`, and a list of links to the other pages.

`public/assets/tome-page.css` is a new, small stylesheet (dark ground, one parchment sheet, gilt headings) using the site's fonts and colours;
it does not touch the home page's inline styles.

## 6. Sitemap, robots and noindex

- `sitemap.xml`: the home page and the six pages, no `lastmod` (a made-up date helps no one).
- `public/robots.txt`: `User-agent: *`, `Allow: /`, `Disallow: /keepers-secrets`, and the `Sitemap:` line. Cloudflare's managed file adds its
  content-signal comments to a file you supply; the live result is read after the first deploy.
- The Worker sets `X-Robots-Tag: noindex, nofollow` on every `/keepers-secrets` response (sign-in, callback, admin).

## 7. Part B (optional, `thebloom` repository)

On `thebloom.919gaming.com`: a `Book` JSON-LD on the home page, with the four Lulu pages as offers (prices and addresses from
`site/src/buy.mjs`, pinned by a test as the prices on the page already are), plus the two head tags that page lacks: a meta description (the
hero tagline) and a canonical link. A public `sitemap.xml` (`/` and `/invitation`) and a `Sitemap:` line in a `robots.txt`; today the Bloom's
`/sitemap.xml` redirects to the sign-in page. Deployed by hand, as before.

## The derived titles and descriptions, for the owner to read

Computed from today's `books.js` by the rules in section 2. Replace any by setting that tome's `seo.title` or `seo.description`.

| Page | Title | Description |
|---|---|---|
| `/the-blooming` | The Blooming — A Horror One-Shot \| 919 Gaming (45) | Four strangers, one flower, and a night that does not end the way any of them was promised. (91) |
| `/mustr` | mustr — Community Platform · Self-Hosted \| 919 Gaming (53) | Every fellowship needs a ledger — a place the muster is called and kept. (72) |
| `/squall-riders` | Squall Riders — Pantheon: Rise of the Fallen \| 919 Gaming (57) | A storm gathers on the horizon of a fallen world, and riders are answering its call. The muster has only just begun. (116) |
| `/fleet-919` | Fleet 919 \| 919 Gaming (22) | A fleet has been charted beyond the edge of the map, and 919 has raised its flag among the stars. Set your course, and the fleet will find you. (143) |
| `/anchor` | A.N.C.H.O.R. — The Campaign Archive \| 919 Gaming (48) | Every person met, every room entered, every debt still owed — logged, cross-referenced, and kept. The table forgets by the following Tuesday. (141) |
| `/case-file-1031` | Case File 1031 — Interactive Horror · 2026 \| 919 Gaming (55) | Four investigators collected the evidence. You are the analyst who reviews it, alone. (85) |

Three are short (mustr 72, Case File 1031 85, The Blooming 91) because their next sentence would not fit in 155 characters. A description of
that length is valid; a longer one would read better in a result. That is the owner's call, in the owner's words.

## Tests and checks

- **`node --test` (no new dependency):** titles are at most 60 characters and unique; descriptions are 50 to 160; the canonical is
  `SITE/<slug>`; text with `&`, `<`, `"` and the "A.N.C.H.O.R." title is escaped in attributes and JSON-LD, and the JSON-LD parses; a book
  with none of the optional fields renders a complete page; the sitemap lists exactly the pages; the library list links every page and none
  to the journal; slugs are unique; the real `books.js` passes all of these.
- **The build's own check** (`tools/check-dist.mjs`) as above.
- **On screen:** the home list and a tome page at 1280 and 375 px (no sideways scroll; the fixed footer does not cover the list); a page
  with scripts off. The real Worker run (`wrangler dev`): `/the-blooming` is 200, `/the-blooming/` redirects to `/the-blooming`,
  `/sitemap.xml` and `/robots.txt` answer, and `/keepers-secrets` carries `X-Robots-Tag`.
- **No unit tests** for the plugin's wiring or the Worker line: they are checked by the build check, the dev run and on screen, and the report
  says so. A test harness for them is not added here.

## Out of scope

- A new home-page title, description, canonical link, share card, or `Organization` / `WebSite` JSON-LD (the next package of quick fixes).
- Per-tome share cards, a custom 404 page, redirects for renamed slugs, a page for The Keeper's Journal.
- Google Search Console, Bing Webmaster and any analytics: the owner verifies the domain; no code here.
- Any change to the tomes' look on the shelf.

## For the owner to decide or check

1. **The six slugs** above (they become public addresses).
2. **The titles and descriptions** in the table, and whether any should be your own words instead.
3. **Part B**: wanted or not.
4. **After the first deploy:** read `/robots.txt` live (Cloudflare's managed file and ours must both be there), and in Search Console submit
   `sitemap.xml` and inspect `/the-blooming`.
