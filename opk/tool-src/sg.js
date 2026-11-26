
{
const LOGOS = [
  {id:'korea_hor', brand:'OPK KOREA', v:'가로', file:'logos/korea_hor.png', w:439, h:160},
  {id:'system_tagline', brand:'OPK SYSTEM', v:'슬로건', file:'logos/system_tagline.png', w:421, h:160},
  {id:'master', brand:'OPK MASTER', v:'', file:'logos/master_v2.png', w:705, h:192}
];
const BRANDS = ['OPK KOREA','OPK SYSTEM','OPK MASTER'];
// 정리한 로고(세로형·SYSTEM 가로·DE)로 저장된 서명은 가장 가까운 로고로 (그림 파일은 이미 붙여 둔 서명 때문에 서버에 남겨 둠)
const LOGO_OLD = {korea_stack: 'korea_hor', system_hor: 'system_tagline', system_stack: 'system_tagline', de: 'korea_hor'};
const normLogo = id => LOGO_OLD[id] || id;
const LAYOUTS = [
  {id:'bi', name:'국영문 병기형', d:'해외 거래처와 주고받을 때'},
  {id:'basic', name:'기본형', d:'국문 표준 서명'},
  {id:'short', name:'회신용 축약형', d:'같은 스레드 회신·전달'},
  {id:'out', name:'대외용', d:'첫 메일, 회사 소개까지'},
  {id:'biout', name:'국영문 대외용', d:'해외 첫 메일, 영문 소개·링크'}
];
const DEF_CO = {tel:'', fax:'', companyKo:'오피케이코리아', companyEn:'OPK KOREA', addrKo:'경기도 파주시 오도로 33', addrEn:'33, Odo-ro, Paju-si, Gyeonggi-do, Korea', web:'', tagline:'', linkLabel:'회사소개서 바로가기', linkUrl:'', taglineEn:'', linkLabelEn:'Company Profile', layout:'bi', logo:'korea_hor', logoH:44, urls:{}};
const FIELDS_P = ['nameKo','nameEn','titleKo','titleEn','deptKo','deptEn','mobile','email'];
const FIELDS_C = ['tel','fax','companyKo','companyEn','addrKo','addrEn','web','tagline','linkLabel','linkUrl','taglineEn','linkLabelEn'];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = $('#app');
let db = null, dl = null, canWrite = true, local = true;
let sigs = {}, co = {...DEF_CO}, cur = null, dirty = false, saving = false, query = '', brandF = '', mob = false, noimg = false;
const DATA = {};

/* ---------- storage ---------- */
function loadLocal(){ try { const v = JSON.parse(localStorage.getItem('opk-sigs') || '{}'); sigs = v.sigs || {}; co = {...DEF_CO, ...(v.co || {})}; co.logo = normLogo(co.logo); } catch { sigs = {}; } }
function saveLocal(){ try { localStorage.setItem('opk-sigs', JSON.stringify({sigs, co})); return true; } catch { return false; } }
async function putSig(id, data){ if (db) await db.doc('signatures/' + id).set(data); else { sigs[id] = data; if (!saveLocal()) throw new Error('local'); } }
async function delSig(id){ if (db) await db.doc('signatures/' + id).delete(); else { delete sigs[id]; saveLocal(); } }
async function putCo(data){ if (db) await db.doc('settings/company').set(data); else { co = data; saveLocal(); } }
function cleanSig(v){ const o = {}; [...FIELDS_P, ...FIELDS_C].forEach(k => o[k] = String(v?.[k] ?? '').slice(0, 200)); o.layout = LAYOUTS.some(l => l.id === v?.layout) ? v.layout : 'bi'; const lgId = normLogo(v?.logo); o.logo = lgId === '' || LOGOS.some(l => l.id === lgId) ? lgId : 'korea_hor'; o.logoH = Math.max(24, Math.min(72, +v?.logoH || 44)); o.updatedAt = String(v?.updatedAt || ''); return o; }

/* ---------- helpers ---------- */
let tt;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3600); }
function ask(title, text, buttons){
  return new Promise(res => {
    $('#mtitle').textContent = title; $('#mtext').textContent = text;
    const row = $('#mrow'); row.innerHTML = '';
    buttons.forEach(([label, val, cls]) => { const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = label; b.onclick = () => { $('#modal').classList.remove('show'); res(val); }; row.appendChild(b); });
    $('#modal').classList.add('show'); row.lastChild.focus();
  });
}
const LOGO_SVG = '<svg viewBox="0 0 194.7 135.5" aria-hidden="true"><path fill="#ededeb" d="M38.8,32.3c14.9,0,27,12.1,27,27c0,12.9-9,23.6-21.1,26.3V73.3c5.5-2.3,9.3-7.7,9.3-14c0-8.4-6.8-15.2-15.2-15.2c-8.4,0-15.2,6.8-15.2,15.2c0,6.3,3.9,11.7,9.3,14v12.3c-12.1-2.7-21.1-13.4-21.1-26.3C11.9,44.4,24,32.3,38.8,32.3z M98.6,44c8.4,0,15.2,6.8,15.2,15.2c0,8.4-6.8,15.2-15.2,15.2c-8.4,0-15.2-6.8-15.2-15.2C83.4,50.9,90.2,44,98.6,44z M83.4,81.5c4.3,3,9.6,4.7,15.2,4.7c14.9,0,27-12.1,27-27c0-14.9-12.1-27-27-27s-27,12.1-27,27v41.5c0,3.2,2.6,5.9,5.9,5.9c3.2,0,5.9-2.6,5.9-5.9V81.5z M137.3,11.9c3.2,0,5.9,2.6,5.9,5.9v30.1c4.3-9.2,13.6-15.6,24.5-15.6V44c-8.4,0-15.2,6.8-15.2,15.2s6.8,15.2,15.2,15.2v11.7c-10.8,0-20.2-6.4-24.5-15.6v9.7c0,3.2-2.6,5.9-5.9,5.9c-3.2,0-5.9-2.6-5.9-5.9V17.8C131.5,14.5,134.1,11.9,137.3,11.9z"/><path fill="#3FAF39" d="M167.6,44c8.4,0,15.2,6.8,15.2,15.2c0,8.4-6.8,15.2-15.2,15.2V44z"/></svg>';
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho = s => [...s].map(ch => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');
const squash = s => String(s || '').toLowerCase().replace(/\s+/g, '');
function matches(s, q){
  const k = squash(q); if (!k) return true;
  const t = squash([s.nameKo, s.nameEn, s.titleKo, s.titleEn, s.deptKo, s.deptEn, s.email, s.companyKo, s.companyEn, brandOf(s)].join(' '));
  if (t.includes(k)) return true;
  if (/^[ㄱ-ㅎ]+$/.test(k) && cho(t).includes(k)) return true;
  const dq = k.replace(/\D/g, ''); return dq.length >= 3 && /^[\d\-+.()]+$/.test(k) && [s.tel, s.mobile, s.fax].some(p => String(p).replace(/\D/g, '').includes(dq));
}
const brandOf = s => LOGOS.find(l => l.id === s.logo)?.brand || '';
const href = u => { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return /^https:\/\/[^\s"'<>]+$/i.test(u) || /^http:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; };
const shown = u => String(u || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
const list = () => Object.entries(sigs).map(([id, v]) => ({id, ...v})).sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || '', 'ko'));

/* ---------- signature html (email-safe, inline styles) ---------- */
const FONT = "Pretendard,'Noto Sans KR','Noto Sans CJK KR','Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',Arial,sans-serif";
function logoSrc(id, forCopy){ const u = href(co.urls?.[id]); if (u && forCopy) return {src: u, hosted: true}; return {src: DATA[id] || LOGOS.find(l => l.id === id)?.file || '', hosted: !!u}; }
function sigHTML(s, forCopy){
  const L = (html, st = '') => html ? `<div style="margin:0;${st}">${html}</div>` : '';
  const j = (parts, sep) => parts.filter(Boolean).join(sep);
  const sep = ' <span style="color:#c4c4c4">|</span> ';
  const A = (u, text) => { const h = href(u); return h ? `<a href="${esc(h)}" style="color:#3a7d16;text-decoration:none">${esc(text || shown(u))}</a>` : ''; };
  const mail = s.email ? `<a href="mailto:${esc(s.email)}" style="color:#3a7d16;text-decoration:none">${esc(s.email)}</a>` : '';
  const nm = (n, t) => j([n && `<b style="color:#111;font-size:15px">${esc(n)}</b>`, t && `<span style="color:#111">${esc(t)}</span>`], ' ');
  const T = (p, x) => p ? `${x}. ${esc(p)}` : '';
  let rows = [];
  if (s.layout === 'bi') rows = [
    L(j([nm(s.nameKo, s.titleKo), j([s.nameEn, s.titleEn].filter(Boolean).map(esc), ', ')], ' <span style="color:#999">/</span> '), 'margin-bottom:2px'),
    L(j([s.deptKo, s.deptEn].map(esc), ' / ')),
    L(j([s.companyKo, s.companyEn].map(esc), ' / '), 'color:#111;font-weight:600'),
    L(j([T(s.tel, 'T'), T(s.mobile, 'M'), T(s.fax, 'F')], sep)),
    L(mail && 'E. ' + mail),
    L(esc(s.addrEn || s.addrKo)),
    L(A(s.web))];
  else if (s.layout === 'basic') rows = [
    L(j([nm(s.nameKo, s.titleKo), esc(s.deptKo)], sep), 'margin-bottom:2px'),
    L(esc(s.companyKo), 'color:#111;font-weight:600'),
    L(j([T(s.tel, 'T'), T(s.mobile, 'M'), T(s.fax, 'F')], sep)),
    L(mail && 'E. ' + mail),
    L(esc(s.addrKo)),
    L(A(s.web))];
  else if (s.layout === 'short') rows = [
    L(j([nm(s.nameKo, s.titleKo), `<span style="color:#111">${esc(s.companyKo)}</span>`], sep), 'margin-bottom:2px'),
    L(T(s.mobile || s.tel, s.mobile ? 'M' : 'T'))];
  else if (s.layout === 'biout') rows = [
    L(j([nm(s.nameKo, s.titleKo), j([s.nameEn, s.titleEn].filter(Boolean).map(esc), ', ')], ' <span style="color:#999">/</span> '), 'margin-bottom:2px'),
    L(j([s.deptKo, s.deptEn].map(esc), ' / ')),
    L(j([`<span style="color:#111;font-weight:600">${j([s.companyKo, s.companyEn].map(esc), ' / ')}</span>`, s.taglineEn && esc(s.taglineEn)], ' — ')),
    L(j([T(s.tel, 'T'), T(s.mobile, 'M'), mail], sep)),
    L(esc(s.addrEn || s.addrKo)),
    L(j([A(s.web), A(s.linkUrl, s.linkLabelEn || 'Company Profile')], sep))];
  else rows = [
    L(j([nm(s.nameKo, s.titleKo), esc(s.deptKo)], sep), 'margin-bottom:2px'),
    L(j([`<span style="color:#111;font-weight:600">${esc(s.companyKo)}</span>`, s.tagline && esc(s.tagline)], ' — ')),
    L(j([T(s.tel, 'T'), T(s.mobile, 'M'), mail], sep)),
    L(j([A(s.web), A(s.linkUrl, s.linkLabel || '회사소개서 바로가기')], sep))];
  const text = `<td valign="middle" style="font-family:${FONT};font-size:13px;line-height:1.65;color:#555">${rows.join('')}</td>`;
  // 명함 위 구분선: 흰 여백 + 연하고 긴 가로줄 (그라데이션이 안 되는 메일 앱에서는 연한 회색 줄)
  const top = inner => `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FONT}"><tr><td style="padding:10px 0 16px 0"><div style="height:1px;line-height:1px;font-size:0;background-color:#ececec;background-image:linear-gradient(90deg,#d6d6d6 0%,#e8e8e8 55%,rgba(255,255,255,0) 100%)">&nbsp;</div></td></tr><tr><td style="padding:0 0 14px 0">${inner}</td></tr></table>`;
  const lg = LOGOS.find(l => l.id === s.logo);
  if (!lg) return top(`<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FONT}"><tr>${text}</tr></table>`);
  const h = s.layout === 'short' ? Math.round(s.logoH * 0.75) : s.logoH, w = Math.round(lg.w * h / lg.h);
  const hostedU = href(co.urls?.[lg.id]);
  if (forCopy && !hostedU) return top(`<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FONT}"><tr><td valign="middle" width="${w}" style="width:${w}px;height:${h}px;padding:0 18px 0 0;border-right:1px solid #dddddd;font-size:12px;color:#999999">[로고 자리]</td><td style="width:18px;font-size:0;line-height:0">&nbsp;</td>${text}</tr></table>`);
  const img = `<img src="${esc(logoSrc(lg.id, forCopy).src)}" width="${w}" height="${h}" alt="${esc(lg.brand)}" style="display:block;border:0;width:${w}px;height:${h}px">`;
  const im = href(s.web) ? `<a href="${esc(href(s.web))}" style="text-decoration:none">${img}</a>` : img;
  return top(`<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FONT}"><tr><td valign="middle" style="padding:0 18px 0 0;border-right:1px solid #dddddd">${im}</td><td style="width:18px;font-size:0;line-height:0">&nbsp;</td>${text}</tr></table>`);
}
function sigText(s){
  const j = (a, x) => a.filter(Boolean).join(x);
  const P = (p, x) => p ? `${x}. ${p}` : '';
  const nt = (n, t) => j([n, t], ' ');
  if (s.layout === 'bi') return j([j([nt(s.nameKo, s.titleKo), j([s.nameEn, s.titleEn], ', ')], ' / '), j([s.deptKo, s.deptEn], ' / '), j([s.companyKo, s.companyEn], ' / '), j([P(s.tel, 'T'), P(s.mobile, 'M'), P(s.fax, 'F')], ' | '), P(s.email, 'E'), s.addrEn || s.addrKo, href(s.web)], '\n');
  if (s.layout === 'basic') return j([j([nt(s.nameKo, s.titleKo), s.deptKo], ' | '), s.companyKo, j([P(s.tel, 'T'), P(s.mobile, 'M'), P(s.fax, 'F')], ' | '), P(s.email, 'E'), s.addrKo, href(s.web)], '\n');
  if (s.layout === 'biout') return j([j([nt(s.nameKo, s.titleKo), j([s.nameEn, s.titleEn], ', ')], ' / '), j([s.deptKo, s.deptEn], ' / '), j([j([s.companyKo, s.companyEn], ' / '), s.taglineEn], ' — '), j([P(s.tel, 'T'), P(s.mobile, 'M'), s.email], ' | '), s.addrEn || s.addrKo, j([href(s.web), href(s.linkUrl) && `${s.linkLabelEn || 'Company Profile'}: ${href(s.linkUrl)}`], ' | ')], '\n');
  if (s.layout === 'short') return j([j([nt(s.nameKo, s.titleKo), s.companyKo], ' | '), P(s.mobile || s.tel, s.mobile ? 'M' : 'T')], '\n');
  return j([j([nt(s.nameKo, s.titleKo), s.deptKo], ' | '), j([s.companyKo, s.tagline], ' — '), j([P(s.tel, 'T'), P(s.mobile, 'M'), s.email], ' | '), j([href(s.web), href(s.linkUrl) && `${s.linkLabel || '회사소개서'}: ${href(s.linkUrl)}`], ' | ')], '\n');
}

/* ---------- home ---------- */
function renderHome(){
  cur = null; dirty = false;
  const items = list();
  app.innerHTML = `<div class="bar"><div class="brand">${LOGO_SVG}<b>메일 서명</b></div><span class="chip" id="mode"></span>
    <button class="btn" id="coBtn">회사 공통 정보</button></div>
  <main class="home"><h1>메일 서명</h1><p class="sub">이름을 찾아 열고, <b>서명 복사</b>를 눌러 메일 서명 설정에 붙여 넣으면 끝이에요.</p>
  <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="이름·부서·직함·메일·전화번호 검색 (초성도 돼요)" aria-label="서명 검색" autocomplete="off"><span class="cnt" id="qn"></span></label>
  <div class="filters" role="group" aria-label="브랜드로 거르기">${['', ...BRANDS].map(b => `<button class="pill${b === brandF ? ' on' : ''}" data-b="${esc(b)}">${b || '전체'}</button>`).join('')}</div>
  <div class="grid" id="grid">${items.map(c => `<article class="card" tabindex="0" data-id="${esc(c.id)}" aria-label="${esc(c.nameKo || '이름 없음')} 서명 열기">
      <div class="mini"><div>${sigHTML(c)}</div></div>
      <h3>${esc(c.nameKo || '이름 없음')} <span style="color:var(--mute);font-weight:400">${esc(c.titleKo)}</span></h3>
      <div class="meta"><span>${esc([c.deptKo, brandOf(c)].filter(Boolean).join(' · '))}</span>
      ${canWrite ? `<button class="btn ghost" data-dup="${esc(c.id)}" aria-label="${esc(c.nameKo)} 서명 복제">복제</button>` : ''}</div>
    </article>`).join('')}
    ${canWrite ? `<button class="card new" id="newc"><span class="plus">+</span><span>새 서명<br><small>회사 공통 정보가 미리 채워져요</small></span></button>` : ''}
    ${!items.length && !canWrite ? '<p class="empty">아직 만든 서명이 없어요.</p>' : ''}
  </div></main>`;
  $('#mode').textContent = !canWrite ? '보기·복사 전용' : local ? '이 브라우저에만 저장돼요' : '';
  app.querySelectorAll('.card[data-id]').forEach(card => {
    const m = card.querySelector('.mini'), inner = m.firstElementChild;
    const fit = () => { const s = Math.min(0.82, (m.clientWidth - 32) / Math.max(1, inner.scrollWidth), (m.clientHeight - 16) / Math.max(1, inner.scrollHeight)); inner.style.transform = `scale(${s})`; };
    fit(); new ResizeObserver(fit).observe(m);
    card.addEventListener('click', e => { if (e.target.closest('button')) return; location.hash = 's-' + card.dataset.id; });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === card) location.hash = 's-' + card.dataset.id; });
  });
  app.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => duplicate(b.dataset.dup));
  app.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { brandF = b.dataset.b; app.querySelectorAll('.pill').forEach(p => p.classList.toggle('on', p === b)); filter(); });
  $('#coBtn').onclick = () => { location.hash = 'company'; };
  const nb = $('#newc'); if (nb) nb.onclick = () => { location.hash = 's-new'; };
  const q = $('#q'); q.value = query;
  q.addEventListener('input', () => { query = q.value; filter(); });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = query = ''; filter(); } if (e.key === 'Enter') { const f = app.querySelector('.card[data-id]:not([hidden])'); if (f) location.hash = 's-' + f.dataset.id; } });
  filter();
  if (matchMedia('(min-width:900px)').matches) q.focus();
}
function filter(){
  let n = 0;
  app.querySelectorAll('.card[data-id]').forEach(card => { const s = sigs[card.dataset.id]; const ok = s && matches(s, query) && (!brandF || brandOf(s) === brandF); card.hidden = !ok; if (ok) n++; });
  const filtering = !!(query.trim() || brandF);
  const nc = $('#newc'); if (nc) nc.hidden = filtering;
  let em = $('#grid .empty.f');
  if (!n && filtering) { if (!em) { em = document.createElement('p'); em.className = 'empty f'; $('#grid').appendChild(em); } em.textContent = query.trim() ? `"${query.trim()}"에 맞는 서명이 없어요.` : '이 브랜드 로고를 쓰는 서명이 없어요.'; } else em?.remove();
  $('#qn').textContent = filtering ? `${n}명` : `${Object.keys(sigs).length}명`;
}
async function duplicate(id){
  const s = sigs[id]; if (!s) return;
  const nid = 's' + Date.now().toString(36);
  const data = {...s, nameKo: '', nameEn: '', email: '', mobile: '', updatedAt: new Date().toISOString()};
  try { await putSig(nid, data); if (!db) sigs[nid] = data; location.hash = 's-' + nid; toast('부서·회사 정보는 그대로 두고 이름·휴대폰·메일을 비웠어요.'); }
  catch { toast('복제하지 못했어요. 잠시 뒤 다시 해 주세요.'); }
}

