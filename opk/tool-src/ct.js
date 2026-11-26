
{
const TPL = JSON.parse(document.getElementById('tpl').textContent);
const LOGO = TPL.logo;
const BASE = [
  {id:'demolition', name:'바닥 철거 공사 계약서', party:'대건 이엔지', pages:[TPL.Main]},
  {id:'tile', name:'타일 공사 계약서', party:'은봉타일', pages:[TPL.Tile, TPL.Tile2]}
];
const W = 794, H = 1123;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = $('#app');
let db = null, canWrite = true, store = {}, cur = null, dirty = false, saving = false, local = false;

/* ---------- data ---------- */
function sanitizePage(html){
  const d = new DOMParser().parseFromString('<body>' + String(html) + '</body>', 'text/html');
  d.querySelectorAll('script,style,iframe,object,embed,link,meta,foreignObject,form,input,button,textarea').forEach(n => n.remove());
  d.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase(), v = a.value;
      if (n.startsWith('on')) el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'src' || n === 'xlink:href') && !/^data:image\//i.test(v) && !v.startsWith('#')) el.removeAttribute(a.name);
      else if (n === 'style' && /url\s*\(|expression/i.test(v)) el.removeAttribute(a.name);
    }
  });
  const pg = d.body.querySelector('.pg');
  return pg ? pg.outerHTML : '';
}
function list(){
  const out = BASE.map(b => store[b.id] ? {...b, ...store[b.id], base:true} : {...b, base:true});
  for (const [id, c] of Object.entries(store)) if (!BASE.some(b => b.id === id)) out.push({...c, id});
  return out;
}
function get(id){ return list().find(c => c.id === id); }
function loadLocal(){ try { store = JSON.parse(localStorage.getItem('opk-contracts') || '{}'); } catch { store = {}; } }
function saveLocal(){ try { localStorage.setItem('opk-contracts', JSON.stringify(store)); return true; } catch { return false; } }
async function persist(id, data){
  if (db) { await db.doc('contracts/' + id).set(data); }
  else { store[id] = data; if (!saveLocal()) throw new Error('local'); }
}

/* ---------- ui helpers ---------- */
let tt;
function toast(msg, html){ const t = $('#toast'); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), html ? 12000 : 3200); }
function ask(title, text, buttons){
  return new Promise(res => {
    $('#mtitle').textContent = title; $('#mtext').textContent = text;
    const row = $('#mrow'); row.innerHTML = '';
    buttons.forEach(([label, val, cls]) => { const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = label; b.onclick = () => { $('#modal').classList.remove('show'); res(val); }; row.appendChild(b); });
    $('#modal').classList.add('show'); row.lastChild.focus();
  });
}
const LOGO_SVG = '<svg viewBox="0 0 194.7 135.5" aria-hidden="true"><path fill="#ededeb" d="M38.8,32.3c14.9,0,27,12.1,27,27c0,12.9-9,23.6-21.1,26.3V73.3c5.5-2.3,9.3-7.7,9.3-14c0-8.4-6.8-15.2-15.2-15.2c-8.4,0-15.2,6.8-15.2,15.2c0,6.3,3.9,11.7,9.3,14v12.3c-12.1-2.7-21.1-13.4-21.1-26.3C11.9,44.4,24,32.3,38.8,32.3z M98.6,44c8.4,0,15.2,6.8,15.2,15.2c0,8.4-6.8,15.2-15.2,15.2c-8.4,0-15.2-6.8-15.2-15.2C83.4,50.9,90.2,44,98.6,44z M83.4,81.5c4.3,3,9.6,4.7,15.2,4.7c14.9,0,27-12.1,27-27c0-14.9-12.1-27-27-27s-27,12.1-27,27v41.5c0,3.2,2.6,5.9,5.9,5.9c3.2,0,5.9-2.6,5.9-5.9V81.5z M137.3,11.9c3.2,0,5.9,2.6,5.9,5.9v30.1c4.3-9.2,13.6-15.6,24.5-15.6V44c-8.4,0-15.2,6.8-15.2,15.2s6.8,15.2,15.2,15.2v11.7c-10.8,0-20.2-6.4-24.5-15.6v9.7c0,3.2-2.6,5.9-5.9,5.9c-3.2,0-5.9-2.6-5.9-5.9V17.8C131.5,14.5,134.1,11.9,137.3,11.9z"/><path fill="#3FAF39" d="M167.6,44c8.4,0,15.2,6.8,15.2,15.2c0,8.4-6.8,15.2-15.2,15.2V44z"/></svg>';
function fmtDate(iso){ if (!iso) return '기본 양식'; const d = new Date(iso); return isNaN(d) ? '' : `${d.getMonth()+1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} 저장`; }

/* ---------- search ---------- */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho = s => [...s].map(ch => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');
const squash = s => String(s || '').toLowerCase().replace(/\s+/g, '');
function matches(text, q){ const t = squash(text), k = squash(q); if (!k) return true; if (t.includes(k)) return true; return /^[ㄱ-ㅎ]+$/.test(k) && cho(t).includes(k); }
let query = '';
const textCache = new Map();
function bodyText(c){ const key = c.id + (c.updatedAt || ''); if (!textCache.has(key)) textCache.set(key, c.pages.map(p => new DOMParser().parseFromString(String(p), 'text/html').body.textContent).join(' ').replace(/\s+/g, ' ').trim()); return textCache.get(key); }
function snippet(text, q){
  const k = q.trim().toLowerCase(); if (!k) return '';
  const i = text.toLowerCase().indexOf(k); if (i < 0) return '';
  const a = Math.max(0, i - 24), b = Math.min(text.length, i + k.length + 40);
  return (a ? '…' : '') + esc(text.slice(a, i)) + '<mark>' + esc(text.slice(i, i + k.length)) + '</mark>' + esc(text.slice(i + k.length, b)) + (b < text.length ? '…' : '');
}
function bindSearch(items){
  const q = $('#q'), qn = $('#qn'); if (!q) return;
  const run = () => {
    query = q.value; let n = 0;
    app.querySelectorAll('.card[data-id]').forEach(card => {
      const c = items.find(x => x.id === card.dataset.id); if (!c) return;
      const head = c.name + ' ' + (c.party || ''), body = bodyText(c);
      const inHead = matches(head, query), ok = inHead || matches(body, query);
      card.hidden = !ok; if (ok) n++;
      const hit = card.querySelector('.hit'); const sn = ok && !inHead ? snippet(body, query) : '';
      hit.innerHTML = sn; hit.hidden = !sn;
    });
    const nc = $('#newc'); if (nc) nc.hidden = !!query.trim();
    let em = $('#grid .empty'); if (!n && query.trim()) { if (!em) { em = document.createElement('p'); em.className = 'empty'; $('#grid').appendChild(em); } em.textContent = `"${query.trim()}"에 맞는 계약서가 없어요.`; } else em?.remove();
    qn.textContent = query.trim() ? `${n}건` : '';
  };
  q.value = query; q.addEventListener('input', run); run();
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = ''; run(); } if (e.key === 'Enter') { const f = app.querySelector('.card[data-id]:not([hidden])'); if (f) location.hash = 'c-' + f.dataset.id; } });
}
/* find inside the open contract */
let findHits = [], findIdx = -1;
const canHL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
function runFind(jump){
  const inp = $('#fq'), cnt = $('#fn'); if (!inp) return;
  const k = inp.value.toLowerCase(); findHits = [];
  if (k) document.querySelectorAll('#desk .paper>.pg').forEach(pg => {
    const w = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const t = n.textContent.toLowerCase(); let i = t.indexOf(k); while (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + k.length); findHits.push(r); i = t.indexOf(k, i + k.length); } }
  });
  if (findIdx >= findHits.length || findIdx < 0) findIdx = findHits.length ? 0 : -1;
  paintFind(); cnt.textContent = k ? (findHits.length ? `${findIdx + 1} / ${findHits.length}` : '없음') : '';
  if (jump && findIdx >= 0) findHits[findIdx].startContainer.parentElement.scrollIntoView({block: 'center', behavior: 'auto'});
}
function paintFind(){ if (!canHL) return; CSS.highlights.delete('find'); CSS.highlights.delete('find-cur'); if (!findHits.length) return; CSS.highlights.set('find', new Highlight(...findHits)); if (findIdx >= 0) CSS.highlights.set('find-cur', new Highlight(findHits[findIdx])); }
function stepFind(d){ if (!findHits.length) return; findIdx = (findIdx + d + findHits.length) % findHits.length; paintFind(); $('#fn').textContent = `${findIdx + 1} / ${findHits.length}`; findHits[findIdx].startContainer.parentElement.scrollIntoView({block: 'center', behavior: 'auto'}); }
function openFind(){ const fb = $('#fb'); if (!fb) return; fb.hidden = false; const inp = $('#fq'); const s = getSelection().toString().trim(); if (s && s.length < 60) inp.value = s; inp.focus(); inp.select(); findIdx = 0; runFind(true); }
function closeFind(){ const fb = $('#fb'); if (!fb || fb.hidden) return false; fb.hidden = true; findHits = []; paintFind(); if (canHL) { CSS.highlights.delete('find'); CSS.highlights.delete('find-cur'); } return true; }
function bindFind(){
  const inp = $('#fq');
  inp.addEventListener('input', () => { findIdx = 0; runFind(true); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); closeFind(); } });
  $('#fprev').onclick = () => stepFind(-1); $('#fnext').onclick = () => stepFind(1); $('#fx').onclick = closeFind;
  $('#desk').addEventListener('input', () => { if (!$('#fb').hidden) runFind(false); });
}

