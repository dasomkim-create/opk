/* ---------- languages ---------- */
const LANGS = [['ko', '한국어', '한'], ['en', 'English', 'EN'], ['zh', '中文', '中']];
const LK = {ko: 'pages', en: 'en', zh: 'zh'};
let lang = 'ko';
const hasLang = (c, l) => !!c && Array.isArray(c[LK[l]]) && c[LK[l]].length > 0;
function langTags(c){ const h = LANGS.filter(([l]) => hasLang(c, l)); return h.length > 1 ? ' · ' + h.map(x => x[2]).join(' ') : ''; }
function updLang(){
  const g = $('#lang'); if (!g) return;
  g.querySelectorAll('[data-lg]').forEach(b => { const l = b.dataset.lg, has = hasLang(cur, l) || l === lang; b.classList.toggle('on', l === lang); b.classList.toggle('miss', !has); b.setAttribute('aria-pressed', l === lang); b.title = has ? '' : '아직 없어요 · 눌러서 만들기'; });
  const mh = $('#mh'); if (mh) mh.textContent = '지금 보는 언어 · ' + LANGS.find(x => x[0] === lang)[1];
}
function tagLang(p, l){ const d = new DOMParser().parseFromString('<body>' + p + '</body>', 'text/html'); const pg = d.body.querySelector('.pg'); if (!pg) return p; if (l === 'ko') pg.removeAttribute('data-lang'); else pg.setAttribute('data-lang', l); return sanitizePage(pg.outerHTML); }
function busy(on, msg){ let b = document.getElementById('busy'); if (!b) { b = document.createElement('div'); b.id = 'busy'; b.className = 'busy'; b.setAttribute('role', 'status'); document.body.appendChild(b); } b.textContent = msg || ''; b.hidden = !on; }
async function switchLang(l){
  if (!cur || l === lang) return;
  flushPend(); closeFind(); hideTT(); hideSTB(); cur[LK[lang]] = currentPages();
  let pages = hasLang(cur, l) ? cur[LK[l]] : null;
  if (!pages) {
    const name = LANGS.find(x => x[0] === l)[1];
    if (!canWrite) { toast(`${name} 계약서는 아직 없어요.`); return; }
    const sample = window.claude?.use ? await window.claude.use('sample').catch(() => null) : null;
    const v = await ask(`${name} 계약서가 아직 없어요`, `지금 한국어 계약서를 바탕으로 만들어요.${sample ? '\nAI 번역은 1~2분 걸려요. 끝나면 금액·이름·계좌를 꼭 확인해 주세요.' : ''}`, [['취소', null, 'ghost'], ['한국어 그대로 복사', 'copy'], ...(sample ? [['AI로 번역', 'ai', 'pri']] : [])]);
    if (!v) { updLang(); return; }
    if (v === 'copy') pages = cur.pages.map(p => tagLang(p, l));
    else {
      busy(true, `${name}로 번역하는 중이에요… (1~2분)`);
      try { pages = await translatePages(cur.pages, l, sample); }
      catch (e) { busy(false); toast(e?.code === 'rate_limited' ? '번역 요청이 많아요. 잠시 뒤 다시 해 주세요.' : e?.code === 'not_granted' ? 'AI 번역을 쓸 수 없어요. 한국어 그대로 복사로 시작해 주세요.' : '번역하지 못했어요. 다시 해 주세요.'); updLang(); return; }
      busy(false);
    }
    cur[LK[l]] = pages; markDirty(); toast(`${name} 계약서를 만들었어요. 저장을 눌러야 남아요.`);
  }
  lang = l; hist = []; hi = -1; mountPages(pages); pushHist(); updLang(); refreshThumbs();
}
async function translatePages(pages, l, sample){
  const docs = pages.map(p => new DOMParser().parseFromString('<body>' + p + '</body>', 'text/html'));
  const re = l === 'zh' ? /[가-힣A-Za-z]/ : /[가-힣]/;
  const nodes = [];
  docs.forEach(d => { const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.parentElement && n.parentElement.closest('svg')) continue; if (re.test(n.textContent)) nodes.push(n); } });
  const uniq = [...new Set(nodes.map(n => n.textContent.trim()))];
  const target = l === 'en' ? 'English' : 'Simplified Chinese (简体中文)';
  const map = new Map();
  for (let i = 0; i < uniq.length; i += 80) {
    const part = uniq.slice(i, i + 80);
    const prompt = `Translate each string of this Korean construction contract into ${target}.
Rules:
- Formal legal contract register. Translate every string, including headings and table labels.
- Keep all numbers, money amounts, dates, phone numbers, bank account numbers and percentages exactly.
- Keep person names and company names in their original script.
- "(인)" becomes "${l === 'en' ? '(Seal)' : '(盖章)'}"; "갑" / "을" become ${l === 'en' ? '"Party A" / "Party B"' : '"甲方" / "乙方"'}; "제1조" style becomes ${l === 'en' ? '"Article 1"' : '"第1条"'}.
- Keep leading list markers such as "1." or "•".
Return ONLY a JSON array of exactly ${part.length} strings in the same order.

${JSON.stringify(part)}`;
    const out = await sample.json(prompt, {modelTier: 'default'});
    if (!Array.isArray(out) || out.length !== part.length) throw new Error('shape');
    part.forEach((s, k) => map.set(s, String(out[k] ?? s)));
  }
  nodes.forEach(n => { const t = n.textContent, s = t.trim(); if (!map.has(s)) return; n.textContent = t.match(/^\s*/)[0] + map.get(s) + t.match(/\s*$/)[0]; });
  return docs.map(d => { const pg = d.body.querySelector('.pg'); if (!pg) return ''; pg.setAttribute('data-lang', l); return sanitizePage(pg.outerHTML); }).filter(Boolean);
}
async function exportAll(){
  if (!cur) return;
  const have = LANGS.map(x => x[0]).filter(l => l === lang || hasLang(cur, l));
  flushPend(); cur[LK[lang]] = currentPages(); const orig = lang, base = baseName();
  const back = () => { if (lang !== orig) { lang = orig; mountPages(cur[LK[orig]]); } updLang(); };
  busy(true, '전체 파일을 만드는 중이에요…');
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = new JSZip();
    for (const l of have) {
      if (l !== lang) { lang = l; mountPages(cur[LK[l]]); await new Promise(r => setTimeout(r, 80)); }
      busy(true, `${LANGS.find(x => x[0] === l)[1]} PDF·DOCX를 만드는 중이에요…`);
      const tag = l.toUpperCase();
      zip.file(`${base}_${tag}.pdf`, await makePdf());
      zip.file(`${base}_${tag}.docx`, await makeDocx());
    }
    back(); busy(false);
    const blob = await zip.generateAsync({type: 'blob'});
    if (await saveFile(`${base}_전체.zip`, blob)) toast(`${have.length}개 언어의 PDF·DOCX를 ZIP 하나로 저장했어요.`);
  } catch (e) { back(); busy(false); $('#exp').innerHTML = ''; toast('전체 다운로드를 만들지 못했어요. 다시 해 주세요.'); console.error(e); }
}
async function makePdfImg(){
  const imgs = await makeImgs('image/jpeg'); const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({unit: 'pt', format: [595.5, 842.25], orientation: 'portrait', compress: true});
  for (let i = 0; i < imgs.length; i++) {
    if (i) pdf.addPage([595.5, 842.25], 'portrait');
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(imgs[i]); });
    pdf.addImage(url, 'JPEG', 0, 0, 595.5, 842.25);
  }
  return pdf.output('blob');
}

