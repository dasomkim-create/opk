{
  const last = {ct: 'contracts', sg: 'sign'};
  const navCt = document.getElementById('navCt'), navSg = document.getElementById('navSg');
  function show(){
    const t = OPK.toolOf(location.hash);
    if (t === 'ct' && OPK.state() === 'no') { location.hash = 'sign'; return; }
    last[t] = location.hash.slice(1) || last[t];
    document.getElementById('ct').hidden = t !== 'ct';
    document.getElementById('sg').hidden = t !== 'sg';
    navCt.classList.toggle('on', t === 'ct'); navSg.classList.toggle('on', t === 'sg');
    navCt.setAttribute('aria-current', t === 'ct' ? 'page' : 'false'); navSg.setAttribute('aria-current', t === 'sg' ? 'page' : 'false');
    document.title = (t === 'ct' ? '계약서' : '메일 서명') + ' · OPK 업무 도구';
    try { localStorage.setItem('opk-tool', t); } catch {}
  }
  [navCt, navSg].forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); const t = a.dataset.tool;
    const target = OPK.toolOf(location.hash) === t ? (t === 'ct' ? 'contracts' : 'sign') : last[t];
    if (location.hash.slice(1) === target) return; location.hash = target;
  }));
  window.addEventListener('hashchange', show); show();
  const btns = [...document.querySelectorAll('.theme [data-t]')];
  const NAMES = {auto: '자동', light: '라이트', dark: '다크'}, thc = document.getElementById('thc');
  const paint = v => { btns.forEach(b => { b.classList.toggle('on', b.dataset.t === v); b.setAttribute('aria-pressed', b.dataset.t === v); }); thc.textContent = NAMES[v]; thc.title = '화면: ' + NAMES[v] + ' (눌러서 바꾸기)'; };
  const setTheme = v => { if (v === 'auto') delete document.documentElement.dataset.mode; else document.documentElement.dataset.mode = v; paint(v); cur = v; try { localStorage.setItem('opk-theme', v); } catch {} };
  let cur = 'auto'; try { cur = localStorage.getItem('opk-theme') || 'auto'; } catch {}
  paint(cur);
  btns.forEach(b => b.onclick = () => setTheme(b.dataset.t));
  thc.onclick = () => setTheme({auto: 'light', light: 'dark', dark: 'auto'}[cur] || 'auto');
  const tg = document.getElementById('navTg');
  const setMin = on => { document.body.classList.toggle('navmin', on); tg.setAttribute('aria-expanded', !on); tg.setAttribute('aria-label', on ? '메뉴 펴기' : '메뉴 접기'); try { localStorage.setItem('opk-navmin', on ? '1' : ''); } catch {} };
  let min = false; try { min = localStorage.getItem('opk-navmin') === '1'; } catch {}
  setMin(min); tg.onclick = () => { setMin(!document.body.classList.contains('navmin')); tg.blur(); };
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); tg.click(); } });
}