/* ---------- home ---------- */
function renderHome(){
  cur = null; dirty = false;
  const items = list();
  app.innerHTML = `<div class="bar"><div class="brand">${LOGO_SVG}<b>계약서</b></div>
    <span class="chip" id="mode"></span></div>
  <main class="home"><h1>계약서 양식</h1><p class="sub">카드를 열어 칸을 누르면 바로 고칠 수 있어요. 저장한 내용은 이 목록에 남아요.</p>
  <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="계약서 이름·업체·본문 검색 (초성도 돼요)" aria-label="계약서 검색" autocomplete="off"><span class="cnt" id="qn"></span></label>
  <div class="grid" id="grid">${items.map(c => `<article class="card" tabindex="0" data-id="${esc(c.id)}" aria-label="${esc(c.name)} 열기">
      <div class="thumb"><span class="n">${c.pages.length}쪽</span></div>
      <h3>${esc(c.name)}</h3><p class="hit" hidden></p>
      <div class="meta"><span>${esc(c.party || '')} · ${esc(fmtDate(c.updatedAt))}</span>
      <span class="acts">${canWrite ? `<button class="btn ghost" data-dup="${esc(c.id)}" aria-label="${esc(c.name)} 복제">복제</button>` : ''}${canWrite && !c.base ? `<button class="btn ghost" data-del="${esc(c.id)}" aria-label="${esc(c.name)} 삭제">삭제</button>` : ''}</span></div>
    </article>`).join('')}
    ${canWrite ? `<button class="card new" id="newc"><span class="plus">+</span><span>새 계약서<br><small>양식을 골라 사본을 만들어요</small></span></button>` : ''}
  </div></main>`;
  setMode();
  document.querySelectorAll('.card[data-id]').forEach(card => {
    const c = get(card.dataset.id), th = card.querySelector('.thumb');
    th.insertAdjacentHTML('afterbegin', sanitizePage(c.pages[0]));
    const fit = () => { const pg = th.querySelector('.pg'); if (pg) pg.style.transform = `scale(${th.clientWidth / W})`; };
    fit(); new ResizeObserver(fit).observe(th);
    card.addEventListener('click', e => { if (e.target.closest('button')) return; location.hash = 'c-' + c.id; });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === card) location.hash = 'c-' + c.id; });
  });
  app.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => duplicate(b.dataset.dup));
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => remove(b.dataset.del));
  const nb = $('#newc'); if (nb) nb.onclick = pickTemplate;
  bindSearch(items);
}
function setMode(){ const m = $('#mode'); if (!m) return; m.textContent = !canWrite ? '보기 전용' : local ? '이 브라우저에만 저장돼요' : ''; }
async function pickTemplate(){
  const v = await ask('어떤 양식으로 만들까요?', '빈 계약서는 제목·당사자·서명란만 있는 새 양식이에요. 조항은 편집 화면에서 더해요.', [['취소', null, 'ghost'], ['빈 계약서', '__blank'], ...list().filter(c => c.base).map(c => [c.name + ' 사본', c.id])]);
  if (v === '__blank') createBlank(); else if (v) duplicate(v);
}
function blankPage(){
  const d = new DOMParser().parseFromString('<body>' + TPL.Main + '</body>', 'text/html'); const pg = d.body.querySelector('.pg');
  const h1 = pg.querySelector('header h1'); if (h1) h1.textContent = '계약서';
  const hp = pg.querySelectorAll('header p'); const dl = hp[hp.length - 1]; if (dl) { const sp = dl.querySelector('span'); if (sp) sp.textContent = '20\u00a0\u00a0\u00a0.\u00a0\u00a0\u00a0\u00a0.\u00a0\u00a0\u00a0\u00a0.'; }
  const secs = [...pg.querySelectorAll('section.art')];
  const intro = [...pg.children].find(c => c.tagName === 'P'); if (intro) intro.textContent = '○○○(이하 “발주자”라 한다)와 ○○○(이하 “시공사”라 한다)는 아래와 같이 계약을 체결한다.';
  secs.forEach((s, i) => { if (i === 0) { s.querySelectorAll('td').forEach(td => { td.textContent = ''; }); } else if (i === 1) { const sp = s.querySelectorAll('h2 span'); if (sp[1]) sp[1].textContent = '공사내용'; const body = d.createElement('div'); body.innerHTML = '<p class="li">1. 내용을 입력하세요.</p>'; s.children[1].replaceWith(body); } else s.remove(); });
  const sig = [...pg.children].find(c => c.tagName === 'DIV' && c.querySelectorAll('table').length >= 2);
  if (sig) { const dp = sig.querySelector(':scope > p'); if (dp) dp.textContent = '20\u00a0\u00a0\u00a0\u00a0\u00a0년\u00a0\u00a0\u00a0\u00a0\u00a0월\u00a0\u00a0\u00a0\u00a0\u00a0일'; sig.querySelectorAll('td').forEach(td => { if (!/\(인\)/.test(td.textContent)) td.textContent = ''; else td.querySelectorAll('span').forEach(sp => { if (!/\(인\)/.test(sp.textContent)) sp.textContent = ''; }); }); }
  return pg.outerHTML;
}
async function createBlank(){
  const nid = 'c' + Date.now().toString(36);
  const data = {name: '새 계약서', party: '', pages: [sanitizePage(blankPage())], updatedAt: new Date().toISOString()};
  try { await persist(nid, data); if (!db) store[nid] = data; location.hash = 'c-' + nid; }
  catch (e) { toast('새 계약서를 만들지 못했어요. 잠시 뒤 다시 해 주세요.'); }
}
async function duplicate(id){
  const src = get(id); if (!src) return;
  const nid = 'c' + Date.now().toString(36);
  const data = {name: src.name + ' 사본', party: src.party || '', pages: src.pages.map(sanitizePage), updatedAt: new Date().toISOString()};
  try { await persist(nid, data); if (!db) store[nid] = data; location.hash = 'c-' + nid; }
  catch (e) { toast(e?.code === 'quota_exceeded' ? '저장 공간이 가득 찼어요. 쓰지 않는 사본을 지워 주세요.' : '사본을 만들지 못했어요. 잠시 뒤 다시 해 주세요.'); }
}
async function remove(id){
  const c = get(id);
  if (await ask('이 사본을 지울까요?', `"${c.name}"을(를) 지우면 되돌릴 수 없어요.`, [['취소', false, 'ghost'], ['삭제', true, 'pri']]) !== true) return;
  try { if (db) await db.doc('contracts/' + id).delete(); else { delete store[id]; saveLocal(); renderHome(); } }
  catch { toast('지우지 못했어요. 잠시 뒤 다시 해 주세요.'); }
}

