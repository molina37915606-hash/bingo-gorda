const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('id="desktopDemoBtn"')&&html.includes('id="mobileDemoBtn"'),'Debe haber accesos Demo específicos para escritorio y móvil.');
ok((html.match(/href="\/demo"/g)||[]).length>=3,'Los accesos nuevos deben reutilizar /demo sin reemplazar el acceso histórico.');
ok(html.includes('id="v9316-demo-visible"'),'Debe existir CSS aislado V9.3.16 para el acceso Demo.');
ok(html.includes('.mobileDemoInline{display:none}')&&html.includes('@media(max-width:720px)'),'El Demo móvil debe estar aislado por media query.');
const actions=html.match(/<div class="lobbyHeroActions">([\s\S]*?)<\/div>/)?.[1]||'';
ok(actions.indexOf('desktopContactBtn')>=0&&actions.indexOf('desktopDemoBtn')>actions.indexOf('desktopContactBtn'),'En escritorio PROBAR DEMO debe quedar debajo/después de CONTACTANOS.');
ok(html.includes('¿Primera vez? Probá el DEMO'),'La guía de Comunidad debe orientar a los usuarios nuevos hacia el Demo.');
console.log('OK V9.3.16 demo visible');
