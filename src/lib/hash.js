// The index of the book a page address's hash names (#the-blooming opens The Blooming), or null for no hash, an unknown slug or
// a hash that cannot be read. Pure, so it is tested with `node --test` (hash.test.js); App.jsx does the opening.
export function bookIndexForHash(books, hash) {
  let slug;
  try {
    slug = decodeURIComponent(hash.startsWith('#') ? hash.slice(1) : hash).toLowerCase();
  } catch {
    return null; // a malformed escape such as %E0%A4%A
  }
  const index = books.findIndex((book) => book.slug && book.slug.toLowerCase() === slug);
  return index === -1 ? null : index;
}
