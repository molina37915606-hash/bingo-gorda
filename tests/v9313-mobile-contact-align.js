const fs=require('fs');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','comunidad.html'),'utf8');
function ok(cond,msg){if(!cond){console.error('FAIL:',msg);process.exit(1)}}
ok(html.includes('id="v9313-mobile-contact-align"'),'Debe existir el ajuste V9.3.13.');
ok(html.includes('grid-template-columns:auto minmax(0,1fr) auto!important'),'La cabecera móvil debe reservar extremos independientes.');
ok(html.includes('justify-self:start!important'),'El logo debe quedar justificado a la izquierda.');
ok(html.includes('justify-self:end!important'),'CONTACTANOS debe quedar justificado a la derecha.');
ok(html.includes('position:static!important'),'CONTACTANOS no debe flotar ni superponerse al logo.');
ok(html.includes('id="mobileContactBtn"'),'Debe mantenerse CONTACTANOS en móvil.');
ok(html.includes('id="desktopContactBtn"'),'Debe mantenerse CONTACTANOS en escritorio.');
console.log('V9.3.13 CONTACTANOS MÓVIL ALINEADO: OK');
