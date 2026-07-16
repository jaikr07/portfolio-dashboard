import {mode,signOut,isCloudConfigured} from './data-service.js?v=4.0';
import {setAuthBadge,setStatus} from './shell.js';
export async function updateModeBadge(lastUpdated=''){
  const m=await mode();setAuthBadge(m==='cloud'?'Cloud synced':'Local mode',m==='cloud'?'positive':'neutral');
  const extra=lastUpdated?` • Market data ${new Date(lastUpdated).toLocaleString()}`:'';setStatus(`${m==='cloud'?'Supabase protected data':'Browser-only data'}${extra}`);
  const button=document.getElementById('globalSignOutBtn');
  if(button&&isCloudConfigured()&&m==='cloud'){
    button.hidden=false;
    button.onclick=async()=>{if(confirm('Sign out of this device?')){await signOut();location.reload();}};
  }
}
export function bindModal(id,openId,closeIds=[]){const modal=document.getElementById(id),open=document.getElementById(openId);open?.addEventListener('click',()=>modal.classList.add('open'));for(const cid of closeIds)document.getElementById(cid)?.addEventListener('click',()=>modal.classList.remove('open'));modal?.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')})}
