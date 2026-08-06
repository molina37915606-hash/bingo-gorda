'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { URL } = require('url');
const { exec } = require('child_process');
const { AsyncLocalStorage } = require('async_hooks');

// Carga opcional de .env para uso local. En Render las variables se configuran
// desde el panel del servicio y tienen prioridad sobre este archivo.
const LOCAL_ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(LOCAL_ENV_FILE)) {
  for (const rawLine of fs.readFileSync(LOCAL_ENV_FILE, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const ROOT = __dirname;
const DATA_DIR = process.env.BINGO_DATA_DIR ? path.resolve(process.env.BINGO_DATA_DIR) : path.join(ROOT, 'data');
const OWNER_STATE_FILE = path.join(DATA_DIR, 'sala-online.json');
const PLATFORM_FILE = path.join(DATA_DIR, 'plataforma-2026.json');
const WORKSPACES_DIR = path.join(DATA_DIR, 'operadores');
const PORT = Number(process.env.PORT || 3210);
const HOST = '0.0.0.0';
const ONLINE_MODE = process.env.RENDER === 'true' || process.env.ONLINE_MODE === 'true';
const PUBLIC_URL = String(process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const MASTER_ADMIN_PASSWORD = String(process.env.MASTER_ADMIN_PASSWORD || ADMIN_PASSWORD || '');
const BINGO_TIMEZONE = String(process.env.BINGO_TIMEZONE || 'America/Argentina/Buenos_Aires');
const MIN_CARDS = 2;
const MAX_CARDS = 250;
const MAX_ACTIVE_CARDS = 250;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 60;
const MAX_CARDS_PER_PLAYER = 4;
const MAX_CARD_OPTIONS = 10;
const MIN_ASSIGNMENT_MINUTES = 1;
const MAX_ASSIGNMENT_MINUTES = 30;
const CARD_RESERVATION_TTL_MS = 2 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CLAIM_QUEUE_WINDOW_MS = 3000;
const TEST_EVENT_TTL_MS = 20 * 1000;
const START_SEQUENCE_MS = Math.max(100, Number(process.env.BINGO_START_SEQUENCE_MS || 11_000));
const RESUME_SEQUENCE_MS = Math.max(100, Number(process.env.BINGO_RESUME_SEQUENCE_MS || 5_000));
const FINAL_BALLS_SEQUENCE_MS = Math.max(250, Number(process.env.BINGO_FINAL_BALLS_SEQUENCE_MS || 8_000));
const MAX_TIE_WINNERS_PER_PRIZE = 4;
const APP_PUBLIC_VERSION = '2026';
const PRIZE_TYPES = ['ambo', 'line', 'doubleLine', 'tripleLine', 'corners', 'bingo'];
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

function loadLastResultMeta(metaFile, pdfFile) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (!meta?.roomCode || !fs.existsSync(pdfFile)) return null;
    return meta;
  } catch {
    return null;
  }
}

const nowIso = () => new Date().toISOString();
const deepCopy = value => JSON.parse(JSON.stringify(value));
const randomId = prefix => `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
const randomCode = (length = 7) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < length; i++) value += alphabet[crypto.randomInt(0, alphabet.length)];
  return value;
};
const uniqueNumbers = values => [...new Set((values || []).map(Number).filter(Number.isFinite))];
const cardNumbers = card => (card?.grid || []).flat().filter(value => typeof value === 'number');
const PLAYER_PRESENTERS = new Set(['vero', 'vivi', 'josu', 'daia']);
const playerDisplayName = player => String(player?.name || player?.slotLabel || 'Acceso sin nombre').trim();
function normalizePlayerName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
}
function validatePlayerName(value, playerId = null) {
  const name = normalizePlayerName(value);
  if (name.length < 2) throw new Error('Escribí un nombre o apodo de al menos 2 caracteres.');
  if (/^(jugador|player|invitado)(?:\s*[x#_-]?\s*\d*)?$/i.test(name)) throw new Error('Elegí un nombre o apodo propio. No se permite usar “Jugador X”.');
  const duplicate = state.players?.find(item => item.id !== playerId && item.nameSet && normalizePlayerName(item.name).toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
  if (duplicate) throw new Error('Ese nombre ya está en uso en esta sala. Elegí otro.');
  return name;
}

function prizeLabelFor(type, prizeNumber = 1, mode = state.game?.mode) {
  if (type === 'ambo') return 'AmboCabeza';
  if (type === 'bingo') return 'Bingo';
  if (type === 'doubleLine') return 'Doble línea';
  if (type === 'tripleLine') return 'Triple línea';
  if (type === 'corners') return '4 esquinas';
  if (type === 'line' && Number(mode) === 90) return Number(prizeNumber) === 2 ? 'Segunda línea' : 'Primera línea';
  return 'Línea';
}
function claimBetName(type) {
  return type === 'ambo' ? 'ambocabeza' : type;
}
function isPrizeEnabled(type, game = state.game) {
  if (!game) return false;
  const mode = Number(game.mode) === 75 ? 75 : 90;
  if (type === 'ambo') return mode === 90 && game.rules?.ambocabeza !== false;
  if (type === 'line') return game.rules?.line !== false;
  if (type === 'doubleLine') return mode === 75 && Boolean(game.rules?.doubleLine);
  if (type === 'tripleLine') return mode === 75 && Boolean(game.rules?.tripleLine);
  if (type === 'corners') return mode === 75 && Boolean(game.rules?.corners);
  if (type === 'bingo') return game.rules?.bingo !== false;
  return false;
}
function winningDetailsForClaim(claim) {
  const lines = claim?.comparison?.completeLines || [];
  if (claim?.type === 'doubleLine') return lines.slice(0, 2);
  if (claim?.type === 'tripleLine') return lines.slice(0, 3);
  if (claim?.type === 'line') return lines.slice(0, 1);
  if (claim?.type === 'corners') return claim?.comparison?.cornerDetails || [];
  if (claim?.type === 'ambo') return claim?.comparison?.amboDetails?.slice(0, 1) || [];
  return [];
}
function winningNumbersForClaim(claim, card) {
  if (claim?.type === 'bingo') return cardNumbers(card);
  return [...new Set(winningDetailsForClaim(claim).flatMap(detail => detail.values || []).map(Number).filter(Number.isFinite))];
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function lineDefinitions(card) {
  if (Number(card.mode) === 90) {
    return (card.grid || []).map((row, index) => ({ key: `row-${index}`, label: `Fila ${index + 1}`, values: row.filter(Number.isFinite) }));
  }
  const lines = [];
  for (let row = 0; row < 5; row++) lines.push({ key: `row-${row}`, label: `Fila ${row + 1}`, values: card.grid[row].filter(Number.isFinite) });
  for (let col = 0; col < 5; col++) lines.push({ key: `col-${col}`, label: `Columna ${'BINGO'[col]}`, values: card.grid.map(row => row[col]).filter(Number.isFinite) });
  lines.push({ key: 'diag-1', label: 'Diagonal principal', values: card.grid.map((row, i) => row[i]).filter(Number.isFinite) });
  lines.push({ key: 'diag-2', label: 'Diagonal secundaria', values: card.grid.map((row, i) => row[4 - i]).filter(Number.isFinite) });
  return lines;
}

function analyzeCard(card, drawnValues, playerMarks = []) {
  const drawn = new Set(uniqueNumbers(drawnValues));
  const marks = new Set(uniqueNumbers(playerMarks));
  const numbers = cardNumbers(card);
  const lines = lineDefinitions(card);
  const lineMissing = lines.length ? Math.min(...lines.map(line => line.values.filter(n => !drawn.has(n)).length)) : numbers.length;
  const completeLines = lines.filter(line => line.values.length && line.values.every(n => drawn.has(n)));
  const lineCount = completeLines.length;
  const bingoMissing = numbers.filter(n => !drawn.has(n)).length;
  const amboDetails = Number(card.mode) === 90 ? (card.grid || []).map((row, rowIndex) => {
    const values = row.filter(Number.isFinite);
    if (values.length !== 5) return null;
    const middleClean = values.slice(1, -1).every(number => !drawn.has(number));
    return drawn.has(values[0]) && drawn.has(values.at(-1)) && middleClean
      ? { key: `row-${rowIndex}`, label: `Fila ${rowIndex + 1}`, values: [values[0], values.at(-1)] }
      : null;
  }).filter(Boolean) : [];
  const cornerValues = Number(card.mode) === 75
    ? [card.grid?.[0]?.[0], card.grid?.[0]?.[4], card.grid?.[4]?.[0], card.grid?.[4]?.[4]].filter(Number.isFinite)
    : [];
  const cornersMissing = cornerValues.filter(number => !drawn.has(number)).length;
  const cornerDetails = cornerValues.length === 4 && cornersMissing === 0
    ? [{ key: 'four-corners', label: 'Las cuatro esquinas', values: cornerValues }]
    : [];
  const officialMarked = numbers.filter(n => drawn.has(n));
  const playerMarked = numbers.filter(n => marks.has(n));
  const missed = officialMarked.filter(n => !marks.has(n));
  const wrong = playerMarked.filter(n => !drawn.has(n));
  return {
    lineMissing,
    lineCount,
    bingoMissing,
    cornersMissing,
    hasAmbo: amboDetails.length > 0,
    amboDetails,
    hasLine: lineCount >= 1,
    hasDoubleLine: Number(card.mode) === 75 && lineCount >= 2,
    hasTripleLine: Number(card.mode) === 75 && lineCount >= 3,
    hasCorners: Number(card.mode) === 75 && cornerDetails.length > 0,
    cornerDetails,
    hasBingo: bingoMissing === 0 && numbers.length > 0,
    completeLines,
    officialMarked,
    playerMarked,
    missed,
    wrong,
    markedCount: officialMarked.length,
    playerMarkedCount: playerMarked.length,
    totalNumbers: numbers.length
  };
}

function blankState() {
  return {
    version: 2026,
    active: false,
    status: 'closed',
    roomCode: null,
    createdAt: null,
    startedAt: null,
    endedAt: null,
    updatedAt: nowIso(),
    round: 1,
    roomSettings: {
      playerAudioAllowed: true,
      playerAudioDefault: true,
      linePrizeCount: 1,
      bingoPrizeCount: 1,
      allowSamePlayerSecondLine: true,
      tiePolicy: 'first_claim',
      gameType: 'real',
      prizeAmounts: { ambo: 0, line: 0, doubleLine: 0, tripleLine: 0, corners: 0, bingo: 0 },
      whatsapp: '',
      showMercadoPago: true,
      argentinaHint: true,
      broadcastToken: null
    },
    assignmentTimer: {
      enabled: false,
      durationMinutes: 10,
      status: 'idle',
      startedAt: null,
      endsAt: null,
      remainingMs: null,
      completedAt: null
    },
    adminMessage: null,
    transition: null,
    pauseReason: null,
    deviceTransferRequests: [],
    testEvent: null,
    game: null,
    players: [],
    cardReservations: {},
    claims: [],
    eventLog: []
  };
}

function loadState(stateFile = OWNER_STATE_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const defaults = blankState();
    const merged = {
      ...defaults,
      ...parsed,
      roomSettings: { ...defaults.roomSettings, ...(parsed.roomSettings || {}) },
      assignmentTimer: { ...defaults.assignmentTimer, ...(parsed.assignmentTimer || {}) },
      players: parsed.players || [],
      cardReservations: parsed.cardReservations || {},
      claims: parsed.claims || [],
      eventLog: parsed.eventLog || [],
      transition: parsed.transition || null,
      pauseReason: parsed.pauseReason || null,
      deviceTransferRequests: Array.isArray(parsed.deviceTransferRequests) ? parsed.deviceTransferRequests : []
    };
    if (merged.active && !parsed.status) merged.status = merged.game?.drawn?.length ? 'playing' : 'waiting';
    if (!['closed', 'waiting', 'starting', 'playing', 'verifying', 'paused', 'resuming', 'finalizing', 'finished'].includes(merged.status)) merged.status = 'closed';
    merged.roomSettings.linePrizeCount = Math.max(1, Math.min(2, Number(merged.roomSettings.linePrizeCount) || 1));
    merged.roomSettings.bingoPrizeCount = 1;
    merged.roomSettings.allowSamePlayerSecondLine = Boolean(merged.roomSettings.allowSamePlayerSecondLine);
    merged.roomSettings.tiePolicy = merged.roomSettings.tiePolicy === 'same_ball' ? 'same_ball' : 'first_claim';
    merged.roomSettings.gameType = merged.roomSettings.gameType === 'test' ? 'test' : 'real';
    merged.roomSettings.prizeAmounts = {
      ambo: Math.max(0, Number(merged.roomSettings.prizeAmounts?.ambo) || 0),
      line: Math.max(0, Number(merged.roomSettings.prizeAmounts?.line) || 0),
      doubleLine: Math.max(0, Number(merged.roomSettings.prizeAmounts?.doubleLine) || 0),
      tripleLine: Math.max(0, Number(merged.roomSettings.prizeAmounts?.tripleLine) || 0),
      corners: Math.max(0, Number(merged.roomSettings.prizeAmounts?.corners) || 0),
      bingo: Math.max(0, Number(merged.roomSettings.prizeAmounts?.bingo) || 0)
    };
    merged.roomSettings.whatsapp = String(merged.roomSettings.whatsapp || '').slice(0, 40);
    merged.roomSettings.showMercadoPago = merged.roomSettings.showMercadoPago !== false;
    merged.roomSettings.argentinaHint = merged.roomSettings.argentinaHint !== false;
    merged.roomSettings.broadcastToken = merged.roomSettings.broadcastToken ? String(merged.roomSettings.broadcastToken) : null;
    merged.testEvent = parsed.testEvent && new Date(parsed.testEvent.expiresAt || 0).getTime() > Date.now() ? parsed.testEvent : null;
    merged.assignmentTimer.durationMinutes = Math.max(MIN_ASSIGNMENT_MINUTES, Math.min(MAX_ASSIGNMENT_MINUTES, Number(merged.assignmentTimer.durationMinutes) || 10));
    if (!['idle', 'running', 'paused', 'completed'].includes(merged.assignmentTimer.status)) merged.assignmentTimer.status = 'idle';
    merged.adminMessage = parsed.adminMessage && typeof parsed.adminMessage === 'object' && String(parsed.adminMessage.text || '').trim()
      ? {
          id: String(parsed.adminMessage.id || randomId('msg')),
          text: String(parsed.adminMessage.text || '').trim().slice(0, 300),
          updatedAt: parsed.adminMessage.updatedAt || nowIso()
        }
      : null;
    merged.players = merged.players.map(player => {
      const cardIds = [...new Set((player.cardIds || []).map(String))].slice(0, MAX_CARDS_PER_PLAYER);
      const allowedCardCount = Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(player.allowedCardCount) || cardIds.length || 1));
      const name = normalizePlayerName(player.name || '');
      return {
        ...player,
        name,
        nameSet: player.nameSet === undefined ? Boolean(name && !/^Jugador\s+\d+$/i.test(name)) : Boolean(player.nameSet),
        slotLabel: String(player.slotLabel || `Acceso ${Number(player.slotNumber) || 1}`),
        personalPresenter: PLAYER_PRESENTERS.has(player.personalPresenter) ? player.personalPresenter : null,
        cardIds,
        allowedCardCount,
        selectionConfirmed: player.selectionConfirmed === undefined ? cardIds.length > 0 : Boolean(player.selectionConfirmed && cardIds.length > 0),
        offeredCardIds: Array.isArray(player.offeredCardIds) ? player.offeredCardIds.map(String) : [],
        reservedCardIds: Array.isArray(player.reservedCardIds) ? player.reservedCardIds.map(String) : [],
        marks: player.marks || {},
        autoMark: Boolean(player.autoMark),
        notices: player.notices || [],
        sessionDeviceId: String(player.sessionDeviceId || '')
      };
    });
    return merged;
  } catch {
    return blankState();
  }
}

function loadPlatform() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PLATFORM_FILE, 'utf8'));
    return { version: 23, operators: Array.isArray(parsed.operators) ? parsed.operators : [] };
  } catch {
    return { version: 23, operators: [] };
  }
}

let platform = loadPlatform();
function savePlatform() {
  const temp = `${PLATFORM_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(platform, null, 2), 'utf8');
  fs.renameSync(temp, PLATFORM_FILE);
}

const workspaceContext = new AsyncLocalStorage();
const workspaces = new Map();

function safeWorkspaceId(value) {
  return String(value || 'owner').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'owner';
}

function workspacePaths(id) {
  const safe = safeWorkspaceId(id);
  const base = safe === 'owner' ? DATA_DIR : path.join(WORKSPACES_DIR, safe);
  fs.mkdirSync(base, { recursive: true });
  return {
    stateFile: safe === 'owner' ? OWNER_STATE_FILE : path.join(base, 'sala-online.json'),
    resultPdfFile: safe === 'owner' ? path.join(DATA_DIR, 'ultimo-resultado.pdf') : path.join(base, 'ultimo-resultado.pdf'),
    resultMetaFile: safe === 'owner' ? path.join(DATA_DIR, 'ultimo-resultado.json') : path.join(base, 'ultimo-resultado.json')
  };
}

function ensureWorkspace(id = 'owner', operatorId = null, label = 'Administrador principal') {
  const safe = safeWorkspaceId(id);
  if (workspaces.has(safe)) return workspaces.get(safe);
  const paths = workspacePaths(safe);
  const workspace = {
    id: safe, operatorId, label, ...paths,
    state: loadState(paths.stateFile),
    sseClients: new Set(),
    lastResultMeta: loadLastResultMeta(paths.resultMetaFile, paths.resultPdfFile)
  };
  workspaces.set(safe, workspace);
  return workspace;
}

const ownerWorkspace = ensureWorkspace('owner');
// Los operadores temporales están deshabilitados en BINGO GORDA 2026.

function currentWorkspace() { return workspaceContext.getStore() || ownerWorkspace; }
function replaceCurrentState(next) { currentWorkspace().state = next; }
const state = new Proxy({}, {
  get(_target, property) { return currentWorkspace().state[property]; },
  set(_target, property, value) { currentWorkspace().state[property] = value; return true; },
  ownKeys() { return Reflect.ownKeys(currentWorkspace().state); },
  getOwnPropertyDescriptor() { return { enumerable: true, configurable: true }; }
});
const sseClients = new Proxy(new Set(), {
  get(_target, property) {
    const set = currentWorkspace().sseClients;
    if (property === Symbol.iterator) return set[Symbol.iterator].bind(set);
    const value = set[property];
    return typeof value === 'function' ? value.bind(set) : value;
  }
});
const adminSessions = new Map();
const masterSessions = new Map();
const rateBuckets = new Map();

function currentResultFiles() {
  const workspace = currentWorkspace();
  return { pdfFile: workspace.resultPdfFile, metaFile: workspace.resultMetaFile };
}

function publicLastResult() {
  const workspace = currentWorkspace();
  const meta = workspace.lastResultMeta;
  if (!meta?.roomCode || !fs.existsSync(workspace.resultPdfFile)) return null;
  return {
    roomCode: meta.roomCode, gameNumber: meta.gameNumber || null, round: meta.round || 1,
    startedAt: meta.startedAt || null, endedAt: meta.endedAt || null, savedAt: meta.savedAt || null,
    filename: meta.filename || `Resultados_Bingo_Sala_${meta.roomCode}.pdf`,
    downloadUrl: `/api/results.pdf?sala=${encodeURIComponent(meta.roomCode)}`
  };
}

function saveState() {
  const workspace = currentWorkspace();
  state.updatedAt = nowIso();
  const temp = `${workspace.stateFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temp, workspace.stateFile);
}

function logEvent(type, details = {}) {
  state.eventLog.push({ id: randomId('evt'), type, at: nowIso(), ...details });
  if (state.eventLog.length > 1000) state.eventLog.splice(0, state.eventLog.length - 1000);
}

function getLanAddresses() {
  const values = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) values.push(entry.address);
    }
  }
  return [...new Set(values)];
}

function isLoopback(req) {
  const address = req.socket.remoteAddress || '';
  return address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.') || address === '::ffff:localhost';
}

function remoteKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function consumeRate(req, bucketName, limit, windowMs) {
  const key = `${bucketName}:${remoteKey(req)}`;
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  existing.count += 1;
  return existing.count <= limit;
}

function operatorStatus(operator) {
  if (!operator) return 'missing';
  if (operator.revokedAt) return 'revoked';
  return new Date(operator.expiresAt || 0).getTime() > Date.now() ? 'active' : 'expired';
}

function findOperatorById(id) { return platform.operators.find(item => item.id === id) || null; }
function findOperatorByAccessToken(token) { return platform.operators.find(item => item.accessToken && safeEqual(item.accessToken, token)) || null; }

function createAdminSession({ workspaceId = 'owner', role = 'owner', operatorId = null, hardExpiresAt = null } = {}) {
  const token = randomId('admin');
  const now = Date.now();
  const rolling = now + ADMIN_SESSION_TTL_MS;
  const expiresAt = hardExpiresAt ? Math.min(rolling, Number(hardExpiresAt)) : rolling;
  adminSessions.set(token, { token, workspaceId: safeWorkspaceId(workspaceId), role, operatorId, expiresAt, hardExpiresAt: hardExpiresAt || null });
  return token;
}

function createMasterSession() {
  const token = randomId('master');
  masterSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
}

function adminTokenFrom(req, url) {
  return String(req.headers['x-admin-token'] || url.searchParams.get('adminToken') || '');
}

function adminSessionFrom(req, url) {
  const token = adminTokenFrom(req, url);
  const session = adminSessions.get(token);
  if (!session) return null;
  const now = Date.now();
  const workspace = workspaces.get(session.workspaceId);
  const operator = session.operatorId ? findOperatorById(session.operatorId) : null;
  const status = session.role === 'operator' ? operatorStatus(operator) : 'active';
  const mayFinishActiveRoom = Boolean(operator && workspace?.state?.active && !['closed', 'finished'].includes(workspace.state.status));

  // Una revocación manual es inmediata. Un vencimiento natural puede extender la
  // sesión únicamente para terminar la partida que ya estaba en curso.
  if (session.role === 'operator' && status === 'revoked') {
    adminSessions.delete(token);
    return null;
  }
  if (session.role === 'operator' && status !== 'active' && !mayFinishActiveRoom) {
    adminSessions.delete(token);
    return null;
  }
  if (session.expiresAt <= now) {
    if (!(session.role === 'operator' && status === 'expired' && mayFinishActiveRoom)) {
      adminSessions.delete(token);
      return null;
    }
    session.hardExpiresAt = null;
  }

  const hardLimit = session.hardExpiresAt ? Number(session.hardExpiresAt) : Infinity;
  session.expiresAt = Math.min(now + ADMIN_SESSION_TTL_MS, hardLimit);
  adminSessions.set(token, session);
  return session;
}

function isAdminAuthorized(req, url) { return Boolean(adminSessionFrom(req, url)); }

function masterTokenFrom(req, url) { return String(req.headers['x-master-token'] || url.searchParams.get('masterToken') || ''); }
function isMasterAuthorized(req, url) {
  const token = masterTokenFrom(req, url);
  const expiresAt = masterSessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) { if (token) masterSessions.delete(token); return false; }
  masterSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return true;
}

function operatorCanCreate(operator) {
  if (!operator || operatorStatus(operator) !== 'active') return false;
  const limit = Number(operator.maxGames) || 0;
  return !limit || Number(operator.gamesCreated || 0) < limit;
}

function assertOperatorMayStartNewGame(session) {
  if (!session || session.role !== 'operator') return;
  const operator = findOperatorById(session.operatorId);
  if (!operatorCanCreate(operator)) {
    if (operatorStatus(operator) !== 'active') throw new Error('El acceso temporal venció. Solo podés terminar la partida activa.');
    throw new Error('Este acceso alcanzó la cantidad máxima de partidas permitidas.');
  }
}

function operatorPublic(operator) {
  const workspace = ensureWorkspace(operator.workspaceId || `operator_${operator.id}`, operator.id, operator.name);
  return {
    id: operator.id, name: operator.name, createdAt: operator.createdAt, expiresAt: operator.expiresAt, revokedAt: operator.revokedAt || null,
    status: operatorStatus(operator), maxGames: Number(operator.maxGames) || 0, gamesCreated: Number(operator.gamesCreated) || 0,
    lastLoginAt: operator.lastLoginAt || null, workspaceId: workspace.id, activeRoom: Boolean(workspace.state.active),
    roomCode: workspace.state.roomCode || null, roomStatus: workspace.state.status || 'closed',
    accessUrl: `${PUBLIC_URL || ''}/operador/${encodeURIComponent(operator.accessToken)}`
  };
}

function playerByToken(token) {
  return state.players.find(player => player.sessionToken && player.sessionToken === token);
}

function connectedPlayerIds() {
  return new Set([...sseClients].filter(client => client.role === 'player' && client.playerId).map(client => client.playerId));
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = crypto.randomInt(0, index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function selectedCardOwner(cardId, exceptPlayerId = null) {
  return state.players.find(player => player.id !== exceptPlayerId && player.cardIds.includes(cardId)) || null;
}

function purgeExpiredReservations() {
  state.cardReservations ||= {};
  let changed = false;
  const now = Date.now();
  const validPlayerIds = new Set(state.players.map(player => player.id));
  for (const [cardId, reservation] of Object.entries(state.cardReservations)) {
    const expired = !reservation || Number(reservation.expiresAt) <= now;
    const invalidPlayer = !validPlayerIds.has(String(reservation?.playerId || ''));
    const assigned = Boolean(selectedCardOwner(cardId, null));
    if (expired || invalidPlayer || assigned || state.status !== 'waiting') {
      delete state.cardReservations[cardId];
      changed = true;
    }
  }
  for (const player of state.players) {
    const valid = (player.reservedCardIds || []).filter(cardId => state.cardReservations[cardId]?.playerId === player.id);
    if (valid.length !== (player.reservedCardIds || []).length) changed = true;
    player.reservedCardIds = valid;
  }
  return changed;
}

function reservationOwner(cardId) {
  purgeExpiredReservations();
  return state.cardReservations?.[cardId] || null;
}

function releaseReservationsForPlayer(player, exceptCardIds = []) {
  if (!player) return;
  const keep = new Set(exceptCardIds.map(String));
  state.cardReservations ||= {};
  for (const cardId of player.reservedCardIds || []) {
    if (!keep.has(cardId) && state.cardReservations[cardId]?.playerId === player.id) delete state.cardReservations[cardId];
  }
  player.reservedCardIds = (player.reservedCardIds || []).filter(cardId => keep.has(cardId) && state.cardReservations[cardId]?.playerId === player.id);
}

function availableCardIdsFor(player) {
  if (!state.game) return [];
  purgeExpiredReservations();
  return state.game.cards
    .map(card => card.id)
    .filter(cardId => !selectedCardOwner(cardId, player?.id || null))
    .filter(cardId => {
      const reservation = state.cardReservations?.[cardId];
      return !reservation || reservation.playerId === player?.id;
    });
}

function refreshOffersForPlayer(player, renew = false) {
  if (!state.game || !player || state.status !== 'waiting' || player.selectionConfirmed) {
    if (player) player.offeredCardIds = [];
    return;
  }
  const available = availableCardIdsFor(player);
  const allowedSet = new Set(available);
  const reserved = (player.reservedCardIds || []).filter(cardId => allowedSet.has(cardId));
  const previous = (player.offeredCardIds || []).filter(cardId => allowedSet.has(cardId) && !reserved.includes(cardId));
  const kept = renew ? [] : previous;
  let pool = shuffle(available.filter(cardId => !reserved.includes(cardId) && !kept.includes(cardId) && (!renew || !previous.includes(cardId))));
  const target = Math.min(MAX_CARD_OPTIONS, available.length);
  if (renew && pool.length + reserved.length < target) {
    pool = [...pool, ...shuffle(previous.filter(cardId => !pool.includes(cardId)))];
  }
  player.offeredCardIds = [...reserved, ...kept, ...pool].slice(0, target);
}

function refreshAllOffers() {
  for (const player of state.players) refreshOffersForPlayer(player);
}

function updateCardDisplayNames() {
  if (!state.game) return;
  const ownerByCard = new Map(state.players.flatMap(player => player.cardIds.map(cardId => [cardId, playerDisplayName(player)])));
  for (const card of state.game.cards) {
    card.originalName ||= card.name || `Cartón ${card.number}`;
    card.name = ownerByCard.get(card.id) || card.originalName;
  }
}

function allPlayersReady() {
  return state.players.length > 0 && state.players.every(player =>
    player.nameSet && player.selectionConfirmed &&
    player.cardIds.length > 0 && player.cardIds.length <= player.allowedCardCount
  );
}


function preflightPayload() {
  const assigned = state.players.flatMap(player => player.selectionConfirmed ? (player.cardIds || []).map(cardId => ({ playerId: player.id, cardId })) : []);
  const ids = assigned.map(item => item.cardId);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const pendingPlayers = state.players.filter(player => !(player.nameSet && player.selectionConfirmed && player.cardIds.length > 0 && player.cardIds.length <= player.allowedCardCount));
  const activeCards = ids.length;
  const availableCards = Math.max(0, (state.game?.cards?.length || 0) - new Set(ids).size);
  const errors = [];
  if (!state.players.length) errors.push('No hay jugadores configurados.');
  if (pendingPlayers.length) errors.push(`${pendingPlayers.length} jugador${pendingPlayers.length === 1 ? '' : 'es'} todavía no confirmó${pendingPlayers.length === 1 ? '' : 'aron'} sus cartones.`);
  if (duplicates.length) errors.push(`Hay ${duplicates.length} cartón${duplicates.length === 1 ? '' : 'es'} duplicado${duplicates.length === 1 ? '' : 's'}.`);
  if (activeCards > MAX_ACTIVE_CARDS) errors.push(`Hay ${activeCards} cartones activos y el máximo es ${MAX_ACTIVE_CARDS}.`);
  const enabledPrizes = PRIZE_TYPES.filter(type => isPrizeEnabled(type)).map(type => prizeLabelFor(type, 1, state.game?.mode));
  return {
    ok: Boolean(state.active && state.status === 'waiting' && state.game && errors.length === 0),
    totalPlayers: state.players.length,
    readyPlayers: state.players.length - pendingPlayers.length,
    pendingPlayers: pendingPlayers.map(player => ({ id: player.id, name: playerDisplayName(player), missing: Math.max(0, player.allowedCardCount - player.cardIds.length) })),
    generatedCards: state.game?.cards?.length || 0,
    activeCards,
    availableCards,
    duplicateCardIds: duplicates,
    mode: state.game?.mode,
    enabledPrizes,
    linePrizeCount: Number(state.game?.mode) === 90 ? Math.max(1, Math.min(2, Number(state.roomSettings?.linePrizeCount) || 1)) : 1,
    allowSamePlayerSecondLine: Number(state.game?.mode) === 90 && Boolean(state.roomSettings?.allowSamePlayerSecondLine),
    tiePolicy: state.roomSettings?.tiePolicy === 'same_ball' ? 'same_ball' : 'first_claim',
    errors
  };
}

function playerPrizeReadiness(player) {
  if (!state.game || !player?.selectionConfirmed) return [];
  const prizes = prizeStatusPayload();
  const playerAlreadyWonLine = (prizes.line.winners || []).some(winner => winner.playerId === player.id);
  return (player.cardIds || []).map(cardId => {
    const card = state.game.cards.find(item => item.id === cardId);
    if (!card) return null;
    const analysis = analyzeCard(card, state.game.drawn, player.marks?.[cardId] || []);
    const alreadyWon = type => (prizes[type]?.winners || []).some(winner => winner.cardId === cardId);
    const samePlayerBlocked = Number(state.game.mode) === 90 && !prizes.allowSamePlayerSecondLine && playerAlreadyWonLine;
    const live = state.status === 'playing';
    return {
      cardId,
      cardNumber: card.number,
      hasAmbo: analysis.hasAmbo,
      hasLine: analysis.hasLine,
      hasDoubleLine: analysis.hasDoubleLine,
      hasTripleLine: analysis.hasTripleLine,
      hasCorners: analysis.hasCorners,
      hasBingo: analysis.hasBingo,
      lineCount: analysis.lineCount,
      lineMissing: analysis.lineMissing,
      cornersMissing: analysis.cornersMissing,
      bingoMissing: analysis.bingoMissing,
      amboEligible: live && analysis.hasAmbo && !prizes.ambo.closed && !alreadyWon('ambo') && card.bets?.ambocabeza !== false,
      lineEligible: live && analysis.hasLine && !prizes.line.closed && !samePlayerBlocked && !alreadyWon('line') && card.bets?.line !== false,
      doubleLineEligible: live && analysis.hasDoubleLine && !prizes.doubleLine.closed && !alreadyWon('doubleLine') && card.bets?.doubleLine !== false,
      tripleLineEligible: live && analysis.hasTripleLine && !prizes.tripleLine.closed && !alreadyWon('tripleLine') && card.bets?.tripleLine !== false,
      cornersEligible: live && analysis.hasCorners && !prizes.corners.closed && !alreadyWon('corners') && card.bets?.corners !== false,
      bingoEligible: live && analysis.hasBingo && !prizes.bingo.closed && !alreadyWon('bingo') && card.bets?.bingo !== false
    };
  }).filter(Boolean);
}

function syncAutoMarksForPlayer(player) {
  if (!state.game || !player?.autoMark) return;
  const drawn = new Set(state.game.drawn || []);
  player.marks ||= {};
  for (const cardId of player.cardIds || []) {
    const card = state.game.cards.find(item => item.id === cardId);
    if (!card) continue;
    player.marks[cardId] = cardNumbers(card).filter(number => drawn.has(number)).sort((a, b) => a - b);
  }
}

function syncAllAutoMarks() {
  for (const player of state.players) syncAutoMarksForPlayer(player);
}

function selectionIsOpen() {
  return state.status === 'waiting' && state.assignmentTimer?.status !== 'completed';
}

function confirmedClaims(type) {
  return state.claims.filter(claim => claim.type === type && claim.status === 'confirmed');
}

function prizeStatusPayload() {
  const mode = Number(state.game?.mode) === 75 ? 75 : 90;
  const makeSingle = (type, enabled = isPrizeEnabled(type)) => {
    const winners = confirmedClaims(type).map(claim => ({ playerId: claim.playerId, playerName: claim.playerName, cardId: claim.cardId, cardNumber: claim.cardNumber, prizeNumber: Number(claim.prizeNumber) || 1 }));
    return { total: enabled ? 1 : 0, awarded: winners.length ? 1 : 0, remaining: enabled && !winners.length ? 1 : 0, closed: !enabled || winners.length > 0, nextNumber: 1, nextLabel: prizeLabelFor(type, 1, mode), winners };
  };
  const lineEnabled = isPrizeEnabled('line');
  const lineTotal = mode === 90 ? Math.max(1, Math.min(2, Number(state.roomSettings?.linePrizeCount) || 1)) : (lineEnabled ? 1 : 0);
  const lineAwarded = mode === 90
    ? new Set(confirmedClaims('line').map(claim => Number(claim.prizeNumber) || 1)).size
    : (confirmedClaims('line').length ? 1 : 0);
  const lineWinners = confirmedClaims('line').map(claim => ({ playerId: claim.playerId, playerName: claim.playerName, cardId: claim.cardId, cardNumber: claim.cardNumber, prizeNumber: Number(claim.prizeNumber) || 1 }));
  return {
    ambo: makeSingle('ambo'),
    line: {
      total: lineEnabled ? lineTotal : 0,
      awarded: lineAwarded,
      remaining: lineEnabled ? Math.max(0, lineTotal - lineAwarded) : 0,
      closed: !lineEnabled || lineAwarded >= lineTotal,
      nextNumber: Math.min(Math.max(1, lineTotal), lineAwarded + 1),
      nextLabel: prizeLabelFor('line', Math.min(Math.max(1, lineTotal), lineAwarded + 1), mode),
      winners: lineWinners
    },
    doubleLine: makeSingle('doubleLine'),
    tripleLine: makeSingle('tripleLine'),
    corners: makeSingle('corners'),
    bingo: makeSingle('bingo'),
    allowSamePlayerSecondLine: mode === 90 && Boolean(state.roomSettings?.allowSamePlayerSecondLine)
  };
}

function assignmentTimerPayload() {
  const timer = state.assignmentTimer || blankState().assignmentTimer;
  let remainingMs = Number(timer.remainingMs);
  if (timer.status === 'running' && timer.endsAt) remainingMs = Math.max(0, new Date(timer.endsAt).getTime() - Date.now());
  if (!Number.isFinite(remainingMs)) remainingMs = null;
  return {
    enabled: Boolean(timer.enabled),
    durationMinutes: Math.max(MIN_ASSIGNMENT_MINUTES, Math.min(MAX_ASSIGNMENT_MINUTES, Number(timer.durationMinutes) || 10)),
    status: timer.status || 'idle',
    startedAt: timer.startedAt || null,
    endsAt: timer.endsAt || null,
    remainingMs,
    remainingSeconds: remainingMs == null ? null : Math.max(0, Math.ceil(remainingMs / 1000)),
    completedAt: timer.completedAt || null,
    selectionClosed: timer.status === 'completed'
  };
}

function autoAssignPendingPlayers(reason = 'timer') {
  if (!state.active || !state.game || state.status !== 'waiting') throw new Error('La asignación automática solo está disponible en la sala de espera.');
  purgeExpiredReservations();

  const confirmedIds = new Set(state.players.filter(player => player.selectionConfirmed).flatMap(player => player.cardIds || []));
  const pendingPlayers = state.players.filter(player => !(player.nameSet && player.selectionConfirmed && player.cardIds.length > 0 && player.cardIds.length <= player.allowedCardCount));
  const validUnassigned = new Set(state.game.cards.map(card => card.id).filter(cardId => !confirmedIds.has(cardId)));
  const preferredByPlayer = new Map();
  const preferredIds = new Set();
  for (const player of pendingPlayers) {
    const preferred = (player.reservedCardIds || [])
      .filter(cardId => validUnassigned.has(cardId) && state.cardReservations?.[cardId]?.playerId === player.id && !preferredIds.has(cardId))
      .slice(0, player.allowedCardCount);
    preferred.forEach(cardId => preferredIds.add(cardId));
    preferredByPlayer.set(player.id, preferred);
  }
  let available = shuffle([...validUnassigned].filter(cardId => !preferredIds.has(cardId)));
  const assigned = [];

  for (const player of pendingPlayers) {
    const chosen = [...(preferredByPlayer.get(player.id) || [])];
    while (chosen.length < player.allowedCardCount) {
      const cardId = available.shift();
      if (!cardId) throw new Error('No quedan cartones suficientes para completar la asignación automática.');
      chosen.push(cardId);
    }
    player.cardIds = chosen;
    player.selectionConfirmed = true;
    player.offeredCardIds = [];
    player.reservedCardIds = [];
    player.marks = Object.fromEntries(chosen.map(cardId => [cardId, []]));
    syncAutoMarksForPlayer(player);
    player.notices ||= [];
    player.notices.push({
      id: randomId('notice'),
      at: nowIso(),
      type: 'auto_assignment',
      result: 'confirmed',
      text: `El sistema te asignó automáticamente ${chosen.length === 1 ? 'el cartón' : 'los cartones'} ${chosen.map(cardId => state.game.cards.find(card => card.id === cardId)?.number || '?').join(', ')}.`
    });
    assigned.push({ playerId: player.id, playerName: playerDisplayName(player), cardIds: chosen });
  }

  state.cardReservations = {};
  state.assignmentTimer = {
    ...(state.assignmentTimer || blankState().assignmentTimer),
    enabled: true,
    status: 'completed',
    endsAt: null,
    remainingMs: 0,
    completedAt: nowIso()
  };
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('automatic_assignment_completed', { reason, assignedPlayers: assigned.length, assigned });
  saveState();
  broadcast();
  return adminPayload();
}

function processAssignmentDeadline() {
  const timer = state.assignmentTimer;
  if (!state.active || state.status !== 'waiting' || timer?.status !== 'running' || !timer.endsAt) return false;
  if (new Date(timer.endsAt).getTime() > Date.now()) return false;
  autoAssignPendingPlayers('timer');
  return true;
}

function publicClaimsPayload() {
  return state.claims.slice(-10).map(claim => {
    const payload = {
      id: claim.id,
      type: claim.type,
      playerName: claim.playerName,
      cardNumber: claim.cardNumber,
      createdAt: claim.createdAt,
      status: claim.status,
      resolvedAt: claim.resolvedAt || null,
      prizeNumber: claim.prizeNumber || 1,
      prizeLabel: claim.prizeLabel || prizeLabelFor(claim.type, claim.prizeNumber, state.game?.mode)
    };
    if (claim.status === 'confirmed') {
      const card = state.game?.cards?.find(item => item.id === claim.cardId);
      if (card) {
        const details = winningDetailsForClaim(claim);
        payload.winningCard = { id: card.id, number: card.number, name: card.name, mode: card.mode, grid: card.grid, bets: card.bets };
        payload.drawnAtClaim = claim.drawnAtClaim || [];
        payload.officialMarked = claim.comparison?.officialMarked || cardNumbers(card).filter(number => payload.drawnAtClaim.includes(number));
        payload.winningNumbers = winningNumbersForClaim(claim, card);
        payload.winningLineLabel = details.map(detail => detail.label).join(' · ') || null;
      }
    }
    return payload;
  });
}

function claimStateForCard(cardId, type) {
  const matching = state.claims.filter(claim => claim.cardId === cardId && claim.type === type);
  if (matching.some(claim => claim.status === 'confirmed')) return 'confirmed';
  if (matching.some(claim => claim.status === 'pending')) return 'pending';
  if (matching.length) return 'rejected';
  return 'none';
}

function baseInfo() {
  return {
    onlineMode: ONLINE_MODE,
    minCards: MIN_CARDS,
    maxCards: MAX_CARDS,
    maxActiveCards: MAX_ACTIVE_CARDS,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    maxCardsPerPlayer: MAX_CARDS_PER_PLAYER,
    maxCardOptions: MAX_CARD_OPTIONS,
    maxTieWinnersPerPrize: MAX_TIE_WINNERS_PER_PRIZE,
    lastResult: publicLastResult(),
    publicUrl: PUBLIC_URL || null,
    playerUrl: PUBLIC_URL ? `${PUBLIC_URL}/jugador` : null,
    version: APP_PUBLIC_VERSION,
    workspace: { id: currentWorkspace().id, operatorId: currentWorkspace().operatorId || null, label: currentWorkspace().label }
  };
}

function currentAccessContext() {
  return { role: 'owner', name: 'Administrador principal', expiresAt: null, canCreateNewGames: true };
}

function broadcastPayload() {
  if (!state.active || !state.game) return { active: false, version: APP_PUBLIC_VERSION };
  const pendingClaim = state.claims.find(claim => claim.status === 'pending') || null;
  const latestConfirmedRaw = [...state.claims].reverse().find(claim => claim.status === 'confirmed') || null;
  const latestConfirmed = !pendingClaim && latestConfirmedRaw && Date.now() - new Date(latestConfirmedRaw.resolvedAt || 0).getTime() <= 20_000
    ? latestConfirmedRaw : null;
  return {
    active: true, version: APP_PUBLIC_VERSION, status: state.status, pauseReason: state.pauseReason || null, roomCode: state.roomCode, round: state.round,
    playersTotal: state.players.length, playersReady: state.players.filter(player => player.selectionConfirmed).length, playersConnected: connectedPlayerIds().size,
    roomSettings: state.roomSettings, transition: state.transition, publicClaims: publicClaimsPayload(),
    game: { id: state.game.id, number: state.game.number, mode: state.game.mode, presenter: state.game.presenter, rules: state.game.rules, drawn: state.game.drawn, lastBall: state.game.drawn.at(-1) ?? null, total: state.game.mode },
    pendingClaim: pendingClaim ? { type: pendingClaim.type, playerName: pendingClaim.playerName, cardNumber: pendingClaim.cardNumber, createdAt: pendingClaim.createdAt } : null,
    latestConfirmed: latestConfirmed ? { type: latestConfirmed.type, playerName: latestConfirmed.playerName, cardNumber: latestConfirmed.cardNumber, prizeNumber: latestConfirmed.prizeNumber || 1, prizeLabel: latestConfirmed.prizeLabel, resolvedAt: latestConfirmed.resolvedAt } : null,
    updatedAt: state.updatedAt
  };
}

function adminPayload() {
  if (!state.active || !state.game) {
    return {
      ...baseInfo(),
      active: false,
      status: 'closed',
      roomCode: '',
      game: null,
      players: [],
      cardStatus: [],
      claims: [],
      publicClaims: [],
      readyToStart: false,
      accessContext: currentAccessContext(),
      lanUrls: getLanAddresses().map(ip => `http://${ip}:${PORT}/jugador`)
    };
  }
  const connected = connectedPlayerIds();
  const cardsById = new Map(state.game.cards.map(card => [card.id, card]));
  const cardStatus = [];
  for (const player of state.players) {
    if (!player.selectionConfirmed) continue;
    for (const cardId of player.cardIds) {
      const card = cardsById.get(cardId);
      if (!card) continue;
      const analysis = analyzeCard(card, state.game.drawn, player.marks?.[cardId] || []);
      cardStatus.push({
        playerId: player.id,
        playerName: playerDisplayName(player),
        playerCode: player.code,
        connected: connected.has(player.id),
        autoMark: Boolean(player.autoMark),
        cardId,
        cardNumber: card.number,
        cardName: card.name,
        ...analysis,
        amboClaim: claimStateForCard(cardId, 'ambo'),
        lineClaim: claimStateForCard(cardId, 'line'),
        doubleLineClaim: claimStateForCard(cardId, 'doubleLine'),
        tripleLineClaim: claimStateForCard(cardId, 'tripleLine'),
        cornersClaim: claimStateForCard(cardId, 'corners'),
        bingoClaim: claimStateForCard(cardId, 'bingo')
      });
    }
  }
  return {
    ...baseInfo(),
    active: true,
    status: state.status,
    pauseReason: state.pauseReason || null,
    readyToStart: preflightPayload().ok,
    preflight: preflightPayload(),
    roomCode: state.roomCode,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    endedAt: state.endedAt || null,
    updatedAt: state.updatedAt,
    round: state.round,
    roomSettings: state.roomSettings,
    assignmentTimer: assignmentTimerPayload(),
    prizeStatus: prizeStatusPayload(),
    bingoConfirmed: prizeStatusPayload().bingo.closed,
    adminMessage: state.adminMessage,
    transition: state.transition,
    deviceTransferRequests: (state.deviceTransferRequests || []).filter(request => request.status === 'pending'),
    testEvent: state.testEvent && new Date(state.testEvent.expiresAt || 0).getTime() > Date.now() ? state.testEvent : null,
    accessContext: currentAccessContext(),
    broadcastUrl: state.roomSettings?.broadcastToken ? `${PUBLIC_URL || `http://localhost:${PORT}`}/transmision/${encodeURIComponent(state.roomSettings.broadcastToken)}` : null,
    lanUrls: getLanAddresses().map(ip => `http://${ip}:${PORT}/jugador`),
    localUrl: `http://localhost:${PORT}`,
    game: state.game,
    players: state.players.map(player => ({
      id: player.id,
      name: playerDisplayName(player),
      nameSet: Boolean(player.nameSet),
      slotLabel: player.slotLabel,
      code: player.code,
      allowedCardCount: player.allowedCardCount,
      cardIds: player.cardIds,
      selectionConfirmed: player.selectionConfirmed,
      offeredCardIds: player.offeredCardIds,
      reservedCardIds: player.reservedCardIds || [],
      autoMark: Boolean(player.autoMark),
      connected: connected.has(player.id),
      transferPending: (state.deviceTransferRequests || []).some(request => request.playerId === player.id && request.status === 'pending')
    })),
    cardStatus,
    claims: state.claims.slice(-100),
    eventLog: state.eventLog.slice(-1000)
  };
}

