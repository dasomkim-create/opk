{
  const root = document.documentElement;
  let theme = 'auto'; try { theme = localStorage.getItem('opk-theme') || 'auto'; } catch {}
  if (theme !== 'auto') root.dataset.mode = theme;
  if (!location.hash) { let t = null; try { t = localStorage.getItem('opk-tool'); } catch {} if (t === 'ct') history.replaceState(null, '', '#contracts'); }
  let ctState = 'pending';
  const toolOf = h => /^#(contracts|c-.+)$/.test(h) ? 'ct' : 'sg';
  window.OPK = {
    toolOf,
    state: () => ctState,
    contractsAllowed(){ if (ctState === 'ok') return; ctState = 'ok'; const n = document.getElementById('navCt'); if (n) n.hidden = false; },
    contractsDenied(){ ctState = 'no'; const n = document.getElementById('navCt'); if (n) n.hidden = true; if (toolOf(location.hash) === 'ct') location.hash = 'sign'; }
  };
}