/* ---------- floating text toolbar ---------- */
let ftbEl = null;
function hideFTB(){ const b = $('#ftb'); if (b) { b.hidden = true; b.querySelectorAll('.pp').forEach(x => x.hidden = true); } ftbEl = null; }
function placeFTB(){
  const b = $('#ftb'); if (!b || !ftbEl || !ftbEl.isConnected) { hideFTB(); return; }
  let r = ftbEl.getBoundingClientRect(); const h = b.offsetHeight || 44;
  if (typeof cellSel !== 'undefined' && cellSel.length > 1 && cellSel.includes(ftbEl)) { const rs = cellSel.map(x => x.getBoundingClientRect()); r = {left: Math.min(...rs.map(x => x.left)), top: Math.min(...rs.map(x => x.top)), bottom: Math.max(...rs.map(x => x.bottom))}; }
  let top = r.bottom + 8; if (top + h > innerHeight - 8) top = Math.max(70, r.top - h - 8);
  b.style.top = top + 'px'; b.style.left = Math.max(8, Math.min(r.left, innerWidth - b.offsetWidth - 8)) + 'px';
}
function showFTB(el){ const b = $('#ftb'); if (!b || !canWrite || !editOn) return; ftbEl = el; const fz = $('#fsz'); if (fz && document.activeElement !== fz) fz.value = Math.round(parseFloat(getComputedStyle(el).fontSize) || 12); b.querySelectorAll('.tbl').forEach(g => g.hidden = !el.closest('table.t')); b.hidden = false; placeFTB(); }
function ftbApply(fn){ const el = ftbEl && ftbEl.isConnected ? ftbEl : null; if (!el) return; flushPend(); fn(el, getSelection()); pushHist(); markDirty(); refreshThumbs(); placeFTB(); }
/* ---------- 날짜 고르기: 계약일·공사기간·서명란 날짜를 달력에서 ---------- */
const DATE_RES = [[/(20\d{2}|20)\s*년\s*(\d{1,2})?\s*월\s*(\d{1,2})?\s*일/g, 'ko'], [/(20\d{2})\s*([.\-\/])\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})(\s*\.)?/g, 'dot'], [/20[\s ]+\.[\s ]+\.[\s ]+\./g, 'dotph'], [/(?<!\d[\s ]*)년[\s ]+월[\s ]+일/g, 'kph']];
let calCtx = null, calView = null, calKb = null;
function datesIn(el){
  const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) for (const [re, kind] of DATE_RES) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(n.textContent))) {
      if (kind === 'kph') { out.push({node: n, start: m.index, end: m.index + m[0].length, kind: 'ko', sep: '', dot: true, y: null, m: null, d: null}); continue; }
      if (kind === 'dotph') { out.push({node: n, start: m.index, end: m.index + m[0].length, kind: 'dot', sep: '.', dot: true, y: null, m: null, d: null}); continue; }
      const ko = kind === 'ko';
      out.push({node: n, start: m.index, end: m.index + m[0].length, kind, sep: ko ? '' : m[2], dot: ko ? true : !!m[5],
        y: m[1].length === 4 ? +m[1] : null, m: +(ko ? m[2] : m[3]) || null, d: +(ko ? m[3] : m[4]) || null});
    }
  }
  return out;
}
function dateHit(el){
  const all = datesIn(el), s = getSelection();
  if (s.rangeCount) { const r = s.getRangeAt(0); const h = all.find(x => r.startContainer === x.node && r.startOffset >= x.start && r.startOffset <= x.end); if (h) return h; }
  return all.length === 1 ? all[0] : null;
}
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function closeCal(){ const c = $('#cal'); if (c) c.hidden = true; calCtx = null; }
function openCal(el, opts){
  el = el || (opts ? null : ftbEl); if (!el && !opts) return;
  let c = $('#cal');
  if (!c) {
    c = document.createElement('div'); c.id = 'cal'; c.className = 'cal'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', '날짜 고르기');
    ($('#ftb')?.parentElement || document.body).appendChild(c);
    c.addEventListener('mousedown', e => e.preventDefault());
    c.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t || !calCtx) return;
      if (t.dataset.cv) { calView = new Date(calView.getFullYear(), calView.getMonth() + +t.dataset.cv, 1); renderCal(); }
      else if (t.dataset.fmt) { calCtx.kind = t.dataset.fmt; renderCal(); }
      else if (t.dataset.d) { const [y, m, d] = t.dataset.d.split('-').map(Number); putDate(new Date(y, m - 1, d)); }
      else if ('today' in t.dataset) putDate(new Date());
    });
  }
  if (opts && opts.cb) {
    calCtx = {cb: opts.cb, sel: opts.sel || null, kind: 'dot'}; const base = calCtx.sel || new Date(); calKb = new Date(base); calView = new Date(base.getFullYear(), base.getMonth(), 1);
    renderCal(); c.hidden = false; const ar = opts.anchor.getBoundingClientRect();
    let top = ar.bottom + 6; if (top + c.offsetHeight > innerHeight - 8) top = Math.max(8, ar.top - c.offsetHeight - 6);
    c.style.top = top + 'px'; c.style.left = Math.max(8, Math.min(ar.left, innerWidth - c.offsetWidth - 8)) + 'px'; return;
  }
  const s = getSelection(), hit = (opts && opts.hit) || dateHit(el);
  const range = s.rangeCount && el.contains(s.getRangeAt(0).startContainer) ? s.getRangeAt(0).cloneRange() : null;
  const sel = hit && hit.y && hit.m && hit.d ? new Date(hit.y, hit.m - 1, hit.d) : null;
  calCtx = {el, hit, range, sel, kind: hit ? hit.kind : (/년/.test(el.textContent) ? 'ko' : 'dot')};
  const base = sel || new Date(); calKb = new Date(base); calView = new Date(base.getFullYear(), base.getMonth(), 1);
  renderCal(); c.hidden = false;
  const ar = ($('#ftb') && !$('#ftb').hidden ? $('#ftb') : el).getBoundingClientRect();
  let top = ar.bottom + 6; if (top + c.offsetHeight > innerHeight - 8) top = Math.max(8, ar.top - c.offsetHeight - 6);
  c.style.top = top + 'px'; c.style.left = Math.max(8, Math.min(ar.left, innerWidth - c.offsetWidth - 8)) + 'px';
}
function renderCal(){
  const c = $('#cal'); if (!c || !calCtx) return;
  const y = calView.getFullYear(), mo = calView.getMonth(), first = new Date(y, mo, 1 - new Date(y, mo, 1).getDay()), today = new Date();
  const chev = d => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${d}"/></svg>`;
  const ex = new Date(today), f = calCtx.kind;
  let days = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const cls = [d.getMonth() !== mo && 'out', sameDay(d, today) && 'td', sameDay(d, calCtx.sel) && 'on', sameDay(d, calKb) && 'kb'].filter(Boolean).join(' ');
    days += `<button type="button" class="${cls}" data-d="${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}" aria-label="${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일"${sameDay(d, calCtx.sel) ? ' aria-pressed="true"' : ''}>${d.getDate()}</button>`;
  }
  c.innerHTML = `<div class="cal-h"><button type="button" data-cv="-1" aria-label="이전 달">${chev('M12.5 5 7.5 10l5 5')}</button><b>${y}년 ${mo + 1}월</b><button type="button" data-cv="1" aria-label="다음 달">${chev('M7.5 5l5 5-5 5')}</button></div>`
    + `<div class="cal-w">${['일', '월', '화', '수', '목', '금', '토'].map(w => `<span>${w}</span>`).join('')}</div><div class="cal-g">${days}</div>`
    + `<div class="cal-f">${calCtx.cb ? '<span></span>' : ''}<div class="cal-seg"${calCtx.cb ? ' hidden' : ''} role="group" aria-label="날짜 모양"><button type="button" data-fmt="dot" class="${f === 'dot' ? 'on' : ''}">${ex.getFullYear()}. ${ex.getMonth() + 1}. ${ex.getDate()}.</button><button type="button" data-fmt="ko" class="${f === 'ko' ? 'on' : ''}">${ex.getFullYear()}년 ${ex.getMonth() + 1}월 ${ex.getDate()}일</button></div><button type="button" class="cal-today" data-today>오늘</button></div>`;
}
function putDate(dt){
  if (calCtx.cb) { const cb = calCtx.cb; closeCal(); cb(dt); return; }
  const {el, hit, range, kind} = calCtx; if (!el.isConnected) { closeCal(); return; }
  const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
  const keepDot = hit && hit.kind === 'dot' && kind === 'dot', sep = keepDot && hit.sep !== '.' ? hit.sep : null;
  const str = kind === 'ko' ? `${y}년 ${m}월 ${d}일` : sep ? `${y}${sep}${String(m).padStart(2, '0')}${sep}${String(d).padStart(2, '0')}` : `${y}. ${m}. ${d}${keepDot && !hit.dot ? '' : '.'}`;
  flushPend(); const linkKey = hit && typeof dateKeyAt === 'function' ? dateKeyAt(el, hit) : null;
  if (hit && hit.node.isConnected) { const t = hit.node.textContent; hit.node.textContent = t.slice(0, hit.start) + str + t.slice(hit.end); caretTo(el, true); }
  else { el.focus(); const s = getSelection(); if (range) { s.removeAllRanges(); s.addRange(range); } else caretTo(el, true); document.execCommand('insertText', false, str); }
  let more = 0; if (linkKey) { more = setKey(linkKey, dt, el) - 1; refreshFP(); }
  pushHist(); markDirty(); refreshThumbs(); closeCal(); toast(more > 0 ? `${linkKey} ${str} — 같은 날짜 ${more}곳도 함께 바꿨어요.` : `날짜를 ${str} 로 넣었어요.`);
}
function wireCal(desk){
  if (window.__calWired) return; window.__calWired = true;
  document.addEventListener('mousedown', e => { if (calCtx && !e.target.closest('#cal') && !e.target.closest('[data-f="cal"]')) closeCal(); }, true);
  document.addEventListener('keydown', e => {
    if (!calCtx || $('#cal')?.hidden) return;
    const mv = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7}[e.key];
    if (mv) { calKb = new Date(calKb.getFullYear(), calKb.getMonth(), calKb.getDate() + mv); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { calKb = new Date(calKb.getFullYear(), calKb.getMonth() + (e.key === 'PageUp' ? -1 : 1), calKb.getDate()); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); putDate(calKb); return; }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCal(); return; }
    else { closeCal(); return; }
    e.preventDefault(); e.stopPropagation(); calView = new Date(calKb.getFullYear(), calKb.getMonth(), 1); renderCal();
  }, true);
  // 날짜 글자를 한 번 누르면 바로 달력 (고르면 끝)
  desk.addEventListener('click', e => {
    if (!editOn || !canWrite || e.shiftKey || e.altKey) return; const ed = e.target.closest('[data-ed]'); if (!ed) return; const all = datesIn(ed); if (!all.length) return;
    setTimeout(() => {
      const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return; const r = s.getRangeAt(0);
      let h = all.find(x => x.node.isConnected && r.startContainer === x.node && r.startOffset >= x.start && r.startOffset <= x.end);
      if (!h && all.length === 1 && ed.textContent.trim().length <= all[0].end - all[0].start + 6) h = all[0];
      if (h) openCal(ed, {hit: h});
    }, 0);
  });
}
function wireFTB(){
  const b = $('#ftb'), desk = $('#desk'); if (!b || !desk) return;
  wireCal(desk);
  b.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  b.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return; const op = t.dataset.f;
    if (t.dataset.pop) { const pp = t.parentElement.querySelector('.pp'), open = pp.hidden; b.querySelectorAll('.pp').forEach(x => x.hidden = true); b.querySelectorAll('[data-pop]').forEach(x => x.setAttribute('aria-expanded', 'false')); pp.hidden = !open; t.setAttribute('aria-expanded', String(open)); placeFTB(); return; }
    if ('c' in t.dataset || 'bg' in t.dataset || 'l' in t.dataset) { b.querySelectorAll('.pp').forEach(x => x.hidden = true); b.querySelectorAll('[data-pop]').forEach(x => x.setAttribute('aria-expanded', 'false')); }
    if (t.dataset.t === 'merge') { mergeSel(); return; }
    if (t.dataset.t === 'split') { splitCell(); return; }
    if (t.dataset.t) { const f ={rowup: () => addRow(false), rowdn: () => addRow(true), rowdel: delRow, colL: () => addCol(false), colR: () => addCol(true), coldel: delCol}[t.dataset.t]; if (f && tblCell) tableOp(f); return; }
    if ('bg' in t.dataset) { if (tblCell) tableOp(() => paint(t.dataset.bg, $('#scope2').value)); return; }
    const hasSel = s => s.rangeCount && !s.isCollapsed && ftbEl.contains(s.anchorNode);
    if (op === 'bold') ftbApply((el, s) => { if (hasSel(s)) document.execCommand('bold'); else el.style.fontWeight = +getComputedStyle(el).fontWeight >= 600 ? '400' : '700'; });
    else if (op === 'left' || op === 'center' || op === 'right') ftbApply(el => { el.style.textAlign = op; if (getComputedStyle(el).display === 'flex') el.style.justifyContent = op === 'center' ? 'center' : op === 'right' ? 'flex-end' : 'flex-start'; });
    else if (op === 'up' || op === 'down') { const fz = $('#fsz'); setSize((+fz.value || 12) + (op === 'up' ? 1 : -1), true); }
    else if ('l' in t.dataset) ftbApply(el => setListMark(el, t.dataset.l));
    else if (op === 'cal') { if (calCtx && !$('#cal').hidden) closeCal(); else openCal(ftbEl); }
    else if ('c' in t.dataset) ftbApply((el, s) => { const c = t.dataset.c; if (hasSel(s)) document.execCommand('foreColor', false, c || '#333333'); else el.style.color = c; });
  });
  const fz = $('#fsz');
  if (fz) {
    fz.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setSize(+fz.value, false); ftbEl?.focus(); } else if (e.key === 'Escape') { ftbEl?.focus(); } });
    fz.addEventListener('change', () => setSize(+fz.value, false));
  }
  desk.addEventListener('focusin', e => { const ed = e.target.closest('[data-ed]'); if (ed) showFTB(ed); });
  desk.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!(a && a.closest && (a.closest('#desk [data-ed]') || a.closest('#ftb'))) && !b.matches(':hover')) hideFTB(); }, 120));
  window.addEventListener('scroll', () => { if (ftbEl) placeFTB(); }, {passive: true});
  window.addEventListener('resize', () => { if (ftbEl) placeFTB(); });
}

