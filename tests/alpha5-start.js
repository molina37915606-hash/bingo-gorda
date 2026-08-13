'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const port = 53800 + Math.floor(Math.random() * 150);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-alpha5-start-'));
const child = spawn(process.execPath, ['server.js'], { cwd:path.join(__dirname,'..'), env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base}, stdio:['ignore','pipe','pipe'] });
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<100;i++){try{const r=await fetch(base+'/healthz');if(r.ok)return}catch{}await wait(40)}throw new Error('Servidor no disponible')}
async function json(url,method='GET',body,headers={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
(async()=>{try{
  await waitServer();
  const login=await json('/api/admin/login','POST',{}); const ah={'X-Admin-Token':login.token};
  await json('/api/admin/create-simple-room','POST',{mode:90,cardCount:100,autoSeconds:60,rules:{line:true,bingo:true},paymentMode:'free',markingMode:'normal',accessKey:'AUTO555',maxCardsPerPlayer:3,linePrizeCount:2},ah);
  const a=await json('/api/player/alpha-join','POST',{accessKey:'AUTO555',name:'Ana',cardCount:2,deviceId:'alpha5-a'});
  const b=await json('/api/player/alpha-join','POST',{accessKey:'AUTO555',name:'Beto',cardCount:3,deviceId:'alpha5-b'});
  const c=await json('/api/player/alpha-join','POST',{accessKey:'AUTO555',name:'Ceci',cardCount:1,deviceId:'alpha5-c'});
  let st=await json('/api/admin/state','GET',undefined,ah);
  assert.equal(st.startPlan.autoAssignPlayers,3);
  await json('/api/admin/start','POST',{},ah);
  st=await json('/api/admin/state','GET',undefined,ah);
  assert.equal(st.players.filter(p=>p.selectionConfirmed).length,3);
  assert.equal(st.players.every(p=>p.markingModeChosen && !p.autoMark),true,'Quien no eligió modo debe iniciar Manual');
  const ids=st.players.flatMap(p=>p.cardIds); assert.equal(new Set(ids).size,ids.length,'No puede haber cartones duplicados');
  assert.deepEqual(st.players.map(p=>p.cardIds.length).sort((x,y)=>x-y),[1,2,3]);
  await json('/api/admin/close','POST',{},ah);

  await json('/api/admin/create-simple-room','POST',{mode:90,cardCount:100,autoSeconds:60,rules:{line:true,bingo:true},paymentMode:'paid',cardPrice:1000,whatsapp:'3757624388',markingMode:'normal',accessKey:'PAGO555',maxCardsPerPlayer:3,linePrizeCount:1},ah);
  const p1=await json('/api/player/alpha-join','POST',{accessKey:'PAGO555',name:'Pago Uno',cardCount:2,deviceId:'pay1'});
  const p2=await json('/api/player/alpha-join','POST',{accessKey:'PAGO555',name:'Pago Dos',cardCount:2,deviceId:'pay2'});
  const p3=await json('/api/player/alpha-join','POST',{accessKey:'PAGO555',name:'Pendiente',cardCount:3,deviceId:'pay3'});
  st=await json('/api/admin/state','GET',undefined,ah);
  const one=st.players.find(p=>p.name==='Pago Uno'),two=st.players.find(p=>p.name==='Pago Dos');
  await json('/api/admin/player-approval','POST',{playerId:one.id,allowedCardCount:2,confirmPayment:true},ah);
  await json('/api/admin/player-approval','POST',{playerId:two.id,allowedCardCount:1,confirmPayment:true},ah);
  await json('/api/admin/start','POST',{},ah);
  st=await json('/api/admin/state','GET',undefined,ah);
  const pend=st.players.find(p=>p.name==='Pendiente');
  assert.equal(pend.selectionConfirmed,false,'Pago pendiente no debe recibir cartones');
  assert.equal(pend.cardIds.length,0);
  assert.equal(st.players.find(p=>p.name==='Pago Uno').selectionConfirmed,true);
  assert.equal(st.players.find(p=>p.name==='Pago Dos').selectionConfirmed,true);
  console.log('PRUEBA ALFA 5 INICIO: OK · asignación automática sin duplicados + pago pendiente excluido');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
