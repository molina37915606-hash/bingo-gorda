'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'el_bingo_de_la_gorda_bolillero_v1';
  let cardLot = null;
  let autoTimer = null;
  let claimType = '';
  let setupLoadedCards = [];
  let setupLotCode = '';
  let setupLoadSource = '';
  let boardView = 'numbers';
  let announcementType = '';
  let announcementResumeAuto = false;
  let announcementTimer = null;

  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials:'same-origin', headers:{ 'Content-Type':'application/json', ...(options.headers || {}) }, ...options });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(data?.error || `Error ${response.status}`);
    return data;
  };
  const show = id => $(id)?.classList.remove('hidden');
  const hide = id => $(id)?.classList.add('hidden');
  const toast = text => {
    const host = $('toast');
    if (!host) return;
    host.textContent = text;
    host.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => host.classList.remove('show'), 2600);
  };
  function setBolilleroScreen(open) {
    $('bolilleroOverlay')?.classList.toggle('hidden', !open);
    document.documentElement.classList.toggle('bolScreenOpen', Boolean(open));
    document.body.classList.toggle('bolScreenOpen', Boolean(open));
  }

  function openCards() {
    $('cardsSeries').value ||= '1';
    updateCardsSummary();
    hide('cardsResult');
    $('cardsError').textContent = '';
    show('cardsOverlay');
  }
  function closeCards() { hide('cardsOverlay'); }
  function updateCardsSummary() {
    const mode = Number($('cardsMode').value) === 75 ? 75 : 90;
    const series = Math.max(1, Math.min(10, Number($('cardsSeries').value) || 1));
    $('cardsSummary').innerHTML = `<b>Bingo ${mode}</b><span>${series} serie${series===1?'':'s'} · ${series*6} cartones · ${series} hoja${series===1?'':'s'}</span><small>${mode===90?'A4 horizontal':'A4 vertical'} · 6 cartones por hoja</small>`;
  }
  async function generateCards() {
    const button = $('cardsGenerateBtn');
    try {
      button.disabled = true;
      $('cardsError').textContent = '';
      const lot = await api('/api/community/cards/generate', { method:'POST', body:JSON.stringify({ mode:Number($('cardsMode').value), seriesCount:Number($('cardsSeries').value) }) });
      cardLot = lot;
      $('cardsLotCode').textContent = lot.code;
      $('cardsLotMeta').textContent = `Bingo ${lot.mode} · ${lot.seriesCount} serie${lot.seriesCount===1?'':'s'} · ${lot.totalCards} cartones`;
      $('cardsDownload').href = lot.downloadUrl;
      $('cardsLoadBolillero').dataset.lot = lot.code;
      show('cardsResult');
      try {
        const recent = JSON.parse(localStorage.getItem('la_gorda_lotes_recientes') || '[]');
        const next = [lot.code, ...recent.filter(code => code !== lot.code)].slice(0, 8);
        localStorage.setItem('la_gorda_lotes_recientes', JSON.stringify(next));
      } catch {}
    } catch (error) {
      $('cardsError').textContent = error.message;
    } finally { button.disabled = false; }
  }

  function defaultBolillero() {
    return {
      version:2, active:false, finished:false, mode:90, drawMode:'manual', interval:8, sound:true, paused:false,
      rules:{ ambo:false, line:true, secondLine:false, doubleLine:false, tripleLine:false, corners:false, bingo:true },
      order:[], drawn:[], reviewIndex:-1, lotCode:'', loadedCards:[], closedPrizes:[], lineClaims:[], createdAt:'', updatedAt:''
    };
  }
  function loadBolilleroState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return defaultBolillero();
      return { ...defaultBolillero(), ...parsed, rules:{ ...defaultBolillero().rules, ...(parsed.rules || {}) }, drawn:Array.isArray(parsed.drawn)?parsed.drawn:[], order:Array.isArray(parsed.order)?parsed.order:[], loadedCards:Array.isArray(parsed.loadedCards)?parsed.loadedCards:[], closedPrizes:Array.isArray(parsed.closedPrizes)?parsed.closedPrizes:[], lineClaims:Array.isArray(parsed.lineClaims)?parsed.lineClaims:[] };
    } catch { return defaultBolillero(); }
  }
  let bol = loadBolilleroState();
  function saveBol() {
    bol.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bol)); } catch {}
  }
  function shuffle(values) {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function setupModeUi() {
    const mode = Number($('bolMode').value) === 75 ? 75 : 90;
    $('bolRules90').classList.toggle('hidden', mode !== 90);
    $('bolRules75').classList.toggle('hidden', mode !== 75);
    $('bolIntervalField').classList.toggle('hidden', $('bolDrawMode').value !== 'automatic');
  }
  function resetSetupCards() {
    setupLoadedCards = [];
    setupLotCode = '';
    setupLoadSource = '';
    if ($('bolLotCode')) $('bolLotCode').value = '';
    updateSetupLoadedInfo();
  }
  function updateSetupLoadedInfo() {
    const info = $('bolSetupLoadedInfo');
    if (!info) return;
    if (!setupLoadedCards.length) {
      info.textContent = 'Opcional · podés usar el PDF de cartones';
      info.classList.remove('loaded');
      $('bolCardsLoadBtn').textContent = 'CARGAR CARTONES';
      return;
    }
    const mode = Number(setupLoadedCards[0]?.mode) === 75 ? 75 : 90;
    info.textContent = `✓ ${setupLoadedCards.length} cartones cargados · Bingo ${mode}`;
    info.classList.add('loaded');
    $('bolCardsLoadBtn').textContent = 'CAMBIAR CARTONES';
  }
  function flattenLot(lot) {
    return (lot?.series || []).flatMap(series => (series.cards || []).map(card => ({
      ...card,
      seriesNumber:Number(card.seriesNumber) || Number(series.number) || 1,
      cardNumber:Number(card.cardNumber) || 1,
      mode:Number(card.mode) === 75 ? 75 : 90,
      lotCode:String(lot.code || '')
    })));
  }
  function applyLoadedLot(lot, source = 'PDF') {
    const mode = Number(lot?.mode) === 75 ? 75 : Number(lot?.mode) === 90 ? 90 : 0;
    const cards = flattenLot(lot).filter(card => Array.isArray(card.grid) && card.grid.length);
    if (!mode || !cards.length) throw new Error('No encontramos cartones válidos en ese archivo.');
    if (cards.some(card => Number(card.mode) !== mode)) throw new Error('El archivo contiene cartones incompatibles.');
    setupLoadedCards = cards;
    setupLotCode = String(lot.code || '').trim().toUpperCase();
    setupLoadSource = source;
    $('bolMode').value = String(mode);
    setupModeUi();
    updateSetupLoadedInfo();
    $('bolLoadResult').textContent = `✓ ${cards.length} cartones cargados · Bingo ${mode}`;
    setTimeout(() => hide('bolCardsOverlay'), 350);
  }
  function decodeEmbeddedLot(token) {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - token.length % 4) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function loadLotByCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^LG-[A-Z0-9]{6}$/.test(normalized)) throw new Error('Ingresá un código de lote válido.');
    const lot = await api(`/api/community/cards/lot?lot=${encodeURIComponent(normalized)}`);
    applyLoadedLot(lot, 'LOTE');
  }
  async function loadPdfFile(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') throw new Error('Elegí un archivo PDF.');
    const buffer = await file.arrayBuffer();
    const raw = new TextDecoder('latin1').decode(buffer);
    const embedded = raw.match(/LA_GORDA_CARD_LOT_V1\n([A-Za-z0-9_-]+)\nLA_GORDA_CARD_LOT_END/);
    if (embedded) {
      applyLoadedLot(decodeEmbeddedLot(embedded[1]), 'PDF');
      return;
    }
    const legacyCode = raw.match(/Lote\s+(LG-[A-Z0-9]{6})/i)?.[1];
    if (legacyCode) {
      try { await loadLotByCode(legacyCode); return; }
      catch { throw new Error('El PDF es de una versión anterior y ese lote ya no está disponible. Generá un PDF nuevo.'); }
    }
    throw new Error('Este PDF no contiene cartones compatibles de EL BINGO DE LA GORDA.');
  }
  function openCardLoader() {
    $('bolLoadResult').textContent = setupLoadedCards.length ? `✓ ${setupLoadedCards.length} cartones ya cargados` : '';
    if ($('bolLotCode')) $('bolLotCode').value = setupLotCode || '';
    show('bolCardsOverlay');
  }
  function openBolillero(prefillLot = '') {
    bol = loadBolilleroState();
    resetSetupCards();
    if (bol.active) {
      $('bolResumeInfo').textContent = `Bingo ${bol.mode} · ${bol.drawn.length} bolilla${bol.drawn.length===1?'':'s'} salidas${bol.loadedCards.length?` · ${bol.loadedCards.length} cartones`:''}`;
      show('bolResumeBox');
    } else hide('bolResumeBox');
    setupModeUi();
    show('bolSetupOverlay');
    if (prefillLot) loadLotByCode(prefillLot).catch(error => toast(error.message));
  }
  function closeBolSetup() { hide('bolSetupOverlay'); hide('bolCardsOverlay'); }
  function readRules(mode) {
    if (mode === 75) return {
      ambo:false,
      line:$('bol75Line').checked,
      secondLine:false,
      doubleLine:$('bol75Double').checked,
      tripleLine:$('bol75Triple').checked,
      corners:$('bol75Corners').checked,
      bingo:$('bol75Bingo').checked
    };
    return {
      ambo:$('bol90Ambo').checked,
      line:$('bol90Line').checked,
      secondLine:$('bol90Second').checked,
      doubleLine:false,
      tripleLine:false,
      corners:false,
      bingo:$('bol90Bingo').checked
    };
  }
  function startBolillero() {
    const mode = Number($('bolMode').value) === 75 ? 75 : 90;
    const rules = readRules(mode);
    if (!Object.values(rules).some(Boolean)) return toast('Elegí al menos una jugada.');
    if (setupLoadedCards.length && Number(setupLoadedCards[0]?.mode) !== mode) return toast(`Los cartones cargados son de Bingo ${setupLoadedCards[0]?.mode}.`);
    const max = mode === 75 ? 75 : 90;
    bol = { ...defaultBolillero(), active:true, mode, drawMode:$('bolDrawMode').value === 'automatic'?'automatic':'manual', interval:Math.max(3,Math.min(30,Number($('bolInterval').value)||8)), sound:$('bolSoundStart').checked, rules, order:shuffle(Array.from({length:max},(_,i)=>i+1)), loadedCards:setupLoadedCards.map(card => ({...card})), lotCode:setupLotCode, reviewIndex:-1, createdAt:new Date().toISOString() };
    boardView = 'numbers';
    saveBol();
    hide('bolSetupOverlay');
    hide('bolCardsOverlay');
    setBolilleroScreen(true);
    renderBolillero();
    syncAutoTimer();
  }
  function resumeBolillero() {
    bol = loadBolilleroState();
    boardView = 'numbers';
    hide('bolSetupOverlay');
    setBolilleroScreen(true);
    renderBolillero();
    syncAutoTimer();
  }
  function discardBolillero() {
    if (!confirm('¿Descartar la partida de Bolillero guardada?')) return;
    stopAutoTimer();
    bol = defaultBolillero(); saveBol(); hide('bolResumeBox');
  }
  function stopAutoTimer() { if (autoTimer) clearInterval(autoTimer); autoTimer = null; }
  function syncAutoTimer() {
    stopAutoTimer();
    if (!bol.active || bol.finished || bol.paused || bol.drawMode !== 'automatic') return;
    autoTimer = setInterval(() => drawNext(), bol.interval * 1000);
  }
  function speak(text) {
    if (!bol.sound || !('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(String(text)); u.lang='es-AR'; u.rate=.9; speechSynthesis.speak(u); } catch {}
  }
  function drawNext() {
    if (!bol.active || bol.finished || bol.paused) return;
    const next = bol.order.find(number => !bol.drawn.includes(number));
    if (!next) { bol.finished = true; saveBol(); renderBolillero(); syncAutoTimer(); return; }
    bol.drawn.push(next); bol.reviewIndex = -1; saveBol(); renderBolillero(); speak(next);
  }
  function undoLast() {
    if (!bol.drawn.length || !confirm('¿Anular la última bolilla?')) return;
    bol.drawn.pop(); bol.reviewIndex = -1; saveBol(); renderBolillero();
  }
  function togglePause() { bol.paused = !bol.paused; saveBol(); renderBolillero(); syncAutoTimer(); }
  function toggleSound() { bol.sound = !bol.sound; if (!bol.sound && 'speechSynthesis' in window) speechSynthesis.cancel(); saveBol(); renderBolillero(); }
  async function toggleFullscreen() {
    try { if (!document.fullscreenElement) await $('bolilleroOverlay').requestFullscreen(); else await document.exitFullscreen(); } catch { toast('Pantalla completa no está disponible en este navegador.'); }
  }
  function review(delta) {
    if (!bol.drawn.length) return;
    const current = bol.reviewIndex < 0 ? bol.drawn.length - 1 : bol.reviewIndex;
    bol.reviewIndex = Math.max(0, Math.min(bol.drawn.length - 1, current + delta));
    if (bol.reviewIndex === bol.drawn.length - 1) bol.reviewIndex = -1;
    saveBol(); renderBolillero();
  }
  function backToNow() { bol.reviewIndex = -1; saveBol(); renderBolillero(); }
  function prizeLabel(type) {
    return ({ ambo:'AMBOCABEZA', line:'LÍNEA', secondLine:'2° LÍNEA', doubleLine:'DOBLE LÍNEA', tripleLine:'TRIPLE LÍNEA', corners:'4 ESQUINAS', bingo:'BINGO' })[type] || type.toUpperCase();
  }
  function prizeDisplayLabel(type) {
    return ({ ambo:'AMBO', line:'LÍNEA', secondLine:'2ª LÍNEA', doubleLine:'DOBLE LÍNEA', tripleLine:'TRIPLE LÍNEA', corners:'4 ESQUINAS', bingo:'BINGO' })[type] || prizeLabel(type);
  }
  function fitAnnouncementLabel(label) {
    const target = $('bolAnnouncementText');
    target.classList.remove('medium','long');
    if (label.length >= 12) target.classList.add('long');
    else if (label.length >= 8) target.classList.add('medium');
  }
  function enabledPrizeTypes() {
    const order = bol.mode === 75 ? ['line','doubleLine','tripleLine','corners','bingo'] : ['ambo','line','secondLine','bingo'];
    return order.filter(type => bol.rules[type]);
  }
  function ballClass(number) { return bol.drawn.includes(number) ? 'drawn' : ''; }
  function boardMarkup() {
    const max = bol.mode === 75 ? 75 : 90;
    if (boardView === 'exit') {
      return `<div class="bolExitGrid">${Array.from({length:max},(_,index)=>{const number=bol.drawn[index];return number==null?'<div class="bolExit empty"><small>—</small><b>—</b></div>':`<div class="bolExit"><small>${index+1}°</small><b>${number}</b></div>`}).join('')}</div>`;
    }
    return `<div class="bolNumberGrid">${Array.from({length:max},(_,i)=>i+1).map(number=>`<span class="bolNum ${ballClass(number)}">${number}</span>`).join('')}</div>`;
  }
  function setBoardView(next) {
    boardView = next === 'exit' ? 'exit' : 'numbers';
    renderBoard();
  }
  function renderBoard() {
    $('bolBoardNumbersBtn').classList.toggle('active', boardView === 'numbers');
    $('bolBoardExitBtn').classList.toggle('active', boardView === 'exit');
    const board = $('bolBoard');
    board.classList.toggle('mode75', Number(bol.mode) === 75);
    board.classList.toggle('mode90', Number(bol.mode) !== 75);
    board.innerHTML = boardMarkup();
  }
  function openBoard() { $('bolBoardPanel').classList.add('mobileOpen'); }
  function closeBoard() { $('bolBoardPanel').classList.remove('mobileOpen'); }
  function renderBolillero() {
    const viewedIndex = bol.reviewIndex < 0 ? bol.drawn.length - 1 : bol.reviewIndex;
    const current = viewedIndex >= 0 ? bol.drawn[viewedIndex] : '—';
    const isReview = bol.reviewIndex >= 0;
    $('bolModeLabel').textContent = `BINGO ${bol.mode}`;
    $('bolStateLabel').textContent = bol.finished ? 'FINALIZADO' : bol.paused ? 'PAUSADO' : bol.drawMode === 'automatic' ? 'AUTOMÁTICO' : 'MANUAL';
    $('bolCurrent').textContent = current;
    const totalBalls = Number(bol.mode) === 75 ? 75 : 90;
    $('bolOrderLabel').textContent = bol.drawn.length ? `Bolilla ${viewedIndex + 1} de ${totalBalls}${isReview?' · REVISANDO':''}` : `Bolilla 0 de ${totalBalls}`;
    $('bolBackNow').classList.toggle('hidden', !isReview);
    $('bolLastBalls').innerHTML = bol.drawn.slice(-8).reverse().map((n,index)=>`<span class="bolLast ${index===0&&!isReview?'current':''}">${n}</span>`).join('') || '<small>Esperando primera bolilla…</small>';
    renderBoard();
    $('bolLoadedInfo').textContent = bol.loadedCards.length ? `✓ ${bol.loadedCards.length} cartones cargados` : 'Sin cartones cargados';
    $('bolLoadedInfo').classList.toggle('loaded', bol.loadedCards.length > 0);
    renderLoadedAssistant();
    $('bolPrizeButtons').innerHTML = enabledPrizeTypes().map(type => `<button type="button" data-bol-claim="${type}" class="bolPrize ${bol.closedPrizes.includes(type)?'closed':''}" ${bol.closedPrizes.includes(type)?'disabled':''}>${bol.closedPrizes.includes(type)?'✓ ':''}${prizeLabel(type)}</button>`).join('');
    $('bolDrawBtn').disabled = bol.finished || bol.paused || bol.drawMode === 'automatic';
    $('bolDrawBtn').textContent = bol.finished ? 'PARTIDA FINALIZADA' : bol.drawMode === 'automatic' ? 'SORTEO AUTOMÁTICO' : 'SACAR BOLILLA';
    $('bolPauseBtn').textContent = bol.paused ? '▶ REANUDAR' : '⏸ PAUSA';
    $('bolPauseBtn').classList.toggle('manualHidden', bol.drawMode !== 'automatic');
    $('bolSoundBtn').classList.toggle('muted', !bol.sound);
    $('bolSoundBtn').setAttribute('aria-label', bol.sound ? 'Silenciar bolillas' : 'Activar voz de bolillas');
    $('bolSoundBtn').title = bol.sound ? 'Silenciar bolillas' : 'Activar voz de bolillas';
    document.querySelectorAll('[data-bol-claim]').forEach(btn => btn.onclick = () => announcePrize(btn.dataset.bolClaim));
  }

  function announcePrize(type) {
    if (!type || bol.finished) return;
    clearTimeout(announcementTimer);
    announcementType = type;
    announcementResumeAuto = bol.drawMode === 'automatic' && !bol.paused;
    if (announcementResumeAuto) { bol.paused = true; saveBol(); syncAutoTimer(); renderBolillero(); }
    const announcementLabel = prizeDisplayLabel(type);
    $('bolAnnouncementText').textContent = announcementLabel;
    fitAnnouncementLabel(announcementLabel);
    $('bolAnnouncementCheck').classList.toggle('hidden', bol.loadedCards.length === 0);
    show('bolAnnouncement');
    speak(announcementLabel);
    if (!bol.loadedCards.length) announcementTimer = setTimeout(() => closeAnnouncement(true), 1700);
  }
  function closeAnnouncement(resume = true) {
    clearTimeout(announcementTimer);
    hide('bolAnnouncement');
    if (resume && announcementResumeAuto && !bol.finished) {
      bol.paused = false; saveBol(); renderBolillero(); syncAutoTimer();
    }
    announcementType = '';
    announcementResumeAuto = false;
  }
  function checkAnnouncedPrize() {
    const type = announcementType;
    if (!type) return;
    closeAnnouncement(false);
    openClaim(type);
  }

  function cardNumbersLocal(card) {
    return (card.grid || []).flat().filter(Number.isFinite);
  }
  function lineDefinitionsLocal(card) {
    const grid = Array.isArray(card.grid) ? card.grid : [];
    if (Number(card.mode) === 90) return grid.map((row,index) => ({ key:`row-${index}`, values:(row || []).filter(Number.isFinite) }));
    const lines = [];
    for (let row = 0; row < 5; row++) lines.push({ key:`row-${row}`, values:(grid[row] || []).filter(Number.isFinite) });
    for (let col = 0; col < 5; col++) lines.push({ key:`col-${col}`, values:grid.map(row => row?.[col]).filter(Number.isFinite) });
    lines.push({ key:'diag-1', values:grid.map((row,i) => row?.[i]).filter(Number.isFinite) });
    lines.push({ key:'diag-2', values:grid.map((row,i) => row?.[4-i]).filter(Number.isFinite) });
    return lines;
  }
  function analyzeLoadedCard(card) {
    const drawn = new Set(bol.drawn);
    const numbers = cardNumbersLocal(card);
    const completeLines = lineDefinitionsLocal(card).filter(line => line.values.length && line.values.every(number => drawn.has(number)));
    const rows = Number(card.mode) === 90 ? (card.grid || []) : [];
    const hasAmbo = rows.some(row => {
      const values = (row || []).filter(Number.isFinite);
      return values.length === 5 && drawn.has(values[0]) && drawn.has(values.at(-1)) && values.slice(1,-1).every(number => !drawn.has(number));
    });
    const cornerValues = Number(card.mode) === 75 ? [card.grid?.[0]?.[0],card.grid?.[0]?.[4],card.grid?.[4]?.[0],card.grid?.[4]?.[4]].filter(Number.isFinite) : [];
    return {
      completeLines,
      hasAmbo,
      hasLine:completeLines.length >= 1,
      hasDoubleLine:Number(card.mode) === 75 && completeLines.length >= 2,
      hasTripleLine:Number(card.mode) === 75 && completeLines.length >= 3,
      hasCorners:cornerValues.length === 4 && cornerValues.every(number => drawn.has(number)),
      hasBingo:numbers.length > 0 && numbers.every(number => drawn.has(number)),
      missingNumbers:numbers.filter(number => !drawn.has(number)).slice(0,12),
      missingCorners:cornerValues.filter(number => !drawn.has(number))
    };
  }
  function loadedCardLabel(card) {
    return `Serie ${String(Number(card.seriesNumber) || 1).padStart(2,'0')} · Cartón ${String(Number(card.cardNumber) || 1).padStart(2,'0')}`;
  }
  function consumedLineKeysLocal(card) {
    return new Set(bol.lineClaims
      .filter(item => Number(item.seriesNumber) === Number(card.seriesNumber) && Number(item.cardNumber) === Number(card.cardNumber))
      .map(item => String(item.lineKey || ''))
      .filter(Boolean));
  }
  function missingForLineCountLocal(card, targetCount) {
    const drawn = new Set(bol.drawn);
    const definitions = lineDefinitionsLocal(card).map(line => new Set(line.values.filter(number => !drawn.has(number))));
    const needed = Math.max(1, Math.min(Number(targetCount) || 1, definitions.length));
    let best = Infinity;
    const visit = (start, chosen, union) => {
      if (chosen === needed) { best = Math.min(best, union.size); return; }
      if (union.size >= best) return;
      for (let index = start; index <= definitions.length - (needed - chosen); index++) {
        const next = new Set(union);
        for (const value of definitions[index]) next.add(value);
        visit(index + 1, chosen + 1, next);
      }
    };
    visit(0, 0, new Set());
    return Number.isFinite(best) ? best : 99;
  }
  function amboMissingLocal(card) {
    if (Number(card.mode) !== 90) return 99;
    const drawn = new Set(bol.drawn);
    let best = 99;
    for (const row of card.grid || []) {
      const values = (row || []).filter(Number.isFinite);
      if (values.length !== 5 || values.slice(1,-1).some(number => drawn.has(number))) continue;
      best = Math.min(best, Number(!drawn.has(values[0])) + Number(!drawn.has(values.at(-1))));
    }
    return best;
  }
  function progressForPrize(card, type) {
    const drawn = new Set(bol.drawn);
    const analysis = analyzeLoadedCard(card);
    let missing = 99;
    let lineKey = '';
    let missingNumbers = [];
    if (type === 'ambo') {
      missing = amboMissingLocal(card);
    } else if (type === 'line' || type === 'secondLine') {
      const consumed = consumedLineKeysLocal(card);
      const rows = lineDefinitionsLocal(card)
        .filter(line => !consumed.has(String(line.key)))
        .map(line => ({ ...line, missingNumbers:line.values.filter(number => !drawn.has(number)) }));
      rows.sort((a,b) => a.missingNumbers.length - b.missingNumbers.length);
      missing = rows.length ? rows[0].missingNumbers.length : 99;
      missingNumbers = rows[0]?.missingNumbers || [];
      if (missing === 0) lineKey = rows[0]?.key || '';
    } else if (type === 'doubleLine') {
      missing = Number(card.mode) === 75 ? missingForLineCountLocal(card, 2) : 99;
    } else if (type === 'tripleLine') {
      missing = Number(card.mode) === 75 ? missingForLineCountLocal(card, 3) : 99;
    } else if (type === 'corners') {
      const corners = Number(card.mode) === 75 ? [card.grid?.[0]?.[0],card.grid?.[0]?.[4],card.grid?.[4]?.[0],card.grid?.[4]?.[4]].filter(Number.isFinite) : [];
      missingNumbers = corners.filter(number => !drawn.has(number));
      missing = corners.length === 4 ? missingNumbers.length : 99;
    } else if (type === 'bingo') {
      missingNumbers = cardNumbersLocal(card).filter(number => !drawn.has(number));
      missing = missingNumbers.length;
    }
    return { type, missing, valid:missing === 0, lineKey, missingNumbers, analysis };
  }
  function activePrizeTypes() {
    return enabledPrizeTypes().filter(type => !bol.closedPrizes.includes(type));
  }
  function bestProgressForCard(card) {
    const priority = { bingo:0, tripleLine:1, doubleLine:2, corners:3, secondLine:4, line:5, ambo:6 };
    const rows = activePrizeTypes().map(type => progressForPrize(card, type));
    rows.sort((a,b) => a.missing - b.missing || (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
    return rows[0] || null;
  }
  function loadedCardRaceRows() {
    const priority = { bingo:0, tripleLine:1, doubleLine:2, corners:3, secondLine:4, line:5, ambo:6 };
    return bol.loadedCards.map((card,index) => ({ card, index, progress:bestProgressForCard(card) }))
      .filter(row => row.progress)
      .sort((a,b) => a.progress.missing - b.progress.missing || (priority[a.progress.type] ?? 9) - (priority[b.progress.type] ?? 9) || Number(a.card.seriesNumber)-Number(b.card.seriesNumber) || Number(a.card.cardNumber)-Number(b.card.cardNumber));
  }
  function progressText(progress) {
    if (!progress) return 'Sin premios pendientes';
    const label = prizeLabel(progress.type);
    if (progress.valid) return `✓ YA TIENE ${label}`;
    return `${progress.missing === 1 ? 'Falta' : 'Faltan'} ${progress.missing} para ${label}`;
  }
  function renderLoadedAssistant() {
    const panel = $('bolNearPanel');
    if (!panel) return;
    if (!bol.loadedCards.length || bol.finished || !activePrizeTypes().length) { panel.classList.add('hidden'); return; }
    const rows = loadedCardRaceRows();
    if (!rows.length) { panel.classList.add('hidden'); return; }
    const ready = rows.filter(row => row.progress.valid).length;
    $('bolNearStatus').textContent = ready ? `${ready} ${ready===1?'listo':'listos'}` : 'Control automático';
    $('bolNearList').innerHTML = rows.slice(0,3).map(row => `<button class="bolNearCard ${row.progress.valid?'ready':''}" type="button" data-bol-preview-index="${row.index}"><strong>${loadedCardLabel(row.card)}</strong><span>${progressText(row.progress)}</span></button>`).join('');
    panel.classList.remove('hidden');
    panel.querySelectorAll('[data-bol-preview-index]').forEach(button => button.onclick = () => openCardPreview(Number(button.dataset.bolPreviewIndex)));
  }
  function cardPreviewMarkup(card) {
    const drawn = new Set(bol.drawn);
    return (card.grid || []).flatMap(row => (row || []).map(value => {
      if (value == null) return '<span class="bolPreviewCell blank"></span>';
      if (value === 'LIBRE') return '<span class="bolPreviewCell free">★</span>';
      const number = Number(value);
      return `<span class="bolPreviewCell ${drawn.has(number)?'drawn':''}">${number}</span>`;
    })).join('');
  }
  function openCardPreview(index) {
    const card = bol.loadedCards[index];
    if (!card) return;
    const progress = bestProgressForCard(card);
    $('bolPreviewMeta').textContent = `${loadedCardLabel(card)} · Bingo ${card.mode}`;
    $('bolCardPreview').className = `bolCardPreview mode${Number(card.mode)===75?'75':'90'}`;
    $('bolCardPreview').innerHTML = cardPreviewMarkup(card);
    $('bolPreviewStatus').textContent = progress ? progressText(progress) : 'Partida finalizada';
    $('bolPreviewStatus').classList.toggle('ready', Boolean(progress?.valid));
    show('bolCardPreviewOverlay');
  }
  function closeCardPreview() { hide('bolCardPreviewOverlay'); }
  function claimCandidatesForType(type) {
    return bol.loadedCards.map((card,index) => ({ card, index, progress:progressForPrize(card,type) }))
      .sort((a,b) => Number(b.progress.valid)-Number(a.progress.valid) || a.progress.missing-b.progress.missing || Number(a.card.seriesNumber)-Number(b.card.seriesNumber) || Number(a.card.cardNumber)-Number(b.card.cardNumber));
  }
  function selectClaimCandidate(index, verify = true) {
    const card = bol.loadedCards[index];
    if (!card) return;
    $('claimSeries').value = String(Number(card.seriesNumber));
    updateClaimCards();
    $('claimCard').value = String(Number(card.cardNumber));
    if (verify) validateLoadedClaim();
  }
  function renderClaimCandidates() {
    const wrap = $('claimCandidatesWrap');
    if (!wrap || !bol.loadedCards.length || !claimType) { wrap?.classList.add('hidden'); return; }
    const rows = claimCandidatesForType(claimType);
    const validCount = rows.filter(row => row.progress.valid).length;
    const shown = (validCount ? rows.filter(row => row.progress.valid) : rows).slice(0,6);
    $('claimCandidatesTitle').textContent = validCount ? 'POSIBLES GANADORES' : 'MÁS CERCANOS';
    $('claimCandidatesCount').textContent = validCount ? `${validCount} ${validCount===1?'cartón':'cartones'}` : '';
    $('claimCandidates').innerHTML = shown.map(row => `<button type="button" class="claimCandidate ${row.progress.valid?'ready':''}" data-claim-card-index="${row.index}"><strong>${loadedCardLabel(row.card)}</strong><span>${progressText(row.progress)}</span></button>`).join('');
    wrap.classList.toggle('hidden', shown.length === 0);
    wrap.querySelectorAll('[data-claim-card-index]').forEach(button => button.onclick = () => selectClaimCandidate(Number(button.dataset.claimCardIndex), true));
  }

  function openClaim(type) {
    claimType = type;
    bol.paused = true; saveBol(); syncAutoTimer(); renderBolillero();
    $('claimTitle').textContent = `${prizeDisplayLabel(type)} CANTADO`;
    $('claimHint').textContent = bol.loadedCards.length ? 'Elegí el cartón para comprobarlo.' : 'Revisá el cartón y confirmá si el canto es válido.';
    $('claimManualActions').classList.toggle('hidden', bol.loadedCards.length > 0);
    $('claimLoadedActions').classList.toggle('hidden', bol.loadedCards.length === 0);
    $('claimResult').textContent = '';
    if (bol.loadedCards.length) {
      const series = [...new Set(bol.loadedCards.map(card => Number(card.seriesNumber)))].sort((a,b)=>a-b);
      $('claimSeries').innerHTML = series.map(n=>`<option value="${n}">Serie ${String(n).padStart(2,'0')}</option>`).join('');
      updateClaimCards();
      renderClaimCandidates();
    }
    show('bolClaimOverlay');
  }
  function updateClaimCards() {
    const series = Number($('claimSeries').value);
    const cards = bol.loadedCards.filter(card => Number(card.seriesNumber)===series);
    $('claimCard').innerHTML = cards.map(card=>`<option value="${card.cardNumber}">Cartón ${String(card.cardNumber).padStart(2,'0')}</option>`).join('');
  }
  function closeClaim(resume=true) {
    hide('bolClaimOverlay'); claimType='';
    if (resume && !bol.finished) bol.paused=false;
    saveBol(); renderBolillero(); syncAutoTimer();
  }
  function confirmManualClaim(valid) {
    if (!valid) return closeClaim(true);
    confirmPrizeValid(null, '');
  }
  function validateLoadedClaim() {
    const series = Number($('claimSeries').value), cardNumber = Number($('claimCard').value);
    const card = bol.loadedCards.find(item => Number(item.seriesNumber)===series && Number(item.cardNumber)===cardNumber);
    if (!card) return;
    const progress = progressForPrize(card, claimType);
    if (!progress.valid) {
      const missing = progress.missingNumbers.length && progress.missingNumbers.length <= 12
        ? ` Faltan: ${progress.missingNumbers.join(', ')}.`
        : Number.isFinite(progress.missing) && progress.missing < 99
          ? ` Faltan ${progress.missing}.`
          : '';
      $('claimResult').innerHTML = `<b class="invalid">✕ NO ES VÁLIDO</b><span>Ese cartón todavía no completó esta jugada.${missing}</span>`;
      speak('No es válido');
      return;
    }
    $('claimResult').innerHTML = `<b class="valid">✓ ${prizeDisplayLabel(claimType)} VÁLIDO</b><span>${loadedCardLabel(card)}</span>`;
    confirmPrizeValid(card, progress.lineKey || '');
  }
  function confirmPrizeValid(card, detail) {
    if (claimType === 'line' || claimType === 'secondLine') {
      if (card && detail) bol.lineClaims.push({ seriesNumber:card.seriesNumber, cardNumber:card.cardNumber, lineKey:detail, prize:claimType, at:new Date().toISOString() });
    }
    if (!bol.closedPrizes.includes(claimType)) bol.closedPrizes.push(claimType);
    if (claimType === 'bingo') bol.finished = true;
    saveBol();
    setTimeout(() => closeClaim(!bol.finished), 900);
  }
  function newBolillero() {
    if (bol.active && bol.drawn.length && !confirm('¿Empezar una nueva partida? Se borrará el sorteo actual de este dispositivo.')) return;
    stopAutoTimer(); closeBoard(); closeAnnouncement(false); closeCardPreview(); bol=defaultBolillero(); saveBol(); setBolilleroScreen(false); openBolillero();
  }

  function bind() {
    const fullscreenRoot = $('bolilleroOverlay');
    for (const modalId of ['bolClaimOverlay','bolCardPreviewOverlay']) {
      const modal = $(modalId);
      if (fullscreenRoot && modal && modal.parentElement !== fullscreenRoot) fullscreenRoot.appendChild(modal);
    }
    $('cardsToolBtn')?.addEventListener('click', openCards);
    $('bolilleroToolBtn')?.addEventListener('click', () => openBolillero());
    $('closeCardsBtn')?.addEventListener('click', closeCards);
    $('cardsMode')?.addEventListener('change', updateCardsSummary);
    $('cardsSeries')?.addEventListener('change', updateCardsSummary);
    $('cardsGenerateBtn')?.addEventListener('click', generateCards);
    $('cardsLoadBolillero')?.addEventListener('click', () => {
      closeCards(); openBolillero();
      try {
        if (cardLot && cardLot.code === $('cardsLoadBolillero').dataset.lot) applyLoadedLot(cardLot, 'LOTE');
        else loadLotByCode($('cardsLoadBolillero').dataset.lot).catch(error => toast(error.message));
      } catch (error) { toast(error.message); }
    });
    $('closeBolSetupBtn')?.addEventListener('click', closeBolSetup);
    $('bolMode')?.addEventListener('change', setupModeUi);
    $('bolDrawMode')?.addEventListener('change', setupModeUi);
    $('bolCardsLoadBtn')?.addEventListener('click', openCardLoader);
    $('closeBolCardsBtn')?.addEventListener('click', () => hide('bolCardsOverlay'));
    $('bolPdfChooseBtn')?.addEventListener('click', () => $('bolPdfInput').click());
    $('bolPdfInput')?.addEventListener('change', async event => {
      try { $('bolLoadResult').textContent = 'Cargando…'; await loadPdfFile(event.target.files?.[0]); }
      catch (error) { $('bolLoadResult').textContent = ''; toast(error.message); }
      finally { event.target.value = ''; }
    });
    $('bolLotLoadBtn')?.addEventListener('click', async () => {
      try { $('bolLoadResult').textContent = 'Cargando…'; await loadLotByCode($('bolLotCode').value); }
      catch (error) { $('bolLoadResult').textContent = ''; toast(error.message); }
    });
    $('bolStartBtn')?.addEventListener('click', startBolillero);
    $('bolResumeBtn')?.addEventListener('click', resumeBolillero);
    $('bolDiscardBtn')?.addEventListener('click', discardBolillero);
    $('bolDrawBtn')?.addEventListener('click', drawNext);
    $('bolPauseBtn')?.addEventListener('click', togglePause);
    $('bolSoundBtn')?.addEventListener('click', toggleSound);
    $('bolFullBtn')?.addEventListener('click', toggleFullscreen);
    $('bolUndoBtn')?.addEventListener('click', undoLast);
    $('bolPrevBtn')?.addEventListener('click', () => review(-1));
    $('bolNextBtn')?.addEventListener('click', () => review(1));
    $('bolBackNow')?.addEventListener('click', backToNow);
    $('bolTableBtn')?.addEventListener('click', openBoard);
    $('bolBoardClose')?.addEventListener('click', closeBoard);
    $('bolBoardNumbersBtn')?.addEventListener('click', () => setBoardView('numbers'));
    $('bolBoardExitBtn')?.addEventListener('click', () => setBoardView('exit'));
    $('bolNewBtn')?.addEventListener('click', newBolillero);
    $('bolCloseBtn')?.addEventListener('click', () => { stopAutoTimer(); closeBoard(); closeAnnouncement(false); closeCardPreview(); setBolilleroScreen(false); });
    $('bolAnnouncementClose')?.addEventListener('click', () => closeAnnouncement(true));
    $('bolAnnouncementCheck')?.addEventListener('click', checkAnnouncedPrize);
    $('claimSeries')?.addEventListener('change', updateClaimCards);
    $('claimCheckBtn')?.addEventListener('click', validateLoadedClaim);
    $('claimValidBtn')?.addEventListener('click', () => confirmManualClaim(true));
    $('claimInvalidBtn')?.addEventListener('click', () => confirmManualClaim(false));
    $('claimCloseBtn')?.addEventListener('click', () => closeClaim(true));
    $('bolPreviewCloseBtn')?.addEventListener('click', closeCardPreview);
    $('bolPreviewDoneBtn')?.addEventListener('click', closeCardPreview);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('bolilleroOverlay')?.classList.contains('hidden')) syncAutoTimer(); });
  }
  window.addEventListener('DOMContentLoaded', bind);
})();
