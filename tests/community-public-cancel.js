'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert(communityJs.includes('/api/community/public-room/cancel')&&communityJs.includes('data-cancel-room'),'Comunidad debe permitir cancelar una placa/sala con el código del creador.');
assert(serverSrc.includes('creator_cancelled')&&serverSrc.includes('cancelCommunityPublicRoom'),'Servidor debe registrar la cancelación del creador.');

const port=58420+Math.floor(Math.random()*80),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-public-cancel-'));
let child=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function spawnServer(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'50',BINGO_COMMUNITY_PUBLIC_OPEN_MS:'8000'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{proc.kill('SIGKILL')}catch{}resolve()},1400);proc.once('exit',()=>{clearTimeout(t);resolve()});try{proc.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
async function raw(pathname,{method='GET',body,playerToken,adminToken}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(playerToken?{'X-Player-Token':playerToken}:{}),...(adminToken?{'X-Admin-Token':adminToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(pathname,opt={}){const x=await raw(pathname,opt);assert(x.r.ok,`${pathname}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
(async()=>{try{
  spawnServer();await ready();

  // Una placa futura se puede recuperar desde otro dispositivo y cancelar sin crear un workspace.
  const startsAt=new Date(Date.now()+30_000).toISOString();
  const plate=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'placa-device',name:'Ana',roomName:'Placa cancelable',mode:90,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:8,startMode:'scheduled',startsAt}});
  assert.equal(plate.status,'scheduled');assert.equal(plate.roomCode,'');
  const wrong=await raw('/api/community/public-room/cancel',{method:'POST',body:{publicId:plate.id,creatorCode:'XXXXXXX'}});assert.equal(wrong.r.status,400,'Una clave incorrecta no debe cancelar la placa.');
  const recovered=await ok('/api/community/creator-recover',{method:'POST',body:{publicId:plate.id,creatorCode:plate.creatorCode,deviceId:'otro-celular'}});assert.equal(recovered.pending,true,'Antes de abrir, el código debe recuperar el control de la placa sin crear jugador.');
  const cancelledPlate=await ok('/api/community/public-room/cancel',{method:'POST',body:{publicId:plate.id,creatorCode:plate.creatorCode}});assert.equal(cancelledPlate.status,'cancelled');assert.equal(cancelledPlate.wasStarted,false);
  const community=await ok('/api/community/state?visitorId=observador');assert(!community.publicRooms.some(x=>x.id===plate.id),'La placa cancelada debe desaparecer de Comunidad.');

  // Sala en espera: un jugador no puede cancelar; el creador usa su código desde Comunidad.
  let response=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'creator-wait',name:'Marta',roomName:'Sala para cancelar',mode:75,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:10,startMode:'manual'}});
  assert(response.r.ok,JSON.stringify(response.d));const waiting=response.d;
  const guest=await ok('/api/player/open-join',{method:'POST',body:{roomCode:waiting.roomCode,name:'Pedro',cardCount:1,deviceId:'guest-wait'}});
  const guestDenied=await raw('/api/player/community-cancel',{method:'POST',playerToken:guest.token,body:{}});assert.equal(guestDenied.r.status,400,'Un jugador común no puede cancelar la sala.');
  const cancelledWaiting=await ok('/api/community/public-room/cancel',{method:'POST',body:{publicId:waiting.id,creatorCode:waiting.creatorCode}});assert.equal(cancelledWaiting.status,'cancelled');assert.equal(cancelledWaiting.wasStarted,false);
  const guestClosed=await ok('/api/player/state',{playerToken:guest.token});assert.equal(guestClosed.active,false);assert.equal(guestClosed.closedReason,'creator_cancelled','Los jugadores deben saber que el creador canceló la sala.');assert.equal(guestClosed.returnToCommunity,true);

  // Partida iniciada: el creador inicia sin ser jugador y puede interrumpir desde Comunidad.
  response=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'creator-play',name:'Nora',roomName:'Partida interrumpida',mode:90,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:20,startMode:'manual'}});assert(response.r.ok);const playing=response.d;
  const p1=await ok('/api/player/open-join',{method:'POST',body:{roomCode:playing.roomCode,name:'Beto',cardCount:1,deviceId:'guest-play-1'}});
  const p2=await ok('/api/player/open-join',{method:'POST',body:{roomCode:playing.roomCode,name:'Lola',cardCount:1,deviceId:'guest-play-2'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:playing.id,creatorCode:playing.creatorCode}});await wait(180);
  let st=await ok('/api/player/state',{playerToken:p1.token});assert.equal(st.status,'playing');
  const interrupted=await ok('/api/community/public-room/cancel',{method:'POST',body:{publicId:playing.id,creatorCode:playing.creatorCode}});assert.equal(interrupted.wasStarted,true);assert.equal(interrupted.status,'cancelled');
  st=await ok('/api/player/state',{playerToken:p1.token});assert.equal(st.active,false);assert.equal(st.closedReason,'creator_cancelled');assert.equal(st.returnToCommunity,true);const st2=await ok('/api/player/state',{playerToken:p2.token});assert.equal(st2.active,false);
  const admin=(await ok('/api/admin/login',{method:'POST',body:{}})).token;
  const history=await ok('/api/admin/history',{adminToken:admin});const entry=history.entries.find(x=>x.roomCode===playing.roomCode);assert(entry,'La partida interrumpida debe quedar en historial.');assert.equal(entry.status,'cancelled');assert.equal(entry.cancelReason,'creator_cancelled');assert(entry.startedAt,'El historial debe indicar que la partida había comenzado.');

  console.log('PRUEBA CANCELACIÓN SALA PÚBLICA: OK · placa + espera + partida iniciada + permisos + historial');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