function playerPayload(player) {
  if (!state.active || !state.game || !player) return { active: false };
  if (state.status === 'waiting') refreshOffersForPlayer(player);
  const cards = state.game.cards.filter(card => player.cardIds.includes(card.id));
  const offers = state.game.cards.filter(card => (player.offeredCardIds || []).includes(card.id));
  return {
    active: true,
    status: state.status,
    pauseReason: state.pauseReason || null,
    roomCode: state.roomCode,
    round: state.round,
    startedAt: state.startedAt,
    endedAt: state.endedAt || null,
    roomSettings: state.roomSettings,
    assignmentTimer: assignmentTimerPayload(),
    prizeStatus: prizeStatusPayload(),
    bingoConfirmed: prizeStatusPayload().bingo.closed,
    adminMessage: state.adminMessage,
    transition: state.transition,
    testEvent: state.testEvent && new Date(state.testEvent.expiresAt || 0).getTime() > Date.now() ? state.testEvent : null,
    readiness: playerPrizeReadiness(player),
    publicClaims: publicClaimsPayload(),
    game: {
      id: state.game.id,
      number: state.game.number,
      mode: state.game.mode,
      presenter: state.game.presenter,
      drawn: state.game.drawn,
      lastBall: state.game.drawn.at(-1) ?? null,
      phase: state.game.phase
    },
    player: {
      id: player.id,
      name: playerDisplayName(player),
      nameSet: Boolean(player.nameSet),
      slotLabel: player.slotLabel,
      personalPresenter: PLAYER_PRESENTERS.has(player.personalPresenter) ? player.personalPresenter : state.game.presenter,
      code: player.code,
      allowedCardCount: player.allowedCardCount,
      selectionConfirmed: player.selectionConfirmed,
      reservedCardIds: player.reservedCardIds || [],
      reservationTtlSeconds: Math.round(CARD_RESERVATION_TTL_MS / 1000),
      offeredCards: offers,
      cards,
      marks: player.marks || {},
      autoMark: Boolean(player.autoMark),
      notices: (player.notices || []).slice(-10)
    }
  };
}

