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
      e.code = r.status === 401 ? 'not_signed_in' : r.status === 403 ? 'permission_denied' : r.status === 413 ? 'quota_exceeded' : r.status === 429 ? 'rate_limited' : r.status === 501 ? 'not_granted' : 'api_error';
      throw e;
    }
    return r.json();
  };
  let meP = null;
  const me = () => (meP ||= api('GET', 'me').catch(e => { meP = null; throw e; }));

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
  const sample = async (input) => ({ text: (await api('POST', 'ai', { input })).text, truncated: false });
  sample.json = async (input) => parseJson((await api('POST', 'ai', { input })).text);
  sample.limits = async () => ({ images: false });

  window.claude = {
    async use(name) {
      try {
        const m = await me();
        if (name === 'db') return db;
        if (name === 'user') return user;
        if (name === 'downloads') return downloads;
        if (name === 'sample') return m.ai && m.admin ? sample : null;
      } catch { return null; }
      return null;
    }
  };
})();
