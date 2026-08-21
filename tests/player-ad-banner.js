'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..');
const adminHtml=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const adminJs=fs.readFileSync(path.join(root,'js','admin.js'),'utf8');
const playerJs=fs.readFileSync(path.join(root,'js','player.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css','platform.css'),'utf8');
assert(adminHtml.includes('id="playerAdEnabled"')&&adminHtml.includes('id="playerAdFile"'),'Admin debe configurar una sola publicidad de cartones.');
assert(adminJs.includes("'/api/admin/community/player-ad'")&&adminJs.includes('uploadPendingPlayerAd'),'Admin debe poder subir la publicidad.');
assert(playerJs.includes('durationMs:Math.max(1000,Number(ad.durationMs)||5000)'),'La publicidad debe durar 5 segundos por defecto.');
assert(playerJs.includes('newCount%ad.everyBalls===0'),'La publicidad debe dispararse por cantidad de bolillas.');
assert(playerJs.includes("this.triggerPlayerAd(`${roundKey}:start`,newState)"),'La publicidad debe mostrarse al comenzar.');
assert(playerJs.includes('${this.playerAdMarkup()}'),'La publicidad debe renderizarse junto al cartón.');
assert(css.includes('.playerAdBanner')&&css.includes('display:none'),'La publicidad no debe ocupar espacio cuando está oculta.');

const port=56800+Math.floor(Math.random()*120),base=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-player-ad-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ADMIN_PASSWORD:'',MASTER_ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'100'},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('Servidor no disponible')}
async function json(pathname,{method='GET',body,token,cookie}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));assert(r.ok,`${pathname}: ${r.status} ${JSON.stringify(data)}`);return data}
(async()=>{try{
  await waitServer();
  const login=await json('/api/admin/login',{method:'POST',body:{}}),token=login.token;
  let community=await json('/api/admin/community',{token});assert.equal(community.playerAd.enabled,false);assert.equal(community.playerAd.hasImage,false);
  const tinyPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlN0AAAAASUVORK5CYII=';
  community=await json('/api/admin/community/player-ad',{method:'POST',token,body:{action:'upload',imageData:tinyPng}});assert.equal(community.playerAd.hasImage,true);assert(community.playerAd.imageUrl.includes('/player-ad-banner'));
  const image=await fetch(base+community.playerAd.imageUrl);assert(image.ok);assert((image.headers.get('content-type')||'').includes('image/png'));
  community=await json('/api/admin/community/settings',{method:'POST',token,body:{playerAd:{enabled:true}}});assert.equal(community.playerAd.enabled,true);
  let room=await json('/api/admin/create-simple-room',{method:'POST',token,body:{mode:90,cardCount:50,autoSeconds:20,rules:{line:true,bingo:true},linePrizeCount:1,maxCardsPerPlayer:2,markingMode:'normal'}});
  room=await json('/api/admin/join-open',{method:'POST',token,body:{open:true}});
  const join=await fetch(base+'/jugador/entrar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`roomCode=${encodeURIComponent(room.roomCode)}&name=Jugador+Publicidad&cardCount=1`,redirect:'manual'});assert.equal(join.status,303);const cookie=(join.headers.get('set-cookie')||'').split(';')[0];assert(cookie);
  const state=await json('/api/player/state',{cookie});assert.equal(state.playerAd.enabled,true);assert.equal(state.playerAd.durationMs,5000);assert.equal(state.playerAd.everyBalls,10);
  const form=new URLSearchParams({mode:'90',playerCardCount:'1',aiCount:'1',autoSeconds:'60',linePrizeCount:'1',prizeLine:'1',prizeBingo:'1'});
  const demoStart=await fetch(base+'/demo/start',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString(),redirect:'manual'});assert.equal(demoStart.status,303);const demoCookie=(demoStart.headers.get('set-cookie')||'').split(';')[0];const demoState=await json('/api/player/state?demo=1',{cookie:demoCookie});assert.equal(demoState.playerAd.enabled,false,'DEMO debe permanecer sin publicidad.');
  console.log('PRUEBA PUBLICIDAD EN CARTONES: OK · 5 s + inicio + cada 10 bolillas + DEMO intacta');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
