'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const communityHtml=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert(communityHtml.includes('id="publicRoomsList"'),'Comunidad debe mostrar el lobby de mesas.');
const creator=communityHtml.slice(communityHtml.indexOf('id="privateRoomOverlay"'),communityHtml.indexOf('id="whatsappOverlay"'));
assert(creator.includes('CÓDIGO DE CREADOR')&&creator.includes('INGRESAR A JUGAR'),'Crear sala debe separar organización de ingreso como jugador.');
assert(creator.includes('id="privateRoomJoinBtn"')&&creator.includes('>VER MI SALA</button>'),'VER MI SALA debe ser una acción de organizador, no un enlace de invitado.');
assert(communityJs.includes('/api/community/creator-state')&&communityJs.includes('viewCreatorRoomById'),'Comunidad debe tener una vista propia para el organizador.');
assert(communityJs.includes('/api/community/creator-start')&&communityJs.includes('/api/community/creator-join-player'),'Comunidad debe permitir iniciar como organizador e ingresar a jugar aparte.');
assert(serverSrc.includes("Array.from({ length: 9 }")&&serverSrc.includes('COMMUNITY_PUBLIC_MAX_AHEAD_MS = 36 * 60 * 60 * 1000'),'Servidor debe mantener límites de salas y programación.');

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
async function adminLogin(){return (await ok('/api/admin/login',{method:'POST',body:{password:''}})).token}
async function selectRoom(admin,roomCode){const ws=await ok('/api/admin/workspaces',{token:admin});const room=ws.rooms.find(x=>x.roomCode===roomCode);assert(room,`Admin debe encontrar sala ${roomCode}`);if(ws.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}});return await ok('/api/admin/state',{token:admin})}