/* ---------- 사진으로 새 계약서 ---------- */
const PHOTO_PROMPT = `첨부한 계약서 사진(여러 장이면 순서대로 한 계약서)을 읽고, 내용을 아래 JSON 하나로만 돌려줘. 설명이나 코드블록 없이 JSON만.
규칙:
- 문서에 적힌 문구를 그대로 옮겨. 없는 내용은 지어내지 말고 빈 문자열이나 빈 배열로.
- 금액·날짜·전화·계좌·주소·이름은 글자 그대로.
- 조항(제1조, 제2조…) 순서를 지켜. "계약당사자" 조항은 articles 에 넣지 말고 owner/contractor 에 넣어.
- 조항 안의 번호 목록은 list 로, "항목: 내용" 짝은 kv 로, 표는 table 로, 총 금액은 amount 로, 강조된 안내 문단은 note 로.
- list 항목은 원래 번호(1., ①, • 등)를 앞에 그대로 붙여.
- "제N조" 없이 맨 바깥 번호(1. 2. 3. …)로 나뉜 양식(예: 표준도급계약서 표지)이면, 그 번호 하나하나를 articles 의 조항 하나로 만들어. 여러 번호를 한 조항으로 묶지 마. 번호가 13개면 articles 도 13개.
  · title 은 번호 뒤 항목 이름만, 글자 사이 띄어쓰기는 붙여서 (예: "1. 공 사 명 :" → "공사명", "3. 착공년월일" → "착공년월일").
  · 콜론 뒤 값과 그 번호 아래 딸린 줄(괄호 줄 "(노무비) …", 각주 "1) …", ①·가. 하위 항목)은 그 조항의 blocks 로 (text, list).
  · 번호 안의 표는 그 조항의 table 로.
- 비어 있는 칸은 비운 모양 그대로 옮겨 (예: "년 월 일", "일금 원정", "( )월에 1회", "( )%"). 0 이나 예시 값을 채우지 마.
- 당사자가 "도급인/수급인"처럼 다른 이름이면 role 에 그 이름 그대로. 아래 서명란에만 있는 주소·성명도 owner/contractor rows 에 (["주소",""],["성명",""]).
- 맨 끝 맺음 문단(“도급인”과 “수급인”은 … 보관한다)과 붙임서류 목록은 articles 가 아니라 outro 에 줄마다 넣어.
{
 "title": "계약서 제목 (예: 타일 공사 계약서)",
 "kicker": "영문 소제목 (없으면 CONSTRUCTION CONTRACT)",
 "date": "계약일 (예: 2026. 11. 26.)",
 "intro": "전문 첫 문단",
 "owner": {"role": "발주자", "rows": [["회사명","…"],["대표자","…"],["연락처","…"],["주소","…"]]},
 "contractor": {"role": "시공사", "rows": [["회사명","…"],["대표자","…"],["연락처","…"],["사업자주소","…"],["계좌정보","…"]]},
 "articles": [ {"title": "조항 제목", "blocks": [
    {"type":"text","text":"…"},
    {"type":"list","items":["1. …","2. …"]},
    {"type":"kv","rows":[["공사명","…"]]},
    {"type":"table","head":["구분","…"],"rows":[["…","…"]]},
    {"type":"amount","label":"총 공사금액","value":"금 0원","note":"(일금 … · 부가세 포함)"},
    {"type":"note","text":"…"} ]} ],
 "outro": ["맺음 문단", "붙임서류 : 1. …", "2. …"],
 "signDate": "서명란 날짜 (예: 2026년 11월 26일, 비어 있으면 \"년 월 일\")"
}`;
function pickImages(){
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
    i.onchange = () => res([...i.files]); i.addEventListener('cancel', () => res([])); i.click();
  });
}
async function shrinkImage(file, max = 2000){
  const bmp = await createImageBitmap(file); const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88));
}
const T = v => esc(String(v ?? '').trim());
function blockHTML(b){
  if (!b || typeof b !== 'object') return '';
  if (b.type === 'list') return `<div>${(b.items || []).map(x => `<p class="li">${T(x)}</p>`).join('')}</div>`;
  if (b.type === 'kv') return `<div style="display: flex; flex-direction: column; gap: 3px">${(b.rows || []).map(r => `<div class="kv"><strong>${T(r[0])}</strong><p>${T(r[1])}</p></div>`).join('')}</div>`;
  if (b.type === 'table') {
    const head = (b.head || []).length ? `<tr>${b.head.map(h => `<th class="c" style="padding: 3px 9px">${T(h)}</th>`).join('')}</tr>` : '';
    return `<table class="t" style="font-size: 12px">${head}${(b.rows || []).map(r => `<tr>${(r || []).map((c, i) => i === 0 ? `<th class="c" style="padding: 3px 9px; background: #ffffff">${T(c)}</th>` : `<td style="padding: 3px 9px">${T(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  if (b.type === 'amount') return `<div style="display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; padding: 5px 14px; background: #f5f5f5"><span style="font-weight: 600; color: #111111">${T(b.label || '총 공사금액')}</span><span class="amt" style="font-size: 20px; line-height: 1.3; font-weight: 700; color: #111111">${T(b.value)}</span>${b.note ? `<span style="color: #555555">${T(b.note)}</span>` : ''}</div>`;
  if (b.type === 'note') return `<div style="background: #eef5e7; padding: 10px 14px"><p>${T(b.text)}</p></div>`;
  return `<p>${T(b.text)}</p>`;
}
const secHTML = (no, title, body) => `<section class="art" style="padding: 7px 0"><h2 style="margin: 0; font-size: 12px; line-height: 1.4"><span class="no" style="color: #4a8a1a">제${no}조</span><span class="tt">${T(title)}</span></h2>${body}</section>`;
function partiesHTML(o, c){
  const side = (p, first) => { const rows = (p?.rows || []).filter(r => r && (r[0] || r[1])); if (!rows.length) rows.push(['회사명', '']); const bt = first ? '' : '; border-top: 2px solid #111111';
    return rows.map((r, i) => `<tr>${i === 0 ? `<th rowspan="${rows.length}" class="c" style="background: #eef5e7; padding: 3px 6px; width: 64px${bt}">${T(p?.role || (first ? '발주자' : '시공사'))}<br>(${first ? '갑' : '을'})</th>` : ''}<th style="padding: 3px 9px; width: 84px${i === 0 ? bt : ''}">${T(r[0])}</th><td style="padding: 3px 9px${i === 0 ? bt : ''}">${T(r[1])}</td></tr>`).join(''); };
  return `<table class="t" style="font-size: 12px">${side(o, true)}${side(c, false)}</table>`;
}
const nameOf = p => { const r = (p?.rows || []).find(r => /회사|상호|업체|성명|이름/.test(r?.[0] || '')); return String(r?.[1] || '').trim(); };
function signHTML(d){
  const box = (p, first) => `<table class="t" style="font-size: 12px; table-layout: auto"><tr><th colspan="2" class="c" style="padding: 5px 9px; background: #eef5e7">${T(p?.role || (first ? '발주자' : '시공사'))} (${first ? '갑' : '을'})</th></tr><tr><th style="padding: 4px 9px; width: 56px">회사명</th><td style="padding: 4px 9px">${T(nameOf(p))}</td></tr><tr><th style="padding: 4px 9px">대표자</th><td style="padding: 4px 9px"><span style="display: flex; justify-content: space-between"><span><br></span><span style="color: #555555">(인)</span></span></td></tr></table>`;
  return `<div style="margin-top: auto; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid #e1e1e1; padding-top: 12px"><p style="text-align: center; font-size: 16px; font-weight: 600; color: #111111">${T(d.signDate || '20     년     월     일')}</p><div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px">${box(d.owner, true)}${box(d.contractor, false)}</div></div>`;
}
function buildContract(d){
  const base = new DOMParser().parseFromString('<body>' + TPL.Blank + '</body>', 'text/html').body.querySelector('.pg');
  const hdr = base.querySelector('header');
  const hp = hdr.querySelectorAll('p'); if (hp[0]) hp[0].textContent = String(d.kicker || 'CONSTRUCTION CONTRACT').trim();
  const h1 = hdr.querySelector('h1'); if (h1) h1.textContent = String(d.title || '계약서').trim();
  const ds = hdr.querySelector('p span'); if (ds) ds.textContent = String(d.date || '').trim();
  const headHTML = hdr.outerHTML;
  [...base.children].forEach(ch => ch.remove());
  const shell = base.outerHTML.replace(/<\/div>\s*$/, '');
  const pieces = [];
  if (d.intro) pieces.push(`<p style="padding: 12px 0 10px">${T(d.intro)}</p>`);
  let no = 1;
  pieces.push(secHTML(no++, '계약당사자', partiesHTML(d.owner, d.contractor)));
  (d.articles || []).forEach(a => { const bs = (a.blocks || []).map(blockHTML).filter(Boolean); const body = bs.length > 1 ? `<div style="display: flex; flex-direction: column; gap: 6px">${bs.join('')}</div>` : (bs[0] || '<p></p>'); pieces.push(secHTML(no++, String(a.title || '').replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\s*:\s*$/, ''), body)); });
  const outro = (Array.isArray(d.outro) ? d.outro : d.outro ? [d.outro] : []).map(x => String(x || '').trim()).filter(Boolean);
  if (outro.length) pieces.push(`<div style="display: flex; flex-direction: column; gap: 4px; padding: 12px 0 4px">${outro.map((x, i) => `<p${i === 0 ? '' : ' style="padding-left: 12px"'}>${T(x)}</p>`).join('')}</div>`);
  const foot = (i, n) => `<p style="margin-top: ${i < n ? 'auto' : '20px'}; padding-top: 12px; border-top: 1px solid #e1e1e1; display: flex; justify-content: space-between; color: #555555"><span>${T(d.title || '계약서')}</span><span>${i} / ${n}</span></p>`;
  // lay out into A4 pages by measuring
  const box = $('#exp'); box.innerHTML = '';
  const newPage = first => { box.insertAdjacentHTML('beforeend', shell + headHTML + (first ? '' : '<div style="height: 14px"></div>') + foot(1, 2) + '</div>'); const pg = box.lastElementChild; return pg; };
  const fits = pg => pg.scrollHeight <= pg.clientHeight + 1;
  let pg = newPage(true);
  for (const h of pieces) {
    pg.lastElementChild.insertAdjacentHTML('beforebegin', h);
    if (!fits(pg) && pg.querySelectorAll('section, header ~ p').length > 1) { const el = pg.lastElementChild.previousElementSibling; el.remove(); pg = newPage(false); pg.lastElementChild.insertAdjacentHTML('beforebegin', h); }
  }
  pg.lastElementChild.insertAdjacentHTML('beforebegin', signHTML(d));
  if (!fits(pg)) { pg.lastElementChild.previousElementSibling.remove(); pg = newPage(false); pg.lastElementChild.insertAdjacentHTML('beforebegin', signHTML(d)); }
  const pgs = [...box.querySelectorAll(':scope > .pg')], n = pgs.length;
  const out = pgs.map((p, i) => { const f = p.lastElementChild; if (n === 1) f.remove(); else f.outerHTML = foot(i + 1, n); return sanitizePage(p.outerHTML); });
  box.innerHTML = '';
  return out;
}
async function createFromPhoto(){
  const sample = window.claude?.use ? await window.claude.use('sample').catch(() => null) : null;
  if (!sample) { toast('AI 기능을 쓸 수 없어서 사진으로 만들기를 할 수 없어요.'); return; }
  try { const lim = await sample.limits?.(); if (lim && lim.images === false) { toast('이 환경에서는 사진을 AI에 보낼 수 없어요.'); return; } } catch {}
  const files = (await pickImages()).filter(f => /^image\//.test(f.type)).slice(0, 8);
  if (!files.length) return;
  busy(true, `사진 ${files.length}장에서 계약서를 읽는 중이에요… (1~2분)`);
  try {
    const images = await Promise.all(files.map(f => shrinkImage(f)));
    const d = await sample.json(PHOTO_PROMPT, {images, modelTier: 'default'});
    if (!d || typeof d !== 'object') throw new Error('shape');
    await document.fonts.ready;
    const pages = buildContract(d);
    const nid = 'c' + Date.now().toString(36);
    const data = {name: String(d.title || '새 계약서').slice(0, 120), party: nameOf(d.contractor), pages, en: [], zh: [], updatedAt: new Date().toISOString()};
    await persist(nid, data); if (!db) store[nid] = data;
    busy(false); location.hash = 'c-' + nid;
    toast('사진 내용으로 새 계약서를 만들었어요. 금액·이름·계좌를 원본과 꼭 대조해 주세요.');
  } catch (e) { busy(false); $('#exp').innerHTML = ''; toast(e?.code === 'rate_limited' ? '요청이 많아요. 잠시 뒤 다시 해 주세요.' : e?.code === 'not_granted' ? 'AI 사용이 허용되지 않았어요.' : '사진을 읽지 못했어요. 더 밝고 반듯한 사진으로 다시 해 주세요.'); console.error(e); }
}

function setSize(px, keepSel){
  px = Math.max(8, Math.min(48, Math.round(+px || 12))); const fz = $('#fsz'); if (fz) fz.value = px;
  ftbApply((el, s) => {
    if (keepSel && s.rangeCount && !s.isCollapsed && el.contains(s.anchorNode)) {
      document.execCommand('fontSize', false, '7');
      el.querySelectorAll('font[size="7"]').forEach(f => { const sp = document.createElement('span'); sp.style.fontSize = px + 'px'; while (f.firstChild) sp.appendChild(f.firstChild); f.replaceWith(sp); });
    } else el.style.fontSize = px + 'px';
  });
}

/* ---------- 빈 곳을 누르면: 단락·표·조항 넣기 ---------- */
let ibSec = null;
function hideIB(){ const b = $('#ib'); if (b) b.hidden = true; ibSec = null; }
function wireIB(){
  const ib = $('#ib'), desk = $('#desk'); if (!ib || !desk) return;
  desk.addEventListener('click', e => {
    if (!canWrite || !editOn) return;
    const pg = e.target.closest('.paper>.pg'), onBlank = pg && (e.target === pg || e.target.classList.contains('paper'));
    if (!onBlank) { if (!e.target.closest('#ib')) hideIB(); return; }
    const secs = [...pg.querySelectorAll('section.art')]; if (!secs.length) { hideIB(); return; }
    let sec = secs[0]; for (const s of secs) if (s.getBoundingClientRect().top < e.clientY) sec = s;
    ibSec = sec; ib.hidden = false;
    ib.style.top = Math.min(innerHeight - ib.offsetHeight - 8, e.clientY + 6) + 'px';
    ib.style.left = Math.max(8, Math.min(innerWidth - ib.offsetWidth - 8, e.clientX - 20)) + 'px';
  });
  ib.addEventListener('mousedown', e => e.preventDefault());
  ib.addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b || !ibSec) return; const sec = ibSec, op = b.dataset.i; hideIB();
    const body = () => { let bd = sec.children[1]; if (!bd) { bd = document.createElement('div'); sec.appendChild(bd); } if (bd.tagName !== 'DIV') { const w = document.createElement('div'); bd.replaceWith(w); w.appendChild(bd); bd = w; } return bd; };
    if (op === 'para') {
      let np = null;
      structOp(() => { np = document.createElement('p'); np.className = 'li'; np.textContent = '내용을 입력하세요.'; body().appendChild(np); }, '단락을 넣었어요.');
      const live = ROOT.querySelectorAll('#desk section.art')[[...ROOT.querySelectorAll('#desk section.art')].indexOf(sec)];
      const last = (live || sec).querySelector('p.li:last-of-type'); if (last) { const r = document.createRange(); r.selectNodeContents(last); const s = getSelection(); s.removeAllRanges(); s.addRange(r); last.focus(); }
    }
    else if (op === 'table') structOp(() => { body().appendChild(newTable()); }, '표를 넣었어요. 칸을 누르면 행·열을 더할 수 있어요.');
    else if (op === 'sec') structOp(() => { sec.after(emptySection(sec)); }, '새 조항을 넣었어요.');
  });
  window.addEventListener('scroll', hideIB, {passive: true});
}
