import re, json, os
import os
H = os.path.dirname(os.path.abspath(__file__)) + '/'
ct_css = open(H + 'ct.css').read()
sg_css = open(H + 'sg.css').read().replace('.urlrow{display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px;align-items:center}', '.urlrow{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:10px;align-items:center}')
ct = open(H + 'ct.js').read()
sg = open(H + 'sg.js').read()
tpl = json.load(open(H + 'logo.json'))
blank = open(H + 'blank.html').read()

def rep(s, a, b, count=1, name=''):
    n = s.count(a)
    assert n == count, f'{name}: expected {count} got {n}: {a[:80]!r}'
    return s.replace(a, b)

# ---------------- CSS ----------------
def strip_comments(c): return re.sub(r'/\*.*?\*/', '', c, flags=re.S)
DROP = re.compile(r'^(:root|\*|html|body|button|button,input,select|html,body)$')
def themify(c):
    for a, b in [('rgba(18,19,18,.92)', 'var(--barbg)'), ('#4a4e49', 'var(--line2)'), ('#4f564c', 'var(--line2)'), ('#5a6157', 'var(--line2)'),
                 ('background:#f4f4f2;color:#111', 'background:var(--ink);color:var(--bg)'), ('#3a3d39', 'var(--line2)'),
                 ('rgba(0,0,0,.45)', 'var(--sh)'), ('rgba(0,0,0,.55)', 'var(--sh)'), ('rgba(0,0,0,.5)', 'var(--sh)'), ('rgba(0,0,0,.4)', 'var(--sh)'),
                 ('.pill.on{background:var(--ink);color:#111;border-color:var(--ink)}', '.pill.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}')]:
        c = c.replace(a, b)
    return c
def rules(c):
    out, i = [], 0
    while i < len(c):
        j = c.find('{', i)
        if j < 0: break
        sel = c[i:j].strip()
        if sel.startswith('@media') or sel.startswith('@supports'):
            depth, k = 1, j + 1
            while depth:
                if c[k] == '{': depth += 1
                elif c[k] == '}': depth -= 1
                k += 1
            out.append((sel, rules(c[j + 1:k - 1]))); i = k
        else:
            k = c.find('}', j); out.append((sel, c[j + 1:k])); i = k + 1
    return out
def prefix(c, pre, globals_re, skip_re=None):
    def emit(rs):
        s = ''
        for sel, body in rs:
            if isinstance(body, list):
                inner = emit(body)
                if inner: s += sel + '{' + inner + '}\n'
                continue
            if sel.startswith('@font-face') or DROP.match(sel): continue
            parts = [p.strip() for p in sel.split(',')]
            if skip_re and all(skip_re.match(p) for p in parts): continue
            np = []
            for p in parts:
                if globals_re.match(p): np.append(p)
                elif p.startswith('body.viewing'): np.append(p.replace('body.viewing', 'body.viewing ' + pre, 1))
                else: np.append(pre + ' ' + p)
            s += ','.join(np) + '{' + body + '}\n'
        return s
    return emit(rules(strip_comments(themify(c))))
ct_css = ct_css.replace('box-shadow:0 12px 30px rgba(0,0,0,.5);max-width:calc(100vw - 16px)', 'box-shadow:0 2px 8px rgba(0,0,0,.14);max-width:calc(100vw - 16px)')
assert 'rgba(0,0,0,.14)' in ct_css
ct_out = prefix(ct_css, ':is(#ct,#exp)', re.compile(r'^(\.toast|\.modal|\.dlg|\.exp|::highlight|\.btn)'))
ct_out = ct_out.replace('.exp .pg{position:relative!important;transform:none!important;font-family:"Pretendard",sans-serif!important}',
                        '.exp .pg{position:relative!important;transform:none!important}.exp .pg:not([data-lang=zh]){font-family:"Pretendard",sans-serif!important}')
assert '.exp .pg:not([data-lang=zh])' in ct_out
sg_out = prefix(sg_css, '#sg', re.compile(r'^#clip'), skip_re=re.compile(r'^(\.toast|\.modal|\.dlg|\.btn)'))

