
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
    if (el.closest('svg') || el.closest('[data-ed]') || el.closest('.fld')) return;
    if (['TABLE','TBODY','THEAD','TR','SECTION','HEADER','COLGROUP','COL','BR','IMG'].includes(el.tagName)) return;
    const direct = [...el.childNodes].some(n => (n.nodeType === 3 && n.textContent.trim()) || (n.nodeType === 1 && n.classList.contains('fld')));
    const hasBlock = el.querySelector(BLOCK);
    const emptyCell = (el.tagName === 'TD' || el.tagName === 'TH' || (el.tagName === 'P' && !el.closest('header'))) && !el.textContent.trim() && !el.querySelector(BLOCK);
    if ((direct || emptyCell) && !hasBlock) { el.setAttribute('contenteditable', 'true'); el.setAttribute('data-ed', ''); el.spellcheck = false; }
  });
  root.querySelectorAll('.fld').forEach(f => { f.setAttribute('contenteditable', 'false'); f.removeAttribute('style'); });
}
function cleanHTML(pg){
  const c = pg.cloneNode(true);
  c.querySelectorAll('[data-ed]').forEach(el => { el.removeAttribute('contenteditable'); el.removeAttribute('data-ed'); el.removeAttribute('spellcheck'); });
  c.querySelectorAll('.cell-on').forEach(el => el.classList.remove('cell-on'));
  c.querySelectorAll('.fld').forEach(el => { el.removeAttribute('contenteditable'); el.classList.remove('fld-hi'); });
  c.querySelectorAll('[data-ph]').forEach(el => el.removeAttribute('data-ph'));
  c.querySelectorAll('.blk, .cell-sel, .slot-hi, .ph').forEach(el => { el.classList.remove('blk', 'cell-sel', 'slot-hi', 'ph', 'ph-m'); if (!el.className) el.removeAttribute('class'); });
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

/* 표 칸 여러 개 고르기(드래그 또는 Shift+클릭) → 병합 / 나누기 */
let cellSel = [], cellDrag = null;
const tCell = el => { const c = el && el.closest && el.closest('td,th'); return c && c.closest('table.t') && c.closest('#desk') ? c : null; };
function cellClear(){ document.querySelectorAll('.cell-sel').forEach(x => x.classList.remove('cell-sel')); cellSel = []; }
function cellRect(t, a, b){
  const g = grid(t); const [ar, ac] = pos(g, a), [br, bc] = pos(g, b);
  let r1 = Math.min(ar, br), r2 = Math.max(ar + a.rowSpan, br + b.rowSpan) - 1, c1 = Math.min(ac, bc), c2 = Math.max(ac + a.colSpan, bc + b.colSpan) - 1;
  for (let grow = true; grow;) {
    grow = false;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const x = g[r] && g[r][c]; if (!x) continue; const [xr, xc] = pos(g, x);
      if (xr < r1) { r1 = xr; grow = true; } if (xc < c1) { c1 = xc; grow = true; }
      if (xr + x.rowSpan - 1 > r2) { r2 = xr + x.rowSpan - 1; grow = true; } if (xc + x.colSpan - 1 > c2) { c2 = xc + x.colSpan - 1; grow = true; }
    }
  }
  const cells = []; for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const x = g[r] && g[r][c]; if (x && !cells.includes(x)) cells.push(x); }
  return {g, r1, r2, c1, c2, cells};
}
function cellSelect(a, b){ cellClear(); if (a === b) return; cellSel = cellRect(a.closest('table'), a, b).cells; cellSel.forEach(x => x.classList.add('cell-sel')); }
function mergeSel(){
  if (cellSel.length < 2) { toast('합칠 칸을 드래그해서 두 칸 이상 골라 주세요. (Shift+클릭도 돼요)'); return; }
  flushPend();
  const t = cellSel[0].closest('table'), {g, r1, r2, c1, c2, cells} = cellRect(t, cellSel[0], cellSel[cellSel.length - 1]);
  const o = g[r1][c1]; let w = 0;
  cells.forEach(x => {
    if (x === o) return;
    if (x.textContent.trim()) { if (o.textContent.trim()) o.appendChild(document.createElement('br')); while (x.firstChild) o.appendChild(x.firstChild); }
    if (x.parentNode === t.rows[0] && x.style.width) w += parseFloat(x.style.width) || 0;
    x.remove();
  });
  if (w && o.style.width) o.style.width = (parseFloat(o.style.width) + w) + 'px';
  o.colSpan = c2 - c1 + 1; o.rowSpan = r2 - r1 + 1;
  cellClear(); pushHist(); markDirty(); refreshThumbs(); showTT(o); toast('칸을 합쳤어요.');
}
function splitCell(){
  if (cellSel.length > 1) { cellSel.filter(x => x.colSpan > 1 || x.rowSpan > 1).forEach(x => { tblCell = x; splitCell(); }); cellClear(); return; }
  const o = tblCell; if (!o || (o.colSpan < 2 && o.rowSpan < 2)) { toast('합쳐진 칸을 눌러 주세요.'); return; }
  flushPend();
  const t = o.closest('table'), g = grid(t), [r0, c0] = pos(g, o), rs = o.rowSpan, cs = o.colSpan;
  const tag = o.tagName.toLowerCase(), w = o.parentNode === t.rows[0] && o.style.width ? parseFloat(o.style.width) / cs : 0;
  o.colSpan = 1; o.rowSpan = 1; if (w) o.style.width = w + 'px';
  for (let r = r0; r < r0 + rs; r++) {
    const row = t.rows[r]; if (!row) continue;
    for (let c = c0; c < c0 + cs; c++) {
      if (r === r0 && c === c0) continue;
      const n = blankLike(o, tag); n.classList.remove('cell-sel'); n.removeAttribute('colspan'); n.removeAttribute('rowspan'); if (w) n.style.width = w + 'px'; else n.style.removeProperty('width');
      let ref = null; for (const x of row.cells) { if (x !== o && !x.hasAttribute('data-new') && pos(g, x)[1] > c) { ref = x; break; } }
      n.setAttribute('data-new', ''); row.insertBefore(n, ref);
    }
  }
  t.querySelectorAll('[data-new]').forEach(x => x.removeAttribute('data-new'));
  pushHist(); markDirty(); refreshThumbs(); showTT(o); toast('칸을 나눴어요.');
}
function wireCells(desk){
  desk.addEventListener('mousedown', e => {
    const c = canWrite && editOn && e.button === 0 ? tCell(e.target) : null;
    if (c && e.shiftKey && tblCell && tblCell !== c && tblCell.closest('table') === c.closest('table')) { e.preventDefault(); cellSelect(tblCell, c); return; }
    if (!e.target.closest('#ftb')) cellClear();
    cellDrag = c ? {a: c, on: false} : null; if (c) ftbGhost(true);
  });
  desk.addEventListener('mousemove', e => {
    if (!cellDrag || !(e.buttons & 1)) return;
    const c = tCell(document.elementFromPoint(e.clientX, e.clientY));
    if (!c || c.closest('table') !== cellDrag.a.closest('table') || (c === cellDrag.a && !cellDrag.on)) return;
    if (!cellDrag.on) { cellDrag.on = true; desk.classList.add('blking'); }
    getSelection().removeAllRanges(); cellSelect(cellDrag.a, c);
  });
  if (window.__cellWired) return; window.__cellWired = true;
  document.addEventListener('mouseup', () => { if (cellDrag && cellDrag.on && cellDrag.a.isConnected) { const a = cellDrag.a; a.focus({preventScroll: true}); setTimeout(() => { if (a.isConnected) showTT(a); }, 30); } cellDrag = null; });
  document.addEventListener('keydown', e => {
    if (cellSel.length < 2) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); flushPend(); cellSel.forEach(x => { x.innerHTML = '<br>'; }); pushHist(); markDirty(); refreshThumbs(); }
    else if (e.key === 'Escape') cellClear();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); mergeSel(); }
    else if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) cellClear();
  }, true);
}


