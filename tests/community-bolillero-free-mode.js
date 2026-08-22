
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'comunidad.html'), 'utf8');
let tools = fs.readFileSync(path.join(root, 'js', 'community-tools.js'), 'utf8');

assert(html.includes('<option value="free">LIBRE</option>'), 'El Bolillero de Comunidad debe ofrecer Modo Libre.');
assert(html.includes('id="bolFreeMax"') && html.includes('max="250"'), 'Modo Libre debe aceptar un máximo de 250.');
assert(html.includes('id="bolMaxOccurrences"') && html.includes('max="10"'), 'Debe poder limitar cuántas veces aparece cada número.');
assert(html.includes('1 = sin repetición'), 'La interfaz debe explicar que 1 evita repeticiones.');
assert(html.includes('Voz robótica de bolillas activada') || tools.includes('Voz robótica de bolillas activada'), 'Modo Libre debe indicar voz robótica.');
assert(tools.includes("loadedCards:free?[]:"), 'Modo Libre no debe cargar cartones ni lógica de Bingo.');
assert(tools.includes("if (isFreeMode(bol.mode)) return [];"), 'Modo Libre no debe mostrar jugadas/reclamos de Bingo.');
assert(tools.includes("bol.order[bol.drawn.length]"), 'Modo Libre debe consumir un orden que admite números repetidos.');

const injection = "globalThis.__bolV8Test={clampFreeMax,clampMaxOccurrences,buildDrawOrder,totalDrawCount,defaultBolillero};\
  window.addEventListener('DOMContentLoaded', bind);";
tools = tools.replace("window.addEventListener('DOMContentLoaded', bind);", injection);
const context = {
  console,
  fetch: async()=>{ throw new Error('fetch no esperado'); },
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage:{ getItem:()=>null, setItem:()=>{} },
  document:{ getElementById:()=>null, documentElement:{classList:{toggle(){}}}, body:{classList:{toggle(){}}}, addEventListener(){} },
  window:{ addEventListener(){}, matchMedia:()=>({matches:false}) },
  TextDecoder, Uint8Array, atob:global.atob
};
context.globalThis = context;
vm.runInNewContext(tools, context, { filename:'community-tools.js' });
const t = context.__bolV8Test;
assert(t, 'No se pudieron exponer helpers reales del Modo Libre.');
assert.equal(t.clampFreeMax(999), 250);
assert.equal(t.clampFreeMax(1), 2);
assert.equal(t.clampMaxOccurrences(0), 1);
assert.equal(t.clampMaxOccurrences(50), 10);
const order = t.buildDrawOrder('free', 250, 3);
assert.equal(order.length, 750, '1–250 con máximo 3 debe producir 750 extracciones posibles.');
const counts = new Map();
for (const n of order) {
  assert(n >= 1 && n <= 250, `Número fuera de rango: ${n}`);
  counts.set(n, (counts.get(n) || 0) + 1);
}
assert.equal(counts.size, 250);
for (let n=1;n<=250;n++) assert.equal(counts.get(n), 3, `El ${n} no respeta el máximo configurado.`);
const noRepeat = t.buildDrawOrder('free', 37, 1);
assert.equal(noRepeat.length, 37);
assert.equal(new Set(noRepeat).size, 37, 'Con máximo 1 no debe haber repeticiones.');
console.log('PRUEBA V8 BOLILLERO LIBRE: OK · 1–250 · 1–10 apariciones · voz robótica · sin cartones/reclamos');
