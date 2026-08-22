const fs=require('fs'),path=require('path'),assert=require('assert'),os=require('os'),{spawn}=require('child_process');
const root=path.join(__dirname,'..');
const serverSource=fs.readFileSync(path.join(root,'server.js'),'utf8');
const adminHtml=fs.readFileSync(path.join(root,'evento-admin.html'),'utf8');
const adminJs=fs.readFileSync(path.join(root,'js','evento-admin.js'),'utf8');
assert(serverSource.includes('FASE 2.1'));
assert(serverSource.includes('/api/admin/events/archive'));
assert(serverSource.includes('/api/admin/events/restore'));
assert(serverSource.includes('/api/admin/events/delete'));
assert(adminHtml.includes('ARCHIVADOS'));
assert(adminJs.includes('ELIMINAR DEFINITIVAMENTE'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-event-phase21-'));
const port=35300+Math.floor(Math.random()*500),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_DATA_DIR:temp,BINGO_TEST_MODE:'true',ONLINE_MODE:'false',ADMIN_PASSWORD:'',MASTER_ADMIN_PASSWORD:''},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(url,opt={}){const r=await fetch(base+url,opt);const body=await r.json().catch(()=>({}));return{r,body}}
async function json(url,opt={}){const {r,body}=await request(url,opt);if(!r.ok)throw new Error(`${r.status} ${JSON.stringify(body)}`);return body}
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/ping');if(r.ok)return}catch{}await sleep(80)}throw new Error('Servidor no inició. '+logs)}
(async()=>{try{await ready();const login=await json('/api/master/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const headers={'Content-Type':'application/json','X-Admin-Token':login.adminToken};const auth={'X-Admin-Token':login.adminToken};
const event=await json('/api/admin/events/create',{method:'POST',headers,body:JSON.stringify({name:'Evento ciclo de vida',mode:90})});const lot=await json('/api/admin/events/lot/generate',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,totalCards:6})});const manifest=await json(`/api/admin/events/lot?lot=${encodeURIComponent(lot.code)}`,{headers:auth});const code=manifest.cards[0].accessCode;
let manager=await json('/api/admin/events/player/create',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,name:'Maria'})});const player=manager.players[0];await json('/api/admin/events/player/link',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,playerId:player.id,accessCode:code})});
const archived=await json('/api/admin/events/archive',{method:'POST',headers,body:JSON.stringify({eventCode:event.code})});assert.strictEqual(archived.status,'archived');assert(archived.archivedAt);
let check=await request(`/api/event/access-info?codigo=${encodeURIComponent(code)}`);assert.strictEqual(check.r.status,410);assert(/archivado/i.test(check.body.error));
check=await request('/api/admin/events/player/create',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,name:'Bloqueado'})});assert(!check.r.ok);assert(/archivado/i.test(check.body.error));
check=await request('/api/admin/events/delete',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,confirmation:'MAL'})});assert(!check.r.ok);assert(fs.existsSync(path.join(temp,'eventos',`${event.code}.json`)));
const restored=await json('/api/admin/events/restore',{method:'POST',headers,body:JSON.stringify({eventCode:event.code})});assert.strictEqual(restored.status,'draft');const access=await json(`/api/event/access-info?codigo=${encodeURIComponent(code)}`);assert.strictEqual(access.player.name,'Maria');
check=await request('/api/admin/events/delete',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,confirmation:event.code})});assert(!check.r.ok);assert(/archiv/i.test(check.body.error));
await json('/api/admin/events/archive',{method:'POST',headers,body:JSON.stringify({eventCode:event.code})});const deleted=await json('/api/admin/events/delete',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,confirmation:event.code})});assert.strictEqual(deleted.deleted,true);assert.strictEqual(deleted.lotsDeleted,1);assert(!fs.existsSync(path.join(temp,'eventos',`${event.code}.json`)));assert(!fs.existsSync(path.join(temp,'eventos','tandas',`${lot.code}.json`)));
const list=await json('/api/admin/events',{headers:auth});assert(!list.events.some(e=>e.code===event.code));check=await request(`/api/event/access-info?codigo=${encodeURIComponent(code)}`);assert.strictEqual(check.r.status,404);console.log('OK event-mode-phase2-1');
}finally{child.kill('SIGTERM');await sleep(100);fs.rmSync(temp,{recursive:true,force:true})}})().catch(err=>{console.error(err);child.kill('SIGTERM');try{fs.rmSync(temp,{recursive:true,force:true})}catch{}process.exit(1)});
