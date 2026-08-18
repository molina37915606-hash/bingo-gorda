'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
const adminHtml=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const adminJs=fs.readFileSync(path.join(root,'js/admin.js'),'utf8');
assert(serverSrc.includes("Array.from({ length: 9 }")&&serverSrc.includes('MAX_OPERATIONAL_ROOMS = OPERATIONAL_WORKSPACE_IDS.length'),'Debe existir un límite explícito de diez salas operativas.');
assert(serverSrc.includes('archiveCurrentResults')&&serverSrc.includes('HISTORY_DIR'),'Los resultados deben archivarse de forma permanente.');
assert(adminHtml.includes('id="roomSlots"')&&adminHtml.includes('id="historyBtn"'),'Admin debe mostrar dinámicamente las salas y el historial.');
assert(adminJs.includes('switchWorkspace')&&adminJs.includes('openHistory'),'Admin debe poder cambiar de sala y abrir historial.');

const port=57900+Math.floor(Math.random()*120),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-multisala-history-'));
let child=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function spawnServer(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'30'},stdio:['ignore','pipe','pipe']});}
async function stopServer(){if(!child)return;const proc=child;child=null;await new Promise(resolve=>{const timer=setTimeout(()=>{try{proc.kill('SIGKILL')}catch{}resolve()},1500);proc.once('exit',()=>{clearTimeout(timer);resolve()});try{proc.kill('SIGTERM')}catch{clearTimeout(timer);resolve()}})}
async function waitServer(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
async function json(pathname,{method='GET',body,token}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return {r,d}}
async function ok(pathname,opt={}){const out=await json(pathname,opt);assert(out.r.ok,`${pathname}: ${out.r.status} ${JSON.stringify(out.d)}`);return out.d}
async function login(){return (await ok('/api/admin/login',{method:'POST',body:{}})).token}
async function select(token,workspaceId){return ok('/api/admin/workspace/select',{method:'POST',token,body:{workspaceId}})}
async function createSimulation(token,mode){await ok('/api/admin/create-ai-simulation',{method:'POST',token,body:{playerCount:2,mode,autoSeconds:60,rules:{ambocabeza:false,line:true,bingo:true},aiChatEnabled:false}});await ok('/api/admin/start',{method:'POST',token,body:{force:true}});await wait(90);return ok('/api/admin/state',{token})}
(async()=>{try{
  spawnServer();await waitServer();let token=await login();
  let a=await createSimulation(token,90);assert.equal(a.status,'playing');const roomA=a.roomCode;
  await select(token,'slot2');let b=await createSimulation(token,75);assert.equal(b.status,'playing');const roomB=b.roomCode;assert.notEqual(roomA,roomB,'Cada sala debe tener código propio.');

  let manager=await ok('/api/admin/workspaces',{token});
  assert.equal(manager.rooms.length,10);assert.equal(manager.rooms.filter(x=>x.active).length,2,'Deben poder coexistir dos salas activas dentro de diez lugares.');
  assert(manager.rooms.filter(x=>x.active).every(x=>x.status==='playing'),'Ambas salas deben poder estar jugando al mismo tiempo.');

  b=await ok('/api/admin/draw',{method:'POST',token,body:{source:'multisala-b'}});const bDrawn=b.game.drawn.length;assert.equal(bDrawn,1);
  await select(token,'owner');a=await ok('/api/admin/state',{token});assert.equal(a.roomCode,roomA);assert.equal(a.game.drawn.length,0,'Una extracción en Sala 2 no debe afectar Sala 1.');
  a=await ok('/api/admin/draw',{method:'POST',token,body:{source:'multisala-a'}});assert.equal(a.game.drawn.length,1);
  await select(token,'slot2');b=await ok('/api/admin/state',{token});assert.equal(b.game.drawn.length,bDrawn,'Una extracción en Sala 1 no debe afectar Sala 2.');

  // Reinicio: deben recuperarse los dos workspaces, no solo owner.
  await stopServer();spawnServer();await waitServer();token=await login();
  manager=await ok('/api/admin/workspaces',{token});assert(manager.rooms.find(x=>x.workspaceId==='owner'&&x.roomCode===roomA&&x.active),'Sala 1 debe recuperarse tras reinicio.');assert(manager.rooms.find(x=>x.workspaceId==='slot2'&&x.roomCode===roomB&&x.active),'Sala 2 debe recuperarse tras reinicio.');
  a=await ok('/api/admin/state',{token});assert.equal(a.roomCode,roomA);assert.equal(a.game.drawn.length,1);
  await select(token,'slot2');b=await ok('/api/admin/state',{token});assert.equal(b.roomCode,roomB);assert.equal(b.game.drawn.length,1);

  // Cada cierre se archiva por separado, sin reemplazar el anterior.
  await ok('/api/admin/finish',{method:'POST',token,body:{forceSimulation:true}});
  let history=await ok('/api/admin/history',{token});assert(history.entries.some(x=>x.roomCode===roomB&&x.status==='finished'),'Sala 2 debe aparecer en historial.');
  let pdf=await fetch(base+`/api/admin/history/file?sala=${encodeURIComponent(roomB)}&type=acta-pdf`,{headers:{'X-Admin-Token':token}});assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert((await pdf.arrayBuffer()).byteLength>300,'Acta histórica debe ser descargable.');
  await ok('/api/admin/close',{method:'POST',token,body:{}});

  await select(token,'owner');await ok('/api/admin/finish',{method:'POST',token,body:{forceSimulation:true}});history=await ok('/api/admin/history',{token});
  assert(history.entries.some(x=>x.roomCode===roomA&&x.status==='finished'),'Sala 1 debe aparecer en historial.');
  assert(history.entries.some(x=>x.roomCode===roomB&&x.status==='finished'),'Archivar Sala 1 no debe reemplazar Sala 2.');
  assert(history.entries.filter(x=>[roomA,roomB].includes(x.roomCode)).length>=2,'Debe haber un registro independiente por partida.');
  await ok('/api/admin/close',{method:'POST',token,body:{}});

  // Una sala cancelada deja rastro, pero no acta oficial falsa.
  await select(token,'slot2');const waiting=await ok('/api/admin/create-simple-room',{method:'POST',token,body:{mode:90,cardCount:30,autoSeconds:8,rules:{line:true,bingo:true},paymentMode:'free',maxCardsPerPlayer:2}});const cancelledCode=waiting.roomCode;
  await ok('/api/admin/close',{method:'POST',token,body:{}});history=await ok('/api/admin/history',{token});const cancelled=history.entries.find(x=>x.roomCode===cancelledCode);assert(cancelled&&cancelled.status==='cancelled','Sala cancelada debe conservarse como cancelada.');assert(!cancelled.files?.actaPdf,'Sala cancelada no debe fingir un acta oficial.');

  // Una programación ya vinculada a una sala en espera sigue siendo editable y sincroniza la sala real.
  const starts1=new Date(Date.now()+2*60*60_000).toISOString();
  let agenda=await ok('/api/admin/community/schedule',{method:'POST',token,body:{action:'save',startsAt:starts1,registrationMinutes:15,autoStart:false,mode:90,paymentMode:'free',markingMode:'normal',maxCardsPerPlayer:2,cardCount:50,autoSeconds:8,linePrizeCount:1,rules:{line:true,bingo:true}}});
  const schedule=agenda.scheduledGames.find(x=>x.startsAt===starts1);assert(schedule,'Debe crear programación editable.');
  agenda=await ok('/api/admin/community/schedule',{method:'POST',token,body:{action:'create-room',id:schedule.id}});const linked=agenda.scheduledGames.find(x=>x.id===schedule.id);assert(linked.roomCode&&linked.workspaceId,'La programación debe quedar vinculada a un workspace.');
  const starts2=new Date(Date.now()+3*60*60_000).toISOString();
  agenda=await ok('/api/admin/community/schedule',{method:'POST',token,body:{action:'save',id:schedule.id,startsAt:starts2,registrationMinutes:25,autoStart:false,mode:90,paymentMode:'free',markingMode:'normal',maxCardsPerPlayer:3,cardCount:100,autoSeconds:12,linePrizeCount:2,rules:{line:true,bingo:true}}});
  const edited=agenda.scheduledGames.find(x=>x.id===schedule.id);assert.equal(edited.roomCode,linked.roomCode);assert.equal(edited.startsAt,starts2);assert.equal(edited.cardCount,100);assert.equal(edited.maxCardsPerPlayer,3);
  await select(token,linked.workspaceId);const linkedState=await ok('/api/admin/state',{token});assert.equal(linkedState.roomCode,linked.roomCode);assert.equal(linkedState.status,'waiting');assert.equal(linkedState.game.cards.length,100,'Editar cantidad debe redimensionar el pool de la sala en espera.');assert.equal(linkedState.roomSettings.maxCardsPerPlayer,3);assert.equal(linkedState.roomSettings.linePrizeCount,2);assert.equal(linkedState.roomSettings.scheduledAt,starts2);assert.equal(linkedState.roomSettings.scheduledRegistrationMinutes,25);
  await ok('/api/admin/close',{method:'POST',token,body:{}});

  // Dos programaciones AUTO pueden crear simultáneamente los dos slots aunque Admin no esté mirando ninguna.
  const autoStarts1=new Date(Date.now()+35_000).toISOString(),autoStarts2=new Date(Date.now()+40_000).toISOString();
  agenda=await ok('/api/admin/community/schedule',{method:'POST',token,body:{action:'save',startsAt:autoStarts1,registrationMinutes:1,autoStart:true,mode:90,paymentMode:'free',markingMode:'normal',maxCardsPerPlayer:2,cardCount:50,autoSeconds:60,linePrizeCount:1,rules:{line:true,bingo:true}}});const autoOne=agenda.scheduledGames.find(x=>x.startsAt===autoStarts1);assert(autoOne);
  agenda=await ok('/api/admin/community/schedule',{method:'POST',token,body:{action:'save',startsAt:autoStarts2,registrationMinutes:1,autoStart:true,mode:75,paymentMode:'free',markingMode:'normal',maxCardsPerPlayer:2,cardCount:50,autoSeconds:60,linePrizeCount:1,rules:{line:true,bingo:true}}});const autoTwo=agenda.scheduledGames.find(x=>x.startsAt===autoStarts2);assert(autoTwo);
  await wait(1300);agenda=await ok('/api/admin/community',{token});const autoSaved1=agenda.scheduledGames.find(x=>x.id===autoOne.id),autoSaved2=agenda.scheduledGames.find(x=>x.id===autoTwo.id);assert(autoSaved1.roomCode&&autoSaved2.roomCode,'Agenda AUTO debe crear las dos salas dentro de sus ventanas de inscripción.');assert.notEqual(autoSaved1.workspaceId,autoSaved2.workspaceId,'Cada programación AUTO debe ocupar un workspace diferente.');
  for(const item of [autoSaved1,autoSaved2]){await select(token,item.workspaceId);const autoRoom=await ok('/api/admin/state',{token});assert.equal(autoRoom.roomCode,item.roomCode);assert.equal(autoRoom.status,'waiting');assert.equal(autoRoom.roomSettings.joinOpen,true);await ok('/api/admin/close',{method:'POST',token,body:{}})}

  console.log('PRUEBA MULTISALA + HISTORIAL: OK · 10 lugares + 2 jugando + aislamiento + reinicio + actas + agenda editable + doble AUTO');
}catch(e){console.error(e);process.exitCode=1}finally{await stopServer();fs.rmSync(dataDir,{recursive:true,force:true})}})();