/* ---------- editor ---------- */
const field = (k, label, ph, type = 'text') => `<label class="f"><span>${label}</span><input data-k="${k}" type="${type}" value="${esc(cur[k])}" placeholder="${esc(ph)}" ${canWrite ? '' : 'readonly'} autocomplete="off"></label>`;
function setChip(state, text){ const ch = $('#chip'); if (!ch) return; ch.className = 'chip ' + state; ch.lastChild.textContent = text; }
function markDirty(){ if (!canWrite) return; dirty = true; setChip('dirty', '저장 안 됨'); $('#save').disabled = false; }
function renderEditor(id){
  const isNew = id === 'new';
  if (!isNew && !sigs[id]) { location.hash = ''; return; }
  cur = isNew ? cleanSig({...co, layout: co.layout, logo: co.logo, logoH: co.logoH}) : cleanSig(sigs[id]);
  cur.id = isNew ? 's' + Date.now().toString(36) : id; cur.isNew = isNew; dirty = isNew;
  app.innerHTML = `<div class="bar">
    <button class="btn ghost" id="back">← 목록</button>
    <b style="font-size:17px" id="who"></b>
    <span class="chip" id="chip"><i></i><span>${canWrite ? (isNew ? '새 서명' : '저장됨') : '보기·복사 전용'}</span></span>
    <span style="margin-left:auto"></span>
    ${canWrite && !isNew ? '<button class="btn ghost" id="del">삭제</button>' : ''}
    ${canWrite ? `<button class="btn pri" id="save" ${isNew ? '' : 'disabled'}>저장</button>` : ''}
  </div>
  <div class="ed">
    <form class="form" id="form" autocomplete="off">
      <div class="grp"><h4>사람</h4>
        <div class="row2">${field('nameKo', '이름', '홍길동')}${field('titleKo', '직함', '과장')}</div>
        <div class="row2">${field('nameEn', '영문 이름', 'Gildong Hong')}${field('titleEn', '영문 직함', 'Manager')}</div>
        <div class="row2">${field('deptKo', '부서', '영업팀')}${field('deptEn', '영문 부서', 'Sales Team')}</div></div>
      <div class="grp"><h4>연락처</h4>
        <div class="row2">${field('mobile', 'M. 직통 휴대폰', '+82-10-0000-0000', 'tel')}${field('email', '회사 메일', 'hong@company.co.kr', 'email')}</div>
        <p style="margin:0;font-size:12px;color:var(--mute)">T. 회사 전화·팩스는 회사 공통 정보에서 한 번에 관리해요.</p></div>
      <div class="grp"><h4>양식</h4><div class="seg" id="lay">${LAYOUTS.map(l => `<button type="button" data-l="${l.id}" class="${cur.layout === l.id ? 'on' : ''}" ${canWrite ? '' : 'disabled'}><b>${l.name}</b><small>${l.d}</small></button>`).join('')}</div></div>
      <div class="grp"><h4>로고</h4>
        <div class="logos" id="lgs">${LOGOS.map(l => `<button type="button" class="lg${cur.logo === l.id ? ' on' : ''}" data-g="${l.id}" aria-label="${esc(l.brand + ' ' + l.v)}" ${canWrite ? '' : 'disabled'}><img src="${l.file}" alt=""><small>${esc(l.brand)} ${esc(l.v)}</small></button>`).join('')}
          <button type="button" class="lg none${cur.logo === '' ? ' on' : ''}" data-g="" ${canWrite ? '' : 'disabled'}>로고 없이</button></div>
        <div class="inline"><span>크기</span><input type="range" id="lh" min="28" max="72" step="2" value="${cur.logoH}" aria-label="로고 높이" ${canWrite ? '' : 'disabled'}><span id="lhv">${cur.logoH}px</span></div></div>
      <details class="grp"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--mute)">회사 정보 · 회사 전화 (이 서명만 바꾸기)</summary>
        <div class="grp" style="margin-top:10px">
        <div class="row2">${field('tel', 'T. 회사 전화', '+82-31-000-0000', 'tel')}${field('fax', 'F. 팩스', '', 'tel')}</div>
        <div class="row2">${field('companyKo', '회사명', '오피케이코리아')}${field('companyEn', '영문 회사명', 'OPK KOREA')}</div>
        ${field('addrKo', '주소', '')}${field('addrEn', '영문 주소', '')}
        ${field('web', '웹사이트', 'www.company.co.kr', 'url')}
        ${field('tagline', '대외용 한 줄 소개', '슬라이딩 도어·창호 시스템 전문')}
        <div class="row2">${field('linkLabel', '대외용 링크 글자', '회사소개서 바로가기')}${field('linkUrl', '링크 주소', 'https://…', 'url')}</div>
        ${field('taglineEn', '영문 한 줄 소개 (국영문 대외용)', 'Sliding Door & Window System Expert')}
        ${field('linkLabelEn', '영문 링크 글자 (국영문 대외용)', 'Company Profile')}
        ${canWrite ? '<button type="button" class="btn" id="reco">회사 공통 정보로 다시 채우기</button>' : ''}</div></details>
    </form>
    <section class="view" aria-label="받는 사람 화면 미리보기">
      <div class="vbar"><div class="tog" role="group" aria-label="화면 크기"><button type="button" data-m="0" class="${mob ? '' : 'on'}">PC</button><button type="button" data-m="1" class="${mob ? 'on' : ''}">휴대폰</button></div>
        <div class="tog" role="group" aria-label="이미지 표시"><button type="button" data-i="0" class="${noimg ? '' : 'on'}">이미지 켬</button><button type="button" data-i="1" class="${noimg ? 'on' : ''}">이미지 차단</button></div></div>
      <div class="mail${mob ? ' mob' : ''}${noimg ? ' noimg' : ''}" id="mail"><div class="mhead"><b id="from"></b><br>받는 사람: 거래처 담당자<br>제목: 견적 문의 회신드립니다</div>
        <div class="mbody"><p>안녕하세요. 문의 주신 슬라이딩 도어 견적서를 첨부해 드립니다.<br>확인 후 편하실 때 회신 부탁드립니다.</p><p>감사합니다.</p><div class="sigwrap" id="sig"></div></div></div>
      <div class="acts"><button class="btn pri" id="cpy">서명 복사</button><button class="btn" id="cph">HTML 코드 복사</button><button class="btn" id="cpt">글자만 복사</button><button class="btn" id="dlg">로고 PNG 받기</button></div>
      <div class="note" id="hint"></div>
    </section>
  </div>`;
  const form = $('#form');
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', e => { const k = e.target.dataset.k; if (k) { cur[k] = e.target.value; markDirty(); paint(); } });
  $('#lay').onclick = e => { const b = e.target.closest('[data-l]'); if (!b) return; cur.layout = b.dataset.l; $('#lay').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); markDirty(); paint(); };
  $('#lgs').onclick = e => { const b = e.target.closest('[data-g]'); if (!b) return; cur.logo = b.dataset.g; $('#lgs').querySelectorAll('.lg').forEach(x => x.classList.toggle('on', x === b)); markDirty(); paint(); };
  $('#lh').oninput = e => { cur.logoH = +e.target.value; $('#lhv').textContent = cur.logoH + 'px'; markDirty(); paint(); };
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mob = b.dataset.m === '1'; app.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b)); $('#mail').classList.toggle('mob', mob); });
  app.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { noimg = b.dataset.i === '1'; app.querySelectorAll('[data-i]').forEach(x => x.classList.toggle('on', x === b)); $('#mail').classList.toggle('noimg', noimg); });
  const rc = $('#reco'); if (rc) rc.onclick = () => { FIELDS_C.forEach(k => { cur[k] = co[k] || ''; const i = form.querySelector(`[data-k="${k}"]`); if (i) i.value = cur[k]; }); markDirty(); paint(); toast('회사 공통 정보로 채웠어요.'); };
  $('#back').onclick = () => { location.hash = ''; };
  const sb = $('#save'); if (sb) sb.onclick = save;
  const db_ = $('#del'); if (db_) db_.onclick = remove;
  $('#cpy').onclick = copyRich; $('#cph').onclick = () => copyText(sigHTML(cur, true), 'HTML 코드를 복사했어요. 서명 편집기의 HTML(소스) 모드에 붙여 넣으세요.');
  $('#cpt').onclick = () => copyText(sigText(cur), '글자만 복사했어요.');
  $('#dlg').onclick = downloadLogo;
  paint();
  if (isNew && canWrite) form.querySelector('[data-k="nameKo"]').focus();
}
function paint(){
  $('#sig').innerHTML = sigHTML(cur);
  $('#who').textContent = cur.nameKo || (cur.isNew ? '새 서명' : '이름 없음');
  $('#from').textContent = `보낸 사람: ${cur.nameKo || '이름'} <${cur.email || 'name@company'}>`;
  const lg = LOGOS.find(l => l.id === cur.logo), hosted = lg && href(co.urls?.[lg.id]);
  const miss = [!cur.nameKo && '이름', !cur.email && '메일', !(cur.tel || cur.mobile) && '전화'].filter(Boolean);
  const badMail = cur.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cur.email.trim());
  const h = $('#hint');
  h.className = 'note' + (lg && !hosted ? ' warn' : '');
  h.innerHTML = (badMail ? `<b style="color:var(--warn)">메일 주소에 @가 없거나 형식이 달라요 (${esc(cur.email)}).</b><br>` : '') + (miss.length ? `<b>${esc(miss.join('·'))}</b>이(가) 비어 있어요. ` : '')
    + (!lg ? '로고 없이 글자만 나가요. 어떤 메일에서도 똑같이 보여요.'
      : hosted ? '로고는 <b>공개 주소</b>로 들어가요. 받는 쪽 어디서나 보여요.'
      : '<b>로고 넣는 법 (비즈메카)</b><br>1. <b>로고 PNG 받기</b>로 로고 파일을 받아요 (서명 크기 그대로).<br>2. <b>서명 복사</b> → 비즈메카 서명 칸에 붙여 넣어요. 로고 자리에 <b>[로고 자리]</b> 글자가 들어가요.<br>3. 그 글자를 지우고 편집기의 <b>이미지 삽입</b>으로 받은 PNG를 올려요.<br><span style="opacity:.8">메일 서명은 로고를 메일 안에 직접 넣으면 지워져요. 회사 공통 정보에 로고 공개 주소를 넣어 두면 이 과정 없이 바로 붙어요.</span>');
}
async function save(){
  if (!cur || saving || !canWrite) return;
  saving = true; setChip('', '저장 중…');
  const data = cleanSig({...cur, updatedAt: new Date().toISOString()});
  try { await putSig(cur.id, data); if (!db) sigs[cur.id] = data; dirty = false; setChip('', '저장됨'); $('#save').disabled = true;
    if (cur.isNew) { cur.isNew = false; history.replaceState(null, '', '#s-' + cur.id); } }
  catch { setChip('err', '저장 못 함'); toast('저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'); }
  saving = false;
}
async function remove(){
  if (await ask('이 서명을 지울까요?', `${cur.nameKo || '이름 없음'} 서명을 지우면 되돌릴 수 없어요.`, [['취소', false, 'ghost'], ['삭제', true, 'pri']]) !== true) return;
  try { await delSig(cur.id); dirty = false; location.hash = ''; toast('지웠어요.'); } catch { toast('지우지 못했어요.'); }
}

