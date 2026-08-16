const fs=require('fs');
const js=fs.readFileSync(require('path').join(__dirname,'..','js','player.js'),'utf8');
function ok(cond,msg){if(!cond)throw new Error(msg)}
ok(js.includes("panel.addEventListener('touchstart'"),'El chat móvil debe escuchar arrastre desde el panel completo');
ok(js.includes("panel.addEventListener('touchend'"),'El chat móvil debe resolver el gesto desde el panel completo');
ok(js.includes("dy<58"),'Debe existir un umbral claro para minimizar');
ok(js.includes("gesture.inMessages&&gesture.scrollTop>4"),'El historial desplazado debe quedar protegido contra cierres accidentales');
ok(js.includes("button,input,textarea,select,a"),'Controles interactivos deben quedar protegidos');
ok(js.includes("this.setChatSheet('collapsed',false)"),'El gesto hacia abajo debe minimizar el chat');
console.log('PRUEBA CHAT MÓVIL · ARRASTRE RÁPIDO: OK');
