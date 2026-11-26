/* ---------- 조직도: 이름·직함·부서 자동완성 ---------- */
const DEFAULT_ORG = [
  {nameKo: '이정실', nameEn: 'Lee Jungsil', titleKo: '대표', titleEn: 'CEO', deptKo: '경영', deptEn: 'Management', logo: 'system_tagline'},
  {nameKo: '최승원', nameEn: 'Choi Seungwon', titleKo: 'CFO', titleEn: 'Chief Financial Officer', deptKo: '재무', deptEn: 'Finance'},
  {nameKo: '', nameEn: 'Kim S H', titleKo: 'CTO', titleEn: 'Chief Technology Officer', deptKo: '중문 상품 개발', deptEn: 'Door Product Development'},
  {nameKo: '성준호', nameEn: 'Seong Junho', titleKo: 'COO', titleEn: 'Chief Operating Officer', deptKo: '운영', deptEn: 'Operations'},
  {nameKo: '최미나', nameEn: 'Choi Mina', titleKo: '팀장', titleEn: 'Team Leader', deptKo: '운영팀 (기획·영상)', deptEn: 'Operations Team (Planning & Video)'},
  {nameKo: '이지훈', nameEn: 'Lee Jihun', titleKo: '팀장', titleEn: 'Team Leader', deptKo: '운영팀 (기획·디자인)', deptEn: 'Operations Team (Planning & Design)'},
  {nameKo: '이대곤', nameEn: 'Lee Daegon', titleKo: '팀장', titleEn: 'Team Leader', deptKo: '운영팀', deptEn: 'Operations Team'},
  {nameKo: '최군', nameEn: 'Cui Jun', titleKo: '', titleEn: '', deptKo: 'OPK MASTER', deptEn: 'OPK MASTER', logo: 'master'},
  {nameKo: '최경호', nameEn: 'Cui Qinghu', titleKo: '', titleEn: '', deptKo: '현장 지원·통역', deptEn: 'Field Support & Interpretation'},
  {nameKo: '김다솜', nameEn: 'Kim Dasom', titleKo: '디자이너', titleEn: 'Designer', deptKo: 'UI/UX 디자인', deptEn: 'UI/UX Design'},
  {nameKo: '권회현', nameEn: '', titleKo: '', titleEn: '', deptKo: 'AI 이미지·영상', deptEn: 'AI Image & Video'},
  {nameKo: '수빈', nameEn: '', titleKo: '', titleEn: '', deptKo: '기획', deptEn: 'Planning'}
];
const TITLES = [['대표', 'CEO'], ['대표이사', 'CEO'], ['이사', 'Director'], ['부장', 'General Manager'], ['차장', 'Deputy General Manager'], ['과장', 'Manager'], ['대리', 'Assistant Manager'], ['주임', 'Senior Staff'], ['사원', 'Staff'], ['팀장', 'Team Leader'], ['실장', 'Head'], ['디자이너', 'Designer'], ['매니저', 'Manager'], ['인턴', 'Intern'], ['CFO', 'Chief Financial Officer'], ['COO', 'Chief Operating Officer'], ['CTO', 'Chief Technology Officer']];
const DEPTS = [['경영', 'Management'], ['재무', 'Finance'], ['운영', 'Operations'], ['운영팀', 'Operations Team'], ['영업팀', 'Sales Team'], ['기획', 'Planning'], ['디자인팀', 'Design Team'], ['UI/UX 디자인', 'UI/UX Design'], ['마케팅', 'Marketing'], ['중문 상품 개발', 'Door Product Development'], ['현장 지원·통역', 'Field Support & Interpretation'], ['AI 이미지·영상', 'AI Image & Video'], ['OPK MASTER', 'OPK MASTER']];
const orgList = () => (Array.isArray(co.org) && co.org.length ? co.org : DEFAULT_ORG);
const uniqPairs = (base, extra) => { const m = new Map(); [...base, ...extra].forEach(([k, e]) => { if (k && !m.has(k)) m.set(k, e || ''); }); return [...m]; };
function matchQ(text, q){ const t = squash(text), k = squash(q); if (!k) return true; if (t.includes(k)) return true; return /^[ㄱ-ㅎ]+$/.test(k) && cho(t).includes(k); }
function combo(input, source, onPick){
  const wrap = input.parentElement; wrap.classList.add('combo');
  const box = document.createElement('div'); box.className = 'cb'; box.hidden = true; box.setAttribute('role', 'listbox'); box.id = 'cb-' + input.dataset.k; wrap.appendChild(box);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', box.id);
  let items = [], idx = -1;
  const close = () => { box.hidden = true; idx = -1; input.setAttribute('aria-expanded', 'false'); };
  const render = () => {
    items = source().filter(it => matchQ(it.key, input.value)).slice(0, 12);
    if (!items.length) { close(); return; }
    box.innerHTML = items.map((it, i) => `<div class="cb-i${i === idx ? ' on' : ''}" role="option" aria-selected="${i === idx}" data-i="${i}"><span>${esc(it.main)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>`).join('');
    box.hidden = false; input.setAttribute('aria-expanded', 'true');
    box.querySelector('.on')?.scrollIntoView({block: 'nearest'});
  };
  input.addEventListener('focus', () => { idx = -1; render(); });
  input.addEventListener('input', () => { idx = -1; render(); });
  input.addEventListener('keydown', e => {
    if (box.hidden) { if (e.key === 'ArrowDown') { render(); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); onPick(items[idx]); close(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  box.addEventListener('mousedown', e => { const el = e.target.closest('[data-i]'); if (!el) return; e.preventDefault(); onPick(items[+el.dataset.i]); close(); });
}
function attachCombos(form){
  if (!canWrite) return;
  const put = (k, v) => { if (v === undefined) return; cur[k] = v; const i = form.querySelector(`[data-k="${k}"]`); if (i) i.value = v; };
  const done = () => { markDirty(); paint(); };
  const people = () => orgList().map(p => ({key: [p.nameKo, p.nameEn, p.deptKo, p.titleKo].join(' '), main: p.nameKo || p.nameEn, sub: [p.titleKo, p.deptKo].filter(Boolean).join(' · '), p}));
  const nm = form.querySelector('[data-k="nameKo"]');
  if (nm) combo(nm, people, it => { const p = it.p; ['nameKo', 'nameEn', 'titleKo', 'titleEn', 'deptKo', 'deptEn'].forEach(k => { if (p[k]) put(k, p[k]); });
    const pl = normLogo(p.logo); if (pl && LOGOS.some(l => l.id === pl)) { cur.logo = pl; form.querySelectorAll('#lgs .lg').forEach(x => x.classList.toggle('on', x.dataset.g === pl)); }
    done(); toast(`${p.nameKo || p.nameEn} 정보를 채웠어요. 연락처·메일만 넣으면 돼요.`); });
  const tl = form.querySelector('[data-k="titleKo"]');
  if (tl) combo(tl, () => uniqPairs(TITLES, orgList().map(p => [p.titleKo, p.titleEn])).map(([k, e]) => ({key: k + ' ' + e, main: k, sub: e, k, e})), it => { put('titleKo', it.k); if (it.e) put('titleEn', it.e); done(); });
  const dp = form.querySelector('[data-k="deptKo"]');
  if (dp) combo(dp, () => uniqPairs(DEPTS, orgList().map(p => [p.deptKo, p.deptEn])).map(([k, e]) => ({key: k + ' ' + e, main: k, sub: e, k, e})), it => { put('deptKo', it.k); if (it.e) put('deptEn', it.e); done(); });
}
function orgEditorHTML(rows){
  const F = [['nameKo', '이름'], ['nameEn', '영문 이름'], ['titleKo', '직함'], ['titleEn', '영문 직함'], ['deptKo', '부서'], ['deptEn', '영문 부서']];
  return `<div class="org"><div class="org-h">${F.map(f => `<span>${f[1]}</span>`).join('')}<span></span></div>${rows.map((p, i) => `<div class="org-r">${F.map(([k, l]) => `<input data-o="${i}:${k}" value="${esc(p[k] || '')}" aria-label="${l}" ${canWrite ? '' : 'readonly'}>`).join('')}${canWrite ? `<button type="button" class="btn ghost" data-odel="${i}" aria-label="${esc(p.nameKo || p.nameEn || '이 줄')} 빼기">빼기</button>` : '<span></span>'}</div>`).join('')}</div>${canWrite ? '<button type="button" class="btn" id="oadd">+ 사람 추가</button>' : ''}`;
}
