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
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
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
  const email = await whoAmI(req, env);
  const admin = adminList(env).includes(email);
  const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean).map(decodeURIComponent);
  const method = req.method.toUpperCase();

  if (parts[0] === 'me' && method === 'GET') return json({ email, admin, ai: !!env.ANTHROPIC_API_KEY });

  if (parts[0] === 'ai' && method === 'POST') {
    if (!admin) throw new HttpError(403, 'admin only');
    if (!env.ANTHROPIC_API_KEY) throw new HttpError(501, 'AI not configured');
    const body = await readJson(req, 200_000);
    return json({ text: await askClaude(env, body.input) });
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
  // 로컬 개발 전용: .dev.vars 에 DEV_EMAIL 을 넣었을 때만
  if (env.DEV_EMAIL) return String(env.DEV_EMAIL).toLowerCase();
  throw new HttpError(401, 'Access not configured');
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
async function askClaude(env, input) {
  const messages = typeof input === 'string' ? [{ role: 'user', content: input }]
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