function backupPayload() {
  const cleanState = deepCopy(state);
  cleanState.players = cleanState.players.map(player => ({ ...player, sessionToken: null }));
  return {
    format: 'bingo-gorda-2026-backup',
    exportedAt: nowIso(),
    state: cleanState
  };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
  res.end(body);
}

function readJson(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('La solicitud es demasiado grande.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast() {
  for (const client of [...sseClients]) {
    try {
      if (client.role === 'admin') {
        if (!adminSessions.has(client.token)) writeSse(client.res, 'logout', { reason: 'La sesión de administrador venció.' });
        else writeSse(client.res, 'state', adminPayload());
      } else if (client.role === 'broadcast') {
        writeSse(client.res, 'state', broadcastPayload());
      } else {
        const player = state.players.find(item => item.id === client.playerId && item.sessionToken === client.token);
        if (!player) writeSse(client.res, 'logout', { reason: 'La sesión fue reemplazada o cerrada.' });
        else writeSse(client.res, 'state', playerPayload(player));
      }
    } catch {
      sseClients.delete(client);
    }
  }
}

function validateGame(game) {
  if (!game || !Array.isArray(game.cards)) throw new Error('No hay un juego válido para publicar.');
  if (game.cards.length < MIN_CARDS || game.cards.length > MAX_CARDS) throw new Error(`La sala online admite entre ${MIN_CARDS} y ${MAX_CARDS} cartones.`);
  const ids = new Set();
  for (const card of game.cards) {
    if (!card.id || ids.has(card.id)) throw new Error('Hay cartones sin identificador o repetidos.');
    ids.add(card.id);
    if (!Array.isArray(card.grid)) throw new Error(`El cartón ${card.number || card.id} no tiene cuadrícula.`);
  }
}

function sanitizeGame(game) {
  const mode = Number(game.mode) === 75 ? 75 : 90;
  const rules = {
    ambocabeza: mode === 90 && game.rules?.ambocabeza !== false,
    line: game.rules?.line !== false,
    doubleLine: mode === 75 && Boolean(game.rules?.doubleLine),
    tripleLine: mode === 75 && Boolean(game.rules?.tripleLine),
    corners: mode === 75 && Boolean(game.rules?.corners),
    bingo: game.rules?.bingo !== false
  };
  return {
    id: String(game.id),
    number: Number(game.number) || 1,
    mode,
    rules,
    drawMode: game.drawMode || 'manual',
    autoSeconds: Number(game.autoSeconds) || 6,
    presenter: game.presenter || 'vero',
    theme: game.theme || 'clasico',
    phase: game.phase || 'READY',
    drawn: uniqueNumbers(game.drawn).filter(n => n >= 1 && n <= mode),
    prizes: game.prizes ? deepCopy(game.prizes) : undefined,
    createdAt: game.createdAt || nowIso(),
    updatedAt: game.updatedAt || nowIso(),
    cards: game.cards.map(card => ({
      id: String(card.id),
      number: String(card.number),
      name: String(card.name || 'Jugador'),
      originalName: String(card.originalName || card.name || `Cartón ${card.number}`),
      mode,
      source: card.source || 'generated',
      grid: deepCopy(card.grid),
      bets: {
        ambocabeza: mode === 90 && rules.ambocabeza && card.bets?.ambocabeza !== false,
        line: rules.line && card.bets?.line !== false,
        doubleLine: mode === 75 && rules.doubleLine && card.bets?.doubleLine !== false,
        tripleLine: mode === 75 && rules.tripleLine && card.bets?.tripleLine !== false,
        corners: mode === 75 && rules.corners && card.bets?.corners !== false,
        bingo: rules.bingo && card.bets?.bingo !== false
      }
    }))
  };
}

function validateAssignments(game, assignments) {
  if (assignments.length < MIN_PLAYERS) throw new Error(`Agregá al menos ${MIN_PLAYERS} jugadores.`);
  if (assignments.length > MAX_PLAYERS) throw new Error(`La sala online admite hasta ${MAX_PLAYERS} jugadores.`);
  const validCardIds = new Set(game.cards.map(card => String(card.id)));
  const used = new Set();
  let authorizedCards = 0;
  for (const [index, raw] of assignments.entries()) {
    const slotLabel = `Acceso ${index + 1}`;
    const cardIds = [...new Set((raw.cardIds || []).map(String).filter(id => validCardIds.has(id)))];
    const allowedCardCount = Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(raw.allowedCardCount) || cardIds.length || 1));
    if (cardIds.length > allowedCardCount) throw new Error(`${slotLabel} tiene más cartones elegidos que los autorizados.`);
    for (const cardId of cardIds) {
      if (used.has(cardId)) throw new Error('Un cartón fue elegido por más de un jugador.');
      used.add(cardId);
    }
    authorizedCards += allowedCardCount;
  }
  if (authorizedCards > MAX_ACTIVE_CARDS) throw new Error(`Autorizaste ${authorizedCards} cartones activos, pero el máximo es ${MAX_ACTIVE_CARDS}.`);
  if (game.cards.length < assignments.length) throw new Error(`Generaste ${game.cards.length} cartones, pero hay ${assignments.length} jugadores. Cada jugador necesita al menos uno.`);
}

