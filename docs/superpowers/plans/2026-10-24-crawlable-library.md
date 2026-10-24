# A Crawlable Library and a Page for Each Tome: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a plain list of real links to every project on the 919gaming.com home page, and give each of six tomes its own address, title, description, canonical link and share tags, all generated at build time from `src/books.js`, with a sitemap.

**Architecture:** Pure rendering functions in `src/lib/seo.js` (tested with `node --test`); a small Vite plugin that injects the list into `index.html`, emits one `<slug>.html` per tome and `sitemap.xml`, and a post-build check that fails the build when anything is missing. The Worker needs no routing change (unknown paths already fall through to the static assets).

**Tech Stack:** Vite 6 (existing), Node built-ins only for the plugin and tools, `node --test`; no new dependency. Part B touches `thebloom/site` (vitest, as before).

**Spec:** `docs/superpowers/specs/2026-10-24-crawlable-library-design.md` (919gaming repo). Read it first; this plan adds only what it leaves open.

## Global Constraints

- **No new dependency.** The plugin and tools use Node built-ins. `src/books.js` and `src/lib/*.js` stay importable in plain Node: no JSX, no DOM, no `import.meta.env`.
- **The words are the owner's.** Titles and descriptions come from the data `books.js` already has, by the rules in spec section 2; write no new marketing prose. Alt text is the one new kind of text: one plain sentence saying what the picture shows, written by looking at it.
- **The six addresses, verbatim:** `mustr`, `the-blooming`, `squall-riders`, `fleet-919`, `anchor`, `case-file-1031`. The Keeper's Journal has no page.
- **Limits:** a title is at most 60 characters and unique; a description is 50 to 160 characters (the derived default fits 155).
- **Every piece of text** that reaches generated HTML or JSON-LD goes through `escapeHtml`.
- **Line endings and backslashes:** `index.html` is CRLF in the working tree: change it with the Edit tool only. Any line containing a backslash goes in through Edit or Write, never a shell layer (the JSON-LD `<` escape in Task 3 has one).
- **Commits:** one per task on a branch `crawlable-library` (create it first), ending with the Co-Authored-By line this session was given. **Do not push:** a push to 919gaming's `main` deploys it within 40 seconds. The owner decides (Task 8).

## Review Focus

1. **Special characters:** titles and text with `&`, `<`, `"` and the "A.N.C.H.O.R." title are escaped in HTML attributes, body text and JSON-LD, and the JSON-LD still parses. (Tasks 2 and 3 tests.)
2. **A bare book:** a tome with none of the optional fields (no description, no pictures, no quote, no buy rows, no `seo`) renders a complete, valid page. (Task 3.)
3. **Scripts off and after React mounts:** the library list is in the static HTML and outside `#shelf-root`, so it survives both. (Task 4 check; Task 5 measurement.)
4. **A phone:** the list wraps, there is no sideways scroll, the fixed footer line does not cover the list, and the buttons on a page are at least 40 px tall. (Task 5.)
5. **Adding a tome:** a new `books.js` entry with a `slug` gets a page, a list entry and a sitemap row with no other edit; a tome with a `slug` but no title fails the build with a message. (Tasks 2 and 4.)
6. **Addresses:** `/the-blooming` is served; `/the-blooming/` redirects to it; the canonical link never has a trailing slash. (Task 7 probe.)

---

### Task 1: The data (slugs, share image, alt text)

**Files:**
- Modify: `src/books.js`
- Create: `src/books.test.js`

**Interfaces:**
- Produces: a `slug` on the six tomes (table above; mustr gets `mustr`, A.N.C.H.O.R. gets `anchor`); on The Blooming `seo: { image: 'https://thebloom.919gaming.com/assets/share.jpg', imageAlt: <string> }` and `galleryAlts: string[4]` (parallel to `gallery`); on Squall Riders and Case File 1031 `leftImageAlt: string`.

