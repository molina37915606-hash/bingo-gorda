const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'demo.html'), 'utf8');
const jsPath = path.join(ROOT, 'js', 'demo-alfa.js');
const source = fs.readFileSync(jsPath, 'utf8');

assert(html.includes('BINGO DE LA GORDA ALFA'), 'La DEMO debe identificarse como ALFA.');
assert(html.includes('/js/demo-alfa.js'), 'La DEMO debe usar su script independiente.');
assert(!html.includes('/demo/start'), 'La DEMO ALFA no debe crear salas del servidor.');
assert(!html.includes('online-room-player.js'), 'La DEMO ALFA no debe cargar el cliente normal del jugador.');
assert(!/\bfetch\s*\(/.test(source), 'La DEMO ALFA no debe depender de fetch para jugar.');
assert(!source.includes('/api/'), 'La DEMO ALFA no debe depender de APIs de sala.');
assert(source.includes("state.phase='playing'"), 'La DEMO debe tener un estado local de juego.');
assert(source.includes("startTutorial('waiting'"), 'El tutorial debe comenzar en la sala de espera.');
assert(source.includes("startTutorial('game'"), 'El tutorial debe continuar en la pantalla de juego.');
assert(html.includes('id="modeChoiceOverlay"') && source.includes('chooseInitialMode'), 'Debe existir elección obligatoria Manual o Automarcado.');
assert(source.includes('checkManualLag()') && source.includes('pending<=4') && source.includes('>=5'), 'Debe existir la asistencia por atraso de marcado.');
assert(source.includes('maybeShowPrizeCoach') && source.includes('¡TENÉS BINGO!'), 'El DEMO debe enseñar a reclamar Línea/Bingo cuando aparecen.');
assert(html.includes('/js/emoji-stickers.js'), 'El DEMO debe cargar emojis y stickers igual que el juego real.');
assert(html.includes('Gana el primer reclamo válido'), 'La regla del primer reclamo debe estar visible.');
assert(html.includes('id="helpBtn"'), 'Debe existir el botón ? permanente.');
assert(html.includes('id="sideArrow"'), 'Debe conservarse la flecha lateral.');
assert(html.includes('Chat de la DEMO'), 'La DEMO debe mostrar chat IA.');

const exposed = source.replace(
  /bind\(\);\s*\}\)\(\);\s*$/,
  "window.__TEST__={state,generateCard90,generateCard75,cardNumbers,lineDefinitions,analyzeCard,prizeValid,initPrizeSlots,slotEligible};})();"
);
assert.notStrictEqual(exposed, source, 'No se pudo preparar el motor de DEMO para la prueba.');
const context = { window: {}, console, setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(context);
vm.runInContext(exposed, context, { filename: 'demo-alfa.js' });
const api = context.window.__TEST__;
assert(api, 'No se expuso el motor de prueba.');

for (let i = 0; i < 50; i++) {
  const grid = api.generateCard90();
  assert.strictEqual(grid.length, 3);
  grid.forEach(row => assert.strictEqual(row.filter(Number.isFinite).length, 5, 'Cada fila de 90 debe tener 5 números.'));
  for (let col = 0; col < 9; col++) assert(grid.some(row => Number.isFinite(row[col])), 'Cada columna de 90 debe tener al menos un número.');
  const nums = grid.flat().filter(Number.isFinite);
  assert.strictEqual(new Set(nums).size, 15, 'El cartón de 90 debe tener 15 números únicos.');
}
for (let i = 0; i < 30; i++) {
  const grid = api.generateCard75();
  assert.strictEqual(grid.length, 5);
  assert.strictEqual(grid[2][2], 'LIBRE');
  const nums = grid.flat().filter(Number.isFinite);
  assert.strictEqual(nums.length, 24);
  assert.strictEqual(new Set(nums).size, 24);
}

api.state.mode = 90;
api.state.drawn = [];
const card90 = { id:'c90', number:'001', mode:90, grid:api.generateCard90() };
api.state.drawn = api.cardNumbers(card90);
assert(api.analyzeCard(card90).hasBingo, 'Con todos los números extraídos debe haber Bingo en 90.');
assert(api.analyzeCard(card90).hasLine, 'Con todos los números extraídos debe haber Línea en 90.');
api.state.mode = 75;
const card75 = { id:'c75', number:'001', mode:75, grid:api.generateCard75() };
api.state.drawn = api.cardNumbers(card75);
const a75 = api.analyzeCard(card75);
assert(a75.hasBingo && a75.hasLine && a75.hasDoubleLine && a75.hasTripleLine && a75.hasCorners, 'El análisis de 75 debe reconocer los premios completos.');

console.log('OK demo-alfa-standalone: DEMO independiente y motor local verificados.');
