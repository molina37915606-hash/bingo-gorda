'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const port = 57000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-title-v7-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT:String(port), BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, PUBLIC_URL:base, MASTER_ADMIN_PASSWORD:'', ADMIN_PASSWORD:'' },
  stdio: ['ignore','pipe','pipe']
});
const wait = ms => new Promise(r => setTimeout(r, ms));
async function waitServer(){ for(let i=0;i<150;i++){ try{ if((await fetch(base+'/healthz')).ok) return; }catch{} await wait(40); } throw new Error('No inició el servidor'); }

(async()=>{
  try {
    const html = fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
    const tools = fs.readFileSync(path.join(root,'js','community-tools.js'),'utf8');
    assert(html.includes('id="cardsTitle"') && html.includes('id="bolTitle"'), 'Deben existir los dos campos de nombre opcional.');
    assert((html.match(/maxlength="24"/g)||[]).length >= 2, 'Los nombres deben limitarse a 24 caracteres.');
    assert(html.includes('id="bolCustomTitle"'), 'El encabezado del bolillero debe tener título dinámico.');
    assert(html.includes('.bolTop::before{display:none!important}'), 'Debe quitarse la placa decorativa detrás del nombre superior.');
    assert(html.includes('@keyframes bolDrawShake') && html.includes('.bolCurrent.bolDrawnAnim'), 'La bolilla debe tener animación de sacudida/rebote.');
    assert(tools.includes('animateCurrentBall()') && tools.includes("ball.classList.add('bolDrawnAnim')"), 'Cada extracción debe disparar la animación.');
    assert(tools.includes("$('bolCustomTitle').textContent = cleanEventTitle(bol.title) || 'EL BINGO DE LA GORDA'"), 'El bolillero debe mostrar el nombre personalizado con fallback.');

    await waitServer();
    const response = await fetch(base+'/api/community/cards/generate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mode:90,seriesCount:1,title:'  BINGO   DE LA   FAMILIA  '})
    });
    assert(response.ok, `No se pudo generar el lote: ${response.status}`);
    const lot = await response.json();
    assert.equal(lot.title, 'BINGO DE LA FAMILIA');
    assert(lot.title.length <= 24);

    const loaded = await fetch(base+`/api/community/cards/lot?lot=${encodeURIComponent(lot.code)}`);
    assert(loaded.ok);
    const loadedLot = await loaded.json();
    assert.equal(loadedLot.title, 'BINGO DE LA FAMILIA', 'El título debe persistir con el lote y viajar dentro del PDF.');

    const pdfRes = await fetch(base+lot.downloadUrl);
    assert(pdfRes.ok && /application\/pdf/i.test(pdfRes.headers.get('content-type')||''));
    const disposition = pdfRes.headers.get('content-disposition') || '';
    assert(/BINGO_DE_LA_FAMILIA_BINGO_90_LG-/i.test(disposition), `Nombre de archivo inesperado: ${disposition}`);
    const pdfText = Buffer.from(await pdfRes.arrayBuffer()).toString('latin1');
    assert(pdfText.includes('BINGO DE LA FAMILIA'), 'El título personalizado debe imprimirse en los cartones.');
    assert(pdfText.includes('LA_GORDA_CARD_LOT_V1'), 'El PDF debe seguir siendo autocontenido para el bolillero.');

    console.log('PRUEBA V7 BOLILLERO + TÍTULO PDF: OK · animación + cabecera limpia + nombre opcional 24 caracteres');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
})();