/* ---------- editor ---------- */
const BLOCK = 'P,DIV,TABLE,H1,H2,UL,OL,SECTION,HEADER,TR,TBODY,THEAD';
function markEditable(root){
  root.querySelectorAll('*').forEach(el => {
    if (el.closest('svg') || el.closest('[data-ed]')) return;
    if (['TABLE','TBODY','THEAD','TR','SECTION','HEADER','COLGROUP','COL','BR','IMG'].includes(el.tagName)) return;
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const hasBlock = el.querySelector(BLOCK);
    const emptyCell = (el.tagName === 'TD' || el.tagName === 'TH') && !el.textContent.trim() && !el.querySelector(BLOCK);
    if ((direct || emptyCell) && !hasBlock) { el.setAttribute('contenteditable', 'true'); el.setAttribute('data-ed', ''); el.spellcheck = false; }
  });
}
function cleanHTML(pg){
  const c = pg.cloneNode(true);
  c.querySelectorAll('[data-ed]').forEach(el => { el.removeAttribute('contenteditable'); el.removeAttribute('data-ed'); el.removeAttribute('spellcheck'); });
  c.querySelectorAll('.cell-on').forEach(el => el.classList.remove('cell-on'));
  c.style.transform = '';
  return sanitizePage(c.outerHTML);
}
function setChip(state, text){ const ch = $('#chip'); if (!ch) return; ch.className = 'chip ' + state; ch.lastChild.textContent = text; }
const pagesEls = () => [...document.querySelectorAll('#desk .paper>.pg')];
function currentPages(){ return pagesEls().map(cleanHTML); }

/* history: whole-document snapshots */
let hist = [], hi = -1, pend = null, tblCell = null;
function snapState(){ return JSON.stringify(currentPages()); }
function pushHist(){ const s = snapState(); if (hist[hi] === s) return; hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 120) hist.shift(); hi = hist.length - 1; updUndo(); }
function flushPend(){ if (pend) { clearTimeout(pend); pend = null; pushHist(); } }
function updUndo(){ const u = $('#undo'), r = $('#redo'); if (u) u.disabled = hi <= 0; if (r) r.disabled = hi >= hist.length - 1; }
function restore(i){
  hi = i; mountPages(JSON.parse(hist[i])); markDirty(); updUndo(); refreshThumbs();
}
function undo(){ flushPend(); if (hi > 0) restore(hi - 1); }
function redo(){ flushPend(); if (hi < hist.length - 1) restore(hi + 1); }
function markDirty(){ if (!dirty) { dirty = true; setChip('dirty', '저장 안 됨'); const s = $('#save'); if (s) s.disabled = false; } }

let fitPages = () => {}, thumbTimer;
function refreshThumbs(){
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    const ps = currentPages();
    document.querySelectorAll('#side .tp').forEach((t, i) => { const box = t.querySelector('.tbox'); box.innerHTML = ps[i] || ''; const pg = box.firstElementChild; if (pg) pg.style.transform = `scale(${box.clientWidth / W})`; });
  }, 250);
}

/* table tools */
function grid(t){
  const g = [];
  [...t.rows].forEach((r, ri) => { let ci = 0; g[ri] = g[ri] || []; [...r.cells].forEach(c => { while (g[ri][ci]) ci++; for (let a = 0; a < c.rowSpan; a++) for (let b = 0; b < c.colSpan; b++) { (g[ri + a] = g[ri + a] || [])[ci + b] = c; } ci += c.colSpan; }); });
  return g;
}
function pos(g, cell){ for (let r = 0; r < g.length; r++) for (let c = 0; c < (g[r] || []).length; c++) if (g[r][c] === cell) return [r, c]; return [0, 0]; }
function blankLike(c, tag){ const n = document.createElement(tag || c.tagName.toLowerCase()); const st = (c.getAttribute('style') || '').replace(/border-top:[^;]*;?/g, '').replace(/width:[^;]*;?/g, ''); if (st) n.setAttribute('style', st); [...c.classList].filter(k => k !== 'cell-on').forEach(k => n.classList.add(k)); n.setAttribute('contenteditable', 'true'); n.setAttribute('data-ed', ''); n.spellcheck = false; return n; }
function addRow(after){
  const t = tblCell.closest('table'), g = grid(t); const [r0] = pos(g, tblCell);
  const r = after ? r0 + tblCell.rowSpan - 1 : r0; const ref = t.rows[r];
  const tr = document.createElement('tr'); const seen = new Set();
  (g[r] || []).forEach((c, ci) => {
    if (seen.has(c)) return; seen.add(c);
    const [cr] = pos(g, c); const start = cr, end = cr + c.rowSpan - 1;
    const spans = after ? end > r : start < r;
    if (spans) c.rowSpan += 1; else { const n = blankLike(c); if (c.colSpan > 1) n.colSpan = c.colSpan; tr.appendChild(n); }
  });
  ref.parentNode.insertBefore(tr, after ? ref.nextSibling : ref);
}
function delRow(){
  const t = tblCell.closest('table'), g = grid(t); const [r] = pos(g, tblCell);
  if (t.rows.length <= 1) { toast('표에 행이 하나뿐이에요.'); return false; }
  const row = t.rows[r], seen = new Set();
  (g[r] || []).forEach((c, ci) => {
    if (seen.has(c)) return; seen.add(c);
    const [cr] = pos(g, c);
    if (c.rowSpan > 1) {
      if (cr === r) { const next = t.rows[r + 1]; let ins = null; for (const x of next.cells) { if (pos(g, x)[1] > ci) { ins = x; break; } } c.rowSpan -= 1; next.insertBefore(c, ins); }
      else c.rowSpan -= 1;
    }
  });
  row.remove(); return true;
}
function addCol(after){
  const t = tblCell.closest('table'), g = grid(t); const [, c0] = pos(g, tblCell);
  const col = after ? c0 + tblCell.colSpan - 1 : c0; const seen = new Set();
  g.forEach((row, ri) => {
    const c = row[col]; if (!c || seen.has(c)) return; seen.add(c);
    const [cr, cc] = pos(g, c); if (cr !== ri) return;
    const spans = after ? cc + c.colSpan - 1 > col : cc < col;
    if (spans) { c.colSpan += 1; return; }
    const n = blankLike(c, ri === 0 && c.tagName === 'TH' ? 'th' : null); if (c.rowSpan > 1) n.rowSpan = c.rowSpan;
    if (ri === 0) { const cells = [...c.parentNode.cells]; const widest = cells.reduce((a, x) => x.offsetWidth > a.offsetWidth ? x : a, cells[0]); const tw = c.closest('table').offsetWidth; const w = Math.min(Math.round(tw * 0.14), Math.round(widest.offsetWidth / 2)); cells.forEach(x => { x.style.width = x.offsetWidth + 'px'; }); widest.style.width = (widest.offsetWidth - w) + 'px'; n.style.width = w + 'px'; }
    c.parentNode.insertBefore(n, after ? c.nextSibling : c);
  });
}
function delCol(){
  const t = tblCell.closest('table'), g = grid(t); const [, c0] = pos(g, tblCell);
  if ((g[0] || []).length <= 1) { toast('표에 열이 하나뿐이에요.'); return false; }
  const seen = new Set();
  g.forEach(row => { const c = row[c0]; if (!c || seen.has(c)) return; seen.add(c); if (c.colSpan > 1) c.colSpan -= 1; else { if (c.parentNode === t.rows[0]) { const nb = c.nextElementSibling || c.previousElementSibling; if (nb && c.style.width && nb.style.width) nb.style.width = (parseFloat(nb.style.width) + parseFloat(c.style.width)) + 'px'; } c.remove(); } });
  return true;
}
function paint(color, scope){
  const t = tblCell.closest('table'), g = grid(t); const [r, c] = pos(g, tblCell);
  const cells = new Set(scope === 'row' ? g[r] : scope === 'col' ? g.map(x => x[c]) : [tblCell]);
  cells.forEach(x => { if (x) x.style.background = color; });
}
function hideTT(){ const tt = $('#tt'); if (tt) tt.hidden = true; document.querySelectorAll('.cell-on').forEach(x => x.classList.remove('cell-on')); tblCell = null; }
function showTT(cell){
  tblCell = cell; document.querySelectorAll('.cell-on').forEach(x => x.classList.remove('cell-on')); cell.classList.add('cell-on');
  const tt = $('#tt'); tt.hidden = false;
  const t = cell.closest('table').getBoundingClientRect();
  const top = Math.max(70, t.top - tt.offsetHeight - 8);
  tt.style.top = top + 'px'; tt.style.left = Math.max(8, Math.min(t.left, innerWidth - tt.offsetWidth - 8)) + 'px';
}
function tableOp(fn){
  if (!tblCell) return; flushPend();
  const keep = tblCell; const ok = fn(); if (ok === false) return;
  pushHist(); markDirty(); refreshThumbs();
  if (keep.isConnected) showTT(keep); else hideTT();
}


