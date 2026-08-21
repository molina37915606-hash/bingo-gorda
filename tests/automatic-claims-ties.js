'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=56600+Math.floor(Math.random()*200),base=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-auto-ties-'));
const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'80',BINGO_CLAIM_WINDOW_MS:'120',BINGO_CLAIM_AUTO_VERIFY_MS:'200'},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<140;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició el servidor')}
async function request(url,opt={}){const r=await fetch(base+url,opt),d=await r.json().catch(()=>({}));return{r,d}}
async function post(url,body,headers={}){const {r,d}=await request(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body||{})});assert(r.ok,`${url} ${r.status} ${JSON.stringify(d)}`);return d}
async function get(url,headers={}){const {r,d}=await request(url,{headers});assert(r.ok,`${url} ${r.status} ${JSON.stringify(d)}`);return d}
function cookieFrom(r){return (r.headers.get('set-cookie')||'').split(';')[0]}
async function claimInvite(url){const u=new URL(url),target=u.pathname+u.search;const preview=await fetch(base+target,{redirect:'manual'});assert.equal(preview.status,200);const html=await preview.text();const match=html.match(/name="activationToken" value="([^"]+)"/);assert(match,'Falta activationToken');const r=await fetch(base+target,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`activationToken=${encodeURIComponent(match[1])}`,redirect:'manual'});assert.equal(r.status,303);return cookieFrom(r)}
async function invite(name,ah){const inv=await post('/api/admin/invite-player',{name,allowedCardCount:1},ah),cookie=await claimInvite(inv.player.inviteUrl),st=await get('/api/player/state',{Cookie:cookie});return{cookie,offers:st.player.offeredCards}}
async function drawMany(numbers,ah){for(const _ of numbers)await post('/api/admin/draw',{source:'automatic-ties-test'},ah)}
function numbers(card){return card.grid.flat().filter(Number.isFinite)}
function rows(card){return card.grid.map(row=>row.filter(Number.isFinite)).filter(row=>row.length)}
function findLinePair(aOffers,bOffers){for(const a of aOffers)for(const b of bOffers)for(const ra of rows(a))for(const rb of rows(b)){const common=ra.filter(n=>rb.includes(n));for(const target of common){const before=[...new Set([...ra,...rb].filter(n=>n!==target))];const completedOther=[...rows(a),...rows(b)].filter(row=>row!==ra&&row!==rb&&row.every(n=>before.includes(n)));if(!completedOther.length)return{a,b,target,before}}}return null}
function findBingoPair(aOffers,bOffers){for(const a of aOffers)for(const b of bOffers){const an=numbers(a),bn=numbers(b),common=an.filter(n=>bn.includes(n));if(common.length){const target=common[0],before=[...new Set([...an,...bn].filter(n=>n!==target))];return{a,b,target,before}}}return null}
async function choose(pair,a,b){await post('/api/player/choose',{cardIds:[pair.a.id]},{Cookie:a.cookie});await post('/api/player/choose',{cardIds:[pair.b.id]},{Cookie:b.cookie})}
(async()=>{try{
  await waitServer();
  const login=await post('/api/admin/login',{}),ah={'X-Admin-Token':login.token};

  // Compatibilidad: si no se elige nada, el modo histórico sigue siendo el predeterminado.
  let st=await post('/api/admin/create-simple-room',{mode:90,cardCount:50,autoSeconds:60,rules:{line:true,bingo:true},maxCardsPerPlayer:1},ah);
  assert.equal(st.roomSettings.claimMode,'manual');
  assert.equal(st.roomSettings.tiePolicy,'first_claim');
  await post('/api/admin/close',{},ah);

  // Línea automática: dos cartones que completan con la misma bolilla quedan confirmados como empate.
  st=await post('/api/admin/create-simple-room',{mode:90,cardCount:120,autoSeconds:60,rules:{line:true,bingo:true},linePrizeCount:1,maxCardsPerPlayer:1,claimMode:'automatic_ties'},ah);
  assert.equal(st.roomSettings.claimMode,'automatic_ties');
  assert.equal(st.roomSettings.tiePolicy,'same_ball');
  let p1=await invite('Ana',ah),p2=await invite('Beto',ah),pair=findLinePair(p1.offers,p2.offers);
  assert(pair,'No se encontró un par de líneas adecuado para el test.');
  await choose(pair,p1,p2);
  await post('/api/admin/test/draw-order',{sequence:[...pair.before,pair.target]},ah);
  await post('/api/admin/draw-settings',{drawMode:'manual',autoSeconds:60},ah);
  await post('/api/admin/start',{force:true},ah);await wait(120);
  await drawMany(pair.before,ah);
  let before=await get('/api/admin/state',ah);
  assert.equal(before.claims.filter(c=>c.type==='line'&&c.status==='confirmed').length,0,'No debe adjudicar la línea antes de la bolilla común.');
  await post('/api/admin/draw',{source:'automatic-ties-test'},ah);
  st=await get('/api/admin/state',ah);
  const lineWins=st.claims.filter(c=>c.type==='line'&&c.status==='confirmed');
  assert.equal(lineWins.length,2,'Debe confirmar a los dos cartones empatados en la misma bolilla.');
  assert(lineWins.every(c=>c.automatic===true&&c.resolutionReason==='automatic_same_ball'));
  assert.equal(new Set(lineWins.map(c=>c.tieGroupId)).size,1,'Los ganadores de la misma bolilla deben compartir grupo de empate.');
  assert.equal(new Set(lineWins.map(c=>c.drawnAtClaim.length)).size,1);
  assert.equal(st.status,'paused','Después de una línea automática la partida debe pausar como el flujo existente.');
  const denied=await request('/api/player/claim',{method:'POST',headers:{'Content-Type':'application/json','Cookie':p1.cookie},body:JSON.stringify({type:'line',cardId:pair.a.id})});
  assert.equal(denied.r.status,400,'En automático no debe aceptarse el botón/reclamo manual.');
  assert.match(String(denied.d.error||''),/reclamo automático/i);
  const locked=await request('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json',...ah},body:JSON.stringify({claimMode:'manual'})});
  assert.equal(locked.r.status,400,'No se puede cambiar el sistema de reclamos después de iniciar.');
  await post('/api/admin/close',{},ah);

  // Bingo automático: empate real por la misma última bolilla.
  st=await post('/api/admin/create-simple-room',{mode:90,cardCount:120,autoSeconds:60,rules:{line:false,bingo:true},maxCardsPerPlayer:1,claimMode:'automatic_ties'},ah);
  p1=await invite('Carla',ah);p2=await invite('Diego',ah);pair=findBingoPair(p1.offers,p2.offers);
  assert(pair,'No se encontró un par de cartones con número común para el test de Bingo.');
  await choose(pair,p1,p2);
  await post('/api/admin/test/draw-order',{sequence:[...pair.before,pair.target]},ah);
  await post('/api/admin/draw-settings',{drawMode:'manual',autoSeconds:60},ah);
  await post('/api/admin/start',{force:true},ah);await wait(120);
  await drawMany(pair.before,ah);
  before=await get('/api/admin/state',ah);
  assert.equal(before.claims.filter(c=>c.type==='bingo'&&c.status==='confirmed').length,0);
  await post('/api/admin/draw',{source:'automatic-ties-test'},ah);
  st=await get('/api/admin/state',ah);
  const bingoWins=st.claims.filter(c=>c.type==='bingo'&&c.status==='confirmed');
  assert.equal(bingoWins.length,2,'Los dos Bingos de la misma bolilla deben quedar confirmados.');
  assert.equal(new Set(bingoWins.map(c=>c.tieGroupId)).size,1);
  assert.equal(st.status,'finalizing','Un Bingo automático debe entrar al cierre normal de la partida.');

  const adminHtml=fs.readFileSync(path.join(__dirname,'..','admin.html'),'utf8'),communityHtml=fs.readFileSync(path.join(__dirname,'..','comunidad.html'),'utf8'),playerJs=fs.readFileSync(path.join(__dirname,'..','js','player.js'),'utf8');
  assert(adminHtml.includes('AUTOMÁTICO · EMPATES')&&communityHtml.includes('AUTO + EMPATES'));
  assert(playerJs.includes('RECLAMO AUTOMÁTICO · EMPATES'));
  console.log('OK automatic-claims-ties');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM')}})();
