const fs=require('fs'),path=require('path'),assert=require('assert'),os=require('os'),{spawn}=require('child_process');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'js','evento-admin.js'),'utf8');
assert(ui.includes("btn.closest('.playerRow')"),'VINCULAR debe resolver los controles desde la fila del jugador.');
assert(ui.includes("row?.querySelector('[data-link-input]')"),'Debe buscar el input con querySelector dentro de la fila.');
assert(ui.includes("row?.querySelector('[data-link-lot]')"),'Debe buscar la tanda con querySelector dentro de la fila.');
assert(!ui.includes('input=$(`[data-link-input='),'No debe volver a pasar un selector CSS a getElementById.');
assert(ui.includes('data-quick-link'),'Debe existir asignación directa desde cartones sin asignar.');
assert(ui.includes('ASIGNAR A…'),'Debe mostrarse la acción rápida de asignación.');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-event-phase22-'));
const port=35200+Math.floor(Math.random()*400);
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
  const event=await json('/api/admin/events/create',{method:'POST',headers,body:JSON.stringify({name:'Evento Hotfix 2.2',mode:90,colors:{primary:'#6D238C',secondary:'#D83A84',accent:'#E0A71A'}})});
  const lot=await json('/api/admin/events/lot/generate',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,totalCards:12})});
  const manifest=await json(`/api/admin/events/lot?lot=${encodeURIComponent(lot.code)}`,{headers:{'X-Admin-Token':login.adminToken}});
  let manager=await json('/api/admin/events/player/create',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,name:'Prueba Numero'})});
  const p1=manager.players.find(p=>p.name==='Prueba Numero');assert(p1);
  manager=await json('/api/admin/events/player/link',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,playerId:p1.id,lotCode:lot.code,cardNumber:manifest.cards[0].cardNumber})});
  assert.strictEqual(manager.players.find(p=>p.id===p1.id).cards.length,1,'Debe vincular por número de cartón.');
  manager=await json('/api/admin/events/player/create',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,name:'Prueba Codigo'})});
  const p2=manager.players.find(p=>p.name==='Prueba Codigo');assert(p2);
  manager=await json('/api/admin/events/player/link',{method:'POST',headers,body:JSON.stringify({eventCode:event.code,playerId:p2.id,accessCode:manifest.cards[1].accessCode})});
  assert.strictEqual(manager.players.find(p=>p.id===p2.id).cards.length,1,'Debe vincular por código privado.');
  const access=await json(`/api/event/access-info?codigo=${encodeURIComponent(manifest.cards[1].accessCode)}`);
  assert.strictEqual(access.player.name,'Prueba Codigo');
  console.log('OK event-mode-phase2-2');
}finally{child.kill('SIGTERM');await sleep(100);fs.rmSync(temp,{recursive:true,force:true});}})().catch(err=>{console.error(err);child.kill('SIGTERM');try{fs.rmSync(temp,{recursive:true,force:true})}catch{}process.exit(1)});
