const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const js=fs.readFileSync(path.join(root,'js','community.js'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(js.includes('data-action-21=\"draw\"')&&js.includes('data-action-21=\"stand\"')&&js.includes('data-action-21=\"next\"'),'21 debe renderizar las tres acciones.');
ok(js.includes("choices.querySelectorAll('[data-action-21]').forEach(b=>b.onclick=()=>play21(b.getAttribute('data-action-21')))"),'Los botones de 21 deben leer el atributo data-action-21 explícitamente.');
ok(!js.includes('play21(b.dataset.action21)'),'No debe reaparecer la lectura inválida dataset.action21.');
ok(js.includes("if(action==='draw')")&&js.includes("if(action==='stand')")&&js.includes("if(action==='next')"),'play21 debe atender draw, stand y next.');
ok(html.includes('/js/community.js?v=v9-3-17-hotfix-21-20260826'),'Comunidad debe invalidar caché de community.js para el hotfix.');
console.log('OK V9.3.17 hotfix acciones 21 de La Gorda');
