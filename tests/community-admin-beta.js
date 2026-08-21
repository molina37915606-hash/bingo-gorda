'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const adminHtml=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const adminJs=fs.readFileSync(path.join(root,'js/admin.js'),'utf8');
const communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
const communityHtml=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert(adminHtml.includes('id="communityAdminBtn"'),'Admin debe tener botón visible de Comunidad.');
assert(adminHtml.includes('id="communityAdminModal"'),'Admin debe tener panel de Comunidad.');
for(const id of ['communityWhatsappNumber','communityWhatsappGroup','communityChatEnabled','communityBlockPhones','communityBlockWhatsapp','communityBlockedTermInput','communityReportedMessages','communityRecentMessages']){
  assert(adminHtml.includes(`id="${id}"`),`Falta control ${id}.`);
}
assert(adminJs.includes("this.req('/api/admin/community')"),'Admin debe leer la configuración de Comunidad con su sesión actual.');
assert(adminJs.includes("'/api/admin/community/settings'"),'Admin debe poder guardar la Comunidad.');
assert(adminJs.includes("'/api/admin/community/moderate'"),'Admin debe poder moderar la Comunidad.');
assert(communityHtml.includes('href="/demo"'),'Comunidad debe ofrecer acceso permanente al DEMO.');
assert(communityHtml.includes('<strong>DEMO</strong>')&&communityHtml.includes('Probá el bingo'),'El acceso DEMO debe ser claro y conservar su ayuda breve.');
assert(serverSrc.includes("url.pathname === '/api/admin/community'"),'Servidor debe exponer Comunidad al admin principal.');

const port=53800+Math.floor(Math.random()*100);
const base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-beta-community-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<100;i++){try{const r=await fetch(base+'/healthz');if(r.ok)return}catch{}await wait(40)}throw Error('Servidor no disponible')}
async function req(pathname,{method='GET',body,token}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));assert(r.ok,`${pathname}: ${r.status} ${JSON.stringify(data)}`);return data}
(async()=>{try{
  await waitServer();
  const login=await req('/api/admin/login',{method:'POST',body:{}});
  const token=login.token;assert(token);
  let community=await req('/api/admin/community',{token});
  assert.equal(community.chatEnabled,true);
  assert.equal(community.whatsappNumber,'3757624388');
  community=await req('/api/admin/community/settings',{method:'POST',token,body:{whatsappNumber:'+54 9 3757 123456',whatsappGroup:'https://chat.whatsapp.com/ABCDEFGHIJK',chatEnabled:false,blockPhoneNumbers:true,blockWhatsappLinks:true}});
  assert.equal(community.whatsappNumber,'+54 9 3757 123456');
  assert.equal(community.whatsappGroup,'https://chat.whatsapp.com/ABCDEFGHIJK');
  assert.equal(community.chatEnabled,false);
  community=await req('/api/admin/community/moderate',{method:'POST',token,body:{action:'block-term',term:'spam beta',removeMatchingMessages:true}});
  assert(community.blockedTerms.includes('spam beta'));
  community=await req('/api/admin/community/moderate',{method:'POST',token,body:{action:'unblock-term',term:'spam beta'}});
  assert(!community.blockedTerms.includes('spam beta'));
  community=await req('/api/admin/community/settings',{method:'POST',token,body:{chatEnabled:true}});
  assert.equal(community.chatEnabled,true);
  const publicState=await req('/api/community/state');
  assert.equal(publicState.chatEnabled,true);
  assert.equal(publicState.whatsapp.number,'+54 9 3757 123456');
  const demo=await fetch(base+'/demo');assert(demo.ok,'/demo debe seguir disponible.');
  const comunidad=await fetch(base+'/comunidad');const html=await comunidad.text();assert(comunidad.ok&&html.includes('js/community.js'));
  console.log('PRUEBA BETA COMUNIDAD ADMIN + ACCESO DEMO: OK');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
