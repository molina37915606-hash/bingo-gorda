const fs=require('fs'),path=require('path'),assert=require('assert'),cp=require('child_process'),os=require('os');
const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const html=fs.readFileSync(path.join(root,'evento-admin.html'),'utf8');
for(const needle of ['EVENT_MAX_PLAYERS = 150','EVENT_MAX_LOT_CARDS = 1000','EVENT_MAX_ACTIVE_CARDS = 250','generatePremiumEventCards90','auditPremiumEventCards','mathematicalSeries:false','qualityAudit']) assert(server.includes(needle),`Falta ${needle}`);
assert(/id="totalCards"[^>]+max="1000"[^>]+step="1"/.test(html),'El diseñador Evento no permite cantidad exacta hasta 1000.');
assert(html.includes('501 a 1.000'),'La UI no documenta el perfil de diversidad para tandas grandes.');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gorda-event41-')),port=31000+Math.floor(Math.random()*600);
const env={...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_START_SEQUENCE_MS:'50',BINGO_DATA_DIR:path.join(temp,'data'),BINGO_PLATFORM_DIR:path.join(temp,'platform'),BINGO_EVENTS_DIR:path.join(temp,'events')};
const child=cp.spawn(process.execPath,[path.join(root,'server.js')],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const base=`http://127.0.0.1:${port}`,sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(url,opt={}){const r=await fetch(base+url,opt),text=await r.text();let body={};try{body=JSON.parse(text)}catch{body={raw:text}}return{r,body,text}}
async function json(url,opt={}){const x=await request(url,opt);if(!x.r.ok)throw new Error(`${x.r.status} ${x.body.error||x.body.raw||url}`);return x.body}
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(base+'/api/ping')).ok)return}catch{}await sleep(50)}throw new Error('server no inició '+logs)}
(async()=>{try{
  await ready();
  const login=await json('/api/master/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const headers={'Content-Type':'application/json','X-Admin-Token':login.adminToken};
  const event90=await json('/api/admin/events/create',{method:'POST',headers,body:JSON.stringify({name:'Evento 1000',mode:90})});
  const lot90=await json('/api/admin/events/lot/generate',{method:'POST',headers,body:JSON.stringify({eventCode:event90.code,totalCards:1000})});
  assert.strictEqual(lot90.totalCards,1000);assert.strictEqual(lot90.seriesCount,167);assert.strictEqual(lot90.layout.lastPageCards,4);assert.strictEqual(lot90.layout.mathematicalSeries,false);
  assert.strictEqual(lot90.qualityAudit.approved,true);assert.strictEqual(lot90.qualityAudit.duplicateCards,0);assert.strictEqual(lot90.qualityAudit.duplicateCodes,0);assert.strictEqual(lot90.qualityAudit.rowsSharingFourOfFive,0);assert(lot90.qualityAudit.maximumSharedNumbers<=7);assert.strictEqual(lot90.qualityAudit.rules.maxSharedNumbers,7);
  const manifest=await json(`/api/admin/events/lot?lot=${encodeURIComponent(lot90.code)}`,{headers});assert.strictEqual(manifest.cards.length,1000);assert.strictEqual(new Set(manifest.cards.map(c=>c.accessCode)).size,1000);
  const pdf=await request(`/api/admin/events/lot/print.pdf?lot=${encodeURIComponent(lot90.code)}&adminToken=${encodeURIComponent(login.adminToken)}`);assert(pdf.r.ok);assert(pdf.text.startsWith('%PDF-1.4'));assert(pdf.text.includes('/Count 167'));
  // Una tanda de 1000 puede alimentar una partida de 250 cartones con 150 jugadores.
  const csv=['jugador,tanda,carton'];let card=1;for(let i=1;i<=150;i++){const n=i<=100?2:1;for(let k=0;k<n;k++)csv.push(`Jugador ${String(i).padStart(3,'0')},${lot90.code},${card++}`)}
  const imported=await json('/api/admin/events/players/import',{method:'POST',headers,body:JSON.stringify({eventCode:event90.code,csvText:csv.join('\n')})});assert.strictEqual(imported.stats.players,150);assert.strictEqual(imported.stats.linkedCards,250);
  const over=await request('/api/admin/events/player/create',{method:'POST',headers,body:JSON.stringify({eventCode:event90.code,name:'Jugador 151'})});assert(over.r.status>=400);assert(/150/.test(over.body.error||''));
  await json('/api/admin/create-simple-room',{method:'POST',headers,body:JSON.stringify({mode:90,cardCount:250,autoSeconds:60,rules:{line:true,bingo:true},markingMode:'normal',maxCardsPerPlayer:4})});
  const live=await json('/api/admin/events/live/activate',{method:'POST',headers,body:JSON.stringify({eventCode:event90.code})});assert.strictEqual(live.preparation.linkedPlayers,150);assert.strictEqual(live.preparation.linkedCards,250);assert.strictEqual(live.preparation.eventMaxPlayers,150);assert.strictEqual(live.preparation.eventMaxActiveCards,250);
  const admin=await json('/api/admin/state',{headers});assert.strictEqual(admin.players.length,150);assert.strictEqual(admin.game.cards.length,250);assert(admin.game.cards.every(c=>c.source==='event'));
  await json('/api/admin/start',{method:'POST',headers,body:'{}'});await sleep(300);await json('/api/admin/draw',{method:'POST',headers,body:JSON.stringify({source:'manual'})});
  const after=await json('/api/admin/state',{headers});assert.strictEqual(after.game.drawn.length,1);
  // Bingo 75 también admite tanda exacta de 1000 con auditoría global.
  const event75=await json('/api/admin/events/create',{method:'POST',headers,body:JSON.stringify({name:'Evento 75 1000',mode:75})});
  const lot75=await json('/api/admin/events/lot/generate',{method:'POST',headers,body:JSON.stringify({eventCode:event75.code,totalCards:1000})});assert.strictEqual(lot75.totalCards,1000);assert.strictEqual(lot75.seriesCount,167);assert.strictEqual(lot75.qualityAudit.approved,true);assert.strictEqual(lot75.qualityAudit.duplicateCards,0);assert(lot75.qualityAudit.maximumSharedNumbers<=13);
  console.log('OK event-mode-phase4-1');
}finally{child.kill('SIGTERM');await sleep(100);fs.rmSync(temp,{recursive:true,force:true})}})().catch(e=>{console.error(e);child.kill('SIGTERM');try{fs.rmSync(temp,{recursive:true,force:true})}catch{}process.exit(1)});
