'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const port = 51200 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-admin-contingency-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    PORT: String(port),
    BINGO_TEST_MODE: 'true',
    BINGO_DATA_DIR: dataDir,
    BINGO_CLAIM_WINDOW_MS: '100',
    BINGO_ADMIN_CONTINGENCY_MS: '250',
    BINGO_START_SEQUENCE_MS: '100',
    BINGO_CLAIM_AUTO_RESUME_MS: '120'
  },
  stdio: ['ignore','pipe','pipe']
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(url, options={}) { const response = await fetch(base + url, options); const data = await response.json().catch(()=>({})); return { response, data }; }
async function waitServer(){for(let i=0;i<120;i++){try{const x=await json('/healthz');if(x.response.ok)return}catch{}await wait(40)}throw new Error('Servidor no disponible.');}
function headers(token){return {'Content-Type':'application/json','X-Admin-Token':token};}
function openAdminSse(token){
  return new Promise((resolve,reject)=>{
    const req=http.get(`${base}/api/events?role=admin&adminToken=${encodeURIComponent(token)}`,res=>{
      res.once('data',()=>resolve({req,res}));
      res.on('error',()=>{});
    });
    req.on('error',reject);
  });
}

(async()=>{let stream;try{
  await waitServer();
  let out=await json('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(out.response.status,200,JSON.stringify(out.data));
  const admin=out.data.token;
  out=await json('/api/admin/create-ai-simulation',{method:'POST',headers:headers(admin),body:JSON.stringify({playerCount:2,mode:90,autoSeconds:3,rules:{ambocabeza:false,line:true,bingo:true},aiChatEnabled:false})});
  assert.equal(out.response.status,200,JSON.stringify(out.data));
  const first=out.data.players[0];
  const card=out.data.game.cards.find(item=>first.cardIds.includes(item.id));
  const line=card.grid[0].filter(Number.isFinite);
  out=await json('/api/admin/test/draw-order',{method:'POST',headers:headers(admin),body:JSON.stringify({sequence:line})});
  assert.equal(out.response.status,200,JSON.stringify(out.data));
  out=await json('/api/admin/draw-settings',{method:'POST',headers:headers(admin),body:JSON.stringify({drawMode:'automatic',autoSeconds:3})});
  assert.equal(out.response.status,200,JSON.stringify(out.data));
  stream=await openAdminSse(admin);
  out=await json('/api/admin/start',{method:'POST',headers:headers(admin),body:JSON.stringify({force:true})});
  assert.equal(out.response.status,200,JSON.stringify(out.data));
  await wait(130);
  let state;
  for(const _ of line){
    out=await json('/api/admin/draw',{method:'POST',headers:headers(admin),body:JSON.stringify({source:'contingency-test'})});
    assert.equal(out.response.status,200,JSON.stringify(out.data));
    await wait(80);
    state=(await json('/api/admin/state',{headers:headers(admin)})).data;
    if(state.status==='verifying')break;
  }
  for(let i=0;i<30;i++){state=(await json('/api/admin/state',{headers:headers(admin)})).data;if(state.claims?.some(c=>c.status==='pending'))break;await wait(40)}
  assert(state.claims.some(c=>c.status==='pending'),'Debe existir un reclamo pendiente antes de la contingencia.');
  stream.req.destroy(); stream.res.destroy(); stream=null;
  await wait(380);
  state=(await json('/api/admin/state',{headers:headers(admin)})).data;
  assert.equal(state.adminPresence.connected,false);
  assert.equal(state.adminPresence.autoVerificationActive,true,'La contingencia automática debe activarse al vencer el plazo.');
  for(let i=0;i<30;i++){
    state=(await json('/api/admin/state',{headers:headers(admin)})).data;
    if(!state.claims.some(c=>c.status==='pending'))break;
    await wait(50);
  }
  assert(!state.claims.some(c=>c.status==='pending'),'La verificación automática debe resolver los reclamos pendientes.');
  assert(state.claims.some(c=>c.status==='confirmed'&&c.resolutionReason==='automatic_verified'),'Debe quedar registrado que el reclamo fue verificado automáticamente.');
  assert.equal(state.status,'playing','Una partida automática debe continuar después de verificar el premio.');
  const before=state.game.drawn.length;
  await wait(3250);
  state=(await json('/api/admin/state',{headers:headers(admin)})).data;
  assert(state.game.drawn.length>before,'El sorteo automático debe seguir extrayendo bolillas sin administrador conectado.');
  assert(state.integrity?.commitment,'El sello público del sorteo debe estar disponible.');
  console.log('PRUEBA CONTINGENCIA ADMIN: OK');
}catch(error){console.error(error);process.exitCode=1}finally{if(stream){stream.req.destroy();stream.res.destroy()}child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
