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
