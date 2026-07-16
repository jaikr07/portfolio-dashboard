import {cfg, esc} from './utils.js';
import {wireInstallButton} from './pwa.js?v=4.2';
const BRAND_NAME='JKR Investments';
const nav=[
  ['../index.html','⌂','Overview','overview'],['holdings.html','▦','Holdings','holdings'],['technicals.html','⌁','Technicals','technicals'],['transactions.html','⇄','Transactions','transactions'],['results.html','▤','Results','results'],['announcements.html','◉','News & Announcements','announcements'],['settings.html','⚙','Settings','settings']
];
function themeChoice(){return localStorage.getItem('portfolioTheme')||'system'}
function resolvedTheme(choice=themeChoice()){
  if(choice==='system')return matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  return choice==='light'?'light':'dark';
}
export function applyTheme(choice=themeChoice()){
  localStorage.setItem('portfolioTheme',choice);
  document.documentElement.dataset.theme=resolvedTheme(choice);
  document.documentElement.dataset.themeChoice=choice;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=resolvedTheme(choice)==='light'?'#eef3f9':'#07111f';
}
applyTheme();
const media=matchMedia('(prefers-color-scheme: light)');
media.addEventListener?.('change',()=>{if(themeChoice()==='system')applyTheme('system')});
export function mountShell(active,title,subtitle=''){
  const isRoot=location.pathname.endsWith('/index.html')||location.pathname.endsWith('/')||!location.pathname.includes('/pages/');
  const prefix=isRoot?'pages/':'';
  const overview=isRoot?'index.html':'../index.html';
  const assetPrefix=isRoot?'':'../';
  const links=nav.map(([href,icon,label,key])=>{
    let final=key==='overview'?overview:(isRoot?prefix+href:href);
    return `<a href="${final}" class="${active===key?'active':''}"><span class="icon">${icon}</span><span>${label}</span></a>`;
  }).join('');
  document.body.innerHTML=`<div class="app-shell">
    <div class="nav-scrim" id="navScrim"></div>
    <aside class="sidebar" id="sidebar"><div class="brand"><picture class="brand-picture"><source media="(prefers-color-scheme: light)" srcset="${assetPrefix}assets/icons/jkr-light.png"><img class="brand-logo brand-logo-light" src="${assetPrefix}assets/icons/jkr-light.png" alt="JKR Investments"><img class="brand-logo brand-logo-dark" src="${assetPrefix}assets/icons/jkr-dark.png" alt="JKR Investments"></picture><div><h1>${BRAND_NAME}</h1><p>Quality • Conviction • Compounding</p></div></div><nav class="nav">${links}</nav><div class="sidebar-footer"><strong>Data note</strong><br>Signals are decision aids, not buy/sell advice. Verify exchange filings and prices before acting.</div></aside>
    <main class="main"><header class="topbar"><div class="topbar-left"><button class="btn ghost menu-btn" id="menuBtn" aria-label="Open navigation">☰</button><div><div class="page-title">${esc(title)}</div><div class="status-line" id="statusLine">Loading portfolio…</div></div></div><div class="topbar-actions"><select id="themeSelect" class="theme-select" aria-label="Color theme"><option value="system">◐ System</option><option value="dark">☾ Dark</option><option value="light">☀ Light</option></select><button class="btn ghost" id="installBtn" hidden>⬇ Install app</button><button class="btn ghost" id="privacyBtn" title="Hide/show amounts">◉ Privacy</button><span id="authBadge" class="badge neutral">Local mode</span><button class="btn ghost" id="globalSignOutBtn" hidden>Sign out</button></div></header><section class="content" id="pageContent"></section></main></div>`;
  const sidebar=document.getElementById('sidebar');
  const scrim=document.getElementById('navScrim');
  const closeNav=()=>{sidebar?.classList.remove('open');scrim?.classList.remove('open');document.body.classList.remove('nav-open')};
  document.getElementById('menuBtn')?.addEventListener('click',()=>{const opening=!sidebar.classList.contains('open');sidebar.classList.toggle('open',opening);scrim?.classList.toggle('open',opening);document.body.classList.toggle('nav-open',opening)});
  scrim?.addEventListener('click',closeNav);
  sidebar?.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeNav));
  const themeSelect=document.getElementById('themeSelect');
  themeSelect.value=themeChoice();
  themeSelect.addEventListener('change',()=>applyTheme(themeSelect.value));
  const priv=localStorage.getItem('privacyMode') ?? String(cfg.PRIVACY_MODE_DEFAULT!==false);
  if(priv==='true')document.body.classList.add('privacy-mask');
  document.getElementById('privacyBtn')?.addEventListener('click',()=>{document.body.classList.toggle('privacy-mask');localStorage.setItem('privacyMode',document.body.classList.contains('privacy-mask'))});
  if(subtitle) document.getElementById('statusLine').textContent=subtitle;
  wireInstallButton();
}
export function setStatus(text){const el=document.getElementById('statusLine');if(el)el.textContent=text}
export function setAuthBadge(text,cls='neutral'){const el=document.getElementById('authBadge');if(el){el.textContent=text;el.className=`badge ${cls}`}}
