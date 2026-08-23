'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = 59520 + Math.floor(Math.random() * 60);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-community-leave-'));
let child;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'20'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<160;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await sleep(35)}throw new Error('No inició servidor')}
async function raw(url,{method='GET',body,token,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin});const room=list.rooms.find(x=>x.roomCode===roomCode);assert(room,`No se encontró sala ${roomCode}`);if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
async function waitPlaying(playerToken){for(let i=0;i<120;i++){const s=await ok('/api/player/state',{playerToken});if(s.status==='playing'||s.status==='finished')return s;await sleep(20)}throw new Error('No llegó a playing')}
const nums = card => (card.grid||[]).flat().filter(Number.isFinite).map(Number);

(async()=>{try{
  start();await ready();
  const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;

  // Pública normal: abandonar antes de empezar elimina al jugador y vuelve a liberar el cupo.
  const normal=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'leave-normal-host',name:'Host Normal',roomName:'Salida Normal',gameKind:'normal',mode:90,maxPlayers:2,maxCardsPerPlayer:1,autoSeconds:12,startMode:'manual',accessType:'public'}});
  const n1=await ok('/api/player/open-join',{method:'POST',body:{roomCode:normal.roomCode,name:'Ana',cardCount:1,deviceId:'leave-normal-a'}});
  const n2=await ok('/api/player/open-join',{method:'POST',body:{roomCode:normal.roomCode,name:'Beto',cardCount:1,deviceId:'leave-normal-b'}});
  let lobby=await ok('/api/community/state?visitorId=leave-test');let normalCard=lobby.publicRooms.find(x=>x.id===normal.id);assert(normalCard);assert.equal(normalCard.playerCount,2);assert.equal(normalCard.joinOpen,false,'Sala llena debe cerrar ingreso');
  const leftWaiting=await ok('/api/player/community-leave',{method:'POST',playerToken:n1.token,body:{}});assert(leftWaiting.left&&leftWaiting.removedBeforeStart,'Antes de iniciar debe retirarlo completamente');
  const oldSession=await raw('/api/player/state',{playerToken:n1.token});assert.equal(oldSession.r.status,401,'La sesión abandonada debe quedar inválida');
  lobby=await ok('/api/community/state?visitorId=leave-test');normalCard=lobby.publicRooms.find(x=>x.id===normal.id);assert(normalCard);assert.equal(normalCard.playerCount,1);assert.equal(normalCard.joinOpen,true,'Al liberarse un lugar de una sala llena debe reabrir ingreso');
  const replacement=await ok('/api/player/open-join',{method:'POST',body:{roomCode:normal.roomCode,name:'Carla',cardCount:1,deviceId:'leave-normal-c'}});assert(replacement.token);

  // Privada: usa exactamente la misma acción de salida.
  const privateRoom=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'leave-private-host',name:'Host Privado',roomName:'Salida Privada',gameKind:'normal',mode:75,maxPlayers:3,maxCardsPerPlayer:1,autoSeconds:12,startMode:'manual',accessType:'private',accessKey:'CLAVE77'}});
  const privateOrganizer=await ok('/api/community/creator-state',{method:'POST',body:{publicId:privateRoom.id,creatorCode:privateRoom.creatorCode}});
  const privatePlayer=await ok('/api/player/open-join',{method:'POST',body:{roomCode:privateOrganizer.roomCode,name:'Privado',cardCount:1,deviceId:'leave-private-p',communityAccessGranted:true}});
  const leftPrivate=await ok('/api/player/community-leave',{method:'POST',playerToken:privatePlayer.token,body:{}});assert(leftPrivate.left&&leftPrivate.removedBeforeStart,'La salida debe funcionar también en sala privada');

  // Flash iniciado: salir cierra sesión, pero no reescribe la competencia ya iniciada.
  const runningFlash=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'leave-flash-running',name:'Host Flash',roomName:'Flash en curso',gameKind:'flash',mode:75,maxPlayers:4,maxCardsPerPlayer:4,autoSeconds:12,startMode:'manual',accessType:'public'}});
  const fa=await ok('/api/player/open-join',{method:'POST',body:{roomCode:runningFlash.roomCode,name:'Flash A',cardCount:4,deviceId:'leave-flash-a'}});
  const fb=await ok('/api/player/open-join',{method:'POST',body:{roomCode:runningFlash.roomCode,name:'Flash B',cardCount:4,deviceId:'leave-flash-b'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:runningFlash.id,creatorCode:runningFlash.creatorCode}});await waitPlaying(fa.token);await selectRoom(admin,runningFlash.roomCode);
  let adminState=await ok('/api/admin/state',{token:admin});assert.equal(adminState.players.length,2);
  const leftPlaying=await ok('/api/player/community-leave',{method:'POST',playerToken:fa.token,body:{}});assert(leftPlaying.left&&!leftPlaying.removedBeforeStart,'Con partida iniciada debe conservar el registro competitivo');
  const leftPlayingSession=await raw('/api/player/state',{playerToken:fa.token});assert.equal(leftPlayingSession.r.status,401);
  adminState=await ok('/api/admin/state',{token:admin});assert.equal(adminState.players.length,2,'Salir en juego no debe borrar cartón/resultado');assert(['starting','playing'].includes(adminState.status),'Salir no debe cerrar la mesa');

  // Flash finalizado: debe desaparecer inmediatamente de Comunidad, sin ventana de 2 horas.
  const flash=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'flash-hide-host',name:'Host',roomName:'Flash que desaparece',gameKind:'flash',mode:75,maxPlayers:4,maxCardsPerPlayer:4,autoSeconds:12,startMode:'manual',accessType:'public'}});
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:flash.roomCode,name:'Lola',cardCount:4,deviceId:'flash-hide-a'}});
  const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:flash.roomCode,name:'Milo',cardCount:4,deviceId:'flash-hide-b'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:flash.id,creatorCode:flash.creatorCode}});let sa=await waitPlaying(a.token);const sb=await ok('/api/player/state',{playerToken:b.token});await selectRoom(admin,flash.roomCode);
  const an=nums(sa.player.cards[0]),bn=nums(sb.player.cards[0]),bset=new Set(bn),aset=new Set(an);const unique=an.find(n=>!bset.has(n))||bn.find(n=>!aset.has(n));const targetName=an.includes(unique)&&!bset.has(unique)?'Lola':'Milo';const outside=Array.from({length:75},(_,i)=>i+1).filter(n=>!aset.has(n)&&!bset.has(n));assert(unique&&outside.length>=9);
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:[unique,...outside.slice(0,9)]}});for(let i=0;i<10;i++)await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'flash-hide'}});
  sa=await ok('/api/player/state',{playerToken:a.token});assert.equal(sa.status,'finished');assert.equal(sa.flash.winner.playerName,targetName);
  lobby=await ok('/api/community/state?visitorId=leave-test');assert(!lobby.publicRooms.some(x=>x.id===flash.id),'Flash terminado no debe seguir visible en Comunidad');

  // La interfaz debe exponer un botón global, no uno exclusivo de una modalidad.
  const html=fs.readFileSync(path.join(root,'player.html'),'utf8'),js=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
  assert(html.includes('id="leaveCommunityRoomBtn"')&&html.includes('ABANDONAR SALA'));
  assert(js.includes('/api/player/community-leave')&&js.includes('syncCommunityLeaveButton'));

  console.log('PRUEBA SALIDA COMUNIDAD + FLASH LOBBY: OK · pública/privada · espera/juego · Flash desaparece al finalizar');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
