{
  // 데이터 백업: 내보내기(파일·복사) / 가져오기(파일·붙여넣기) — 관리자만
  const COLS = ['contracts', 'signatures', 'settings'];
  let dbx = null;
  const once = col => new Promise((res, rej) => { let un = null; const t = setTimeout(() => rej(new Error('timeout')), 15000);
    un = dbx.collection(col).onSnapshot(s => { clearTimeout(t); const out = {}; s.docs.forEach(d => { out[d.id] = d.data(); }); try { un && un(); } catch {} res(out); }, e => { clearTimeout(t); rej(e); }); });
  async function dump(){ const all = {}; for (const c of COLS) all[c] = await once(c); return all; }
  const toastMsg = m => { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastMsg.t); toastMsg.t = setTimeout(() => t.classList.remove('show'), 4000); };
  function dlg(){
    const wrap = document.createElement('div'); wrap.className = 'modal show'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="dlg" style="width:min(520px,100%)"><h4>데이터 백업·옮기기</h4>
      <p>계약서·메일 서명·회사 공통 정보를 한 묶음으로 내보내거나 가져와요. 가져오면 같은 항목은 덮어써요.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn" data-a="copy">복사하기</button><button class="btn" data-a="file">파일로 받기</button></div>
      <textarea aria-label="가져올 데이터" placeholder="여기에 복사한 데이터를 붙여 넣거나 아래에서 파일을 고르세요" style="width:100%;height:120px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink);padding:10px;font:13px/1.4 ui-monospace,monospace;resize:vertical"></textarea>
      <div class="row" style="margin-top:12px;justify-content:space-between"><button class="btn ghost" data-a="pick">파일 고르기</button><span style="display:flex;gap:8px"><button class="btn ghost" data-a="close">닫기</button><button class="btn pri" data-a="import">가져오기</button></span></div></div>`;
    document.body.appendChild(wrap);
    const ta = wrap.querySelector('textarea'), close = () => wrap.remove();
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    wrap.onclick = async e => {
      const b = e.target.closest('[data-a]'); if (!b) { if (e.target === wrap) close(); return; }
      const a = b.dataset.a;
      try {
        if (a === 'close') close();
        else if (a === 'copy') { const txt = JSON.stringify(await dump()); try { await navigator.clipboard.writeText(txt); } catch { ta.value = txt; ta.select(); document.execCommand('copy'); } toastMsg('전체 데이터를 복사했어요. 옮길 곳의 이 창에 붙여 넣으세요.'); }
        else if (a === 'file') { const blob = new Blob([JSON.stringify(await dump(), null, 1)], {type: 'application/json'}); const dl = await window.claude.use('downloads'); const name = `opk-tools-backup-${new Date().toISOString().slice(0, 10)}.json`; if (dl) await dl.save({filename: name, data: blob}); else toastMsg('이 화면에서는 파일 저장을 쓸 수 없어요. 복사하기를 써 주세요.'); }
        else if (a === 'pick') { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = async () => { if (i.files[0]) ta.value = await i.files[0].text(); }; i.click(); }
        else if (a === 'import') {
          let data; try { data = JSON.parse(ta.value); } catch { toastMsg('붙여 넣은 내용이 백업 데이터가 아니에요.'); return; }
          const jobs = []; for (const c of COLS) for (const [id, v] of Object.entries(data?.[c] || {})) if (/^[A-Za-z0-9_-]{1,64}$/.test(id) && v && typeof v === 'object') jobs.push([c, id, v]);
          if (!jobs.length) { toastMsg('가져올 항목이 없어요.'); return; }
          b.disabled = true; let ok = 0;
          for (const [c, id, v] of jobs) { try { await dbx.doc(c + '/' + id).set(v); ok++; b.textContent = `가져오는 중 ${ok}/${jobs.length}`; } catch (er) { console.warn(c, id, er); } }
          toastMsg(`${ok}개 항목을 가져왔어요. 새로고침하면 반영돼요.`); setTimeout(() => location.reload(), 1200);
        }
      } catch (er) { console.error(er); toastMsg('처리하지 못했어요. 다시 해 주세요.'); }
    };
    ta.focus();
  }
  (async () => {
    if (!window.claude?.use) return;
    const [d, u] = await Promise.all(['db', 'user'].map(n => window.claude.use(n).catch(() => null)));
    if (!d || !u) return; try { if (await u.canEdit() !== true) return; } catch { return; }
    dbx = d;
    const foot = document.querySelector('.nav .foot'); if (!foot) return;
    const b = document.createElement('button'); b.className = 'thc bk'; b.textContent = '백업'; b.title = '데이터 백업·옮기기'; b.setAttribute('aria-label', '데이터 백업·옮기기'); b.onclick = dlg;
    foot.prepend(b);
  })();
}
