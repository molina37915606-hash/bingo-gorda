'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(ROOT).filter(name => name.endsWith('.html'));
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(name => name.endsWith('.js')).map(name => path.join('js', name));
const sourceFiles = [...htmlFiles, ...jsFiles, 'server.js'];

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));

for (const required of ['admin-principal.html','admin.html','jugador.html','comunidad.html','transmision.html','server.js','package.json']) {
  assert(exists(required), `Falta archivo principal: ${required}`);
}

const obsoleteNotes = fs.readdirSync(ROOT).filter(name => /_2026-\d{2}-\d{2}\.txt$/i.test(name));
assert.deepEqual(obsoleteNotes, [], `Quedaron notas históricas sueltas: ${obsoleteNotes.join(', ')}`);

const allSource = sourceFiles.map(rel => read(rel)).join('\n');
assert(!/transmission\s*\.\s*enabled/.test(allSource), 'Quedó una referencia al viejo transmission.enabled.');
assert(!/transmission\s*:\s*\{\s*enabled\s*:/.test(allSource), 'Quedó una configuración antigua de transmisión opcional.');

assert(!/\b(?:vivi|josu|daia)\b/i.test(allSource), 'Quedaron referencias a presentadores eliminados.');
assert(!/api\/player\/presenter/.test(allSource), 'Quedó la API antigua para cambiar de presentador.');
assert(!/reglamento\.pdf/i.test(allSource), 'Quedó una referencia al PDF antiguo del reglamento.');
assert(!exists('reglamento.pdf'), 'El PDF antiguo del reglamento todavía existe.');
for (const removed of ['assets/vivi.png','assets/josu.png','assets/daia.png']) assert(!exists(removed), `Quedó un asset de presentador eliminado: ${removed}`);

const localAssetRefs = new Set();
for (const rel of sourceFiles) {
  const text = read(rel);
  for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    let ref = match[1].split(/[?#]/)[0];
    if (!ref || ref.includes('${') || /^(?:https?:|data:|mailto:|javascript:|#)/i.test(ref)) continue;
    if (ref.startsWith('/')) ref = ref.slice(1);
    if (!/\.(?:js|css|png|jpe?g|webp|pdf|html)$/i.test(ref)) continue;
    localAssetRefs.add(ref);
  }
  for (const match of text.matchAll(/["'`](assets\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp))["'`]/g)) {
    if (!match[1].includes('${')) localAssetRefs.add(match[1]);
  }
}
for (const ref of localAssetRefs) assert(exists(ref), `Referencia local rota: ${ref}`);

const envExample = read('.env.example');
assert(envExample.includes('BINGO_CLAIM_WINDOW_MS='), 'Falta BINGO_CLAIM_WINDOW_MS en .env.example.');
assert(!envExample.includes('BINGO_CLAIM_AUDIT_WINDOW_MS='), 'Quedó el nombre antiguo BINGO_CLAIM_AUDIT_WINDOW_MS.');

console.log(`AUDITORÍA ESTRUCTURAL: OK · ${localAssetRefs.size} referencias locales verificadas`);