/* list lines: Enter adds the next number or bullet */
const NUM = /^(\s*)(\d+)\.(\s)/, BUL = /^(\s*)([•·\-])(\s)/;
function firstText(el){ const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.length) return n; return null; }
function renum(parent){
  let n = null;
  for (const p of parent.children) {
    if (p.tagName !== 'P') { n = null; continue; }
    const t = firstText(p), m = t && t.textContent.match(NUM);
    if (!m) { n = null; continue; }
    if (n === null) n = +m[2]; else { n++; t.textContent = t.textContent.replace(NUM, `$1${n}.$3`); }
  }
}
function caretTo(el, atEnd){ const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.focus(); }
function atStart(el){ const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return false; const r = document.createRange(); r.selectNodeContents(el); r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset); return !r.toString().trim() || /^\s*((\d+)\.|[•·\-])\s*$/.test(r.toString()); }
function splitPara(p){
  flushPend();
  const s = getSelection(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0); r.deleteContents();
  const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(p, p.childNodes.length);
  const frag = tail.extractContents();
  const t = firstText(p), txt = t ? t.textContent : '';
  const m = txt.match(NUM), b = txt.match(BUL);
  const np = p.cloneNode(false);
  const prefix = m ? `${m[1]}${+m[2] + 1}.\u00a0` : b ? `${b[1]}${b[2]}\u00a0` : '';
  np.appendChild(document.createTextNode(prefix)); np.appendChild(frag);
  if (!p.textContent.length) p.appendChild(document.createElement('br'));
  p.after(np);
  if (m) renum(p.parentNode);
  const tn = np.firstChild; const rr = document.createRange(); rr.setStart(tn, prefix.length); rr.collapse(true); s.removeAllRanges(); s.addRange(rr); np.focus();
  pushHist(); markDirty(); refreshThumbs();
}
function joinPrev(p){
  flushPend();
  const prev = p.previousElementSibling, parent = p.parentNode;
  p.remove(); renum(parent); caretTo(prev, true);
  pushHist(); markDirty(); refreshThumbs();
}


/* line copy / paste / duplicate */
let lineClip = null;
function lineOf(node){ const p = node && node.closest && node.closest('[data-ed]'); return p && p.tagName === 'P' ? p : null; }
function insertLineAfter(p, src){
  flushPend();
  const np = src.cloneNode(true); np.classList.remove('cell-on');
  np.setAttribute('contenteditable', 'true'); np.setAttribute('data-ed', ''); np.spellcheck = false;
  p.after(np); renum(p.parentNode); caretTo(np, true);
  np.animate?.([{backgroundColor: 'rgba(110,185,43,.25)'}, {backgroundColor: 'transparent'}], {duration: 700});
  pushHist(); markDirty(); refreshThumbs();
}

let editOn = true, lastEd = null, curSec = null, io = null;
function setEdit(on){
  flushPend(); const pages = currentPages(); editOn = on; mountPages(pages);
  const tg = $('#editTgl'); if (tg) { tg.setAttribute('aria-pressed', on); tg.lastChild.textContent = on ? '편집' : '보기'; }
  const f = $('#fmt'); if (f) f.hidden = !on;
  toast(on ? '편집을 켰어요. 글자를 눌러 고쳐요.' : '편집을 껐어요. 보기 모드예요.');
}
function renumArts(){
  let n = 0;
  pagesEls().forEach(pg => pg.querySelectorAll('section h2').forEach(h => { const sp = h.querySelector('span'); if (sp && /^\s*제\s*\d+\s*조/.test(sp.textContent)) sp.textContent = `제${++n}조`; }));
}
function renumPages(){
  const ps = pagesEls(), n = ps.length;
  ps.forEach((pg, i) => pg.querySelectorAll(':scope > p').forEach(p => { const sp = p.querySelectorAll('span'); const last = sp[sp.length - 1]; if (sp.length >= 2 && /^\s*\d+\s*\/\s*\d+\s*$/.test(last.textContent)) last.textContent = `${i + 1} / ${n}`; }));
}
function emptySection(from){
  const s = from.cloneNode(true);
  s.querySelectorAll('[data-ed]').forEach(el => { el.removeAttribute('contenteditable'); el.removeAttribute('data-ed'); });
  const sp = s.querySelectorAll('h2 span'); if (sp[0]) sp[0].textContent = '제0조'; if (sp[1]) sp[1].textContent = '새 조항';
  const body = document.createElement('div'); body.innerHTML = '<p class="li">1. 내용을 입력하세요.</p>';
  if (s.children[1]) s.children[1].replaceWith(body); else s.appendChild(body);
  return s;
}
function newTable(){
  const t = document.createElement('table'); t.className = 't'; t.style.cssText = 'font-size: 12px; margin-top: 6px';
  t.innerHTML = ['항목','항목','항목'].map((h, i) => `<tr><th style="padding: 3px 9px;${i === 0 ? ' width: 120px' : ''}">${h}</th><td style="padding: 3px 9px">내용</td></tr>`).join('');
  return t;
}
function structOp(fn, msg){
  flushPend(); const r = fn(); if (r === false) return;
  renumArts(); renumPages();
  pagesEls().forEach(pg => { if (canWrite && editOn) markEditable(pg); });
  pushHist(); markDirty(); refreshThumbs(); hideSTB(); if (msg) toast(msg);
}
function hideSTB(){ const b = $('#stb'); if (b) b.hidden = true; curSec = null; }
function showSTB(sec){
  const b = $('#stb'); if (!b || !editOn || !canWrite) return; curSec = sec; b.hidden = false;
  const r = sec.getBoundingClientRect(); b.style.top = Math.max(70, r.top - b.offsetHeight - 2) + 'px'; b.style.left = Math.max(8, Math.min(r.left, innerWidth - b.offsetWidth - 8)) + 'px';
}
function mountPages(pages){
  const desk = $('#desk'), side = $('#side');
  side.innerHTML = pages.map((p, i) => `<button class="tp" data-i="${i}" aria-label="${i+1}쪽으로"><span class="tbox" inert>${sanitizePage(p)}</span><span class="tn">${i+1}</span></button>`).join('') + (canWrite && editOn ? '<button class="btn addpg" id="addpg">+ 쪽 추가</button>' : '');
  desk.innerHTML = pages.map((p, i) => `<div class="sheet" id="pg${i+1}"><div class="lbl"><span>${i+1} / ${pages.length}쪽</span>${canWrite && editOn && pages.length > 1 ? `<button class="lk" data-delpg="${i}">이 쪽 삭제</button>` : ''}</div><div class="paper">${sanitizePage(p)}</div></div>`).join('');
  pagesEls().forEach(pg => { if (canWrite && editOn) markEditable(pg); });
  document.body.classList.toggle('viewing', !(canWrite && editOn));
  const tps = [...side.querySelectorAll('.tp')];
  tps.forEach(b => b.onclick = () => document.getElementById('pg' + (+b.dataset.i + 1)).scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'}));
  io?.disconnect();
  io = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { const i = [...desk.children].indexOf(e.target); tps.forEach((t, k) => t.classList.toggle('on', k === i)); } }); }, {rootMargin: '-40% 0px -55% 0px'});
  [...desk.children].forEach(s => io.observe(s)); tps[0]?.classList.add('on');
  const ap = $('#addpg'); if (ap) ap.onclick = () => structOp(() => {
    const ps = pagesEls(), last = ps[ps.length - 1], np = last.cloneNode(true);
    const anySec = document.querySelector('#desk section.art');
    [...np.children].forEach(ch => { if (ch.tagName === 'HEADER') return; const isFoot = ch.tagName === 'P' && ch.querySelectorAll('span').length >= 2 && /\d+\s*\/\s*\d+\s*$/.test(ch.textContent); if (!isFoot) ch.remove(); });
    const hdr = np.querySelector('header'); const sec = anySec ? emptySection(anySec) : null;
    if (sec) (hdr ? hdr.after(sec) : np.prepend(sec));
    const sheet = last.closest('.sheet').cloneNode(false); const paper = document.createElement('div'); paper.className = 'paper'; paper.appendChild(np); sheet.appendChild(paper);
    const html = currentPages(); html.push(cleanHTML(np)); setTimeout(() => { mountPages(html); renumArts(); renumPages(); fitPages(); pushHist(); markDirty(); }, 0); return false;
  });
  desk.querySelectorAll('[data-delpg]').forEach(b => b.onclick = async () => {
    if (await ask('이 쪽을 지울까요?', `${+b.dataset.delpg + 1}쪽을 지워요. Ctrl+Z로 되돌릴 수 있어요.`, [['취소', false, 'ghost'], ['삭제', true, 'pri']]) !== true) return;
    flushPend(); const html = currentPages(); html.splice(+b.dataset.delpg, 1); mountPages(html); renumArts(); renumPages(); fitPages(); pushHist(); markDirty(); refreshThumbs();
  });
  fitPages(); hideTT(); hideSTB();
}