/* ---------- copy ---------- */
async function copyText(t, msg){
  try { await navigator.clipboard.writeText(t); toast(msg); }
  catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); toast(ok ? msg : '복사하지 못했어요. 다시 눌러 주세요.'); }
}
async function copyRich(){
  const html = sigHTML(cur, true), text = sigText(cur);
  const lg = LOGOS.find(l => l.id === cur.logo), ph = lg && !href(co.urls?.[lg.id]);
  const done = () => toast(ph ? '복사했어요. 붙여 넣은 뒤 [로고 자리]를 지우고 이미지 삽입으로 로고 PNG를 올려 주세요.' : '서명을 복사했어요. 메일 서명 설정 칸에 Ctrl+V로 붙여 넣으세요.');
  try {
    if (!window.ClipboardItem) throw 0;
    await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([html], {type: 'text/html'}), 'text/plain': new Blob([text], {type: 'text/plain'})})]);
    done();
  } catch {
    const box = $('#clip'); box.innerHTML = html;
    const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const ok = document.execCommand('copy'); s.removeAllRanges(); box.innerHTML = '';
    ok ? done() : toast('복사하지 못했어요. HTML 코드 복사를 써 주세요.');
  }
}
async function downloadLogo(){
  const lg = LOGOS.find(l => l.id === cur.logo); if (!lg) { toast('로고를 먼저 골라 주세요.'); return; }
  if (!dl) { toast('이 화면에서는 파일 저장을 쓸 수 없어요. claude.ai에서 열어 주세요.'); return; }
  try {
    const h = cur.layout === 'short' ? Math.round(cur.logoH * 0.75) : cur.logoH, w = Math.round(lg.w * h / lg.h);
    const im = new Image(); im.src = DATA[lg.id] || lg.file; await im.decode();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(im, 0, 0, w, h);
    const b = await new Promise(r => cv.toBlob(r, 'image/png'));
    await dl.save({filename: `${lg.brand.replace(/\s+/g, '_')}${lg.v ? '_' + lg.v : ''}_${h}px.png`, data: b}); toast(`로고를 서명 크기(${w}×${h})로 저장했어요.`); }
  catch (e) { toast(e?.code === 'declined' ? '저장을 취소했어요.' : '로고 파일을 저장하지 못했어요.'); }
}

