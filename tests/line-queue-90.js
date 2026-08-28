'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=55800+Math.floor(Math.random()*200),base=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-line-queue-'));
const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'80',BINGO_CLAIM_WINDOW_MS:'120',BINGO_CLAIM_AUTO_VERIFY_MS:'260'},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició el servidor')}
async function req(url,opt={}){const r=await fetch(base+url,opt),d=await r.json().catch(()=>({}));return{r,d}}
async function post(url,body,headers={}){const {r,d}=await req(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body||{})});assert(r.ok,`${url} ${r.status} ${JSON.stringify(d)}`);return d}
async function get(url,headers={}){const {r,d}=await req(url,{headers});assert(r.ok,`${url} ${r.status} ${JSON.stringify(d)}`);return d}
async function resumeIfNeeded(ah){const {r,d}=await req('/api/admin/resume',{method:'POST',headers:{'Content-Type':'application/json',...ah},body:JSON.stringify({mode:'manual',immediate:true})});if(!r.ok)assert.equal(d.error,'La partida no está pausada.')}
function cookieFrom(r){return (r.headers.get('set-cookie')||'').split(';')[0]}
async function claimInvite(url){const u=new URL(url),path=u.pathname+u.search;const preview=await fetch(base+path,{redirect:'manual'});assert.equal(preview.status,200);const html=await preview.text();const match=html.match(/name="activationToken" value="([^"]+)"/);assert(match);const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`activationToken=${encodeURIComponent(match[1])}`,redirect:'manual'});assert.equal(r.status,303);return cookieFrom(r)}
async function inviteAndChoose(name,ah){const inv=await post('/api/admin/invite-player',{name,allowedCardCount:1},ah);const cookie=await claimInvite(inv.player.inviteUrl);let st=await get('/api/player/state',{Cookie:cookie});const card=st.player.offeredCards[0];await post('/api/player/choose',{cardIds:[card.id]},{Cookie:cookie});return{cookie,card}}
async function drawSequence(numbers,ah){for(const _ of numbers)await post('/api/admin/draw',{source:'line-queue-test'},ah)}
(async()=>{try{
  await waitServer();
  const login=await post('/api/admin/login',{}),ah={'X-Admin-Token':login.token};

  // A) AmboCabeza vuelve a ser configurable en 90 bolas + cola global de 2 líneas.
  let room=await post('/api/admin/create-simple-room',{mode:90,cardCount:120,autoSeconds:60,drawMode:'manual',rules:{ambocabeza:true,line:true,bingo:true},linePrizeCount:2,maxCardsPerPlayer:1},ah);
  assert.equal(room.game.rules.ambocabeza,true,'AmboCabeza debe quedar habilitado cuando el Admin lo elige.');
  assert.equal(room.roomSettings.linePrizeCount,2);
  const players=[];
  for(const name of ['Juan','Pedro','José'])players.push(await inviteAndChoose(name,ah));
  const sequence=[];
  for(const p of players)for(const n of p.card.grid[0].filter(Number.isFinite))if(!sequence.includes(n))sequence.push(n);
  await post('/api/admin/test/draw-order',{sequence},ah);
  await post('/api/admin/draw-settings',{drawMode:'manual',autoSeconds:60},ah);
  await post('/api/admin/start',{force:true},ah);await wait(110);
  await drawSequence(sequence,ah);
  const c1=await post('/api/player/claim',{type:'line',cardId:players[0].card.id},{Cookie:players[0].cookie});
  const c2=await post('/api/player/claim',{type:'line',cardId:players[1].card.id},{Cookie:players[1].cookie});
  const c3=await post('/api/player/claim',{type:'line',cardId:players[2].card.id},{Cookie:players[2].cookie});
  assert.equal(c1.prizeNumber,1);assert.equal(c2.prizeNumber,1);assert.equal(c3.prizeNumber,1,'Antes de resolver Línea 1 todos pertenecen a la misma cola de reclamos de línea.');
  await wait(650);
  let state=await get('/api/admin/state',ah);
  const lines=state.claims.filter(c=>c.type==='line').sort((a,b)=>a.receivedSequence-b.receivedSequence);
  assert.equal(lines[0].status,'confirmed');assert.equal(lines[0].prizeNumber,1);assert.equal(lines[0].prizeLabel,'Primera línea');
  assert.equal(lines[1].status,'confirmed','El segundo reclamo válido no debe descartarse.');assert.equal(lines[1].prizeNumber,2);assert.equal(lines[1].prizeLabel,'Segunda línea');
  assert.equal(lines[2].status,'rejected','El tercer reclamo queda sin premio cuando ya se adjudicaron las dos líneas.');assert.equal(lines[2].resolutionReason,'valid_but_received_later');
  assert.equal(state.prizeStatus.line.awarded,2);assert.equal(state.prizeStatus.line.closed,true);

  // B) El mismo cartón puede ganar Línea 2 más tarde, pero solo con una fila distinta.
  await post('/api/admin/close',{},ah);
  room=await post('/api/admin/create-simple-room',{mode:90,cardCount:80,autoSeconds:60,rules:{ambocabeza:false,line:true,bingo:true},linePrizeCount:2,maxCardsPerPlayer:1},ah);
  const solo=await inviteAndChoose('Marta',ah);
  const row1=solo.card.grid[0].filter(Number.isFinite),row2=solo.card.grid[1].filter(Number.isFinite);
  const seq2=[...row1,...row2.filter(n=>!row1.includes(n))];
  await post('/api/admin/test/draw-order',{sequence:seq2},ah);await post('/api/admin/draw-settings',{drawMode:'manual',autoSeconds:60},ah);await post('/api/admin/start',{force:true},ah);await wait(110);
  await drawSequence(row1,ah);
  const first=await post('/api/player/claim',{type:'line',cardId:solo.card.id},{Cookie:solo.cookie});assert.equal(first.officialValid,true);await wait(500);
  state=await get('/api/admin/state',ah);assert.equal(state.claims.find(c=>c.id===first.id).prizeNumber,1);
  await resumeIfNeeded(ah);
  // Repetir la misma fila no crea una segunda línea válida.
  const repeated=await post('/api/player/claim',{type:'line',cardId:solo.card.id},{Cookie:solo.cookie});assert.equal(repeated.officialValid,false,'La misma fila no puede adjudicarse dos veces.');await wait(500);
  await resumeIfNeeded(ah);
  await drawSequence(row2.filter(n=>!row1.includes(n)),ah);
  const second=await post('/api/player/claim',{type:'line',cardId:solo.card.id},{Cookie:solo.cookie});assert.equal(second.officialValid,true,'Una fila distinta del mismo cartón sí puede ser la segunda línea global.');await wait(500);
  state=await get('/api/admin/state',ah);const secondResolved=state.claims.find(c=>c.id===second.id);assert.equal(secondResolved.status,'confirmed');assert.equal(secondResolved.prizeNumber,2);assert.notEqual(secondResolved.winningLineKey,state.claims.find(c=>c.id===first.id).winningLineKey);

  const adminSource=fs.readFileSync(path.join(__dirname,'..','admin.html'),'utf8');
  const adminJs=fs.readFileSync(path.join(__dirname,'..','js','admin.js'),'utf8');
  assert(adminSource.includes('AMBOCABEZA')&&adminJs.includes('ambocabeza'),'El Admin debe ofrecer AmboCabeza en 90.');
  console.log('PRUEBA 90 BOLAS: OK · AmboCabeza + cola Línea 1/Línea 2 por orden global');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
