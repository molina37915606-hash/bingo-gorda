'use strict';
const assert=require('assert');const{spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const port=54800+Math.floor(Math.random()*150),base=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-cuasifinal-demo-'));
const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'100'},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function waitServer(){for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('server')}
(async()=>{try{await waitServer();
 const form=new URLSearchParams({mode:'90',playerCardCount:'2',aiCount:'2',autoSeconds:'60',linePrizeCount:'2',prizeLine:'1',prizeBingo:'1'});
 const start=await fetch(base+'/demo/start',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString(),redirect:'manual'});assert.equal(start.status,303);const loc=start.headers.get('location');assert.match(loc,/^\/demo\/jugar\/demoentry_/);const cookie=(start.headers.get('set-cookie')||'').split(';')[0];assert(cookie.includes('bingo_demo_session='));
 const page=await fetch(base+loc,{headers:{Cookie:cookie}});const html=await page.text();assert(page.ok);assert(html.includes('/js/player.js?v='));assert(html.includes('/css/platform.css?v='));assert(!html.includes('demo-alfa.js'));
 const headers={Cookie:cookie,'Content-Type':'application/json'};let state=await (await fetch(base+'/api/player/state',{headers:{Cookie:cookie}})).json();assert(state.demo?.active);assert.equal(state.player.nameSet,false);
 let r=await fetch(base+'/api/player/name',{method:'POST',headers,body:JSON.stringify({name:'Jugador Demo'})});let text=await r.text();assert(r.ok,text);state=JSON.parse(text);assert.equal(state.player.nameSet,true);assert(state.player.offeredCards.length>=2);
 const ids=state.player.offeredCards.slice(0,2).map(c=>c.id);r=await fetch(base+'/api/player/choose',{method:'POST',headers,body:JSON.stringify({cardIds:ids})});text=await r.text();assert(r.ok,text);state=JSON.parse(text);assert.equal(state.player.selectionConfirmed,true);
 r=await fetch(base+'/api/player/demo/tutorial',{method:'POST',headers,body:JSON.stringify({skipped:true})});text=await r.text();assert(r.ok,text);await wait(450);state=await (await fetch(base+'/api/player/state',{headers:{Cookie:cookie}})).json();assert(['starting','playing','paused'].includes(state.status),`DEMO no inició: ${state.status}`);
 console.log('PRUEBA CUASIFINAL DEMO UNIFICADA: OK · misma interfaz + nombre + cartones + tutorial + inicio');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