- [ ] **Step 0 (setup):** `git switch -c crawlable-library`; commit the spec and this plan (`docs/`) as the first commit.
- [ ] **Step 1: Write the failing tests** in `src/books.test.js` (`node:test`, importing `books` from `./books.js`): `every tome except the journal has a slug, and the journal has none`; `the slugs are the six agreed addresses, in shelf order` (`mustr, the-blooming, squall-riders, fleet-919, anchor, case-file-1031`); `slugs are unique and url-safe` (each matches `/^[a-z0-9]+(-[a-z0-9]+)*$/`); `a gallery has one non-empty alt per picture, and a leftImage has an alt`; `The Blooming names its share image` (the exact address above, and a non-empty `imageAlt`).
- [ ] **Step 2: Run** `npm test`. Expected: the five new tests FAIL by name.
- [ ] **Step 3: Edit the data.** Add the slugs and the fields above. Write each alt text by opening the picture with the Read tool (`public/assets/blooming-cover.webp`, `blooming-plate-06.webp`, `-07`, `-13`, `frigate.webp`, `casefile1031.webp`) and saying in one plain sentence what it shows; claim nothing the picture does not show.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: all tests pass; the build succeeds.
- [ ] **Step 5: Commit:** `Give each tome an address and alt text for its pictures`.

### Task 2: Titles, descriptions, canonical, escape, sitemap (pure functions)

**Files:**
- Create: `src/lib/seo.js`, `src/lib/seo.test.js`

**Interfaces:**
- Produces (no imports): `SITE = 'https://919gaming.com'`; `escapeHtml(text: string): string`; `pagesFor(books: Book[]): Book[]`; `titleFor(book): string`; `descriptionFor(book): string`; `canonicalFor(book): string`; `imageFor(book): { url: string, alt: string, large: boolean }`; `renderSitemap(books: Book[]): string`. Rules exactly as spec section 2; `imageFor` returns `seo.image` made absolute (`SITE + '/' + path` when it does not start with `http`) with `large: true`, else `SITE + '/assets/919gaming.png'`, alt `919 Gaming`, `large: false`.

- [ ] **Step 1: Write the failing tests** (fixtures, plus the real `books` for the range checks): `escapeHtml escapes & < > " and '`; `pagesFor keeps tomes with a slug, drops the journal and keeps shelf order`; `titleFor joins title, label and the site name`, `titleFor drops a label equal to the title` (`Fleet 919 | 919 Gaming`), `titleFor lets seo.title win`; `descriptionFor takes whole sentences, flavour first, up to 155 characters` (fixture: three sentences where only the first two fit), `descriptionFor cuts a first sentence that is too long at a word and ends with …`, `descriptionFor lets seo.description win`, `descriptionFor reads a description given as a list of paragraphs`; `canonicalFor has no trailing slash`; `imageFor falls back to the logo, and makes a relative image absolute`; `renderSitemap lists the home page and each page once, escapes &, and has no lastmod`; and, on the real data, `every real page has a title of at most 60 characters, unique`, `every real description is 50 to 160 characters`.
- [ ] **Step 2: Stub, then run.** Write `seo.js` with every export returning `undefined`; run `npm test`. Expected: every new test FAILS by name (none passes on the stub; a test that does is vacuous: rewrite it to assert a value).
- [ ] **Step 3: Implement** the functions. Sentence splitting: whole sentences ending in `.`, `!` or `?` (a closing quote or bracket may follow).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Mutation check** on a scratch copy, as the earlier module did: baseline first; mutants such as the 155 limit changed, the label dropped, `escapeHtml` missing one character, the journal not dropped, the canonical with a slash. Every survivor gets a test or is read as an equivalent mutant.
- [ ] **Step 6: Commit:** `Add the pure functions that make titles, descriptions and the sitemap`.

### Task 3: The list and the page (renderers and JSON-LD)

**Files:**
- Modify: `src/lib/seo.js`, `src/lib/seo.test.js`

**Interfaces:**
- Consumes: Task 2's functions.
- Produces: `renderLibraryList(books: Book[]): string` (the `<nav class="library" aria-label="The library">` with an `h2` "The Library" and one `<li><a href="/slug">Title</a> Label</li>` per page); `renderTomePage(book: Book, ctx: { books: Book[] }): string` (a complete HTML document as in spec section 5).

- [ ] **Step 1: Write the failing tests:** list: `links every page once with a real anchor and never the journal`, `names the nav and has an h2`. Page: `has the title, description and canonical link`; `has Open Graph and Twitter tags, summary for the logo and summary_large_image for a set image`; `the h1 is the title and the body holds the flavour and each description paragraph`; `shows a picture with its alt text and loading=lazy`; `lists a book's buy rows as links`; `links to the project's own address, to /#slug and to the other pages but not itself`; `escapes a title like A&B <i>"x"</i> in every place it appears`; `the JSON-LD parses and holds a BreadcrumbList with two items`; `a book with only a slug, title and label renders a complete page`; `has no executable script` (the only script is `application/ld+json`).
- [ ] **Step 2: Stub, then run.** Expected: every new test FAILS by name.
- [ ] **Step 3: Implement.** Build the JSON-LD with `JSON.stringify` and replace every `<` in it with the six characters `<` (this line has a backslash: Edit/Write only) so the data can never close its script. The page links the stylesheet `/assets/tome-page.css` and the same Google Fonts link as `index.html`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Run a scratch-copy mutation check as in Task 2 (an unescaped title, the self-link, the card type, the lazy attribute).
- [ ] **Step 5: Commit:** `Add the library list and the tome page renderers`.