function configureRoom(payload) {
  validateGame(payload.game);
  if (uniqueNumbers(payload.game.drawn).length) throw new Error('La sala debe abrirse antes de cantar la primera bolilla. Reiniciá la ronda.');
  const assignments = Array.isArray(payload.players) ? payload.players : [];
  validateAssignments(payload.game, assignments);
  const validCardIds = new Set(payload.game.cards.map(card => String(card.id)));
  const assignedCodes = new Set();
  const nextPlayerCode = () => {
    let code;
    do { code = randomCode(7); } while (assignedCodes.has(code));
    assignedCodes.add(code);
    return code;
  };
  const players = assignments.map((raw, index) => {
    const allowedCardCount = Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(raw.allowedCardCount) || (raw.cardIds || []).length || 1));
    const cardIds = [...new Set((raw.cardIds || []).map(String).filter(id => validCardIds.has(id)))].slice(0, allowedCardCount);
    return {
      id: randomId('player'),
      name: '',
      nameSet: false,
      slotNumber: index + 1,
      slotLabel: `Acceso ${index + 1}`,
      personalPresenter: PLAYER_PRESENTERS.has(payload.game.presenter) ? payload.game.presenter : 'vero',
      code: nextPlayerCode(),
      allowedCardCount,
      cardIds,
      selectionConfirmed: cardIds.length > 0,
      offeredCardIds: [],
      reservedCardIds: [],
      sessionToken: null,
      sessionDeviceId: '',
      marks: Object.fromEntries(cardIds.map(cardId => [cardId, []])),
      autoMark: false,
      notices: []
    };
  });
  const sanitizedGame = sanitizeGame(payload.game);
  sanitizedGame.drawn = [];
  sanitizedGame.phase = 'READY';
  const requestedTimerMinutes = Math.max(MIN_ASSIGNMENT_MINUTES, Math.min(MAX_ASSIGNMENT_MINUTES, Number(payload.assignmentTimer?.durationMinutes) || 10));
  replaceCurrentState({
    version: 2026,
    active: true,
    status: 'waiting',
    roomCode: randomCode(5),
    createdAt: nowIso(),
    startedAt: null,
    endedAt: null,
    updatedAt: nowIso(),
    round: 1,
    roomSettings: {
      playerAudioAllowed: payload.roomSettings?.playerAudioAllowed !== false,
      playerAudioDefault: payload.roomSettings?.playerAudioDefault !== false,
      linePrizeCount: Number(sanitizedGame.mode) === 90 ? Math.max(1, Math.min(2, Number(payload.roomSettings?.linePrizeCount) || 1)) : 1,
      bingoPrizeCount: 1,
      allowSamePlayerSecondLine: Number(sanitizedGame.mode) === 90 && Boolean(payload.roomSettings?.allowSamePlayerSecondLine),
      tiePolicy: payload.roomSettings?.tiePolicy === 'same_ball' ? 'same_ball' : 'first_claim',
      gameType: payload.roomSettings?.gameType === 'test' ? 'test' : 'real',
      prizeAmounts: {
        ambo: Math.max(0, Number(payload.roomSettings?.prizeAmounts?.ambo) || 0),
        line: Math.max(0, Number(payload.roomSettings?.prizeAmounts?.line) || 0),
        doubleLine: Math.max(0, Number(payload.roomSettings?.prizeAmounts?.doubleLine) || 0),
        tripleLine: Math.max(0, Number(payload.roomSettings?.prizeAmounts?.tripleLine) || 0),
        corners: Math.max(0, Number(payload.roomSettings?.prizeAmounts?.corners) || 0),
        bingo: Math.max(0, Number(payload.roomSettings?.prizeAmounts?.bingo) || 0)
      },
      whatsapp: String(payload.roomSettings?.whatsapp || '').slice(0, 40),
      showMercadoPago: payload.roomSettings?.showMercadoPago !== false,
      argentinaHint: payload.roomSettings?.argentinaHint !== false,
      broadcastToken: randomId('live')
    },
    assignmentTimer: {
      enabled: Boolean(payload.assignmentTimer?.enabled),
      durationMinutes: requestedTimerMinutes,
      status: 'idle',
      startedAt: null,
      endsAt: null,
      remainingMs: requestedTimerMinutes * 60 * 1000,
      completedAt: null
    },
    adminMessage: null,
    transition: null,
    pauseReason: null,
    deviceTransferRequests: [],
    testEvent: null,
    game: sanitizedGame,
    players,
    cardReservations: {},
    claims: [],
    eventLog: []
  });
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('room_opened', { roomCode: state.roomCode, players: players.length, cards: payload.game.cards.length, status: 'waiting' });
  saveState();
  broadcast();
  return adminPayload();
}

function updateGame(game) {
  if (!state.active) throw new Error('No hay una sala online abierta.');
  validateGame(game);
  const previousDrawn = state.game?.drawn || [];
  const previousGameId = state.game?.id;
  const sanitized = sanitizeGame(game);
  if (previousGameId !== sanitized.id) throw new Error('La sala pertenece a otra partida. Cerrala y volvé a abrirla.');
  sanitized.presenter = state.game.presenter;
  if (state.status === 'waiting' && sanitized.drawn.length > previousDrawn.length) {
    throw new Error('La partida está en sala de espera. Presioná INICIAR SORTEO antes de sortear.');
  }
  if (state.status === 'finalizing' && JSON.stringify(sanitized.drawn) !== JSON.stringify(previousDrawn)) {
    throw new Error('Se están retirando las últimas bolillas. Esperá el cierre automático.');
  }
  if (state.status === 'finished' && JSON.stringify(sanitized.drawn) !== JSON.stringify(previousDrawn)) {
    throw new Error('El sorteo ya fue finalizado. No se pueden modificar las bolillas.');
  }
  const isNewRound = sanitized.drawn.length === 0 && previousDrawn.length > 0;
  state.game = sanitized;
  if (state.status === 'waiting') state.game.phase = 'READY';
  if (isNewRound) {
    state.round += 1;
    state.status = 'waiting';
    state.startedAt = null;
    state.endedAt = null;
    state.claims = [];
    state.assignmentTimer = {
      ...(state.assignmentTimer || blankState().assignmentTimer),
      status: 'idle',
      startedAt: null,
      endsAt: null,
      remainingMs: (Number(state.assignmentTimer?.durationMinutes) || 10) * 60 * 1000,
      completedAt: null
    };
    state.cardReservations = {};
    for (const player of state.players) {
      player.reservedCardIds = [];
      player.marks = Object.fromEntries(player.cardIds.map(cardId => [cardId, []]));
      player.notices = [];
    }
    logEvent('new_round', { round: state.round, status: 'waiting' });
  } else if (sanitized.drawn.length > previousDrawn.length) {
    const added = sanitized.drawn.filter(number => !previousDrawn.includes(number));
    for (const number of added) logEvent('ball_drawn', { number, position: sanitized.drawn.indexOf(number) + 1 });
  } else if (sanitized.drawn.length < previousDrawn.length) {
    const removed = previousDrawn.filter(number => !sanitized.drawn.includes(number));
    for (const number of removed) logEvent('ball_undone', { number });
  }
  syncAllAutoMarks();
  updateCardDisplayNames();
  if (state.game.drawn.length >= state.game.mode && !state.claims.some(claim => claim.status === 'pending') && state.status !== 'finished') {
    state.status = 'finished';
    state.pauseReason = null;
    state.endedAt = nowIso();
    state.game.phase = 'ROUND_END';
    state.transition = null;
    logEvent('game_finished', { round: state.round, balls: state.game.drawn.length, automatic: true });
    archiveCurrentResults();
  }
  saveState();
  broadcast();
  return adminPayload();
}

const transitionTimers = new Map();

function clearWorkspaceTransitionTimer(workspace = currentWorkspace()) {
  const timer = transitionTimers.get(workspace.id);
  if (timer) clearTimeout(timer);
  transitionTimers.delete(workspace.id);
}

function scheduleTransition() {
  const workspace = currentWorkspace();
  clearWorkspaceTransitionTimer(workspace);
  if (!state.active || !state.transition?.endsAt) return;
  const delay = Math.max(0, new Date(state.transition.endsAt).getTime() - Date.now());
  const timer = setTimeout(() => workspaceContext.run(workspace, () => completeTransition()), delay);
  transitionTimers.set(workspace.id, timer);
}

function completeTransition() {
  clearWorkspaceTransitionTimer();
  if (!state.active || !state.transition) return;
  const type = state.transition.type;
  if (type === 'final-balls') {
    const existing = new Set(state.game.drawn || []);
    const remaining = shuffle(Array.from({ length: state.game.mode }, (_, index) => index + 1).filter(number => !existing.has(number)));
    for (const number of remaining) {
      state.game.drawn.push(number);
      logEvent('ball_drawn', { number, position: state.game.drawn.length, finalVerification: true });
    }
    syncAllAutoMarks();
    state.status = 'finished';
    state.pauseReason = null;
    state.game.phase = 'ROUND_END';
    state.endedAt = nowIso();
    state.transition = null;
    logEvent('game_finished', { round: state.round, balls: state.game.drawn.length, automaticFinalExtraction: true });
    archiveCurrentResults();
    saveState();
    broadcast();
    return;
  }
  if (type === 'start' || type === 'resume') {
    if (type === 'resume' && state.transition.resumeMode) state.game.drawMode = state.transition.resumeMode;
    state.status = 'playing';
    state.pauseReason = null;
    state.game.phase = state.game.drawMode === 'automatic' ? 'DRAWING' : 'READY';
    logEvent(type === 'start' ? 'game_started' : 'game_resumed', { round: state.round, mode: state.game.drawMode });
  }
  state.transition = null;
  saveState();
  broadcast();
}

function startRoom() {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status !== 'waiting') return adminPayload();
  const preflight = preflightPayload();
  if (!preflight.ok) throw new Error(preflight.errors[0] || 'La sala todavía no está lista para iniciar.');
  if (state.game.drawn.length) throw new Error('La ronda ya contiene bolillas. Reiniciala antes de empezar.');
  state.cardReservations = {};
  for (const player of state.players) player.reservedCardIds = [];
  state.assignmentTimer = {
    ...(state.assignmentTimer || blankState().assignmentTimer),
    status: 'completed', endsAt: null, remainingMs: 0,
    completedAt: state.assignmentTimer?.completedAt || nowIso()
  };
  const startedAt = nowIso();
  state.status = 'starting';
  state.pauseReason = null;
  state.startedAt = startedAt;
  state.endedAt = null;
  state.game.phase = 'READY';
  state.transition = {
    id: randomId('transition'), type: 'start', startedAt,
    endsAt: new Date(Date.now() + START_SEQUENCE_MS).toISOString(),
    officialTime: new Date().toLocaleTimeString('es-AR', { timeZone: BINGO_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })
  };
  logEvent('game_start_sequence', { round: state.round, players: state.players.length, selectedCards: state.players.reduce((sum, player) => sum + player.cardIds.length, 0) });
  saveState(); broadcast(); scheduleTransition();
  return adminPayload();
}

function pauseRoom() {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status !== 'playing') throw new Error('La partida solo se puede pausar mientras está en juego.');
  clearWorkspaceTransitionTimer();
  state.status = 'paused';
  state.pauseReason = 'manual';
  state.transition = null;
  state.game.phase = 'PAUSED';
  logEvent('game_paused');
  saveState(); broadcast();
  return adminPayload();
}

function resumeRoom(payload = {}) {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status !== 'paused') throw new Error('La partida no está pausada.');
  const mode = payload.mode === 'manual' ? 'manual' : payload.mode === 'automatic' ? 'automatic' : state.game.drawMode;
  state.game.drawMode = mode;
  const startedAt = nowIso();
  state.status = 'resuming';
  state.pauseReason = null;
  state.transition = { id: randomId('transition'), type: 'resume', resumeMode: mode, startedAt, endsAt: new Date(Date.now() + RESUME_SEQUENCE_MS).toISOString() };
  state.game.phase = 'PAUSED';
  logEvent('game_resume_sequence', { mode });
  saveState(); broadcast(); scheduleTransition();
  return adminPayload();
}

function updateRoomSettings(payload) {
  if (!state.active) throw new Error('No hay una sala abierta.');
  state.roomSettings.playerAudioAllowed = payload.playerAudioAllowed !== false;
  state.roomSettings.playerAudioDefault = Boolean(payload.playerAudioDefault);
  if (state.status === 'waiting') {
    state.roomSettings.linePrizeCount = Number(state.game?.mode) === 90 ? Math.max(1, Math.min(2, Number(payload.linePrizeCount ?? state.roomSettings.linePrizeCount) || 1)) : 1;
    state.roomSettings.allowSamePlayerSecondLine = Number(state.game?.mode) === 90 && Boolean(payload.allowSamePlayerSecondLine ?? state.roomSettings.allowSamePlayerSecondLine);
    state.roomSettings.tiePolicy = payload.tiePolicy === 'same_ball' ? 'same_ball' : (payload.tiePolicy === 'first_claim' ? 'first_claim' : state.roomSettings.tiePolicy);
  }
  state.roomSettings.bingoPrizeCount = 1;
  if (payload.gameType) state.roomSettings.gameType = payload.gameType === 'test' ? 'test' : 'real';
  if (payload.prizeAmounts) state.roomSettings.prizeAmounts = {
    ambo: Math.max(0, Number(payload.prizeAmounts.ambo) || 0),
    line: Math.max(0, Number(payload.prizeAmounts.line) || 0),
    doubleLine: Math.max(0, Number(payload.prizeAmounts.doubleLine) || 0),
    tripleLine: Math.max(0, Number(payload.prizeAmounts.tripleLine) || 0),
    corners: Math.max(0, Number(payload.prizeAmounts.corners) || 0),
    bingo: Math.max(0, Number(payload.prizeAmounts.bingo) || 0)
  };
  if (payload.whatsapp !== undefined) state.roomSettings.whatsapp = String(payload.whatsapp || '').slice(0, 40);
  if (payload.showMercadoPago !== undefined) state.roomSettings.showMercadoPago = payload.showMercadoPago !== false;
  if (payload.argentinaHint !== undefined) state.roomSettings.argentinaHint = payload.argentinaHint !== false;
  state.roomSettings.broadcastToken ||= randomId('live');
  logEvent('room_settings_updated', { ...state.roomSettings });
  saveState();
  broadcast();
  return adminPayload();
}

function controlAssignmentTimer(payload) {
  if (!state.active || !state.game || state.status !== 'waiting') throw new Error('El temporizador solo funciona en la sala de espera.');
  const action = String(payload?.action || '').toLowerCase();
  const current = state.assignmentTimer || blankState().assignmentTimer;
  const durationMinutes = Math.max(MIN_ASSIGNMENT_MINUTES, Math.min(MAX_ASSIGNMENT_MINUTES, Number(payload?.durationMinutes ?? current.durationMinutes) || 10));
  const now = Date.now();

  if (action === 'start') {
    if (current.status === 'completed') throw new Error('La selección ya fue cerrada y asignada.');
    state.assignmentTimer = {
      ...current,
      enabled: true,
      durationMinutes,
      status: 'running',
      startedAt: nowIso(),
      endsAt: new Date(now + durationMinutes * 60 * 1000).toISOString(),
      remainingMs: durationMinutes * 60 * 1000,
      completedAt: null
    };
    logEvent('assignment_timer_started', { durationMinutes });
  } else if (action === 'pause') {
    if (current.status !== 'running') throw new Error('El conteo no está en marcha.');
    const remainingMs = Math.max(0, new Date(current.endsAt).getTime() - now);
    state.assignmentTimer = { ...current, status: 'paused', endsAt: null, remainingMs };
    logEvent('assignment_timer_paused', { remainingMs });
  } else if (action === 'resume') {
    if (current.status !== 'paused') throw new Error('El conteo no está pausado.');
    const remainingMs = Math.max(1000, Number(current.remainingMs) || durationMinutes * 60 * 1000);
    state.assignmentTimer = { ...current, status: 'running', endsAt: new Date(now + remainingMs).toISOString(), remainingMs };
    logEvent('assignment_timer_resumed', { remainingMs });
  } else if (action === 'extend') {
    const extraMinutes = Math.max(1, Math.min(30, Number(payload?.extraMinutes) || 5));
    if (current.status === 'running') {
      state.assignmentTimer = { ...current, endsAt: new Date(new Date(current.endsAt).getTime() + extraMinutes * 60 * 1000).toISOString() };
    } else if (current.status === 'paused' || current.status === 'idle') {
      const remainingMs = Math.max(0, Number(current.remainingMs) || durationMinutes * 60 * 1000) + extraMinutes * 60 * 1000;
      state.assignmentTimer = { ...current, enabled: true, durationMinutes, remainingMs };
    } else {
      throw new Error('La selección ya fue cerrada.');
    }
    logEvent('assignment_timer_extended', { extraMinutes });
  } else if (action === 'assign-now' || action === 'finish') {
    return autoAssignPendingPlayers('manual');
  } else if (action === 'cancel') {
    state.assignmentTimer = {
      ...current,
      enabled: false,
      durationMinutes,
      status: 'idle',
      startedAt: null,
      endsAt: null,
      remainingMs: durationMinutes * 60 * 1000,
      completedAt: null
    };
    logEvent('assignment_timer_cancelled');
  } else {
    throw new Error('Acción de temporizador no válida.');
  }

  saveState();
  broadcast();
  return adminPayload();
}

function archiveCurrentResults() {
  if (!state.active || !state.game || state.status !== 'finished') throw new Error('No hay un sorteo finalizado para archivar.');
  const pdf = buildResultsPdf();
  const { pdfFile, metaFile } = currentResultFiles();
  const pdfTemp = `${pdfFile}.tmp`;
  const metaTemp = `${metaFile}.tmp`;
  fs.writeFileSync(pdfTemp, pdf);
  const meta = {
    version: APP_PUBLIC_VERSION,
    roomCode: state.roomCode,
    gameNumber: state.game.number,
    round: state.round,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    savedAt: nowIso(),
    filename: resultsFilename(),
    sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    size: pdf.length
  };
  fs.writeFileSync(metaTemp, JSON.stringify(meta, null, 2), 'utf8');
  fs.renameSync(pdfTemp, pdfFile);
  fs.renameSync(metaTemp, metaFile);
  currentWorkspace().lastResultMeta = meta;
  return meta;
}

function finishRoom() {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status === 'finished') return adminPayload();
  if (!['playing', 'paused', 'finalizing'].includes(state.status)) throw new Error('El sorteo todavía no comenzó.');
  if (state.claims.some(claim => claim.status === 'pending')) throw new Error('Primero resolvé el reclamo pendiente.');
  if (state.game.drawn.length < state.game.mode) throw new Error(`Todavía faltan ${state.game.mode - state.game.drawn.length} bolillas. El sorteo finaliza al retirarlas todas.`);
  state.status = 'finished';
  state.pauseReason = null;
  state.endedAt = nowIso();
  state.game.phase = 'ROUND_END';
  logEvent('game_finished', { round: state.round, balls: state.game.drawn.length });
  archiveCurrentResults();
  saveState();
  broadcast();
  return adminPayload();
}

