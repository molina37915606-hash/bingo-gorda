const fs=require('fs'),path=require('path'),assert=require('assert'),os=require('os'),{spawn}=require('child_process');
const root=path.join(__dirname,'..');
const serverSource=fs.readFileSync(path.join(root,'server.js'),'utf8');
const adminHtml=fs.readFileSync(path.join(root,'evento-admin.html'),'utf8');
const playerHtml=fs.readFileSync(path.join(root,'evento.html'),'utf8');
assert(serverSource.includes('MODO EVENTO PREMIUM - FASE 2'));
assert(serverSource.includes('/api/admin/events/player/link'));
assert(serverSource.includes('/api/admin/events/players/import'));
assert(serverSource.includes('/api/event/heartbeat'));
assert(serverSource.includes('publicEventAccessPayload'));
assert(adminHtml.includes('Jugadores y cartones'));
assert(adminHtml.includes('IMPORTAR CSV'));
assert(playerHtml.includes('MIS CARTONES'));
assert(fs.existsSync(path.join(root,'js','evento.js')));

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-event-phase2-'));
const port=34700+Math.floor(Math.random()*500);
const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_DATA_DIR:temp,BINGO_TEST_MODE:'true',ONLINE_MODE:'false',ADMIN_PASSWORD:'',MASTER_ADMIN_PASSWORD:''},stdio:['ignore','pipe','pipe']});
let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(url,opt={}){const r=await fetch(base+url,opt),body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${r.status} ${JSON.stringify(body)}`);return body;}
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/ping');if(r.ok)return;}catch{}await sleep(80);}throw new Error('Servidor no inició. '+logs);}
(async()=>{try{
  await ready();
  const login=await json('/api/master/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert(login.adminToken);
  const headers={'Content-Type':'application/json','X-Admin-Token':login.adminToken};
  const event=await json('/api/admin/events/create',{method:'POST',headers,body:JSON.stringify({name:'Evento Fase 2',mode:90,colors:{primary:'#6D238C',secondary:'#D83A84',accent:'#E0A71A'}})});assert(/^EV-/.test(event.code));
  const lot=await json('/api/admin/events/lot/generate',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,totalCards:12})});assert.strictEqual(lot.totalCards,12);
  const manifest=await json(`/api/admin/events/lot?lot=${encodeURIComponent(lot.code)}`,{headers:{'X-Admin-Token':login.adminToken}});assert.strictEqual(manifest.cards.length,12);
  const [c1,c2,c3,c4]=manifest.cards;
  let manager=await json('/api/admin/events/player/create',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,name:'Maria Lopez'})});
  const maria=manager.players.find(p=>p.name==='Maria Lopez');assert(maria);
  manager=await json('/api/admin/events/player/link',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,playerId:maria.id,accessCode:c1.accessCode})});
  manager=await json('/api/admin/events/player/link',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,playerId:maria.id,accessCode:c2.accessCode})});
  assert.strictEqual(manager.players.find(p=>p.id===maria.id).cards.length,2);
  const access=await json(`/api/event/access-info?codigo=${encodeURIComponent(c1.accessCode)}`);assert.strictEqual(access.phase,2);assert.strictEqual(access.player.name,'Maria Lopez');assert.strictEqual(access.cards.length,2);assert(access.cards.every(card=>!Object.prototype.hasOwnProperty.call(card,'accessCode')));
  await json('/api/event/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo:c1.accessCode})});
  manager=await json(`/api/admin/events/players?event=${encodeURIComponent(event.code)}`,{headers:{'X-Admin-Token':login.adminToken}});assert.strictEqual(manager.players.find(p=>p.id===maria.id).connected,true);
  const csv=`jugador,codigo\nCarlos Benitez,${c3.accessCode}\nCarlos Benitez,${c4.accessCode}\n`;
  manager=await json('/api/admin/events/players/import',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,csvText:csv})});assert.strictEqual(manager.import.playersCreated,1);assert.strictEqual(manager.import.linksCreated,2);
  const carlosAccess=await json(`/api/event/access-info?codigo=${encodeURIComponent(c3.accessCode)}`);assert.strictEqual(carlosAccess.player.name,'Carlos Benitez');assert.strictEqual(carlosAccess.cards.length,2);
  const csvResponse=await fetch(base+`/api/admin/events/lot/control.csv?lot=${encodeURIComponent(lot.code)}`,{headers:{'X-Admin-Token':login.adminToken}});assert(csvResponse.ok);const csvText=await csvResponse.text();assert(csvText.includes('jugador_id,jugador'));assert(csvText.includes('Maria Lopez'));assert(csvText.includes('Carlos Benitez'));
  const pdfResponse=await fetch(base+`/api/admin/events/lot/card.pdf?lot=${encodeURIComponent(lot.code)}&card=${c1.globalNumber}`,{headers:{'X-Admin-Token':login.adminToken}});assert(pdfResponse.ok);const pdfBuffer=Buffer.from(await pdfResponse.arrayBuffer());assert(pdfBuffer.toString('latin1').includes('Jugador: Maria Lopez'));
  const unassigned=await json(`/api/event/access-info?codigo=${encodeURIComponent(manifest.cards[4].accessCode)}`);assert.strictEqual(unassigned.player,null);assert.strictEqual(unassigned.cards.length,1);
  const eventFile=path.join(temp,'eventos',`${event.code}.json`);const stored=JSON.parse(fs.readFileSync(eventFile,'utf8'));assert.strictEqual(stored.players.length,2);assert.strictEqual(stored.players.reduce((n,p)=>n+p.cards.length,0),4);
  console.log('OK event-mode-phase2');
}finally{child.kill('SIGTERM');await sleep(100);fs.rmSync(temp,{recursive:true,force:true});}})().catch(err=>{console.error(err);child.kill('SIGTERM');try{fs.rmSync(temp,{recursive:true,force:true})}catch{}process.exit(1)});