### Task 4: The build plugin and its check

**Files:**
- Create: `tools/seo-plugin.mjs`, `tools/check-dist.mjs`, `tools/check-dist.test.mjs`, `public/robots.txt` (`User-agent: *`, `Allow: /`, `Disallow: /keepers-secrets`, a blank line, `Sitemap: https://919gaming.com/sitemap.xml`)
- Modify: `vite.config.js`, `package.json` (`"build": "vite build && node tools/check-dist.mjs"`), `index.html` (add `<!-- LIBRARY -->` inside `.stage`, after `.shelf-wrap`, outside `#shelf-root`)

**Interfaces:**
- Consumes: `books`, `pagesFor`, `renderLibraryList`, `renderTomePage`, `renderSitemap`.
- Produces: the default export of `seo-plugin.mjs` (a Vite plugin: `transformIndexHtml` replaces the placeholder; `generateBundle` emits `<slug>.html` and `sitemap.xml` with `emitFile`; `configureServer` answers `/<slug>` and `/sitemap.xml` in dev); `checkDist(distDir: string, books: Book[]): string[]` (one line per problem; empty is clean), also run as a script that prints the problems and exits 1.

- [ ] **Step 1: Write the failing tests** (`tools/check-dist.test.mjs`, building a small `dist/` in a temp folder): `passes a complete dist`; `reports a missing page file`; `reports a page without a canonical link`; `reports a home page with no library list or no link to a page`; `reports a sitemap that misses a page`; `reports a robots.txt with no Sitemap line`; `reports a tome with a slug and no title`.
- [ ] **Step 2: Stub, then run.** Expected: every new test FAILS by name.
- [ ] **Step 3: Implement** `checkDist` and the plugin; add the plugin to `vite.config.js` after `react()`; add the placeholder to `index.html` with the Edit tool; change the build script.
- [ ] **Step 4: Run** `npm test`, then `npm run build`. Expected: tests pass; the build ends clean and `dist/` holds the six pages, `sitemap.xml` and `robots.txt`.
- [ ] **Step 5: Read** `dist/the-blooming.html` and `dist/index.html`: the title, description, canonical, the library list and the page text are in the static HTML. Mutation-check `checkDist` on a scratch copy (a dropped check should be caught).
- [ ] **Step 6: Commit:** `Generate the tome pages, the library list and the sitemap at build time`.

### Task 5: How it looks

**Files:**
- Create: `public/assets/tome-page.css`
- Modify: `index.html` (the `.library` CSS beside `.new-on-shelf`, with the Edit tool)

- [ ] **Step 1: Write the styles.** Library: small gilt Cinzel, centred, links wrap, each link at least 40 px tall to tap, spaced under the shelf, clear of the fixed `.footer-note`. Tome page: the site's dark ground and fonts, one parchment sheet (`parchmentclean.webp` or a flat colour), gilt headings, pictures at the sheet's width, buy buttons and the two links as buttons at least 44 px tall, the other-pages list small.
- [ ] **Step 2: Look at it** (`npm run dev`, show the preview pane): the home list and `/the-blooming` and `/mustr` at 1280 and at 375 px. Measure rather than judge: no sideways scroll (compare `scrollWidth` with the requested width, with a 600 px probe as the positive control), the list's bottom is above the footer line's top, every link or button is at least 40 px tall, and the page's text is in the DOM with no script involved (the `curl` of the built file from Task 4). Send the owner a desktop and a phone screenshot of the list and of The Blooming's page.
- [ ] **Step 3: Stop the dev server and confirm its port is closed.** Run `npm test` and `npm run build`.
- [ ] **Step 4: Commit:** `Style the library list and the tome pages`.

### Task 6: noindex for the keeper area

**Files:**
- Modify: `src/worker.js` (the `fetch` in the default export)

