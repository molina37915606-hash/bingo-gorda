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
assert(adminHtml.includes('id="communityScheduleRegistrationMinutes"'),'Admin debe configurar minutos de inscripción.');
assert(adminHtml.includes('id="communityScheduleAutoStart"'),'Admin debe poder activar el inicio automático.');
assert(adminJs.includes("action:'set-auto'"),'Admin debe poder cancelar/reactivar la automatización.');
assert(serverSrc.includes('processCommunityScheduleAutomation'),'Servidor debe procesar la agenda aunque Admin no esté mirando la pantalla.');
assert(serverSrc.includes('scheduled_join_opened')&&serverSrc.includes('scheduled_join_closed')&&serverSrc.includes('scheduled_start_blocked'),'La automatización debe dejar trazabilidad.');

const port=57100+Math.floor(Math.random()*180),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-auto-schedule-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'180'},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
async function req(pathname,{method='GET',body,token}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));assert(r.ok,`${pathname}: ${r.status} ${JSON.stringify(d)}`);return d}
async function generalJoin(roomCode,name){const r=await fetch(base+'/jugador/entrar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`roomCode=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(name)}&cardCount=1`,redirect:'manual'});assert.equal(r.status,303,`No pudo entrar ${name}`)}
(async()=>{try{
  await waitServer();
  const login=await req('/api/admin/login',{method:'POST',body:{}}),token=login.token;
  const startsAt=new Date(Date.now()+4200).toISOString();
  let community=await req('/api/admin/community/schedule',{method:'POST',token,body:{action:'save',startsAt,registrationMinutes:1,autoStart:true,mode:75,paymentMode:'free'}});
  const schedule=community.scheduledGames[0];
  assert.equal(schedule.registrationMinutes,1);
  assert.equal(schedule.autoStart,true);

  let room=await req('/api/admin/create-simple-room',{method:'POST',token,body:{mode:75,cardCount:60,autoSeconds:60,rules:{line:true,corners:true,bingo:true},markingMode:'normal',maxCardsPerPlayer:4,paymentMode:'free',communityScheduleId:schedule.id}});
  assert.equal(room.roomSettings.joinOpen,false,'Sala preparada debe empezar cerrada hasta que actúe la agenda.');

  // El horario de apertura (1 minuto antes) ya quedó alcanzado; el servidor debe abrir solo.
  for(let i=0;i<30 && !room.roomSettings.joinOpen;i++){await wait(100);room=await req('/api/admin/state',{token})}
  assert.equal(room.roomSettings.joinOpen,true,'La agenda debe abrir inscripciones sin intervención del Admin.');
  await generalJoin(room.roomCode,'Automática Uno');
  await generalJoin(room.roomCode,'Automática Dos');

  // Al llegar la hora, debe cerrar y comenzar sola. La autoasignación resuelve cartones pendientes.
  for(let i=0;i<80 && room.status==='waiting';i++){await wait(100);room=await req('/api/admin/state',{token})}
  assert.notEqual(room.status,'waiting','La partida debe abandonar espera al cumplirse el horario.');
  assert.equal(room.roomSettings.joinOpen,false,'Las inscripciones deben quedar cerradas al iniciar.');
  assert(room.players.filter(p=>!p.excludedFromRound).every(p=>p.selectionConfirmed),'Los participantes habilitados deben recibir cartón antes de iniciar.');
  community=await req('/api/admin/community',{token});
  const saved=community.scheduledGames.find(g=>g.id===schedule.id);
  assert(saved.autoOpenedAt,'Debe registrar cuándo abrió inscripciones.');
  assert(saved.autoClosedAt,'Debe registrar cuándo cerró inscripciones.');
  assert(saved.autoStartedAt,'Debe registrar el inicio automático.');
  assert.equal(saved.autoStartError,'');

  console.log('PRUEBA FINAL AGENDA AUTOMÁTICA: OK · abre inscripción + cierra + autoasigna + inicia sola');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
