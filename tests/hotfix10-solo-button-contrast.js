const fs=require('fs');
const path=require('path');
function assert(ok,msg){if(!ok){console.error('FAIL:',msg);process.exit(1)}}
const html=fs.readFileSync(path.join(__dirname,'..','comunidad.html'),'utf8');
assert(html.includes('id="mobileSoloBtn" class="mobileSoloInline"'),'Debe mantenerse el mismo botón móvil JUGAR SOLO.');
assert(html.includes('🤖 JUGAR SOLO</button>'),'No debe cambiar el texto visible del botón.');
assert(/\.mobileSoloInline\{display:inline-flex;[^}]*min-height:34px[^}]*padding:0 11px[^}]*border:1px solid #b86de6[^}]*background:linear-gradient\(145deg,#512873,#7436a5\)[^}]*color:#fff/.test(html),'El botón móvil debe conservar dimensiones y ganar contraste.');
assert(!/\.lobbySolo,.mobileSoloInline\{cursor:pointer\}\.mobileSoloInline\{border:0\}/.test(html),'Ninguna regla posterior debe volver a eliminar el borde de JUGAR SOLO.');
assert(/\.lobbySolo\{min-height:43px;padding:0 18px;border:1px solid #b86de6[^}]*background:linear-gradient\(145deg,#512873,#7436a5\)/.test(html),'La variante de escritorio debe usar el mismo refuerzo visual sin cambiar tamaño.');
console.log('OK hotfix10 contraste JUGAR SOLO');