SHELL_CSS = r'''
@font-face{font-family:"Pretendard";src:url("fonts/Pretendard-Regular.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Pretendard";src:url("fonts/Pretendard-SemiBold.woff2") format("woff2");font-weight:500 600;font-display:swap}
@font-face{font-family:"Pretendard";src:url("fonts/Pretendard-Bold.woff2") format("woff2");font-weight:700 900;font-display:swap}
:root{color-scheme:light dark;--bg:light-dark(#ffffff,#121312);--panel:light-dark(#ffffff,#1b1c1b);--panel2:light-dark(#f2f4f7,#242624);--line:light-dark(#e4e7ec,#2f322f);--line2:light-dark(#c9ced6,#4d524b);--ink:light-dark(#101318,#ededeb);--mute:light-dark(#5d636d,#a3a7a2);--green:#6eb92b;--green2:#8fd14f;--warn:light-dark(#a8710c,#e5a83b);--err:light-dark(#c4363a,#ef6b6e);--barbg:light-dark(rgba(255,255,255,.92),rgba(18,19,18,.92));--sh:light-dark(rgba(16,24,40,.10),rgba(0,0,0,.5));--navbg:light-dark(#f7f8fa,#0c0d0c);--desk:light-dark(#f2f4f7,transparent);--paperline:light-dark(#e4e7ec,transparent)}
#ct .desk{background:var(--desk)}
:root{--shs:light-dark(rgba(16,24,40,.07),rgba(0,0,0,.35))}
#ct .thumb,#sg .mini{box-shadow:0 1px 2px var(--shs)!important}
#ct .paper,#sg .mail{box-shadow:0 2px 10px var(--shs)!important}
#ct .card:hover{transform:none}
#ct .paper,#ct .thumb,#ct .tp .tbox,#sg .mini,#sg .mail{outline:1px solid var(--paperline)}
:root[data-theme=light]{color-scheme:light}:root[data-theme=dark]{color-scheme:dark}
:root[data-mode=light]{color-scheme:light!important}:root[data-mode=dark]{color-scheme:dark!important}
*{box-sizing:border-box;min-width:0}
html,body{min-height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "Pretendard",-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;overflow-x:clip}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer}
.nav{position:fixed;left:0;top:0;bottom:0;width:208px;z-index:40;display:flex;flex-direction:column;gap:4px;padding:18px 12px;background:var(--navbg);border-right:1px solid var(--line)}
.nav .logo{display:flex;align-items:center;gap:10px;padding:2px 10px 18px}
.nav .logo>svg{width:44px;height:30px;flex:none}
.nav .logo b{font-size:15px;line-height:1.2}
.nav a{display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;border-radius:10px;color:var(--mute);text-decoration:none;font-weight:600;font-size:14px}
.nav a:hover{color:var(--ink);background:var(--panel2)}
.nav a.on{background:var(--panel);color:var(--ink)}
.nav a.on svg{color:var(--green)}
.nav a svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.nav a[hidden]{display:none}
.nav .foot{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.nav .label{margin:0 10px;font-size:12px;color:var(--mute)}
.theme{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--line);border-radius:999px;padding:3px}
.theme button{height:32px;border:0;border-radius:999px;background:none;font-size:12px;font-weight:600;color:var(--mute)}
.theme button.on{background:var(--panel);color:var(--ink);box-shadow:0 1px 3px var(--sh)}
.nav :focus-visible{outline:2px solid var(--green);outline-offset:-2px}
.main{margin-left:208px;min-height:100vh;transition:margin-left .18s}
.nav{transition:width .18s,padding .18s}
.nav .logo{position:relative}
.navtg{margin-left:auto;width:36px;height:36px;flex:none;display:grid;place-items:center;border:0;border-radius:8px;background:none;color:var(--mute)}
.navtg:hover{color:var(--ink);background:var(--panel2)}
.nav .logo .navtg svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.btn{justify-content:center;color:var(--ink)}
.btn.pri{color:#0d1a05}
.dlg .row .btn{min-width:72px}
.thc{display:none;height:40px;border:1px solid var(--line);border-radius:10px;background:none;color:var(--mute);font-size:11px;font-weight:600}
body.navmin .nav{width:64px;padding:18px 12px;align-items:center}
body.navmin .nav .logo{padding:0 0 18px;justify-content:center;width:40px}
body.navmin .navtg{width:40px;height:40px}
body.navmin .nav a{width:40px;height:40px}
body.navmin .nav .foot{width:40px}
.navtg:focus-visible{outline:2px solid var(--green);outline-offset:-2px}
body.navmin .nav .logo>svg,body.navmin .nav .logo b,body.navmin .nav a span,body.navmin .nav .label,body.navmin .theme{display:none}
body.navmin .navtg{margin:0}
body.navmin .nav a{justify-content:center;padding:0}
body.navmin .thc{display:block}
body.navmin .main{margin-left:64px}
@media(prefers-reduced-motion:reduce){.main,.nav,.navtg svg{transition:none}}
.main .brand svg{display:none}
.main .bar{min-height:65px}
.main .brand b{font-size:17px;line-height:1.3}
.busy{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:70;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:18px 22px;font-weight:600;box-shadow:0 20px 60px var(--sh)}
.busy[hidden]{display:none}
#ct .lang{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px;flex:none}
#ct .lang button{height:32px;padding:0 12px;border:0;border-radius:999px;background:none;font-size:13px;font-weight:600;color:var(--mute)}
#ct .lang button.on{background:var(--ink);color:var(--bg)}
#ct .lang button.miss{opacity:.55}
#ct .menu-list .mh{margin:4px 12px 4px;font-size:12px;color:var(--mute)}
#ct .menu-list hr{border:0;border-top:1px solid var(--line);margin:6px}

#ct #ftb{flex-direction:column;align-items:stretch;gap:0;padding:4px;max-width:calc(100vw - 16px);width:max-content;border-radius:12px;box-shadow:0 2px 10px var(--shs)}
#ct #ftb .fr{display:flex;align-items:center;gap:2px;flex-wrap:nowrap;padding:2px}
#ct #ftb .fr[hidden]{display:none}
#ct #ftb .fr+.fr{border-top:1px solid var(--line);margin-top:2px;padding-top:4px}
#ct #ftb button{white-space:nowrap;flex:none;height:32px;min-width:32px;padding:0 6px;border:0;background:transparent;border-radius:7px;font:600 12px "Pretendard",sans-serif;color:var(--ink);display:inline-flex;align-items:center;justify-content:center;gap:2px}
#ct #ftb button:hover,#ct #ftb button[aria-expanded=true]{background:var(--panel2)}
#ct #ftb button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
#ct #ftb button svg.car{width:10px;height:10px;opacity:.6}
#ct #ftb .sep{width:1px;height:20px;background:var(--line);margin:0 4px;flex:none}
#ct #ftb .lab{font-size:11px;color:var(--mute);margin:0 2px 0 4px;white-space:nowrap}
#ct #ftb .pop{position:relative;display:inline-flex}
#ct #ftb .pp{position:absolute;top:38px;right:0;z-index:5;display:flex;gap:6px;align-items:center;width:max-content;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 10px;box-shadow:0 6px 20px var(--shs)}
#ct #ftb .pp[hidden]{display:none}
#ct #ftb .pp .sw{width:22px;height:22px;min-width:0;padding:0;border-radius:50%;border:1px solid var(--line2)}
#ct #ftb .pp .sw:hover{transform:scale(1.12);background-clip:padding-box}
#ct #ftb .pp .txt{height:26px;border:1px solid var(--line);padding:0 8px}
#ct #ftb #fsz{width:46px;height:30px;border:1px solid var(--line);border-radius:7px;background:var(--panel2);color:var(--ink);font:600 13px "Pretendard",sans-serif;text-align:center;padding:0 2px;-moz-appearance:textfield}
#ct #ftb #fsz::-webkit-inner-spin-button,#ct #ftb #fsz::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
#ct #ftb #fsz:focus{outline:2px solid var(--green);outline-offset:-1px}
#ct #ib{gap:2px;padding:4px;border-radius:12px;box-shadow:0 2px 10px var(--shs)}
#ct #ib .lab{font-size:11px;color:var(--mute);margin:0 6px}
#ct #ib button{height:32px;padding:0 10px;border:0;background:transparent;border-radius:7px;font:600 13px "Pretendard",sans-serif;color:var(--ink);display:inline-flex;align-items:center;gap:6px}
#ct #ib button:hover{background:var(--panel2)}
#ct #ib svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
#ct .paper>.pg{cursor:default}
#ct #ftb select{height:28px;border-radius:7px;background:var(--panel2);color:var(--ink);border:1px solid var(--line);font:600 12px "Pretendard",sans-serif;padding:0 4px}

#ct .ftb .ic{width:32px;padding:0;display:grid;place-items:center}
#ct .ftb .ic svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
#ct .ftb .tg[hidden]{display:none}
#ct #ftb{padding:6px 8px}
#ct #ftb .fr{gap:4px;padding:3px 2px}
#ct #ftb .fr+.fr{margin-top:4px;padding-top:7px}
#ct #ftb .sep{margin:0 6px}
#ct #ftb .lab{margin:0 4px 0 2px}
#ct #ftb .ic.wide{width:auto;min-width:32px;padding:0 8px;gap:4px;display:inline-flex}
#ct #ftb [data-t=merge],#ct #ftb [data-t=split]{padding:0 10px}
@property --fw{syntax:'<length>';inherits:true;initial-value:0px}
@property --sw{syntax:'<length>';inherits:true;initial-value:150px}
#ct .ed{transition:--fw .32s cubic-bezier(.22,.8,.24,1),--sw .32s cubic-bezier(.22,.8,.24,1)}
@keyframes opk-pop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}
@keyframes opk-fade{from{opacity:0}to{opacity:1}}
@keyframes opk-slide{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
#ct .cal:not([hidden]),#ct #ftb:not([hidden]),#ct #ftb .pp:not([hidden]),#ct #stb:not([hidden]),#ct #bm:not([hidden]),#ct .menu-list,#ct .findbar:not([hidden]){animation:opk-pop .18s cubic-bezier(.22,.8,.24,1)}
#ct .fp:not([hidden]) .fp-list,#ct .fp:not([hidden]) .fp-help,#ct .ed .side>.tp,#ct .ed .side>.addpg{animation:opk-slide .28s cubic-bezier(.22,.8,.24,1)}
#ct .fp.float:not([hidden]){animation:opk-pop .2s cubic-bezier(.22,.8,.24,1)}
#ct .bplus:not([hidden]){animation:opk-fade .15s ease}
#ct .fp-min svg,#ct .side-tg svg{transition:transform .28s cubic-bezier(.22,.8,.24,1)}
#ct .blk,#ct .cell-sel,#ct .slot-hi{transition:background-color .15s ease}
@media(prefers-reduced-motion:reduce){#ct .ed{transition:none}#ct *{animation:none!important}}
#ct .ftb select{height:30px;border-radius:7px;background:var(--panel2);color:var(--ink);border:1px solid var(--line);font:600 12px \"Pretendard\",sans-serif;padding:0 4px}
#ct section.art>h2{cursor:pointer}
.pg[data-lang=zh]{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC","Noto Sans CJK SC","Source Han Sans SC",sans-serif}
#sg .bad{font-size:12px;color:var(--warn)}
#sg .combo{position:relative}
#sg .combo input{padding-right:32px}
#sg .combo::after{content:"";position:absolute;right:14px;bottom:19px;width:7px;height:7px;border-right:1.6px solid var(--mute);border-bottom:1.6px solid var(--mute);transform:rotate(45deg);pointer-events:none}
#sg .cb{position:absolute;top:100%;left:0;right:0;min-width:240px;margin-top:4px;z-index:30;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px var(--shs);padding:4px;max-height:300px;overflow:auto}
#sg .cb[hidden]{display:none}
#sg .cb-i{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:9px 10px;border-radius:7px;cursor:pointer;font-size:14px;color:var(--ink)}
#sg .cb-i small{color:var(--mute);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#sg .cb-i:hover,#sg .cb-i.on{background:var(--panel2)}
#sg .org{display:flex;flex-direction:column;gap:6px;overflow-x:auto}
#sg .org-h,#sg .org-r{display:grid;grid-template-columns:repeat(6,minmax(90px,1fr)) 64px;gap:6px;min-width:680px}
#sg .org-h span{font-size:12px;color:var(--mute)}
#sg .org-r input{height:38px;border-radius:8px;border:1px solid var(--line);background:var(--panel);padding:0 10px;font-size:14px;color:var(--ink)}
#sg .org-r .btn{height:38px;padding:0 8px;font-size:13px}
#ct .back,#sg .back{padding:0 10px 0 4px;margin-left:-6px;gap:2px}
#ct .back svg,#sg .back svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#sg .guide summary{cursor:pointer;list-style:revert}
#sg .guide ol{margin:8px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:4px}
#sg .guide b{color:var(--ink)}
@media(max-width:800px){
 .nav{top:auto;right:0;width:auto;height:62px;flex-direction:row;align-items:center;padding:6px 8px;border-right:0;border-top:1px solid var(--line)}
 .nav .logo,.nav .label{display:none}
 .nav a{flex:1;flex-direction:column;justify-content:center;gap:2px;height:50px;font-size:11px;padding:0 4px}
 .nav .foot{margin:0}.theme{width:132px}
 .main,body.navmin .main{margin-left:0;padding-bottom:64px}
 .navtg,body.navmin .thc{display:none}
 body.navmin .nav{width:auto;padding:6px 8px}
 body.navmin .nav a span,body.navmin .theme{display:revert}
 body.navmin .nav a{flex-direction:column;padding:0 4px}
 .toast{bottom:78px!important}
}
'''