function renderEditor(id){
  const c = get(id); if (!c) { location.hash = ''; return; }
  cur = {...c, pages: c.pages.slice()}; dirty = false; hist = []; hi = -1; tblCell = null;
  app.innerHTML = `<div class="bar">
    <button class="btn ghost" id="back" aria-label="목록으로">← 목록</button>
    <input class="title-in" id="tname" value="${esc(c.name)}" aria-label="계약서 이름" ${canWrite ? '' : 'readonly'}>
    <span class="chip" id="chip"><i></i><span>${canWrite ? '저장됨' : '보기 전용'}</span></span>
    <span style="margin-left:auto"></span>
    ${canWrite ? `<div class="fmt" id="fmt" role="group" aria-label="글자 서식"><button class="btn icon" data-al="left" title="왼쪽 정렬" aria-label="왼쪽 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 9h9M3 13h14M3 17h9"/></svg></button><button class="btn icon" data-al="center" title="가운데 정렬" aria-label="가운데 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M5.5 9h9M3 13h14M5.5 17h9"/></svg></button><button class="btn icon" data-al="right" title="오른쪽 정렬" aria-label="오른쪽 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M8 9h9M3 13h14M8 17h9"/></svg></button><button class="btn icon" data-bold title="굵게 (Ctrl+B)" aria-label="굵게" style="font-weight:800">B</button></div>
    <button class="btn tgl" id="editTgl" aria-pressed="true" title="편집 켜기/끄기 (Ctrl+E)"><i></i><span>편집</span></button>
    <button class="btn icon" id="undo" title="되돌리기 (Ctrl+Z)" aria-label="되돌리기" disabled>↶</button><button class="btn icon" id="redo" title="다시 하기 (Ctrl+Shift+Z)" aria-label="다시 하기" disabled>↷</button><button class="btn pri" id="save" disabled>저장</button>` : ''}
    <div class="menu" id="menu"><button class="btn" id="expb" aria-haspopup="true" aria-expanded="false">내보내기 ▾</button>
      <div class="menu-list" role="menu">
        <button role="menuitem" data-x="pdf">PDF<small>A4 · 글자 복사 가능</small></button>
        <button role="menuitem" data-x="png">PNG<small>쪽마다 한 장씩 · 고화질</small></button>
        <button role="menuitem" data-x="jpg">JPG<small>쪽마다 한 장씩</small></button>
        <button role="menuitem" data-x="docx">독스 파일 (.docx)<small>구글 독스·워드·한글에서 열어요</small></button>
      </div></div>
    <button class="btn icon" id="findb" title="찾기 (Ctrl+F)" aria-label="찾기"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
    <button class="btn icon ghost" id="keys" title="단축키" aria-label="단축키 보기">?</button>
  </div>
  <div class="ed">
    <nav class="side" id="side" aria-label="쪽 목록"></nav>
    <div class="desk" id="desk"></div>
  </div>
  <div class="tbt stb" id="stb" hidden role="toolbar" aria-label="조항 편집"><div class="tg"><span>조항</span><button data-s="add" title="아래에 새 조항 추가">+ 조항</button><button data-s="table" title="이 조항에 표 넣기">+ 표</button><button data-s="up" title="위로 옮기기">↑</button><button data-s="down" title="아래로 옮기기">↓</button><button data-s="del" title="조항 삭제">삭제</button></div></div>
  <div class="findbar" id="fb" hidden role="search"><input id="fq" type="search" placeholder="계약서 안에서 찾기" aria-label="계약서 안에서 찾기" autocomplete="off"><span class="cnt" id="fn"></span><button id="fprev" aria-label="이전 결과">↑</button><button id="fnext" aria-label="다음 결과">↓</button><button id="fx" aria-label="찾기 닫기">×</button></div>
  <div class="tbt" id="tt" hidden role="toolbar" aria-label="표 편집">
    <div class="tg"><span>행</span><button data-t="rowup" title="위에 행 추가">↑ 추가</button><button data-t="rowdn" title="아래에 행 추가">↓ 추가</button><button data-t="rowdel" title="행 삭제">삭제</button></div>
    <div class="tg"><span>열</span><button data-t="colL" title="왼쪽에 열 추가">← 추가</button><button data-t="colR" title="오른쪽에 열 추가">→ 추가</button><button data-t="coldel" title="열 삭제">삭제</button></div>
    <div class="tg"><span>색</span><select id="scope" aria-label="색 칠할 범위"><option value="cell">칸</option><option value="row">행</option><option value="col">열</option></select>
      ${['#ffffff','#f5f5f5','#eef5e7','#dceccd','#fff6dc','#fde8e8','#e7eefa','#111111'].map(col => `<button class="sw" data-c="${col}" style="background:${col}" title="${col}" aria-label="${col} 칠하기"></button>`).join('')}
      <button data-c="" title="색 지우기">없음</button></div>
  </div>`;
  const desk = $('#desk'); editOn = canWrite;
  fitPages = () => {
    const s = Math.min(1, (desk.clientWidth - 32) / W);
    desk.querySelectorAll('.paper').forEach(p => { p.style.width = W * s + 'px'; p.style.height = H * s + 'px'; if (p.firstElementChild) p.firstElementChild.style.transform = `scale(${s})`; });
    document.querySelectorAll('#side .tbox').forEach(b => { const pg = b.firstElementChild; if (pg) pg.style.transform = `scale(${b.clientWidth / W})`; });
    if (tblCell) showTT(tblCell); if (curSec) showSTB(curSec);
  };
  mountPages(c.pages); new ResizeObserver(fitPages).observe(desk);
  pushHist();
  // editing
  desk.addEventListener('input', () => { markDirty(); clearTimeout(pend); pend = setTimeout(() => { pend = null; pushHist(); }, 700); refreshThumbs(); });
  desk.addEventListener('keydown', e => {
    const ed = e.target.closest && e.target.closest('[data-ed]'); if (!ed) return;
    if (e.key === 'Enter' && !e.shiftKey && ed.tagName === 'P') { e.preventDefault(); splitPara(ed); return; }
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); return; }
    if (e.key === 'Backspace' && ed.tagName === 'P' && atStart(ed) && ed.previousElementSibling?.tagName === 'P' && /^\s*((\d+)\.|[•·\-])?\s*$/.test(ed.textContent)) { e.preventDefault(); joinPrev(ed); }
  });
  desk.addEventListener('paste', e => {
    if (!e.target.closest('[data-ed]')) return; e.preventDefault();
    const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
    const p = lineOf(e.target);
    if (p && lineClip && txt === lineClip.text && getSelection().isCollapsed) { insertLineAfter(p, lineClip.el); toast('줄을 아래에 붙여 넣었어요.'); return; }
    document.execCommand('insertText', false, txt);
  });
  desk.addEventListener('copy', e => {
    const p = lineOf(e.target); if (!p || !getSelection().isCollapsed) { lineClip = null; return; }
    e.preventDefault(); const text = p.textContent; e.clipboardData.setData('text/plain', text);
    lineClip = {el: p.cloneNode(true), text}; toast('줄을 복사했어요. 붙여 넣을 줄을 누르고 Ctrl+V 하면 그 아래에 들어가요.');
  });
  desk.addEventListener('mousedown', e => { if (!e.altKey || !canWrite) return; const p = lineOf(e.target); if (p) { e.preventDefault(); insertLineAfter(p, p); toast('줄을 복제했어요.'); } });
  desk.addEventListener('focusin', e => { const cell = canWrite && e.target.closest('td,th'); if (cell && cell.closest('table.t')) showTT(cell); });
  desk.addEventListener('click', e => { const cell = canWrite && e.target.closest('td,th'); if (cell && cell.closest('table.t')) showTT(cell); else if (!e.target.closest('#tt')) hideTT(); });
  window.addEventListener('scroll', () => { if (tblCell) showTT(tblCell); }, {passive: true});
  const tt = $('#tt');
  tt.addEventListener('mousedown', e => { if (e.target.tagName === 'BUTTON') e.preventDefault(); });
  tt.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const op = b.dataset.t;
    if (op === 'rowup') tableOp(() => addRow(false)); else if (op === 'rowdn') tableOp(() => addRow(true));
    else if (op === 'rowdel') tableOp(delRow); else if (op === 'colL') tableOp(() => addCol(false));
    else if (op === 'colR') tableOp(() => addCol(true)); else if (op === 'coldel') tableOp(delCol);
    else if ('c' in b.dataset) tableOp(() => paint(b.dataset.c, $('#scope').value));
  });
  desk.addEventListener('focusin', e => { const ed = e.target.closest('[data-ed]'); if (ed) lastEd = ed; });
  desk.addEventListener('mouseover', e => { if (!editOn || !canWrite) return; const sec = e.target.closest('section.art'); if (sec && sec !== curSec) showSTB(sec); });
  window.addEventListener('scroll', () => { if (curSec) showSTB(curSec); }, {passive: true});
  const stb = $('#stb');
  stb.addEventListener('mousedown', e => e.preventDefault());
  stb.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !curSec) return; const sec = curSec, op = b.dataset.s;
    if (op === 'add') structOp(() => { sec.after(emptySection(sec)); }, '새 조항을 넣었어요.');
    else if (op === 'table') structOp(() => { let body = sec.children[1]; if (!body) return false; if (body.tagName !== 'DIV') { const w = document.createElement('div'); body.replaceWith(w); w.appendChild(body); body = w; } body.appendChild(newTable()); }, '표를 넣었어요. 칸을 누르면 행·열을 더할 수 있어요.');
    else if (op === 'up') structOp(() => { const p = sec.previousElementSibling; if (!p || p.tagName !== 'SECTION') return false; p.before(sec); });
    else if (op === 'down') structOp(() => { const n = sec.nextElementSibling; if (!n || n.tagName !== 'SECTION') return false; n.after(sec); });
    else if (op === 'del') structOp(() => { if (document.querySelectorAll('#desk section.art').length <= 1) { toast('조항이 하나뿐이에요.'); return false; } sec.remove(); }, '조항을 지웠어요. Ctrl+Z로 되돌릴 수 있어요.');
  });
  const fmt = $('#fmt');
  if (fmt) { fmt.addEventListener('mousedown', e => e.preventDefault()); fmt.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if ('bold' in b.dataset) { document.execCommand('bold'); markDirty(); flushPend(); pushHist(); return; }
    const el = lastEd && lastEd.isConnected ? lastEd : null; if (!el) { toast('정렬할 글자를 먼저 눌러 주세요.'); return; }
    flushPend(); el.style.textAlign = b.dataset.al; if (getComputedStyle(el).display === 'flex') el.style.justifyContent = b.dataset.al === 'center' ? 'center' : b.dataset.al === 'right' ? 'flex-end' : 'flex-start';
    pushHist(); markDirty(); refreshThumbs();
  }); }
  const tg = $('#editTgl'); if (tg) tg.onclick = () => setEdit(!editOn);
  $('#tname').addEventListener('input', markDirty);
  $('#back').onclick = () => { location.hash = ''; };
  $('#findb').onclick = openFind; bindFind();
  const sb = $('#save'); if (sb) sb.onclick = save;
  const ub = $('#undo'); if (ub) ub.onclick = undo; const rb = $('#redo'); if (rb) rb.onclick = redo;
  $('#keys').onclick = () => ask('단축키', 'Enter  번호·글머리표 다음 줄 추가\nCtrl+C (선택 없이)  줄 전체 복사\nCtrl+V  복사한 줄을 아래에 붙이기\nCtrl+D 또는 Alt+클릭  줄 복제\nShift+Enter  같은 칸 안에서 줄바꿈\nBackspace  빈 번호 줄 지우기\nCtrl+Z  되돌리기\nCtrl+Shift+Z / Ctrl+Y  다시 하기\nCtrl+F  계약서 안에서 찾기\nCtrl+S  저장\nCtrl+B  굵게\nEsc  편집 끝내기\nCtrl+E  편집 켜기/끄기\nAlt+↑ / Alt+↓  이전·다음 쪽\nCtrl+Shift+E  PDF로 내보내기\n(Mac은 Ctrl 대신 ⌘)', [['닫기', true, 'pri']]);
  const menu = $('#menu'), eb = $('#expb');
  eb.onclick = e => { e.stopPropagation(); const o = menu.classList.toggle('open'); eb.setAttribute('aria-expanded', o); };
  menu.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { menu.classList.remove('open'); exportAs(b.dataset.x); });
}
document.addEventListener('click', () => { const m = $('#menu'); if (m) { m.classList.remove('open'); $('#expb')?.setAttribute('aria-expanded', false); } });
async function save(){
  if (!cur || saving || !canWrite) return;
  flushPend(); saving = true; setChip('', '저장 중…');
  const data = {name: ($('#tname').value.trim() || cur.name).slice(0, 120), party: cur.party || '', pages: currentPages(), updatedAt: new Date().toISOString()};
  try { await persist(cur.id, data); if (!db) store[cur.id] = data; cur = {...cur, ...data}; dirty = false; setChip('', '저장됨'); $('#save').disabled = true; }
  catch (e) { setChip('err', '저장 못 함'); toast(e?.code === 'quota_exceeded' ? '저장 공간이 가득 찼어요. 쓰지 않는 사본을 지워 주세요.' : e?.code === 'invalid_argument' ? '이 계정은 저장 권한이 없어요.' : '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'); }
  saving = false;
}
document.addEventListener('keydown', e => {
  if (!cur) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'f') { e.preventDefault(); openFind(); }
  else if (mod && k === 's') { e.preventDefault(); save(); }
  else if (mod && k === 'z' && !e.shiftKey && canWrite && e.target.id !== 'tname') { e.preventDefault(); undo(); }
  else if (mod && ((k === 'z' && e.shiftKey) || k === 'y') && canWrite && e.target.id !== 'tname') { e.preventDefault(); redo(); }
  else if (mod && e.shiftKey && k === 'e') { e.preventDefault(); exportAs('pdf'); }
  else if (mod && !e.shiftKey && k === 'e' && canWrite) { e.preventDefault(); setEdit(!editOn); }
  else if (mod && k === 'd' && canWrite) { const p = lineOf(document.activeElement); if (p) { e.preventDefault(); insertLineAfter(p, p); } }
  else if (k === 'escape') { if (closeFind()) return; if (document.activeElement?.closest?.('[data-ed]')) document.activeElement.blur(); hideTT(); }
  else if (e.altKey && (k === 'arrowdown' || k === 'arrowup')) {
    e.preventDefault(); const tps = [...document.querySelectorAll('#side .tp')]; const i = tps.findIndex(t => t.classList.contains('on'));
    const n = Math.max(0, Math.min(tps.length - 1, i + (k === 'arrowdown' ? 1 : -1))); tps[n]?.click();
  }
});

