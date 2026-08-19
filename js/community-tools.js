'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'el_bingo_de_la_gorda_bolillero_v1';
  let cardLot = null;
  let autoTimer = null;
  let claimType = '';

  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials:'same-origin', headers:{ 'Content-Type':'application/json', ...(options.headers || {}) }, ...options });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(data?.error || `Error ${response.status}`);
    return data;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
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
      version:1, active:false, finished:false, mode:90, drawMode:'manual', interval:8, sound:true, paused:false,
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
  }
  function openBolillero(prefillLot = '') {
    bol = loadBolilleroState();
    if (bol.active) {
      $('bolResumeInfo').textContent = `Bingo ${bol.mode} · ${bol.drawn.length} bolilla${bol.drawn.length===1?'':'s'} salidas${bol.lotCode?` · Lote ${bol.lotCode}`:''}`;
      show('bolResumeBox');
    } else hide('bolResumeBox');
    if (prefillLot) $('bolLotCode').value = prefillLot;
    setupModeUi();
    show('bolSetupOverlay');
  }
  function closeBolSetup() { hide('bolSetupOverlay'); }
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
  function updateBolLoadScopeUi() {
    const scope = $('bolLoadScope')?.value || 'lot';
    $('bolLoadSeriesField')?.classList.toggle('hidden', scope === 'lot');
    $('bolLoadCardField')?.classList.toggle('hidden', scope !== 'card');
  }
  async function startBolillero() {
    const mode = Number($('bolMode').value) === 75 ? 75 : 90;
    const rules = readRules(mode);
    if (!Object.values(rules).some(Boolean)) return toast('Elegí al menos una jugada.');
    let loadedCards = [];
    let lotCode = $('bolLotCode').value.trim().toUpperCase();
    if (lotCode) {
      try {
        const lot = await api(`/api/community/cards/lot?lot=${encodeURIComponent(lotCode)}`);
        if (Number(lot.mode) !== mode) throw new Error(`Ese lote es de Bingo ${lot.mode}.`);
        const allCards = (lot.series || []).flatMap(series => (series.cards || []).map(card => ({ ...card, lotCode:lot.code })));
        const scope = $('bolLoadScope').value || 'lot';
        const wantedSeries = Math.max(1, Number($('bolLoadSeries').value) || 1);
        const wantedCard = Math.max(1, Number($('bolLoadCard').value) || 1);
        loadedCards = scope === 'series' ? allCards.filter(card => Number(card.seriesNumber) === wantedSeries) : scope === 'card' ? allCards.filter(card => Number(card.seriesNumber) === wantedSeries && Number(card.cardNumber) === wantedCard) : allCards;
        if (!loadedCards.length) throw new Error('No encontramos esa serie o cartón dentro del lote.');
        lotCode = lot.code;
      } catch (error) { return toast(error.message); }
    }
    const max = mode === 75 ? 75 : 90;
    bol = { ...defaultBolillero(), active:true, mode, drawMode:$('bolDrawMode').value === 'automatic'?'automatic':'manual', interval:Math.max(3,Math.min(30,Number($('bolInterval').value)||8)), sound:$('bolSoundStart').checked, rules, order:shuffle(Array.from({length:max},(_,i)=>i+1)), loadedCards, lotCode, reviewIndex:-1, createdAt:new Date().toISOString() };
    saveBol();
    hide('bolSetupOverlay');
    show('bolilleroOverlay');
    renderBolillero();
    syncAutoTimer();
  }
  function resumeBolillero() {
    bol = loadBolilleroState();
    hide('bolSetupOverlay');
    show('bolilleroOverlay');
    renderBolillero();
    syncAutoTimer();
  }
  function discardBolillero() {
    if (!confirm('¿Descartar la partida de Bolillero guardada?')) return;
    clearInterval(autoTimer); autoTimer = null;
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
  function enabledPrizeTypes() {
    const order = bol.mode === 75 ? ['line','doubleLine','tripleLine','corners','bingo'] : ['ambo','line','secondLine','bingo'];
    return order.filter(type => bol.rules[type]);
  }
  function ballClass(number) { return bol.drawn.includes(number) ? 'drawn' : ''; }
  function boardMarkup() {
    const max = bol.mode === 75 ? 75 : 90;
    if (bol.mode === 75) {
      const columns = [1,16,31,46,61].map((start,index) => `<div class="bolCol"><b>${'BINGO'[index]}</b>${Array.from({length:15},(_,i)=>start+i).map(n=>`<span class="bolNum ${ballClass(n)}">${n}</span>`).join('')}</div>`).join('');
      return `<div class="bolBoard75">${columns}</div>`;
    }
    return `<div class="bolBoard90">${Array.from({length:max},(_,i)=>i+1).map(n=>`<span class="bolNum ${ballClass(n)}">${n}</span>`).join('')}</div>`;
  }
  function renderBolillero() {
    const viewedIndex = bol.reviewIndex < 0 ? bol.drawn.length - 1 : bol.reviewIndex;
    const current = viewedIndex >= 0 ? bol.drawn[viewedIndex] : '—';
    const isReview = bol.reviewIndex >= 0;
    $('bolModeLabel').textContent = `BINGO ${bol.mode}`;
    $('bolStateLabel').textContent = bol.finished ? 'FINALIZADO' : bol.paused ? 'PAUSADO' : bol.drawMode === 'automatic' ? 'AUTOMÁTICO' : 'MANUAL';
    $('bolCurrent').textContent = current;
    $('bolOrderLabel').textContent = bol.drawn.length ? `Salida ${viewedIndex + 1} de ${bol.drawn.length}${isReview?' · REVISANDO':''}` : 'Todavía no salió ninguna bolilla';
    $('bolBackNow').classList.toggle('hidden', !isReview);
    $('bolLastBalls').innerHTML = bol.drawn.slice(-8).reverse().map((n,index)=>`<span class="bolLast ${index===0&&!isReview?'current':''}">${n}</span>`).join('') || '<small>Esperando primera bolilla…</small>';
    $('bolBoard').innerHTML = boardMarkup();
    $('bolLoadedInfo').textContent = bol.loadedCards.length ? `${bol.loadedCards.length} cartones controlados · ${bol.lotCode}` : 'Sin cartones cargados';
    $('bolPrizeButtons').innerHTML = enabledPrizeTypes().map(type => `<button type="button" data-bol-claim="${type}" class="bolPrize ${bol.closedPrizes.includes(type)?'closed':''}" ${bol.closedPrizes.includes(type)?'disabled':''}>${bol.closedPrizes.includes(type)?'✓ ':''}${prizeLabel(type)}</button>`).join('');
    $('bolDrawBtn').disabled = bol.finished || bol.paused || bol.drawMode === 'automatic';
    $('bolDrawBtn').textContent = bol.finished ? 'PARTIDA FINALIZADA' : bol.drawMode === 'automatic' ? 'SORTEO AUTOMÁTICO' : 'SACAR BOLILLA';
    $('bolPauseBtn').textContent = bol.paused ? '▶ REANUDAR' : '⏸ PAUSA';
    $('bolSoundBtn').textContent = bol.sound ? '🔊' : '🔇';
    document.querySelectorAll('[data-bol-claim]').forEach(btn => btn.onclick = () => openClaim(btn.dataset.bolClaim));
  }
  function openClaim(type) {
    claimType = type;
    bol.paused = true; saveBol(); syncAutoTimer(); renderBolillero();
    $('claimTitle').textContent = `${prizeLabel(type)} CANTADO`;
    $('claimHint').textContent = bol.loadedCards.length ? 'Elegí el cartón para comprobarlo automáticamente.' : 'Revisá el cartón y confirmá si el canto es válido.';
    $('claimManualActions').classList.toggle('hidden', bol.loadedCards.length > 0);
    $('claimLoadedActions').classList.toggle('hidden', bol.loadedCards.length === 0);
    $('claimResult').textContent = '';
    if (bol.loadedCards.length) {
      const series = [...new Set(bol.loadedCards.map(card => card.seriesNumber))];
      $('claimSeries').innerHTML = series.map(n=>`<option value="${n}">Serie ${String(n).padStart(2,'0')}</option>`).join('');
      updateClaimCards();
    }
    show('bolClaimOverlay'); speak(prizeLabel(type));
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
  async function validateLoadedClaim() {
    const series = Number($('claimSeries').value), cardNumber = Number($('claimCard').value);
    const card = bol.loadedCards.find(item => Number(item.seriesNumber)===series && Number(item.cardNumber)===cardNumber);
    if (!card) return;
    try {
      $('claimCheckBtn').disabled = true;
      const consumedLineKeys = bol.lineClaims.filter(item => Number(item.seriesNumber)===series && Number(item.cardNumber)===cardNumber).map(item=>item.lineKey);
      const result = await api('/api/community/cards/validate',{method:'POST',body:JSON.stringify({lot:bol.lotCode,seriesNumber:series,cardNumber,type:claimType,drawn:bol.drawn,consumedLineKeys})});
      if (!result.valid) {
        const missing = Array.isArray(result.missingNumbers)&&result.missingNumbers.length ? ` Faltan: ${result.missingNumbers.join(', ')}.` : '';
        $('claimResult').innerHTML = `<b class="invalid">✕ NO ES VÁLIDO</b><span>Ese cartón todavía no completó esta jugada.${missing}</span>`;
        speak('No es válido'); return;
      }
      $('claimResult').innerHTML = `<b class="valid">✓ ${prizeLabel(claimType)} VÁLIDO</b><span>Serie ${String(series).padStart(2,'0')} · Cartón ${String(cardNumber).padStart(2,'0')}</span>`;
      confirmPrizeValid(card, result.lineKey||'');
    } catch(error) { toast(error.message); } finally { $('claimCheckBtn').disabled = false; }
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
    stopAutoTimer(); bol=defaultBolillero(); saveBol(); hide('bolilleroOverlay'); openBolillero();
  }

  function bind() {
    $('cardsToolBtn')?.addEventListener('click', openCards);
    $('bolilleroToolBtn')?.addEventListener('click', () => openBolillero());
    $('closeCardsBtn')?.addEventListener('click', closeCards);
    $('cardsMode')?.addEventListener('change', updateCardsSummary);
    $('cardsSeries')?.addEventListener('change', updateCardsSummary);
    $('cardsGenerateBtn')?.addEventListener('click', generateCards);
    $('cardsLoadBolillero')?.addEventListener('click', () => { const lot=$('cardsLoadBolillero').dataset.lot; closeCards(); $('bolLotCode').value=lot; openBolillero(lot); });
    $('closeBolSetupBtn')?.addEventListener('click', closeBolSetup);
    $('bolMode')?.addEventListener('change', setupModeUi);
    $('bolLoadScope')?.addEventListener('change', updateBolLoadScopeUi);
    updateBolLoadScopeUi();
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
    $('bolNewBtn')?.addEventListener('click', newBolillero);
    $('bolCloseBtn')?.addEventListener('click', () => { stopAutoTimer(); hide('bolilleroOverlay'); });
    $('claimSeries')?.addEventListener('change', updateClaimCards);
    $('claimCheckBtn')?.addEventListener('click', validateLoadedClaim);
    $('claimValidBtn')?.addEventListener('click', () => confirmManualClaim(true));
    $('claimInvalidBtn')?.addEventListener('click', () => confirmManualClaim(false));
    $('claimCloseBtn')?.addEventListener('click', () => closeClaim(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('bolilleroOverlay')?.classList.contains('hidden')) syncAutoTimer(); });
  }
  window.addEventListener('DOMContentLoaded', bind);
})();