# ---------------- contract JS ----------------
ct = rep(ct, """const BASE = [
  {id:'demolition', name:'바닥 철거 공사 계약서', party:'대건 이엔지', pages:[TPL.Main]},
  {id:'tile', name:'타일 공사 계약서', party:'은봉타일', pages:[TPL.Tile, TPL.Tile2]}
];""", "", name='base')
ct = rep(ct, "const $ = s => document.querySelector(s);",
 "const ROOT = document.getElementById('ct');\nconst GLOBAL_IDS = /^#(toast|modal|mtitle|mtext|mrow|exp|clip|busy)$/;\nconst $ = s => GLOBAL_IDS.test(s) ? document.querySelector(s) : ROOT.querySelector(s);\nconst active = () => location.hash === '#contracts' || /^#c-/.test(location.hash);", name='$')
ct = rep(ct, "const app = $('#app');", "const app = ROOT;")
ct = ct.replace("document.getElementById('pg' + ", "ROOT.querySelector('#pg' + ")
ct = ct.replace("document.querySelector('#desk", "ROOT.querySelector('#desk")
ct = ct.replace("document.querySelectorAll(", "ROOT.querySelectorAll(")
ct = rep(ct, """function list(){
  const out = BASE.map(b => store[b.id] ? {...b, ...store[b.id], base:true} : {...b, base:true});
  for (const [id, c] of Object.entries(store)) if (!BASE.some(b => b.id === id)) out.push({...c, id});
  return out;
}""", """function list(){
  return Object.entries(store).map(([id, c]) => ({...c, id})).sort((a, b) => (b.base ? 1 : 0) - (a.base ? 1 : 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}""", name='list')
ct = re.sub(r'function blankPage\(\)\{.*?\n\}\n', 'function blankPage(){ return TPL.Blank; }\n', ct, count=1, flags=re.S)
assert 'return TPL.Blank' in ct
ct = rep(ct, "location.hash = ''", "location.hash = 'contracts'", count=2, name='hash')
ct = rep(ct, "next[doc.id] = {name: String(v.name || '계약서'), party: String(v.party || ''), pages: v.pages.map(sanitizePage).filter(Boolean), updatedAt: v.updatedAt};",
 "next[doc.id] = {name: String(v.name || '계약서'), party: String(v.party || ''), base: v.base === true, pages: v.pages.map(sanitizePage).filter(Boolean), en: Array.isArray(v.en) ? v.en.map(sanitizePage).filter(Boolean) : [], zh: Array.isArray(v.zh) ? v.zh.map(sanitizePage).filter(Boolean) : [], updatedAt: v.updatedAt};", name='snap')
ct = rep(ct, "      store = next;\n      if (!cur && pendingOpen", "      store = next; window.OPK?.contractsAllowed();\n      if (!cur && pendingOpen", name='snaprender0')
ct = rep(ct, "      else if (!cur) renderHome(); else if (first && !dirty) renderEditor(cur.id);",
 "      else if (!cur) { if (active()) renderHome(); } else if (first && !dirty && lang === 'ko') renderEditor(cur.id);", name='snaprender')
ct = rep(ct, "}, () => { clearTimeout(timer); toast('저장소에 연결하지 못했어요. 이 브라우저에만 저장돼요.'); db = null; local = true; loadLocal(); if (!cur) renderHome(); });",
 "}, () => { clearTimeout(timer); db = null; store = {}; window.OPK?.contractsDenied(); });", name='snaperr')
ct = rep(ct, "  if (d) {\n    db = d; local = false; store = {};\n    let first = true; const timer",
 "  if (u && u.canEdit) { try { if (await u.canEdit() === false) { canWrite = false; window.OPK?.contractsDenied(); return; } } catch {} }\n  if (d) {\n    db = d; local = false; store = {};\n    let first = true; const timer", name='admin')