function updateAdminMessage(payload) {
  if (!state.active) throw new Error('No hay una sala abierta.');
  const action = String(payload?.action || 'publish').toLowerCase();
  const text = String(payload?.text || '').trim().slice(0, 300);
  if (action === 'clear' || !text) {
    const previousId = state.adminMessage?.id || null;
    state.adminMessage = null;
    logEvent('admin_message_cleared', { previousId });
  } else {
    state.adminMessage = {
      id: randomId('msg'),
      text,
      updatedAt: nowIso()
    };
    logEvent('admin_message_published', { messageId: state.adminMessage.id, length: text.length });
  }
  saveState();
  broadcast();
  return adminPayload();
}

function releasePlayerSelection(payload) {
  if (!state.active || state.status !== 'waiting') throw new Error('Los cartones solo se pueden modificar antes de iniciar el sorteo.');
  const player = state.players.find(item => item.id === String(payload.playerId || ''));
  if (!player) throw new Error('No se encontró el jugador.');
  releaseReservationsForPlayer(player);
  player.cardIds = [];
  player.selectionConfirmed = false;
  player.marks = {};
  player.offeredCardIds = [];
  player.reservedCardIds = [];
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('player_selection_released', { playerId: player.id, playerName: playerDisplayName(player) });
  saveState();
  broadcast();
  return adminPayload();
}


function assignCardsToPlayer(payload) {
  if (!state.active || !state.game || state.status !== 'waiting') throw new Error('Los cartones solo se pueden asignar antes de iniciar el sorteo.');
  const player = state.players.find(item => item.id === String(payload.playerId || ''));
  if (!player) throw new Error('No se encontró el jugador.');
  const requestedNumbers = Array.isArray(payload.cardNumbers) ? payload.cardNumbers.map(value => String(value).trim()).filter(Boolean) : [];
  const currentIds = new Set(player.cardIds || []);
  const occupied = new Set(state.players.filter(item => item.id !== player.id && item.selectionConfirmed).flatMap(item => item.cardIds || []));
  let chosen = [];
  if (requestedNumbers.length) {
    if (requestedNumbers.length > player.allowedCardCount) throw new Error(`Este acceso admite hasta ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}.`);
    const normalized = [...new Set(requestedNumbers)];
    if (normalized.length !== requestedNumbers.length) throw new Error('Repetiste un número de cartón.');
    for (const number of normalized) {
      const card = state.game.cards.find(item => String(item.number).toUpperCase() === String(number).toUpperCase());
      if (!card) throw new Error(`No existe el cartón ${number}.`);
      if (occupied.has(card.id)) throw new Error(`El cartón ${number} ya pertenece a otro jugador.`);
      chosen.push(card.id);
    }
  } else {
    const available = shuffle(state.game.cards.map(card => card.id).filter(cardId => !occupied.has(cardId)));
    chosen = [...currentIds, ...available.filter(id => !currentIds.has(id))].slice(0, player.allowedCardCount);
    if (chosen.length < player.allowedCardCount) throw new Error('No quedan cartones suficientes para completar la asignación.');
  }
  releaseReservationsForPlayer(player);
  player.cardIds = chosen;
  player.selectionConfirmed = true;
  player.offeredCardIds = [];
  player.reservedCardIds = [];
  player.marks = Object.fromEntries(chosen.map(cardId => [cardId, []]));
  syncAutoMarksForPlayer(player);
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('admin_player_cards_assigned', { playerId: player.id, playerName: playerDisplayName(player), cardIds: chosen });
  saveState();
  broadcast();
  return adminPayload();
}

function sendTestEvent(payload) {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  const type = ['line', 'bingo', 'ball', 'message'].includes(payload?.type) ? payload.type : 'line';
  state.testEvent = {
    id: randomId('test'),
    type,
    number: Math.max(1, Math.min(state.game.mode, Number(payload?.number) || 42)),
    text: String(payload?.text || '').trim().slice(0, 160),
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + TEST_EVENT_TTL_MS).toISOString()
  };
  logEvent('test_event_sent', { testType: type });
  saveState();
  broadcast();
  return adminPayload();
}

function newRoomState() {
  if (state.active && state.status !== 'finished') throw new Error('Primero finalizá el sorteo actual antes de crear una sala nueva.');
  if (state.active) logEvent('new_room_requested');
  replaceCurrentState(blankState());
  saveState();
  broadcast();
  return adminPayload();
}

function closeRoom() {
  logEvent('room_closed');
  state.active = false;
  state.status = 'closed';
  state.endedAt ||= nowIso();
  state.updatedAt = nowIso();
  saveState();
  broadcast();
}

function restoreBackup(payload) {
  const raw = payload?.backup?.state || payload?.backup || payload?.state;
  if (!raw || typeof raw !== 'object') throw new Error('La copia de seguridad no es válida.');
  if (!raw.active || !raw.game) throw new Error('La copia no contiene una sala activa.');
  validateGame(raw.game);
  const rawPlayers = Array.isArray(raw.players) ? raw.players : [];
  validateAssignments(raw.game, rawPlayers);
  const validCardIds = new Set(raw.game.cards.map(card => String(card.id)));
  const codes = new Set();
  const used = new Set();
  const players = rawPlayers.map((rawPlayer, index) => {
    const allowedCardCount = Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(rawPlayer.allowedCardCount) || (rawPlayer.cardIds || []).length || 1));
    const cardIds = [...new Set((rawPlayer.cardIds || []).map(String).filter(id => validCardIds.has(id) && !used.has(id)))].slice(0, allowedCardCount);
    cardIds.forEach(id => used.add(id));
    let code = String(rawPlayer.code || '').trim().toUpperCase();
    if (!code || codes.has(code)) code = randomCode(7);
    codes.add(code);
    const marks = {};
    for (const cardId of cardIds) {
      const card = raw.game.cards.find(item => String(item.id) === cardId);
      const allowed = new Set(cardNumbers(card));
      marks[cardId] = uniqueNumbers(rawPlayer.marks?.[cardId] || []).filter(number => allowed.has(number));
    }
    return {
      id: String(rawPlayer.id || randomId('player')),
      name: String(rawPlayer.name || `Jugador ${index + 1}`).slice(0, 80),
      code,
      allowedCardCount,
      cardIds,
      selectionConfirmed: rawPlayer.selectionConfirmed === undefined ? cardIds.length === allowedCardCount : Boolean(rawPlayer.selectionConfirmed),
      offeredCardIds: Array.isArray(rawPlayer.offeredCardIds) ? rawPlayer.offeredCardIds.map(String).filter(id => validCardIds.has(id)) : [],
      reservedCardIds: [],
      sessionToken: null,
      sessionDeviceId: '',
      marks,
      autoMark: Boolean(rawPlayer.autoMark),
      notices: Array.isArray(rawPlayer.notices) ? rawPlayer.notices.slice(-20) : []
    };
  });
  replaceCurrentState({
    version: 23,
    active: true,
    status: ['waiting', 'starting', 'playing', 'verifying', 'paused', 'resuming', 'finalizing', 'finished'].includes(raw.status) ? raw.status : (raw.game.drawn?.length ? 'playing' : 'waiting'),
    roomCode: String(raw.roomCode || randomCode(5)).slice(0, 12),
    createdAt: raw.createdAt || nowIso(),
    startedAt: raw.startedAt || null,
    endedAt: raw.endedAt || null,
    updatedAt: nowIso(),
    round: Math.max(1, Number(raw.round) || 1),
    roomSettings: { ...blankState().roomSettings, ...(raw.roomSettings || {}) },
    assignmentTimer: { ...blankState().assignmentTimer, ...(raw.assignmentTimer || {}) },
    testEvent: null,
    transition: raw.transition || null,
    pauseReason: raw.pauseReason || null,
    deviceTransferRequests: [],
    adminMessage: raw.adminMessage && String(raw.adminMessage.text || '').trim()
      ? {
          id: String(raw.adminMessage.id || randomId('msg')),
          text: String(raw.adminMessage.text || '').trim().slice(0, 300),
          updatedAt: raw.adminMessage.updatedAt || nowIso()
        }
      : null,
    game: sanitizeGame(raw.game),
    players,
    cardReservations: {},
    claims: Array.isArray(raw.claims) ? raw.claims.slice(-100) : [],
    eventLog: Array.isArray(raw.eventLog) ? raw.eventLog.slice(-2000) : []
  });
  state.roomSettings.tiePolicy = state.roomSettings.tiePolicy === 'same_ball' ? 'same_ball' : 'first_claim';
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('backup_restored', { players: players.length, cards: state.game.cards.length, status: state.status });
  saveState();
  broadcast();
  scheduleTransition();
  return adminPayload();
}

function loginPlayer(payload) {
  if (!state.active) throw new Error('La sala todavía no está abierta.');
  const roomCode = String(payload?.roomCode || '').trim().toUpperCase();
  if (roomCode && roomCode !== state.roomCode) throw new Error('El código de sala no coincide.');
  const normalized = String(payload?.code || '').trim().toUpperCase();
  const deviceId = String(payload?.deviceId || '').trim().slice(0, 120);
  const player = state.players.find(item => item.code === normalized);
  if (!player) throw new Error('Código incorrecto. Revisalo con el administrador.');
  if (!player.nameSet && normalizePlayerName(payload?.name)) {
    player.name = validatePlayerName(payload.name, player.id);
    player.nameSet = true;
  }
  if (player.sessionToken && player.sessionDeviceId && deviceId && player.sessionDeviceId !== deviceId) {
    return { conflict: true, playerId: player.id, playerName: playerDisplayName(player), message: 'Tu sesión está activa en otro dispositivo.' };
  }
  player.personalPresenter = PLAYER_PRESENTERS.has(player.personalPresenter) ? player.personalPresenter : (PLAYER_PRESENTERS.has(state.game?.presenter) ? state.game.presenter : 'vero');
  player.sessionToken = player.sessionToken || randomId('session');
  player.sessionDeviceId = deviceId || player.sessionDeviceId || randomId('device');
  player.lastLoginAt = nowIso();
  if (state.status === 'waiting') refreshOffersForPlayer(player);
  logEvent('player_login', { playerId: player.id, playerName: playerDisplayName(player) });
  saveState(); broadcast();
  return { token: player.sessionToken, state: playerPayload(player) };
}

function requestDeviceTransfer(payload) {
  if (!state.active) throw new Error('La sala no está activa.');
  const code = String(payload?.code || '').trim().toUpperCase();
  const deviceId = String(payload?.deviceId || '').trim().slice(0, 120);
  const player = state.players.find(item => item.code === code);
  if (!player || !deviceId) throw new Error('No se pudo identificar el acceso.');
  state.deviceTransferRequests ||= [];
  const existing = state.deviceTransferRequests.find(request => request.playerId === player.id && request.deviceId === deviceId && request.status === 'pending');
  if (existing) return { requestId: existing.id, status: existing.status, playerName: playerDisplayName(player) };
  const request = { id: randomId('transfer'), playerId: player.id, playerName: playerDisplayName(player), deviceId, status: 'pending', createdAt: nowIso() };
  state.deviceTransferRequests.push(request);
  logEvent('device_transfer_requested', { requestId: request.id, playerId: player.id, playerName: playerDisplayName(player) });
  saveState(); broadcast();
  return { requestId: request.id, status: request.status, playerName: playerDisplayName(player) };
}

function deviceTransferStatus(payload) {
  const requestId = String(payload?.requestId || '');
  const deviceId = String(payload?.deviceId || '');
  const request = (state.deviceTransferRequests || []).find(item => item.id === requestId && item.deviceId === deviceId);
  if (!request) throw new Error('No se encontró la solicitud.');
  const player = state.players.find(item => item.id === request.playerId);
  return { status: request.status, playerName: request.playerName, token: request.status === 'approved' ? player?.sessionToken || null : null, state: request.status === 'approved' && player ? playerPayload(player) : null };
}

function resolveDeviceTransfer(payload) {
  const request = (state.deviceTransferRequests || []).find(item => item.id === String(payload.requestId || ''));
  if (!request || request.status !== 'pending') throw new Error('La solicitud ya no está pendiente.');
  const player = state.players.find(item => item.id === request.playerId);
  if (!player) throw new Error('No se encontró el jugador.');
  const approved = payload.resolution === 'approved';
  request.status = approved ? 'approved' : 'rejected';
  request.resolvedAt = nowIso();
  if (approved) {
    player.sessionToken = randomId('session');
    player.sessionDeviceId = request.deviceId;
    player.lastLoginAt = nowIso();
  }
  logEvent('device_transfer_resolved', { requestId: request.id, playerId: player.id, resolution: request.status });
  saveState(); broadcast();
  return adminPayload();
}

function reserveCard(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  if (!selectionIsOpen()) throw new Error('La elección de cartones ya está cerrada.');
  if (player.selectionConfirmed) throw new Error('Tus cartones ya están confirmados.');
  purgeExpiredReservations();
  const cardId = String(payload.cardId || '');
  const reserve = payload.reserve !== false;
  const card = state.game.cards.find(item => item.id === cardId);
  if (!card) throw new Error('No se encontró ese cartón.');
  const offers = new Set(player.offeredCardIds || []);
  if (!offers.has(cardId) && !(player.reservedCardIds || []).includes(cardId)) {
    refreshAllOffers();
    saveState();
    broadcast();
    throw new Error('Ese cartón ya no está entre tus opciones disponibles.');
  }
  if (!reserve) {
    if (state.cardReservations?.[cardId]?.playerId === player.id) delete state.cardReservations[cardId];
    player.reservedCardIds = (player.reservedCardIds || []).filter(id => id !== cardId);
    refreshAllOffers();
    logEvent('card_reservation_released', { playerId: player.id, playerName: playerDisplayName(player), cardId });
    saveState();
    broadcast();
    return playerPayload(player);
  }
  if (selectedCardOwner(cardId, player.id)) throw new Error('Ese cartón ya fue confirmado por otro jugador.');
  const reservation = reservationOwner(cardId);
  if (reservation && reservation.playerId !== player.id) {
    refreshAllOffers();
    saveState();
    broadcast();
    throw new Error('Ese cartón acaba de ser reservado por otro jugador. Elegí otro.');
  }
  const current = new Set(player.reservedCardIds || []);
  if (!current.has(cardId) && current.size >= player.allowedCardCount) throw new Error(`Solo podés reservar ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}.`);
  current.add(cardId);
  player.reservedCardIds = [...current];
  state.cardReservations ||= {};
  state.cardReservations[cardId] = { playerId: player.id, reservedAt: Date.now(), expiresAt: Date.now() + CARD_RESERVATION_TTL_MS };
  refreshAllOffers();
  logEvent('card_reserved', { playerId: player.id, playerName: playerDisplayName(player), cardId });
  saveState();
  broadcast();
  return playerPayload(player);
}

function renewOffers(player) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  if (!selectionIsOpen()) throw new Error('La elección de cartones ya está cerrada.');
  if (player.selectionConfirmed) throw new Error('Tus cartones ya están confirmados.');
  purgeExpiredReservations();
  refreshOffersForPlayer(player, true);
  logEvent('card_offers_renewed', { playerId: player.id, playerName: playerDisplayName(player) });
  saveState(); broadcast();
  return playerPayload(player);
}

function setPlayerName(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  if (state.status !== 'waiting' && state.status !== 'starting') throw new Error('El nombre solo puede confirmarse antes de iniciar el sorteo.');
  const name = validatePlayerName(payload?.name, player.id);
  player.name = name;
  player.nameSet = true;
  updateCardDisplayNames();
  logEvent('player_name_set', { playerId: player.id, playerName: name });
  saveState();
  broadcast();
  return playerPayload(player);
}

function chooseCards(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  if (!selectionIsOpen()) throw new Error('La elección de cartones ya está cerrada.');
  purgeExpiredReservations();
  const selectedName = player.nameSet ? null : validatePlayerName(payload?.name, player.id);
  const selected = [...new Set((payload.cardIds || []).map(String))];
  if (selected.length < 1 || selected.length > player.allowedCardCount) throw new Error(`Podés elegir entre 1 y ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}.`);
  const offers = new Set(player.offeredCardIds || []);
  if (!selected.every(cardId => offers.has(cardId) || (player.reservedCardIds || []).includes(cardId))) throw new Error('Una de las opciones ya no está disponible. Actualizamos tus opciones de cartones.');
  for (const cardId of selected) {
    if (selectedCardOwner(cardId, player.id)) {
      refreshAllOffers();
      saveState();
      broadcast();
      throw new Error('Otro jugador confirmó uno de esos cartones primero. Elegí nuevamente.');
    }
    const reservation = reservationOwner(cardId);
    if (reservation && reservation.playerId !== player.id) {
      refreshAllOffers();
      saveState();
      broadcast();
      throw new Error('Otro jugador reservó uno de esos cartones primero. Elegí nuevamente.');
    }
    state.cardReservations[cardId] = { playerId: player.id, reservedAt: Date.now(), expiresAt: Date.now() + CARD_RESERVATION_TTL_MS };
  }
  releaseReservationsForPlayer(player, selected);
  if (selectedName) {
    player.name = selectedName;
    player.nameSet = true;
  }
  player.cardIds = selected;
  player.selectionConfirmed = true;
  player.offeredCardIds = [];
  player.reservedCardIds = [];
  for (const cardId of selected) delete state.cardReservations[cardId];
  player.marks = Object.fromEntries(selected.map(cardId => [cardId, []]));
  syncAutoMarksForPlayer(player);
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('cards_selected', { playerId: player.id, playerName: playerDisplayName(player), cardIds: selected });
  saveState();
  broadcast();
  return playerPayload(player);
}

function releaseOwnSelection(player) {
  if (!state.active || !selectionIsOpen()) throw new Error('La elección ya está cerrada.');
  releaseReservationsForPlayer(player);
  player.cardIds = [];
  player.selectionConfirmed = false;
  player.marks = {};
  player.offeredCardIds = [];
  player.reservedCardIds = [];
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('cards_selection_changed', { playerId: player.id, playerName: playerDisplayName(player) });
  saveState();
  broadcast();
  return playerPayload(player);
}

