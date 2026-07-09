// "Keeper's Secrets" — Discord OAuth login gate for the admin area.
// Discord (OAuth2 Authorization Code flow) verifies identity and gates who
// can log in at all (must hold LOGIN_ROLE_ID in the guild). Admin
// permissions are NOT read from Discord roles: they live entirely in our
// own AUTH_KV, keyed by Discord ID, and are granted/revoked by the God
// account through our own admin UI. Passes every other request through to
// the static site. On successful login, sets a signed cookie scoped to the
// whole 919gaming.com domain so thebloom.919gaming.com can verify it too.
//
// A permanent "God" Discord account always has every admin capability.
// Everyone else's admin access is a single "Trusted" flag God toggles.

const SITE_URL = 'https://919gaming.com/';
const COOKIE_NAME = 'keeper_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days
const STATE_COOKIE_NAME = 'discord_oauth_state';
const STATE_COOKIE_PATH = '/keepers-secrets';
const ADMIN_PATH = '/keepers-secrets/admin';
const CALLBACK_PATH = '/keepers-secrets/callback';
const REDIRECT_URI = 'https://919gaming.com' + CALLBACK_PATH;

const DISCORD_CLIENT_ID = '1524888626629181542';
const DISCORD_GUILD_ID = '1497395378495160493';
const GOD_DISCORD_ID = '161833822307090432'; // permanent super-admin; always trusted
const LOGIN_ROLE_ID = '1497395378931241056'; // required Discord role just to log in at all

function b64urlEncode(buf) {
  let bin = '';
  new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signToken(payloadObj, secret) {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return payload + '.' + b64urlEncode(sig);
}
async function verifyToken(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, b64urlToBuf(sig), new TextEncoder().encode(payload));
  if (!valid) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(b64urlToBuf(payload)));
    if (obj.exp && obj.exp < Math.floor(Date.now() / 1000)) return null;
    return obj;
  } catch (e) {
    return null;
  }
}
function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Resolves the caller's session from the single keeper_auth cookie. God
// status and the Trusted flag are baked into the signed token at login
// time (read from AUTH_KV then, not re-checked against Discord per request).
async function getSession(request, env) {
  const authSecret = await env.AUTH_SECRET.get();
  const session = await verifyToken(getCookie(request, COOKIE_NAME), authSecret);
  if (!session || !session.id) {
    return { loggedIn: false, discordId: null, username: null, isGod: false, trusted: false };
  }
  return {
    loggedIn: true,
    discordId: session.id,
    username: session.username,
    isGod: !!session.isGod,
    trusted: !!session.trusted
  };
}

async function getKeeper(env, discordId) {
  const stored = await env.AUTH_KV.get('discordUser:' + discordId);
  return stored ? JSON.parse(stored) : null;
}

async function listKeepers(env) {
  const { keys } = await env.AUTH_KV.list({ prefix: 'discordUser:' });
  const users = [];
  for (const k of keys) {
    const stored = await env.AUTH_KV.get(k.name);
    if (stored) users.push(JSON.parse(stored));
  }
  users.sort((a, b) => a.username.localeCompare(b.username));
  return users;
}

