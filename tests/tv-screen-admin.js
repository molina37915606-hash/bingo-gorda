'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const adminHtml=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const adminJs=fs.readFileSync(path.join(root,'js','admin.js'),'utf8');
const screenHtml=fs.readFileSync(path.join(root,'pantalla.html'),'utf8');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert(adminHtml.includes('tvScreenBtn')&&adminHtml.includes('CARGAR / CAMBIAR IMAGEN'));
assert(adminJs.includes('/api/admin/tv-screen')&&adminJs.includes('prepareTvScreenImage'));
assert(screenHtml.includes('id="screenImage"')&&screenHtml.includes("requestFullscreen"));
assert(serverSrc.includes("'/pantalla-imagen'")&&serverSrc.includes("'/api/tv-screen/state'"));

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'gorda-tv-screen-'));
const port=59200+Math.floor(Math.random()*100);
const base=`http://127.0.0.1:${port}`;
let child=null,logs='';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function start(){logs='';child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_DATA_DIR:dataDir,BINGO_TEST_MODE:'true',ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await sleep(40)}throw new Error('Servidor no inició '+logs)}
async function json(url,opt={}){const r=await fetch(base+url,opt),d=await r.json().catch(()=>({}));assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
(async()=>{try{
  start();await ready();
  let state=await json('/api/tv-screen/state');assert.equal(state.hasImage,false);
  const login=await json('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const headers={'Content-Type':'application/json','X-Admin-Token':login.token};
  // PNG 1x1 válido; la interfaz real lo convierte a 1920x1080 JPEG antes de subirlo.
  const imageData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9V8AAAAASUVORK5CYII=';
  state=await json('/api/admin/tv-screen',{method:'POST',headers,body:JSON.stringify({action:'upload',imageData})});
  assert.equal(state.hasImage,true);assert.equal(state.screenUrl,'/pantalla');assert(state.imageUrl.includes('/pantalla-imagen'));
  let image=await fetch(base+state.imageUrl);assert(image.ok);assert.equal(image.headers.get('content-type'),'image/png');assert((await image.arrayBuffer()).byteLength>20);
  const page=await fetch(base+'/pantalla');assert(page.ok);const html=await page.text();assert(html.includes('screenImage'));assert(!html.includes('CARGAR / CAMBIAR IMAGEN'));
  await stop();start();await ready();
  state=await json('/api/tv-screen/state');assert.equal(state.hasImage,true,'La imagen debe persistir tras reiniciar el servidor.');
  const login2=await json('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  state=await json('/api/admin/tv-screen',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':login2.token},body:JSON.stringify({action:'remove'})});assert.equal(state.hasImage,false);
  console.log('OK tv-screen-admin');
}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})().catch(async e=>{console.error(e);try{await stop()}catch{}try{fs.rmSync(dataDir,{recursive:true,force:true})}catch{}process.exit(1)});
