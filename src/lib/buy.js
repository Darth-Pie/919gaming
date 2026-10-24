// The "buy" rows of a tome: one per format, each linking to that format's short link on the book's own site
// (thebloom.919gaming.com/buy/<name>, which redirects to the Lulu page), so no Lulu address lives in this repository.
// Pure, so it is tested with `node --test` (buy.test.js).
export function buyRows(origin, formats) {
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return formats.map(({ name, label }) => ({ label, url: `${base}/buy/${name}` }));
}