/* ---------- company settings ---------- */
function renderCompany(){
  cur = null; dirty = false;
  const c = {...co, urls: {...(co.urls || {})}};
  const f = (k, label, ph, type = 'text') => `<label class="f"><span>${label}</span><input data-c="${k}" type="${type}" value="${esc(c[k])}" placeholder="${esc(ph)}" ${canWrite ? '' : 'readonly'}></label>`;
  app.innerHTML = `<div class="bar"><button class="btn ghost" id="back">← 목록</button><b style="font-size:17px">회사 공통 정보</b><span style="margin-left:auto"></span>${canWrite ? '<button class="btn" id="apply">모든 서명에 적용</button><button class="btn pri" id="csave">저장</button>' : ''}</div>
  <main class="set"><div><h1>회사 공통 정보</h1><p class="sub" style="margin:8px 0 0">새 서명에 미리 채워지는 값이에요. 모든 서명에 적용하면 사람마다 넣은 이름·연락처는 그대로 두고 회사 정보만 바꿔요.</p></div>
    <div class="grp"><h4>회사</h4><div class="row2">${f('tel', 'T. 회사 전화', '+82-31-000-0000', 'tel')}${f('fax', 'F. 팩스', '', 'tel')}</div><div class="row2">${f('companyKo', '회사명', '오피케이코리아')}${f('companyEn', '영문 회사명', 'OPK KOREA')}</div>
      ${f('addrKo', '주소', '')}${f('addrEn', '영문 주소', '')}${f('web', '웹사이트', 'www.company.co.kr', 'url')}
      ${f('tagline', '대외용 한 줄 소개', '슬라이딩 도어·창호 시스템 전문')}
      <div class="row2">${f('linkLabel', '대외용 링크 글자', '회사소개서 바로가기')}${f('linkUrl', '링크 주소', 'https://…', 'url')}</div>
      <div class="row2">${f('taglineEn', '영문 한 줄 소개 (국영문 대외용)', 'Sliding Door & Window System Expert')}${f('linkLabelEn', '영문 링크 글자 (국영문 대외용)', 'Company Profile')}</div></div>
    <div class="grp"><h4>새 서명 기본값</h4><div class="seg" id="clay">${LAYOUTS.map(l => `<button type="button" data-l="${l.id}" class="${c.layout === l.id ? 'on' : ''}"><b>${l.name}</b><small>${l.d}</small></button>`).join('')}</div>
      <div class="logos" id="clgs">${LOGOS.map(l => `<button type="button" class="lg${c.logo === l.id ? ' on' : ''}" data-g="${l.id}"><img src="${l.file}" alt=""><small>${esc(l.brand)} ${esc(l.v)}</small></button>`).join('')}<button type="button" class="lg none${c.logo === '' ? ' on' : ''}" data-g="">로고 없이</button></div></div>
    <div class="grp"><h4>로고 공개 주소 (선택)</h4>
      <p class="note" style="margin:0">홈페이지 등 누구나 열 수 있는 곳에 로고 PNG를 올리고 그 주소(https://…png)를 넣으면, 복사한 서명이 그 주소를 써서 받는 쪽 어디서나 로고가 보여요. 비워 두면 로고가 메일 안에 직접 들어가요.</p>
      ${LOGOS.map(l => `<div class="urlrow"><div class="lg"><img src="${l.file}" alt="${esc(l.brand + ' ' + l.v)}"></div><label class="f"><span>${esc(l.brand)} ${esc(l.v)}</span><input data-u="${l.id}" type="url" value="${esc(c.urls[l.id] || '')}" placeholder="https://…/${l.id}.png" ${canWrite ? '' : 'readonly'}></label></div>`).join('')}</div>
  </main>`;
  app.querySelectorAll('[data-c]').forEach(i => i.oninput = () => { c[i.dataset.c] = i.value; });
  app.querySelectorAll('[data-u]').forEach(i => i.oninput = () => { c.urls[i.dataset.u] = i.value.trim(); });
  $('#clay').onclick = e => { const b = e.target.closest('[data-l]'); if (!b || !canWrite) return; c.layout = b.dataset.l; $('#clay').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#clgs').onclick = e => { const b = e.target.closest('[data-g]'); if (!b || !canWrite) return; c.logo = b.dataset.g; $('#clgs').querySelectorAll('.lg').forEach(x => x.classList.toggle('on', x === b)); };
  $('#back').onclick = () => { location.hash = ''; };
  const clean = () => { const o = {...DEF_CO}; FIELDS_C.forEach(k => o[k] = String(c[k] || '').slice(0, 200)); o.layout = c.layout; o.logo = c.logo; o.logoH = c.logoH || 44; o.urls = {}; LOGOS.forEach(l => { const u = href(c.urls[l.id]); if (u) o.urls[l.id] = u; }); return o; };
  const cs = $('#csave'); if (cs) cs.onclick = async () => { try { const o = clean(); await putCo(o); co = o; toast('저장했어요.'); } catch { toast('저장하지 못했어요.'); } };
  const ap = $('#apply'); if (ap) ap.onclick = async () => {
    const n = Object.keys(sigs).length; if (!n) { toast('아직 서명이 없어요.'); return; }
    if (await ask('모든 서명에 적용할까요?', `서명 ${n}개의 회사 전화·팩스·회사명·주소·웹사이트·소개 문구를 이 값으로 바꿔요.\n이름·직통 휴대폰·메일·양식·로고는 그대로예요.`, [['취소', false, 'ghost'], ['적용', true, 'pri']]) !== true) return;
    try { const o = clean(); await putCo(o); co = o; for (const [id, s] of Object.entries(sigs)) { const d = {...s}; FIELDS_C.forEach(k => d[k] = o[k]); d.updatedAt = new Date().toISOString(); await putSig(id, cleanSig(d)); if (!db) sigs[id] = cleanSig(d); } toast(`서명 ${n}개에 적용했어요.`); }
    catch { toast('일부를 적용하지 못했어요. 다시 눌러 주세요.'); }
  };
}

/* ---------- routing & boot ---------- */
async function route(){
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^s-([A-Za-z0-9-]+)$/);
  if (cur && dirty && canWrite && (!m || m[1] !== cur.id)) {
    const v = await ask('저장하지 않은 수정이 있어요', '저장하고 나갈까요?', [['취소', 'cancel', 'ghost'], ['저장 안 함', 'drop'], ['저장', 'save', 'pri']]);
    if (v === 'cancel') { history.replaceState(null, '', '#s-' + (cur.isNew ? 'new' : cur.id)); return; }
    if (v === 'save') await save();
    dirty = false;
  }
  if (h === 'company') renderCompany(); else if (m) renderEditor(m[1]); else renderHome();
}
window.addEventListener('hashchange', route);
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 's' && cur) { e.preventDefault(); save(); }
  else if (mod && k === 'k' && !cur) { e.preventDefault(); $('#q')?.focus(); }
  else if (k === '/' && !cur && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); $('#q')?.focus(); }
});
window.addEventListener('beforeunload', e => { if (dirty && canWrite) { e.preventDefault(); e.returnValue = ''; } });
// logo files -> data URLs for copying
Promise.all(LOGOS.map(async l => { try { const b = await (await fetch(l.file)).blob(); DATA[l.id] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch {} }));
loadLocal(); route();
(async () => {
  const [d, u, dw] = await Promise.all(['db', 'user', 'downloads'].map(n => (window.claude?.use ? window.claude.use(n) : Promise.resolve(null)).catch(() => null)));
  dl = dw;
  if (u && u.can) { try { if (await u.can('data.write') === false) canWrite = false; } catch {} }
  if (d) {
    db = d; local = false; sigs = {};
    const timer = setTimeout(() => toast('저장된 서명을 아직 불러오지 못했어요.'), 10000);
    let first = true;
    db.collection('signatures').onSnapshot(snap => {
      clearTimeout(timer); const next = {};
      for (const doc of snap.docs) next[doc.id] = cleanSig(doc.data());
      sigs = next;
      if (!cur && location.hash !== '#company') renderHome();
      else if (cur && first && !dirty && !cur.isNew) renderEditor(cur.id);
      first = false;
    }, () => { clearTimeout(timer); toast('저장소에 연결하지 못했어요. 이 브라우저에만 저장돼요.'); db = null; local = true; loadLocal(); if (!cur) renderHome(); });
    db.doc('settings/company').onSnapshot(doc => { let v = null; try { v = doc?.data?.() || null; } catch {} if (v) { co = {...DEF_CO, ...v, urls: {...(v.urls || {})}}; co.logo = normLogo(co.logo); } if (cur) paint(); }, () => {});
  } else if (!cur) route();
})();
}
