'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const communityHtml=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert(communityHtml.includes('Públicas, privadas y oficiales')&&communityHtml.includes('id="publicRoomsList"'),'Comunidad debe mostrar el lobby de mesas.');
assert(communityHtml.includes('id="publicRoomName"')&&communityHtml.includes('data-private-choice="start"')&&communityHtml.includes('id="publicRoomStartsAt"')&&communityHtml.includes('data-private-choice="access"'),'Crear sala debe permitir nombre, tipo e inicio manual/programado.');
const creator=communityHtml.slice(communityHtml.indexOf('id="privateRoomOverlay"'),communityHtml.indexOf('id="whatsappOverlay"'));
assert(creator.includes('¿QUÉ JUGAMOS?')&&creator.includes('CÓDIGO DE CREADOR')&&!creator.includes('ENTRAR COMO ANFITRIÓN'),'El creador debe ser jugador y conservar solo un código de recuperación.');
assert(!creator.includes('partidas oficiales')&&!creator.includes('slot')&&!creator.includes('workspace')&&!creator.includes('importe')&&!creator.includes('type="number"'),'La pantalla del jugador no debe mostrar términos internos ni montos.');
assert(communityJs.includes('/api/community/public-room')&&communityJs.includes('/api/community/creator-recover')&&communityJs.includes('36*60*60*1000'),'Comunidad debe crear y recuperar salas públicas programables hasta 36 horas.');
assert(playerJs.includes('/api/player/community-start')&&playerJs.includes('📲 INVITAR')&&playerJs.includes('¿CREASTE ESTA SALA?'),'La sala de espera debe permitir invitar y solo el creador recuperar/iniciar.');
assert(serverSrc.includes("Array.from({ length: 9 }")&&serverSrc.includes('COMMUNITY_PUBLIC_MAX_AHEAD_MS = 36 * 60 * 60 * 1000'),'Servidor debe limitar a diez salas y 36 horas de programación.');

