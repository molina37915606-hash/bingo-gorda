'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
const communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert(playerJs.includes('/api/player/community-cancel')&&playerJs.includes('CANCELAR SALA')&&playerJs.includes('FINALIZAR PARTIDA'),'El creador debe poder cancelar desde la sala de espera y finalizar si ya comenzó.');
assert(communityJs.includes('/api/community/public-room/cancel')&&communityJs.includes('data-cancel-room'),'Comunidad debe permitir cancelar una placa/sala con el código del creador.');
assert(serverSrc.includes('creator_cancelled')&&serverSrc.includes('cancelCommunityPublicRoom'),'Servidor debe registrar la cancelación del creador.');

const port=58420+Math.floor(Math.random()*80),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-public-cancel-'));
let child=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function spawnServer(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'50',BINGO_COMMUNITY_PUBLIC_OPEN_MS:'8000'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{proc.kill('SIGKILL')}catch{}resolve()},1400);proc.once('exit',()=>{clearTimeout(t);resolve()});try{proc.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
function cookie(headers){const raw=headers.get('set-cookie')||'',m=raw.match(/bingo_player_session=([^;]+)/);return m?`bingo_player_session=${m[1]}`:''}
async function raw(pathname,{method='GET',body,cookie:ck,playerToken,adminToken}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(ck?{Cookie:ck}:{}),...(playerToken?{'X-Player-Token':playerToken}:{}),...(adminToken?{'X-Admin-Token':adminToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(pathname,opt={}){const x=await raw(pathname,opt);assert(x.r.ok,`${pathname}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
(async()=>{try{
  spawnServer();await ready();

  // Una placa futura se puede recuperar desde otro dispositivo y cancelar sin crear un workspace.
  const startsAt=new Date(Date.now()+30_000).toISOString();
  const plate=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'placa-device',name:'Ana',roomName:'Placa cancelable',mode:90,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:8,startMode:'scheduled',startsAt}});
  assert.equal(plate.status,'scheduled');assert.equal(plate.roomCode,'');
  const wrong=await raw('/api/community/public-room/cancel',{method:'POST',body:{publicId:plate.id,creatorCode:'XXXXXXX'}});assert.equal(wrong.r.status,400,'Una clave incorrecta no debe cancelar la placa.');
  const recovered=await ok('/api/community/creator-recover',{method:'POST',body:{publicId:plate.id,creatorCode:plate.creatorCode,deviceId:'otro-celular'}});assert.equal(recovered.pending,true,'Antes de abrir, el código debe recuperar el control de la placa sin crear una sesión de jugador.');
  const cancelledPlate=await ok('/api/community/public-room/cancel',{method:'POST',body:{publicId:plate.id,creatorCode:plate.creatorCode}});assert.equal(cancelledPlate.status,'cancelled');assert.equal(cancelledPlate.wasStarted,false);
  const community=await ok('/api/community/state?visitorId=observador');assert(!community.publicRooms.some(x=>x.id===plate.id),'La placa cancelada debe desaparecer de Comunidad.');

  // Sala en espera: solo el creador puede cancelarla desde la sesión de jugador.
  let response=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'creator-wait',name:'Marta',roomName:'Sala para cancelar',mode:75,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:10,startMode:'manual'}});
  assert(response.r.ok,JSON.stringify(response.d));const waiting=response.d,creatorCookie=cookie(response.r.headers);assert(creatorCookie);
  const guest=await ok('/api/player/open-join',{method:'POST',body:{roomCode:waiting.roomCode,name:'Pedro',cardCount:1,deviceId:'guest-wait'}});
  const guestDenied=await raw('/api/player/community-cancel',{method:'POST',playerToken:guest.token,body:{}});assert.equal(guestDenied.r.status,400,'Un jugador común no puede cancelar la sala.');
  const creatorState=await ok('/api/player/state',{cookie:creatorCookie});assert.equal(creatorState.communityRoom.canCancel,true);assert.equal(creatorState.communityRoom.cancelAction,'cancel');
  const cancelledWaiting=await ok('/api/player/community-cancel',{method:'POST',cookie:creatorCookie,body:{}});assert.equal(cancelledWaiting.active,false);assert.equal(cancelledWaiting.closedReason,'creator_cancelled');assert.equal(cancelledWaiting.returnToCommunity,true,'Al cerrarse una sala real el jugador debe volver a Comunidad.');
  const guestClosed=await ok('/api/player/state',{playerToken:guest.token});assert.equal(guestClosed.active,false);assert.equal(guestClosed.closedReason,'creator_cancelled','Los demás jugadores deben saber que la sala fue cancelada por el creador.');assert.equal(guestClosed.returnToCommunity,true,'Los demás jugadores deben ser enviados a Comunidad cuando la sala se cierre.');

  // Partida iniciada: el creador puede finalizarla y queda en historial como cancelada/interrumpida.
  response=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'creator-play',name:'Nora',roomName:'Partida interrumpida',mode:90,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:20,startMode:'manual'}});assert(response.r.ok);const playing=response.d,playingCreatorCookie=cookie(response.r.headers);
  const playingGuest=await ok('/api/player/open-join',{method:'POST',body:{roomCode:playing.roomCode,name:'Beto',cardCount:1,deviceId:'guest-play'}});
  const creatorWaiting=await ok('/api/player/state',{cookie:playingCreatorCookie});await ok('/api/player/choose',{method:'POST',cookie:playingCreatorCookie,body:{cardIds:[creatorWaiting.player.offeredCards[0].id]}});
  const guestWaiting=await ok('/api/player/state',{playerToken:playingGuest.token});await ok('/api/player/choose',{method:'POST',playerToken:playingGuest.token,body:{cardIds:[guestWaiting.player.offeredCards[0].id]}});
  await ok('/api/player/community-start',{method:'POST',cookie:playingCreatorCookie,body:{}});await wait(180);
  let st=await ok('/api/player/state',{cookie:playingCreatorCookie});assert.equal(st.status,'playing');assert.equal(st.communityRoom.canCancel,true);assert.equal(st.communityRoom.cancelAction,'interrupt');
  const interrupted=await ok('/api/player/community-cancel',{method:'POST',cookie:playingCreatorCookie,body:{}});assert.equal(interrupted.wasStarted,true);assert.equal(interrupted.closedReason,'creator_cancelled');
  st=await ok('/api/player/state',{playerToken:playingGuest.token});assert.equal(st.active,false);assert.equal(st.closedReason,'creator_cancelled');assert.equal(st.returnToCommunity,true);
  const admin=(await ok('/api/admin/login',{method:'POST',body:{}})).token;
  const history=await ok('/api/admin/history',{adminToken:admin});const entry=history.entries.find(x=>x.roomCode===playing.roomCode);assert(entry,'La partida interrumpida debe quedar en historial.');assert.equal(entry.status,'cancelled');assert.equal(entry.cancelReason,'creator_cancelled');assert(entry.startedAt,'El historial debe indicar que la partida había comenzado.');

  console.log('PRUEBA CANCELACIÓN SALA PÚBLICA: OK · placa + espera + partida iniciada + permisos + historial');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
