import {cfg, esc} from './utils.js';
import {wireInstallButton} from './pwa.js?v=4.0';
const nav=[
  ['../index.html','⌂','Overview','overview'],['holdings.html','▦','Holdings','holdings'],['technicals.html','⌁','Technicals','technicals'],['transactions.html','⇄','Transactions','transactions'],['results.html','▤','Results','results'],['announcements.html','◉','News & Announcements','announcements'],['settings.html','⚙','Settings','settings']
];
export function mountShell(active,title,subtitle=''){
  const isRoot=location.pathname.endsWith('/index.html')||location.pathname.endsWith('/')||!location.pathname.includes('/pages/');
  const prefix=isRoot?'pages/':'';
  const overview=isRoot?'index.html':'../index.html';
  const links=nav.map(([href,icon,label,key])=>{
    let final=key==='overview'?overview:(isRoot?prefix+href:href);
    return `<a href="${final}" class="${active===key?'active':''}"><span class="icon">${icon}</span>${label}</a>`;
  }).join('');
  document.body.innerHTML=`<div class="app-shell">
    <aside class="sidebar" id="sidebar"><div class="brand"><div class="brand-mark">PC</div><div><h1>${esc(cfg.APP_NAME||'Portfolio Command Center')}</h1><p>Research • Risk • Returns</p></div></div><nav class="nav">${links}</nav><div class="sidebar-footer"><strong>Data note</strong><br>Signals are decision aids, not buy/sell advice. Verify exchange filings and prices before acting.</div></aside>
    <main class="main"><header class="topbar"><div class="topbar-left"><button class="btn ghost menu-btn" id="menuBtn">☰</button><div><div class="page-title">${esc(title)}</div><div class="status-line" id="statusLine">Loading portfolio…</div></div></div><div class="topbar-actions"><button class="btn ghost" id="installBtn" hidden>⬇ Install app</button><button class="btn ghost" id="privacyBtn" title="Hide/show amounts">◉ Privacy</button><span id="authBadge" class="badge neutral">Local mode</span><button class="btn ghost" id="globalSignOutBtn" hidden>Sign out</button></div></header><section class="content" id="pageContent"></section></main></div>`;
  document.getElementById('menuBtn')?.addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
  const priv=localStorage.getItem('privacyMode') ?? String(cfg.PRIVACY_MODE_DEFAULT!==false);
  if(priv==='true')document.body.classList.add('privacy-mask');
  document.getElementById('privacyBtn')?.addEventListener('click',()=>{document.body.classList.toggle('privacy-mask');localStorage.setItem('privacyMode',document.body.classList.contains('privacy-mask'))});
  if(subtitle) document.getElementById('statusLine').textContent=subtitle;
  wireInstallButton();
}
export function setStatus(text){const el=document.getElementById('statusLine');if(el)el.textContent=text}
export function setAuthBadge(text,cls='neutral'){const el=document.getElementById('authBadge');if(el){el.textContent=text;el.className=`badge ${cls}`}}