ct = rep(ct, "  } else if (!cur) renderHome();\n  setMode();", "  } else if (window.claude?.use) { window.OPK?.contractsDenied(); return; } else { window.__dbSettled = true; window.OPK?.contractsAllowed(); if (!cur && pendingOpen && get(pendingOpen)) { const id = pendingOpen; pendingOpen = null; renderEditor(id); } else if (!cur && active()) renderHome(); }\n  setMode();", name='nodb')
ct = rep(ct, "  const m = location.hash.match(/^#c-([A-Za-z0-9-]+)$/);\n  if (cur && dirty",
 "  if (!active()) return;\n  const m = location.hash.match(/^#c-([A-Za-z0-9-]+)$/);\n  if (cur && dirty", name='route')
ct = rep(ct, "  if (m) renderEditor(m[1]); else renderHome();\n}",
 "  if (m && cur && cur.id === m[1] && ROOT.querySelector('#desk')) return;\n  if (m) renderEditor(m[1]); else renderHome();\n}", name='route2')
ct = rep(ct, "document.addEventListener('keydown', e => {\n  if (!cur) return;", "document.addEventListener('keydown', e => {\n  if (!cur || !active()) return;", name='keys')
# languages
ct = rep(ct, "  cur = {...c, pages: c.pages.slice()}; dirty = false;", "  cur = {...c, pages: c.pages.slice(), en: (c.en || []).slice(), zh: (c.zh || []).slice()}; lang = 'ko'; dirty = false;", name='curinit')
ct = rep(ct, """    <span class="chip" id="chip"><i></i><span>${canWrite ? '저장됨' : '보기 전용'}</span></span>""",
 """    <span class="chip" id="chip"><i></i><span>${canWrite ? '저장됨' : '보기 전용'}</span></span>
    <div class="lang" id="lang" role="group" aria-label="계약서 언어">${LANGS.map(([l, n]) => `<button data-lg="${l}" aria-label="${n}">${n}</button>`).join('')}</div>""", name='langbar')
ct = rep(ct, """<div class="menu-list" role="menu">""", """<div class="menu-list" role="menu"><p class="mh" id="mh"></p>""", name='menu')
ct = rep(ct, """<button role="menuitem" data-x="docx">독스 파일 (.docx)<small>구글 독스·워드·한글에서 열어요</small></button>""",
 """<button role="menuitem" data-x="docx">독스 파일 (.docx)<small>구글 독스·워드·한글에서 열어요</small></button>
        <hr><button role="menuitem" data-x="all">전체 다운로드 (ZIP)<small>만든 언어 모두 · PDF + DOCX</small></button>""", name='menuall')
ct = rep(ct, "  $('#findb').onclick = openFind; bindFind();", "  $('#findb').onclick = openFind; bindFind();\n  $('#lang').onclick = e => { const b = e.target.closest('[data-lg]'); if (b) switchLang(b.dataset.lg); }; updLang();", name='langwire')
ct = rep(ct, "  const data = {name: ($('#tname').value.trim() || cur.name).slice(0, 120), party: cur.party || '', pages: currentPages(), updatedAt: new Date().toISOString()};",
 "  cur[LK[lang]] = currentPages();\n  const data = {name: ($('#tname').value.trim() || cur.name).slice(0, 120), party: cur.party || '', base: !!cur.base, pages: cur.pages, en: cur.en || [], zh: cur.zh || [], updatedAt: new Date().toISOString()};", name='save')
ct = rep(ct, "pages: src.pages.map(sanitizePage), updatedAt", "pages: src.pages.map(sanitizePage), en: (src.en || []).map(sanitizePage), zh: (src.zh || []).map(sanitizePage), updatedAt", name='dup')
ct = rep(ct, "<span class=\"n\">${c.pages.length}쪽</span>", "<span class=\"n\">${c.pages.length}쪽${langTags(c)}</span>", name='card')
ct = rep(ct, "textCache.set(key, c.pages.map(", "textCache.set(key, [...c.pages, ...(c.en || []), ...(c.zh || [])].map(", name='search')
ct = rep(ct, "function fileBase(){ return (($('#tname')?.value || cur?.name || '계약서').trim().replace(/[\\\\/:*?\"<>|]+/g, ' ')) || '계약서'; }",
 "function baseName(){ return (($('#tname')?.value || cur?.name || '계약서').trim().replace(/[\\\\/:*?\"<>|]+/g, ' ')) || '계약서'; }\nfunction fileBase(){ return baseName() + (lang !== 'ko' ? '_' + lang.toUpperCase() : ''); }", name='fileBase')
ct = rep(ct, "async function makePdf(){\n", "async function makePdf(){\n  if (lang === 'zh') return makePdfImg();\n", name='pdf')
ct = rep(ct, "  const base = fileBase();\n  try {\n    if (kind === 'pdf')", "  if (kind === 'all') return exportAll();\n  const base = fileBase();\n  try {\n    if (kind === 'pdf')", name='exp')
fontline = re.search(r"  const FONT = \{ascii:'Noto Sans KR'[^\n]*\n", ct).group(0)
ct = ct.replace(fontline, "  const FN = lang === 'zh' ? 'Microsoft YaHei' : 'Noto Sans KR';\n  const FONT = {ascii: FN, eastAsia: FN, hAnsi: FN, cs: FN};\n")
LANG_JS = open(H + 'lang.js').read()
ct = rep(ct, "/* ---------- export ---------- */", LANG_JS + "\n/* ---------- export ---------- */", name='langjs')

# ---------------- signature JS ----------------
sg = rep(sg, "const $ = s => document.querySelector(s);",
 "const ROOT = document.getElementById('sg');\nconst GLOBAL_IDS = /^#(toast|modal|mtitle|mtext|mrow|exp|clip|busy)$/;\nconst $ = s => GLOBAL_IDS.test(s) ? document.querySelector(s) : ROOT.querySelector(s);\nconst active = () => /^#?(sign|company|s-[A-Za-z0-9-]+)?$/.test(location.hash);\nconst imgUrl = u => { const h = href(u); return /\\.(png|jpe?g|gif|webp)(\\?[^\\s]*)?$/i.test(h) ? h : ''; };", name='sg$')
sg = rep(sg, "const app = $('#app');", "const app = ROOT;")
n = sg.count("location.hash = ''"); sg = sg.replace("location.hash = ''", "location.hash = 'sign'"); assert n >= 4, n
sg = rep(sg, "  const h = location.hash.replace(/^#/, '');", "  if (!active()) return;\n  const h = location.hash.replace(/^#/, '');", name='sgroute')
sg = rep(sg, "  if (h === 'company') renderCompany(); else if (m) renderEditor(m[1]); else renderHome();",
 "  if (m && cur && (cur.id === m[1] || (cur.isNew && m[1] === 'new')) && ROOT.querySelector('#form')) return;\n  if (h === 'company') renderCompany(); else if (m) renderEditor(m[1]); else renderHome();", name='sgroute2')
