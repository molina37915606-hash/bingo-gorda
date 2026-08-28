const assert=require('assert');const fs=require('fs');const path=require('path');const {spawn}=require('child_process');const os=require('os');
const root=path.join(__dirname,'..');assert(!fs.existsSync(path.join(root,'demo.html')),'demo.html debe haberse eliminado');
const source=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert(!source.includes("url.pathname === '/api/demo/create'"),'no debe exponerse /api/demo/create');
assert(!source.includes("url.pathname === '/demo/start'"),'no debe exponerse /demo/start');
assert(!source.includes("url.pathname === '/api/player/demo/reset'"),'no debe exponerse reset de Demo');
const port=37000+Math.floor(Math.random()*1500),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'gorda-hotfix07-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',BINGO_DATA_DIR:dataDir,NO_OPEN:'1'},stdio:['ignore','ignore','ignore']});
const base=`http://127.0.0.1:${port}`;
async function wait(){for(let i=0;i<50;i++){try{const r=await fetch(base+'/healthz');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('server timeout')}
(async()=>{try{await wait();let r=await fetch(base+'/demo',{redirect:'manual'});assert.equal(r.status,404,'/demo debe responder 404');r=await fetch(base+'/demo/start',{method:'POST',redirect:'manual'});assert.equal(r.status,404,'/demo/start debe responder 404');r=await fetch(base+'/api/demo/create',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,404,'/api/demo/create debe responder 404');console.log('HOTFIX07 DEMO REMOVED: OK')}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
