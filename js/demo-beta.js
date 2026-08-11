(() => {
'use strict';
const $ = id => document.getElementById(id);
const q = sel => document.querySelector(sel);
const qa = sel => [...document.querySelectorAll(sel)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const shuffle = values => { const a=[...values]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const uid = prefix => `${prefix}_${Math.random().toString(36).slice(2,10)}${Date.now().toString(36).slice(-5)}`;
const AI_NAMES = ['Zoe','Mateo','Owen'];
const CHAT_LINES = ['Suerte 🍀','Vamos 😄','Me falta poquito 🤞','Qué nervios 😅','Dale dale 🔥','Casi casi 👀','A ver esa bolilla','👏👏👏','Tengo fe 🤞','Nooo 😭','Vamos que sale 🎉'];
const PRIZE_LABELS = { ambo:'Ambocabeza', line:'Línea', doubleLine:'Doble línea', tripleLine:'Triple línea', corners:'4 esquinas', bingo:'Bingo' };

const state = {
  phase:'config', mode:90, rules:{ambo:true,line:true,doubleLine:false,tripleLine:false,corners:false,bingo:true}, linePrizeCount:2,
  allowedCards:2, aiCount:2, speed:3, playerName:'', offers:[], selectedIds:[], cards:[], aiPlayers:[], activeCard:0,
  drawn:[], drawOrder:[], playing:false, finished:false, autoMark:false, marks:{}, sound:true, voice:true,
  prizeSlots:[], winners:[], pendingAi:new Map(), drawTimer:null, chatTimer:null, wakeLock:null,
  tutorial:{active:false,stage:null,index:0,skipped:false}, drawerTab:'drawn', chat:[], lastClaimAt:0
};
window.__BINGO_DEMO_BETA__ = state;

function readRadio(name, fallback){ const item=q(`input[name="${name}"]:checked`); return item ? Number(item.value) : fallback; }
function configFromUi(){
  const mode=readRadio('mode',90)===75?75:90;
  const rules=mode===75
    ? {ambo:false,line:$('prizeLine').checked,doubleLine:$('prizeDouble').checked,tripleLine:$('prizeTriple').checked,corners:$('prizeCorners').checked,bingo:$('prizeBingo').checked}
    : {ambo:$('prizeAmbo').checked,line:$('prizeLine').checked,doubleLine:false,tripleLine:false,corners:false,bingo:$('prizeBingo').checked};
  if(!Object.values(rules).some(Boolean)){ toast('Elegí al menos un premio.','error'); return null; }
  return {mode,rules,linePrizeCount:mode===90&&rules.line?readRadio('lineCount',2):1,allowedCards:readRadio('cardCount',2),aiCount:readRadio('aiCount',2),speed:readRadio('speed',3)};
}
function updateConfigMode(){ const mode=readRadio('mode',90); qa('.p75').forEach(el=>el.classList.toggle('hidden',mode!==75)); qa('.p90').forEach(el=>el.classList.toggle('hidden',mode!==90)); $('lineCountField').classList.toggle('hidden',mode!==90); }

function generateCard90(){
  const ranges=[[1,9],[10,19],[20,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,90]];
  for(let attempt=0;attempt<5000;attempt++){
    const grid=Array.from({length:3},()=>Array(9).fill(null)); const counts=Array(9).fill(0);
    for(let row=0;row<3;row++) for(const col of shuffle([...Array(9).keys()]).slice(0,5)){ grid[row][col]=0; counts[col]++; }
    if(!counts.every(Boolean)) continue;
    for(let col=0;col<9;col++){
      const rows=[0,1,2].filter(row=>grid[row][col]===0); const [min,max]=ranges[col];
      const values=shuffle(Array.from({length:max-min+1},(_,i)=>min+i)).slice(0,rows.length).sort((a,b)=>a-b);
      rows.forEach((row,i)=>grid[row][col]=values[i]);
    }
    return grid;
  }
  throw new Error('No se pudo generar cartón de 90 bolas.');
}
function generateCard75(){
  const grid=Array.from({length:5},()=>Array(5).fill(null)); const starts=[1,16,31,46,61];
  for(let col=0;col<5;col++){
    const count=col===2?4:5; const values=shuffle(Array.from({length:15},(_,i)=>starts[col]+i)).slice(0,count).sort((a,b)=>a-b); const rows=col===2?[0,1,3,4]:[0,1,2,3,4];
    rows.forEach((row,i)=>grid[row][col]=values[i]);
  }
  grid[2][2]='LIBRE'; return grid;
}
function cardNumbers(card){ return card.grid.flat().filter(Number.isFinite); }
function cardSignature(card){ return cardNumbers(card).slice().sort((a,b)=>a-b).join(','); }
function makeCard(index){ return {id:uid('card'),number:String(index+1).padStart(3,'0'),mode:state.mode,grid:state.mode===75?generateCard75():generateCard90()}; }
function generateUniqueCards(count,start=0){ const out=[]; const seen=new Set([...state.offers,...state.cards,...state.aiPlayers.flatMap(p=>p.cards||[])].map(cardSignature)); let guard=0; while(out.length<count&&guard++<5000){ const card=makeCard(start+out.length); const sig=cardSignature(card); if(seen.has(sig)) continue; seen.add(sig); out.push(card); } return out; }
function lineDefinitions(card){
  if(card.mode===90) return card.grid.map((row,i)=>({key:`r${i}`,values:row.filter(Number.isFinite)}));
  const lines=[]; for(let r=0;r<5;r++) lines.push({key:`r${r}`,values:card.grid[r].filter(Number.isFinite)}); for(let c=0;c<5;c++) lines.push({key:`c${c}`,values:card.grid.map(row=>row[c]).filter(Number.isFinite)}); lines.push({key:'d1',values:card.grid.map((row,i)=>row[i]).filter(Number.isFinite)}); lines.push({key:'d2',values:card.grid.map((row,i)=>row[4-i]).filter(Number.isFinite)}); return lines;
}
function analyzeCard(card){
  const drawn=new Set(state.drawn); const lines=lineDefinitions(card); const completeLines=lines.filter(line=>line.values.length&&line.values.every(n=>drawn.has(n)));
  const numbers=cardNumbers(card); const cornerValues=card.mode===75?[card.grid[0][0],card.grid[0][4],card.grid[4][0],card.grid[4][4]].filter(Number.isFinite):[];
  const ambo=card.mode===90?card.grid.some(row=>{ const values=row.filter(Number.isFinite); return values.length===5&&drawn.has(values[0])&&drawn.has(values[4])&&values.slice(1,4).every(n=>!drawn.has(n)); }):false;
  return {hasAmbo:ambo,hasLine:completeLines.length>=1,hasDoubleLine:card.mode===75&&completeLines.length>=2,hasTripleLine:card.mode===75&&completeLines.length>=3,hasCorners:cornerValues.length===4&&cornerValues.every(n=>drawn.has(n)),hasBingo:numbers.every(n=>drawn.has(n)),lineCount:completeLines.length,bingoMissing:numbers.filter(n=>!drawn.has(n)).length};
}
function prizeValid(card,type){ const a=analyzeCard(card); return Boolean({ambo:a.hasAmbo,line:a.hasLine,doubleLine:a.hasDoubleLine,tripleLine:a.hasTripleLine,corners:a.hasCorners,bingo:a.hasBingo}[type]); }

function initPrizeSlots(){
  state.prizeSlots=[];
  const add=(type,count=1)=>{ if(!state.rules[type]) return; for(let i=1;i<=count;i++) state.prizeSlots.push({id:type==='line'&&count>1?`line${i}`:type,type,label:type==='line'&&count>1?`Línea ${i}`:PRIZE_LABELS[type],closed:false,winner:null}); };
  if(state.mode===90){ add('ambo'); add('line',state.linePrizeCount); add('bingo'); }
  else { add('corners'); add('line'); add('doubleLine'); add('tripleLine'); add('bingo'); }
}
function nextOpenSlot(type){ return state.prizeSlots.find(slot=>slot.type===type&&!slot.closed) || null; }
function cardAlreadyWonType(card,type){ return state.winners.some(w=>w.type===type&&String(w.cardId||'')===String(card?.id||'')); }
function slotEligible(card,slot){ if(!card||!slot||slot.closed) return false; if(cardAlreadyWonType(card,slot.type)) return false; return prizeValid(card,slot.type); }
function allPrizesClosed(){ return state.prizeSlots.length>0&&state.prizeSlots.every(slot=>slot.closed); }

function renderMiniCard(card){
  const cls=card.mode===90?'mode90':'mode75'; return `<div class="miniTicket ${cls}">${card.grid.flat().map(v=>v===null?'<div class="miniCell blank">.</div>':v==='LIBRE'?'<div class="miniCell free">LIBRE</div>':`<div class="miniCell">${v}</div>`).join('')}</div>`;
}
function createOffers(){ state.offers=generateUniqueCards(6,Math.floor(Math.random()*900)); }
function refreshOffers(){ const chosen=state.offers.filter(c=>state.selectedIds.includes(c.id)); const needed=Math.max(4,6-chosen.length); state.offers=[...chosen,...generateUniqueCards(needed,Math.floor(Math.random()*900))].slice(0,6); renderWaiting(); toast('Nuevos cartones listos. Conservamos los que elegiste.'); }
function renderWaiting(){
  $('allowedCount').textContent=state.allowedCards; $('selectedLimit').textContent=state.allowedCards; $('selectedCount').textContent=state.selectedIds.length;
  $('cardsTarget').innerHTML=state.offers.map(card=>`<button type="button" class="offerCard ${state.selectedIds.includes(card.id)?'selected':''}" data-card-id="${card.id}"><div class="offerHeader"><strong>Cartón ${card.number}</strong><small>${state.selectedIds.includes(card.id)?'✓ Elegido':'Tocá para elegir'}</small></div>${renderMiniCard(card)}</button>`).join('');
  qa('[data-card-id]').forEach(btn=>btn.onclick=()=>toggleOffer(btn.dataset.cardId));
  $('confirmCardsBtn').disabled=!canConfirmWaiting();
  $('summaryList').innerHTML=[['Modo',`${state.mode} bolas`],['Premios',state.prizeSlots.map(s=>s.label).join(' · ')],['Rivales IA',String(state.aiCount)],['Velocidad',`${state.speed} s`]].map(([a,b])=>`<div class="summaryLine"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('');
}
function canConfirmWaiting(){ return state.playerName.trim().length>=2&&state.selectedIds.length>=1&&state.selectedIds.length<=state.allowedCards; }
function toggleOffer(id){
  const idx=state.selectedIds.indexOf(id); if(idx>=0) state.selectedIds.splice(idx,1); else { if(state.selectedIds.length>=state.allowedCards){ toast(`Podés elegir hasta ${state.allowedCards} cartón${state.allowedCards===1?'':'es'}.`,'error'); return; } state.selectedIds.push(id); }
  renderWaiting();
}
function saveName(){ const name=$('playerName').value.trim().replace(/\s+/g,' ').slice(0,24); if(name.length<2){ toast('Escribí un nombre de al menos 2 letras.','error'); return false; } state.playerName=name; $('playerName').value=name; renderWaiting(); toast(`Listo, ${name}.`,'success'); return true; }
function confirmCards(){
  if(!saveName()) return; if(!state.selectedIds.length){ toast('Elegí al menos un cartón.','error'); return; }
  state.cards=state.selectedIds.map(id=>state.offers.find(c=>c.id===id)).filter(Boolean); state.cards.forEach(card=>state.marks[card.id]=new Set());
  setupAiPlayers(); state.activeCard=0; state.phase='tutorial'; $('waitingView').classList.add('hidden'); $('gameView').classList.remove('hidden'); $('chatToggleBtn').classList.remove('hidden'); $('phaseLabel').textContent='DEMO · APRENDIENDO A JUGAR';
  renderGame(); addChat('Zoe','Ya estamos 😄','ai'); addChat('Mateo','Suerte 🍀','ai'); startTutorial('game',0);
}
function setupAiPlayers(){
  const names=shuffle(AI_NAMES).slice(0,state.aiCount); state.aiPlayers=names.map((name,i)=>({id:uid('ai'),name,cards:generateUniqueCards(2,100+i*10)}));
}

function currentCard(){ return state.cards[state.activeCard] || null; }
function renderTicket(){
  const card=currentCard(); if(!card) return; $('ticketTarget').className=`ticket ${card.mode===90?'mode90':'mode75'}`;
  const marks=state.marks[card.id]||new Set(); $('ticketTarget').innerHTML=card.grid.flat().map(v=>{
    if(v===null) return '<div class="cell blank"></div>'; if(v==='LIBRE') return '<div class="cell free">LIBRE</div>'; return `<button type="button" class="cell ${marks.has(v)?'marked':''}" data-number="${v}"><span>${v}</span></button>`;
  }).join('');
  qa('#ticketTarget [data-number]').forEach(btn=>btn.onclick=()=>toggleMark(Number(btn.dataset.number)));
}
function renderTabs(){ $('ticketTabs').innerHTML=state.cards.map((card,i)=>`<button type="button" class="ticketTab ${i===state.activeCard?'active':''}" data-tab="${i}">Cartón ${card.number}</button>`).join(''); qa('[data-tab]').forEach(btn=>btn.onclick=()=>{state.activeCard=Number(btn.dataset.tab);renderTabs();renderTicket();renderClaims();}); }
function renderBall(){
  const last=state.drawn.at(-1); $('lastBall').textContent=last??'—'; $('lastBall').classList.toggle('empty',!last); $('recentBalls').innerHTML=state.drawn.slice(-7).reverse().map(n=>`<span class="recentBall">${n}</span>`).join('');
}
function renderClaims(){
  const card=currentCard(); const openTypes=[...new Set(state.prizeSlots.filter(slot=>!slot.closed).map(slot=>slot.type))];
  $('claimButtons').innerHTML=openTypes.map(type=>{ const slot=nextOpenSlot(type); const valid=slotEligible(card,slot); const label=type==='line'?'LÍNEA':PRIZE_LABELS[type].toUpperCase(); return `<button type="button" class="claimBtn ${type==='bingo'?'bingo':''} ${valid?'ready':''}" data-claim="${type}" ${state.playing?'':'disabled'}>${esc(label)}</button>`; }).join('') || '<span class="helper">Todos los premios ya fueron adjudicados.</span>';
  qa('[data-claim]').forEach(btn=>btn.onclick=()=>claimPrize(btn.dataset.claim));
}
function renderProgress(){
  $('progressBody').innerHTML=`<div class="progressRow"><span>Bolillas</span><b>${state.drawn.length}/${state.mode}</b></div>`+state.prizeSlots.map(slot=>`<div class="progressRow"><span>${esc(slot.label)}</span><b>${slot.closed?`✓ ${esc(slot.winner?.name||'')}`:'Pendiente'}</b></div>`).join('');
}
function renderGame(){ renderTabs(); renderTicket(); renderBall(); renderClaims(); renderProgress(); $('autoBtn').textContent=`AUTO ${state.autoMark?'ON':'OFF'}`; $('autoBtn').classList.toggle('on',state.autoMark); renderDrawer(); renderChat(); }
function toggleMark(number){ const card=currentCard(); if(!card) return; const marks=state.marks[card.id]||(state.marks[card.id]=new Set()); if(marks.has(number)) marks.delete(number); else marks.add(number); renderTicket(); }
function toggleAuto(){
  state.autoMark=!state.autoMark; let recovered=0; if(state.autoMark){ const drawn=new Set(state.drawn); for(const card of state.cards){ const marks=state.marks[card.id]||(state.marks[card.id]=new Set()); for(const n of cardNumbers(card)) if(drawn.has(n)&&!marks.has(n)){marks.add(n);recovered++;} } }
  $('autoBtn').textContent=`AUTO ${state.autoMark?'ON':'OFF'}`; $('autoBtn').classList.toggle('on',state.autoMark); renderTicket(); toast(state.autoMark?`Automarcado activado${recovered?` · ${recovered} números recuperados`:''}`:'Automarcado desactivado','success');
}
function applyAutoMark(number){ if(!state.autoMark) return; for(const card of state.cards){ if(cardNumbers(card).includes(number)) (state.marks[card.id]||(state.marks[card.id]=new Set())).add(number); } }

function claimPrize(type){
  if(!state.playing||state.finished) return; const now=Date.now(); if(now-state.lastClaimAt<450) return; state.lastClaimAt=now;
  const slot=nextOpenSlot(type); if(!slot){ toast('Ese premio ya fue adjudicado.','error'); return; }
  const card=currentCard(); if(!card||!slotEligible(card,slot)){ toast('Reclamo enviado · todavía no es válido.','error'); return; }
  closePrize(slot,{name:state.playerName,card,kind:'player'}); toast(`¡${slot.label} confirmado para vos!`,'success');
}
function closePrize(slot,winner){ if(slot.closed) return false; slot.closed=true; slot.winner={name:winner.name,cardNumber:winner.card.number,kind:winner.kind}; state.winners.push({label:slot.label,type:slot.type,name:winner.name,cardNumber:winner.card.number,cardId:winner.card.id,card:winner.card,kind:winner.kind,at:state.drawn.length});
  for(const [key,timer] of state.pendingAi){ if(key.startsWith(slot.id+':')){ clearTimeout(timer); state.pendingAi.delete(key); } }
  addChat(winner.name,winner.kind==='player'?`¡Ganó ${slot.label}! 🎉`:`¡${slot.label}! 🎉`,winner.kind==='player'?'you':'ai');
  renderClaims(); renderProgress(); renderDrawer(); speak(`${winner.name} ganó ${slot.label}`); beep(620,0.08);
  if(slot.type==='bingo'||allPrizesClosed()) finishGame(); return true; }
function scheduleAiClaims(){
  if(!state.playing||state.finished) return;
  for(const slot of state.prizeSlots.filter(s=>!s.closed)){
    const key=`${slot.id}:pending`; if(state.pendingAi.has(key)) continue;
    const candidates=[]; for(const ai of state.aiPlayers) for(const card of ai.cards) if(slotEligible(card,slot)) candidates.push({ai,card});
    if(!candidates.length) continue; const chosen=shuffle(candidates)[0]; const delay=900+Math.floor(Math.random()*1300);
    const timer=setTimeout(()=>{ state.pendingAi.delete(key); if(!state.playing||slot.closed||!slotEligible(chosen.card,slot)) return; closePrize(slot,{name:chosen.ai.name,card:chosen.card,kind:'ai'}); },delay); state.pendingAi.set(key,timer);
  }
}

function startCountdown(){
  state.phase='countdown'; $('phaseLabel').textContent='DEMO · POR COMENZAR'; $('countdownOverlay').classList.remove('hidden'); let n=5; $('countdownNumber').textContent=n;
  const timer=setInterval(()=>{ n--; if(n<=0){ clearInterval(timer); $('countdownOverlay').classList.add('hidden'); startGame(); } else $('countdownNumber').textContent=n; },700);
}
function startGame(){
  state.phase='playing'; state.playing=true; state.finished=false; state.drawOrder=shuffle(Array.from({length:state.mode},(_,i)=>i+1)); $('phaseLabel').textContent='DEMO · JUGANDO'; $('gameStatusTitle').textContent='Partida en juego'; $('gameStatusText').textContent='Revisá tus cartones y reclamá rápido.'; document.body.classList.add('focusMode'); renderClaims(); acquireWakeLock(); scheduleChat(); drawNext(); state.drawTimer=setInterval(drawNext,state.speed*1000);
}
function drawNext(){
  if(!state.playing||state.finished) return; const next=state.drawOrder[state.drawn.length]; if(!next){ finishGame(); return; } state.drawn.push(next); applyAutoMark(next); renderBall(); renderTicket(); renderClaims(); renderProgress(); renderDrawer(); beep(420,0.045); speak(`Número ${next}`); scheduleAiClaims();
}
function finishGame(){
  if(state.finished) return; state.finished=true; state.playing=false; state.phase='finished'; clearInterval(state.drawTimer); clearTimeout(state.chatTimer); for(const timer of state.pendingAi.values()) clearTimeout(timer); state.pendingAi.clear(); releaseWakeLock(); document.body.classList.remove('focusMode'); $('phaseLabel').textContent='DEMO · FINALIZADA';
  const mine=state.winners.filter(w=>w.kind==='player'); $('finalText').textContent=mine.length?`Ganaste ${mine.map(w=>w.label).join(', ')}. Podés volver a empezar cuando quieras.`:'La partida terminó. Podés iniciar otra DEMO para seguir probando.'; setTimeout(()=>$('finalOverlay').classList.remove('hidden'),500);
}

function addChat(name,text,kind='ai'){ state.chat.push({name,text,kind,ts:Date.now()}); state.chat=state.chat.slice(-30); renderChat(); }
function renderChat(){ if(!$('chatMessages')) return; $('chatMessages').innerHTML=state.chat.map(m=>`<div class="chatMsg ${m.kind}"><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('')||'<div class="emptyState">Todavía no hay mensajes.</div>'; $('chatMessages').scrollTop=$('chatMessages').scrollHeight; }
function sendChat(){ const text=$('chatInput').value.trim(); if(!text) return; addChat(state.playerName||'Vos',text,'you'); $('chatInput').value=''; setTimeout(()=>{ const ai=shuffle(state.aiPlayers)[0]; if(ai) addChat(ai.name,shuffle(['😄','👏','Jajaja','Vamos 🍀','🔥'])[0],'ai'); },700+Math.random()*700); }
function scheduleChat(){ clearTimeout(state.chatTimer); if(!state.playing) return; state.chatTimer=setTimeout(()=>{ if(!state.playing) return; const ai=shuffle(state.aiPlayers)[0]; if(ai) addChat(ai.name,shuffle(CHAT_LINES)[0],'ai'); scheduleChat(); },9000+Math.random()*7000); }

function renderDrawer(){ if(!$('drawerBody')) return; $('drawnTab').classList.toggle('active',state.drawerTab==='drawn'); $('winnersTab').classList.toggle('active',state.drawerTab==='winners');
  if(state.drawerTab==='drawn') $('drawerBody').innerHTML=state.drawn.length?`<div class="numberCloud">${state.drawn.map(n=>`<span class="numberChip">${n}</span>`).join('')}</div>`:'<div class="emptyState">Todavía no salió ninguna bolilla.</div>';
  else $('drawerBody').innerHTML=state.winners.length?state.winners.map(w=>`<div class="winnerCard"><strong>${esc(w.label)} · ${esc(w.name)}</strong><br><small>Cartón ${esc(w.cardNumber)} · bolilla ${w.at}</small>${w.card?`<div style="margin-top:8px">${renderMiniCard(w.card)}</div>`:''}</div>`).join(''):'<div class="emptyState">Todavía no hay ganadores.</div>';
}
function openDrawer(tab=state.drawerTab){ state.drawerTab=tab; renderDrawer(); $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden','false'); }
function closeDrawer(){ $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden','true'); }
function toggleChatPanel(){ $('chatPanel').classList.toggle('hidden'); }

function toast(text,type=''){ const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=text; $('toastHost').appendChild(el); setTimeout(()=>el.remove(),2600); }
function beep(freq=440,duration=.05){ if(!state.sound) return; try{ const C=window.AudioContext||window.webkitAudioContext; if(!C) return; if(!window.__demoAudio) window.__demoAudio=new C(); const ctx=window.__demoAudio; const o=ctx.createOscillator(),g=ctx.createGain(); o.frequency.value=freq; g.gain.value=.025; o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+duration); }catch{} }
function speak(text){ if(!state.voice||!('speechSynthesis' in window)||!state.playing) return; try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='es-AR'; u.rate=1.05; speechSynthesis.speak(u); }catch{} }
async function acquireWakeLock(){ try{ if('wakeLock' in navigator) state.wakeLock=await navigator.wakeLock.request('screen'); }catch{} }
async function releaseWakeLock(){ try{ await state.wakeLock?.release(); }catch{} state.wakeLock=null; }
async function toggleFullscreen(){ try{ if(!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); }catch{ toast('Este navegador no permite pantalla completa.','error'); } }

const waitingTutorial = [
  {target:'#playerName',title:'Poné tu nombre',text:'Escribí cómo querés aparecer durante la partida.'},
  {target:'#availableTarget',title:'Cuántos cartones podés elegir',text:'Acá siempre vas a ver tu límite y cuántos llevás seleccionados.'},
  {target:'#cardsTarget .offerCard',title:'Elegí tus cartones',text:'Tocá un cartón para elegirlo. Tocándolo otra vez lo desmarcás.'},
  {target:'#reloadCardsBtn',title:'¿Querés otros?',text:'Recargá para ver nuevos cartones. Los que ya elegiste se conservan.'},
  {target:'#confirmCardsBtn',title:'Confirmá y seguí',text:'Cuando tengas nombre y cartones, confirmá para pasar a la pantalla de juego.'}
];
const gameTutorial = [
  {target:'#ticketTarget .cell[data-number]',hand:true,title:'Marcar y desmarcar',text:'Tocá un número para marcarlo. Tocá de nuevo para desmarcarlo.'},
  {target:'#autoBtn',title:'Automarcado rápido',text:'AUTO se prende y apaga con un toque. Si te dormiste, al activarlo recupera todo lo que ya salió.'},
  {target:'#ballTarget',title:'Última bolilla',text:'La bolilla grande es la última que salió. Abajo quedan las más recientes.'},
  {target:'#sideArrow',title:'La flechita lateral',text:'Abrila para revisar todos los números salidos y los cartones ganadores.'},
  {target:'#claimsTarget',title:'Reclamá rápido',text:'Línea, Bingo y los premios activos se reclaman desde acá.'},
  {target:'#claimsTarget .claimRule',title:'Regla principal',text:'Gana el primer reclamo válido. Completar el premio no alcanza: hay que reclamar.'},
  {target:'#soundBtn',title:'Sonido',text:'Este icono prende o apaga los sonidos del juego.'},
  {target:'#voiceBtn',title:'Voz',text:'Desde acá podés activar o silenciar la voz que canta las bolillas.'},
  {target:'#fullscreenBtn',title:'Pantalla completa',text:'Usá este botón para aprovechar toda la pantalla del celular, PC o TV.'},
  {target:'#chatPanel',title:'Chat de la DEMO',text:'Tus rivales IA escriben durante la partida. También podés mandar mensajes.'},
  {target:'#helpBtn',title:'¿Lo querés ver otra vez?',text:'El ? queda siempre disponible para repetir este tutorial cuando quieras.'}
];
function tutorialSteps(stage){ return stage==='waiting'?waitingTutorial:gameTutorial; }
function resolveTutorialTarget(step){ return step? q(step.target):null; }
function startTutorial(stage,index=0){
  endTutorialVisuals(); state.tutorial.active=true; state.tutorial.stage=stage; state.tutorial.index=clamp(index,0,tutorialSteps(stage).length-1); $('tutorialOverlay').classList.remove('hidden'); $('tutorialBubble').classList.remove('hidden'); showTutorialStep();
}
function showTutorialStep(){
  const steps=tutorialSteps(state.tutorial.stage); const step=steps[state.tutorial.index]; if(!step){ finishTutorialStage(false); return; }
  let target=resolveTutorialTarget(step); if(!target){ const dir=1; const next=state.tutorial.index+dir; if(next<steps.length){state.tutorial.index=next;showTutorialStep();return;} finishTutorialStage(false);return; }
  qa('.tutorialFocus').forEach(el=>el.classList.remove('tutorialFocus','tutorialHand')); target.classList.add('tutorialFocus'); if(step.hand) target.classList.add('tutorialHand');
  $('tutorialTitle').textContent=step.title; $('tutorialText').textContent=step.text; $('tutorialProgress').textContent=`${state.tutorial.index+1}/${steps.length}`; $('tutorialBack').disabled=state.tutorial.index===0; $('tutorialNext').textContent=state.tutorial.index===steps.length-1?'LISTO':'SIGUIENTE';
  positionTutorial(target); setTimeout(()=>{ try{ target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'}); setTimeout(()=>positionTutorial(target),220); }catch{} },20);
}
function positionTutorial(target){
  const bubble=$('tutorialBubble'); const r=target.getBoundingClientRect(); const bw=Math.min(330,window.innerWidth-24); bubble.style.width=`${bw}px`; const bh=bubble.offsetHeight||190; let left=clamp(r.left+r.width/2-bw/2,12,window.innerWidth-bw-12); let top=r.bottom+14; if(top+bh>window.innerHeight-12) top=Math.max(12,r.top-bh-14); bubble.style.left=`${left}px`; bubble.style.top=`${top}px`;
}
function nextTutorial(){ const steps=tutorialSteps(state.tutorial.stage); if(state.tutorial.index>=steps.length-1) finishTutorialStage(false); else{state.tutorial.index++;showTutorialStep();} }
function backTutorial(){ if(state.tutorial.index>0){state.tutorial.index--;showTutorialStep();} }
function skipTutorial(){ state.tutorial.skipped=true; finishTutorialStage(true); }
function finishTutorialStage(skipped){
  const stage=state.tutorial.stage; state.tutorial.active=false; endTutorialVisuals(); if(stage==='waiting'){ toast(skipped?'Tutorial salteado. Podés abrirlo con ? cuando quieras.':'Ya conocés la sala. Elegí tus cartones.','success'); }
  if(stage==='game'&&state.phase==='tutorial'){ toast(skipped?'Tutorial salteado. Empezamos.':'Tutorial listo. Empezamos.','success'); startCountdown(); }
}
function endTutorialVisuals(){ qa('.tutorialFocus').forEach(el=>el.classList.remove('tutorialFocus','tutorialHand')); $('tutorialOverlay').classList.add('hidden'); $('tutorialBubble').classList.add('hidden'); }
function reopenTutorial(){ if(state.phase==='config') return; if(state.tutorial.active){ toast('Usá SIGUIENTE o SALTAR para cerrar el tutorial.'); return; } startTutorial(state.phase==='waiting'?'waiting':'game',0); }

function resetDemoToConfig(){
  clearInterval(state.drawTimer); clearTimeout(state.chatTimer); for(const timer of state.pendingAi.values()) clearTimeout(timer); releaseWakeLock(); Object.assign(state,{phase:'config',playerName:'',offers:[],selectedIds:[],cards:[],aiPlayers:[],activeCard:0,drawn:[],drawOrder:[],playing:false,finished:false,autoMark:false,marks:{},prizeSlots:[],winners:[],pendingAi:new Map(),drawTimer:null,chatTimer:null,tutorial:{active:false,stage:null,index:0,skipped:false},drawerTab:'drawn',chat:[],lastClaimAt:0});
  $('finalOverlay').classList.add('hidden'); $('appScreen').classList.add('hidden'); $('configScreen').classList.remove('hidden'); closeDrawer(); document.body.classList.remove('focusMode'); window.scrollTo(0,0);
}
function enterWaiting(){
  const cfg=configFromUi(); if(!cfg) return; Object.assign(state,cfg); initPrizeSlots(); state.phase='waiting'; state.playerName=''; state.selectedIds=[]; state.cards=[]; state.drawn=[]; state.winners=[]; state.chat=[]; createOffers();
  $('configScreen').classList.add('hidden'); $('appScreen').classList.remove('hidden'); $('waitingView').classList.remove('hidden'); $('gameView').classList.add('hidden'); $('chatToggleBtn').classList.add('hidden'); $('phaseLabel').textContent='DEMO · SALA DE ESPERA'; $('playerName').value=''; renderWaiting(); window.scrollTo(0,0); setTimeout(()=>startTutorial('waiting',0),250);
}

function bind(){
  qa('input[name="mode"]').forEach(el=>el.addEventListener('change',updateConfigMode)); $('prizeLine').addEventListener('change',updateConfigMode); updateConfigMode();
  $('createDemoBtn').onclick=enterWaiting; $('saveNameBtn').onclick=saveName; $('playerName').addEventListener('input',()=>{state.playerName=$('playerName').value.trim();renderWaiting();}); $('playerName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveName();}});
  $('reloadCardsBtn').onclick=refreshOffers; $('confirmCardsBtn').onclick=confirmCards; $('autoBtn').onclick=toggleAuto; $('sideArrow').onclick=()=>openDrawer('drawn'); $('drawerClose').onclick=closeDrawer; $('drawnTab').onclick=()=>openDrawer('drawn'); $('winnersTab').onclick=()=>openDrawer('winners');
  $('soundBtn').onclick=()=>{state.sound=!state.sound;$('soundBtn').setAttribute('aria-pressed',String(state.sound));$('soundBtn').textContent=state.sound?'🔊':'🔇';toast(`Sonido ${state.sound?'activado':'desactivado'}.`);};
  $('voiceBtn').onclick=()=>{state.voice=!state.voice;$('voiceBtn').setAttribute('aria-pressed',String(state.voice));$('voiceBtn').textContent=state.voice?'🎙':'⊘';if(!state.voice&&'speechSynthesis'in window)speechSynthesis.cancel();toast(`Voz ${state.voice?'activada':'desactivada'}.`);};
  $('fullscreenBtn').onclick=toggleFullscreen; $('helpBtn').onclick=reopenTutorial; $('chatToggleBtn').onclick=toggleChatPanel; $('chatSendBtn').onclick=sendChat; $('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendChat();}});
  $('tutorialNext').onclick=nextTutorial; $('tutorialBack').onclick=backTutorial; $('tutorialSkip').onclick=skipTutorial; $('restartDemoBtn').onclick=resetDemoToConfig;
  window.addEventListener('resize',()=>{if(state.tutorial.active){const step=tutorialSteps(state.tutorial.stage)[state.tutorial.index];const target=resolveTutorialTarget(step);if(target)positionTutorial(target);}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.playing)acquireWakeLock();});
  document.addEventListener('keydown',e=>{ if(state.phase==='playing'&&state.cards.length>1&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){ if(e.key==='ArrowRight'){state.activeCard=(state.activeCard+1)%state.cards.length;renderTabs();renderTicket();renderClaims();} if(e.key==='ArrowLeft'){state.activeCard=(state.activeCard-1+state.cards.length)%state.cards.length;renderTabs();renderTicket();renderClaims();} } });
  let touchX=null; $('ticketTarget').addEventListener('touchstart',e=>{touchX=e.touches?.[0]?.clientX??null;},{passive:true}); $('ticketTarget').addEventListener('touchend',e=>{if(touchX===null||state.cards.length<2)return;const x=e.changedTouches?.[0]?.clientX??touchX;const d=x-touchX;touchX=null;if(Math.abs(d)<70)return;state.activeCard=d<0?(state.activeCard+1)%state.cards.length:(state.activeCard-1+state.cards.length)%state.cards.length;renderTabs();renderTicket();renderClaims();},{passive:true});
}
bind();
})();