function markNumber(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  if (state.status !== 'playing') throw new Error('La partida todavía no comenzó.');
  if (player.autoMark) throw new Error('El marcado automático está activado. Desactivalo para marcar manualmente.');
  const cardId = String(payload.cardId || '');
  const card = state.game.cards.find(item => item.id === cardId);
  if (!card || !player.cardIds.includes(cardId)) throw new Error('Ese cartón no pertenece al jugador.');
  const number = Number(payload.number);
  if (!cardNumbers(card).includes(number)) throw new Error('Ese número no pertenece al cartón.');
  const marks = new Set(player.marks?.[cardId] || []);
  const shouldMark = payload.marked === undefined ? !marks.has(number) : Boolean(payload.marked);
  if (shouldMark) marks.add(number); else marks.delete(number);
  player.marks ||= {};
  player.marks[cardId] = [...marks].sort((a, b) => a - b);
  saveState();
  broadcast();
  return playerPayload(player);
}

function setAutoMark(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  player.autoMark = Boolean(payload.enabled);
  if (player.autoMark) syncAutoMarksForPlayer(player);
  logEvent('player_automark_changed', { playerId: player.id, playerName: playerDisplayName(player), enabled: player.autoMark });
  saveState();
  broadcast();
  return playerPayload(player);
}

function setPlayerPresenter(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  const presenter = String(payload?.presenter || '').toLowerCase();
  if (!PLAYER_PRESENTERS.has(presenter)) throw new Error('Ese presentador no está disponible.');
  player.personalPresenter = presenter;
  logEvent('player_presenter_changed', { playerId: player.id, playerName: playerDisplayName(player), presenter });
  saveState();
  broadcast();
  return playerPayload(player);
}

function createClaim(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  if (state.status !== 'playing') throw new Error('La partida todavía no comenzó o ya finalizó.');
  const requested = String(payload.type || '');
  const type = PRIZE_TYPES.includes(requested) ? requested : 'line';
  const cardId = String(payload.cardId || '');
  const card = state.game.cards.find(item => item.id === cardId);
  if (!card || !player.cardIds.includes(cardId)) throw new Error('Ese cartón no pertenece al jugador.');
  if (!isPrizeEnabled(type)) throw new Error(`El premio ${prizeLabelFor(type)} no está habilitado en esta partida.`);
  const betName = claimBetName(type);
  if (card.bets?.[betName] === false) throw new Error(`Este cartón no participa por ${prizeLabelFor(type)}.`);

  const prizes = prizeStatusPayload();
  const prize = prizes[type];
  if (!prize || prize.closed) throw new Error(`El premio ${prizeLabelFor(type)} ya fue entregado o no está habilitado.`);
  const pendingClaims = state.claims.filter(claim => claim.status === 'pending');
  let tieWith = null;
  if (pendingClaims.length) {
    const first = pendingClaims[0];
    const sameBallWindow = state.roomSettings.tiePolicy === 'same_ball' && first.type === type &&
      first.drawnAtClaim?.length === state.game.drawn.length &&
      Number(first.drawnAtClaim?.at(-1)) === Number(state.game.drawn.at(-1)) &&
      Date.now() - new Date(first.createdAt).getTime() <= CLAIM_QUEUE_WINDOW_MS;
    if (!sameBallWindow) throw new Error('Ya hay un reclamo siendo revisado. Esperá la decisión del administrador.');
    const tieGroupId = first.tieGroupId || first.id;
    const tieGroupSize = state.claims.filter(claim => claim.type === type && ['pending', 'confirmed'].includes(claim.status) && (claim.tieGroupId || claim.id) === tieGroupId).length;
    if (tieGroupSize >= MAX_TIE_WINNERS_PER_PRIZE) throw new Error(`El máximo es de ${MAX_TIE_WINNERS_PER_PRIZE} ganadores simultáneos por premio.`);
    tieWith = first;
  }
  if (state.claims.some(claim => claim.type === type && claim.cardId === cardId && claim.status === 'confirmed')) throw new Error(`Ese cartón ya ganó ${prizeLabelFor(type)}.`);
  if (type === 'line' && Number(state.game.mode) === 90 && !state.roomSettings.allowSamePlayerSecondLine && confirmedClaims('line').some(claim => claim.playerId === player.id)) {
    throw new Error('Este jugador ya ganó una línea y la sala no permite que gane la segunda.');
  }

  const analysis = analyzeCard(card, state.game.drawn, player.marks?.[cardId] || []);
  const validity = {
    ambo: analysis.hasAmbo,
    line: analysis.hasLine,
    doubleLine: analysis.hasDoubleLine,
    tripleLine: analysis.hasTripleLine,
    corners: analysis.hasCorners,
    bingo: analysis.hasBingo
  };
  const valid = Boolean(validity[type]);
  const prizeNumber = type === 'line' && Number(state.game.mode) === 90
    ? (tieWith ? Number(tieWith.prizeNumber || (prize.awarded + 1)) : prize.awarded + 1)
    : 1;
  const prizeLabel = prizeLabelFor(type, prizeNumber, state.game.mode);
  const claim = {
    id: randomId('claim'), type, prizeNumber, prizeLabel,
    playerId: player.id, playerName: playerDisplayName(player), cardId, cardNumber: card.number,
    createdAt: nowIso(), status: 'pending', officialValid: valid,
    drawnAtClaim: [...state.game.drawn], playerMarksAtClaim: [...(player.marks?.[cardId] || [])], comparison: analysis,
    tieGroupId: tieWith ? (tieWith.tieGroupId || tieWith.id) : null
  };
  state.claims.push(claim);
  clearWorkspaceTransitionTimer();
  state.status = 'verifying'; state.pauseReason = 'claim'; state.transition = null; state.game.phase = 'REVIEWING_WINNER';
  logEvent('claim_created', { claimId: claim.id, type, prizeNumber, playerId: player.id, cardId, officialValid: valid });
  saveState(); broadcast(); return claim;
}

function resolveClaim(payload) {
  const claim = state.claims.find(item => item.id === payload.claimId);
  if (!claim) throw new Error('No se encontró el reclamo.');
  if (claim.status !== 'pending') return claim;
  const resolution = payload.resolution === 'confirmed' ? 'confirmed' : 'rejected';

  if (resolution === 'confirmed') {
    if (!claim.officialValid) throw new Error('El sistema determinó que el reclamo no es válido.');
    const prizes = prizeStatusPayload();
    const current = prizes[claim.type];
    const confirmedTie = claim.tieGroupId && confirmedClaims(claim.type).find(item => (item.tieGroupId || item.id) === claim.tieGroupId);
    if (confirmedTie) {
      const tieWinners = confirmedClaims(claim.type).filter(item => (item.tieGroupId || item.id) === claim.tieGroupId && Number(item.prizeNumber || 1) === Number(confirmedTie.prizeNumber || 1));
      if (tieWinners.length >= MAX_TIE_WINNERS_PER_PRIZE) throw new Error(`El máximo es de ${MAX_TIE_WINNERS_PER_PRIZE} ganadores simultáneos por premio.`);
    }
    if (current.closed && !confirmedTie) throw new Error(`El premio ${prizeLabelFor(claim.type, claim.prizeNumber)} ya fue entregado.`);
    if (claim.type === 'line' && Number(state.game.mode) === 90 && !state.roomSettings.allowSamePlayerSecondLine && confirmedClaims('line').some(item => item.playerId === claim.playerId)) {
      throw new Error('Este jugador ya ganó una línea y no está habilitado para ganar la segunda.');
    }
    if (confirmedClaims(claim.type).some(item => item.cardId === claim.cardId)) throw new Error('Ese cartón ya recibió este premio.');
    claim.prizeNumber = claim.type === 'line' && Number(state.game.mode) === 90
      ? (confirmedTie ? Number(confirmedTie.prizeNumber || claim.prizeNumber || 1) : current.awarded + 1)
      : 1;
    claim.prizeLabel = prizeLabelFor(claim.type, claim.prizeNumber, state.game.mode);
  }

  claim.status = resolution;
  claim.resolvedAt = nowIso();
  claim.adminNote = String(payload.note || '').slice(0, 240);
  const player = state.players.find(item => item.id === claim.playerId);
  if (player) {
    player.notices ||= [];
    const label = claim.prizeLabel || prizeLabelFor(claim.type, claim.prizeNumber, state.game.mode);
    player.notices.push({
      id: randomId('notice'), at: nowIso(), type: 'claim_result', claimId: claim.id, claimType: claim.type,
      prizeNumber: claim.prizeNumber || 1, cardNumber: claim.cardNumber, result: resolution, officialValid: claim.officialValid,
      text: resolution === 'confirmed' ? `${label} confirmado en el cartón ${claim.cardNumber}.` : `${label} rechazado en el cartón ${claim.cardNumber}.`
    });
  }
  logEvent('claim_resolved', { claimId: claim.id, resolution, prizeNumber: claim.prizeNumber || 1, officialValid: claim.officialValid });
  clearWorkspaceTransitionTimer(); state.transition = null; state.pauseReason = 'claim';
  if (resolution === 'confirmed' && claim.type === 'bingo') {
    const startedAt = nowIso(); state.status = 'finalizing'; state.game.phase = 'BINGO_CONFIRMED';
    state.transition = { id: randomId('transition'), type: 'final-balls', startedAt, endsAt: new Date(Date.now() + FINAL_BALLS_SEQUENCE_MS).toISOString() };
    logEvent('bingo_confirmed_final_extraction', { claimId: claim.id, cardId: claim.cardId, cardNumber: claim.cardNumber });
  } else { state.status = 'paused'; state.game.phase = 'PAUSED'; }
  saveState(); broadcast(); if (state.status === 'finalizing') scheduleTransition(); return claim;
}


function officialBallRows() {
  const events = (state.eventLog || []).filter(event => event.type === 'ball_drawn');
  return (state.game?.drawn || []).map((number, index) => {
    const event = [...events].reverse().find(item => Number(item.number) === Number(number) && Number(item.position || index + 1) === index + 1)
      || [...events].reverse().find(item => Number(item.number) === Number(number));
    return {
      order: index + 1,
      number: Number(number),
      at: event?.at || null
    };
  });
}

function winnerDetails(claim) {
  const card = state.game?.cards?.find(item => item.id === claim.cardId) || null;
  const drawnAtClaim = Array.isArray(claim.drawnAtClaim) ? claim.drawnAtClaim : [];
  const details = winningDetailsForClaim(claim);
  return {
    type: claim.type,
    prizeNumber: Number(claim.prizeNumber) || 1,
    prizeLabel: claim.prizeLabel || prizeLabelFor(claim.type, claim.prizeNumber, state.game?.mode),
    playerName: claim.playerName,
    cardId: claim.cardId,
    cardNumber: claim.cardNumber,
    claimedAt: claim.createdAt || null,
    confirmedAt: claim.resolvedAt || null,
    ballOrder: drawnAtClaim.length || null,
    ballNumber: drawnAtClaim.at(-1) ?? null,
    mode: Number(card?.mode || state.game?.mode) === 75 ? 75 : 90,
    grid: card ? deepCopy(card.grid) : [],
    winningNumbers: winningNumbersForClaim(claim, card),
    winningLineLabel: details.map(detail => detail.label).join(' · ') || null
  };
}

function actaPayload() {
  if (!state.active || !state.game) throw new Error('No hay una sala disponible.');
  const claims = PRIZE_TYPES.flatMap(type => confirmedClaims(type))
    .sort((a, b) => new Date(a.createdAt || a.resolvedAt || 0) - new Date(b.createdAt || b.resolvedAt || 0));
  const mode = Number(state.game.mode) === 75 ? 75 : 90;
  const categories = mode === 90 ? {
    ambo: { label: 'AmboCabeza', enabled: isPrizeEnabled('ambo'), winners: confirmedClaims('ambo').map(winnerDetails) },
    line1: { label: 'Primera línea', enabled: isPrizeEnabled('line'), winners: confirmedClaims('line').filter(claim => Number(claim.prizeNumber || 1) === 1).map(winnerDetails) },
    line2: { label: 'Segunda línea', enabled: isPrizeEnabled('line') && Number(state.roomSettings?.linePrizeCount || 1) === 2, winners: confirmedClaims('line').filter(claim => Number(claim.prizeNumber || 1) === 2).map(winnerDetails) },
    bingo: { label: 'Bingo', enabled: isPrizeEnabled('bingo'), winners: confirmedClaims('bingo').map(winnerDetails) }
  } : {
    line: { label: 'Línea', enabled: isPrizeEnabled('line'), winners: confirmedClaims('line').map(winnerDetails) },
    doubleLine: { label: 'Doble línea', enabled: isPrizeEnabled('doubleLine'), winners: confirmedClaims('doubleLine').map(winnerDetails) },
    tripleLine: { label: 'Triple línea', enabled: isPrizeEnabled('tripleLine'), winners: confirmedClaims('tripleLine').map(winnerDetails) },
    corners: { label: '4 esquinas', enabled: isPrizeEnabled('corners'), winners: confirmedClaims('corners').map(winnerDetails) },
    bingo: { label: 'Bingo', enabled: isPrizeEnabled('bingo'), winners: confirmedClaims('bingo').map(winnerDetails) }
  };
  return {
    version: APP_PUBLIC_VERSION, roomCode: state.roomCode, round: state.round, gameNumber: state.game.number, mode,
    status: state.status, presenter: state.game.presenter, createdAt: state.createdAt, startedAt: state.startedAt, endedAt: state.endedAt,
    totalPlayers: state.players.length,
    activeCards: state.players.reduce((sum, player) => sum + (player.selectionConfirmed ? player.cardIds.length : 0), 0),
    balls: officialBallRows(),
    participants: state.players.map(player => ({
      name: playerDisplayName(player), nameSet: Boolean(player.nameSet), slotLabel: player.slotLabel, code: player.code,
      allowedCardCount: player.allowedCardCount,
      cardNumbers: (player.cardIds || []).map(cardId => state.game.cards.find(card => card.id === cardId)?.number).filter(Boolean),
      selectionConfirmed: player.selectionConfirmed
    })),
    winners: claims.map(winnerDetails),
    categories: Object.fromEntries(Object.entries(categories).map(([key, category]) => [key, { ...category, status: !category.enabled ? 'not_drawn' : category.winners.length ? 'confirmed' : 'no_confirmed_winner' }]))
  };
}

function formatLocalTimestamp(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: BINGO_TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatLocalDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: BINGO_TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatLocalTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: BINGO_TIMEZONE,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return '—';
  const total = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours ? `${hours} h ` : ''}${String(minutes).padStart(2, '0')} min ${String(seconds).padStart(2, '0')} s`;
}

function actaCsv() {
  const acta = actaPayload();
  const lines = [
    ['EL BINGO DE LA GORDA - RESULTADOS'],
    ['Sala', acta.roomCode],
    ['Juego', acta.gameNumber],
    ['Ronda', acta.round],
    ['Bingo', acta.mode],
    ['Inicio', formatLocalTimestamp(acta.startedAt)],
    ['Finalización', formatLocalTimestamp(acta.endedAt)],
    ['Jugadores', acta.totalPlayers],
    ['Cartones activos', acta.activeCards],
    [],
    ['ORDEN', 'BOLILLA', 'FECHA Y HORA'],
    ...acta.balls.map(row => [row.order, row.number, formatLocalTimestamp(row.at)]),
    [],
    ['ESTADO DE PREMIOS'],
    ...Object.values(acta.categories).map(category => [category.label, !category.enabled ? 'No sorteada' : category.winners.length ? `${category.winners.length} ganador(es)` : 'Sin ganador confirmado']),
    [],
    ['GANADORES'],
    ['PREMIO', 'JUGADOR', 'CARTÓN', 'CANTADO', 'BOLILLA'],
    ...acta.winners.map(winner => [winner.prizeLabel, winner.playerName, winner.cardNumber, formatLocalTimestamp(winner.claimedAt), winner.ballNumber]),
    [],
    ['JUGADORES Y CARTONES'],
    ['JUGADOR', 'CÓDIGO', 'CARTONES ASIGNADOS', 'CANTIDAD'],
    ...acta.participants.map(participant => [participant.name, participant.code, participant.cardNumbers.join(' · '), participant.cardNumbers.length])
  ];
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + lines.map(row => row.map(quote).join(';')).join('\r\n');
}

function participantsCsv() {
  const acta = actaPayload();
  const lines = [
    ['EL BINGO DE LA GORDA - JUGADORES Y CARTONES'],
    ['Sala', acta.roomCode],
    ['Juego', acta.gameNumber],
    ['Jugadores', acta.totalPlayers],
    ['Cartones activos', acta.activeCards],
    [],
    ['JUGADOR', 'CÓDIGO', 'AUTORIZADOS', 'CARTONES ASIGNADOS', 'CANTIDAD', 'ESTADO'],
    ...acta.participants.map(participant => [
      participant.name,
      participant.code,
      participant.allowedCardCount,
      participant.cardNumbers.join(' · '),
      participant.cardNumbers.length,
      participant.selectionConfirmed ? 'CONFIRMADO' : 'PENDIENTE'
    ])
  ];
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + lines.map(row => row.map(quote).join(';')).join('\r\n');
}

function pdfLatin(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\xFF]/g, '?');
}

function pdfEscape(value) {
  return pdfLatin(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfTextWidth(value, size) {
  const text = pdfLatin(value);
  let units = 0;
  for (const char of text) {
    if (' ilI.,:;!|\'`'.includes(char)) units += .27;
    else if ('mwMW@%#'.includes(char)) units += .86;
    else if ('0123456789'.includes(char)) units += .56;
    else units += .53;
  }
  return units * size;
}

function fitPdfText(value, maxWidth, size) {
  let text = pdfLatin(value);
  if (pdfTextWidth(text, size) <= maxWidth) return text;
  while (text.length > 1 && pdfTextWidth(`${text}...`, size) > maxWidth) text = text.slice(0, -1);
  return `${text}...`;
}

function hexRgb(hex) {
  const clean = String(hex).replace('#', '');
  return [parseInt(clean.slice(0, 2), 16) / 255, parseInt(clean.slice(2, 4), 16) / 255, parseInt(clean.slice(4, 6), 16) / 255];
}