sg = rep(sg, "document.addEventListener('keydown', e => {\n  const mod", "document.addEventListener('keydown', e => {\n  if (!active()) return;\n  const mod", name='sgkeys')
sg = rep(sg, "if (!cur && location.hash !== '#company') renderHome();", "if (!cur && location.hash !== '#company' && active()) renderHome();", name='sgsnap')
sg = rep(sg, "const u = href(co.urls?.[id]);", "const u = imgUrl(co.urls?.[id]);", name='u1')
sg = rep(sg, "const hostedU = href(co.urls?.[lg.id]);", "const hostedU = imgUrl(co.urls?.[lg.id]);", name='u2')
sg = rep(sg, "hosted = lg && href(co.urls?.[lg.id]);", "hosted = lg && imgUrl(co.urls?.[lg.id]), wrongUrl = lg && co.urls?.[lg.id] && !hosted;", name='u3')
sg = rep(sg, "ph = lg && !href(co.urls?.[lg.id]);", "ph = lg && !imgUrl(co.urls?.[lg.id]);", name='u4')
sg = rep(sg, "  h.innerHTML = (badMail ?", "  h.innerHTML = (wrongUrl ? `<b style=\"color:var(--warn)\">회사 공통 정보의 로고 공개 주소가 이미지 파일이 아니에요 (${esc(co.urls[lg.id])}). 홈페이지 주소가 아니라 …/logo.png 같은 로고 파일 주소를 넣어야 해요.</b><br>` : '') + (badMail ?", name='u5')
sg = rep(sg, """placeholder="https://…/${l.id}.png" ${canWrite ? '' : 'readonly'}></label></div>`).join('')}</div>""",
 """placeholder="https://…/${l.id}.png" ${canWrite ? '' : 'readonly'}><small class="bad" data-bad="${l.id}"></small></label></div>`).join('')}</div>""", name='u6')
sg = rep(sg, "  app.querySelectorAll('[data-u]').forEach(i => i.oninput = () => { c.urls[i.dataset.u] = i.value.trim(); });",
 "  const chk = i => { const v = i.value.trim(); app.querySelector(`[data-bad=\"${i.dataset.u}\"]`).textContent = v && !imgUrl(v) ? '이미지 파일 주소가 아니에요. 홈페이지 주소 말고 …/로고.png 처럼 파일 주소를 넣어 주세요. 이 값은 쓰지 않아요.' : ''; };\n  app.querySelectorAll('[data-u]').forEach(i => { chk(i); i.oninput = () => { c.urls[i.dataset.u] = i.value.trim(); chk(i); }; });", name='u7')
sg = rep(sg, "LOGOS.forEach(l => { const u = href(c.urls[l.id]); if (u) o.urls[l.id] = u; });", "LOGOS.forEach(l => { const u = imgUrl(c.urls[l.id]); if (u) o.urls[l.id] = u; });", name='u8')


sg_css_fix = None
sg = rep(sg, "/* ---------- company settings ---------- */", """/* ---------- logo files ---------- */
async function saveBlob(name, blob){
  if (!dl) { toast('이 화면에서는 파일 저장을 쓸 수 없어요. claude.ai에서 열어 주세요.'); return false; }
  try { await dl.save({filename: name, data: blob}); return true; }
  catch (e) { toast(e?.code === 'declined' ? '저장을 취소했어요.' : e?.code === 'rate_limited' ? '앞의 저장 창을 먼저 마쳐 주세요.' : '파일을 저장하지 못했어요.'); return false; }
}
const logoName = l => `${l.brand.split(' ').join('_')}${l.v ? '_' + l.v : ''}`;
async function dlOne(id){ const l = LOGOS.find(x => x.id === id); if (!l) return; try { const b = await (await fetch(l.file)).blob(); if (await saveBlob(logoName(l) + '.png', b)) toast(`${l.brand} ${l.v} 로고를 저장했어요.`); } catch { toast('로고 파일을 불러오지 못했어요.'); } }
async function dlAll(){
  try {
    if (!window.JSZip) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const zip = new JSZip();
    for (const l of LOGOS) zip.file(logoName(l) + '.png', await (await fetch(l.file)).blob());
    const b = await zip.generateAsync({type: 'blob'});
    if (await saveBlob('OPK_로고_7종.zip', b)) toast('로고 7종을 ZIP으로 저장했어요.');
  } catch { toast('로고 묶음을 만들지 못했어요.'); }
}

/* ---------- company settings ---------- */""", name='logodl')
sg = rep(sg, """    <div class="grp"><h4>로고 공개 주소 (선택)</h4>""", """    <div class="grp"><div class="inline" style="justify-content:space-between"><h4 style="margin:0;font-size:13px;color:var(--mute)">로고 파일 · 공개 주소 (선택)</h4><button type="button" class="btn" id="dlAll">로고 모두 받기 (ZIP)</button></div>""", name='dlhead')
sg = rep(sg, """<small class="bad" data-bad="${l.id}"></small></label></div>`).join('')}</div>""", """<small class="bad" data-bad="${l.id}"></small></label><button type="button" class="btn" data-dl="${l.id}" aria-label="${esc(l.brand + ' ' + l.v)} PNG 받기">PNG</button></div>`).join('')}</div>""", name='dlrow')
sg = rep(sg, "  $('#clay').onclick =", "  $('#dlAll').onclick = dlAll; app.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => dlOne(b.dataset.dl));\n  $('#clay').onclick =", name='dlwire')
sg = rep(sg, """<button class="btn" id="dlg">로고 PNG 받기</button>""", """<button class="btn" id="dlg">로고 PNG 받기 (서명 크기)</button>""", name='dlg')

sg = rep(sg, "s.taglineEn && esc(s.taglineEn)", "(s.taglineEn || s.tagline) && esc(s.taglineEn || s.tagline)", name='tl1')
sg = rep(sg, "s.taglineEn], ' — ')", "s.taglineEn || s.tagline], ' — ')", name='tl2')
sg = sg.replace("'대외용 한 줄 소개', '슬라이딩 도어·창호 시스템 전문'", "'대외용 한 줄 소개', '국문 대외용에 들어가요. 영문 소개가 비어 있으면 국영문 대외용에도 들어가요'")
sg = sg.replace("'영문 한 줄 소개 (국영문 대외용)'", "'영문 한 줄 소개 (국영문 대외용)'")
sg = rep(sg, "if (cur && dirty && canWrite && (!m || m[1] !== cur.id)) {", "if (cur && dirty && canWrite && (!m || (m[1] !== cur.id && !(cur.isNew && m[1] === 'new')))) {", name='sgdirty')
ct = rep(ct, """  <div class="findbar" id="fb" hidden role="search">""", """  <div class="tbt ftb" id="ftb" hidden role="toolbar" aria-label="글자 서식"><div class="tg"><span>글자</span><button data-f="bold" title="굵게 (Ctrl+B)" aria-label="굵게"><b>B</b></button><button data-f="down" title="작게" aria-label="글자 작게">가−</button><button data-f="up" title="크게" aria-label="글자 크게">가+</button></div><div class="tg"><span>정렬</span><button class="ic" data-f="left" title="왼쪽 정렬" aria-label="왼쪽 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 9h9M3 13h14M3 17h9"/></svg></button><button class="ic" data-f="center" title="가운데 정렬" aria-label="가운데 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M5.5 9h9M3 13h14M5.5 17h9"/></svg></button><button class="ic" data-f="right" title="오른쪽 정렬" aria-label="오른쪽 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M8 9h9M3 13h14M8 17h9"/></svg></button></div><div class="tg"><span>색</span>${['#111111','#555555','#4a8a1a','#c4363a','#1f5fbf'].map(col => `<button class="sw" data-c="${col}" style="background:${col}" title="${col}" aria-label="${col} 글자색"></button>`).join('')}<button data-c="" title="기본색">기본</button></div><div class="tg tbl" hidden><span>행</span><button data-t="rowup" title="위에 행 추가">↑ 추가</button><button data-t="rowdn" title="아래에 행 추가">↓ 추가</button><button data-t="rowdel" title="행 삭제">삭제</button></div><div class="tg tbl" hidden><span>열</span><button data-t="colL" title="왼쪽에 열 추가">← 추가</button><button data-t="colR" title="오른쪽에 열 추가">→ 추가</button><button data-t="coldel" title="열 삭제">삭제</button></div><div class="tg tbl" hidden><span>칸 색</span><select id="scope2" aria-label="칸 색 칠할 범위"><option value="cell">칸</option><option value="row">행</option><option value="col">열</option></select>${['#ffffff','#f5f5f5','#eef5e7','#dceccd','#fff6dc','#fde8e8','#e7eefa'].map(col => `<button class="sw" data-bg="${col}" style="background:${col}" title="${col}" aria-label="${col} 칸 칠하기"></button>`).join('')}<button data-bg="" title="칸 색 지우기">없음</button></div></div>
  <div class="findbar" id="fb" hidden role="search">""", name='ftbhtml')
