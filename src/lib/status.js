// The body of GET /keepers-secrets/status: whether the visitor holds a live keeper session, and whether it is the
// owner's (the God account). Strict equality throughout, so an odd value in a session never reads as true, and
// isGod is never true for someone who is not logged in. `session` is what getSession() returns; null and
// undefined read as signed out.
export function statusBody(session) {
  const loggedIn = session?.loggedIn === true;
  return { loggedIn, isGod: loggedIn && session.isGod === true };
}