/* list lines: Enter adds the next number or bullet */
/* 1. 2. 3. · ①②③ (원문자, 20까지) · 말머리표 • · - ● ○ ■ □ ◦ ▪ ※ */
const NUM = /^(\s*)(\d+)\.(\s)/, CNUM = /^(\s*)([①-⑳])(\s?)/, BUL = /^(\s*)([•·\-●○■□◦▪※])(\s)/;
const MARK = /^\s*(?:\d+\.|[①-⑳]|[•·\-●○■□◦▪※])\s*/, MARK_ONLY = /^\s*(?:\d+\.|[①-⑳]|[•·\-●○■□◦▪※])?\s*$/;
const circ = n => String.fromCharCode(0x245F + Math.min(20, Math.max(1, n)));
function firstText(el){ const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.length) return n; return null; }
function listKind(txt){ let m = txt.match(NUM); if (m) return {k: 'n', n: +m[2]}; m = txt.match(CNUM); if (m) return {k: 'c', n: m[2].charCodeAt(0) - 0x245F}; return null; }
function renum(parent){
  let k = null, n = 0;
  for (const p of parent.children) {
    const t = p.tagName === 'P' ? firstText(p) : null, x = t && listKind(t.textContent);
    if (!x || x.k !== k) { k = x ? x.k : null; n = x ? x.n : 0; continue; }
    n++;
    if (k === 'n') t.textContent = t.textContent.replace(NUM, `$1${n}.$3`);
    else if (n <= 20) t.textContent = t.textContent.replace(CNUM, `$1${circ(n)}$3`);
  }
}
/* 툴바 목록 버튼: 줄 앞 표시를 바꾸거나 지움 (kind: 'n' | 'c' | 말머리표 글자 | '') */
function setListMark(el, kind){
  const prefix = kind === 'n' ? '1. ' : kind === 'c' ? '① ' : kind ? kind + ' ' : '';
  const t = firstText(el);
  if (t) t.textContent = prefix + t.textContent.replace(MARK, '');
  else if (prefix) el.prepend(document.createTextNode(prefix));
  if (el.parentNode) renum(el.parentNode);
  caretTo(el, true);
}
function caretTo(el, atEnd){ const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.focus(); }
function atStart(el){ const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return false; const r = document.createRange(); r.selectNodeContents(el); r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset); return !r.toString().trim() || MARK_ONLY.test(r.toString()); }
function splitPara(p){
  flushPend();
  const s = getSelection(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0); r.deleteContents();
  const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(p, p.childNodes.length);
  const frag = tail.extractContents();
  const t = firstText(p), txt = t ? t.textContent : '';
  const m = txt.match(NUM), c = txt.match(CNUM), b = txt.match(BUL);
  const np = p.cloneNode(false);
  const prefix = m ? `${m[1]}${+m[2] + 1}.\u00a0` : c ? `${c[1]}${circ(c[2].charCodeAt(0) - 0x245F + 1)}${c[3] ? '\u00a0' : ''}` : b ? `${b[1]}${b[2]}\u00a0` : '';
  np.appendChild(document.createTextNode(prefix)); np.appendChild(frag);
  if (!p.textContent.length) p.appendChild(document.createElement('br'));
  p.after(np);
  if (m || c) renum(p.parentNode);
  const tn = np.firstChild; const rr = document.createRange(); rr.setStart(tn, prefix.length); rr.collapse(true); s.removeAllRanges(); s.addRange(rr); np.focus(); if (typeof phUpdate === 'function') phUpdate();
  pushHist(); markDirty(); refreshThumbs();
}
function joinPrev(p){
  flushPend();
  const prev = p.previousElementSibling, parent = p.parentNode;
  p.remove(); renum(parent); caretTo(prev, true);
  pushHist(); markDirty(); refreshThumbs();
}


/* 기본정보: 계약서 안의 정해진 자리(계약일·당사자·공사명·공사기간·금액)를 자동으로 찾아 한 곳에서 채움.
   자리를 따로 넣을 필요 없이, 같은 항목은 계약서 어디에 있든 함께 바뀜 (머리 계약일 ↔ 서명란 날짜 등) */
const txtOf = el => el.textContent.replace(/\s+/g, ' ').trim();
const PARTY_LABELS = ['회사명', '업체명', '상호', '대표자', '연락처', '현장주소', '사업자주소', '주소', '계좌정보'];
const FP_GROUPS = [
  ['계약', ['계약일', '공사명', '공사장소', '착공일', '준공일', '총 공사금액']],
  ['발주자 (갑)', ['발주자', '발주자 대표자', '발주자 연락처', '발주자 현장주소', '발주자 사업자주소', '발주자 주소', '발주자 계좌정보']],
  ['시공사 (을)', ['시공사', '시공사 대표자', '시공사 연락처', '시공사 현장주소', '시공사 사업자주소', '시공사 주소', '시공사 계좌정보']]
];
const fpLabel = k => k === '발주자' || k === '시공사' ? '회사명' : k.replace(/^(발주자|시공사) /, '');
const fmtD = (dt, kind, sep, dot) => kind === 'ko' ? `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일`
  : sep && sep !== '.' ? `${dt.getFullYear()}${sep}${String(dt.getMonth() + 1).padStart(2, '0')}${sep}${String(dt.getDate()).padStart(2, '0')}`
  : `${dt.getFullYear()}. ${dt.getMonth() + 1}. ${dt.getDate()}${dot === false ? '' : '.'}`;