(async()=>{try{
  spawnServer();await waitServer();const admin=await adminLogin();

  // Crear sala NO crea jugador. El código del creador puede iniciar con jugadores reales.
  let createResp=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'marta-device',name:'Marta',roomName:'Bingo de los vecinos',mode:90,maxPlayers:10,maxCardsPerPlayer:4,autoSeconds:8,linePrizeCount:2,rules:{ambocabeza:true,line:true,bingo:true},startMode:'manual'}});
  assert(createResp.r.ok,JSON.stringify(createResp.d));const created=createResp.d;
  assert(created.id&&created.roomCode&&created.shareUrl.includes('/mesa/')&&created.creatorCode&&created.enterNow===true,'Sala manual debe abrir y devolver link/código de creador.');
  assert.equal(playerCookie(createResp.r.headers),'','Crear una sala no debe iniciar una sesión de jugador.');
  let adminState=await selectRoom(admin,created.roomCode);assert.equal(adminState.players.length,0,'El creador no debe aparecer como jugador al crear.');
  const organizerView=await ok('/api/community/creator-state',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});assert(organizerView.organizer);assert.equal(organizerView.playerCount,0,'Ver mi sala no debe agregar al creador como jugador.');assert(Array.isArray(organizerView.players)&&organizerView.players.length===0);
  const pedro=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Pedro',cardCount:1,deviceId:'pedro-device'}});
  const lucia=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Lucía',cardCount:4,deviceId:'lucia-device'}});
  const organizerWithPlayers=await ok('/api/community/creator-state',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});assert.equal(organizerWithPlayers.playerCount,2);assert.deepEqual(organizerWithPlayers.players.map(p=>p.name).sort(),['Lucía','Pedro']);
  const startedByCreator=await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});assert(startedByCreator.ok);
  await wait(120);adminState=await selectRoom(admin,created.roomCode);assert(['starting','playing'].includes(adminState.status));assert.equal(adminState.players.length,2);assert(adminState.players.every(p=>p.name!=='Marta'));
  const pedroStarted=await ok('/api/player/state',{playerToken:pedro.token}),luciaStarted=await ok('/api/player/state',{playerToken:lucia.token});assert.equal(pedroStarted.player.cards.length,1);assert.equal(luciaStarted.player.cards.length,4);

  // "Ingresar a jugar" recupera exactamente el flujo anterior: crea al creador como jugador recién cuando lo pide.
  createResp=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'nora-device',name:'Nora',roomName:'Sala de Nora',mode:75,maxPlayers:10,maxCardsPerPlayer:2,autoSeconds:10,rules:{line:true,bingo:true},startMode:'manual'}});assert(createResp.r.ok);const room2=createResp.d;
  const recovered=await raw('/api/community/creator-recover',{method:'POST',body:{publicId:room2.id,creatorCode:room2.creatorCode,deviceId:'otro-dispositivo'}});assert(recovered.r.ok);assert(recovered.d.organizer);assert.equal(playerCookie(recovered.r.headers),'','Recuperar la sala no debe convertir al creador en jugador.');
  const joinCreator=await raw('/api/community/creator-join-player',{method:'POST',body:{publicId:room2.id,creatorCode:room2.creatorCode,deviceId:'nora-play'}});assert(joinCreator.r.ok,JSON.stringify(joinCreator.d));const creatorCookie=playerCookie(joinCreator.r.headers);assert(creatorCookie,'Ingresar a jugar debe emitir sesión de jugador.');
  const creatorState=await ok('/api/player/state',{cookie:creatorCookie});assert.equal(creatorState.player.name,'Nora');assert(creatorState.communityRoom?.isCreator,'Al entrar a jugar conserva las funciones que tenía antes el creador-jugador.');

  // Caso reportado: Admin quita al creador-jugador y aun así puede iniciar con los demás.
  const g1=await ok('/api/player/open-join',{method:'POST',body:{roomCode:room2.roomCode,name:'Jugador Uno',cardCount:1,deviceId:'g1'}});
  const g2=await ok('/api/player/open-join',{method:'POST',body:{roomCode:room2.roomCode,name:'Jugador Dos',cardCount:1,deviceId:'g2'}});assert(g1.token&&g2.token);
  adminState=await selectRoom(admin,room2.roomCode);const creatorPlayer=adminState.players.find(p=>p.name==='Nora');assert(creatorPlayer,'Admin debe ver al creador solo porque eligió jugar.');
  await ok('/api/admin/remove-player',{method:'POST',token:admin,body:{playerId:creatorPlayer.id}});
  adminState=await ok('/api/admin/state',{token:admin});assert.equal(adminState.players.length,2);assert(adminState.players.every(p=>p.name!=='Nora'));
  if(adminState.roomSettings.joinOpen)await ok('/api/admin/join-open',{method:'POST',token:admin,body:{open:false}});
  const adminStarted=await ok('/api/admin/start',{method:'POST',token:admin,body:{}});assert(['starting','playing'].includes(adminStarted.status),'Admin debe poder iniciar aunque haya quitado al creador.');assert.equal(adminStarted.players.length,2);

  // Programada mantiene el mismo comportamiento automático.
  const startsAt=new Date(Date.now()+12000).toISOString();
  const scheduled=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'ana-device',name:'Ana',roomName:'Bingo de mañana',mode:90,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:8,linePrizeCount:1,rules:{line:true,bingo:true},startMode:'scheduled',startsAt}});
  assert.equal(scheduled.enterNow,false);assert.equal(scheduled.roomCode,'');assert.equal(scheduled.status,'scheduled');
  let community=await ok('/api/community/state?visitorId=test'),opened=null;for(let i=0;i<35;i++){opened=community.publicRooms.find(x=>x.id===scheduled.id);if(opened?.roomCode&&opened.status==='waiting')break;await wait(180);community=await ok('/api/community/state?visitorId=test')}assert(opened&&opened.roomCode&&opened.joinOpen,'La programada debe abrir en su ventana.');
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:opened.roomCode,name:'Ana Jugadora',cardCount:1,deviceId:'ana-join'}});const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:opened.roomCode,name:'Beto',cardCount:1,deviceId:'beto-join'}});assert(a.token&&b.token);
  await wait(Math.max(0,new Date(startsAt).getTime()-Date.now()+1600));const scheduledState=await ok('/api/player/state',{playerToken:a.token});assert(['starting','playing'].includes(scheduledState.status));

  console.log('PRUEBA SALAS COMUNIDAD: OK · creador organizador opcional + ingreso a jugar separado + Admin inicia tras quitar creador + programación');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
