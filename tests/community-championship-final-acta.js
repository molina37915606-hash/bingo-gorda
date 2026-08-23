'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');
const communityJs = fs.readFileSync(path.join(root, 'js/community.js'), 'utf8');
assert(serverSrc.includes('function buildChampionshipActaPdf'), 'Debe existir PDF completo de Campeonato.');
assert(serverSrc.includes('roundHistory') && serverSrc.includes('finalActaSha256'), 'Debe persistir historial de rondas y SHA final.');
assert(communityJs.includes('downloadCreatorActa') && communityJs.includes('RESULTADOS / ACTA'), 'Comunidad debe dejar descargar el acta al creador.');
assert(playerJs.includes('DESCARGAR ACTA COMPLETA PDF'), 'Jugador debe conservar descarga PDF al final.');

const port = 59220 + Math.floor(Math.random() * 80);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-champ-final-acta-'));
const samplePdf = path.join(os.tmpdir(), `championship-final-acta-${process.pid}.pdf`);
let child = null;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function spawnServer(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'30',BINGO_CHAMPIONSHIP_RESULTS_VISIBILITY_MS:'600000'},stdio:['ignore','pipe','pipe']});}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{proc.kill('SIGKILL')}catch{}resolve()},1500);proc.once('exit',()=>{clearTimeout(t);resolve()});try{proc.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function waitServer(){for(let i=0;i<180;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw new Error('No inició servidor')}
async function raw(pathname,{method='GET',body,token,playerToken}={}){const response=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json().catch(()=>({}));return{response,data}}
async function ok(pathname,opt={}){const out=await raw(pathname,opt);assert(out.response.ok,`${pathname}: ${out.response.status} ${JSON.stringify(out.data)}`);return out.data}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin});const room=list.rooms.find(x=>x.roomCode===roomCode);assert(room);if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
async function finishRound(admin, playerToken){for(let i=0;i<90;i++){const draw=await raw('/api/admin/draw',{method:'POST',token:admin,body:{source:'v905-final-acta'}});if(!draw.response.ok)break;const state=await ok('/api/player/state',{playerToken});if(state.status==='finalizing'&&state.championship?.stage==='reaction')break;}await wait(260);return ok('/api/player/state',{playerToken});}
async function creatorDownload(created,type){const response=await fetch(base+'/api/community/creator-acta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicId:created.id,creatorCode:created.creatorCode,type})});if(!response.ok){const text=await response.text();assert.fail(`creator acta ${type}: ${response.status} ${text}`)}return {response,buffer:Buffer.from(await response.arrayBuffer())}}

(async()=>{
 try{
  spawnServer();await waitServer();
  let admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-v905',name:'Organizador',roomName:'Final y acta V905',gameKind:'championship',championshipRounds:3,championshipReactionBonus:true,mode:90,maxPlayers:8,maxCardsPerPlayer:2,autoSeconds:8,startMode:'manual',accessType:'public'}});
  // El organizador NO entra como jugador: igual debe poder descargar CSV/JSON/PDF al final.
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:2,deviceId:'v905-a'}});
  const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto',cardCount:1,deviceId:'v905-b'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await wait(120);await selectRoom(admin,created.roomCode);
  for(let round=1;round<=3;round++){
    const state=await finishRound(admin,a.token);
    if(round<3){assert.equal(state.championship.stage,'results');assert.equal(state.championship.completedRounds,round);await ok('/api/community/creator-next-round',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await wait(120);}
    else {assert.equal(state.status,'finished');assert.equal(state.championship.stage,'finished');assert.equal(state.championship.completedRounds,3);assert.equal(state.championship.roundSummaries.length,3);assert.equal(state.championship.finalActaSha256.length,64);assert(state.championship.fullLeaderboard.length>=3);}
  }
  const creatorState=await ok('/api/community/creator-state',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});
  assert.equal(creatorState.status,'finished');assert.equal(creatorState.actaAvailable,true);assert.equal(creatorState.championship.roundSummaries.length,3);
  const lobby=await ok('/api/community/state?visitorId=viewer-v905');
  const finished=(lobby.lobbyRooms||lobby.publicRooms||[]).find(x=>x.id===created.id);
  assert(finished&&finished.status==='finished','El Campeonato finalizado debe seguir visible temporalmente en Comunidad.');

  const playerPdf=await fetch(base+'/api/player/acta.pdf',{headers:{'X-Player-Token':a.token}});assert(playerPdf.ok);const playerPdfBuf=Buffer.from(await playerPdf.arrayBuffer());assert(playerPdfBuf.length>5000);assert(playerPdfBuf.slice(0,5).toString()==='%PDF-');
  const creatorPdf=await creatorDownload(created,'pdf');assert(creatorPdf.buffer.length>5000);fs.writeFileSync(samplePdf,creatorPdf.buffer);
  const creatorCsv=await creatorDownload(created,'csv');const csv=creatorCsv.buffer.toString('utf8');assert(csv.includes('RONDA 1')&&csv.includes('RONDA 2')&&csv.includes('RONDA 3'));assert(csv.includes('PUNTOS POR RONDA'));
  const creatorJson=await creatorDownload(created,'json');const report=JSON.parse(creatorJson.buffer.toString('utf8'));assert.equal(report.rounds.length,3);assert.equal(report.finalActaSha256.length,64);assert(report.positions.every(p=>Array.isArray(p.rounds)&&p.rounds.length===3),'JSON debe conservar matrices/historial por las tres rondas.');

  // Reinicio: el organizador sigue pudiendo recuperar el cierre y descargar el acta.
  await stop();spawnServer();await waitServer();admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;
  const afterRestart=await ok('/api/community/creator-state',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});assert.equal(afterRestart.status,'finished');assert.equal(afterRestart.championship.roundSummaries.length,3);
  const jsonAfter=await creatorDownload(created,'json');assert.equal(JSON.parse(jsonAfter.buffer.toString('utf8')).finalActaSha256,report.finalActaSha256);
  console.log(`CAMPEONATO V9.0.5 FINAL + ACTA: OK · 3 rondas · final persistente · PDF/CSV/JSON · SHA · reinicio · SAMPLE=${samplePdf}`);
 }catch(err){console.error(err);process.exitCode=1}finally{await stop();if(process.exitCode)console.error('DATA_DIR conservado para diagnóstico:',dataDir);else fs.rmSync(dataDir,{recursive:true,force:true})}
})();
