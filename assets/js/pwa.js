let deferredPrompt = null;
let registered = false;

export function initPwa(){
  if(registered) return;
  registered = true;
  if('serviceWorker' in navigator){
    const swUrl = new URL('../../service-worker.js', import.meta.url);
    const scopeUrl = new URL('../../', import.meta.url);
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register(swUrl.href,{scope:scopeUrl.pathname}).catch(err=>console.warn('Service worker registration failed',err));
    });
  }
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    document.dispatchEvent(new CustomEvent('portfolio-install-ready'));
  });
  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    document.dispatchEvent(new CustomEvent('portfolio-installed'));
  });
}

export function wireInstallButton(){
  const button=document.getElementById('installBtn');
  if(!button)return;
  const standalone=window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
  if(standalone){button.hidden=true;return;}
  const refresh=()=>{button.hidden=!deferredPrompt;};
  refresh();
  document.addEventListener('portfolio-install-ready',refresh,{once:true});
  document.addEventListener('portfolio-installed',()=>button.hidden=true,{once:true});
  button.addEventListener('click',async()=>{
    if(!deferredPrompt)return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt=null;
    button.hidden=true;
  });
}
