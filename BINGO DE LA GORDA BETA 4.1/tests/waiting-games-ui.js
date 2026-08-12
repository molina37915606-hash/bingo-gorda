'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

class ClassList {
  constructor(initial = []) { this.values = new Set(initial); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    if (force === undefined) force = !this.values.has(name);
    force ? this.values.add(name) : this.values.delete(name);
    return force;
  }
  contains(name) { return this.values.has(name); }
}

function element(classes = []) {
  return {
    className: '', classList: new ClassList(classes), style: {}, innerHTML: '', textContent: '', disabled: false,
    querySelectorAll() { return []; }
  };
}

const elements = {
  miniPlayingCard: element(['playingCard', 'back']),
  miniResult: element(), miniScore: element(), miniBest: element(),
  miniRestart: element(['hidden']), miniChoices: element()
};
const choiceButtons = [{ disabled:false }, { disabled:false }];
elements.miniChoices.querySelectorAll = () => choiceButtons;

const storage = new Map();
const context = {
  console,
  setTimeout: callback => { callback(); return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
  crypto: { randomUUID: () => 'test-device' },
  localStorage: { getItem:key => storage.has(key) ? storage.get(key) : null, setItem:(key,value)=>storage.set(key,String(value)), removeItem:key=>storage.delete(key) },
  sessionStorage: { getItem:()=>null, setItem() {}, removeItem() {} },
  document: { getElementById:id => elements[id] || null, body:{ classList:new ClassList() }, documentElement:{} },
  location: { search:'', reload() {} }, history:{ replaceState() {} }, navigator:{}, EventSource:function(){}, fetch:async()=>({ok:true,json:async()=>({})}),
  window: { BingoPresenterScripts:{}, addEventListener() {}, scrollTo() {}, open() {} }
};
context.window.window = context.window;
context.window.document = context.document;
context.globalThis = context;

const sourcePath = path.join(__dirname, '..', 'js', 'online-room-player.js');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace("window.addEventListener('DOMContentLoaded', () => new PlayerApp().init());", 'globalThis.PlayerApp = PlayerApp;');
vm.runInNewContext(source, context, { filename:'online-room-player.js' });
const app = new context.PlayerApp();
app.state = { status:'waiting', waitingGame:{type:'both', activeTypes:['red_black','higher_lower'], leaderboard:[], leaderboards:{red_black:[],higher_lower:[]}}, player:{id:'p1'} };
app.submitWaitingScore = async () => {};
app.randomMiniCard = () => ({ key:'spade', symbol:'♠', color:'black', face:'pica', value:13, rank:'K' });

(async () => {
  const initialHtml = app.waitingMiniGameHtml();
  assert(initialHtml.includes('data-mini-game="red_black"'));
  assert(initialHtml.includes('data-mini-game="higher_lower"'));
  let switchRenders = 0;
  app.renderWaiting = () => { switchRenders++; };
  app.switchWaitingMini('higher_lower');
  assert.equal(app.waitingMini.activeType, 'higher_lower');
  app.switchWaitingMini('red_black');
  assert.equal(app.waitingMini.activeType, 'red_black');
  assert.equal(switchRenders, 2, 'Cambiar de minijuego debe reconstruir el panel.');

  await app.playWaitingMini('red');
  assert.equal(app.waitingMini.ended, true, 'La ronda debe terminar al fallar.');
  assert(elements.miniChoices.classList.contains('hidden'), 'Las elecciones deben ocultarse al fallar.');
  assert(!elements.miniRestart.classList.contains('hidden'), 'Volver a jugar debe quedar visible.');

  const rebuilt = app.waitingMiniGameHtml();
  assert(rebuilt.includes('miniGameChoices hidden'), 'La reconstrucción por SSE debe conservar las elecciones ocultas.');
  assert(/id="miniRestart" class="btn secondary"/.test(rebuilt), 'La reconstrucción por SSE debe conservar Volver a jugar visible.');
  assert(rebuilt.includes('Te equivocaste'), 'La reconstrucción debe conservar el resultado de la ronda.');

  let rendered = false;
  app.renderWaiting = () => { rendered = true; };
  app.restartWaitingMini();
  assert.equal(app.waitingMini.ended, false);
  assert.equal(app.waitingMini.score, 0);
  assert(rendered, 'Volver a jugar debe reconstruir una ronda nueva.');
  console.log('PRUEBA UI MINIJUEGO: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
