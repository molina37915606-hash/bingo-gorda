const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('id="desktopSoloBtn"')&&html.includes('id="mobileSoloBtn"'),'Debe haber accesos de Modo Solitario para escritorio y móvil.');
ok((html.match(/data-solo-play/g)||[]).length>=3,'Comunidad debe ofrecer Modo Solitario desde los accesos principales.');
ok(html.includes('id="solo-mode-visible"'),'Debe existir CSS aislado para el acceso Solitario.');
ok(html.includes('.mobileSoloInline{display:none}')&&html.includes('@media(max-width:720px)'),'El acceso Solitario móvil debe estar aislado por media query.');
const actions=html.match(/<div class="lobbyHeroActions">([\s\S]*?)<\/div>/)?.[1]||'';
ok(actions.indexOf('desktopContactBtn')>=0&&actions.indexOf('desktopSoloBtn')>actions.indexOf('desktopContactBtn'),'En escritorio JUGAR SOLO debe quedar junto a las acciones principales.');
ok(html.includes('Jugá solo contra Mateo, Zoe y Owen'),'La guía debe orientar a usuarios nuevos hacia el Modo Solitario.');
ok(!html.includes('href="/demo"'),'Comunidad no debe conservar accesos visibles al Demo anterior.');
console.log('OK V9.3.18 modo solitario visible');
