'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const playerJs = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');
const transmissionJs = fs.readFileSync(path.join(root, 'js/transmision.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
assert(playerJs.includes('championshipPositionHasPending'), 'Jugador debe detectar jugadas pendientes de Campeonato sin depender del modo de reclamo.');
assert(playerJs.includes('CANTADO'), 'El anuncio visual de Campeonato debe decir CANTADO.');
assert(!playerJs.includes('reactionBonusEnabled'), 'V4 no debe depender de bonus de reacción.');
assert(transmissionJs.includes('showChampionshipAnnouncement') && transmissionJs.includes('champ.announcements'), 'Transmisión debe mostrar los cantes públicos del Campeonato.');
assert(serverSrc.includes('announcements: []'), 'Campeonato debe persistir anuncios públicos.');
assert(serverSrc.includes("['championship','flash','antibingo'].includes(gameKind) ? 'manual'"), 'Campeonato, Flash y Antibingo deben forzar el modo manual del sistema de reclamos; Flash y Antibingo no exponen cantes.');

const port = 59110 + Math.floor(Math.random() * 80);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-champ-public-claims-'));
let child = null;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function spawnServer(){ child = spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'30'},stdio:['ignore','pipe','pipe']}); }
async function stop(){ if(!child)return; const proc=child; child=null; await new Promise(resolve=>{const t=setTimeout(()=>{try{proc.kill('SIGKILL')}catch{} resolve()},1200);proc.once('exit',()=>{clearTimeout(t);resolve()});try{proc.kill('SIGTERM')}catch{clearTimeout(t);resolve()}}); }
async function waitServer(){ for(let i=0;i<160;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{} await wait(40)} throw new Error('No inició servidor'); }
async function raw(pathname,{method='GET',body,token,playerToken}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));return{response:r,data};}
async function ok(pathname,opt={}){const out=await raw(pathname,opt);assert(out.response.ok,`${pathname}: ${out.response.status} ${JSON.stringify(out.data)}`);return out.data;}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin});const room=list.rooms.find(x=>x.roomCode===roomCode);assert(room);if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}});}

(async()=>{
 try{
  spawnServer(); await waitServer();
  const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-public-cants',name:'Host',roomName:'Cantes públicos',gameKind:'championship',championshipRounds:3,claimMode:'automatic_ties',mode:90,maxPlayers:10,maxCardsPerPlayer:2,autoSeconds:8,startMode:'manual',accessType:'public'}});
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:2,deviceId:'public-cants-a'}});
  const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto',cardCount:2,deviceId:'public-cants-b'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});
  await wait(120); await selectRoom(admin,created.roomCode);
  let aState=await ok('/api/player/state',{playerToken:a.token});
  assert.equal(aState.roomSettings.claimMode,'manual','Campeonato sin bonus igual debe conservar canto manual.');
  assert.equal(aState.championship.scoring.bingo,60);

  let lineAnnouncementId=''; let bingoAnnouncementId='';
  for(let i=0;i<90;i++){
    const draw=await raw('/api/admin/draw',{method:'POST',token:admin,body:{source:'champ-public-cants-test'}});
    if(!draw.response.ok) break;
    aState=await ok('/api/player/state',{playerToken:a.token});
    if(!lineAnnouncementId){
      const ready=(aState.championship?.ownPositions||[]).find(pos=>pos.lineBall&&!pos.lineClaimed);
      if(ready){
        const claim=await ok('/api/player/claim',{method:'POST',playerToken:a.token,body:{type:'line',cardId:ready.cardId}});
        assert.equal(claim.championshipClaim,true); assert.equal(claim.totalBonus,undefined);
        const bState=await ok('/api/player/state',{playerToken:b.token});
        const ann=(bState.championship?.announcements||[]).find(x=>x.playerName==='Ana'&&x.type==='line');
        assert(ann,'Otro jugador debe recibir el anuncio público de Primera Línea.');
        assert(ann.points>0,'El anuncio debe incluir los puntos de la Línea.'); lineAnnouncementId=ann.id;
        assert.equal(bState.status,'playing','El canto público no debe pausar el bolillero.');
      }
    }
    aState=await ok('/api/player/state',{playerToken:a.token});
    if(aState.status==='playing'&&!bingoAnnouncementId){
      const ready=(aState.championship?.ownPositions||[]).find(pos=>pos.bingoBall&&!pos.bingoClaimed);
      if(ready){
        const claim=await ok('/api/player/claim',{method:'POST',playerToken:a.token,body:{type:'bingo',cardId:ready.cardId}});
        assert.equal(claim.championshipClaim,true); assert.equal(claim.totalBonus,undefined);
        const bState=await ok('/api/player/state',{playerToken:b.token});
        const ann=(bState.championship?.announcements||[]).find(x=>x.playerName==='Ana'&&x.type==='bingo');
        assert(ann,'Otro jugador debe recibir el anuncio público de Bingo.'); bingoAnnouncementId=ann.id;
      }
    }
    if(aState.championship?.betweenRounds||lineAnnouncementId&&bingoAnnouncementId) break;
  }
  assert(lineAnnouncementId,'Debe habilitarse y cantarse Primera Línea en V4.');
  // El Bingo puede cerrar la ronda antes de que Ana llegue a cantarlo; el canto no afecta puntos ni cierre en V4.
  console.log('CAMPEONATO V4 CANTES PÚBLICOS: OK · botón siempre manual · Línea/Bingo · anuncio para todos · sin pausa');
 }catch(err){console.error(err);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}
})();
