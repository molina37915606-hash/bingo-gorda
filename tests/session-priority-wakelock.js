'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=56300+Math.floor(Math.random()*120),base=`http://127.0.0.1:${port}`,root=path.join(__dirname,'..'),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-session-priority-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:''},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
async function postJson(url,body,headers={}){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body||{})});const d=await r.json().catch(()=>({}));assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
function cookieValueFromSetCookie(header,name){const m=String(header||'').match(new RegExp(`${name}=([^;,\\s]*)`));return m?decodeURIComponent(m[1]):''}
(async()=>{try{
 await waitServer();
 // 1) Crear DEMO y conservar deliberadamente su cookie.
 const demoForm=new URLSearchParams({mode:'90',playerCardCount:'1',aiCount:'1',autoSeconds:'60',linePrizeCount:'1',prizeLine:'1',prizeBingo:'1'});
 const demoStart=await fetch(base+'/demo/start',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:demoForm.toString(),redirect:'manual'});
 assert.equal(demoStart.status,303);
 const demoSet=demoStart.headers.get('set-cookie')||'';
 const demoToken=cookieValueFromSetCookie(demoSet,'bingo_demo_session');
 assert(demoToken,'Debe crearse la sesión DEMO');
 const demoCookie=`bingo_demo_session=${encodeURIComponent(demoToken)}`;
 const demoState=await (await fetch(base+'/api/player/state',{headers:{Cookie:demoCookie}})).json();
 assert(demoState.demo?.active,'La cookie DEMO debe seguir funcionando en DEMO');

 // 2) Crear una sala real y entrar usando el mismo navegador que todavía tiene DEMO.
 const login=await postJson('/api/admin/login',{}),ah={'X-Admin-Token':login.token};
 let room=await postJson('/api/admin/create-simple-room',{mode:90,cardCount:80,autoSeconds:30,rules:{line:true,bingo:true},linePrizeCount:1,maxCardsPerPlayer:4,markingMode:'normal'},ah);
 room=await postJson('/api/admin/join-open',{open:true},ah);
 const direct=`/jugador?sala=${encodeURIComponent(room.roomCode)}&directo=1`;
 const page=await fetch(base+direct,{headers:{Cookie:demoCookie},redirect:'manual'});
 assert.equal(page.status,200,'Un link real no debe redirigir de vuelta al DEMO');
 const html=await page.text();assert(html.includes('ENTRAR A LA SALA'));
 const form=new URLSearchParams({roomCode:room.roomCode,name:'Jugador Real',cardCount:'1'});
 const joined=await fetch(base+'/jugador/entrar',{method:'POST',headers:{Cookie:demoCookie,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString(),redirect:'manual'});
 assert.equal(joined.status,303);assert.equal(joined.headers.get('location'),'/jugar');
 const realSet=joined.headers.get('set-cookie')||'';
 const playerToken=cookieValueFromSetCookie(realSet,'bingo_player_session');
 assert(playerToken,'Debe crearse la sesión real');
 assert(/bingo_demo_session=;[^\n]*Max-Age=0/i.test(realSet),'Al ingresar a una sala real debe limpiarse la cookie DEMO');

 // Simulamos incluso un navegador que todavía enviara ambas cookies: la real debe ganar.
 const both=`bingo_demo_session=${encodeURIComponent(demoToken)}; bingo_player_session=${encodeURIComponent(playerToken)}`;
 const realStateRes=await fetch(base+'/api/player/state',{headers:{Cookie:both}});assert(realStateRes.ok);
 const realState=await realStateRes.json();
 assert.equal(realState.roomCode,room.roomCode,'La sesión real debe tener prioridad sobre DEMO');
 assert(!realState.demo?.active,'El estado recibido no debe ser el DEMO');
 // En una URL marcada explícitamente como DEMO ocurre lo inverso: debe usarse solo bingo_demo_session.
 const isolatedDemoRes=await fetch(base+'/api/player/state?demo=1',{headers:{Cookie:both}});assert(isolatedDemoRes.ok);
 const isolatedDemo=await isolatedDemoRes.json();
 assert(isolatedDemo.demo?.active,'La ruta DEMO debe conservar su propia sesión aunque exista una sesión real válida.');
 assert.notEqual(isolatedDemo.roomCode,room.roomCode,'DEMO no debe mezclarse con la sala real.');
 // Y una cookie DEMO inválida no puede caer silenciosamente en la partida real cuando demo=1.
 const invalidDemo=`bingo_demo_session=demo_invalida; bingo_player_session=${encodeURIComponent(playerToken)}`;
 const invalidDemoRes=await fetch(base+'/api/player/state?demo=1',{headers:{Cookie:invalidDemo}});
 assert.equal(invalidDemoRes.status,401,'Una DEMO vencida debe fallar como DEMO, no abrir la partida real.');

 // 3) Regreso automático desde Comunidad durante una partida real activa.
 await postJson('/api/admin/join-open',{open:false},ah);
 await postJson('/api/admin/start',{},ah);
 await wait(180);
 const activeBefore=await (await fetch(base+'/api/player/state',{headers:{Cookie:both}})).json();
 assert(['starting','playing','paused','verifying','resuming','finalizing'].includes(activeBefore.status),'La sesión debe estar en un estado de juego activo.');
 const cardsBefore=(activeBefore.player?.cards||[]).map(c=>c.id||c.number);
 assert(cardsBefore.length,'El jugador debe conservar cartones antes de salir.');
 const resumeApi=await (await fetch(base+'/api/community/resume',{headers:{Cookie:both}})).json();
 assert.equal(resumeApi.resume,true,'Comunidad debe detectar una partida real activa.');
 assert.equal(resumeApi.url,'/jugar');
 const communityReturn=await fetch(base+'/comunidad',{headers:{Cookie:both},redirect:'manual'});
 assert.equal(communityReturn.status,303,'Entrar a Comunidad durante la partida debe volver al juego.');
 assert.equal(communityReturn.headers.get('location'),'/jugar');
 const gamePage=await fetch(base+'/jugar',{headers:{Cookie:both},redirect:'manual'});
 assert.equal(gamePage.status,200,'La misma sesión debe abrir directamente los cartones.');
 const activeAfter=await (await fetch(base+'/api/player/state',{headers:{Cookie:both}})).json();
 assert.deepEqual((activeAfter.player?.cards||[]).map(c=>c.id||c.number),cardsBefore,'El regreso automático debe conservar exactamente los mismos cartones.');
 const explicitOther=await fetch(base+'/comunidad?mesa=otra-sala',{headers:{Cookie:both},redirect:'manual'});
 assert.equal(explicitOther.status,200,'Un destino explícito de otra mesa no debe ser interceptado automáticamente.');

 // 4) Wake Lock: debe estar asociado únicamente a estados activos del jugador y reintentarse al volver a la pestaña.
 const playerJs=fs.readFileSync(path.join(root,'js','player.js'),'utf8');
 assert(playerJs.includes("navigator.wakeLock.request('screen')"),'Debe solicitar Screen Wake Lock');
 for(const status of ['starting','playing','paused','verifying','resuming','finalizing']) assert(playerJs.includes(`'${status}'`),`Wake Lock debe contemplar ${status}`);
 assert(playerJs.includes("document.visibilityState==='visible'"),'Wake Lock debe respetar visibilidad');
 assert(playerJs.includes('visibilitychange')&&playerJs.includes('syncWakeLock()'),'Debe volver a sincronizar Wake Lock al regresar');
 assert(playerJs.includes('lock.release()'),'Debe liberar Wake Lock al terminar o salir del juego activo');
 console.log('PRUEBA FINAL SESIÓN DEMO→REAL + REGRESO COMUNIDAD→CARTONES + WAKE LOCK: OK');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
