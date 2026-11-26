// claude.ai 의 claude.use(...) 를 이 서버의 /api 로 이어 주는 연결부.
// 계약서·메일 서명 화면 코드는 claude.ai 판과 같은 코드를 그대로 씁니다.
(() => {
  const api = async (method, path, body) => {
    const r = await fetch('/api/' + path, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!r.ok) {
      const e = new Error('api ' + r.status);
      e.status = r.status;
      e.code = r.status === 401 ? 'not_signed_in' : r.status === 403 ? 'permission_denied' : r.status === 413 ? 'quota_exceeded' : r.status === 429 ? 'rate_limited' : r.status === 501 ? 'not_granted' : 'api_error';
      throw e;
    }
    return r.json();
  };
  let meP = null;
  const me = () => (meP ||= api('GET', 'me').catch(e => { meP = null; gate(e); throw e; }));

  /* 로그인 화면 (비밀번호 방식) */
  let gated = false;
  function gate(e) {
    if (gated || !e || (e.status !== 401 && e.status !== 503)) return; gated = true;
    const setup = e.status === 503;
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:var(--bg,#fff);padding:16px';
    wrap.innerHTML = `<form style="width:min(360px,100%);display:flex;flex-direction:column;gap:14px;font:15px/1.55 Pretendard,sans-serif;color:var(--ink,#111)">
      <svg viewBox="0 0 194.7 135.5" style="width:64px;height:44px" aria-hidden="true"><path fill="currentColor" d="M38.8,32.3c14.9,0,27,12.1,27,27c0,12.9-9,23.6-21.1,26.3V73.3c5.5-2.3,9.3-7.7,9.3-14c0-8.4-6.8-15.2-15.2-15.2c-8.4,0-15.2,6.8-15.2,15.2c0,6.3,3.9,11.7,9.3,14v12.3c-12.1-2.7-21.1-13.4-21.1-26.3C11.9,44.4,24,32.3,38.8,32.3z M98.6,44c8.4,0,15.2,6.8,15.2,15.2c0,8.4-6.8,15.2-15.2,15.2c-8.4,0-15.2-6.8-15.2-15.2C83.4,50.9,90.2,44,98.6,44z M83.4,81.5c4.3,3,9.6,4.7,15.2,4.7c14.9,0,27-12.1,27-27c0-14.9-12.1-27-27-27s-27,12.1-27,27v41.5c0,3.2,2.6,5.9,5.9,5.9c3.2,0,5.9-2.6,5.9-5.9V81.5z M137.3,11.9c3.2,0,5.9,2.6,5.9,5.9v30.1c4.3-9.2,13.6-15.6,24.5-15.6V44c-8.4,0-15.2,6.8-15.2,15.2s6.8,15.2,15.2,15.2v11.7c-10.8,0-20.2-6.4-24.5-15.6v9.7c0,3.2-2.6,5.9-5.9,5.9c-3.2,0-5.9-2.6-5.9-5.9V17.8C131.5,14.5,134.1,11.9,137.3,11.9z"/><path fill="#3FAF39" d="M167.6,44c8.4,0,15.2,6.8,15.2,15.2c0,8.4-6.8,15.2-15.2,15.2V44z"/></svg>
      <h1 style="margin:0;font-size:26px;line-height:1.2">OPK 업무 도구</h1>
      ${setup ? '<p style="margin:0;color:var(--mute,#666)">아직 로그인 설정이 안 돼 있어요. 관리자가 Cloudflare Worker 설정에서 LOGIN_PASSWORD 를 넣으면 열려요.</p>'
      : '<p style="margin:0;color:var(--mute,#666)">아이디와 비밀번호를 넣어 주세요.</p><input name="id" required autocomplete="username" aria-label="아이디" placeholder="아이디" style="height:48px;border:1px solid var(--line,#ddd);border-radius:10px;padding:0 14px;font-size:16px;background:var(--panel,#fff);color:inherit"><input name="pw" type="password" required autocomplete="current-password" aria-label="비밀번호" placeholder="비밀번호" style="height:48px;border:1px solid var(--line,#ddd);border-radius:10px;padding:0 14px;font-size:16px;background:var(--panel,#fff);color:inherit"><p class="err" style="margin:0;color:#c4363a;min-height:1.5em" aria-live="polite"></p><button style="height:48px;border:0;border-radius:999px;background:#6eb92b;color:#0d1a05;font-weight:700;font-size:15px;cursor:pointer">들어가기</button>'}
    </form>`;
    document.body.appendChild(wrap);
    const f = wrap.querySelector('form'), idIn = f.querySelector('input[name=id]'), inp = f.querySelector('input[name=pw]');
    if (inp) { idIn.focus(); f.onsubmit = async ev => { ev.preventDefault(); const er = f.querySelector('.err'); er.textContent = '';
      const r = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: idIn.value, password: inp.value }) });
      if (r.ok) location.reload(); else { er.textContent = '아이디 또는 비밀번호가 맞지 않아요.'; inp.select(); } }; }
    else f.onsubmit = ev => ev.preventDefault();
  }
  window.opkLogout = async () => { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); location.reload(); };

  /* db */
  const subs = new Map(); // col -> Set<fn(rows)>
  async function refresh(col) {
    const rows = await api('GET', col);
    (subs.get(col) || []).forEach(fn => { try { fn(rows); } catch (e) { console.error(e); } });
    return rows;
  }
  const snap = rows => ({ docs: rows.map(r => ({ id: r.id, data: () => r.data })) });
  const db = {
    collection(col) {
      return {
        onSnapshot(cb, onErr) {
          if (!subs.has(col)) subs.set(col, new Set());
          const fn = rows => cb(snap(rows));
          subs.get(col).add(fn);
          api('GET', col).then(fn).catch(e => { subs.get(col).delete(fn); onErr && onErr(e); });
          const t = setInterval(() => { if (document.visibilityState === 'visible' && subs.get(col).has(fn)) api('GET', col).then(fn).catch(() => {}); }, 30000);
          return () => { subs.get(col).delete(fn); clearInterval(t); };
        }
      };
    },
    doc(path) {
      const [col, id] = String(path).split('/');
      return {
        async set(data) { await api('PUT', `${col}/${encodeURIComponent(id)}`, data); refresh(col).catch(() => {}); },
        async delete() { await api('DELETE', `${col}/${encodeURIComponent(id)}`); refresh(col).catch(() => {}); },
        async get() { const rows = await api('GET', col); const r = rows.find(x => x.id === id); return { id, exists: !!r, data: () => (r ? r.data : undefined) }; },
        onSnapshot(cb, onErr) {
          return db.collection(col).onSnapshot(s => { const d = s.docs.find(x => x.id === id); cb({ id, exists: !!d, data: () => (d ? d.data() : undefined) }); }, onErr);
        }
      };
    }
  };

  /* user */
  const user = {
    canEdit: async () => (await me()).admin === true,
    isOwner: async () => (await me()).admin === true,
    can: async name => (name === 'data.write' ? (await me()).admin === true : null),
    id: async () => (await me()).email,
    me: async () => { const m = await me(); return { id: m.email, name: m.email }; }
  };

  /* downloads: 일반 웹에서는 바로 파일로 저장 */
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = filename || 'download'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
    }
  };

  /* sample: AI 번역 (서버의 ANTHROPIC_API_KEY 사용) */
  const parseJson = text => {
    const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch {}
    const m = t.match(/[\[{][\s\S]*[\]}]/); if (m) return JSON.parse(m[0]);
    throw Object.assign(new Error('bad json'), { code: 'api_error' });
  };
  const toB64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  const pack = async (input, opts) => ({ input, images: await Promise.all(((opts && opts.images) || []).slice(0, 8).map(async b => ({ media_type: b.type || 'image/jpeg', data: await toB64(b) }))) });
  const sample = async (input, opts) => ({ text: (await api('POST', 'ai', await pack(input, opts))).text, truncated: false });
  sample.json = async (input, opts) => parseJson((await api('POST', 'ai', await pack(input, opts))).text);
  sample.limits = async () => ({ images: true });

  window.claude = {
    async use(name) {
      try {
        const m = await me();
        if (m.auth === 'password') window.OPK_PUBLIC_ORIGIN = location.origin; // 로고 PNG 가 로그인 없이 열리므로 메일 서명에 바로 쓸 수 있음
        if (name === 'db') return db;
        if (name === 'user') return user;
        if (name === 'downloads') return downloads;
        if (name === 'sample') return m.ai && m.admin ? sample : null;
      } catch { return null; }
      return null;
    }
  };
})();
document.addEventListener('DOMContentLoaded', () => {
  const foot = document.querySelector('.nav .foot'); if (!foot) return;
  window.claude.use('user').then(u => { if (!u) return; const b = document.createElement('button'); b.className = 'thc'; b.style.display = 'block'; b.textContent = '로그아웃'; b.setAttribute('aria-label', '로그아웃'); b.onclick = () => window.opkLogout(); foot.prepend(b); });
});
