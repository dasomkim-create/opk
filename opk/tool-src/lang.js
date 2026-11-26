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
  const r = ftbEl.getBoundingClientRect(), h = b.offsetHeight || 44;
  let top = r.bottom + 8; if (top + h > innerHeight - 8) top = Math.max(70, r.top - h - 8);
  b.style.top = top + 'px'; b.style.left = Math.max(8, Math.min(r.left, innerWidth - b.offsetWidth - 8)) + 'px';
}
function showFTB(el){ const b = $('#ftb'); if (!b || !canWrite || !editOn) return; ftbEl = el; const fz = $('#fsz'); if (fz && document.activeElement !== fz) fz.value = Math.round(parseFloat(getComputedStyle(el).fontSize) || 12); b.querySelectorAll('.tbl').forEach(g => g.hidden = !el.closest('table.t')); b.hidden = false; placeFTB(); }
function ftbApply(fn){ const el = ftbEl && ftbEl.isConnected ? ftbEl : null; if (!el) return; flushPend(); fn(el, getSelection()); pushHist(); markDirty(); refreshThumbs(); placeFTB(); }
function wireFTB(){
  const b = $('#ftb'), desk = $('#desk'); if (!b || !desk) return;
  b.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  b.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return; const op = t.dataset.f;
    if (t.dataset.pop) { const pp = t.parentElement.querySelector('.pp'), open = pp.hidden; b.querySelectorAll('.pp').forEach(x => x.hidden = true); b.querySelectorAll('[data-pop]').forEach(x => x.setAttribute('aria-expanded', 'false')); pp.hidden = !open; t.setAttribute('aria-expanded', String(open)); placeFTB(); return; }
    if ('c' in t.dataset || 'bg' in t.dataset) { b.querySelectorAll('.pp').forEach(x => x.hidden = true); b.querySelectorAll('[data-pop]').forEach(x => x.setAttribute('aria-expanded', 'false')); }
    if (t.dataset.t) { const f = {rowup: () => addRow(false), rowdn: () => addRow(true), rowdel: delRow, colL: () => addCol(false), colR: () => addCol(true), coldel: delCol}[t.dataset.t]; if (f && tblCell) tableOp(f); return; }
    if ('bg' in t.dataset) { if (tblCell) tableOp(() => paint(t.dataset.bg, $('#scope2').value)); return; }
    const hasSel = s => s.rangeCount && !s.isCollapsed && ftbEl.contains(s.anchorNode);
    if (op === 'bold') ftbApply((el, s) => { if (hasSel(s)) document.execCommand('bold'); else el.style.fontWeight = +getComputedStyle(el).fontWeight >= 600 ? '400' : '700'; });
    else if (op === 'left' || op === 'center' || op === 'right') ftbApply(el => { el.style.textAlign = op; if (getComputedStyle(el).display === 'flex') el.style.justifyContent = op === 'center' ? 'center' : op === 'right' ? 'flex-end' : 'flex-start'; });
    else if (op === 'up' || op === 'down') { const fz = $('#fsz'); setSize((+fz.value || 12) + (op === 'up' ? 1 : -1), true); }
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
 "signDate": "서명란 날짜 (예: 2026년 11월 26일)"
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
  if (b.type === 'amount') return `<div style="display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; padding: 5px 14px; background: #f5f5f5"><span style="font-weight: 600; color: #111111">${T(b.label || '총 공사금액')}</span><span style="font-size: 20px; line-height: 1.3; font-weight: 700; color: #111111">${T(b.value)}</span>${b.note ? `<span style="color: #555555">${T(b.note)}</span>` : ''}</div>`;
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
  (d.articles || []).forEach(a => { const bs = (a.blocks || []).map(blockHTML).filter(Boolean); const body = bs.length > 1 ? `<div style="display: flex; flex-direction: column; gap: 6px">${bs.join('')}</div>` : (bs[0] || '<p></p>'); pieces.push(secHTML(no++, a.title || '', body)); });
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
