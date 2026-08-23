'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');

const root=path.join(__dirname,'..');
const port=59220+Math.floor(Math.random()*80);
const base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'la-gorda-direct-room-links-'));
let child=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));

function start(){
  child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});
}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<140;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw new Error('No inició servidor')}
function namedCookie(headers,name){const raw=headers.get('set-cookie')||'';const m=raw.match(new RegExp(`${name}=([^;]+)`));return m?`${name}=${m[1]}`:''}
async function raw(pathname,{method='GET',body,cookie,redirect='follow'}={}){
  const headers={...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})};
  const url=/^https?:\/\//.test(pathname)?pathname:base+pathname;
  const r=await fetch(url,{method,redirect,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const type=r.headers.get('content-type')||'';
  const d=type.includes('application/json')?await r.json().catch(()=>({})):await r.text().catch(()=>'');
  return {r,d};
}
async function ok(pathname,opt={}){const x=await raw(pathname,opt);assert(x.r.ok,`${pathname}: ${x.r.status} ${typeof x.d==='string'?x.d.slice(0,250):JSON.stringify(x.d)}`);return x.d}

(async()=>{try{
  const communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
  const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert(serverSrc.includes('communityRoomInviteTokenMatches')&&serverSrc.includes("url.searchParams.get('acceso')"),'Servidor debe resolver invitaciones directas de sala.');
  assert(communityJs.includes('este link ya incluye el acceso')&&communityJs.includes("room.kind!=='private'||owns"),'El link privado directo debe quedar reservado al creador en el lobby.');

  start();await ready();

  const publicRoom=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-public-direct',name:'Ana',roomName:'Mesa Pública Directa',accessType:'public',mode:90,maxPlayers:30,maxCardsPerPlayer:4,autoSeconds:8,rules:{line:true,bingo:true},startMode:'manual'}});
  assert(publicRoom.shareUrl.includes(`/mesa/${publicRoom.id}`));
  assert(!publicRoom.shareUrl.includes('acceso='),'Una mesa pública no necesita credencial en el link.');
  const publicDirect=await raw(new URL(publicRoom.shareUrl).pathname+new URL(publicRoom.shareUrl).search,{redirect:'manual'});
  assert.equal(publicDirect.r.status,303);
  assert.equal(publicDirect.r.headers.get('location'),`/jugador?sala=${encodeURIComponent(publicRoom.roomCode)}&directo=1`,'El link público debe ir directo al ingreso de esa mesa.');
  const publicEntry=await raw(publicDirect.r.headers.get('location'));
  assert(publicEntry.r.ok&&String(publicEntry.d).includes('ENTRAR A LA SALA'),'El link público debe aterrizar en el formulario de esa sala, no en Comunidad.');

  const privateRoom=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-private-direct',name:'Beto',roomName:'Mesa Privada Directa',accessType:'private',accessKey:'MESA2026',mode:75,maxPlayers:20,maxCardsPerPlayer:2,autoSeconds:8,rules:{line:true,bingo:true},startMode:'manual'}});
  const inviteUrl=new URL(privateRoom.shareUrl);
  const inviteToken=inviteUrl.searchParams.get('acceso')||'';
  assert(inviteToken.startsWith('invite_'),'El creador debe recibir un link privado con credencial de invitado.');
  assert(!privateRoom.shareUrl.includes('MESA2026'),'La clave humana no debe aparecer en el link compartido.');
  assert(!privateRoom.shareUrl.includes(privateRoom.creatorCode),'El link de invitado nunca debe contener el código de titular.');

  const publicState=await ok('/api/community/state?visitorId=outsider');
  const privateCard=publicState.lobbyRooms.find(x=>x.id===privateRoom.id);
  assert(privateCard&&privateCard.kind==='private');
  assert(privateCard.shareUrl&&!privateCard.shareUrl.includes('acceso='),'El lobby público no debe filtrar la credencial privada.');
  assert(!JSON.stringify(privateCard).includes(inviteToken),'El token de invitación no debe salir en el estado público.');

  const plainPrivate=await raw(`/mesa/${privateRoom.id}`,{redirect:'manual'});
  assert.equal(plainPrivate.r.status,303);
  assert.equal(plainPrivate.r.headers.get('location'),`/comunidad?mesa=${encodeURIComponent(privateRoom.id)}`,'Sin invitación o clave, la mesa privada debe seguir protegida.');
  assert(!namedCookie(plainPrivate.r.headers,'bingo_community_room_access'));

  const badPrivate=await raw(`/mesa/${privateRoom.id}?acceso=invite_000000000000000000000000`,{redirect:'manual'});
  assert.equal(badPrivate.r.status,303);
  assert((badPrivate.r.headers.get('location')||'').includes('acceso=invalido'));
  assert(!namedCookie(badPrivate.r.headers,'bingo_community_room_access'),'Un token inválido no puede otorgar acceso.');

  const directPrivate=await raw(inviteUrl.pathname+inviteUrl.search,{redirect:'manual'});
  assert.equal(directPrivate.r.status,303);
  const accessCookie=namedCookie(directPrivate.r.headers,'bingo_community_room_access');
  assert(accessCookie,'El link privado válido debe crear un permiso de invitado.');
  const privateJoinLocation=directPrivate.r.headers.get('location')||'';
  assert(/^\/jugador\?sala=[A-Z0-9]+&directo=1$/.test(privateJoinLocation),'El link privado válido debe ir directo al ingreso de esa mesa.');
  const privateRoomCode=new URL(base+privateJoinLocation).searchParams.get('sala')||'';
  assert(privateRoomCode,'El link privado debe resolver el código interno sin exponerlo en el lobby.');
  const privateEntry=await raw(privateJoinLocation,{cookie:accessCookie});
  assert(privateEntry.r.ok&&String(privateEntry.d).includes('ENTRAR A LA SALA'),'El invitado del link privado debe llegar al formulario sin escribir clave.');

  const grantedState=await ok('/api/community/state?visitorId=private-link-user',{cookie:accessCookie});
  assert.equal(grantedState.privateAccessPublicId,privateRoom.id,'Comunidad debe recordar a qué sala privada habilita el link.');
  const grantReuse=await ok('/api/community/room-access',{method:'POST',cookie:accessCookie,body:{publicId:privateRoom.id}});
  assert(grantReuse.joinUrl.includes(`/jugador?sala=${privateRoomCode}`),'El permiso del link debe reutilizarse sin pedir la clave humana.');

  const ownerAttempt=await raw('/api/community/creator-state',{method:'POST',body:{publicId:privateRoom.id,creatorCode:inviteToken}});
  assert.equal(ownerAttempt.r.status,400,'La credencial de invitado no debe otorgar permisos de titular.');

  console.log('V9.2.6 LINKS DIRECTOS: OK · pública directa · privada directa sin clave manual · token no filtrado · sin permisos de titular');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
