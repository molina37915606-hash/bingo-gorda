const fs=require('fs');
const path=require('path');
function assert(ok,msg){if(!ok){console.error('FAIL:',msg);process.exit(1)}}
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const community=fs.readFileSync(path.join(root,'js','community.js'),'utf8');
assert(html.includes('class="lobbyMobilePlay" type="button" data-lobby-create')&&html.includes('<b>JUGAR</b><small>(CREAR MESA)</small>'),'Móvil: JUGAR debe crear una mesa y explicarlo.');
assert(html.includes('class="lobbyMobileJoin" type="button" data-lobby-join')&&html.includes('> UNIRSE</button>'),'Móvil: debe existir UNIRSE.');
assert(!html.includes('data-lobby-scroll-rooms'),'No debe quedar el antiguo JUGAR que solo hacía scroll.');
assert(html.includes("function joinAvailableRooms()"),'UNIRSE debe tener una acción propia.');
assert(html.includes("toast('Aún no hay mesas disponibles. Armá tu propia mesa y empezá a jugar.')"),'UNIRSE debe avisar cuando no hay mesas.');
assert(community.includes('Aún no hay mesas disponibles. Armá tu propia mesa y empezá a jugar.'),'El estado vacío de mesas debe usar el nuevo aviso.');
assert(/@media\(max-width:720px\)[\s\S]*?\.presence\{display:none!important\}/.test(html),'El indicador de conexión debe ocultarse en móvil.');
const createButtons=(html.match(/<button[^>]*data-lobby-create[^>]*>/g)||[]).length;
assert(createButtons===2,'Deben quedar solo dos botones data-lobby-create: JUGAR móvil y CREAR MESA principal de escritorio.');
assert(!/<button class="lobbyCreateSmall"[^>]*data-lobby-create/.test(html),'Escritorio: debe eliminarse el CREAR MESA duplicado de Mesas disponibles.');
assert(/\/js\/community\.js\?v=v9-3-(?:9|10)-/.test(html),'Debe mantenerse invalidación de caché de community.js desde V9.3.9.');
console.log('OK v939 lobby JUGAR / UNIRSE');
