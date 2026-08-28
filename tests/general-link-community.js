'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=55800+Math.floor(Math.random()*150),base=`http://127.0.0.1:${port}`,root=path.join(__dirname,'..'),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-general-link-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(50)}throw Error('No inició servidor')}
async function postJson(url,body,headers={}){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body||{})});const d=await r.json().catch(()=>({}));assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
function cookie(res){return (res.headers.get('set-cookie')||'').split(';')[0]}
(async()=>{try{
 await waitServer();
 const rootEntry=await fetch(base+'/',{redirect:'manual'});assert.equal(rootEntry.status,302,'La raíz debe redirigir sin cache permanente');assert.equal(rootEntry.headers.get('location'),'/comunidad','La página principal debe ser Comunidad');
 const communityEntry=await fetch(base+'/comunidad');assert(communityEntry.ok&&(await communityEntry.text()).includes('EL BINGO DE LA GORDA'),'La ruta /comunidad debe seguir abriendo Comunidad');
 for(const file of ['acceso.html','admin.html','cast-receiver.html','comunidad.html','player.html','reglamento.html','transmision.html','tv.html']){const page=fs.readFileSync(path.join(root,file),'utf8');assert(page.includes("onclick=\"location.href='/comunidad?quedar=1'\""),`${file}: el logo debe volver a Comunidad`)}
 const playerJsNav=fs.readFileSync(path.join(root,'js','player.js'),'utf8');assert(playerJsNav.includes("onclick=\"location.href='/comunidad?quedar=1'\""),'Los logos dinámicos del jugador deben volver a Comunidad');
 const login=await postJson('/api/admin/login',{}),ah={'X-Admin-Token':login.token};
 let room=await postJson('/api/admin/create-simple-room',{mode:90,cardCount:100,autoSeconds:20,rules:{line:true,bingo:true},linePrizeCount:2,maxCardsPerPlayer:4,markingMode:'normal'},ah);
 assert.equal(room.roomSettings.joinOpen,false,'El link general debe arrancar cerrado por seguridad');
 assert(room.joinUrl&&room.joinUrl.includes('/jugador?sala='),'Admin debe recibir un link general reutilizable');
 let closed=await fetch(room.joinUrl,{redirect:'manual'});assert.equal(closed.status,200);assert((await closed.text()).includes('Inscripciones cerradas'));
 room=await postJson('/api/admin/join-open',{open:true},ah);assert.equal(room.roomSettings.joinOpen,true);
 const joinPath=new URL(room.joinUrl).pathname+new URL(room.joinUrl).search;
 let page=await fetch(base+joinPath);let html=await page.text();assert(page.ok&&html.includes('ENTRAR A LA SALA'),'Link general abierto debe mostrar formulario');
 const form=(name)=>fetch(base+'/jugador/entrar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`roomCode=${encodeURIComponent(room.roomCode)}&name=${encodeURIComponent(name)}&cardCount=2`,redirect:'manual'});
 const a=await form('Ana General'),b=await form('Beto General');assert.equal(a.status,303);assert.equal(b.status,303);assert(cookie(a)&&cookie(b)&&cookie(a)!==cookie(b),'El mismo link general debe crear sesiones privadas diferentes');
 const st=await (await fetch(base+'/api/admin/state',{headers:ah})).json();assert(st.players.some(p=>p.name==='Ana General'&&p.accessType==='general'));assert(st.players.some(p=>p.name==='Beto General'&&p.accessType==='general'));
 const invite=await postJson('/api/admin/invite-player',{name:'Privado',allowedCardCount:2},ah);assert(invite.player.inviteUrl.includes('/invitacion/'),'Las invitaciones privadas deben seguir funcionando');
 await postJson('/api/admin/join-open',{open:false},ah);closed=await fetch(base+joinPath);assert((await closed.text()).includes('Inscripciones cerradas'),'Cerrar ingreso debe bloquear nuevas altas sin invalidar sesiones existentes');
 const communityJs=fs.readFileSync(path.join(root,'js','community.js'),'utf8');assert(!communityJs.includes('MODO TV'),'Comunidad no debe promocionar Modo TV');assert(communityJs.includes('VER TRANSMISIÓN'),'Comunidad debe abrir la transmisión completa');
 console.log('PRUEBA LINK GENERAL + COMUNIDAD: OK');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