ct = rep(ct, "  const tg = $('#editTgl'); if (tg) tg.onclick = () => setEdit(!editOn);", "  wireFTB();\n  const tg = $('#editTgl'); if (tg) tg.onclick = () => setEdit(!editOn);", name='ftbwire')
ct = rep(ct, "  fitPages(); hideTT(); hideSTB();\n}", "  fitPages(); hideTT(); hideSTB(); hideFTB();\n}", name='ftbmount')
ct = rep(ct, "desk.addEventListener('mouseover', e => { if (!editOn || !canWrite) return; const sec = e.target.closest('section.art'); if (sec && sec !== curSec) showSTB(sec); });",
 "const secPick = e => { if (!editOn || !canWrite) return; const h2 = e.target.closest('section.art > h2'); const sec = h2 && h2.parentElement; if (sec) { if (sec !== curSec) showSTB(sec); } else hideSTB(); };\n  desk.addEventListener('click', secPick); desk.addEventListener('focusin', secPick); desk.addEventListener('click', e => { if (!e.target.closest('[data-ed]')) hideFTB(); });\n  document.addEventListener('mousedown', e => { if (!ROOT.contains(e.target) || !e.target.closest('#desk, #stb, #ftb, #tt')) { hideSTB(); if (!e.target.closest('#ftb')) hideFTB(); } });", name='stbclick')
sg = rep(sg, "file:'logos/korea_hor.png', w:439", "file:'logos/korea_hor.png', w:440", name='w440')
ct = rep(ct, """  const tt = $('#tt'); tt.hidden = false;
  const t = cell.closest('table').getBoundingClientRect();
  const top = Math.max(70, t.top - tt.offsetHeight - 8);
  tt.style.top = top + 'px'; tt.style.left = Math.max(8, Math.min(t.left, innerWidth - tt.offsetWidth - 8)) + 'px';
}""", """  showFTB(cell);
}""", name='tt2ftb')
ct = rep(ct, "    const hdr = np.querySelector('header'); const sec = anySec ? emptySection(anySec) : null;\n    if (sec) (hdr ? hdr.after(sec) : np.prepend(sec));",
 "    const hdr = np.querySelector('header'); const sec = anySec ? emptySection(anySec) : null;\n    if (sec) (hdr ? hdr.after(sec) : np.prepend(sec));\n    const sigBlk = [...last.children].find(ch => ch.tagName === 'DIV' && ch.querySelectorAll('table').length >= 2 && /\\(인\\)/.test(ch.textContent));\n    if (sigBlk) { const foot = [...np.children].find(ch => ch.tagName === 'P' && ch.querySelectorAll('span').length >= 2 && /\\d+\\s*\\/\\s*\\d+\\s*$/.test(ch.textContent)); np.insertBefore(sigBlk, foot || null); }", name='sigmove')