/* ---------- export ---------- */
let dl = null;
function fileBase(){ return (($('#tname')?.value || cur?.name || '계약서').trim().replace(/[\\/:*?"<>|]+/g, ' ')) || '계약서'; }
function stage(){
  const box = $('#exp'); box.innerHTML = currentPages().join('');
  box.querySelectorAll('header svg').forEach(sv => { const im = new Image(); im.src = 'data:image/png;base64,' + LOGO; im.alt = 'OPK Korea'; im.style.cssText = `width:${sv.style.width || '72px'};height:${sv.style.height || '50px'};display:block;flex:none`; sv.replaceWith(im); });
  return [...box.querySelectorAll('.pg')];
}
async function saveFile(filename, data){
  if (!dl) {
    if (!window.claude) { const u = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); return true; }
    toast('이 화면에서는 파일 저장을 쓸 수 없어요. claude.ai에서 열어 주세요.'); return false;
  }
  try { await dl.save({filename, data}); return true; }
  catch (e) { if (e?.code === 'declined') toast('저장을 취소했어요.'); else if (e?.code === 'rate_limited') toast('앞의 저장 창을 먼저 마쳐 주세요.'); else if (e?.code === 'host_unavailable') toast('이 앱에서는 파일을 저장할 수 없어요. 브라우저에서 열어 주세요.'); else toast('파일을 저장하지 못했어요.'); return false; }
}
async function makePdf(){
  const pages = stage(); await document.fonts.ready; await Promise.all([...$('#exp').querySelectorAll('img')].map(i => i.decode().catch(() => {})));
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({unit:'pt', format:[595.5, 842.25], orientation:'portrait', compress:true});
  const box = $('#exp'); box.classList.add('on'); const sy = window.scrollY; window.scrollTo(0, 0);
  try {
  await pdf.html(box, {x:0, y:0, width:595.5, windowWidth:W, autoPaging:'slice', margin:0,
    fontFaces:[
      {family:'Pretendard', weight:400, src:[{url:'fonts/Pretendard-Regular.ttf', format:'truetype'}]},
      {family:'Pretendard', weight:500, src:[{url:'fonts/Pretendard-Bold.ttf', format:'truetype'}]},
      {family:'Pretendard', weight:600, src:[{url:'fonts/Pretendard-Bold.ttf', format:'truetype'}]},
      {family:'Pretendard', weight:700, src:[{url:'fonts/Pretendard-Bold.ttf', format:'truetype'}]}
    ], html2canvas:{backgroundColor:'#ffffff', scrollX:0, scrollY:0, windowHeight: pages.length * H, height: pages.length * H}});
  } finally { box.classList.remove('on'); window.scrollTo(0, sy); }
  while (pdf.getNumberOfPages() > pages.length) pdf.deletePage(pdf.getNumberOfPages());
  box.innerHTML = '';
  return pdf.output('blob');
}
async function makeImgs(type){
  const pages = stage(); await document.fonts.ready; const out = [];
  for (const pg of pages) {
    $('#exp').classList.add('on'); const cv = await html2canvas(pg, {scale:2, scrollX:0, scrollY:0, backgroundColor:'#ffffff', width:W, height:H, windowWidth:W});
    out.push(await new Promise(r => cv.toBlob(r, type, 0.93)));
  }
  $('#exp').classList.remove('on'); $('#exp').innerHTML = '';
  return out;
}
window.__opk = {makePdf, makeImgs, makeDocx: () => makeDocx()};
async function exportAs(kind){
  const base = fileBase();
  try {
    if (kind === 'pdf') { toast('PDF를 만드는 중이에요…'); const b = await makePdf(); if (await saveFile(base + '.pdf', b)) toast('PDF를 저장했어요.'); }
    else if (kind === 'jpg' || kind === 'png') { const ext = kind, up = kind.toUpperCase(); toast(up + '를 만드는 중이에요…'); const bs = await makeImgs(kind === 'png' ? 'image/png' : 'image/jpeg'); for (let i = 0; i < bs.length; i++) { const ok = await saveFile(bs.length > 1 ? `${base}_${i+1}.${ext}` : `${base}.${ext}`, bs[i]); if (!ok) return; } toast(bs.length > 1 ? `${up} ${bs.length}장을 저장했어요.` : up + '를 저장했어요.'); }
    else if (kind === 'docx') { toast('독스 파일을 만드는 중이에요…'); const b = await makeDocx(); if (await saveFile(base + '.docx', b)) toast('독스 파일(.docx)을 저장했어요. 구글 드라이브에 올려 열면 구글 독스로 열려요.'); }
  } catch (e) { $('#exp').innerHTML = ''; toast('내보내기에 실패했어요. 다시 해 주세요.'); console.error(e); }
}

/* ---------- word / google docs (.docx) ---------- */
function loadScript(src){ return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
function cssColor(v){
  if (!v) return null; v = v.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i); if (m) return m[1].toUpperCase();
  m = v.match(/^#([0-9a-f]{3})$/i); if (m) return m[1].split('').map(x => x + x).join('').toUpperCase();
  m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/); if (m) { if (m[4] !== undefined && +m[4] === 0) return null; return [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase(); }
  return null;
}
async function makeDocx(){
  await loadScript('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js');
  const X = window.docx;
  const FONT = {ascii:'Noto Sans KR', eastAsia:'Noto Sans KR', hAnsi:'Noto Sans KR', cs:'Noto Sans KR'};
  const SZ = 18; // 9pt
  const CW = 10466; // A4 width minus 0.5in margins (twips)
  const none = {style: X.BorderStyle.NONE, size: 0, color: 'FFFFFF'};
  const noB = {top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none};
  const line = {style: X.BorderStyle.SINGLE, size: 4, color: 'D9D9D9'};
  const allB = {top: line, bottom: line, left: line, right: line};
  const logo = Uint8Array.from(atob(LOGO), ch => ch.charCodeAt(0));
  const run = (text, o = {}) => new X.TextRun({text, font: FONT, size: o.size || SZ, bold: o.bold, color: o.color || '333333', break: o.br ? 1 : undefined});
  const P = (runs, o = {}) => new X.Paragraph({children: runs, alignment: o.align, spacing: {before: o.before || 0, after: o.after ?? 20, line: o.line || 264}, border: o.border, keepNext: o.keepNext});
  const alignOf = el => { const a = getComputedStyle(el).textAlign; return a === 'center' ? X.AlignmentType.CENTER : (a === 'right' || a === 'end') ? X.AlignmentType.RIGHT : undefined; };
  function runs(node, st = {}){
    const out = [];
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, ' '); if (t.trim() || (t === ' ' && out.length)) out.push(run(t, st)); }
      else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { out.push(new X.TextRun({text: '', break: 1})); continue; }
        if (n.tagName === 'svg' || n.tagName === 'IMG') continue;
        const cs = getComputedStyle(n); const s2 = {...st};
        if (n.tagName === 'STRONG' || n.tagName === 'B' || +cs.fontWeight >= 600) s2.bold = true;
        const col = cssColor(cs.color); if (col) s2.color = col;
        const fs = parseFloat(cs.fontSize); if (fs) s2.size = Math.round(fs * 0.75 * 2);
        out.push(...runs(n, s2));
      }
    }
    return out;
  }
  const baseSt = el => { const cs = getComputedStyle(el); return {bold: +cs.fontWeight >= 600, color: cssColor(cs.color) || '333333', size: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) || SZ}; };
  const para = (el, o = {}) => P(runs(el, baseSt(el)), {align: alignOf(el), ...o});
  function cellKids(el){
    const blocks = [...el.children].filter(c => /^(P|DIV|TABLE)$/.test(c.tagName));
    if (!blocks.length) return [para(el, {after: 0})];
    return blocks.flatMap(b => block(b, 0)).concat(blocks.at(-1).tagName === 'TABLE' ? [P([], {after: 0})] : []);
  }
  function table(t, total){
    const rows = [...t.rows]; if (!rows.length) return [];
    const first = [...rows[0].cells]; const fw = first.reduce((a, c) => a + c.offsetWidth, 0) || 1;
    const g = grid(t); const ncol = Math.max(...g.map(r => r.length));
    const colW = Array.from({length: ncol}, (_, ci) => { const c = g[0][ci]; return Math.round((c.offsetWidth / c.colSpan) / fw * total); });
    const fix = total - colW.reduce((a, b) => a + b, 0); colW[colW.length - 1] += fix;
    const trs = rows.map(r => new X.TableRow({cantSplit: true, children: [...r.cells].map(c => {
      const [, ci] = pos(g, c); const w = colW.slice(ci, ci + c.colSpan).reduce((a, b) => a + b, 0);
      const bg = cssColor(getComputedStyle(c).backgroundColor);
      const st = c.getAttribute('style') || '';
      return new X.TableCell({children: cellKids(c), columnSpan: c.colSpan > 1 ? c.colSpan : undefined, rowSpan: c.rowSpan > 1 ? c.rowSpan : undefined,
        width: {size: w, type: X.WidthType.DXA}, verticalAlign: X.VerticalAlign.CENTER,
        borders: /border-top:\s*2px/.test(st) ? {...allB, top: {style: X.BorderStyle.SINGLE, size: 12, color: '111111'}} : allB,
        shading: bg && bg !== 'FFFFFF' ? {type: X.ShadingType.CLEAR, color: 'auto', fill: bg} : undefined,
        margins: {top: 40, bottom: 40, left: 100, right: 100}});
    })}));
    return [new X.Table({width: {size: total, type: X.WidthType.DXA}, columnWidths: colW, layout: X.TableLayoutType.FIXED, rows: trs})];
  }
  function box(el, total, fill){
    return [new X.Table({width: {size: total, type: X.WidthType.DXA}, columnWidths: [total], borders: noB, rows: [new X.TableRow({children: [new X.TableCell({children: el.children.length && [...el.children].some(c => c.tagName === 'P') ? [...el.children].map(c => para(c, {after: 0})) : [P(runs(el, baseSt(el)), {after: 0})], width: {size: total, type: X.WidthType.DXA}, borders: noB, shading: {type: X.ShadingType.CLEAR, color: 'auto', fill}, margins: {top: 100, bottom: 100, left: 160, right: 160}})]})]})];
  }
  function block(el, total){
    total = total || 9000;
    if (el.tagName === 'TABLE') return table(el, total);
    if (el.tagName === 'P') return [para(el)];
    const bg = cssColor(getComputedStyle(el).backgroundColor);
    if (bg && bg !== 'FFFFFF') return box(el, total, bg);
    if (el.classList.contains('kv')) {
      const [k, v] = el.children; const parts = v && v.tagName === 'DIV' ? [...v.children] : [];
      if (parts.length) return [P(runs(k, {bold: true, color: '111111'}))].concat(parts.map(p => P([run('   '), ...runs(p, baseSt(p))])));
      return [P([...runs(k, {bold: true, color: '111111'}), run('   '), ...(v ? runs(v, baseSt(v)) : [])])];
    }
    if (!el.children.length && el.textContent.trim()) return [para(el)];
    return [...el.children].flatMap(c => block(c, total));
  }
  const two = (cols, cells, borders) => new X.Table({width: {size: CW, type: X.WidthType.DXA}, columnWidths: cols, borders: noB, rows: [new X.TableRow({cantSplit: true, children: cells.map((kids, i) => new X.TableCell({children: kids, width: {size: cols[i], type: X.WidthType.DXA}, borders: borders?.[i] || noB, verticalAlign: X.VerticalAlign.TOP, margins: {top: 100, bottom: 100, left: 0, right: i === 0 ? 120 : 0}}))})]});
  const children = [];
  pagesEls().forEach((pg, pi) => {
    if (pi) children.push(new X.Paragraph({children: [new X.PageBreak()]}));
    for (const el of pg.children) {
      if (el.tagName === 'HEADER') {
        const ps = el.querySelectorAll('p'); const last = ps[ps.length - 1]; const lines = last ? last.innerText.split('\n').map(s => s.trim()).filter(Boolean) : [];
        children.push(two([1500, 6466, 2500], [
          [new X.Paragraph({children: [new X.ImageRun({type: 'png', data: logo, transformation: {width: 64, height: 42}})]})],
          [new X.Paragraph({children: runs(ps[0], baseSt(ps[0])), spacing: {before: 0, after: 40}}), new X.Paragraph({children: runs(el.querySelector('h1'), baseSt(el.querySelector('h1'))), spacing: {before: 0, after: 0}})],
          [P([run(lines[0] || '', {size: 18, color: '555555'})], {align: X.AlignmentType.RIGHT, after: 0}), P([run(lines[1] || '', {size: 18, bold: true, color: '111111'})], {align: X.AlignmentType.RIGHT, after: 0})]
        ]));
        children.push(new X.Paragraph({children: [], spacing: {after: 160}, border: {bottom: {style: X.BorderStyle.SINGLE, size: 16, color: '111111', space: 4}}}));
      } else if (el.tagName === 'SECTION') {
        const sp = el.querySelectorAll('h2 span');
        const left = [...sp].map((s, i) => P(runs(s, baseSt(s)), {after: 0}));
        const right = block(el.children[1] || el, 9000); if (right.at(-1) instanceof X.Table) right.push(P([], {after: 0}));
        children.push(two([1300, 9166], [left, right], [{top: line}, {top: line}]));
      } else if (el.tagName === 'P') {
        if (/\d+\s*\/\s*\d+\s*$/.test(el.textContent) && el.querySelectorAll('span').length >= 2) continue;
        if (el.textContent.trim()) children.push(para(el, {after: 120, before: 80}));
      } else if (el.tagName === 'DIV') {
        const tabs = [...el.querySelectorAll(':scope table')];
        const date = el.querySelector(':scope > p');
        if (date) children.push(para(date, {before: 240, after: 160, align: X.AlignmentType.CENTER, border: {top: {style: X.BorderStyle.SINGLE, size: 4, color: 'E1E1E1', space: 10}}}));
        if (tabs.length >= 2) {
          const cols = [5033, 400, 5033];
          const a = table(tabs[0], 5033), b = table(tabs[1], 5033);
          children.push(new X.Table({width: {size: CW, type: X.WidthType.DXA}, columnWidths: cols, borders: noB, rows: [new X.TableRow({children: [
            new X.TableCell({children: [...a, P([], {after: 0})], width: {size: cols[0], type: X.WidthType.DXA}, borders: noB}),
            new X.TableCell({children: [P([])], width: {size: cols[1], type: X.WidthType.DXA}, borders: noB}),
            new X.TableCell({children: [...b, P([], {after: 0})], width: {size: cols[2], type: X.WidthType.DXA}, borders: noB})]})]}));
        } else if (!date) children.push(...block(el, CW));
      }
    }
  });
  const doc = new X.Document({
    styles: {default: {document: {run: {font: FONT, size: SZ, color: '333333'}}}},
    sections: [{properties: {page: {size: {width: 11906, height: 16838}, margin: {top: 720, bottom: 720, left: 720, right: 720}}}, children}]
  });
  return X.Packer.toBlob(doc);
}

