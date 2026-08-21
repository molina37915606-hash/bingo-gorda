(()=>{'use strict';
const NAMESPACE='urn:x-cast:la.gorda.bingo';
let appId='',sdkPromise=null,apiReady=false;
function loadSdk(){if(sdkPromise)return sdkPromise;sdkPromise=new Promise((resolve,reject)=>{if(window.cast?.framework&&window.chrome?.cast){apiReady=true;return resolve(true)}const previous=window.__onGCastApiAvailable;window.__onGCastApiAvailable=isAvailable=>{try{if(typeof previous==='function')previous(isAvailable)}catch{}if(!isAvailable)return reject(new Error('Google Cast no está disponible en este navegador.'));apiReady=true;resolve(true)};const script=document.createElement('script');script.src='https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';script.async=true;script.onerror=()=>reject(new Error('No se pudo cargar Google Cast.'));document.head.appendChild(script)});return sdkPromise}
async function configure(value){appId=String(value||'').trim();if(!appId)throw new Error('Chromecast todavía no está configurado. Falta CAST_APP_ID.');await loadSdk();if(!apiReady||!window.cast?.framework||!window.chrome?.cast)throw new Error('Google Cast no está disponible en este navegador.');cast.framework.CastContext.getInstance().setOptions({receiverApplicationId:appId,autoJoinPolicy:chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED});return true}
async function castUrl(url,value=appId){await configure(value);if(location.protocol!=='https:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')throw new Error('Chromecast necesita que la web esté publicada con HTTPS.');const target=new URL(url,location.href);const context=cast.framework.CastContext.getInstance();await context.requestSession();const session=context.getCurrentSession();if(!session)throw new Error('No se pudo iniciar la sesión de Chromecast.');await session.sendMessage(NAMESPACE,{path:`${target.pathname}${target.search}`});return true}
function installEventoLabShortcut(){
  const modal=document.getElementById('communityAdminModal');
  const old=modal?.querySelector('.eventModeBlock');
  if(!old)return;
  old.style.setProperty('display','none','important');
  if(document.getElementById('eventoLabShortcut'))return;
  const box=document.createElement('div');
  box.id='eventoLabShortcut';
  box.className='block';
  box.style.cssText='margin-top:12px;border:1px solid #f2c95d55;background:linear-gradient(145deg,#2a1b34,#17101f)';
  box.innerHTML='<div class="actions" style="justify-content:space-between;align-items:center;margin:0;gap:12px"><div><h3 style="margin:0">🎪 MODO EVENTO</h3><div class="muted" style="margin-top:4px">La configuración del Evento está separada del Admin normal.</div></div><a class="btn primary" href="/assets/evento.html" style="text-decoration:none;white-space:nowrap">ABRIR MODO EVENTO</a></div>';
  old.insertAdjacentElement('beforebegin',box);
}
window.LaGordaCast={configure,castUrl,namespace:NAMESPACE};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installEventoLabShortcut);else installEventoLabShortcut();
})();