# 11-27 사용성: 고르는 것마다 한 줄 설명이 붙은 세로 목록, 취소는 맨 아래 따로
ct = rep(ct, "[['취소', null, 'ghost'], ['빈 계약서', '__blank'], ...list().filter(c => c.base).map(c => [c.name + ' 사본', c.id])]", "[['사진으로 만들기', '__photo', 'opt', '계약서 사진을 올리면 AI가 읽어 OPK 양식으로 만들어요'], ['빈 계약서', '__blank', 'opt', '제목 · 당사자 · 서명란만 있는 새 양식에서 시작해요'], ...list().filter(c => c.base).map(c => [c.name + ' 사본', c.id, 'opt', '이 예시 양식을 그대로 복사해서 고쳐 써요']), ['취소', null, 'ghost']]", name='photoopt')
ct = rep(ct, "  if (v === '__blank') createBlank(); else if (v) duplicate(v);", "  if (v === '__photo') createFromPhoto(); else if (v === '__blank') createBlank(); else if (v) duplicate(v);", name='photorun')
ct = ct.replace("'빈 계약서는 제목·당사자·서명란만 있는 새 양식이에요. 조항은 편집 화면에서 더해요.'", "'만든 뒤에는 바로 편집 화면이 열려요.'")
sg = rep(sg, "const imgUrl = u =>", "const hostUrl = id => imgUrl(co.urls?.[id]) || (window.OPK_PUBLIC_ORIGIN ? window.OPK_PUBLIC_ORIGIN + '/' + (LOGOS.find(l => l.id === id)?.file || '') : '');\nconst imgUrl = u =>", name='hu0')
sg = rep(sg, "const u = imgUrl(co.urls?.[id]);", "const u = hostUrl(id);", name='hu1')
sg = rep(sg, "const hostedU = imgUrl(co.urls?.[lg.id]);", "const hostedU = hostUrl(lg.id);", name='hu2')
sg = rep(sg, "hosted = lg && imgUrl(co.urls?.[lg.id]),", "hosted = lg && hostUrl(lg.id),", name='hu3')
sg = rep(sg, "ph = lg && !imgUrl(co.urls?.[lg.id]);", "ph = lg && !hostUrl(lg.id);", name='hu4')
import re as _re
_ftb = '<div class="tbt ftb" id="ftb" hidden role="toolbar" aria-label="서식">\n  <div class="fr">\n    <button data-f="bold" class="ic" title="굵게 (Ctrl+B)" aria-label="굵게"><b style="font-size:14px">B</b></button>\n    <button data-f="down" class="ic" title="글자 작게" aria-label="글자 작게"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10"/></svg></button><input id="fsz" type="number" min="8" max="48" step="1" inputmode="numeric" title="글자 크기 (px) — 숫자를 넣고 Enter" aria-label="글자 크기"><button data-f="up" class="ic" title="글자 크게" aria-label="글자 크게"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10M10 5v10"/></svg></button>\n    <span class="sep"></span>\n    <button class="ic" data-f="left" title="왼쪽 정렬" aria-label="왼쪽 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 9h9M3 13h14M3 17h9"/></svg></button>\n    <button class="ic" data-f="center" title="가운데 정렬" aria-label="가운데 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M5.5 9h9M3 13h14M5.5 17h9"/></svg></button>\n    <button class="ic" data-f="right" title="오른쪽 정렬" aria-label="오른쪽 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M8 9h9M3 13h14M8 17h9"/></svg></button>\n    <span class="pop"><button class="ic wide" data-pop="ls" title="번호·말머리표" aria-label="번호·말머리표" aria-haspopup="true"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="5.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="14.5" r="1.3" fill="currentColor" stroke="none"/><path d="M8.5 5.5h8.5M8.5 10h8.5M8.5 14.5h8.5"/></svg><svg class="car" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4l3 3 3-3"/></svg></button>\n      <span class="pp" hidden><span class="lab">줄 앞</span>${[[\'n\',\'1.\',\'번호 1. 2. 3.\'],[\'c\',\'①\',\'원문자 번호 ① ② ③\'],[\'●\',\'●\',\'검은 동그라미\'],[\'○\',\'○\',\'흰 동그라미\'],[\'•\',\'•\',\'작은 점\'],[\'■\',\'■\',\'네모\'],[\'-\',\'-\',\'줄표\'],[\'※\',\'※\',\'참고\']].map(([v, s, n]) => `<button class="txt" data-l="${v}" title="${n}" aria-label="${n}">${s}</button>`).join(\'\')}<button class="txt" data-l="" title="표시 지우기">없음</button></span></span>\n    <button class="ic" data-f="cal" title="날짜 고르기 (날짜 글자를 두 번 눌러도 열려요)" aria-label="날짜 고르기"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4"/><circle cx="10" cy="12.7" r="1.1" fill="currentColor" stroke="none"/></svg></button>\n    <span class="sep"></span>\n    <span class="pop"><button class="ic wide" data-pop="fc" title="글자색" aria-label="글자색" aria-haspopup="true"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 13l4-9 4 9M7.3 10h5.4"/><rect x="4" y="15.5" width="12" height="2.5" rx="1" fill="#4a8a1a" stroke="none"/></svg><svg class="car" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4l3 3 3-3"/></svg></button>\n      <span class="pp" hidden><span class="lab">글자색</span>${[[\'#111111\',\'검정\'],[\'#555555\',\'회색\'],[\'#4a8a1a\',\'초록\'],[\'#c4363a\',\'빨강\'],[\'#1f5fbf\',\'파랑\']].map(([col, n]) => `<button class="sw" data-c="${col}" style="background:${col}" title="${n}" aria-label="${n} 글자색"></button>`).join(\'\')}<button class="txt" data-c="" title="기본색">기본</button></span></span>\n  </div>\n  <div class="fr tbl" hidden>\n    <span class="lab">행</span>\n    <button class="ic" data-t="rowup" title="위에 행 추가" aria-label="위에 행 추가"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="10" width="14" height="7" rx="1"/><path d="M10 2.5v5M7.5 5h5"/></svg></button>\n    <button class="ic" data-t="rowdn" title="아래에 행 추가" aria-label="아래에 행 추가"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="7" rx="1"/><path d="M10 12.5v5M7.5 15h5"/></svg></button>\n    <button class="ic" data-t="rowdel" title="행 삭제" aria-label="행 삭제"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="6.5" width="14" height="7" rx="1"/><path d="M8 8.5l4 3M12 8.5l-4 3"/></svg></button>\n    <span class="sep"></span>\n    <span class="lab">열</span>\n    <button class="ic" data-t="colL" title="왼쪽에 열 추가" aria-label="왼쪽에 열 추가"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="10" y="3" width="7" height="14" rx="1"/><path d="M2.5 10h5M5 7.5v5"/></svg></button>\n    <button class="ic" data-t="colR" title="오른쪽에 열 추가" aria-label="오른쪽에 열 추가"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="7" height="14" rx="1"/><path d="M12.5 10h5M15 7.5v5"/></svg></button>\n    <button class="ic" data-t="coldel" title="열 삭제" aria-label="열 삭제"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="3" width="7" height="14" rx="1"/><path d="M8.5 8l3 4M11.5 8l-3 4"/></svg></button>\n    <span class="sep"></span>\n    <button data-t="merge" title="고른 칸 합치기 (칸을 드래그하거나 Shift+클릭으로 고른 뒤 · Ctrl+M)" aria-label="칸 합치기"><svg viewBox="0 0 20 20" aria-hidden="true" style="margin-right:3px;vertical-align:-4px"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M6 10h8M11.5 7.5 14 10l-2.5 2.5M8.5 7.5 6 10l2.5 2.5"/></svg>합치기</button>\n    <button data-t="split" title="합쳐진 칸 나누기" aria-label="칸 나누기"><svg viewBox="0 0 20 20" aria-hidden="true" style="margin-right:3px;vertical-align:-4px"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M10 4v12M3 10h14"/></svg>나누기</button>\n    <span class="pop"><button class="ic wide" data-pop="bg" title="칸 배경색" aria-label="칸 배경색" aria-haspopup="true"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 11l6-7 6 7-6 6z"/><path d="M16.5 13.5c0 1.5 1.5 1.5 1.5 0l-.75-1.5z" fill="currentColor"/></svg><span style="font-size:12px">칸 색</span><svg class="car" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4l3 3 3-3"/></svg></button>\n      <span class="pp" hidden><select id="scope2" aria-label="칠할 범위"><option value="cell">이 칸</option><option value="row">이 행</option><option value="col">이 열</option></select>${[\'#ffffff\',\'#f5f5f5\',\'#eef5e7\',\'#dceccd\',\'#fff6dc\',\'#fde8e8\',\'#e7eefa\'].map(col => `<button class="sw" data-bg="${col}" style="background:${col}" title="${col}" aria-label="${col} 칸 칠하기"></button>`).join(\'\')}<button class="txt" data-bg="" title="칸 색 지우기">없음</button></span></span>\n  </div>\n</div>'
_m = _re.search(r'<div class="tbt ftb" id="ftb".*?</div></div>\n  <div class="findbar"', ct, _re.S)
assert _m, 'ftb block'
ct = ct[:_m.start()] + _ftb + '\n  <div class="findbar"' + ct[_m.end():]
ct = rep(ct, """  <div class="findbar" id="fb" hidden role="search">""", """  <div class="tbt ib" id="ib" hidden role="toolbar" aria-label="내용 넣기"><span class="lab">여기에 넣기</span><button data-i="para" title="이 조항 아래에 단락(글) 넣기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 9h12M4 13h8"/></svg>단락</button><button data-i="table" title="이 조항에 표 넣기"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M3 8h14M3 12h14M9 4v12"/></svg>표</button><button data-i="sec" title="아래에 새 조항 넣기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>조항</button></div>
  <div class="findbar" id="fb" hidden role="search">""", name='ibhtml')
