import {cfg,esc} from './utils.js';
import {isCloudConfigured,session,signIn} from './data-service.js?v=4.0';
import {initPwa} from './pwa.js?v=4.0';

function loginMarkup(){
  return `<main class="auth-screen">
    <section class="auth-card">
      <div class="auth-logo">PC</div>
      <span class="eyebrow">Private cloud portfolio</span>
      <h1>${esc(cfg.APP_NAME||'Portfolio Command Center')}</h1>
      <p>Sign in to access your Zerodha and m.Stock portfolio on this device.</p>
      <form id="globalLoginForm" class="auth-form">
        <label>Email address<input class="input" type="email" name="email" autocomplete="username" required></label>
        <label>Password<input class="input" type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary auth-submit" type="submit">Sign in</button>
      </form>
      <div id="globalLoginMessage" class="import-message"></div>
      <p class="auth-footnote">Your portfolio records are protected by Supabase login and row-level security. Market snapshots remain end-of-day.</p>
    </section>
  </main>`;
}

export async function ensureAuthenticated(){
  initPwa();
  if(!isCloudConfigured() || cfg.REQUIRE_LOGIN_WHEN_CLOUD_CONFIGURED===false)return null;
  const current=await session();
  if(current)return current;
  document.body.innerHTML=loginMarkup();
  const form=document.getElementById('globalLoginForm');
  const message=document.getElementById('globalLoginMessage');
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form));
    const button=form.querySelector('button');
    button.disabled=true;button.textContent='Signing in…';
    try{
      await signIn(values.email,values.password);
      location.reload();
    }catch(error){
      message.textContent=error.message||'Sign-in failed.';
      message.className='import-message negative';
      button.disabled=false;button.textContent='Sign in';
    }
  });
  await new Promise(()=>{});
}
