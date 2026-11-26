// OPK 업무 도구 API — Cloudflare Workers + D1
// /api/* 만 이 Worker 가 처리하고, 나머지는 public/ 의 정적 파일을 그대로 내보냅니다.

const COLS = {
  contracts: { read: 'admin', write: 'admin' },   // 계약서: 관리자만
  signatures: { read: 'user', write: 'admin' },   // 메일 서명: 직원 모두 보기·복사, 수정은 관리자
  settings: { read: 'user', write: 'admin' }      // 회사 공통 정보
};
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DOC = 1_500_000; // bytes

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try { return await handle(req, env, url); }
    catch (e) { return json({ error: e.message || 'error' }, e.status || 500); }
  }
};

async function handle(req, env, url) {
  await ensureDb(env);
  const parts0 = url.pathname.replace(/^\/api\//, '');
  if (parts0 === 'login' && req.method === 'POST') return login(req, env);
  if (parts0 === 'logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
  const email = await whoAmI(req, env);
  const admin = email === ADMIN_ID || adminList(env).includes(email);
  const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean).map(decodeURIComponent);
  const method = req.method.toUpperCase();

  if (parts[0] === 'me' && method === 'GET') return json({ email, admin, ai: !!env.ANTHROPIC_API_KEY, auth: env.ACCESS_AUD ? 'access' : 'password' });

  if (parts[0] === 'ai' && method === 'POST') {
    if (!admin) throw new HttpError(403, 'admin only');
    if (!env.ANTHROPIC_API_KEY) throw new HttpError(501, 'AI not configured');
    const body = await readJson(req, 20_000_000);
    return json({ text: await askClaude(env, body.input, body.images) });
  }

  const col = parts[0], rule = COLS[col];
  if (!rule) throw new HttpError(404, 'not found');
  const can = level => level === 'user' || admin;

  if (parts.length === 1 && method === 'GET') {
    if (!can(rule.read)) throw new HttpError(403, 'forbidden');
    const { results } = await env.DB.prepare('SELECT id, data, updated_at FROM docs WHERE col = ? ORDER BY id').bind(col).all();
    return json(results.map(r => ({ id: r.id, data: JSON.parse(r.data), updatedAt: r.updated_at })));
  }

  const id = parts[1];
  if (parts.length !== 2 || !ID_RE.test(id)) throw new HttpError(404, 'not found');
  if (!can(rule.write)) throw new HttpError(403, 'forbidden');

  if (method === 'PUT') {
    const data = await readJson(req, MAX_DOC);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'object expected');
    await env.DB.prepare(
      'INSERT INTO docs (col, id, data, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5) ' +
      'ON CONFLICT(col, id) DO UPDATE SET data = ?3, updated_at = ?4, updated_by = ?5'
    ).bind(col, id, JSON.stringify(data), new Date().toISOString(), email).run();
    return json({ ok: true });
  }
  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM docs WHERE col = ? AND id = ?').bind(col, id).run();
    return json({ ok: true });
  }
  throw new HttpError(405, 'method not allowed');
}

/* ---------- 처음 실행 시 테이블·예시 데이터 자동 준비 ---------- */
let dbReady = false;
async function ensureDb(env) {
  if (dbReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT, PRIMARY KEY (col, id))').run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM docs').first();
  if (!row || !row.n) {
    try {
      const r = await env.ASSETS.fetch(new Request('https://assets.local/example-seed.json'));
      if (r.ok) {
        const seed = await r.json(), now = new Date().toISOString(), stmts = [];
        for (const [col, docs] of Object.entries(seed)) for (const [id, data] of Object.entries(docs))
          stmts.push(env.DB.prepare('INSERT OR IGNORE INTO docs (col, id, data, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)').bind(col, id, JSON.stringify(data), now, 'example'));
        if (stmts.length) await env.DB.batch(stmts);
      }
    } catch (e) { console.warn('seed', e); }
  }
  dbReady = true;
}

const adminList = env => String(env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function readJson(req, max) {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'too large');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'bad json'); }
}

/* ---------- login: Cloudflare Access ---------- */
async function whoAmI(req, env) {
  const jwt = req.headers.get('cf-access-jwt-assertion');
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    if (!jwt) throw new HttpError(401, 'login required');
    const claims = await verifyAccessJwt(jwt, env);
    if (!claims.email) throw new HttpError(401, 'no email');
    return String(claims.email).toLowerCase();
  }
  // 아이디·비밀번호 로그인 (LOGIN_ID + LOGIN_PASSWORD secret) 또는 ADMIN_PASSWORD / STAFF_PASSWORD
  if (env.LOGIN_PASSWORD || env.ADMIN_PASSWORD || env.STAFF_PASSWORD) {
    const role = await readSession(req, env);
    if (!role) throw new HttpError(401, 'login required');
    return role === 'admin' ? ADMIN_ID : 'staff@opk.local';
  }
  // 로컬 개발 전용: .dev.vars 에 DEV_EMAIL 을 넣었을 때만
  if (env.DEV_EMAIL) return String(env.DEV_EMAIL).toLowerCase();
  throw new HttpError(503, 'setup required');
}

