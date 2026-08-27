const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const i18n=fs.readFileSync(path.join(root,'js','i18n.js'),'utf8');
assert(i18n.includes("SUPPORTED=['es','pt','en']"),'debe soportar ES/PT/EN');
assert(i18n.includes("localStorage.getItem('lg_language')"),'debe recordar idioma');
assert(i18n.includes("navigator.language"),'debe detectar idioma');
assert(i18n.includes("BRAND='EL BINGO DE LA GORDA'"),'debe preservar marca');
for(const file of ['comunidad.html','player.html','demo.html','admin.html','evento.html','evento-admin.html','evento-conductor.html','evento-elegir.html','tv.html','transmision.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');assert(html.includes('/js/i18n.js?v=final-internacional-20260827'),file+' debe cargar i18n');
}
assert(i18n.includes('Join a room or create your own.'),'debe incluir inglés');
assert(i18n.includes('Entre em uma sala ou crie a sua.'),'debe incluir portugués');
console.log('OK final internacional i18n');
