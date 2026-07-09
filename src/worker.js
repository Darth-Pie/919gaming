// "Keeper's Secrets" login gate. Serves a login form + a password-protected
// admin dashboard for managing Keeper accounts, and passes every other
// request through to the static site. On successful login, sets a signed
// cookie scoped to the whole 919gaming.com domain so thebloom.919gaming.com
// can verify it too.

const PROTECTED_URL = 'https://thebloom.919gaming.com/keeper.html';
const COOKIE_NAME = 'keeper_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days
const ADMIN_COOKIE_NAME = 'keeper_admin';
const ADMIN_COOKIE_MAX_AGE = 60 * 60; // 1 hour
const ADMIN_PATH = '/keepers-secrets/admin';
const PBKDF2_ITERATIONS = 5000; // kept low to stay within the free-plan CPU budget

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBuf(hex) {
  const buf = new Uint8Array(hex.length / 2);
  for (let i = 0; i < buf.length; i++) buf[i] = parseInt(hex.substr(i * 2, 2), 16);
  return buf;
}
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

async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBuf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, keyMaterial, 256);
  return { salt: bufToHex(salt), hash: bufToHex(bits) };
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
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
  label{ font-family:'Cinzel',serif; font-size:12px; letter-spacing:0.08em; display:block; margin:0 0 6px; }
  input{ width:100%; font-family:'EB Garamond',serif; font-size:16px; padding:10px 12px; margin-bottom:16px;
    border:1px solid rgba(58,42,26,0.35); border-radius:4px; background:rgba(255,255,255,0.5); color:var(--ink); }
  button{ font-family:'Cinzel',serif; font-size:14px; letter-spacing:0.1em; text-transform:uppercase;
    padding:12px; border:none; border-radius:4px; cursor:pointer; color:var(--gold-bright);
    background:linear-gradient(180deg,#7c1f1f,#5c1414); box-shadow:0 6px 14px rgba(0,0,0,0.35); }
  button.wide{ width:100%; }
  button:hover{ filter:brightness(1.1); }
  .msg{ font-family:'Cinzel',serif; font-size:12px; text-align:center; margin:0 0 16px; color:var(--wax); }
  .ok{ color:#2f5c2a; }
  h2.section{ font-family:'Cinzel',serif; font-size:13px; letter-spacing:0.14em; text-transform:uppercase;
    color:var(--wax); border-bottom:1px solid rgba(58,42,26,0.25); padding-bottom:8px; margin:26px 0 14px; }
  h2.section:first-child{ margin-top:0; }
  table{ width:100%; border-collapse:collapse; margin-bottom:8px; }
  td{ padding:8px 0; border-bottom:1px dashed rgba(58,42,26,0.2); font-family:'EB Garamond',serif; font-size:15px; }
  td.actions{ text-align:right; }
  td.actions button{ padding:6px 12px; font-size:11px; }
  .empty{ font-family:'Cinzel',serif; font-size:12px; opacity:0.6; text-align:center; padding:12px 0; }
  .logout{ display:block; text-align:center; font-family:'Cinzel',serif; font-size:11px; letter-spacing:0.1em;
    text-transform:uppercase; color:var(--ink); opacity:0.55; margin-top:22px; text-decoration:none; }
  .logout:hover{ opacity:0.9; }
</style></head><body><div class="panel">${bodyHtml}</div></body></html>`;
}

function loginPage(error) {
  return page("Keeper's Secrets", `
    <h1>Keeper's Secrets</h1>
    <p class="sub">Enter to proceed</p>
    ${error ? `<p class="msg">${error}</p>` : ''}
    <form method="POST" action="/keepers-secrets">
      <label for="u">Username</label>
      <input id="u" name="username" autocomplete="username" required>
      <label for="p">Password</label>
      <input id="p" name="password" type="password" autocomplete="current-password" required>
      <button type="submit" class="wide">Enter</button>
    </form>`);
}

function adminKeyPage(error) {
  return page("Keeper's Secrets — Admin", `
    <h1>Admin</h1>
    <p class="sub">Enter the admin key</p>
    ${error ? `<p class="msg">${error}</p>` : ''}
    <form method="POST" action="${ADMIN_PATH}/login">
      <label for="k">Admin Key</label>
      <input id="k" name="adminKey" type="password" required>
      <button type="submit" class="wide">Unlock</button>
    </form>`);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function adminDashboard(usernames, message, ok) {
  const rows = usernames.length
    ? usernames.map(u => `
      <tr>
        <td>${escapeHtml(u)}</td>
        <td class="actions">
          <form method="POST" action="${ADMIN_PATH}/delete" onsubmit="return confirm('Remove Keeper &quot;${escapeHtml(u)}&quot;?');" style="display:inline">
            <input type="hidden" name="username" value="${escapeHtml(u)}">
            <button type="submit">Remove</button>
          </form>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="2" class="empty">No Keepers yet.</td></tr>`;

  return page("Keeper's Secrets — Admin", `
    <h1>Admin</h1>
    <p class="sub">Manage Keepers</p>
    ${message ? `<p class="msg${ok ? ' ok' : ''}">${escapeHtml(message)}</p>` : ''}

    <h2 class="section">Existing Keepers</h2>
    <table>${rows}</table>

    <h2 class="section">Create / Reset a Keeper</h2>
    <form method="POST" action="${ADMIN_PATH}/create">
      <label for="nu">Username</label>
      <input id="nu" name="newUsername" required>
      <label for="np">Password</label>
      <input id="np" name="newPassword" type="password" required minlength="8">
      <button type="submit" class="wide">Save Keeper</button>
    </form>

    <a class="logout" href="${ADMIN_PATH}/logout">Log out of admin</a>
  `, true);
}

async function requireAdmin(request, env) {
  const token = getCookie(request, ADMIN_COOKIE_NAME);
  const authSecret = await env.AUTH_SECRET.get();
  const session = await verifyToken(token, authSecret);
  return !!(session && session.admin);
}

async function listUsernames(env) {
  const { keys } = await env.AUTH_KV.list({ prefix: 'user:' });
  return keys.map(k => k.name.slice('user:'.length)).sort();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const html = { 'content-type': 'text/html;charset=UTF-8' };

    if (url.pathname === '/keepers-secrets' && request.method === 'GET') {
      return new Response(loginPage(null), { headers: html });
    }

    if (url.pathname === '/keepers-secrets' && request.method === 'POST') {
      const form = await request.formData();
      const username = (form.get('username') || '').toString().trim().toLowerCase();
      const password = (form.get('password') || '').toString();
      const stored = await env.AUTH_KV.get('user:' + username);
      let ok = false;
      if (stored) {
        const { salt, hash } = JSON.parse(stored);
        const attempt = await hashPassword(password, salt);
        ok = timingSafeEqual(attempt.hash, hash);
      }
      if (!ok) {
        return new Response(loginPage('Incorrect username or password.'), { status: 401, headers: html });
      }
      const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
      const authSecret = await env.AUTH_SECRET.get();
      const token = await signToken({ u: username, exp }, authSecret);
      const headers = new Headers(html);
      headers.append('Set-Cookie', `${COOKIE_NAME}=${token}; Domain=919gaming.com; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
      headers.set('Location', PROTECTED_URL);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === ADMIN_PATH && request.method === 'GET') {
      if (!(await requireAdmin(request, env))) {
        return new Response(adminKeyPage(null), { headers: html });
      }
      const usernames = await listUsernames(env);
      const msg = url.searchParams.get('msg');
      const ok = url.searchParams.get('ok') === '1';
      return new Response(adminDashboard(usernames, msg, ok), { headers: html });
    }

    if (url.pathname === ADMIN_PATH + '/login' && request.method === 'POST') {
      const form = await request.formData();
      const adminKey = (form.get('adminKey') || '').toString();
      const adminPassword = await env.ADMIN_PASSWORD.get();
      if (!adminPassword || !timingSafeEqual(adminKey, adminPassword)) {
        return new Response(adminKeyPage('Incorrect admin key.'), { status: 401, headers: html });
      }
      const exp = Math.floor(Date.now() / 1000) + ADMIN_COOKIE_MAX_AGE;
      const authSecret = await env.AUTH_SECRET.get();
      const token = await signToken({ admin: true, exp }, authSecret);
      const headers = new Headers(html);
      headers.append('Set-Cookie', `${ADMIN_COOKIE_NAME}=${token}; Path=${ADMIN_PATH}; Max-Age=${ADMIN_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
      headers.set('Location', ADMIN_PATH);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === ADMIN_PATH + '/create' && request.method === 'POST') {
      if (!(await requireAdmin(request, env))) {
        return Response.redirect(url.origin + ADMIN_PATH, 302);
      }
      const form = await request.formData();
      const newUsername = (form.get('newUsername') || '').toString().trim().toLowerCase();
      const newPassword = (form.get('newPassword') || '').toString();
      if (!newUsername || newPassword.length < 8) {
        return Response.redirect(url.origin + ADMIN_PATH + '?ok=0&msg=' + encodeURIComponent('Username required; password must be at least 8 characters.'), 302);
      }
      const { salt, hash } = await hashPassword(newPassword);
      await env.AUTH_KV.put('user:' + newUsername, JSON.stringify({ salt, hash }));
      return Response.redirect(url.origin + ADMIN_PATH + '?ok=1&msg=' + encodeURIComponent(`Keeper "${newUsername}" saved.`), 302);
    }

    if (url.pathname === ADMIN_PATH + '/delete' && request.method === 'POST') {
      if (!(await requireAdmin(request, env))) {
        return Response.redirect(url.origin + ADMIN_PATH, 302);
      }
      const form = await request.formData();
      const username = (form.get('username') || '').toString().trim().toLowerCase();
      await env.AUTH_KV.delete('user:' + username);
      return Response.redirect(url.origin + ADMIN_PATH + '?ok=1&msg=' + encodeURIComponent(`Keeper "${username}" removed.`), 302);
    }

    if (url.pathname === ADMIN_PATH + '/logout') {
      const headers = new Headers({ Location: ADMIN_PATH });
      headers.append('Set-Cookie', `${ADMIN_COOKIE_NAME}=; Path=${ADMIN_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
      return new Response(null, { status: 302, headers });
    }

    return env.ASSETS.fetch(request);
  }
};