const port=58100+Math.floor(Math.random()*120),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-community-public-'));
let child=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function spawnServer(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'30',BINGO_COMMUNITY_PUBLIC_OPEN_MS:'8000'},stdio:['ignore','pipe','pipe']});}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{proc.kill('SIGKILL')}catch{}resolve()},1400);proc.once('exit',()=>{clearTimeout(t);resolve()});try{proc.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function waitServer(){for(let i=0;i<140;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
function playerCookie(headers){const raw=headers.get('set-cookie')||'';const m=raw.match(/bingo_player_session=([^;]+)/);return m?`bingo_player_session=${m[1]}`:''}
async function raw(pathname,{method='GET',body,token,playerToken,cookie,redirect}={}){const r=await fetch(base+pathname,{method,redirect:redirect||'follow',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return {r,d}}
async function ok(pathname,opt={}){const out=await raw(pathname,opt);assert(out.r.ok,`${pathname}: ${out.r.status} ${JSON.stringify(out.d)}`);return out.d}
(async()=>{try{
  spawnServer();await waitServer();
  // Sala pública manual: el creador entra como jugador y solo él puede iniciar.
  let createResp=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'marta-device',name:'Marta',roomName:'Bingo de los vecinos',mode:90,maxPlayers:10,maxCardsPerPlayer:2,autoSeconds:8,linePrizeCount:2,rules:{ambocabeza:true,line:true,bingo:true},startMode:'manual'}});
  assert(createResp.r.ok,JSON.stringify(createResp.d));const created=createResp.d,creatorCookie=playerCookie(createResp.r.headers);
  assert(created.id&&created.roomCode&&created.shareUrl.includes('/mesa/')&&created.creatorCode&&created.enterNow===true,'Sala manual debe abrir y devolver link/código de creador.');
  assert(creatorCookie,'Crear una sala manual debe iniciar sesión al creador como jugador.');
  let creatorState=await ok('/api/player/state',{cookie:creatorCookie});assert.equal(creatorState.communityRoom.name,'Bingo de los vecinos');assert.equal(creatorState.communityRoom.isCreator,true);assert.equal(creatorState.communityRoom.canStart,true);assert.equal(creatorState.roomSettings.paymentMode,'free');
  const other=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Pedro',cardCount:1,deviceId:'pedro-device'}});assert(other.token);
  let denied=await raw('/api/player/community-start',{method:'POST',playerToken:other.token,body:{}});assert.equal(denied.r.status,400,'Un jugador común no debe iniciar una sala manual.');
  let started=await ok('/api/player/community-start',{method:'POST',cookie:creatorCookie,body:{}});assert(['starting','playing'].includes(started.status),'El creador debe poder iniciar la partida.');
  await wait(180);creatorState=await ok('/api/player/state',{cookie:creatorCookie});assert.equal(creatorState.status,'playing');
  const late=await raw('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Tarde',cardCount:1,deviceId:'late-device'}});assert.equal(late.r.status,400,'Una persona nueva no debe entrar después del inicio.');

  // Código de creador: recuperación desde otro dispositivo en otra sala manual.
  createResp=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'nora-device',name:'Nora',roomName:'Sala de Nora',mode:75,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:10,rules:{line:false,corners:true,doubleLine:true,tripleLine:true,bingo:true},startMode:'manual'}});assert(createResp.r.ok);const room2=createResp.d;
  const recovered=await raw('/api/community/creator-recover',{method:'POST',body:{publicId:room2.id,creatorCode:room2.creatorCode,deviceId:'otro-dispositivo'}});assert(recovered.r.ok,JSON.stringify(recovered.d));const recoveryCookie=playerCookie(recovered.r.headers);assert(recoveryCookie,'Recuperar creador debe emitir una sesión de jugador.');const recoveredState=await ok('/api/player/state',{cookie:recoveryCookie});assert.equal(recoveredState.communityRoom.isCreator,true,'El código secreto debe recuperar el permiso de iniciar.');

  // Programada: más allá de la ventana solo es una placa; el mismo link permanece estable.
  const startsAt=new Date(Date.now()+12000).toISOString();
  const scheduled=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'ana-device',name:'Ana',roomName:'Bingo de mañana',mode:90,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:8,linePrizeCount:1,rules:{line:true,bingo:true},startMode:'scheduled',startsAt}});
  assert.equal(scheduled.enterNow,false);assert.equal(scheduled.roomCode,'');assert.equal(scheduled.status,'scheduled');assert(scheduled.shareUrl.includes(`/mesa/${scheduled.id}`));
  let community=await ok('/api/community/state?visitorId=test');const plate=community.publicRooms.find(x=>x.id===scheduled.id);assert(plate&&plate.status==='scheduled'&&!plate.roomCode,'Antes de la apertura debe existir solo la placa.');
  const plateLink=await fetch(scheduled.shareUrl,{redirect:'manual'});assert.equal(plateLink.status,303);assert((plateLink.headers.get('location')||'').includes(`/comunidad?mesa=${scheduled.id}`),'El link estable debe mostrar la placa antes de abrir.');
  let opened=null;for(let i=0;i<35;i++){await wait(180);community=await ok('/api/community/state?visitorId=test');opened=community.publicRooms.find(x=>x.id===scheduled.id);if(opened?.roomCode&&opened.status==='waiting')break}assert(opened&&opened.roomCode&&opened.status==='waiting'&&opened.joinOpen,'Dentro de la ventana debe abrir la sala de espera automáticamente.');assert.equal(opened.shareUrl,scheduled.shareUrl,'El link compartido no debe cambiar al abrir.');
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:opened.roomCode,name:'Ana Jugadora',cardCount:1,deviceId:'ana-join'}});const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:opened.roomCode,name:'Beto',cardCount:1,deviceId:'beto-join'}});assert(a.token&&b.token);
  const untilStart=Math.max(0,new Date(startsAt).getTime()-Date.now()+1600);await wait(untilStart);const scheduledState=await ok('/api/player/state',{playerToken:a.token});assert(['starting','playing'].includes(scheduledState.status),'A la hora programada debe comenzar automáticamente con dos jugadores.');

  // Más de 36 horas debe rechazarse.
  const tooFar=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'far',name:'Lejos',roomName:'Muy lejos',mode:90,startMode:'scheduled',startsAt:new Date(Date.now()+37*60*60_000).toISOString()}});assert.equal(tooFar.r.status,400);assert(/36 horas/i.test(tooFar.d.error||''));

  console.log('PRUEBA SALAS PÚBLICAS COMUNIDAD: OK · creador jugador + inicio manual + recuperación + placa programada + apertura/inicio automático + 36 h');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