- [ ] **Step 1: In the default export's `fetch`,** keep the response of `withSecurityHeaders(...)` in a variable and, when `new URL(request.url).pathname` starts with `/keepers-secrets`, set `X-Robots-Tag: noindex, nofollow` on it before returning.
- [ ] **Step 2: Run** `npm run build`. Probe the real Worker once, with the stop-and-confirm pattern used before (start `wrangler dev` from PowerShell, curl, stop the process tree, confirm the port closed): `/keepers-secrets/x` carries `x-robots-tag: noindex, nofollow` and a path outside it does not. Expected: both as stated. (The header depends only on the path, so a 404 under `/keepers-secrets` shows it without needing the sign-in secrets.)
- [ ] **Step 3: Commit:** `Noindex the keeper area`.

### Task 7: The whole site, and the hold

- [ ] **Step 1:** `npm test` (all pass) and `npm run build` (the check passes).
- [ ] **Step 2: Probe the real Worker** (`wrangler dev`, then stop it and confirm the port is closed), with `curl --max-redirs 0`: the six pages answer 200 with `text/html` and the canonical in the body; `/the-blooming/` redirects to `/the-blooming` and the canonical has no slash; `/sitemap.xml` is 200 and lists seven addresses; `/robots.txt` is 200 with the `Sitemap:` line; the home HTML contains the library list; `/nothing` is still a 404; the security headers (CSP among them) are on a page.
- [ ] **Step 3: Report.** Show the owner the six titles and descriptions as built (the spec's table), the screenshots, and what has no unit tests (the plugin's wiring, the Worker line, the look: all checked by the build check, the probe and on screen). Offer a test harness for the wiring and say what it would add. **Stop: no push until the owner says so.**

### Task 8: Release (only after the owner's go)

- [ ] **Step 1:** Merge `crawlable-library` into `main` (fast-forward) and `git push origin main`. Watch `npx wrangler deployments list --name 919gaming` for the deploy (about 20 to 40 seconds).
- [ ] **Step 2: Verify live** with `curl`: the six pages (200, canonical, title), `/sitemap.xml`, the home HTML's library list, `/keepers-secrets/x` with `x-robots-tag`, and `/robots.txt` showing **both** Cloudflare's content-signal comments and our rules (if Cloudflare's managed file replaced ours, say so and propose the fix: a rule in the Cloudflare dashboard).
- [ ] **Step 3: Tell the owner the manual steps** that only they can do: verify the domain in Google Search Console (DNS TXT, one property covers every subdomain) and in Bing Webmaster, submit `sitemap.xml`, and inspect `/the-blooming` with URL Inspection.

### Task 9 (Part B, optional, `thebloom` repository): the Book structured data and the Bloom's crawl files

**Files:**
- Modify: `site/public/index.html`, `site/src/gate.mjs` (`PUBLIC_FILES` gains `/sitemap.xml`), `site/test/public.test.mjs`, `site/test/gate.test.mjs`
- Create: `site/public/sitemap.xml`, `site/public/robots.txt`

**Interfaces:**
- Consumes: `BUY_FORMATS` (`site/src/buy.mjs`).

- [ ] **Step 1: Write the failing tests** (run with `env -u __COMPAT_LAYER npx vitest run`): the home page has a meta description equal to the hero tagline and a canonical link `https://thebloom.919gaming.com/`; its `application/ld+json` parses to a `Book` named The Blooming by Jason Churchill whose four `workExample` entries have `offers` with price, `USD`, availability and the Lulu address, each equal to the matching `BUY_FORMATS` entry (`bookFormat` Hardcover, Paperback, EBook, Paperback); `sitemap.xml` lists `/` and `/invitation` as absolute addresses; `robots.txt` allows `/`, disallows `/gm/`, `/downloads`, `/admin` and `/auth/`, and names the sitemap; `accessFor('/sitemap.xml')` is `public`; the sale-wording scan still passes.
- [ ] **Step 2: Run.** Expected: the new tests FAIL by name.
- [ ] **Step 3: Implement** with the Edit tool (`index.html` is CRLF); the JSON-LD is typed into the page and the test keeps it in step with `buy.mjs`.
- [ ] **Step 4: Run** the full suite and `node build.mjs`. Expected: pass; the build's check ends clean.
- [ ] **Step 5: Commit** (`thebloom`): `feat(site): book structured data, a sitemap and robots.txt for the Bloom`. Deploy only on the owner's go: `npm run deploy` in `site/`, then a push with the watch of its deployments, as before.