function page(title, bodyHtml, wide) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;600&family=EB+Garamond:ital,wght@0,400;0,600&display=swap" rel="stylesheet">
<style>
  :root{ --shadow:#0d0906; --parchment:#ecdcb6; --gold:#c9a96a; --gold-bright:#ecd8a4; --ink:#3a2a1a; --wax:#7c1f1f; }
  *{ box-sizing:border-box; }
  body{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    font-family:'EB Garamond',serif; color:var(--parchment);
    background:radial-gradient(ellipse at 50% 22%, #0d1409 0%, #060a04 55%, var(--shadow) 100%); padding:24px; }
  .panel{ width:min(${wide ? '520px' : '360px'},92vw); background:linear-gradient(180deg,#ecdcb6,#d9c49a); color:var(--ink);
    border-radius:8px; padding:34px 30px; box-shadow:0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.2); }
  h1{ font-family:'Cinzel Decorative',serif; font-size:26px; margin:0 0 4px; text-align:center; color:var(--wax); }
  p.sub{ font-family:'Cinzel',serif; font-size:11px; letter-spacing:0.22em; text-transform:uppercase;
    text-align:center; margin:0 0 26px; opacity:0.7; }
  .msg{ font-family:'Cinzel',serif; font-size:12px; text-align:center; margin:0 0 16px; color:var(--wax); }
  .ok{ color:#2f5c2a; }
  .admin-link{ display:block; text-align:center; font-family:'Cinzel',serif; font-size:14px; letter-spacing:0.08em;
    text-transform:uppercase; color:var(--gold-bright); text-decoration:none; padding:14px; border-radius:4px;
    margin-bottom:12px; background:linear-gradient(180deg,#7c1f1f,#5c1414); box-shadow:0 6px 14px rgba(0,0,0,0.35); }
  .admin-link:hover{ filter:brightness(1.1); }
  .nav-row{ display:flex; justify-content:center; gap:18px; margin-top:22px; }
  .nav-link{ font-family:'Cinzel',serif; font-size:11px; letter-spacing:0.1em;
    text-transform:uppercase; color:var(--ink); opacity:0.55; text-decoration:none; }
  .nav-link:hover{ opacity:0.9; }
  .keeper-row{ padding:12px 0; border-bottom:1px dashed rgba(58,42,26,0.2); }
  .keeper-row:last-child{ border-bottom:none; }
  .keeper-top{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .keeper-name{ font-family:'Cinzel',serif; font-weight:600; font-size:15px; }
  .badges{ display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
  .badge{ font-family:'Cinzel',serif; font-size:10px; letter-spacing:0.06em; text-transform:uppercase;
    padding:3px 8px; border-radius:10px; background:rgba(124,31,31,0.12); color:var(--wax); }
  .badge.god{ background:linear-gradient(180deg,#7c1f1f,#5c1414); color:var(--gold-bright); }
  .perms-form{ display:flex; align-items:center; gap:10px; margin-top:8px; }
  .perms-form label{ font-family:'Cinzel',serif; font-size:11px; letter-spacing:0.02em; text-transform:none;
    display:flex; align-items:center; gap:5px; margin:0; }
  .perms-form button{ font-family:'Cinzel',serif; font-size:11px; letter-spacing:0.06em; text-transform:uppercase;
    padding:6px 12px; border:none; border-radius:4px; cursor:pointer; color:var(--gold-bright);
    background:linear-gradient(180deg,#7c1f1f,#5c1414); }
  .perms-form button:hover{ filter:brightness(1.1); }
  .empty{ font-family:'Cinzel',serif; font-size:12px; opacity:0.6; text-align:center; padding:12px 0; }
</style></head><body><div class="panel">${bodyHtml}</div></body></html>`;
}

function errorPage(title, message, backHref, backLabel) {
  return page(title, `
    <h1>${escapeHtml(title)}</h1>
    <p class="msg">${escapeHtml(message)}</p>
    <div class="nav-row"><a class="nav-link" href="${backHref}">${backLabel}</a></div>
  `);
}

function adminNav() {
  return `<div class="nav-row">
    <a class="nav-link" href="${SITE_URL}">Back to Site</a>
    <a class="nav-link" href="${ADMIN_PATH}/logout">Log out</a>
  </div>`;
}

function adminLanding(session) {
  const links = [];
  if (session.isGod || session.trusted) {
    links.push(`<a class="admin-link" href="${ADMIN_PATH}/keepers">View Keepers</a>`);
  }
  const signedInAs = session.isGod ? `${escapeHtml(session.username)} (God)` : escapeHtml(session.username);
  return page("Keeper's Secrets — Admin", `
    <h1>Admin</h1>
    <p class="sub">Signed in as ${signedInAs}</p>
    ${links.join('') || `<p class="empty">No admin capabilities on this account. Ask the God account to mark you Trusted.</p>`}
    ${adminNav()}
  `);
}

function keepersPage(users, session) {
  const rows = users.length
    ? users.map(u => {
        const badges = [];
        if (u.isGod) badges.push(`<span class="badge god">God</span>`);
        else if (u.trusted) badges.push(`<span class="badge">Trusted</span>`);
        else badges.push(`<span class="badge">Member</span>`);
        const permsForm = (session.isGod && !u.isGod) ? `
          <form method="POST" action="${ADMIN_PATH}/permissions" class="perms-form">
            <input type="hidden" name="discordId" value="${escapeHtml(u.discordId)}">
            <label><input type="checkbox" name="trusted" ${u.trusted ? 'checked' : ''}> Trusted</label>
            <button type="submit">Save</button>
          </form>` : '';
        return `<div class="keeper-row">
          <div class="keeper-top">
            <div class="keeper-name">${escapeHtml(u.username)}</div>
            <div class="badges">${badges.join('')}</div>
          </div>
          ${permsForm}
        </div>`;
      }).join('')
    : `<p class="empty">No one has logged in yet.</p>`;

  return page("Keeper's Secrets — Keepers", `
    <h1>Keepers</h1>
    <p class="sub">${users.length} logged in</p>
    ${rows}
    <div class="nav-row">
      <a class="nav-link" href="${ADMIN_PATH}">Back to Admin</a>
      <a class="nav-link" href="${SITE_URL}">Back to Site</a>
    </div>
  `, true);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const html = { 'content-type': 'text/html;charset=UTF-8', 'cache-control': 'no-store, private' };

    if (url.pathname === '/keepers-secrets/status' && request.method === 'GET') {
      const session = await getSession(request, env);
      return new Response(JSON.stringify({ loggedIn: session.loggedIn }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store, private' }
      });
    }

    if (url.pathname === '/keepers-secrets' && request.method === 'GET') {
      const existingSession = await getSession(request, env);
      if (existingSession.loggedIn) {
        return Response.redirect(url.origin + ADMIN_PATH, 302);
      }
      const state = crypto.randomUUID();
      const authorizeUrl = new URL('https://discord.com/api/oauth2/authorize');
      authorizeUrl.searchParams.set('client_id', DISCORD_CLIENT_ID);
      authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('scope', 'identify guilds.members.read');
      authorizeUrl.searchParams.set('state', state);
      const headers = new Headers({ Location: authorizeUrl.toString(), 'Cache-Control': 'no-store, private' });
      headers.append('Set-Cookie', `${STATE_COOKIE_NAME}=${state}; Path=${STATE_COOKIE_PATH}; Max-Age=300; HttpOnly; Secure; SameSite=Lax`);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === CALLBACK_PATH && request.method === 'GET') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const savedState = getCookie(request, STATE_COOKIE_NAME);
      const clearState = `${STATE_COOKIE_NAME}=; Path=${STATE_COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

      if (!code || !state || !savedState || state !== savedState) {
        const headers = new Headers(html);
        headers.append('Set-Cookie', clearState);
        return new Response(errorPage('Login Failed', 'That login link expired or was invalid. Please try again.', '/keepers-secrets', 'Try Again'), { status: 400, headers });
      }

      const clientSecret = await env.DISCORD_CLIENT_SECRET.get();
      const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI
        })
      });
      if (!tokenRes.ok) {
        const headers = new Headers(html);
        headers.append('Set-Cookie', clearState);
        return new Response(errorPage('Login Failed', 'Discord rejected that login attempt.', '/keepers-secrets', 'Try Again'), { status: 401, headers });
      }
      const { access_token } = await tokenRes.json();

      const userRes = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const user = await userRes.json();

      const memberRes = await fetch(`https://discord.com/api/v10/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (!memberRes.ok) {
        const headers = new Headers(html);
        headers.append('Set-Cookie', clearState);
        return new Response(errorPage('Not a Member', 'You must be a member of the Discord server to log in.', SITE_URL, 'Back to Site'), { status: 403, headers });
      }
      const member = await memberRes.json();
      const roles = member.roles || [];

      const isGod = user.id === GOD_DISCORD_ID;
      if (!isGod && !roles.includes(LOGIN_ROLE_ID)) {
        const headers = new Headers(html);
        headers.append('Set-Cookie', clearState);
        return new Response(errorPage('Access Denied', "You don't have the role required to log in here.", SITE_URL, 'Back to Site'), { status: 403, headers });
      }

      // Trust is our own data, not Discord's: preserve whatever the God
      // account has already granted this Discord ID, defaulting to false
      // for a first-time login.
      const existing = await getKeeper(env, user.id);
      const trusted = isGod || (existing ? !!existing.trusted : false);

      await env.AUTH_KV.put('discordUser:' + user.id, JSON.stringify({
        discordId: user.id,
        username: user.username,
        isGod,
        trusted,
        lastLogin: Date.now()
      }));

      const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
      const authSecret = await env.AUTH_SECRET.get();
      const token = await signToken({ id: user.id, username: user.username, isGod, trusted, exp }, authSecret);
      const headers = new Headers({ Location: SITE_URL, 'Cache-Control': 'no-store, private' });
      headers.append('Set-Cookie', `${COOKIE_NAME}=${token}; Domain=919gaming.com; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
      headers.append('Set-Cookie', clearState);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === ADMIN_PATH && request.method === 'GET') {
      const session = await getSession(request, env);
      if (!session.loggedIn) {
        return Response.redirect(url.origin + '/keepers-secrets', 302);
      }
      return new Response(adminLanding(session), { headers: html });
    }

    if (url.pathname === ADMIN_PATH + '/logout') {
      const headers = new Headers({ Location: SITE_URL, 'Cache-Control': 'no-store, private' });
      headers.append('Set-Cookie', `${COOKIE_NAME}=; Domain=919gaming.com; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === ADMIN_PATH + '/keepers' && request.method === 'GET') {
      const session = await getSession(request, env);
      if (!session.isGod && !session.trusted) {
        return Response.redirect(url.origin + ADMIN_PATH, 302);
      }
      const users = await listKeepers(env);
      return new Response(keepersPage(users, session), { headers: html });
    }

    if (url.pathname === ADMIN_PATH + '/permissions' && request.method === 'POST') {
      const session = await getSession(request, env);
      if (!session.isGod) {
        return Response.redirect(url.origin + ADMIN_PATH, 302);
      }
      const form = await request.formData();
      const discordId = (form.get('discordId') || '').toString();
      if (discordId === GOD_DISCORD_ID) {
        return Response.redirect(url.origin + ADMIN_PATH + '/keepers', 302);
      }
      const existing = await getKeeper(env, discordId);
      if (!existing) {
        return Response.redirect(url.origin + ADMIN_PATH + '/keepers', 302);
      }
      existing.trusted = form.has('trusted');
      await env.AUTH_KV.put('discordUser:' + discordId, JSON.stringify(existing));
      return Response.redirect(url.origin + ADMIN_PATH + '/keepers', 302);
    }

    return env.ASSETS.fetch(request);
  }
};