function korNum(n){
  n = Math.floor(Math.abs(n)); if (!n) return '영';
  const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'], S = ['', '십', '백', '천'], B = ['', '만', '억', '조'];
  let out = '', g = 0;
  while (n > 0) {
    const part = n % 10000; n = Math.floor(n / 10000);
    if (part) { let s = ''; String(part).padStart(4, '0').split('').forEach((c, i) => { const d = +c, u = 3 - i; if (d) s += (d === 1 && u > 0 ? '' : D[d]) + S[u]; }); out = s + B[g] + out; }
    g++;
  }
  return out;
}
function textSlot(key, el){ return {key, el, type: 'text', get: () => txtOf(el), set: v => { el.textContent = v; }}; }
function dateSlot(key, el, nth){
  return {key, el, nth, type: 'date',
    get: () => { const h = datesIn(el)[nth]; return h && h.y && h.m && h.d ? new Date(h.y, h.m - 1, h.d) : null; },
    set: dt => { const h = datesIn(el)[nth]; if (!h || !(dt instanceof Date)) return; const t = h.node.textContent; h.node.textContent = t.slice(0, h.start) + fmtD(dt, h.kind, h.sep, h.dot) + t.slice(h.end); }};
}
function introSlot(p, role){
  const re = new RegExp(`(^\\s*|\\)\\s*[와과]?\\s*|,\\s*)([^()“”"]+?)(\\s*\\(이하\\s*[“"]${role})`);
  const node = () => { const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (re.test(n.textContent)) return n; return null; };
  if (!node()) return null;
  return {key: role, el: p, type: 'text', get: () => { const n = node(); return n ? n.textContent.match(re)[2].trim() : ''; },
    set: v => { const n = node(); if (n) n.textContent = n.textContent.replace(re, (_, a, b, c) => a + (v.trim() || '○○○') + c); }};
}
function moneySlot(el, sec){
  return {key: '총 공사금액', el, type: 'money',
    get: () => { const m = el.textContent.match(/([\d,]+)\s*원/); return m ? m[1] : ''; },
    set: v => {
      const n = +String(v).replace(/[^\d]/g, '') || 0;
      el.textContent = el.textContent.replace(/[\d,]+(\s*원)/, n.toLocaleString('ko-KR') + '$1');
      const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) if (/일금\s*[^원()]*?\s*원정/.test(x.textContent)) x.textContent = x.textContent.replace(/일금\s*[^원()]*?\s*원정/, `일금 ${korNum(n)} 원정`);
      // 지급 비율 표의 금액도 함께 계산
      document.querySelectorAll('#desk table.t').forEach(t => {
        const head = [...(t.rows[0]?.cells || [])].map(c => txtOf(c)); const pi = head.findIndex(h => /비율/.test(h)), ai = head.findIndex(h => /금액/.test(h));
        if (pi < 0 || ai < 0) return;
        [...t.rows].slice(1).forEach(r => { const pc = r.cells[pi], ac = r.cells[ai]; const m = pc && pc.textContent.match(/(\d+(?:\.\d+)?)\s*%/); if (m && ac) ac.textContent = Math.round(n * +m[1] / 100).toLocaleString('ko-KR') + '원'; });
      });
    }};
}
function findSlots(){
  const S = [], push = s => { if (s) S.push(s); };
  document.querySelectorAll('#desk .pg').forEach(pg => {
    pg.querySelectorAll('header p').forEach(p => { if (/계약일/.test(p.textContent) && datesIn(p).length) push(dateSlot('계약일', p, 0)); });
    [...pg.children].forEach(ch => { if (ch.tagName === 'DIV' && ch.querySelectorAll('table').length >= 2) { const p = ch.querySelector(':scope > p'); if (p && datesIn(p).length) push(dateSlot('계약일', p, 0)); } });
    pg.querySelectorAll('table.t').forEach(t => {
      const g = grid(t); let role = null;
      [...t.rows].forEach((tr, ri) => {
        const rc = (g[ri] || []).find(c => c.tagName === 'TH' && /^(발주자|시공사|도급인|수급인)/.test(txtOf(c)));
        if (rc) role = /^(발주자|도급인)/.test(txtOf(rc)) ? '발주자' : '시공사';
        if (!role) return;
        const cells = [...tr.cells];
        cells.forEach((c, i) => {
          if (c.tagName !== 'TH' || !PARTY_LABELS.includes(txtOf(c))) return;
          const v = cells[i + 1]; if (!v || v.tagName !== 'TD' || /\(인\)/.test(v.textContent)) return;
          push(textSlot(['회사명', '업체명', '상호'].includes(txtOf(c)) ? role : `${role} ${txtOf(c)}`, v));
        });
      });
    });
    pg.querySelectorAll('p').forEach(p => { if (!p.closest('table') && /\(이하\s*[“"](발주자|시공사)/.test(p.textContent)) ['발주자', '시공사'].forEach(r => push(introSlot(p, r))); });
    pg.querySelectorAll('.kv').forEach(kv => { const s = kv.querySelector(':scope > strong'); const p = kv.querySelector(':scope > p'); if (s && p && /공사명/.test(s.textContent)) push(textSlot('공사명', p)); });
    pg.querySelectorAll('section.art').forEach(sec => {
      const h = sec.querySelector('h2 .tt') || sec.querySelector('h2'); if (!h) return; const t = txtOf(h);
      const firstP = () => sec.querySelector(':scope > p, :scope > div > p');
      if (/^공사명$/.test(t.replace(/\s/g, '')) && firstP()) push(textSlot('공사명', firstP()));
      if (/^(공사장소|공사현장|현장주소|공사위치)$/.test(t.replace(/\s/g, '')) && firstP()) push(textSlot('공사장소', firstP()));
      if (/착공/.test(t) && !/공사기간/.test(t)) { const p = [...sec.querySelectorAll('p')].find(x => datesIn(x).length); if (p) push(dateSlot('착공일', p, 0)); }
      if (/준공/.test(t) && !/공사기간/.test(t)) { const p = [...sec.querySelectorAll('p')].find(x => datesIn(x).length); if (p) push(dateSlot('준공일', p, 0)); }
      if (/공사기간/.test(t)) { const p = [...sec.querySelectorAll('p')].find(x => datesIn(x).length); if (p) { push(dateSlot('착공일', p, 0)); if (datesIn(p).length > 1) push(dateSlot('준공일', p, 1)); } }
      if (/공사금액|계약금액/.test(t)) { const el = [...sec.querySelectorAll('span,p,strong,td')].find(x => !x.children.length && /금\s*[\d,]+\s*원/.test(x.textContent)); if (el) push(moneySlot(el, sec)); }
    });
  });
  document.querySelectorAll('#desk .amt').forEach(el => { if (!S.some(x => x.el === el)) push(moneySlot(el, el.closest('section.art') || el.parentElement)); });
  // 예전에 넣은 칸(.fld)도 같은 항목으로
  document.querySelectorAll('#desk .fld').forEach(f => push(textSlot(f.dataset.k, f)));
  return S;
}
function setKey(key, v, skipEl){
  flushPend();
  const ss = findSlots().filter(s => s.key === key);
  ss.forEach(s => { if (s.el === skipEl) return; if (s.type === 'text' && v instanceof Date) s.set(fmtD(v, 'dot')); else s.set(v); });
  // 공사기간 '총 N일' 다시 계산
  if (key === '착공일' || key === '준공일') {
    const a = findSlots().find(s => s.key === '착공일'), b = findSlots().find(s => s.key === '준공일');
    const da = a && a.get(), db = b && b.get();
    if (da && db && a.el === b.el) { const n = Math.round((db - da) / 864e5) + 1; const w = document.createTreeWalker(a.el.parentElement || a.el, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) if (/총\s*\d+\s*일/.test(x.textContent) && n > 0) x.textContent = x.textContent.replace(/총\s*\d+\s*일/, `총 ${n}일`); }
  }
  markDirty(); refreshThumbs(); clearTimeout(fpTimer); fpTimer = setTimeout(pushHist, 500);
  return ss.length;
}
/* 달력에서 고른 날짜가 계약일 같은 항목이면, 같은 항목 다른 자리도 함께 */
function dateKeyAt(el, hit){
  const s = findSlots().find(s => s.type === 'date' && (s.el === el || s.el.contains(el) || el.contains(s.el)) && (() => { const h = datesIn(s.el)[s.nth]; return h && h.node === hit.node && h.start === hit.start; })());
  return s ? s.key : null;
}

/* ---- 패널: 쪽 목록 옆에 붙어 있고, 접기·펴기, 머리를 끌어서 떼어 옮기기 ---- */
let fpTimer = null, fpSig = '', fpObs = null;
const fpPref = (k, d) => { try { const v = localStorage.getItem('opk-fp-' + k); return v === null ? d : v; } catch { return d; } };
const fpSave = (k, v) => { try { localStorage.setItem('opk-fp-' + k, v); } catch {} };
const escA = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function slotLoc(x){
  const el = x.el; if (el.closest('header')) return '머리';
  const sec = el.closest('section.art'); if (sec) { const no = sec.querySelector('h2 .no') || sec.querySelector('h2 span'); return no ? txtOf(no) : '조항'; }
  const sig = [...(el.closest('.pg')?.children || [])].find(ch => ch.tagName === 'DIV' && ch.querySelectorAll('table').length >= 2 && ch.contains(el)); if (sig) return '서명란';
  return el.tagName === 'P' && el.parentElement?.classList.contains('pg') ? '전문' : '본문';
}
function fpRow(key, s){
  const lab = escA(fpLabel(key)), seen = new Map(); s.forEach((x, i) => { const l = slotLoc(x); if (!seen.has(l)) seen.set(l, i); });
  const cnt = `<span class="fp-locs">${[...seen].map(([l, i]) => `<button type="button" class="fp-loc" data-k="${escA(key)}" data-i="${i}" title="계약서에서 보기">${escA(l)}</button>`).join('')}</span>`;
  if (s[0].type === 'date') { const d = s[0].get(); return `<div class="fp-row" data-k="${escA(key)}"><label><span>${lab}</span>${cnt}</label><button type="button" class="fp-in fp-date" data-k="${escA(key)}">${d ? fmtD(d, 'dot') : '<em>날짜 고르기</em>'}<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4"/></svg></button></div>`; }
  const v = s[0].get(), money = s[0].type === 'money';
  return `<div class="fp-row" data-k="${escA(key)}"><label><span>${lab}</span>${cnt}</label><input class="fp-in" data-k="${escA(key)}"${money ? ' inputmode="numeric"' : ''} value="${escA(v)}" aria-label="${lab}">${money ? '<i class="fp-unit">원</i>' : ''}</div>`;
}
function renderFP(){
  const p = $('#fp'); if (!p || p.hidden) return;
  const slots = findSlots(), by = new Map(); slots.forEach(s => { if (!by.has(s.key)) by.set(s.key, []); by.get(s.key).push(s); });
  const known = new Set(FP_GROUPS.flatMap(g => g[1])), extra = [...by.keys()].filter(k => !known.has(k));
  const groups = [...FP_GROUPS, ['기타', extra]].map(([g, ks]) => [g, ks.filter(k => by.has(k))]).filter(([, ks]) => ks.length);
  fpSig = [...by.keys()].join('|');
  p.querySelector('.fp-list').innerHTML = groups.length
    ? groups.map(([g, ks]) => `<div class="fp-g"><h3>${escA(g)}</h3>${ks.map(k => fpRow(k, by.get(k))).join('')}</div>`).join('')
    : '<p class="fp-empty">이 계약서에서 계약일·당사자·공사명 같은 자리를 찾지 못했어요.</p>';
}
function refreshFP(){
  const p = $('#fp'); if (!p || p.hidden || p.classList.contains('min')) return;
  const slots = findSlots(); const sig = [...new Set(slots.map(s => s.key))].join('|');
  if (sig !== fpSig) { const a = document.activeElement; if (a && a.closest && a.closest('#fp .fp-in')) return; renderFP(); return; }
  p.querySelectorAll('.fp-row').forEach(r => {
    const k = r.dataset.k, s = slots.find(x => x.key === k); if (!s) return; const i = r.querySelector('.fp-in');
    if (s.type === 'date') { const d = s.get(); const t = d ? fmtD(d, 'dot') : ''; if (i.firstChild && i.firstChild.textContent !== (t || '날짜 고르기')) { i.firstChild.replaceWith(d ? document.createTextNode(t) : Object.assign(document.createElement('em'), {textContent: '날짜 고르기'})); } }
    else if (i !== document.activeElement && i.value !== s.get()) i.value = s.get();
  });
}
function fpPlace(){
  const p = $('#fp'), ed = p && p.closest('.ed'); if (!p || !ed) return;
  const float = p.classList.contains('float'), on = !p.hidden;
  ed.classList.toggle('fp-on', on && !float); ed.classList.toggle('fp-min', on && !float && p.classList.contains('min'));
  if (float) { const x = +fpPref('x', 200), y = +fpPref('y', 140); p.style.left = Math.max(8, Math.min(x, innerWidth - p.offsetWidth - 8)) + 'px'; p.style.top = Math.max(8, Math.min(y, innerHeight - 60)) + 'px'; }
  else { p.style.left = ''; p.style.top = ''; }
}
function openFP(){
  if (!canWrite || !editOn) { toast('편집을 켜면 기본정보를 채울 수 있어요.'); return; }
  const p = $('#fp'); if (!p) return;
  if (!p.dataset.wired) {
    p.dataset.wired = '1';
    p.innerHTML = `<div class="fp-h" title="끌어서 옮길 수 있어요"><svg class="fp-grip" viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/><circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/><circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/></svg><b>기본정보</b>
      <button type="button" class="fp-b fp-dock" title="쪽 목록 옆에 붙이기" aria-label="옆에 붙이기"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M8 4v12"/></svg></button>
      <button type="button" class="fp-b fp-min" title="접기 / 펴기" aria-label="접기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 5 7.5 10l5 5"/></svg></button>
      <button type="button" class="fp-b fp-x" title="닫기" aria-label="닫기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg></button></div>
      <p class="fp-help">여기 적으면 계약서의 같은 자리가 모두 함께 바뀌어요. 날짜는 눌러서 고르면 끝.</p>
      <div class="fp-list"></div>`;
    p.addEventListener('input', e => {
      const i = e.target.closest('input.fp-in'); if (!i) return; const k = i.dataset.k;
      if (i.inputMode === 'numeric') { const n = +i.value.replace(/[^\d]/g, ''); i.value = n ? n.toLocaleString('ko-KR') : ''; }
      const n = setKey(k, i.value); const sm = i.closest('.fp-row').querySelector('small'); if (sm) sm.textContent = n > 1 ? n + '곳' : '';
    });
    p.addEventListener('click', e => {
      const d = e.target.closest('.fp-date');
      if (d) { const k = d.dataset.k, s = findSlots().find(x => x.key === k); openCal(null, {anchor: d, sel: s && s.get(), cb: dt => { setKey(k, dt); refreshFP(); toast(`${fpLabel(k)}: ${fmtD(dt, 'dot')} — 계약서 ${findSlots().filter(x => x.key === k).length}곳에 넣었어요.`); }}); return; }
      const lc = e.target.closest('.fp-loc'); if (lc) { const x = findSlots().filter(y => y.key === lc.dataset.k)[+lc.dataset.i]; if (x) { x.el.scrollIntoView({block: 'center', behavior: 'smooth'}); x.el.classList.add('slot-hi'); setTimeout(() => x.el.classList.remove('slot-hi'), 1400); } return; }
      if (e.target.closest('.fp-x')) { closeFP(); fpSave('open', '0'); return; }
      if (e.target.closest('.fp-min')) { p.classList.toggle('min'); fpSave('min', p.classList.contains('min') ? '1' : '0'); fpPlace(); if (!p.classList.contains('min')) renderFP(); return; }
      if (e.target.closest('.fp-dock')) { p.classList.remove('float'); fpSave('float', '0'); fpPlace(); return; }
      if (p.classList.contains('min') && e.target.closest('.fp-h') && !p.classList.contains('float')) { p.classList.remove('min'); fpSave('min', '0'); fpPlace(); renderFP(); }
    });
    // 머리를 끌면 떼어서 원하는 곳으로
    p.querySelector('.fp-h').addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const r = p.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top; let moved = false;
      const mv = ev => {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 6) return;
        if (!moved) { moved = true; p.classList.add('float'); p.classList.remove('min'); fpPlace(); }
        const x = Math.max(8, Math.min(ev.clientX - ox, innerWidth - p.offsetWidth - 8)), y = Math.max(8, Math.min(ev.clientY - oy, innerHeight - 60));
        p.style.left = x + 'px'; p.style.top = y + 'px';
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { fpSave('float', '1'); fpSave('x', parseInt(p.style.left)); fpSave('y', parseInt(p.style.top)); renderFP(); } };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  }
  p.hidden = false; p.classList.toggle('float', fpPref('float', '0') === '1'); p.classList.toggle('min', fpPref('min', '0') === '1');
  $('#fpb')?.setAttribute('aria-pressed', 'true'); fpSave('open', '1'); fpPlace(); renderFP();
  if (!fpObs) { fpObs = new MutationObserver(() => { clearTimeout(fpObs.t); fpObs.t = setTimeout(refreshFP, 250); }); }
  fpObs.disconnect(); const desk = $('#desk'); if (desk) fpObs.observe(desk, {childList: true, subtree: true, characterData: true});
}
function closeFP(){ const p = $('#fp'); if (p) p.hidden = true; $('#fpb')?.setAttribute('aria-pressed', 'false'); fpObs?.disconnect(); fpPlace(); const ed = $('.ed'); if (ed) ed.classList.remove('fp-on', 'fp-min'); }
function wireFld(desk){
  desk.addEventListener('click', e => { const f = e.target.closest('.fld'); if (f && canWrite && editOn) { if ($('#fp')?.hidden) openFP(); const i = $(`#fp .fp-in[data-k="${CSS.escape(f.dataset.k)}"]`); i?.focus(); } });
}
/* 쪽 목록(슬라이드처럼 보이는 왼쪽 썸네일) 접기·펴기 */
function sideToggle(force){
  const ed = $('.ed'); if (!ed) return; const off = force != null ? force : !ed.classList.contains('side-off');
  ed.classList.toggle('side-off', off); try { localStorage.setItem('opk-side-off', off ? '1' : '0'); } catch {}
  const b = $('#sideTg'); if (b) { b.setAttribute('aria-expanded', String(!off)); b.title = off ? '쪽 목록 펴기' : '쪽 목록 접기'; }
}
if (!window.__sideWired) { window.__sideWired = true; document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#sideTg')) sideToggle(); }); }


/* ---- 노션처럼 블록 넣기: 줄 왼쪽 + 버튼, 빈 줄에서 "/", 조항 빈 곳 클릭 → 새 줄 ---- */
const BM_GROUPS = [['기본', ['text']], ['목록', ['num', 'circ', 'bul']], ['구조', ['kv', 'table']], ['강조', ['amount', 'note']], ['조항', ['sec']]];
const BM_ITEMS = [
  ['text', '텍스트', '보통 문단', '텍스트 글 문단 text', 'M4 6h12M4 10h12M4 14h8', () => '<p>내용</p>'],
  ['num', '번호 목록', '1. 2. 3.', '번호 숫자 목록 1 list', 'M8 6h9M8 10h9M8 14h9M3.5 5.5h1v2M3 9.5h2l-2 2h2', () => '<div><p class="li">1. 내용</p></div>'],
  ['circ', '원문자 목록', '① ② ③', '원문자 동그라미 번호 ①', '', () => '<div><p class="li">① 내용</p></div>', '①'],
  ['bul', '말머리표 목록', '• 항목', '말머리 글머리 점 bullet •', '', () => '<div><p class="li">• 내용</p></div>', '•'],
  ['kv', '2단 (항목 · 내용)', '왼쪽 항목, 오른쪽 내용 — 공사내용처럼', '2단 두단 항목 내용 kv 공사내용', 'M3 5h4M3 10h4M3 15h4M10 5h7M10 10h7M10 15h5', () => blockHTML({type: 'kv', rows: [['항목', '내용'], ['항목', '내용']]})],
  ['table', '표', '3줄 표', '표 테이블 table', 'M3 4h14v12H3zM3 8h14M3 12h14M8 4v12', () => newTable().outerHTML],
  ['amount', '금액 박스', '총 공사금액 — 기본정보와 연결', '금액 돈 공사금액 amount', 'M3 6h14v8H3zM10 8.5v3M8.5 9.5h3', () => blockHTML({type: 'amount', label: '총 공사금액', value: '금 0원', note: '(일금 영 원정 · 부가세 포함)'})],
  ['note', '안내 박스', '초록 배경으로 강조한 문단', '안내 강조 박스 note', 'M4 4h12v12H4zM7 8h6M7 11h4', () => blockHTML({type: 'note', text: '안내 문구'})],
  ['sec', '새 조항', '이 조항 아래에 제N조 하나 더', '조항 조 섹션 section', 'M4 5h12M4 10h12M4 15h7M14 13v4M12 15h4', null]
];
const BM_HINT = '‘/’ 를 누르면 블록 메뉴';
let bmCtx = null, bmIdx = 0, plusLine = null, plusTimer = null;
const isBox = el => el.tagName !== 'DIV' || el.classList.contains('kv') || /background/.test(el.getAttribute('style') || '');
/* 조항의 내용 칸(오른쪽 열). 블록이 하나뿐이면 묶음 div 로 감싸서 여러 블록이 같은 칸에 쌓이게 */
function secBody(sec){
  let body = [...sec.children].find(c => c.tagName !== 'H2');
  if (!body) { body = document.createElement('div'); sec.appendChild(body); }
  if (isBox(body)) { const w = document.createElement('div'); w.setAttribute('style', 'display: flex; flex-direction: column; gap: 6px'); body.replaceWith(w); w.appendChild(body); body = w; }
  [...sec.children].filter(c => c.tagName !== 'H2' && c !== body).forEach(c => body.appendChild(c)); // 칸 밖으로 빠진 블록은 안으로
  return body;
}
/* 새 블록 놓을 자리: {parent, after} */
function bmSpot(line){
  const sec = line.closest('section.art');
  if (sec) {
    const body = secBody(sec);
    if (!body.contains(line)) return {parent: body, after: null, first: true};  // 제목 줄에서 → 내용 맨 앞
    let el = line; while (el.parentElement !== body) el = el.parentElement;
    return {parent: body, after: el};
  }
  const pg = line.closest('.pg'); let el = line; while (el.parentElement && el.parentElement !== pg) el = el.parentElement;
  return {parent: pg, after: el};
}
function bmPlace(el, spot){ if (spot.first) spot.parent.prepend(el); else spot.after.after(el); }
/* 빈 줄 하나 만들기 (조항 빈 곳 클릭 / 텍스트 블록) */
function blankLine(){ const p = document.createElement('p'); p.appendChild(document.createElement('br')); p.setAttribute('contenteditable', 'true'); p.setAttribute('data-ed', ''); p.spellcheck = false; return p; }
function bmList(){
  const q = (bmCtx?.q || '').trim().toLowerCase();
  return BM_GROUPS.flatMap(([g, ids]) => ids.map(id => BM_ITEMS.find(x => x[0] === id)).filter(it => !q || (it[1] + ' ' + it[3]).toLowerCase().includes(q)).map(it => ({g, it})));
}
function bmRender(keepInput){
  const m = $('#bm'); if (!m || !bmCtx) return; const list = bmList(); if (bmIdx >= list.length) bmIdx = Math.max(0, list.length - 1);
  const inp = m.querySelector('.bm-q');
  if (!keepInput) { inp.value = bmCtx.slash ? '/' + (bmCtx.q || '') : (bmCtx.q || ''); inp.readOnly = !!bmCtx.slash; }
  let html = '', lastG = null;
  list.forEach(({g, it}, i) => {
    if (g !== lastG) { html += `<div class="bm-g">${g}</div>`; lastG = g; }
    html += `<button type="button" class="bm-i${i === bmIdx ? ' on' : ''}" data-b="${it[0]}" role="option" aria-selected="${i === bmIdx}"><span class="bm-ic">${it[6] ? `<b>${it[6]}</b>` : `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${it[4]}"/></svg>`}</span><span class="bm-t"><b>${it[1]}</b><small>${it[2]}</small></span></button>`;
  });
  m.querySelector('.bm-list').innerHTML = html || '<p class="bm-none">맞는 블록이 없어요</p>';
  m.querySelector('.bm-i.on')?.scrollIntoView({block: 'nearest'});
}
function bmOpen(line, anchorRect, q, slash){
  let m = $('#bm');
  if (!m) {
    m = document.createElement('div'); m.id = 'bm'; m.className = 'bm'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', '블록 넣기');
    m.innerHTML = '<label class="bm-s"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.3 3.3"/></svg><input class="bm-q" placeholder="블록 찾기 (예: 표, 금액, 2단)" aria-label="블록 찾기" autocomplete="off"></label><div class="bm-list" role="listbox"></div><div class="bm-foot">↑↓ 고르기 · Enter 넣기 · Esc 닫기</div>';
    ($('#ftb')?.parentElement || document.body).appendChild(m);
    m.addEventListener('mousedown', e => { if (!e.target.closest('.bm-q')) e.preventDefault(); });
    m.addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (b) bmChoose(b.dataset.b); });
    m.addEventListener('mousemove', e => { const b = e.target.closest('[data-b]'); if (!b) return; const i = bmList().findIndex(x => x.it[0] === b.dataset.b); if (i !== bmIdx) { bmIdx = i; m.querySelectorAll('.bm-i').forEach((x, j) => x.classList.toggle('on', j === i)); } });
    m.querySelector('.bm-q').addEventListener('input', e => { if (!bmCtx || bmCtx.slash) return; bmCtx.q = e.target.value; bmIdx = 0; bmRender(true); });
  }
  const fresh = !bmCtx || bmCtx.line !== line; bmCtx = {line, q, slash}; if (fresh) bmIdx = 0;
  bmRender(); m.hidden = false; if (typeof hideFTB === 'function') hideFTB();
  let top = anchorRect.bottom + 4; if (top + m.offsetHeight > innerHeight - 8) top = Math.max(8, anchorRect.top - m.offsetHeight - 4);
  m.style.top = top + 'px'; m.style.left = Math.max(8, Math.min(anchorRect.left, innerWidth - m.offsetWidth - 8)) + 'px';
  if (!slash && fresh) setTimeout(() => m.querySelector('.bm-q').focus(), 0);
}
function bmClose(){ const m = $('#bm'); if (m) m.hidden = true; bmCtx = null; }
function bmChoose(key){
  if (!bmCtx) return; const {line, slash} = bmCtx; bmClose(); if (!line || !line.isConnected) return;
  const it = BM_ITEMS.find(x => x[0] === key); if (!it) return;
  // "/표" 처럼 친 글자는 지우고, 그 줄이 비면(번호만 남아도) 그 자리를 블록으로
  if (slash) { const t = firstText(line); if (t) t.textContent = t.textContent.replace(/\/[^\s/]*\s*$/, ''); }
  const emptyLine = line.tagName === 'P' && MARK_ONLY.test(line.textContent);
  if (key === 'sec') {
    const sec = line.closest('section.art') || [...document.querySelectorAll('#desk section.art')].pop(); if (!sec) return; let ns;
    structOp(() => { ns = emptySection(sec); sec.after(ns); if (emptyLine && line.closest('section.art') && secBody(sec).children.length > 1) line.remove(); }, '새 조항을 넣었어요.');
    if (ns) bmFocus(ns.querySelector('h2 .tt') || ns.querySelector('h2')); return;
  }
  let el = null;
  structOp(() => {
    const w = document.createElement('div'); w.innerHTML = it[5](); el = w.firstElementChild; if (!el) return false;
    const spot = bmSpot(line);
    bmPlace(el, spot);
    if (emptyLine) { const box = line.parentElement; line.remove(); if (box && box !== spot.parent && box.tagName === 'DIV' && !box.children.length) box.remove(); }
  }, `${it[1]}를 넣었어요.`);
  if (el) bmFocus(el.matches('[data-ed]') ? el : el.querySelector('[data-ed]'));
}
function bmFocus(f){ if (!f) return; f.focus(); const r = document.createRange(); r.selectNodeContents(f); const s = getSelection(); s.removeAllRanges(); s.addRange(r); f.scrollIntoView({block: 'nearest', behavior: 'smooth'}); }
/* 빈 줄 안내: 커서가 있는 빈 줄에 흐린 글씨 */
function phUpdate(){
  document.querySelectorAll('#desk .ph').forEach(p => { if (p !== document.activeElement || !MARK_ONLY.test(p.textContent)) p.classList.remove('ph', 'ph-m'); });
  const a = document.activeElement; if (a && a.matches && a.matches('#desk p[data-ed]') && !a.closest('td,th') && MARK_ONLY.test(a.textContent)) { a.classList.add('ph'); a.classList.toggle('ph-m', !!a.textContent.trim()); a.dataset.ph = BM_HINT; }
}
function wireBm(desk){
  let plus = $('#bplus');
  if (!plus) {
    plus = document.createElement('button'); plus.type = 'button'; plus.id = 'bplus'; plus.className = 'bplus'; plus.hidden = true;
    plus.title = '아래에 블록 넣기 (빈 줄에서 / 를 쳐도 돼요)'; plus.setAttribute('aria-label', '블록 넣기');
    plus.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11"/></svg>';
    ($('#ftb')?.parentElement || document.body).appendChild(plus);
    plus.addEventListener('mousedown', e => e.preventDefault());
    plus.addEventListener('click', () => { if (!plusLine) return; const r = plus.getBoundingClientRect(); bmOpen(plusLine, r, '', false); });
    plus.addEventListener('mouseenter', () => clearTimeout(plusTimer));
  }
  desk.addEventListener('mousemove', e => {
    if (!editOn || !canWrite || e.buttons) return;
    const ed = e.target.closest && e.target.closest('[data-ed]'); if (!ed || ed.closest('td,th')) return;
    clearTimeout(plusTimer); plusLine = ed;
    const r = ed.getBoundingClientRect(), pg = ed.closest('.pg')?.getBoundingClientRect();
    plus.style.top = (r.top + Math.min(r.height, 22) / 2 - 11) + 'px'; plus.style.left = Math.max(4, (pg ? pg.left + 14 : r.left - 28)) + 'px'; plus.hidden = false;
  });
  desk.addEventListener('mouseleave', () => { plusTimer = setTimeout(() => { if (!bmCtx) plus.hidden = true; }, 250); });
  // 조항 빈 곳(내용 칸 아래 여백 등)을 누르면 맨 끝에 새 줄
  desk.addEventListener('click', e => {
    if (!editOn || !canWrite || e.target.closest('[data-ed], button, table, .fld, header')) return;
    let sec = e.target.closest('section.art');
    if (!sec) { // 조항 아래 빈 종이를 눌렀으면 바로 위 조항 끝에 이어 쓰기 (서명란·쪽 번호 쪽은 제외)
      const pg = e.target.closest('.pg'); if (!pg) return;
      const sig = [...pg.children].find(ch => ch.tagName === 'DIV' && ch.querySelectorAll('table').length >= 2);
      if (sig && e.clientY >= sig.getBoundingClientRect().top - 4) return;
      sec = [...pg.querySelectorAll(':scope > section.art')].filter(s => s.getBoundingClientRect().top < e.clientY).pop(); if (!sec) return;
    }
    const body = secBody(sec), last = body.lastElementChild;
    if (last && last.tagName === 'P' && MARK_ONLY.test(last.textContent)) { last.focus(); phUpdate(); return; }
    flushPend(); const p = blankLine(); body.appendChild(p); pushHist(); markDirty(); p.focus(); phUpdate();
  });
  desk.addEventListener('focusin', phUpdate); desk.addEventListener('focusout', () => setTimeout(phUpdate, 0)); desk.addEventListener('input', phUpdate);
  // 빈 줄에서 / 치면 메뉴, 뒤에 글자를 치면 거르기
  desk.addEventListener('input', () => {
    const s = getSelection(); if (!s.rangeCount) return; const n = s.getRangeAt(0).startContainer; const line = (n.nodeType === 1 ? n : n.parentElement)?.closest('[data-ed]');
    const m = line && line.tagName === 'P' && line.textContent.match(/^\s*(?:\d+\.|[①-⑳]|[•·\-●○■□◦▪※])?\s*\/([^\s/]{0,12})$/);
    if (m) { const r = s.getRangeAt(0).getBoundingClientRect(); bmOpen(line, r.width || r.height ? r : line.getBoundingClientRect(), m[1], true); }
    else if (bmCtx && bmCtx.slash) bmClose();
  });
  if (window.__bmWired) return; window.__bmWired = true;
  document.addEventListener('keydown', e => {
    if (!bmCtx || $('#bm')?.hidden) return; const list = bmList();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); bmIdx = (bmIdx + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % Math.max(1, list.length); bmRender(true); }
    else if (e.key === 'Enter' && !e.isComposing) { if (!list.length) return; e.preventDefault(); e.stopPropagation(); bmChoose(list[bmIdx].it[0]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const l = bmCtx.line; bmClose(); if (l && l.isConnected) l.focus(); }
  }, true);
  document.addEventListener('mousedown', e => { if (bmCtx && !e.target.closest('#bm') && !e.target.closest('#bplus')) bmClose(); }, true);
}


/* 블록 선택: 여러 줄을 드래그해서 고르고 Delete / Backspace 로 한꺼번에 지우기 */
let blkSel = [], blkDrag = null;
/* 드래그하는 동안 떠 있는 툴바가 아래 줄을 가리지 않게 잠깐 투명·통과 */
function ftbGhost(on){ const b = document.querySelector('#ftb'); if (b) { b.style.pointerEvents = on ? 'none' : ''; b.style.opacity = on ? '0' : ''; } }
const isLine = el => !!el && el.tagName === 'P' && el.hasAttribute('data-ed') && !el.closest('td,th');
function blkClear(){ blkSel.forEach(p => p.classList.remove('blk')); blkSel = []; }
function blkSet(a, b){
  const all = [...document.querySelectorAll('#desk [data-ed]')].filter(isLine);
  let i = all.indexOf(a), j = all.indexOf(b); if (i < 0 || j < 0) return; if (i > j) [i, j] = [j, i];
  blkClear(); blkSel = all.slice(i, j + 1); blkSel.forEach(p => p.classList.add('blk'));
}
function blkDelete(){
  flushPend(); const n = blkSel.length, parents = new Set(blkSel.map(p => p.parentNode));
  blkSel.forEach(p => p.remove()); blkSel = [];
  parents.forEach(pr => { if (pr.isConnected) renum(pr); });
  pushHist(); markDirty(); refreshThumbs(); toast(`${n}줄을 지웠어요. Ctrl+Z 로 되돌릴 수 있어요.`);
}
function wireBlk(desk){
  desk.addEventListener('mousedown', e => {
    blkClear(); blkDrag = null;
    if (e.button !== 0 || e.altKey || !editOn || !canWrite) return;
    const p = e.target.closest && e.target.closest('[data-ed]');
    if (isLine(p)) { blkDrag = {start: p, on: false}; ftbGhost(true); }
  });
  desk.addEventListener('mousemove', e => {
    if (!blkDrag || !(e.buttons & 1)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), p = el && el.closest && el.closest('[data-ed]');
    if (!isLine(p) || (p === blkDrag.start && !blkDrag.on)) return;
    if (!blkDrag.on) { blkDrag.on = true; desk.classList.add('blking'); document.activeElement?.blur?.(); }
    getSelection().removeAllRanges(); blkSet(blkDrag.start, p);
  });
  if (window.__blkWired) return; window.__blkWired = true;
  document.addEventListener('mouseup', () => { blkDrag = null; ftbGhost(false); document.querySelectorAll('.blking').forEach(d => d.classList.remove('blking')); });
  document.addEventListener('keydown', e => {
    if (!blkSel.length) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); if (blkSel[0].isConnected) blkDelete(); else blkSel = []; }
    else if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) blkClear();
  }, true);
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
  if (!on) closeFP(); else if (fpPref('open', '1') === '1') openFP();
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
  side.innerHTML = '<button type="button" class="side-tg" id="sideTg" aria-expanded="true" title="쪽 목록 접기" aria-label="쪽 목록 접기·펴기"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M8 4v12"/></svg></button>' + pages.map((p, i) => `<button class="tp" data-i="${i}" aria-label="${i+1}쪽으로"><span class="tbox" inert>${sanitizePage(p)}</span><span class="tn">${i+1}</span></button>`).join('') + (canWrite && editOn ? '<button class="btn addpg" id="addpg">+ 쪽 추가</button>' : '');
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
    <button class="btn" id="fpb" aria-pressed="false" title="기본정보 — 한 번 적으면 계약서의 같은 칸이 모두 채워져요"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h7"/><path d="M15 17h5" stroke-dasharray="2 2"/></svg>기본정보</button>
    <button class="btn icon" id="findb" title="찾기 (Ctrl+F)" aria-label="찾기"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
    <button class="btn icon ghost" id="keys" title="단축키" aria-label="단축키 보기">?</button>
  </div>
  <div class="ed">
    <nav class="side" id="side" aria-label="쪽 목록"></nav>
    <aside class="fp" id="fp" hidden aria-label="기본정보"></aside>
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
    if (e.key === 'Backspace' && ed.tagName === 'P' && atStart(ed) && ed.previousElementSibling?.tagName === 'P' && MARK_ONLY.test(ed.textContent)) { e.preventDefault(); joinPrev(ed); }
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
  wireBlk(desk); wireCells(desk); wireFld(desk); wireBm(desk);
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
  $('#fpb').onclick = () => { if ($('#fp') && !$('#fp').hidden) closeFP(); else openFP(); };
  closeFP(); try { if (localStorage.getItem('opk-side-off') === '1') sideToggle(true); } catch {}
  setTimeout(() => { if (canWrite && editOn && fpPref('open', '1') === '1') openFP(); }, 0);
  const sb = $('#save'); if (sb) sb.onclick = save;
  const ub = $('#undo'); if (ub) ub.onclick = undo; const rb = $('#redo'); if (rb) rb.onclick = redo;
  $('#keys').onclick = () => ask('단축키', 'Enter  번호(1. ①)·말머리표(● ○ •) 다음 줄 추가\n여러 줄 드래그 → Delete  고른 줄 한꺼번에 지우기\n표 칸 드래그 / Shift+클릭  칸 고르기 → Ctrl+M 합치기\n날짜 글자 두 번 클릭  달력에서 날짜 고르기\nCtrl+C (선택 없이)  줄 전체 복사\nCtrl+V  복사한 줄을 아래에 붙이기\nCtrl+D 또는 Alt+클릭  줄 복제\nShift+Enter  같은 칸 안에서 줄바꿈\nBackspace  빈 번호 줄 지우기\nCtrl+Z  되돌리기\nCtrl+Shift+Z / Ctrl+Y  다시 하기\nCtrl+F  계약서 안에서 찾기\nCtrl+S  저장\nCtrl+B  굵게\nEsc  편집 끝내기\nCtrl+E  편집 켜기/끄기\nAlt+↑ / Alt+↓  이전·다음 쪽\nCtrl+Shift+E  PDF로 내보내기\n(Mac은 Ctrl 대신 ⌘)', [['닫기', true, 'pri']]);
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