ct = rep(ct, "  wireFTB();\n", "  wireFTB(); wireIB();\n", name='ibwire')
sg = rep(sg, '<div class="note" id="hint"></div>', '<div class="note" id="hint"></div>\n      <details class="note guide" open><summary><b>비즈메카 메일에 서명 넣는 법</b></summary>\n        <ol>\n          <li>위 <b>서명 복사</b>를 눌러요.</li>\n          <li>비즈메카에서 <b>메일</b>로 들어가요.</li>\n          <li>왼쪽 빨간 글씨 <b>개인메일함</b> 옆 <b>톱니(설정)</b> 버튼을 눌러요.</li>\n          <li>왼쪽 <b>부가기능 설정 → 서명 관리</b>로 가요.</li>\n          <li><b>추가</b>를 누르고 <b>서명 제목</b>을 넣어요 (예: 기본 서명). 제목이 비어 있으면 저장이 안 돼요.</li>\n          <li>서명 내용 칸을 누르고 <b>Ctrl+V</b>로 붙여 넣은 뒤 <b>저장</b>해요.</li>\n        </ol>\n        <p style="margin:6px 0 0">붙여 넣은 서명이 미리보기와 다르게 보이면 <b>HTML 코드 복사</b>로 복사해서 편집기의 HTML(소스) 모드에 붙여 넣어 보세요.</p>\n      </details>', name='bizguide')

ORG_JS = open(H + 'org.js').read()
sg = rep(sg, "/* ---------- company settings ---------- */", ORG_JS + "\n/* ---------- company settings ---------- */", name='orgjs')
sg = rep(sg, "  if (isNew && canWrite) form.querySelector('[data-k=\"nameKo\"]').focus();", "  attachCombos(form);\n  if (isNew && canWrite) form.querySelector('[data-k=\"nameKo\"]').focus();", name='orgattach')
sg = rep(sg, """    <div class="grp"><h4>새 서명 기본값</h4>""", """    <div class="grp"><h4>조직도 (이름·직함·부서 자동완성에 쓰여요)</h4><div id="orgw">${orgEditorHTML(c.org)}</div></div>
    <div class="grp"><h4>새 서명 기본값</h4>""", name='orgui')
sg = rep(sg, "  const c = {...co, urls: {...(co.urls || {})}};", "  const c = {...co, urls: {...(co.urls || {})}, org: orgList().map(p => ({...p}))};", name='orgc')
sg = rep(sg, "o.logoH = c.logoH || 44; o.urls = {};", "o.logoH = c.logoH || 44; o.org = (c.org || []).filter(p => p.nameKo || p.nameEn).map(p => { const q = {}; ['nameKo','nameEn','titleKo','titleEn','deptKo','deptEn','logo'].forEach(k => { if (p[k]) q[k] = String(p[k]).slice(0, 80); }); return q; }); o.urls = {};", name='orgclean')
sg = rep(sg, "  $('#dlAll').onclick = dlAll;", """  const orgw = $('#orgw');
  const orgRe = () => { orgw.innerHTML = orgEditorHTML(c.org); bindOrg(); };
  const bindOrg = () => { orgw.querySelectorAll('[data-o]').forEach(i => i.oninput = () => { const [n, k] = i.dataset.o.split(':'); c.org[+n][k] = i.value; }); orgw.querySelectorAll('[data-odel]').forEach(b => b.onclick = () => { c.org.splice(+b.dataset.odel, 1); orgRe(); }); const a = $('#oadd'); if (a) a.onclick = () => { c.org.push({nameKo: '', nameEn: '', titleKo: '', titleEn: '', deptKo: '', deptEn: ''}); orgRe(); orgw.querySelector('.org-r:last-child input')?.focus(); }; };
  bindOrg();
  $('#dlAll').onclick = dlAll;""", name='orgbind')
# back buttons
BACK = '<button class="btn ghost back" id="back" aria-label="목록으로"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>목록</button>'
ct = rep(ct, '<button class="btn ghost" id="back" aria-label="목록으로">← 목록</button>', BACK, name='ctback')
n = sg.count('<button class="btn ghost" id="back">← 목록</button>'); assert n == 2, n
sg = sg.replace('<button class="btn ghost" id="back">← 목록</button>', BACK)
# ---------------- page ----------------
LOGO_SVG = re.search(r"const LOGO_SVG = '(.*?)';", sg).group(1)
tpl_small = {'logo': tpl['logo'], 'Blank': blank}
SHELL1 = open(H + 'shell1.js').read()
SHELL2 = open(H + 'shell2.js').read()
SHELL3 = open(H + 'shell3.js').read()
html = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OPK 업무 도구</title>
<style>
/*
VOICE: 조용한 사무실 서랍장. 도구는 서랍 하나씩, 밝은 것은 종이(계약서)와 메일 한 통뿐.
IDEA: 왼쪽 서랍 라벨(사이드 메뉴)을 당기면 그 서랍의 작업대가 펼쳐진다.
PICTURE: 각 도구의 실제 결과물 — A4 계약서 원본, 받는 사람 메일 화면.
COLOUR and TYPE: 먹색/종이색 두 테마, OPK 그린 #6eb92b 하나. Pretendard 4단계.
LAYOUT: 왼쪽 208px 고정 메뉴, 오른쪽 작업대. 800px 아래는 메뉴가 아래 탭 막대로.
*/
{SHELL_CSS}
{ct_out}
{sg_out}
</style>
</head>
<body>
<nav class="nav" aria-label="업무 도구">
  <div class="logo">{LOGO_SVG.replace('#ededeb', 'currentColor')}<b>업무 도구</b><button class="navtg" id="navTg" aria-label="메뉴 접기" aria-expanded="true" title="메뉴 접기·펴기"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/></svg></button></div>
  <a href="#contracts" id="navCt" data-tool="ct" title="계약서" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg><span>계약서</span></a>
  <a href="#sign" id="navSg" data-tool="sg" title="메일 서명"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 7 9 6 9-6"/></svg><span>메일 서명</span></a>
  <div class="foot"><button class="thc" id="thc" aria-label="화면 밝기 바꾸기"></button><p class="label">화면</p><div class="theme" role="group" aria-label="화면 밝기"><button data-t="auto">자동</button><button data-t="light">라이트</button><button data-t="dark">다크</button></div></div>
</nav>
<main class="main"><div id="ct" hidden></div><div id="sg" hidden></div></main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="mtitle"><div class="dlg"><h4 id="mtitle"></h4><p id="mtext"></p><div class="row" id="mrow"></div></div></div>
<div class="exp" id="exp" aria-hidden="true"></div>
<div id="clip" aria-hidden="true"></div>
<script type="application/json" id="tpl">{json.dumps(tpl_small, ensure_ascii=False).replace("<", "\\u003c")}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script>
{SHELL1}
</script>
<script>{ct}</script>
<script>{sg}</script>
<script>
{SHELL2}
</script>
<script>
{SHELL3}
</script>
</body>
</html>
'''
os.makedirs(H + 'out', exist_ok=True)
# 1) claude.ai 아티팩트용 (claude.use 그대로)
os.makedirs(H + 'out', exist_ok=True)
open(H + 'out/index.html', 'w').write(html)
# 2) Cloudflare 배포용: jsPDF 다음에 cf-shim.js (claude.use → /api)
JSPDF = '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>'
assert html.count(JSPDF) == 1
open(H + '../public/index.html', 'w').write(html.replace(JSPDF, JSPDF + '\n<script src="cf-shim.js"></script>'))
print('ok', len(html))