/* ---------- routing & boot ---------- */
async function route(){
  const m = location.hash.match(/^#c-([A-Za-z0-9-]+)$/);
  if (cur && dirty && (!m || m[1] !== cur.id)) {
    const v = await ask('저장하지 않은 수정이 있어요', '저장하고 나갈까요?', [['취소', 'cancel', 'ghost'], ['저장 안 함', 'drop'], ['저장', 'save', 'pri']]);
    if (v === 'cancel') { history.replaceState(null, '', '#c-' + cur.id); return; }
    if (v === 'save') await save();
    dirty = false;
  }
  if (m) renderEditor(m[1]); else renderHome();
}
window.addEventListener('hashchange', route);
loadLocal(); local = true; route();
(async () => {
  const [d, u, dw] = await Promise.all(['db', 'user', 'downloads'].map(n => (window.claude?.use ? window.claude.use(n) : Promise.resolve(null)).catch(() => null)));
  dl = dw;
  if (u && u.can) { try { const w = await u.can('data.write'); if (w === false) canWrite = false; } catch {} }
  if (d) {
    db = d; local = false; store = {};
    let first = true; const timer = setTimeout(() => toast('저장된 계약서를 아직 불러오지 못했어요. 기본 양식을 보여 드려요.'), 10000);
    db.collection('contracts').onSnapshot(snap => {
      clearTimeout(timer);
      const next = {}; for (const doc of snap.docs) { const v = doc.data(); if (v && Array.isArray(v.pages)) next[doc.id] = {name: String(v.name || '계약서'), party: String(v.party || ''), pages: v.pages.map(sanitizePage).filter(Boolean), updatedAt: v.updatedAt}; }
      store = next;
      if (!cur) renderHome(); else if (first && !dirty) renderEditor(cur.id);
      first = false;
    }, () => { clearTimeout(timer); toast('저장소에 연결하지 못했어요. 이 브라우저에만 저장돼요.'); db = null; local = true; loadLocal(); if (!cur) renderHome(); });
  } else if (!cur) renderHome();
  setMode();
})();
}
