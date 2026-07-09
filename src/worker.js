// "Keeper's Secrets" login gate. Serves a login form + a password-protected
// admin form for creating users, and passes every other request through to
// the static site. On successful login, sets a signed cookie scoped to the
// whole 919gaming.com domain so thebloom.919gaming.com can verify it too.

const PROTECTED_URL = 'https://thebloom.919gaming.com/keeper.html';
const COOKIE_NAME = 'keeper_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days
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

function page(title, bodyHtml) {
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
  .panel{ width:min(360px,92vw); background:linear-gradient(180deg,#ecdcb6,#d9c49a); color:var(--ink);
    border-radius:8px; padding:34px 30px; box-shadow:0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.2); }
  h1{ font-family:'Cinzel Decorative',serif; font-size:26px; margin:0 0 4px; text-align:center; color:var(--wax); }
  p.sub{ font-family:'Cinzel',serif; font-size:11px; letter-spacing:0.22em; text-transform:uppercase;
    text-align:center; margin:0 0 26px; opacity:0.7; }
  label{ font-family:'Cinzel',serif; font-size:12px; letter-spacing:0.08em; display:block; margin:0 0 6px; }
  input{ width:100%; font-family:'EB Garamond',serif; font-size:16px; padding:10px 12px; margin-bottom:16px;
    border:1px solid rgba(58,42,26,0.35); border-radius:4px; background:rgba(255,255,255,0.5); color:var(--ink); }
  button{ width:100%; font-family:'Cinzel',serif; font-size:14px; letter-spacing:0.1em; text-transform:uppercase;
    padding:12px; border:none; border-radius:4px; cursor:pointer; color:var(--gold-bright);
    background:linear-gradient(180deg,#7c1f1f,#5c1414); box-shadow:0 6px 14px rgba(0,0,0,0.35); }
  button:hover{ filter:brightness(1.1); }
  .msg{ font-family:'Cinzel',serif; font-size:12px; text-align:center; margin:0 0 16px; color:var(--wax); }
  .ok{ color:#2f5c2a; }
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
      <button type="submit">Enter</button>
    </form>`);
}

function adminPage(message, ok) {
  return page("Keeper's Secrets — Admin", `
    <h1>Add a Keeper</h1>
    <p class="sub">Admin only</p>
    ${message ? `<p class="msg${ok ? ' ok' : ''}">${message}</p>` : ''}
    <form method="POST" action="/keepers-secrets/admin">
      <label for="k">Admin Key</label>
      <input id="k" name="adminKey" type="password" required>
      <label for="nu">New Username</label>
      <input id="nu" name="newUsername" required>
      <label for="np">New Password</label>
      <input id="np" name="newPassword" type="password" required minlength="8">
      <button type="submit">Create User</button>
    </form>`);
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
      const token = await signToken({ u: username, exp }, env.AUTH_SECRET);
      const headers = new Headers(html);
      headers.append('Set-Cookie', `${COOKIE_NAME}=${token}; Domain=919gaming.com; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
      headers.set('Location', PROTECTED_URL);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === '/keepers-secrets/admin' && request.method === 'GET') {
      return new Response(adminPage(null), { headers: html });
    }

    if (url.pathname === '/keepers-secrets/admin' && request.method === 'POST') {
      const form = await request.formData();
      const adminKey = (form.get('adminKey') || '').toString();
      const newUsername = (form.get('newUsername') || '').toString().trim().toLowerCase();
      const newPassword = (form.get('newPassword') || '').toString();
      if (!env.ADMIN_PASSWORD || !timingSafeEqual(adminKey, env.ADMIN_PASSWORD)) {
        return new Response(adminPage('Incorrect admin key.', false), { status: 401, headers: html });
      }
      if (!newUsername || newPassword.length < 8) {
        return new Response(adminPage('Username required; password must be at least 8 characters.', false), { status: 400, headers: html });
      }
      const { salt, hash } = await hashPassword(newPassword);
      await env.AUTH_KV.put('user:' + newUsername, JSON.stringify({ salt, hash }));
      return new Response(adminPage(`User "${newUsername}" created.`, true), { headers: html });
    }

    return env.ASSETS.fetch(request);
  }
};
