'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const port=59920+Math.floor(Math.random()*60);
const base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-v9312-alias-'));
let child;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await sleep(40)}throw Error('Servidor no disponible')}
async function raw(url,{method='GET',body,token}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
(async()=>{try{
 child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});
 await ready();
 const login=await ok('/api/admin/login',{method:'POST',body:{}});const token=login.token;
 let admin=await ok('/api/admin/community/settings',{method:'POST',token,body:{collaborationAlias:'bingo.lagorda',collaborationHolder:'El Bingo de La Gorda'}});
 assert.equal(admin.collaborationAlias,'bingo.lagorda');
 assert.equal(admin.collaborationHolder,'El Bingo de La Gorda');
 let state=await ok('/api/community/state');
 assert.equal(state.whatsapp.collaborationAlias,'bingo.lagorda');
 assert.equal(state.whatsapp.collaborationHolder,'El Bingo de La Gorda');
 assert.equal(Object.prototype.hasOwnProperty.call(state.whatsapp,'collaborationUrl'),false,'No debe publicarse link de colaboración');
 const bad=await raw('/api/admin/community/settings',{method:'POST',token,body:{collaborationAlias:'alias con espacios'}});
 assert.equal(bad.r.status,400,'Debe rechazar alias inválido');
 admin=await ok('/api/admin/community/settings',{method:'POST',token,body:{collaborationAlias:'',collaborationHolder:''}});
 state=await ok('/api/community/state');
 assert.equal(state.whatsapp.collaborationAlias,'');
 const html=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
 const community=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
 const adminHtml=fs.readFileSync(path.join(root,'admin.html'),'utf8');
 assert(html.includes('id="collaborationBox"')&&html.includes('id="copyCollaborationAliasBtn"'),'Comunidad debe tener caja y botón COPIAR ALIAS');
 assert(community.includes("navigator.clipboard.writeText(alias)")&&community.includes("box.classList.toggle('hidden',!alias)"),'Community debe copiar y ocultar si falta alias');
 assert(adminHtml.includes('ALIAS PARA COLABORAR')&&adminHtml.includes('TITULAR / NOMBRE'),'Admin debe tener alias y titular');
 assert(!adminHtml.includes('id="communityCollaborationUrl"'),'Admin no debe conservar el link de colaboración');
 console.log('V9.3.12 COLABORACIÓN POR ALIAS: OK');
}catch(e){console.error(e);process.exitCode=1}finally{if(child)child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