/* ---------- 비밀번호 로그인 ---------- */
const COOKIE = 'opk_s', ADMIN_ID = 'admin@opk.local', DAY = 86400;
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmacKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`opk|${env.SESSION_SECRET || ''}|${env.LOGIN_ID || ''}|${env.LOGIN_PASSWORD || ''}|${env.ADMIN_PASSWORD || ''}|${env.STAFF_PASSWORD || ''}`));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(env, payload) { const body = b64u(enc.encode(JSON.stringify(payload))); const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body))); return `${body}.${sig}`; }
async function readSession(req, env) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)); if (!m) return null;
  const [body, sig] = m[1].split('.'); if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), b64urlBytes(sig), enc.encode(body)); if (!ok) return null;
  const p = JSON.parse(new TextDecoder().decode(b64urlBytes(body)));
  if (!p.exp || p.exp < Date.now() / 1000) return null;
  if (p.role === 'admin' && !env.ADMIN_PASSWORD && !env.LOGIN_PASSWORD) return null;
  if (p.role === 'staff' && !env.STAFF_PASSWORD) return null;
  return p.role;
}
async function same(a, b) { const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest('SHA-256', enc.encode(String(v))))); const u = new Uint8Array(x), w = new Uint8Array(y); let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ w[i]; return d === 0; }
async function login(req, env) {
  if (!env.LOGIN_PASSWORD && !env.ADMIN_PASSWORD && !env.STAFF_PASSWORD) throw new HttpError(503, 'setup required');
  const { id = '', password = '' } = await readJson(req, 2000);
  let role = null;
  if (env.LOGIN_PASSWORD && await same(String(id).trim().toLowerCase(), String(env.LOGIN_ID || '').trim().toLowerCase()) && await same(password, env.LOGIN_PASSWORD)) role = 'admin';
  else if (env.ADMIN_PASSWORD && await same(password, env.ADMIN_PASSWORD)) role = 'admin';
  else if (env.STAFF_PASSWORD && await same(password, env.STAFF_PASSWORD)) role = 'staff';
  if (!role) { await new Promise(r => setTimeout(r, 800)); throw new HttpError(401, 'wrong password'); }
  const token = await sign(env, { role, exp: Math.floor(Date.now() / 1000) + 30 * DAY });
  return json({ ok: true, role }, 200, { 'set-cookie': `${COOKIE}=${token}; Path=/; Max-Age=${30 * DAY}; HttpOnly; Secure; SameSite=Strict` });
}

let certCache = { at: 0, keys: [] };
const b64urlBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const b64urlJson = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function verifyAccessJwt(token, env) {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) throw new HttpError(401, 'bad token');
  const header = b64urlJson(h), claims = b64urlJson(p);
  const team = String(env.ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (Date.now() - certCache.at > 3600_000 || !certCache.keys.some(k => k.kid === header.kid)) {
    const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if (!r.ok) throw new HttpError(502, 'certs unavailable');
    certCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  }
  const jwk = certCache.keys.find(k => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new HttpError(401, 'bad signature');
  const now = Date.now() / 1000;
  if (claims.exp && claims.exp < now) throw new HttpError(401, 'expired');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(env.ACCESS_AUD)) throw new HttpError(401, 'wrong audience');
  if (claims.iss && claims.iss !== `https://${team}`) throw new HttpError(401, 'wrong issuer');
  return claims;
}

/* ---------- AI 번역 ---------- */
async function askClaude(env, input, images) {
  const imgs = (Array.isArray(images) ? images : []).slice(0, 8)
    .filter(i => i && /^image\/(jpeg|png|webp|gif)$/.test(i.media_type) && typeof i.data === 'string')
    .map(i => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } }));
  const messages = typeof input === 'string' ? [{ role: 'user', content: imgs.length ? [...imgs, { type: 'text', text: input }] : input }]
    : Array.isArray(input) ? input.filter(m => m && (m.role === 'user' || m.role === 'assistant')).map(m => ({ role: m.role, content: String(m.content) }))
    : null;
  if (!messages || !messages.length) throw new HttpError(400, 'input required');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens: 8000, messages })
  });
  if (r.status === 429) throw new HttpError(429, 'rate limited');
  if (!r.ok) throw new HttpError(502, 'AI error ' + r.status);
  const out = await r.json();
  return (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}
