'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const port = 50600 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-auto-resume-'));
const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT:String(port), BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, BINGO_CLAIM_WINDOW_MS:'100' }, stdio:['ignore','pipe','pipe'] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(url, options={}) { const response = await fetch(base + url, options); const data = await response.json().catch(()=>({})); return { response, data }; }
async function waitServer(){for(let i=0;i<100;i++){try{const x=await json('/healthz');if(x.response.ok)return}catch{}await wait(50)}throw new Error('Servidor no disponible.');}
function headers(token){return {'Content-Type':'application/json','X-Admin-Token':token};}
(async()=>{try{
  await waitServer();
  let out = await json('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); assert.equal(out.response.status,200,JSON.stringify(out.data)); const admin=out.data.token;
  out = await json('/api/admin/create-ai-simulation',{method:'POST',headers:headers(admin),body:JSON.stringify({playerCount:2,mode:90,autoSeconds:30,rules:{ambocabeza:false,line:true,bingo:true},aiChatEnabled:false})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  const first=out.data.players[0], card=out.data.game.cards.find(item=>first.cardIds.includes(item.id)), line=card.grid[0].filter(Number.isFinite);
  out=await json('/api/admin/test/draw-order',{method:'POST',headers:headers(admin),body:JSON.stringify({sequence:line})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  out=await json('/api/admin/draw-settings',{method:'POST',headers:headers(admin),body:JSON.stringify({drawMode:'manual'})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  out=await json('/api/admin/start',{method:'POST',headers:headers(admin),body:JSON.stringify({force:true})}); assert.equal(out.response.status,200,JSON.stringify(out.data)); await wait(100);
  let state;
  for (const _ of line) {
    out=await json('/api/admin/draw',{method:'POST',headers:headers(admin),body:JSON.stringify({source:'auto-resume-test'})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
    await wait(75); state=(await json('/api/admin/state',{headers:headers(admin)})).data; if(state.status==='verifying') break;
  }
  for(let i=0;i<20;i++){state=(await json('/api/admin/state',{headers:headers(admin)})).data;if(state.claims?.some(c=>c.status==='pending'))break;await wait(50)}
  assert(state.claims.some(c=>c.status==='pending'),'Debe existir un reclamo IA pendiente.');
  await wait(140);
  while (true) {
    state=(await json('/api/admin/state',{headers:headers(admin)})).data;
    const next=state.claims.filter(c=>c.status==='pending').sort((a,b)=>Number(a.receivedSequence||0)-Number(b.receivedSequence||0))[0];
    if(!next)break;
    out=await json('/api/admin/resolve',{method:'POST',headers:headers(admin),body:JSON.stringify({claimId:next.id,resolution:next.officialValid?'confirmed':'rejected'})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  }
  state=(await json('/api/admin/state',{headers:headers(admin)})).data;
  assert.equal(state.status,'paused'); assert(state.claimAutoResume?.active,'Debe aparecer la cuenta automática después de aprobar un premio.');
  await wait(360);
  state=(await json('/api/admin/state',{headers:headers(admin)})).data;
  assert.equal(state.status,'playing','Si el administrador no interviene, la partida debe volver a jugar automáticamente.');
  assert.equal(state.claimAutoResume,null);
  console.log('PRUEBA REANUDACIÓN AUTOMÁTICA: OK');
}catch(error){console.error(error);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