function buildResultsPdf() {
  if (state.status !== 'finished') throw new Error('Los resultados estarán disponibles cuando finalice el sorteo.');
  const acta = actaPayload();
  const PAGE_W = 842;
  const PAGE_H = 595;
  const commands = [];
  const rgb = hex => hexRgb(hex).map(value => value.toFixed(3)).join(' ');
  const topY = (y, height = 0) => PAGE_H - y - height;
  const line = (x1, y1, x2, y2, color = '#000000', width = 1) => commands.push(`${rgb(color)} RG ${width} w ${x1.toFixed(2)} ${topY(y1).toFixed(2)} m ${x2.toFixed(2)} ${topY(y2).toFixed(2)} l S`);
  const rect = (x, y, width, height, fill = null, stroke = null, lineWidth = 1) => {
    if (fill) commands.push(`${rgb(fill)} rg`);
    if (stroke) commands.push(`${rgb(stroke)} RG ${lineWidth} w`);
    commands.push(`${x.toFixed(2)} ${topY(y, height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  };
  const circle = (cx, cy, radius, fill = null, stroke = null, lineWidth = 1) => {
    const k = .5522847498 * radius;
    const py = topY(cy);
    if (fill) commands.push(`${rgb(fill)} rg`);
    if (stroke) commands.push(`${rgb(stroke)} RG ${lineWidth} w`);
    commands.push(`${(cx + radius).toFixed(2)} ${py.toFixed(2)} m`);
    commands.push(`${(cx + radius).toFixed(2)} ${(py + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(py + radius).toFixed(2)} ${cx.toFixed(2)} ${(py + radius).toFixed(2)} c`);
    commands.push(`${(cx - k).toFixed(2)} ${(py + radius).toFixed(2)} ${(cx - radius).toFixed(2)} ${(py + k).toFixed(2)} ${(cx - radius).toFixed(2)} ${py.toFixed(2)} c`);
    commands.push(`${(cx - radius).toFixed(2)} ${(py - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(py - radius).toFixed(2)} ${cx.toFixed(2)} ${(py - radius).toFixed(2)} c`);
    commands.push(`${(cx + k).toFixed(2)} ${(py - radius).toFixed(2)} ${(cx + radius).toFixed(2)} ${(py - k).toFixed(2)} ${(cx + radius).toFixed(2)} ${py.toFixed(2)} c ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  };
  const text = (value, x, y, size = 10, options = {}) => {
    const font = options.bold ? 'F2' : 'F1';
    const color = options.color || '#111827';
    const maxWidth = options.maxWidth || null;
    let shown = maxWidth ? fitPdfText(value, maxWidth, size) : pdfLatin(value);
    let tx = x;
    const width = pdfTextWidth(shown, size);
    if (options.align === 'center') tx = x - width / 2;
    if (options.align === 'right') tx = x - width;
    commands.push(`BT /${font} ${size.toFixed(2)} Tf ${rgb(color)} rg 1 0 0 1 ${tx.toFixed(2)} ${(PAGE_H - y - size).toFixed(2)} Tm (${pdfEscape(shown)}) Tj ET`);
  };
  const image = (x, y, width, height) => commands.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${topY(y, height).toFixed(2)} cm /Logo Do Q`);

  const COLORS = {
    ink: '#1C1531', muted: '#6B6478', purple: '#5A167B', purple2: '#8327A5', pink: '#E83E87', gold: '#F4B51E', pale: '#F7F2FA', border: '#D9CBE2', white: '#FFFFFF', green: '#188C62', red: '#BF315E', blue: '#2C70B7'
  };

  rect(0, 0, PAGE_W, PAGE_H, '#FBF9FC');
  rect(0, 0, PAGE_W, 91, COLORS.purple);
  rect(0, 82, PAGE_W, 9, COLORS.pink);
  rect(19, 10, 70, 70, COLORS.white, '#F2D3E2', 1);
  image(24, 15, 60, 60);
  text('RESULTADOS OFICIALES DEL SORTEO', 101, 18, 20, { bold: true, color: COLORS.white, maxWidth: 390 });
  text('BINGO GORDA 2026', 101, 47, 11, { bold: true, color: '#F7DDF0' });
  text(`Sala ${acta.roomCode}  ·  Juego ${acta.gameNumber}  ·  Bingo ${acta.mode}`, 101, 65, 8.5, { color: '#E8D7EE' });

  const metaX = 510;
  const metaW = 101;
  const metaGap = 6;
  const meta = [
    ['FECHA', formatLocalDate(acta.startedAt)],
    ['INICIO', formatLocalTime(acta.startedAt)],
    ['FINALIZACIÓN', formatLocalTime(acta.endedAt)]
  ];
  meta.forEach((item, index) => {
    const x = metaX + index * (metaW + metaGap);
    rect(x, 14, metaW, 53, '#FFFFFF', '#FFFFFF', .5);
    text(item[0], x + 8, 22, 6.5, { bold: true, color: COLORS.purple2, maxWidth: metaW - 16 });
    text(item[1], x + metaW / 2, 39, 11.5, { bold: true, color: COLORS.ink, align: 'center', maxWidth: metaW - 12 });
    text(index === 0 ? `${acta.totalPlayers} jugadores` : index === 1 ? `${acta.activeCards} cartones` : formatDuration(acta.startedAt, acta.endedAt), x + metaW / 2, 57, 6.2, { color: COLORS.muted, align: 'center', maxWidth: metaW - 10 });
  });

  text('ORDEN DE SALIDA DE LAS BOLILLAS', 24, 101, 11, { bold: true, color: COLORS.ink });
  text('Cada casillero indica orden, bolilla y hora exacta de salida.', 818, 102, 7.5, { color: COLORS.muted, align: 'right' });

  const markerMap = new Map();
  const markerLabel = winner => {
    if (winner.type === 'ambo') return 'A';
    if (winner.type === 'bingo') return 'B';
    if (winner.type === 'corners') return '4E';
    if (winner.type === 'doubleLine') return 'L2';
    if (winner.type === 'tripleLine') return 'L3';
    if (winner.type === 'line') return acta.mode === 90 ? (Number(winner.prizeNumber) === 2 ? 'L2' : 'L1') : 'L';
    return 'P';
  };
  for (const winner of acta.winners) {
    if (!winner.ballOrder) continue;
    const label = markerLabel(winner);
    const list = markerMap.get(winner.ballOrder) || [];
    list.push({ label, time: formatLocalTime(winner.claimedAt), type: winner.type, prizeNumber: winner.prizeNumber });
    markerMap.set(winner.ballOrder, list);
  }

  const gridX = 24;
  const gridY = 121;
  const cols = 15;
  const gap = 3;
  const gridW = 794;
  const cellW = (gridW - gap * (cols - 1)) / cols;
  const cellH = 31;
  const rows = Math.max(1, Math.ceil(Math.max(acta.balls.length, 1) / cols));
  for (let index = 0; index < Math.max(acta.balls.length, 1); index++) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = gridX + col * (cellW + gap);
    const y = gridY + row * (cellH + gap);
    const ball = acta.balls[index];
    const marks = markerMap.get(index + 1) || [];
    const marked = marks.length > 0;
    rect(x, y, cellW, cellH, marked ? '#FFF4C9' : COLORS.white, marked ? COLORS.gold : COLORS.border, marked ? 1.5 : .7);
    if (!ball) {
      text('—', x + cellW / 2, y + 9, 9, { color: '#C7BBCD', align: 'center' });
      continue;
    }
    text(String(ball.order).padStart(2, '0'), x + 3, y + 3, 5.5, { bold: true, color: COLORS.muted });
    circle(x + cellW / 2, y + 13, 9, marked ? COLORS.gold : '#F1E7F5', marked ? '#D98C00' : '#C9AED5', .7);
    text(ball.number, x + cellW / 2, y + 6.8, 10.5, { bold: true, color: COLORS.ink, align: 'center' });
    text(formatLocalTime(ball.at), x + cellW / 2, y + 22.5, 5.7, { color: COLORS.muted, align: 'center' });
    if (marks.length) {
      const labels = marks.map(mark => mark.label).join('·');
      rect(x + cellW - 16, y + 2, 14, 8, marks.some(mark => mark.type === 'bingo') ? COLORS.pink : marks.some(mark => mark.type === 'ambo') ? '#147D64' : COLORS.purple2);
      text(labels, x + cellW - 9, y + 2.2, labels.length > 2 ? 4.7 : 5.5, { bold: true, color: COLORS.white, align: 'center', maxWidth: 12 });
    }
  }

  const gridBottom = gridY + rows * cellH + Math.max(0, rows - 1) * gap;
  const legendY = gridBottom + 7;
  text('MARCAS DE CANTO:', 24, legendY, 7, { bold: true, color: COLORS.ink });
  const legend = acta.mode === 90 ? [
    ['A', 'AmboCabeza', '#147D64'],
    ['L1', 'Primera línea', COLORS.purple2],
    ['L2', 'Segunda línea', COLORS.gold],
    ['B', 'Bingo', COLORS.pink]
  ] : [
    ['L', 'Línea', COLORS.purple2],
    ['L2', 'Doble línea', '#C58B00'],
    ['L3', 'Triple línea', '#7443A8'],
    ['4E', '4 esquinas', '#147D64'],
    ['B', 'Bingo', COLORS.pink]
  ];
  let lx = 111;
  legend.forEach(([tag, label, color]) => {
    rect(lx, legendY - 1, 16, 10, color);
    text(tag, lx + 8, legendY, 5.5, { bold: true, color: COLORS.white, align: 'center' });
    text(label, lx + 20, legendY, 6.2, { color: COLORS.muted });
    lx += acta.mode === 90 ? (tag === 'A' ? 94 : tag === 'B' ? 65 : 104) : (tag === 'B' ? 57 : 90);
  });
  text('La marca se ubica sobre la última bolilla sorteada al momento del canto.', 818, legendY, 6.7, { color: COLORS.muted, align: 'right' });

  const winnersTitleY = legendY + 20;
  text('CARTONES GANADORES', 24, winnersTitleY, 11, { bold: true, color: COLORS.ink });
  line(171, winnersTitleY + 7, 818, winnersTitleY + 7, '#DCCFE2', .8);

  const blocksY = winnersTitleY + 20;
  const categoryColors = { ambo: '#147D64', line1: COLORS.purple2, line2: '#C58B00', line: COLORS.purple2, doubleLine: '#C58B00', tripleLine: '#7443A8', corners: '#147D64', bingo: COLORS.pink };
  const categories = Object.entries(acta.categories).map(([key, category]) => ({ key, label: String(category.label || key).toUpperCase(), color: categoryColors[key] || COLORS.purple2, enabled: category.enabled, winners: category.winners }));
  const blockGap = categories.length > 4 ? 6 : 9;
  const blockW = (794 - blockGap * (categories.length - 1)) / Math.max(1, categories.length);
  const blockH = Math.max(145, 571 - blocksY);

  const drawMiniCard = (winner, x, y, width, height) => {
    rect(x, y, width, height, '#FFFFFF', '#DDD2E2', .7);
    const compact = width < 160 || height < 92;
    const nameSize = compact ? 6 : 7.3;
    const metaSize = compact ? 4.8 : 5.8;
    text(winner.playerName || 'Jugador', x + 6, y + 5, nameSize, { bold: true, color: COLORS.ink, maxWidth: width - 12 });
    text(`Cartón ${winner.cardNumber} · Cantado ${formatLocalTime(winner.claimedAt)}`, x + 6, y + 17, metaSize, { color: COLORS.muted, maxWidth: width - 12 });
    const ballText = winner.ballOrder ? `Tras bolilla ${winner.ballNumber} (salida ${winner.ballOrder})` : 'Momento de canto no disponible';
    text(ballText, x + 6, y + 27, metaSize, { color: winner.type === 'bingo' ? COLORS.pink : COLORS.purple2, bold: true, maxWidth: width - 12 });
    if (winner.winningLineLabel && !compact) text(winner.winningLineLabel, x + width - 6, y + 27, 5.3, { color: COLORS.muted, align: 'right', maxWidth: width * .42 });

    const grid = Array.isArray(winner.grid) ? winner.grid : [];
    const rowCount = Number(winner.mode) === 75 ? 5 : 3;
    const colCount = Number(winner.mode) === 75 ? 5 : 9;
    const gridTop = y + (compact ? 37 : 39);
    const gridBottomSpace = 5;
    const maxGridH = Math.max(18, height - (gridTop - y) - gridBottomSpace);
    const maxGridW = width - 12;
    const cellW = Math.min(maxGridW / colCount, (Number(winner.mode) === 75 ? maxGridH / rowCount * 1.12 : maxGridH / rowCount * 1.55));
    const cellH = Math.min(maxGridH / rowCount, Number(winner.mode) === 75 ? cellW : cellW * .64);
    const actualW = cellW * colCount;
    const actualH = cellH * rowCount;
    const gx = x + (width - actualW) / 2;
    const gy = gridTop + Math.max(0, (maxGridH - actualH) / 2);
    const winning = new Set((winner.winningNumbers || []).map(Number));
    const drawn = new Set((state.game?.drawn || []).map(Number));
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        const value = grid?.[r]?.[c];
        const cx = gx + c * cellW;
        const cy = gy + r * cellH;
        const isBlank = value === null || value === undefined;
        const isFree = value === 'LIBRE';
        const isWinner = winner.type === 'bingo' ? (!isBlank && (isFree || drawn.has(Number(value)))) : winning.has(Number(value));
        const fill = isBlank ? '#E9E5EC' : isWinner ? (winner.type === 'bingo' ? '#FFD2E4' : '#FFE9A4') : '#F8F6F9';
        const stroke = isWinner ? (winner.type === 'bingo' ? COLORS.pink : '#D19A08') : '#D7CFDB';
        rect(cx, cy, cellW, cellH, fill, stroke, isWinner ? .8 : .35);
        if (!isBlank) {
          const display = isFree ? 'LIBRE' : value;
          text(display, cx + cellW / 2, cy + Math.max(.5, cellH * .18), Math.max(3.1, Math.min(compact ? 5.2 : 6.8, cellH * .52)), { bold: isWinner, color: COLORS.ink, align: 'center', maxWidth: cellW - 1 });
        }
      }
    }
  };

  categories.forEach((category, index) => {
    const x = 24 + index * (blockW + blockGap);
    rect(x, blocksY, blockW, blockH, '#F7F2F9', '#D7C8DE', .8);
    rect(x, blocksY, blockW, 25, category.color);
    text(category.label, x + blockW / 2, blocksY + 7, categories.length > 4 ? 7.2 : 9.2, { bold: true, color: COLORS.white, align: 'center' });
    const winners = category.winners;
    if (!category.enabled) {
      text('No sorteada', x + blockW / 2, blocksY + 75, 10, { bold: true, color: COLORS.muted, align: 'center' });
      text('Esta categoría no estuvo habilitada.', x + blockW / 2, blocksY + 94, 6.8, { color: COLORS.muted, align: 'center' });
      return;
    }
    if (!winners.length) {
      text('Sin ganador confirmado', x + blockW / 2, blocksY + 75, 10, { bold: true, color: COLORS.muted, align: 'center' });
      text('La categoría quedó sin adjudicar.', x + blockW / 2, blocksY + 94, 6.8, { color: COLORS.muted, align: 'center' });
      return;
    }
    const display = winners.slice(0, 4);
    const cols = display.length <= 2 ? 1 : 2;
    const rows = Math.ceil(display.length / cols);
    const innerGap = 5;
    const innerX = x + 6;
    const innerY = blocksY + 31;
    const innerW = blockW - 12;
    const innerH = blockH - 37;
    const itemW = (innerW - innerGap * (cols - 1)) / cols;
    const itemH = (innerH - innerGap * (rows - 1)) / rows;
    display.forEach((winner, winnerIndex) => {
      const col = winnerIndex % cols;
      const row = Math.floor(winnerIndex / cols);
      drawMiniCard(winner, innerX + col * (itemW + innerGap), innerY + row * (itemH + innerGap), itemW, itemH);
    });
    if (winners.length > display.length) text(`+ ${winners.length - display.length} empate(s) adicional(es)`, x + blockW / 2, blocksY + blockH - 10, 5.5, { bold: true, color: COLORS.red, align: 'center' });
  });

  text(`Documento oficial generado al cerrar el sorteo · Sala ${acta.roomCode} · Ronda ${acta.round}`, 24, 582, 5.8, { color: COLORS.muted });
  text('BINGO GORDA 2026', 818, 582, 5.8, { bold: true, color: COLORS.purple2, align: 'right' });

  const stream = commands.join('\n');
  const logoPath = path.join(ROOT, 'assets', 'logo-pdf.jpg');
  const logo = fs.readFileSync(logoPath);
  const objects = [];
  const addObject = body => { objects.push(body); return objects.length; };
  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontRegularId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const imageId = addObject(Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width 360 /Height 360 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`, 'latin1'),
    logo,
    Buffer.from('\nendstream', 'latin1')
  ]));
  const contentBuffer = Buffer.from(stream, 'latin1');
  const contentId = addObject(Buffer.concat([
    Buffer.from(`<< /Length ${contentBuffer.length} >>\nstream\n`, 'latin1'),
    contentBuffer,
    Buffer.from('\nendstream', 'latin1')
  ]));
  const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << /Logo ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`;

  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const head = Buffer.from(`${index + 1} 0 obj\n`, 'latin1');
    const content = Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1');
    const tail = Buffer.from('\nendobj\n', 'latin1');
    parts.push(head, content, tail);
    length += head.length + content.length + tail.length;
  });
  const xrefOffset = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

function resultsFilename() {
  const date = (state.startedAt || nowIso()).slice(0, 10);
  return `Resultados_Bingo_${date}_Sala_${state.roomCode || 'sala'}.pdf`;
}

function actaPdf() {
  return buildResultsPdf();
}

function sendBuffer(res, status, buffer, contentType, filename) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(buffer);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

function serveFile(res, filePath) {
  const normalized = path.normalize(filePath);
  const assetRoot = `${path.join(ROOT, 'assets')}${path.sep}`;
  const jsRoot = `${path.join(ROOT, 'js')}${path.sep}`;
  const allowedHtml = new Set([
    path.join(ROOT, 'ABRIR_EL_BINGO_DE_LA_GORDA.html'),
    path.join(ROOT, 'jugador.html'),
    path.join(ROOT, 'admin-principal.html'),
    path.join(ROOT, 'transmision.html'),
    path.join(ROOT, 'reglamento.html'),
    path.join(ROOT, 'reglamento.pdf')
  ]);
  const allowed = allowedHtml.has(normalized) || normalized.startsWith(assetRoot) || normalized.startsWith(jsRoot);
  if (!allowed) return sendJson(res, 403, { error: 'Acceso denegado.' });
  fs.stat(normalized, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: 'Archivo no encontrado.' });
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(normalized).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': path.extname(normalized) === '.html' ? 'no-store' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin'
    });
    fs.createReadStream(normalized).pipe(res);
  });
}

function findWorkspaceByRoomCode(roomCode) {
  const normalized = String(roomCode || '').trim().toUpperCase();
  if (!normalized) return null;
  return [...workspaces.values()].find(workspace => String(workspace.state.roomCode || '').toUpperCase() === normalized) || null;
}

function findWorkspaceByPlayerToken(token) {
  const normalized = String(token || '');
  if (!normalized) return null;
  return [...workspaces.values()].find(workspace => workspace.state.players?.some(player => player.sessionToken === normalized)) || null;
}

function findWorkspaceByTransfer(requestId, deviceId = '') {
  return [...workspaces.values()].find(workspace => workspace.state.deviceTransferRequests?.some(request => request.id === String(requestId || '') && (!deviceId || request.deviceId === String(deviceId)))) || null;
}

function findWorkspaceByBroadcastToken(token) {
  const normalized = String(token || '');
  if (!normalized) return null;
  return [...workspaces.values()].find(workspace => workspace.state.roomSettings?.broadcastToken === normalized) || null;
}

function masterStatePayload() {
  return { version: APP_PUBLIC_VERSION, now: nowIso(), ownerUrl: `${PUBLIC_URL || `http://localhost:${PORT}`}/admin`, operatorsEnabled: false };
}

async function handleMasterApi(req, res, url) {
  if (url.pathname === '/api/master/login' && req.method === 'POST') {
    if (!consumeRate(req, 'master-login', 15, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
    const payload = await readJson(req);
    const localWithoutPassword = !ONLINE_MODE && isLoopback(req) && !MASTER_ADMIN_PASSWORD;
    if (!localWithoutPassword) {
      if (!MASTER_ADMIN_PASSWORD) return sendJson(res, 503, { error: 'Falta configurar MASTER_ADMIN_PASSWORD o ADMIN_PASSWORD.' });
      if (!safeEqual(payload.password || '', MASTER_ADMIN_PASSWORD)) return sendJson(res, 401, { error: 'Contraseña principal incorrecta.' });
    }
    const masterToken = createMasterSession();
    const adminToken = createAdminSession({ workspaceId: 'owner', role: 'owner' });
    return sendJson(res, 200, { token: masterToken, adminToken, expiresInHours: 24 });
  }
  if (!isMasterAuthorized(req, url)) return sendJson(res, 401, { error: 'Ingresá al panel principal.' });
  if (url.pathname === '/api/master/state' && req.method === 'GET') return sendJson(res, 200, masterStatePayload());
  if (url.pathname === '/api/master/admin-session' && req.method === 'POST') {
    return sendJson(res, 200, { adminToken: createAdminSession({ workspaceId: 'owner', role: 'owner' }) });
  }
  if (url.pathname.startsWith('/api/master/operators')) return sendJson(res, 410, { error: 'Los administradores temporales están deshabilitados en esta versión.' });
  if (url.pathname === '/api/master/logout' && req.method === 'POST') {
    masterSessions.delete(masterTokenFrom(req, url));
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'Acción principal no encontrada.' });
}

async function dispatchAdminApi(req, res, url, session) {
  if (url.pathname === '/api/admin/state' && req.method === 'GET') return sendJson(res, 200, adminPayload());
  if (url.pathname === '/api/admin/configure' && req.method === 'POST') {
    const payload = await readJson(req);
    return sendJson(res, 200, configureRoom(payload));
  }
  if (url.pathname === '/api/admin/new-room' && req.method === 'POST') {
    assertOperatorMayStartNewGame(session);
    return sendJson(res, 200, newRoomState());
  }
  if (url.pathname === '/api/admin/game' && req.method === 'POST') return sendJson(res, 200, updateGame((await readJson(req)).game));
  if (url.pathname === '/api/admin/start' && req.method === 'POST') return sendJson(res, 200, startRoom());
  if (url.pathname === '/api/admin/pause' && req.method === 'POST') return sendJson(res, 200, pauseRoom());
  if (url.pathname === '/api/admin/resume' && req.method === 'POST') return sendJson(res, 200, resumeRoom(await readJson(req)));
  if (url.pathname === '/api/admin/resolve-device-transfer' && req.method === 'POST') return sendJson(res, 200, resolveDeviceTransfer(await readJson(req)));
  if (url.pathname === '/api/admin/finish' && req.method === 'POST') return sendJson(res, 200, finishRoom());
  if (url.pathname === '/api/admin/assignment-timer' && req.method === 'POST') return sendJson(res, 200, controlAssignmentTimer(await readJson(req)));
  if (url.pathname === '/api/admin/settings' && req.method === 'POST') return sendJson(res, 200, updateRoomSettings(await readJson(req)));
  if (url.pathname === '/api/admin/message' && req.method === 'POST') return sendJson(res, 200, updateAdminMessage(await readJson(req)));
  if (url.pathname === '/api/admin/release-selection' && req.method === 'POST') return sendJson(res, 200, releasePlayerSelection(await readJson(req)));
  if (url.pathname === '/api/admin/assign-player' && req.method === 'POST') return sendJson(res, 200, assignCardsToPlayer(await readJson(req)));
  if (url.pathname === '/api/admin/test-event' && req.method === 'POST') return sendJson(res, 200, sendTestEvent(await readJson(req)));
  if (url.pathname === '/api/admin/resolve' && req.method === 'POST') return sendJson(res, 200, resolveClaim(await readJson(req)));
  if (url.pathname === '/api/admin/acta' && req.method === 'GET') return sendJson(res, 200, actaPayload());
  if (url.pathname === '/api/admin/acta.csv' && req.method === 'GET') return sendBuffer(res, 200, Buffer.from(actaCsv(), 'utf8'), 'text/csv; charset=utf-8', `Bingo_Acta_${state.roomCode || 'sala'}.csv`);
  if (url.pathname === '/api/admin/participants.csv' && req.method === 'GET') return sendBuffer(res, 200, Buffer.from(participantsCsv(), 'utf8'), 'text/csv; charset=utf-8', `Bingo_Jugadores_${state.roomCode || 'sala'}.csv`);
  if (url.pathname === '/api/admin/acta.pdf' && req.method === 'GET') return sendBuffer(res, 200, actaPdf(), 'application/pdf', `Bingo_Acta_${state.roomCode || 'sala'}.pdf`);
  if (url.pathname === '/api/admin/backup' && req.method === 'GET') return sendJson(res, 200, backupPayload());
  if (url.pathname === '/api/admin/restore' && req.method === 'POST') return sendJson(res, 200, restoreBackup(await readJson(req)));
  if (url.pathname === '/api/admin/close' && req.method === 'POST') { closeRoom(); return sendJson(res, 200, { ok: true }); }
  if (url.pathname === '/api/admin/logout' && req.method === 'POST') { adminSessions.delete(adminTokenFrom(req, url)); return sendJson(res, 200, { ok: true }); }
  return sendJson(res, 404, { error: 'Acción de administrador no encontrada.' });
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname.startsWith('/api/master/')) return await handleMasterApi(req, res, url);
    if (url.pathname === '/api/ping' && req.method === 'GET') return sendJson(res, 200, { ok: true, at: nowIso(), version: APP_PUBLIC_VERSION });

    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      if (!consumeRate(req, 'admin-login', 30, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      const payload = await readJson(req);
      if (payload.operatorAccessToken) return sendJson(res, 410, { error: 'Los accesos temporales están deshabilitados.' });
      const localWithoutPassword = !ONLINE_MODE && isLoopback(req) && !MASTER_ADMIN_PASSWORD;
      if (!localWithoutPassword) {
        if (!MASTER_ADMIN_PASSWORD) return sendJson(res, 503, { error: 'Falta configurar MASTER_ADMIN_PASSWORD o ADMIN_PASSWORD.' });
        if (!safeEqual(payload.password || '', MASTER_ADMIN_PASSWORD)) return sendJson(res, 401, { error: 'Contraseña de administrador incorrecta.' });
      }
      const token = createAdminSession({ workspaceId: 'owner', role: 'owner' });
      return sendJson(res, 200, { token, role: 'owner', expiresInHours: 24, onlineMode: ONLINE_MODE });
    }

    if (url.pathname.startsWith('/api/admin/')) {
      const session = adminSessionFrom(req, url);
      if (!session) return sendJson(res, 401, { error: 'Ingresá como administrador.' });
      const workspace = workspaces.get(session.workspaceId) || ownerWorkspace;
      return await workspaceContext.run(workspace, () => dispatchAdminApi(req, res, url, session));
    }

    if (url.pathname === '/api/info' && req.method === 'GET') {
      const workspace = findWorkspaceByRoomCode(url.searchParams.get('sala')) || ownerWorkspace;
      return workspaceContext.run(workspace, () => sendJson(res, 200, { ...baseInfo(), port: PORT, lanUrls: getLanAddresses().map(ip => `http://${ip}:${PORT}/jugador`), active: state.active, status: state.status, roomCode: state.roomCode }));
    }

    if (url.pathname === '/api/results.pdf' && req.method === 'GET') {
      const requestedRoom = String(url.searchParams.get('sala') || '').trim().toUpperCase();
      let workspace = requestedRoom ? findWorkspaceByRoomCode(requestedRoom) : ownerWorkspace;
      if (!workspace && requestedRoom) workspace = [...workspaces.values()].find(item => String(item.lastResultMeta?.roomCode || '').toUpperCase() === requestedRoom) || null;
      if (!workspace) throw new Error('No se encontró un resultado finalizado para esa sala.');
      return workspaceContext.run(workspace, () => {
        const meta = currentWorkspace().lastResultMeta;
        if (requestedRoom && String(state.roomCode || '').toUpperCase() === requestedRoom && state.active && state.game) {
          if (state.status !== 'finished') throw new Error('Los resultados estarán disponibles cuando finalice el sorteo.');
          return sendBuffer(res, 200, buildResultsPdf(), 'application/pdf', resultsFilename());
        }
        if (meta && fs.existsSync(currentWorkspace().resultPdfFile) && (!requestedRoom || String(meta.roomCode).toUpperCase() === requestedRoom)) {
          return sendBuffer(res, 200, fs.readFileSync(currentWorkspace().resultPdfFile), 'application/pdf', meta.filename || 'Resultados_Bingo.pdf');
        }
        throw new Error('No hay un sorteo finalizado disponible.');
      });
    }

    if (url.pathname === '/api/broadcast/state' && req.method === 'GET') {
      const workspace = findWorkspaceByBroadcastToken(url.searchParams.get('token'));
      if (!workspace) return sendJson(res, 404, { error: 'Enlace de transmisión no válido.' });
      return workspaceContext.run(workspace, () => sendJson(res, 200, broadcastPayload()));
    }

    if (url.pathname === '/api/player/login' && req.method === 'POST') {
      if (!consumeRate(req, 'player-login', 60, 10 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      const payload = await readJson(req);
      const workspace = findWorkspaceByRoomCode(payload.roomCode);
      if (!workspace) throw new Error('No se encontró esa sala.');
      return workspaceContext.run(workspace, () => { const result = loginPlayer(payload); return sendJson(res, result.conflict ? 409 : 200, result); });
    }
    if (url.pathname === '/api/player/request-transfer' && req.method === 'POST') {
      const payload = await readJson(req);
      const workspace = findWorkspaceByRoomCode(payload.roomCode);
      if (!workspace) throw new Error('No se encontró esa sala.');
      return workspaceContext.run(workspace, () => sendJson(res, 200, requestDeviceTransfer(payload)));
    }
    if (url.pathname === '/api/player/transfer-status' && req.method === 'POST') {
      const payload = await readJson(req);
      const workspace = findWorkspaceByTransfer(payload.requestId, payload.deviceId);
      if (!workspace) throw new Error('No se encontró la solicitud.');
      return workspaceContext.run(workspace, () => sendJson(res, 200, deviceTransferStatus(payload)));
    }
    if (url.pathname.startsWith('/api/player/')) {
      const token = req.headers['x-player-token'] || url.searchParams.get('token');
      const workspace = findWorkspaceByPlayerToken(token);
      if (!workspace) return sendJson(res, 401, { error: 'La sesión no es válida. Volvé a ingresar con tu código.' });
      return await workspaceContext.run(workspace, async () => {
        const player = playerByToken(token);
        if (!player) return sendJson(res, 401, { error: 'La sesión no es válida.' });
        if (url.pathname === '/api/player/state' && req.method === 'GET') return sendJson(res, 200, playerPayload(player));
        if (url.pathname === '/api/player/reserve' && req.method === 'POST') return sendJson(res, 200, reserveCard(player, await readJson(req)));
        if (url.pathname === '/api/player/renew-offers' && req.method === 'POST') return sendJson(res, 200, renewOffers(player));
        if (url.pathname === '/api/player/name' && req.method === 'POST') return sendJson(res, 200, setPlayerName(player, await readJson(req)));
        if (url.pathname === '/api/player/choose' && req.method === 'POST') return sendJson(res, 200, chooseCards(player, await readJson(req)));
        if (url.pathname === '/api/player/release' && req.method === 'POST') return sendJson(res, 200, releaseOwnSelection(player));
        if (url.pathname === '/api/player/mark' && req.method === 'POST') return sendJson(res, 200, markNumber(player, await readJson(req)));
        if (url.pathname === '/api/player/automark' && req.method === 'POST') return sendJson(res, 200, setAutoMark(player, await readJson(req)));
        if (url.pathname === '/api/player/presenter' && req.method === 'POST') return sendJson(res, 200, setPlayerPresenter(player, await readJson(req)));
        if (url.pathname === '/api/player/claim' && req.method === 'POST') return sendJson(res, 200, createClaim(player, await readJson(req)));
        return sendJson(res, 404, { error: 'Acción de jugador no encontrada.' });
      });
    }
    return sendJson(res, 404, { error: 'API no encontrada.' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'No se pudo completar la acción.' });
  }
}

