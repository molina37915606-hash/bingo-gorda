'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DEPLOY_DIR = path.join(ROOT, '.v6-deploy');
const EXPECTED_XZ_SHA = '7e7e021dc1014e718432709f874c5214706401b97a16fb7b1536af490b7decb8';
const EXPECTED_DIFF_SHA = '5e4316bed451066594bf7c853a4c32fac0eab1ec33ef0e0ecffff0f8d01b3f1b';
const V6_PACKAGE = `{
  "name": "el-bingo-de-la-gorda",
  "version": "1.0.0",
  "private": true,
  "description": "EL BINGO DE LA GORDA: software web gratuito para crear y administrar partidas recreativas de Bingo, con cartones, transmisión, actas, recuperación y Comunidad.",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "start": "node server.js",
    "test": "node tests/access-forms.js && node tests/admin-contingency.js && node tests/admin-simulation.js && node tests/alfa-core.js && node tests/alpha5-start.js && node tests/alpha6-security.js && node tests/beta-stability.js && node tests/claim-screen-final-2025.js && node tests/community-admin-beta.js && node tests/community-schedule-final.js && node tests/cuasifinal-ui.js && node tests/demo-unified.js && node tests/functional-invite.js && node tests/functional-polish-514.js && node tests/functional-ui.js && node tests/general-link-community.js && node tests/line-queue-90.js && node tests/mobile-chat-drag.js && node tests/mobile-player-polish.js && node tests/mobile-player-redesign.js && node tests/preview-unified.js && node tests/prize-autofocus-515.js && node tests/restart-recovery.js && node tests/scheduled-auto-start.js && node tests/simulation-stress.js && node tests/transmission-tv-stability.js && node tests/tv-safe-view.js && node tests/session-priority-wakelock.js && node tests/multisala-history.js && node tests/community-public-room.js && node tests/community-public-10.js && node tests/transmission-mobile-landscape.js && node tests/community-public-cancel.js && node tests/community-lobby-types.js && node tests/automatic-claims-ties.js && node tests/player-ad-banner.js && node tests/free-only-cleanup.js",
    "test:mobile": "node tests/mobile-player-redesign.js && node tests/mobile-player-polish.js"
  }
}
`;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function fail(message, details = '') {
  console.error(`[V6] ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: options.encoding === undefined ? 'utf8' : options.encoding,
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
    stdio: options.stdio || ['pipe', 'pipe', 'pipe']
  });
  if (result.error) fail(`No se pudo ejecutar ${command}.`, result.error.message);
  return result;
}

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const serverText = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  if (String(pkg.description || '').includes('software web gratuito') && serverText.includes('pre-free-v6')) {
    console.log('[V6] La plataforma ya está en V6 free-only.');
    process.exit(0);
  }
} catch {}

if (!fs.existsSync(DEPLOY_DIR)) fail('Falta el paquete de instalación .v6-deploy.');
const parts = fs.readdirSync(DEPLOY_DIR).filter(name => /^part\d+$/.test(name)).sort();
if (!parts.length) fail('No se encontraron partes del paquete V6.');
const encoded = parts.map(name => fs.readFileSync(path.join(DEPLOY_DIR, name), 'utf8')).join('');
let xz;
try { xz = Buffer.from(encoded, 'base64'); }
catch (error) { fail('No se pudo reconstruir el paquete V6.', error.message); }
if (sha256(xz) !== EXPECTED_XZ_SHA) fail('La firma del paquete V6 no coincide.');

const tmpXz = path.join(os.tmpdir(), `bingo-v6-${process.pid}.diff.xz`);
const tmpDiff = path.join(os.tmpdir(), `bingo-v6-${process.pid}.diff`);
fs.writeFileSync(tmpXz, xz);
const unzip = run('xz', ['-dc', tmpXz], { encoding: null });
if (unzip.status !== 0) fail('No se pudo descomprimir la actualización V6.', String(unzip.stderr || ''));
const diff = Buffer.from(unzip.stdout || Buffer.alloc(0));
if (sha256(diff) !== EXPECTED_DIFF_SHA) fail('La firma del diff V6 no coincide.');
fs.writeFileSync(tmpDiff, diff);

const applyArgs = ['apply', '-p1', '--exclude=README.md', '--exclude=package.json', tmpDiff];
const check = run('git', ['apply', '--check', '-p1', '--exclude=README.md', '--exclude=package.json', tmpDiff]);
if (check.status !== 0) fail('La actualización V6 no puede aplicarse de forma segura.', check.stderr || check.stdout || '');
const apply = run('git', applyArgs);
if (apply.status !== 0) fail('Falló la aplicación de V6.', apply.stderr || apply.stdout || '');

fs.writeFileSync(path.join(ROOT, 'package.json'), V6_PACKAGE, 'utf8');

const serverAfter = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
if (!serverAfter.includes('pre-free-v6')) fail('V6 se aplicó pero no pasó la verificación final del backend.');
if (!fs.existsSync(path.join(ROOT, 'tests', 'free-only-cleanup.js'))) fail('Falta la prueba free-only de V6.');

try { fs.rmSync(tmpXz, { force: true }); } catch {}
try { fs.rmSync(tmpDiff, { force: true }); } catch {}
console.log('[V6] Actualización free-only aplicada correctamente.');
