'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = 59820 + Math.floor(Math.random() * 70);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-slot-reuse-'));
const idleMs = 2500;
let child;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function req(url, { method='GET', body } = {}) {
  const r = await fetch(base + url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type':'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const d = await r.json().catch(() => ({}));
  assert(r.ok, `${url}: ${r.status} ${JSON.stringify(d)}`);
  return d;
}
async function ready(){
  for(let i=0;i<180;i++){
    try { if((await fetch(base + '/healthz')).ok) return; } catch {}
    await sleep(35);
  }
  throw new Error('No inició servidor');
}
async function stop(){
  if(!child) return;
  const p=child; child=null;
  await new Promise(resolve => {
    const timer=setTimeout(()=>{ try{p.kill('SIGKILL')}catch{} resolve(); },1200);
    p.once('exit',()=>{clearTimeout(timer);resolve();});
    try{p.kill('SIGTERM')}catch{clearTimeout(timer);resolve();}
  });
}

(async()=>{try{
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT:String(port), ONLINE_MODE:'false', MASTER_ADMIN_PASSWORD:'', ADMIN_PASSWORD:'', BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, PUBLIC_URL:base, BINGO_COMMUNITY_EMPTY_IDLE_MS:String(idleMs) },
    stdio:['ignore','pipe','pipe']
  });
  await ready();

  // Dejamos que los slots libres superen el umbral de inactividad. Antes de V9.3.1,
  // crear una sala después de este punto heredaba ese reloj viejo y podía cerrarse al instante.
  await sleep(idleMs + 350);

  const room = await req('/api/community/public-room', { method:'POST', body:{
    visitorId:'slot-reuse-host', name:'Host', roomName:'Slot reutilizado', gameKind:'normal', mode:90,
    maxPlayers:10, maxCardsPerPlayer:2, autoSeconds:8, startMode:'manual', accessType:'public'
  }});
  assert.equal(room.status, 'waiting');
  assert.equal(room.joinOpen, true);

  // Debe seguir viva pasado al menos un ciclo de mantenimiento; su reloj empieza en la creación.
  await sleep(1250);
  const state = await req('/api/community/state?visitorId=slot-reuse-check');
  const visible = (state.publicRooms || []).find(item => item.id === room.id);
  assert(visible, 'Una sala recién creada no debe heredar la inactividad del slot anterior');
  assert.equal(visible.status, 'waiting');
  assert.equal(visible.joinOpen, true);

  console.log('V9.3.1 SLOT REUSE: OK · sala nueva reinicia actividad y no se cierra al reutilizar un slot viejo');
}catch(error){
  console.error(error); process.exitCode=1;
}finally{
  await stop();
  if(!process.exitCode) fs.rmSync(dataDir,{recursive:true,force:true});
  else console.error('DATA_DIR:',dataDir);
}})();