function handleEvents(req, res, url) {
  const role = url.searchParams.get('role');
  let workspace = null;
  let player = null;
  let token = url.searchParams.get('token') || '';
  if (role === 'admin') {
    token = url.searchParams.get('adminToken') || '';
    const session = adminSessionFrom(req, url);
    if (!session) return sendJson(res, 401, { error: 'Acceso de administrador denegado.' });
    workspace = workspaces.get(session.workspaceId) || null;
  } else if (role === 'player') {
    workspace = findWorkspaceByPlayerToken(token);
    if (workspace) player = workspace.state.players.find(item => item.sessionToken === token) || null;
    if (!player) return sendJson(res, 401, { error: 'Sesión inválida.' });
  } else if (role === 'broadcast') {
    workspace = findWorkspaceByBroadcastToken(url.searchParams.get('broadcastToken'));
    token = url.searchParams.get('broadcastToken') || '';
    if (!workspace) return sendJson(res, 401, { error: 'Transmisión no válida.' });
  } else return sendJson(res, 400, { error: 'Rol inválido.' });
  if (!workspace) return sendJson(res, 401, { error: 'Acceso inválido.' });
  return workspaceContext.run(workspace, () => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff'
    });
    res.write(': conectado\n\n');
    const client = { res, role, token, playerId: player?.id || null };
    sseClients.add(client);
    if (role === 'admin') writeSse(res, 'state', adminPayload());
    else if (role === 'broadcast') writeSse(res, 'state', broadcastPayload());
    else writeSse(res, 'state', playerPayload(player));
    req.on('close', () => workspaceContext.run(workspace, () => sseClients.delete(client)));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, version: APP_PUBLIC_VERSION, workspaces: workspaces.size });
  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('User-agent: *\nDisallow: /admin\nDisallow: /admin-principal\nDisallow: /operador\nDisallow: /transmision\n');
  }
  if (url.pathname === '/api/events' && req.method === 'GET') return handleEvents(req, res, url);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);

  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/admin-principal' });
    return res.end();
  }
  if (url.pathname === '/admin-principal' || url.pathname === '/admin-principal/') return serveFile(res, path.join(ROOT, 'admin-principal.html'));
  if (url.pathname === '/admin' || url.pathname === '/admin/') return serveFile(res, path.join(ROOT, 'ABRIR_EL_BINGO_DE_LA_GORDA.html'));
  if (/^\/operador\/[^/]+\/?$/.test(url.pathname)) return sendJson(res, 404, { error: 'Los accesos temporales están deshabilitados.' });
  if (/^\/transmision\/[^/]+\/?$/.test(url.pathname)) return serveFile(res, path.join(ROOT, 'transmision.html'));
  if (url.pathname === '/jugador' || url.pathname === '/jugador/') return serveFile(res, path.join(ROOT, 'jugador.html'));
  if (url.pathname === '/reglamento' || url.pathname === '/reglamento/' || url.pathname === '/reglamento.html') return serveFile(res, path.join(ROOT, 'reglamento.html'));
  if (url.pathname === '/reglamento.pdf') return serveFile(res, path.join(ROOT, 'reglamento.pdf'));
  const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!(relative.startsWith('assets/') || relative.startsWith('js/'))) return sendJson(res, 404, { error: 'Archivo no encontrado.' });
  return serveFile(res, path.join(ROOT, relative));
});

setInterval(() => {
  for (const workspace of workspaces.values()) {
    workspaceContext.run(workspace, () => {
      try { processAssignmentDeadline(); }
      catch (error) { console.error(`No se pudo completar la asignación automática en ${workspace.id}:`, error.message); }
    });
  }
}, 1000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions) if (!session || session.expiresAt <= now) adminSessions.delete(token);
  for (const [token, expiresAt] of masterSessions) if (expiresAt <= now) masterSessions.delete(token);
  for (const workspace of workspaces.values()) {
    workspaceContext.run(workspace, () => {
      if (state.active && state.status === 'waiting' && purgeExpiredReservations()) {
        refreshAllOffers(); saveState(); broadcast();
      }
      for (const client of [...sseClients]) {
        try { client.res.write(': ping\n\n'); }
        catch { sseClients.delete(client); }
      }
    });
  }
}, 20_000).unref();

for (const workspace of workspaces.values()) workspaceContext.run(workspace, () => scheduleTransition());

server.listen(PORT, HOST, () => {
  console.log('\nBINGO GORDA 2026');
  const base = PUBLIC_URL || `http://localhost:${PORT}`;
  console.log(`Panel principal: ${base}/admin-principal`);
  console.log(`Administrador propio: ${base}/admin`);
  console.log(`Jugadores: ${base}/jugador`);
  if (ONLINE_MODE && !MASTER_ADMIN_PASSWORD) console.warn('ATENCIÓN: falta configurar MASTER_ADMIN_PASSWORD o ADMIN_PASSWORD.');
  if (!ONLINE_MODE) {
    const target = `http://localhost:${PORT}/admin-principal`;
    const command = process.platform === 'win32' ? `start "" "${target}"` : process.platform === 'darwin' ? `open "${target}"` : `xdg-open "${target}"`;
    exec(command, () => {});
  }
  console.log(`Límites por sala: ${MAX_PLAYERS} jugadores · ${MAX_CARDS} cartones · ${MAX_CARDS_PER_PLAYER} por jugador\n`);
});
