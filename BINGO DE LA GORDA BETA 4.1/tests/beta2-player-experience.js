'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const port = 53400 + Math.floor(Math.random() * 250);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-beta2-player-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT:String(port), BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, BINGO_START_SEQUENCE_MS:'80' },
  stdio:['ignore','pipe','pipe']
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(url, options={}) { const response=await fetch(base+url,options); const data=await response.json().catch(()=>({})); return {response,data}; }
async function waitServer(){ for(let i=0;i<100;i++){ try{const x=await json('/healthz'); if(x.response.ok)return;}catch{} await wait(50); } throw new Error('Servidor no disponible.'); }
function adminHeaders(t){return {'Content-Type':'application/json','X-Admin-Token':t};}
function playerHeaders(t){return {'Content-Type':'application/json','X-Player-Token':t};}

(async()=>{try{
  await waitServer();
  let out=await json('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); assert.equal(out.response.status,200,JSON.stringify(out.data)); const admin=out.data.token;
  out=await json('/api/admin/create-simple-room',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({roomType:'test',mode:75,cardCount:30,rules:{line:true,bingo:true}})}); assert.equal(out.response.status,200,JSON.stringify(out.data)); const room=out.data.roomCode;
  const join=await json('/api/player/open-join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomCode:room,name:'Beta Dos',cardCount:1,deviceId:'beta2-device'})}); assert.equal(join.response.status,200,JSON.stringify(join.data));
  const token=join.data.token, ph=playerHeaders(token);
  const card=join.data.state.player.offeredCards[0];
  out=await json('/api/player/choose',{method:'POST',headers:ph,body:JSON.stringify({cardIds:[card.id]})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  assert.equal(out.data.player.markingModeChosen,false,'Al confirmar cartón todavía debe elegir Manual o Automarcado.');

  let start=await json('/api/admin/start',{method:'POST',headers:adminHeaders(admin),body:'{}'});
  assert.equal(start.response.status,400,'No debe salir la primera bolilla sin elegir modo.');
  assert(/Manual|Automarcado/i.test(start.data.error||''),JSON.stringify(start.data));

  out=await json('/api/player/automark',{method:'POST',headers:ph,body:JSON.stringify({enabled:false})});
  assert.equal(out.response.status,200,JSON.stringify(out.data));
  assert.equal(out.data.player.markingModeChosen,true); assert.equal(out.data.player.autoMark,false);

  const row=(card.grid.find(r=>r.filter(Number.isFinite).length>=4)||card.grid[0]).filter(Number.isFinite);
  out=await json('/api/admin/test/draw-order',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({sequence:row})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  out=await json('/api/admin/draw-settings',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({drawMode:'manual'})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  start=await json('/api/admin/start',{method:'POST',headers:adminHeaders(admin),body:'{}'}); assert.equal(start.response.status,200,JSON.stringify(start.data)); await wait(100);
  for(let i=0;i<row.length;i++){ out=await json('/api/admin/draw',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({source:'beta2-test'})}); assert.equal(out.response.status,200,JSON.stringify(out.data)); }

  let ps=(await json('/api/player/state',{headers:ph})).data;
  assert.equal(ps.player.autoMark,false);
  assert.equal((ps.player.marks[card.id]||[]).length,0,'Manual no debe marcar por sí solo.');
  const adminState=(await json('/api/admin/state',{headers:adminHeaders(admin)})).data;
  assert.equal((adminState.claims||[]).length,0,'Completar un premio no debe reclamarlo automáticamente.');

  out=await json('/api/player/automark',{method:'POST',headers:ph,body:JSON.stringify({enabled:true})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  const recovered=new Set(out.data.player.marks[card.id]||[]); for(const n of row) assert(recovered.has(n),`AUTO debe recuperar el ${n} ya salido.`);

  out=await json('/api/player/automark',{method:'POST',headers:ph,body:JSON.stringify({enabled:false})}); assert.equal(out.response.status,200); const preserved=new Set(out.data.player.marks[card.id]||[]); for(const n of row) assert(preserved.has(n),'Volver a Manual debe conservar marcas.');

  const claim=await json('/api/player/claim',{method:'POST',headers:ph,body:JSON.stringify({cardId:card.id,type:'line'})}); assert.equal(claim.response.status,200,JSON.stringify(claim.data)); assert.equal(claim.data.officialValid,true,'La Línea debe poder reclamarse manualmente.');

  const demo=fs.readFileSync(path.join(__dirname,'..','js','demo-beta.js'),'utf8');
  const real=fs.readFileSync(path.join(__dirname,'..','js','online-room-player.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','jugador.html'),'utf8');
  assert(demo.includes('pending<=4') && demo.includes('state.drawn.length-state.manualLag.startDrawCount>=5'),'DEMO debe aplicar 5 pendientes durante 5 bolillas y cancelar a 4.');
  assert(real.includes('pending <= 4') && real.includes('drawCount - this.manualLagStartDrawCount >= 5'),'Juego real debe aplicar la misma regla de asistencia.');
  assert(demo.includes("maybeShowPrizeCoach") && demo.includes("['line','bingo']"),'DEMO debe enseñar contextual Línea/Bingo.');
  assert(demo.includes('focusReadyPrize') && real.includes('handleOwnPrizeReadiness'),'DEMO y real deben cambiar al cartón con premio listo.');
  assert(html.includes('quickManualMarkBtn') && html.includes('quickAutoMarkBtn') && html.includes('markingModeOverlay'),'Interfaz real debe usar selector Manual/Auto visible.');
  assert(demo.includes('emoji-stickers') || fs.readFileSync(path.join(__dirname,'..','demo.html'),'utf8').includes('emoji-stickers.js'),'DEMO debe cargar emojis/stickers compartidos.');
  console.log('BETA 2 · EXPERIENCIA MANUAL/AUTO Y RECLAMOS: OK');
}catch(error){console.error(error);process.exitCode=1;}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true});}})();
