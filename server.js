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
const TEST_MODE = process.env.BINGO_TEST_MODE === 'true';
const DATA_DIR = process.env.BINGO_DATA_DIR ? path.resolve(process.env.BINGO_DATA_DIR) : path.join(ROOT, 'data');
const OWNER_STATE_FILE = path.join(DATA_DIR, 'sala-online.json');
const PLATFORM_FILE = path.join(DATA_DIR, 'plataforma.json');
const WORKSPACES_DIR = path.join(DATA_DIR, 'operadores');
const HISTORY_DIR = path.join(DATA_DIR, 'historial');
const CARD_LOTS_DIR = path.join(DATA_DIR, 'cartones');
const EVENTS_DIR = path.join(DATA_DIR, 'eventos');
const EVENT_ASSETS_DIR = path.join(EVENTS_DIR, 'assets');
const EVENT_LOTS_DIR = path.join(EVENTS_DIR, 'tandas');
const COMMUNITY_BANNERS_DIR = path.join(DATA_DIR, 'community-banners');
const OPERATIONAL_WORKSPACE_IDS = ['owner', ...Array.from({ length: 9 }, (_, index) => `slot${index + 2}`)];
const MAX_OPERATIONAL_ROOMS = OPERATIONAL_WORKSPACE_IDS.length;
const COMMUNITY_HOST_TTL_MS = 8 * 60 * 60 * 1000;
const COMMUNITY_ROOM_RESERVATION_MS = Math.max(15 * 60 * 1000, Number(process.env.BINGO_COMMUNITY_RESERVATION_MS || 2 * 60 * 60 * 1000));
const COMMUNITY_PUBLIC_OPEN_MS = Math.max(1_000, Number(process.env.BINGO_COMMUNITY_PUBLIC_OPEN_MS || 2 * 60 * 60 * 1000));
const COMMUNITY_PUBLIC_MAX_AHEAD_MS = 36 * 60 * 60 * 1000;
const COMMUNITY_PUBLIC_ESTIMATED_GAME_MS = 2 * 60 * 60 * 1000;
const COMMUNITY_FINISH_GRACE_MS = Math.max(TEST_MODE ? 150 : 15_000, Number(process.env.BINGO_COMMUNITY_FINISH_GRACE_MS || 3 * 60 * 1000));
const COMMUNITY_ROOM_ACCESS_COOKIE = 'bingo_community_room_access';
const COMMUNITY_ROOM_ACCESS_TTL_MS = 30 * 60 * 1000;
const PORT = Number(process.env.PORT || 3210);
const HOST = '0.0.0.0';
const ONLINE_MODE = process.env.RENDER === 'true' || process.env.ONLINE_MODE === 'true';
const PUBLIC_URL = String(process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const CAST_APP_ID = String(process.env.CAST_APP_ID || '').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const MASTER_ADMIN_PASSWORD = String(process.env.MASTER_ADMIN_PASSWORD || ADMIN_PASSWORD || '');
const BINGO_TIMEZONE = String(process.env.BINGO_TIMEZONE || 'America/Argentina/Buenos_Aires');
const MIN_CARDS = 2;
const MAX_CARDS = 250;
const MAX_ACTIVE_CARDS = 250;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 60;
const EVENT_MAX_PLAYERS = 150;
const EVENT_MAX_LOT_CARDS = 1000;
const EVENT_MAX_ACTIVE_CARDS = 250;
const EVENT_90_MAX_SHARED = 6;
const EVENT_75_MAX_SHARED = 13;
function event90SharedLimitForCount(count) { return Number(count) > 500 ? 7 : EVENT_90_MAX_SHARED; }
const MAX_CARDS_PER_PLAYER = 4;
const MAX_CARD_OPTIONS = 10;
const MIN_ASSIGNMENT_MINUTES = 1;
const MAX_ASSIGNMENT_MINUTES = 30;
const CARD_RESERVATION_TTL_MS = 2 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CLAIM_QUEUE_WINDOW_MS = Math.max(100, Number(process.env.BINGO_CLAIM_WINDOW_MS || 3000));
const CLAIM_ADMIN_AUTO_VERIFY_MS = Math.max(TEST_MODE ? 200 : 1000, Number(process.env.BINGO_CLAIM_AUTO_VERIFY_MS || 10_000));
const FINAL_CLAIM_GRACE_MS = Math.max(1000, Number(process.env.BINGO_FINAL_CLAIM_GRACE_MS || 5000));
const TEST_EVENT_TTL_MS = 20 * 1000;
const START_SEQUENCE_MS = Math.max(100, Number(process.env.BINGO_START_SEQUENCE_MS || 25_000));
const LARGE_ROOM_NOTICE_THRESHOLD = Math.max(2, Number(process.env.BINGO_LARGE_ROOM_NOTICE_THRESHOLD || 20));
const LARGE_ROOM_NOTICE_MS = Math.max(1000, Number(process.env.BINGO_LARGE_ROOM_NOTICE_MS || 6_000));
const LARGE_ROOM_NOTICE_TITLE = 'CRITERIO DE GANADORES';
const LARGE_ROOM_NOTICE_TEXT = 'Si varios cartones completan la misma jugada con una misma bolilla, tendrá prioridad el reclamo que sea recibido y validado primero por el servidor central. Los reclamos válidos recibidos posteriormente quedarán registrados en el acta como “VÁLIDA POSTERIOR”, conservando su orden de recepción. Este procedimiento permite determinar de forma objetiva y transparente la prioridad entre reclamos simultáneos.';
const RESUME_SEQUENCE_MS = Math.max(100, Number(process.env.BINGO_RESUME_SEQUENCE_MS || 5_000));
const CLAIM_AUTO_RESUME_MS = Math.max(1_000, Number(process.env.BINGO_CLAIM_AUTO_RESUME_MS || 5_000));
const ADMIN_CONTINGENCY_MS = Math.max(TEST_MODE ? 100 : 5_000, Number(process.env.BINGO_ADMIN_CONTINGENCY_MS || 60_000));
const FINAL_BALLS_SEQUENCE_MS = Math.max(250, Number(process.env.BINGO_FINAL_BALLS_SEQUENCE_MS || 8_000));
const FINAL_BALLS_LEAD_IN_MS = Math.max(250, Number(process.env.BINGO_FINAL_BALLS_LEAD_IN_MS || 5_500));
const FINAL_BALLS_MIN_INTERVAL_MS = Math.max(80, Number(process.env.BINGO_FINAL_BALLS_MIN_INTERVAL_MS || 180));
const FINAL_BALLS_MAX_INTERVAL_MS = Math.max(FINAL_BALLS_MIN_INTERVAL_MS, Number(process.env.BINGO_FINAL_BALLS_MAX_INTERVAL_MS || 850));
const MAX_TIE_WINNERS_PER_PRIZE = 4;
const MANUAL_MARK_MAX_PLAYERS = 10;
const MANUAL_MARK_MAX_CARDS = 40;
const CHAT_MAX_MESSAGES = 100;
const CHAT_MAX_LENGTH = 160;
const CHAT_COOLDOWN_MS = 2000;
const CHAT_STICKER_COOLDOWN_MS = 1200;
const CHAT_STICKER_WINDOW_MS = 10 * 1000;
const CHAT_STICKER_WINDOW_MAX = 4;
const CHAT_STICKER_IDS = new Set(['gorda-risa','gorda-festejo','gorda-dinero','gorda-ay-no','gorda-enojada','corazon','aplausos','suerte','dinero','ira','explosion','cerveza']);
const COMMUNITY_CHAT_MAX_MESSAGES = 120;
const COMMUNITY_CHAT_MAX_LENGTH = 180;
const COMMUNITY_CHAT_COOLDOWN_MS = 1800;
const COMMUNITY_STICKER_COOLDOWN_MS = 1200;
const COMMUNITY_STICKER_WINDOW_MS = 10 * 1000;
const COMMUNITY_STICKER_WINDOW_MAX = 4;
const COMMUNITY_ONLINE_TTL_MS = 45 * 1000;
const COMMUNITY_FILTER_MAX_TERMS = 200;
const COMMUNITY_FILTER_TERM_MAX_LENGTH = 60;
const COMMUNITY_REPORT_WINDOW_MS = 60 * 60 * 1000;
const COMMUNITY_REPORT_WINDOW_MAX = 12;
const COMMUNITY_RESERVED_NAMES = /^(la\s*gorda|administraci[oó]n|admin|administrador(?:a)?|sistema|moderador(?:a)?|staff|oficial)$/i;
const DEMO_TTL_MS = 30 * 60 * 1000;
const DEMO_SESSION_COOKIE = 'bingo_demo_session';
const PLAYER_SESSION_COOKIE = 'bingo_player_session';
const PLAYER_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const PLAYER_RECOVERY_TTL_MS = 15 * 60 * 1000;
const INVITATION_ACTIVATION_TTL_MS = 2 * 60 * 1000;
const DEMO_IDLE_TTL_MS = 15 * 60 * 1000;
const DEMO_CLAIM_WINDOW_MS = 1600;
const DEMO_START_SEQUENCE_MS = 1200;
const DEMO_READY_COUNTDOWN_MS = Math.max(100, Number(process.env.BINGO_DEMO_READY_COUNTDOWN_MS || (TEST_MODE ? 180 : 5000)));
const DEMO_RESUME_SEQUENCE_MS = 1400;
const DEMO_FINAL_SEQUENCE_MS = 2600;
const APP_PUBLIC_VERSION = 'EL BINGO DE LA GORDA';
const PRIZE_TYPES = ['ambo', 'line', 'doubleLine', 'tripleLine', 'corners', 'bingo'];
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
fs.mkdirSync(HISTORY_DIR, { recursive: true });
fs.mkdirSync(CARD_LOTS_DIR, { recursive: true });
fs.mkdirSync(EVENTS_DIR, { recursive: true });
fs.mkdirSync(EVENT_ASSETS_DIR, { recursive: true });
fs.mkdirSync(EVENT_LOTS_DIR, { recursive: true });
fs.mkdirSync(COMMUNITY_BANNERS_DIR, { recursive: true });

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
const normalizeAccessKey = value => String(value || '')
  .trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9_-]/g, '').slice(0, 20);

const randomNumericCode = (length = 6) => {
  let value = '';
  for (let i = 0; i < length; i++) value += String(crypto.randomInt(i === 0 ? 1 : 0, 10));
  return value;
};
const uniqueNumbers = values => [...new Set((values || []).map(Number).filter(Number.isFinite))];
const cardNumbers = card => (card?.grid || []).flat().filter(value => typeof value === 'number');
const PRESENTER_ID = 'vero';
const DEMO_AI_NAME_POOL = ['Zoe', 'Mateo', 'Owen'];
const ADMIN_SIMULATION_NAME_POOL = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fabián', 'Gabi', 'Hugo', 'Inés', 'Julián', 'Karen', 'Leo', 'Mara', 'Nico', 'Olga', 'Pablo', 'Romi', 'Santi', 'Tania', 'Ulises', 'Valen', 'Walter', 'Ximena', 'Yamila', 'Abril', 'Beto', 'Ceci', 'Damián', 'Eva', 'Franco'];
function adminSimulationName(index) {
  const base = ADMIN_SIMULATION_NAME_POOL[index % ADMIN_SIMULATION_NAME_POOL.length];
  const cycle = Math.floor(index / ADMIN_SIMULATION_NAME_POOL.length);
  return cycle ? `${base} ${cycle + 1}` : base;
}
const playerDisplayName = player => String(player?.name || player?.slotLabel || 'Acceso sin nombre').trim();
function normalizePlayerName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
}
function canonicalPlayerName(value) {
  return normalizePlayerName(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}
function validatePlayerName(value, playerId = null) {
  const name = normalizePlayerName(value);
  if (name.length < 2) throw new Error('Escribí un nombre o apodo de al menos 2 caracteres.');
  if (/^(jugador|player|invitado)(?:\s*[x#_-]?\s*\d*)?$/i.test(name)) throw new Error('Elegí un nombre o apodo propio. No se permite usar “Jugador X”.');
  const canonical = canonicalPlayerName(name);
  if (canonical.length < 2) throw new Error('Usá al menos 2 letras o números en tu nombre/apodo.');
  if (COMMUNITY_RESERVED_NAMES.test(name)) throw new Error('Ese nombre está reservado para la administración. Elegí otro.');
  const duplicate = state.players?.find(item => item.id !== playerId && item.nameSet && canonicalPlayerName(item.name) === canonical);
  if (duplicate) throw new Error('Ese nombre ya está en uso en esta sala. Elegí otro.');
  return name;
}

function normalizeTransmissionSettings(value = {}) {
  const rotationSeconds = Number(value?.rotationSeconds);
  return {
    showChat: value?.showChat !== false,
    showCards: value?.showCards !== false,
    showNames: value?.showNames !== false,
    showProgress: value?.showProgress !== false,
    rotationSeconds: [15, 20, 30, 60].includes(rotationSeconds) ? rotationSeconds : 30
  };
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
  if (claim?.type === 'line') {
    if (claim?.winningLineKey) {
      const selected = lines.find(line => line.key === claim.winningLineKey);
      if (selected) return [selected];
    }
    return lines.slice(0, 1);
  }
  if (claim?.type === 'corners') return claim?.comparison?.cornerDetails || [];
  if (claim?.type === 'ambo') return claim?.comparison?.amboDetails?.slice(0, 1) || [];
  return [];
}

function consumedLineKeysForCard(cardId) {
  return new Set(state.claims
    .filter(claim => claim.type === 'line' && claim.cardId === cardId && claim.status === 'confirmed')
    .map(claim => claim.winningLineKey || claim?.comparison?.completeLines?.[0]?.key)
    .filter(Boolean));
}

function nextUnclaimedLineDetail(cardId, analysis) {
  const consumed = consumedLineKeysForCard(cardId);
  return (analysis?.completeLines || []).find(line => !consumed.has(line.key)) || null;
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
    version: 202602,
    revision: 0,
    active: false,
    status: 'closed',
    roomCode: null,
    communityHostKeyHash: null,
    communityHostName: '',
    communityHostExpiresAt: null,
    communityCreatorCodeHash: null,
    communityCreatorPlayerId: null,
    communityAccessKeyHash: null,
    communityRematch: null,
    createdAt: null,
    startedAt: null,
    endedAt: null,
    closedReason: '',
    updatedAt: nowIso(),
    round: 1,
    roomSettings: {
      playerAudioAllowed: true,
      playerAudioDefault: true,
      linePrizeCount: 1,
      bingoPrizeCount: 1,
      allowSamePlayerSecondLine: true,
      tiePolicy: 'first_claim',
      claimMode: 'manual',
      gameType: 'real',
      whatsapp: '',
      argentinaHint: true,
      broadcastToken: null,
      broadcastAlias: null,
      roomType: 'alpha',
      roomOrigin: 'official',
      hostName: '',
      roomName: '',
      communityPublicId: '',
      communityStartMode: '',
      communityAccessType: 'public',
      joinOpen: true,
      maxOpenPlayers: 60,
      communityScheduleId: '',
      scheduledAt: '',
      scheduledRegistrationMinutes: 15,
      scheduledAutoStart: false,
      accessKey: '',
      maxCardsPerPlayer: 4,
      markingMode: 'normal',
      claimAutoVerifySeconds: 10,
      presenterVoiceGender: 'female',
      transmission: normalizeTransmissionSettings()
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
    adminContingency: { disconnectedSince: null, activatesAt: null, autoVerificationActive: false, activatedAt: null },
    transition: null,
    pauseReason: null,
    deviceTransferRequests: [],
    testEvent: null,
    drawOrder: [],
    claimSequence: 0,
    claimWindow: null,
    testDrawOrderFixed: false,
    chat: { enabled: true, locked: false, messages: [], mutedPlayerIds: [], lastSentAt: {} },
    demo: null,
    waitingGame: { type: 'both', leaderboard: [], leaderboards: { red_black: [], higher_lower: [] } },
    game: null,
    players: [],
    cardReservations: {},
    claims: [],
    eventLog: []
  };
}

function ensureUniqueVisibleCardNumbers(cards = []) {
  const used = new Set();
  let next = 1;
  for (const card of cards || []) {
    let value = String(card?.number || '').trim();
    const key = value.toLocaleLowerCase('es');
    if (!value || used.has(key)) {
      while (used.has(String(next).padStart(3,'0').toLocaleLowerCase('es'))) next += 1;
      value = String(next).padStart(3,'0');
      card.number = value;
      card.name = `Cartón ${value}`;
      card.originalName = card.originalName || card.name;
      next += 1;
    }
    used.add(String(card.number).trim().toLocaleLowerCase('es'));
  }
  return cards;
}

const LEGACY_ROOM_FINANCIAL_KEYS = ['paymentMode','cardPrice','paymentAlias','paymentAccountHolder','paymentProvider','prizeAmounts'];
const LEGACY_PLAYER_FINANCIAL_KEYS = ['paymentStatus','paymentConfirmedAt','paymentReportedAt','paymentTransferDni','paymentTransferHolder','paymentChangeRequestedCount','paymentChangeRequestedAt','prizePayoutAlias','prizePayoutAccountHolder','prizePayoutProvider','prizePayoutUpdatedAt'];
const LEGACY_COMMUNITY_FINANCIAL_KEYS = ['supportEnabled','supportRecipient','supportWallet','supportCustomAlias','supportCustomHolder','supportCustomWallet','supportTitle','supportMessage'];
const LEGACY_SCHEDULE_FINANCIAL_KEYS = ['paymentMode','cardPrice','paymentAlias','paymentAccountHolder','paymentProvider'];

function omitLegacyKeys(value, keys) {
  const source = value && typeof value === 'object' ? value : {};
  const cleaned = { ...source };
  for (const key of keys) delete cleaned[key];
  return cleaned;
}

function hasLegacyKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && keys.some(key => Object.prototype.hasOwnProperty.call(value, key)));
}

function backupLegacyJsonFile(file) {
  try {
    if (!file || !fs.existsSync(file)) return;
    const backup = `${file}.pre-free-v6.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  } catch {}
}

function writeJsonAtomic(file, value) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function loadState(stateFile = OWNER_STATE_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const defaults = blankState();
    const legacyFinance = hasLegacyKeys(parsed.roomSettings, LEGACY_ROOM_FINANCIAL_KEYS)
      || (Array.isArray(parsed.players) && parsed.players.some(player => hasLegacyKeys(player, LEGACY_PLAYER_FINANCIAL_KEYS)));
    if (legacyFinance) backupLegacyJsonFile(stateFile);
    const merged = {
      ...defaults,
      ...parsed,
      roomSettings: { ...defaults.roomSettings, ...omitLegacyKeys(parsed.roomSettings || {}, LEGACY_ROOM_FINANCIAL_KEYS) },
      assignmentTimer: { ...defaults.assignmentTimer, ...(parsed.assignmentTimer || {}) },
      players: parsed.players || [],
      cardReservations: parsed.cardReservations || {},
      claims: parsed.claims || [],
      eventLog: parsed.eventLog || [],
      transition: parsed.transition || null,
      pauseReason: parsed.pauseReason || null,
      deviceTransferRequests: Array.isArray(parsed.deviceTransferRequests) ? parsed.deviceTransferRequests : [],
      adminContingency: { ...defaults.adminContingency, ...(parsed.adminContingency || {}) }
    };
    merged.communityHostKeyHash = /^[a-f0-9]{64}$/i.test(String(parsed.communityHostKeyHash || '')) ? String(parsed.communityHostKeyHash).toLowerCase() : null;
    merged.communityHostName = normalizePlayerName(parsed.communityHostName || '').slice(0, 20);
    merged.communityHostExpiresAt = parsed.communityHostExpiresAt && Number.isFinite(new Date(parsed.communityHostExpiresAt).getTime()) ? new Date(parsed.communityHostExpiresAt).toISOString() : null;
    merged.communityCreatorCodeHash = /^[a-f0-9]{64}$/i.test(String(parsed.communityCreatorCodeHash || '')) ? String(parsed.communityCreatorCodeHash).toLowerCase() : null;
    merged.communityCreatorPlayerId = parsed.communityCreatorPlayerId ? String(parsed.communityCreatorPlayerId).slice(0, 120) : null;
    merged.communityAccessKeyHash = /^[a-f0-9]{64}$/i.test(String(parsed.communityAccessKeyHash || '')) ? String(parsed.communityAccessKeyHash).toLowerCase() : null;
    merged.communityRematch = parsed.communityRematch && typeof parsed.communityRematch === 'object' ? {
      expiresAt: String(parsed.communityRematch.expiresAt || ''),
      readyPlayerIds: Array.isArray(parsed.communityRematch.readyPlayerIds) ? [...new Set(parsed.communityRematch.readyPlayerIds.map(String))].slice(0, MAX_PLAYERS) : [],
      createdAt: String(parsed.communityRematch.createdAt || '')
    } : null;
    merged.closedReason = String(parsed.closedReason || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
    if (merged.active && !parsed.status) merged.status = merged.game?.drawn?.length ? 'playing' : 'waiting';
    if (!['closed', 'waiting', 'starting', 'playing', 'verifying', 'paused', 'resuming', 'finalizing', 'finished'].includes(merged.status)) merged.status = 'closed';
    merged.roomSettings.linePrizeCount = Math.max(1, Math.min(2, Number(merged.roomSettings.linePrizeCount) || 1));
    merged.roomSettings.bingoPrizeCount = 1;
    merged.roomSettings.allowSamePlayerSecondLine = Boolean(merged.roomSettings.allowSamePlayerSecondLine);
    merged.roomSettings.claimMode = merged.roomSettings.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual';
    merged.roomSettings.tiePolicy = merged.roomSettings.claimMode === 'automatic_ties' ? 'same_ball' : (merged.roomSettings.tiePolicy === 'same_ball' ? 'same_ball' : 'first_claim');
    merged.roomSettings.gameType = merged.roomSettings.gameType === 'test' ? 'test' : 'real';
    merged.roomSettings.whatsapp = String(merged.roomSettings.whatsapp || '').slice(0, 40);
    merged.roomSettings.argentinaHint = merged.roomSettings.argentinaHint !== false;
    merged.roomSettings.broadcastToken = merged.roomSettings.broadcastToken ? String(merged.roomSettings.broadcastToken) : null;
    merged.roomSettings.broadcastAlias = merged.roomSettings.broadcastAlias ? String(merged.roomSettings.broadcastAlias).trim().toLowerCase() : null;
    merged.roomSettings.roomType = ['test','official','alpha'].includes(merged.roomSettings.roomType) ? merged.roomSettings.roomType : 'alpha';
    merged.roomSettings.roomOrigin = merged.roomSettings.roomOrigin === 'community' ? 'community' : 'official';
    merged.roomSettings.hostName = normalizePlayerName(merged.roomSettings.hostName || '').slice(0, 20);
    merged.roomSettings.roomName = String(merged.roomSettings.roomName || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    merged.roomSettings.communityPublicId = String(merged.roomSettings.communityPublicId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
    merged.roomSettings.communityStartMode = ['manual','scheduled'].includes(String(merged.roomSettings.communityStartMode || '')) ? String(merged.roomSettings.communityStartMode) : '';
    merged.roomSettings.communityAccessType = merged.roomSettings.communityAccessType === 'private' ? 'private' : 'public';
    merged.roomSettings.communityScheduleId = String(merged.roomSettings.communityScheduleId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
    merged.roomSettings.scheduledAt = String(merged.roomSettings.scheduledAt || '');
    merged.roomSettings.scheduledRegistrationMinutes = Math.max(1, Math.min(120, Number(merged.roomSettings.scheduledRegistrationMinutes) || 15));
    merged.roomSettings.scheduledAutoStart = Boolean(merged.roomSettings.scheduledAutoStart);
    merged.roomSettings.joinOpen = Boolean(merged.roomSettings.joinOpen);
    merged.roomSettings.maxOpenPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(merged.roomSettings.maxOpenPlayers) || MAX_PLAYERS));
    merged.roomSettings.accessKey = normalizeAccessKey(merged.roomSettings.accessKey || merged.roomCode || '');
    merged.roomSettings.markingMode = merged.roomSettings.markingMode === 'manual_only' ? 'manual_only' : 'normal';
    merged.roomSettings.maxCardsPerPlayer = merged.roomSettings.markingMode === 'manual_only' ? 2 : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(merged.roomSettings.maxCardsPerPlayer) || MAX_CARDS_PER_PLAYER));
    merged.roomSettings.claimAutoVerifySeconds = 10;
    merged.roomSettings.presenterVoiceGender = 'female';
    merged.roomSettings.transmission = normalizeTransmissionSettings(merged.roomSettings.transmission);
    if (merged.active) {
      merged.roomSettings.broadcastToken ||= randomId('live');
      merged.roomSettings.broadcastAlias ||= randomCode(6).toLowerCase();
    }
    const legacyWaitingLeaderboard = Array.isArray(parsed.waitingGame?.leaderboard) ? parsed.waitingGame.leaderboard.slice(0, 60) : [];
    merged.waitingGame = {
      type: 'both',
      leaderboard: legacyWaitingLeaderboard,
      leaderboards: {
        red_black: Array.isArray(parsed.waitingGame?.leaderboards?.red_black)
          ? parsed.waitingGame.leaderboards.red_black.slice(0, 60)
          : (parsed.waitingGame?.type === 'red_black' ? legacyWaitingLeaderboard : []),
        higher_lower: Array.isArray(parsed.waitingGame?.leaderboards?.higher_lower)
          ? parsed.waitingGame.leaderboards.higher_lower.slice(0, 60)
          : (parsed.waitingGame?.type === 'higher_lower' ? legacyWaitingLeaderboard : [])
      }
    };
    merged.revision = Math.max(0, Number(parsed.revision) || 0);
    merged.drawOrder = Array.isArray(parsed.drawOrder) ? uniqueNumbers(parsed.drawOrder) : [];
    merged.claimSequence = Math.max(0, Number(parsed.claimSequence) || 0);
    merged.claimWindow = parsed.claimWindow && typeof parsed.claimWindow === 'object' ? parsed.claimWindow : null;
    merged.chat = {
      enabled: parsed.chat?.enabled !== false,
      locked: Boolean(parsed.chat?.locked),
      messages: Array.isArray(parsed.chat?.messages) ? parsed.chat.messages.slice(-CHAT_MAX_MESSAGES) : [],
      mutedPlayerIds: Array.isArray(parsed.chat?.mutedPlayerIds) ? [...new Set(parsed.chat.mutedPlayerIds.map(String))] : [],
      lastSentAt: {}
    };
    merged.demo = parsed.demo && typeof parsed.demo === 'object' ? parsed.demo : null;
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
    if (merged.game?.cards) ensureUniqueVisibleCardNumbers(merged.game.cards);
    merged.players = merged.players.map(player => {
      player = omitLegacyKeys(player, LEGACY_PLAYER_FINANCIAL_KEYS);
      const cardIds = [...new Set((player.cardIds || []).map(String))].slice(0, MAX_CARDS_PER_PLAYER);
      const allowedCardCount = Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(player.allowedCardCount) || cardIds.length || 1));
      const name = normalizePlayerName(player.name || '');
      return {
        ...player,
        name,
        nameSet: player.nameSet === undefined ? Boolean(name && !/^Jugador\s+\d+$/i.test(name)) : Boolean(player.nameSet),
        slotLabel: String(player.slotLabel || `Acceso ${Number(player.slotNumber) || 1}`),
        personalPresenter: PRESENTER_ID,
        cardIds,
        allowedCardCount,
        requestedCardCount: Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(player.requestedCardCount) || allowedCardCount)),
        selectionConfirmed: player.selectionConfirmed === undefined ? cardIds.length > 0 : Boolean(player.selectionConfirmed && cardIds.length > 0),
        offeredCardIds: Array.isArray(player.offeredCardIds) ? player.offeredCardIds.map(String) : [],
        reservedCardIds: Array.isArray(player.reservedCardIds) ? player.reservedCardIds.map(String) : [],
        marks: player.marks || {},
        autoMark: Boolean(player.autoMark),
        markingModeChosen: player.markingModeChosen === undefined ? Boolean(player.autoMark) : Boolean(player.markingModeChosen),
        notices: player.notices || [],
        sessionDeviceId: String(player.sessionDeviceId || ''),
        code: String(player.code || '').trim().toUpperCase(),
        directAccessToken: player.directAccessToken ? String(player.directAccessToken) : null,
        recoveryExpiresAt: player.recoveryExpiresAt || null,
        inviteToken: player.inviteToken ? String(player.inviteToken) : null,
        inviteClaimedAt: player.inviteClaimedAt || null,
        invitedAt: player.invitedAt || null
      };
    });
    if (legacyFinance) {
      try { writeJsonAtomic(stateFile, merged); } catch {}
    }
    return merged;
  } catch {
    return blankState();
  }
}

function blankCommunity() {
  return {
    whatsappGroup: String(process.env.COMMUNITY_WHATSAPP_GROUP || 'https://chat.whatsapp.com/HauYXd3oUzUIXIcl0YKOlk?s=cl&p=a&ilr=0').trim().slice(0, 500),
    whatsappNumber: String(process.env.COMMUNITY_WHATSAPP_NUMBER || '3757624388').trim().slice(0, 60),
    banners: [1,2,3].map(slot => ({ slot, enabled:false, destinationType:'none', target:'', alt:'', imageExt:'', updatedAt:'' })),
    playerAd: { enabled:false, imageExt:'', updatedAt:'' },
    chatEnabled: true,
    blockPhoneNumbers: true,
    blockWhatsappLinks: true,
    blockedTerms: [],
    scheduledGames: [],
    publicRooms: [],
    publicRoomsEnabled: true,
    privateRoomsEnabled: true,
    privateRoomMaxPlayers: 30,
    privateRoomMaxCardsPerPlayer: 4,
    cardsPrintSite: String(process.env.BINGO_PRINT_SITE || 'bingo-gorda.onrender.com/comunidad').trim().slice(0, 160),
    messages: [],
    leaderboards: { red_black: [], higher_lower: [] }
  };
}

function normalizeCommunityScheduledGame(raw = {}) {
  const starts = new Date(raw.startsAt || raw.dateTime || '');
  if (!Number.isFinite(starts.getTime())) return null;
  const mode = Number(raw.mode) === 75 ? 75 : 90;
  const markingMode = raw.markingMode === 'manual_only' ? 'manual_only' : 'normal';
  const maxCardsPerPlayer = markingMode === 'manual_only'
    ? Math.max(1, Math.min(2, Math.round(Number(raw.maxCardsPerPlayer) || 2)))
    : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Math.round(Number(raw.maxCardsPerPlayer) || 4)));
  return {
    id: String(raw.id || randomId('agenda')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100),
    startsAt: starts.toISOString(),
    mode,
    whatsapp: String(raw.whatsapp || '').trim().slice(0, 40),
    registrationMinutes: Math.max(1, Math.min(120, Math.round(Number(raw.registrationMinutes) || 15))),
    autoStart: raw.autoStart === true,
    markingMode,
    maxCardsPerPlayer,
    cardCount: normalizedGeneratedCount(raw.cardCount || 250),
    autoSeconds: Math.max(2, Math.min(60, Math.round(Number(raw.autoSeconds) || 6))),
    linePrizeCount: mode === 90 ? Math.max(1, Math.min(2, Math.round(Number(raw.linePrizeCount) || 1))) : 1,
    rules: roomRulesFor(mode, raw.rules || {}),
    roomCode: String(raw.roomCode || '').replace(/[^A-Z0-9]/gi, '').slice(0, 12),
    workspaceId: OPERATIONAL_WORKSPACE_IDS.includes(String(raw.workspaceId || '')) ? String(raw.workspaceId) : '',
    autoOpenedAt: raw.autoOpenedAt ? String(raw.autoOpenedAt) : null,
    autoClosedAt: raw.autoClosedAt ? String(raw.autoClosedAt) : null,
    autoStartedAt: raw.autoStartedAt ? String(raw.autoStartedAt) : null,
    autoStartError: String(raw.autoStartError || '').slice(0, 300),
    createdAt: String(raw.createdAt || nowIso()),
    updatedAt: String(raw.updatedAt || nowIso())
  };
}


function normalizeCommunityPublicRoom(raw = {}) {
  const startsAt = raw.startsAt ? new Date(raw.startsAt) : null;
  const startsIso = startsAt && Number.isFinite(startsAt.getTime()) ? startsAt.toISOString() : '';
  const mode = Number(raw.mode) === 75 ? 75 : 90;
  const maxPlayers = Math.max(2, Math.min(30, Math.round(Number(raw.maxPlayers) || 20)));
  const maxCardsPerPlayer = Math.max(1, Math.min(4, Math.round(Number(raw.maxCardsPerPlayer) || 2)));
  const linePrizeCount = mode === 90 ? Math.max(1, Math.min(2, Math.round(Number(raw.linePrizeCount) || 1))) : 1;
  const requestedRules = raw.rules && typeof raw.rules === 'object' ? raw.rules : {};
  const rules = mode === 90
    ? roomRulesFor(90, { ambocabeza:Boolean(requestedRules.ambocabeza), line:requestedRules.line !== false, bingo:true })
    : roomRulesFor(75, { line:requestedRules.line !== false, corners:Boolean(requestedRules.corners), doubleLine:Boolean(requestedRules.doubleLine), tripleLine:Boolean(requestedRules.tripleLine), bingo:true });
  return {
    id: String(raw.id || randomId('public')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100),
    name: String(raw.name || '').trim().replace(/\s+/g, ' ').slice(0, 30),
    creatorName: normalizePlayerName(raw.creatorName || '').slice(0, 20),
    creatorCodeHash: /^[a-f0-9]{64}$/i.test(String(raw.creatorCodeHash || '')) ? String(raw.creatorCodeHash).toLowerCase() : '',
    accessType: raw.accessType === 'private' ? 'private' : 'public',
    accessKeyHash: /^[a-f0-9]{64}$/i.test(String(raw.accessKeyHash || '')) ? String(raw.accessKeyHash).toLowerCase() : '',
    accessKeyAdmin: raw.accessType === 'private' && raw.accessKeyAdmin ? normalizeCommunityRoomAccessKey(raw.accessKeyAdmin) : '',
    roundNumber: Math.max(1, Math.round(Number(raw.roundNumber) || 1)),
    startMode: raw.startMode === 'scheduled' ? 'scheduled' : 'manual',
    startsAt: startsIso,
    mode, maxPlayers, maxCardsPerPlayer,
    autoSeconds: Math.max(4, Math.min(20, Math.round(Number(raw.autoSeconds) || 8))),
    claimMode: raw.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual',
    linePrizeCount, rules,
    roomCode: String(raw.roomCode || '').replace(/[^A-Z0-9]/gi, '').slice(0, 12),
    workspaceId: OPERATIONAL_WORKSPACE_IDS.includes(String(raw.workspaceId || '')) ? String(raw.workspaceId) : '',
    openedAt: raw.openedAt ? String(raw.openedAt) : null,
    startedAt: raw.startedAt ? String(raw.startedAt) : null,
    endedAt: raw.endedAt ? String(raw.endedAt) : null,
    status: ['scheduled','waiting','playing','finished','cancelled'].includes(String(raw.status || '')) ? String(raw.status) : (raw.roomCode ? 'waiting' : 'scheduled'),
    createdAt: String(raw.createdAt || nowIso()),
    updatedAt: String(raw.updatedAt || nowIso())
  };
}

function communityPublicRooms() {
  const community = platform.community ||= blankCommunity();
  community.publicRooms ||= [];
  return community.publicRooms;
}

function communityScheduledGames() {
  const community = platform.community ||= blankCommunity();
  community.scheduledGames ||= [];
  return community.scheduledGames;
}

function normalizeCommunityFilterText(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCommunityBlockedTerm(value) {
  return normalizeCommunityFilterText(String(value || '').slice(0, COMMUNITY_FILTER_TERM_MAX_LENGTH));
}

function communityContainsBlockedTerm(text, terms = []) {
  const normalized = ` ${normalizeCommunityFilterText(text)} `;
  if (!normalized.trim()) return '';
  for (const raw of terms) {
    const term = normalizeCommunityBlockedTerm(raw);
    if (!term) continue;
    if (normalized.includes(` ${term} `)) return raw;
    // Para términos de 4+ caracteres también frena separaciones simples: s.p.a.m / s p a m.
    const compactTerm = term.replace(/\s+/g, '');
    if (compactTerm.length >= 4 && !term.includes(' ')) {
      const chars = compactTerm.split('').map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const separated = new RegExp(`(?:^|[^a-z0-9])${chars.join('[^a-z0-9]*')}(?:$|[^a-z0-9])`, 'i');
      const folded = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
      if (separated.test(folded)) return raw;
    }
  }
  return '';
}

function communityContainsWhatsappLink(text) {
  const value = String(text || '');
  return /(?:https?:\/\/)?(?:www\.)?(?:wa\.me\/|api\.whatsapp\.com\/|chat\.whatsapp\.com\/|whatsapp\.com\/(?:send|channel)\b)/i.test(value);
}

function communityContainsPhoneNumber(text) {
  const value = String(text || '');
  // Busca secuencias con formato telefónico de 7 a 15 dígitos, permitiendo +, espacios,
  // guiones, puntos y paréntesis. Números cortos de sala, cartón, bolilla u horarios no coinciden.
  const candidates = value.match(/(?:\+?\d[\d\s().-]{5,28}\d)/g) || [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    // Fechas/horarios o repeticiones cortas no llegan a 7 dígitos; esto evita además
    // capturar una cadena larga formada por varios números independientes del bingo.
    const groups = candidate.trim().split(/\s+/).filter(Boolean);
    const groupDigits = groups.map(group => group.replace(/\D/g, '').length);
    if (groups.length >= 7 && groupDigits.every(length => length === 1)) return true;
    if (groups.length >= 5 && groupDigits.every(length => length <= 2)) continue;
    return true;
  }
  return false;
}

function validateCommunityMessageContent(text, community) {
  if (community.blockWhatsappLinks !== false && communityContainsWhatsappLink(text)) {
    throw new Error('No está permitido compartir números de teléfono ni datos de contacto en el chat.');
  }
  if (community.blockPhoneNumbers !== false && communityContainsPhoneNumber(text)) {
    throw new Error('No está permitido compartir números de teléfono ni datos de contacto en el chat.');
  }
  if (communityContainsBlockedTerm(text, community.blockedTerms || [])) {
    throw new Error('Tu mensaje contiene contenido no permitido.');
  }
}


function normalizeCommunityBanner(raw = {}, slot = 1) {
  const safeSlot = Math.max(1, Math.min(3, Math.round(Number(slot) || 1)));
  const destinationType = ['none','url','whatsapp','phone'].includes(String(raw.destinationType || '')) ? String(raw.destinationType) : 'none';
  const imageExt = ['jpg','png','webp'].includes(String(raw.imageExt || '').toLowerCase()) ? String(raw.imageExt).toLowerCase() : '';
  return {
    slot: safeSlot,
    enabled: raw.enabled === true,
    destinationType,
    target: String(raw.target || '').trim().slice(0, 500),
    alt: String(raw.alt || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    imageExt,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : ''
  };
}

function communityBannerFilePath(banner = {}) {
  const slot = Math.max(1, Math.min(3, Math.round(Number(banner.slot) || 1)));
  const ext = ['jpg','png','webp'].includes(String(banner.imageExt || '').toLowerCase()) ? String(banner.imageExt).toLowerCase() : '';
  return ext ? path.join(COMMUNITY_BANNERS_DIR, `banner-${slot}.${ext}`) : '';
}

function communityBannerActionUrl(banner = {}) {
  const type = String(banner.destinationType || 'none');
  const raw = String(banner.target || '').trim();
  if (type === 'none' || !raw) return '';
  if (type === 'url') {
    try { const parsed = new URL(raw); return ['http:','https:'].includes(parsed.protocol) ? parsed.toString() : ''; }
    catch { return ''; }
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  if (type === 'whatsapp') return `https://wa.me/${digits}`;
  if (type === 'phone') return `tel:${raw.startsWith('+') ? '+' : ''}${digits}`;
  return '';
}

function validateCommunityBannerTarget(type, value) {
  const target = String(value || '').trim().slice(0, 500);
  if (type === 'none') return '';
  if (type === 'url') {
    try {
      const parsed = new URL(target);
      if (!['http:','https:'].includes(parsed.protocol)) throw new Error();
      return parsed.toString();
    } catch { throw new Error('El enlace del banner debe empezar con http:// o https://.'); }
  }
  const digits = target.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) throw new Error(type === 'whatsapp' ? 'Ingresá un número de WhatsApp válido, con código de país.' : 'Ingresá un número de teléfono válido.');
  return target;
}

function communityBannersAdminPayload() {
  const community = platform.community ||= blankCommunity();
  const source = Array.isArray(community.banners) ? community.banners : blankCommunity().banners;
  return [1,2,3].map(slot => {
    const banner = normalizeCommunityBanner(source.find(item => Number(item?.slot) === slot) || {}, slot);
    const file = communityBannerFilePath(banner);
    const hasImage = Boolean(file && fs.existsSync(file));
    return {
      ...banner,
      hasImage,
      imageUrl: hasImage ? `/community-banner/${slot}?v=${encodeURIComponent(banner.updatedAt || '1')}` : '',
      actionUrl: communityBannerActionUrl(banner)
    };
  });
}

function communityBannersPublicPayload() {
  return communityBannersAdminPayload()
    .filter(banner => banner.enabled && banner.hasImage)
    .map(({ slot, alt, imageUrl, actionUrl, destinationType }) => ({ slot, alt, imageUrl, actionUrl, destinationType }));
}

function removeCommunityBannerFiles(slot) {
  for (const ext of ['jpg','png','webp']) {
    const file = path.join(COMMUNITY_BANNERS_DIR, `banner-${slot}.${ext}`);
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
  }
}

function updateCommunityBannerImage(payload = {}) {
  const slot = Math.max(1, Math.min(3, Math.round(Number(payload.slot) || 0)));
  if (!slot || slot < 1 || slot > 3) throw new Error('Banner no válido.');
  const community = platform.community ||= blankCommunity();
  community.banners = [1,2,3].map(index => normalizeCommunityBanner((community.banners || []).find(item => Number(item?.slot) === index) || {}, index));
  const banner = community.banners.find(item => item.slot === slot);
  const action = String(payload.action || 'upload').toLowerCase();
  if (action === 'remove') {
    removeCommunityBannerFiles(slot);
    banner.imageExt = '';
    banner.updatedAt = nowIso();
    savePlatform();
    return communityAdminPayload();
  }
  const match = String(payload.imageData || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Usá una imagen JPG, PNG o WebP.');
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 2_000_000) throw new Error('La imagen procesada del banner supera el tamaño permitido. Volvé a seleccionarla para optimizarla.');
  const isJpg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length > 8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const isWebp = buffer.length > 12 && buffer.subarray(0,4).toString('ascii') === 'RIFF' && buffer.subarray(8,12).toString('ascii') === 'WEBP';
  const ext = mime === 'image/jpeg' && isJpg ? 'jpg' : mime === 'image/png' && isPng ? 'png' : mime === 'image/webp' && isWebp ? 'webp' : '';
  if (!ext) throw new Error('El archivo no coincide con un formato de imagen permitido.');
  removeCommunityBannerFiles(slot);
  const file = path.join(COMMUNITY_BANNERS_DIR, `banner-${slot}.${ext}`);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, buffer);
  fs.renameSync(temp, file);
  banner.imageExt = ext;
  banner.updatedAt = nowIso();
  savePlatform();
  return communityAdminPayload();
}

function normalizePlayerAd(raw = {}) {
  const imageExt = ['jpg','png','webp'].includes(String(raw.imageExt || '').toLowerCase()) ? String(raw.imageExt).toLowerCase() : '';
  return {
    enabled: raw.enabled === true,
    imageExt,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : ''
  };
}

function playerAdFilePath(ad = {}) {
  const ext = ['jpg','png','webp'].includes(String(ad.imageExt || '').toLowerCase()) ? String(ad.imageExt).toLowerCase() : '';
  return ext ? path.join(COMMUNITY_BANNERS_DIR, `player-ad.${ext}`) : '';
}

function playerAdAdminPayload() {
  const community = platform.community ||= blankCommunity();
  const ad = normalizePlayerAd(community.playerAd || {});
  const file = playerAdFilePath(ad);
  const hasImage = Boolean(file && fs.existsSync(file));
  return {
    ...ad,
    hasImage,
    imageUrl: hasImage ? `/player-ad-banner?v=${encodeURIComponent(ad.updatedAt || '1')}` : ''
  };
}

function playerAdPublicPayload() {
  const ad = playerAdAdminPayload();
  return ad.enabled && ad.hasImage ? { enabled:true, imageUrl:ad.imageUrl, durationMs:10000, everyBalls:10 } : { enabled:false, imageUrl:'', durationMs:10000, everyBalls:10 };
}

function removePlayerAdFiles() {
  for (const ext of ['jpg','png','webp']) {
    const file = path.join(COMMUNITY_BANNERS_DIR, `player-ad.${ext}`);
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
  }
}

function updatePlayerAdImage(payload = {}) {
  const community = platform.community ||= blankCommunity();
  community.playerAd = normalizePlayerAd(community.playerAd || {});
  const ad = community.playerAd;
  const action = String(payload.action || 'upload').toLowerCase();
  if (action === 'remove') {
    removePlayerAdFiles();
    ad.enabled = false;
    ad.imageExt = '';
    ad.updatedAt = nowIso();
    savePlatform();
    return communityAdminPayload();
  }
  const match = String(payload.imageData || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Usá una imagen JPG, PNG o WebP.');
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 2_000_000) throw new Error('La imagen procesada de publicidad supera el tamaño permitido. Volvé a seleccionarla para optimizarla.');
  const isJpg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length > 8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const isWebp = buffer.length > 12 && buffer.subarray(0,4).toString('ascii') === 'RIFF' && buffer.subarray(8,12).toString('ascii') === 'WEBP';
  const ext = mime === 'image/jpeg' && isJpg ? 'jpg' : mime === 'image/png' && isPng ? 'png' : mime === 'image/webp' && isWebp ? 'webp' : '';
  if (!ext) throw new Error('El archivo no coincide con un formato de imagen permitido.');
  removePlayerAdFiles();
  const file = path.join(COMMUNITY_BANNERS_DIR, `player-ad.${ext}`);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, buffer);
  fs.renameSync(temp, file);
  ad.imageExt = ext;
  ad.updatedAt = nowIso();
  savePlatform();
  return communityAdminPayload();
}

function normalizeCommunity(raw = {}) {
  const defaults = blankCommunity();
  return {
    whatsappGroup: String(raw.whatsappGroup || defaults.whatsappGroup).trim().slice(0, 500),
    whatsappNumber: String(raw.whatsappNumber || defaults.whatsappNumber).trim().slice(0, 60),
    banners: [1,2,3].map(slot => normalizeCommunityBanner((Array.isArray(raw.banners) ? raw.banners : []).find(item => Number(item?.slot) === slot) || {}, slot)),
    playerAd: normalizePlayerAd(raw.playerAd || {}),
    chatEnabled: raw.chatEnabled !== false,
    blockPhoneNumbers: raw.blockPhoneNumbers !== false,
    blockWhatsappLinks: raw.blockWhatsappLinks !== false,
    blockedTerms: Array.isArray(raw.blockedTerms)
      ? [...new Set(raw.blockedTerms.map(normalizeCommunityBlockedTerm).filter(Boolean))].slice(0, COMMUNITY_FILTER_MAX_TERMS)
      : [],
    scheduledGames: Array.isArray(raw.scheduledGames)
      ? raw.scheduledGames.map(normalizeCommunityScheduledGame).filter(Boolean).sort((a,b) => String(a.startsAt).localeCompare(String(b.startsAt))).slice(0, 40)
      : [],
    publicRooms: Array.isArray(raw.publicRooms)
      ? raw.publicRooms.map(normalizeCommunityPublicRoom).filter(Boolean).sort((a,b) => String(a.startsAt || a.createdAt).localeCompare(String(b.startsAt || b.createdAt))).slice(-120)
      : [],
    publicRoomsEnabled: raw.publicRoomsEnabled !== false,
    privateRoomsEnabled: raw.privateRoomsEnabled !== false,
    privateRoomMaxPlayers: Math.max(2, Math.min(30, Math.round(Number(raw.privateRoomMaxPlayers) || defaults.privateRoomMaxPlayers))),
    privateRoomMaxCardsPerPlayer: Number(raw.privateRoomMaxCardsPerPlayer) === 2 ? 4 : Math.max(1, Math.min(4, Math.round(Number(raw.privateRoomMaxCardsPerPlayer) || defaults.privateRoomMaxCardsPerPlayer))),
    cardsPrintSite: String(raw.cardsPrintSite ?? defaults.cardsPrintSite).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').slice(0, 160),
    messages: Array.isArray(raw.messages) ? raw.messages.slice(-COMMUNITY_CHAT_MAX_MESSAGES).map(message => ({
      ...message,
      reports: Array.isArray(message?.reports) ? message.reports
        .filter(report => report && report.visitorId)
        .slice(-50)
        .map(report => ({ visitorId: String(report.visitorId).slice(0,80), createdAt: String(report.createdAt || '') })) : []
    })) : [],
    leaderboards: {
      red_black: Array.isArray(raw.leaderboards?.red_black) ? raw.leaderboards.red_black.slice(0, 60) : [],
      higher_lower: Array.isArray(raw.leaderboards?.higher_lower) ? raw.leaderboards.higher_lower.slice(0, 60) : []
    }
  };
}

function loadPlatform() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PLATFORM_FILE, 'utf8'));
    const rawCommunity = parsed.community || {};
    const legacyFinance = hasLegacyKeys(rawCommunity, LEGACY_COMMUNITY_FINANCIAL_KEYS)
      || (Array.isArray(rawCommunity.scheduledGames) && rawCommunity.scheduledGames.some(game => hasLegacyKeys(game, LEGACY_SCHEDULE_FINANCIAL_KEYS)));
    if (legacyFinance) backupLegacyJsonFile(PLATFORM_FILE);
    const cleanedCommunity = omitLegacyKeys(rawCommunity, LEGACY_COMMUNITY_FINANCIAL_KEYS);
    if (Array.isArray(cleanedCommunity.scheduledGames)) cleanedCommunity.scheduledGames = cleanedCommunity.scheduledGames.map(game => omitLegacyKeys(game, LEGACY_SCHEDULE_FINANCIAL_KEYS));
    const result = { version: 25, operators: Array.isArray(parsed.operators) ? parsed.operators : [], community: normalizeCommunity(cleanedCommunity) };
    if (legacyFinance) {
      try { writeJsonAtomic(PLATFORM_FILE, result); } catch {}
    }
    return result;
  } catch {
    return { version: 25, operators: [], community: blankCommunity() };
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
const playerViewSessions = new Map();
// Tokens efímeros creados al abrir una invitación. Un GET/HEAD nunca consume la invitación.
const invitationActivationTokens = new Map();

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
    lastResultMeta: loadLastResultMeta(paths.resultMetaFile, paths.resultPdfFile),
    isDemo: safe.startsWith('demo_'),
    expiresAt: safe.startsWith('demo_') ? Date.now() + DEMO_TTL_MS : null,
    lastActivityAt: Date.now()
  };
  workspaces.set(safe, workspace);
  return workspace;
}

const ownerWorkspace = ensureWorkspace('owner', null, 'Sala 1');
for (let index = 1; index < OPERATIONAL_WORKSPACE_IDS.length; index++) ensureWorkspace(OPERATIONAL_WORKSPACE_IDS[index], null, `Sala ${index + 1}`);
// Los operadores temporales están deshabilitados en LA GORDA - BINGO ONLINE.

function operationalWorkspaces() {
  return OPERATIONAL_WORKSPACE_IDS.map((id, index) => ensureWorkspace(id, null, `Sala ${index + 1}`));
}

function activeOperationalWorkspaces() {
  return operationalWorkspaces().filter(workspace => workspace.state?.active && workspace.state.status !== 'closed');
}

function freeOperationalWorkspace() {
  return operationalWorkspaces().find(workspace => !workspace.state?.active || workspace.state.status === 'closed') || null;
}

function workspaceOperationalIndex(workspace = currentWorkspace()) {
  const index = OPERATIONAL_WORKSPACE_IDS.indexOf(workspace?.id);
  return index >= 0 ? index + 1 : null;
}

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
const communityVisitors = new Map();
const communityLastSentAt = new Map();
const communityLastStickerAt = new Map();
const communityStickerSentAt = new Map();
const communityReportSentAt = new Map();
const communityRoomAccessGrants = new Map();

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
    filename: meta.filename || `LA_GORDA_BINGO_ONLINE_Resultados_Sala_${meta.roomCode}.pdf`,
    downloadUrl: `/api/results.pdf?sala=${encodeURIComponent(meta.roomCode)}`
  };
}

function historySafeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function historyDirectories() {
  try {
    return fs.readdirSync(HISTORY_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(HISTORY_DIR, entry.name));
  } catch {
    return [];
  }
}

function readHistoryMeta(dir) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    if (!meta?.roomCode) return null;
    return { ...meta, archiveDir: dir };
  } catch {
    return null;
  }
}

function historyEntries() {
  return historyDirectories()
    .map(readHistoryMeta)
    .filter(Boolean)
    .sort((a, b) => String(b.endedAt || b.cancelledAt || b.savedAt || '').localeCompare(String(a.endedAt || a.cancelledAt || a.savedAt || '')));
}

function historyEntryByRoomCode(roomCode) {
  const normalized = String(roomCode || '').trim().toUpperCase();
  if (!normalized) return null;
  return historyEntries().find(entry => String(entry.roomCode || '').toUpperCase() === normalized) || null;
}

function roomCodeExistsAnywhere(roomCode) {
  const normalized = String(roomCode || '').trim().toUpperCase();
  if (!normalized) return false;
  if ([...workspaces.values()].some(workspace => String(workspace.state?.roomCode || '').toUpperCase() === normalized)) return true;
  return Boolean(historyEntryByRoomCode(normalized));
}

function uniqueRoomCode(length = 6) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const code = randomCode(length);
    if (!roomCodeExistsAnywhere(code)) return code;
  }
  throw new Error('No se pudo generar un código de sala único.');
}

function historyPublicEntry(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    roomCode: entry.roomCode,
    status: entry.status,
    roomOrigin: entry.roomOrigin || 'official',
    roomType: entry.roomType || (entry.roomOrigin === 'community' ? 'public' : 'official'),
    roomName: entry.roomName || '',
    communityPublicId: entry.communityPublicId || '',
    hostName: entry.hostName || '',
    mode: Number(entry.mode) || null,
    gameNumber: entry.gameNumber || null,
    round: entry.round || 1,
    createdAt: entry.createdAt || null,
    startedAt: entry.startedAt || null,
    endedAt: entry.endedAt || null,
    cancelledAt: entry.cancelledAt || null,
    cancelReason: entry.cancelReason || '',
    savedAt: entry.savedAt || null,
    totalPlayers: Number(entry.totalPlayers) || 0,
    activeCards: Number(entry.activeCards) || 0,
    winners: Array.isArray(entry.winners) ? entry.winners : [],
    integrity: entry.integrity || null,
    workspaceId: entry.workspaceId || '',
    files: entry.files || {}
  };
}

function historyListPayload() {
  return historyEntries().map(historyPublicEntry);
}

function writeAtomic(file, data) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}

function archiveFolderForState(status = 'finished') {
  const stampSource = state.endedAt || state.startedAt || state.createdAt || nowIso();
  const stamp = new Date(stampSource).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const room = String(state.roomCode || 'SIN_SALA').toUpperCase();
  const base = `${stamp}_${historySafeId(room)}_${status}`;
  return path.join(HISTORY_DIR, base);
}

function historicalFile(entry, filename) {
  if (!entry?.archiveDir) return null;
  const safe = path.basename(String(filename || ''));
  if (!safe) return null;
  const file = path.join(entry.archiveDir, safe);
  return fs.existsSync(file) ? file : null;
}

function saveState() {
  const workspace = currentWorkspace();
  state.revision = Math.max(0, Number(state.revision) || 0) + 1;
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

function playerViewSession(token) {
  const key = String(token || '');
  if (!key) return null;
  const session = playerViewSessions.get(key) || null;
  if (!session) return null;
  if (Number(session.expiresAt || 0) <= Date.now()) { playerViewSessions.delete(key); return null; }
  return session;
}

function playerByToken(token) {
  const direct = state.players.find(player => player.sessionToken && player.sessionToken === token);
  if (direct) return direct;
  const view = playerViewSession(token);
  if (!view || view.workspaceId !== currentWorkspace().id) return null;
  return state.players.find(player => player.id === view.playerId) || null;
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
  if (renew && pool.length + reserved.length < target) pool = [...pool, ...shuffle(previous.filter(cardId => !pool.includes(cardId)))];
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

function playerEligibleForRound(player) {
  if (!player?.nameSet) return false;
  // Una invitación privada creada antes del sorteo ya representa a un jugador registrado.
  // Abrir el enlace no es requisito para conservar su lugar: el servidor puede asignarle
  // sus cartones antes de iniciar y permitir que entre más tarde con el mismo vínculo.
  return true;
}

function authorizedCardCount(player) {
  const roomMax = state.roomSettings?.markingMode === 'manual_only'
    ? 2
    : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(state.roomSettings?.maxCardsPerPlayer) || MAX_CARDS_PER_PLAYER));
  const base = Number(player?.allowedCardCount) || Number(player?.requestedCardCount) || 1;
  return Math.max(1, Math.min(roomMax, base));
}

function playerSelectionComplete(player) {
  if (!player?.selectionConfirmed) return false;
  const selectedCount = Array.isArray(player.cardIds) ? player.cardIds.length : 0;
  const allowedCount = authorizedCardCount(player);
  if (selectedCount < 1) return false;
  return selectedCount <= allowedCount;
}

function registrationSummaryPayload() {
  const registered = state.players.filter(player => player?.nameSet && !player.virtual);
  const requestedCards = registered.reduce((sum, player) => sum + Math.max(1, Number(player.requestedCardCount) || Number(player.allowedCardCount) || 1), 0);
  const confirmedCards = registered.reduce((sum, player) => sum + (player.selectionConfirmed ? (player.cardIds || []).length : authorizedCardCount(player)), 0);
  const assignedCards = registered.reduce((sum, player) => sum + (player.selectionConfirmed ? (player.cardIds || []).length : 0), 0);
  const pendingSelectionCards = registered.reduce((sum, player) => sum + (player.selectionConfirmed ? 0 : authorizedCardCount(player)), 0);
  return { registeredPlayers: registered.length, requestedCards, confirmedCards, assignedCards, pendingSelectionCards, playingCards: state.status === 'waiting' ? confirmedCards : assignedCards };
}

function startPlanPayload() {
  const connected = connectedPlayerIds();
  const eligible = state.players.filter(playerEligibleForRound);
  const pendingSelection = eligible.filter(player => !playerSelectionComplete(player));
  const pendingMarkingMode = eligible.filter(player => !player.markingModeChosen);
  const connectedEligible = eligible.filter(player => player.virtual || connected.has(player.id));
  return {
    eligiblePlayers: eligible.length,
    connectedEligiblePlayers: connectedEligible.length,
    selectedPlayers: eligible.length - pendingSelection.length,
    autoAssignPlayers: pendingSelection.length,
    pendingMarkingModePlayers: pendingMarkingMode.length,
    canStart: eligible.length >= (TEST_MODE ? 1 : 2),
    canStartFromAdmin: eligible.length >= (TEST_MODE ? 1 : 2) || Boolean(state.roomSettings?.adminSimulation)
  };
}

function allPlayersReady() {
  return state.players.length > 0 && state.players.every(player =>
    player.nameSet && playerSelectionComplete(player) && Boolean(player.markingModeChosen)
  );
}


function preflightPayload() {
  const assigned = state.players.flatMap(player => player.selectionConfirmed ? (player.cardIds || []).map(cardId => ({ playerId: player.id, cardId })) : []);
  const ids = assigned.map(item => item.cardId);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const eligiblePlayers = state.players.filter(playerEligibleForRound);
  const pendingPlayers = eligiblePlayers.filter(player => !(player.nameSet && playerSelectionComplete(player)));
  const pendingMarkingMode = eligiblePlayers.filter(player => player.selectionConfirmed && !player.markingModeChosen);
  const activeCards = ids.length;
  const availableCards = Math.max(0, (state.game?.cards?.length || 0) - new Set(ids).size);
  const errors = [];
  if (eligiblePlayers.length < (TEST_MODE ? 1 : 2)) errors.push('Se necesitan al menos 2 jugadores habilitados para iniciar.');
  if (pendingPlayers.length) errors.push(`${pendingPlayers.length} jugador${pendingPlayers.length === 1 ? '' : 'es'} todavía no confirmó${pendingPlayers.length === 1 ? '' : 'aron'} sus cartones.`);
  if (pendingMarkingMode.length) errors.push(`${pendingMarkingMode.length} jugador${pendingMarkingMode.length === 1 ? '' : 'es'} todavía no ${pendingMarkingMode.length === 1 ? 'eligió' : 'eligieron'} Manual o Automarcado.`);
  if (duplicates.length) errors.push(`Hay ${duplicates.length} cartón${duplicates.length === 1 ? '' : 'es'} duplicado${duplicates.length === 1 ? '' : 's'}.`);
  if (activeCards > MAX_ACTIVE_CARDS) errors.push(`Hay ${activeCards} cartones activos y el máximo es ${MAX_ACTIVE_CARDS}.`);
  const enabledPrizes = PRIZE_TYPES.filter(type => isPrizeEnabled(type)).map(type => prizeLabelFor(type, 1, state.game?.mode));
  return {
    ok: Boolean(state.active && state.status === 'waiting' && state.game && errors.length === 0),
    totalPlayers: state.players.length,
    eligiblePlayers: eligiblePlayers.length,
    readyPlayers: eligiblePlayers.length - pendingPlayers.length,
    pendingPlayers: pendingPlayers.map(player => ({ id: player.id, name: playerDisplayName(player), missing: Math.max(0, authorizedCardCount(player) - player.cardIds.length) })),
    pendingMarkingMode: pendingMarkingMode.map(player => ({ id: player.id, name: playerDisplayName(player) })),
    generatedCards: state.game?.cards?.length || 0,
    activeCards,
    availableCards,
    duplicateCardIds: duplicates,
    mode: state.game?.mode,
    enabledPrizes,
    linePrizeCount: Number(state.game?.mode) === 90 ? Math.max(1, Math.min(2, Number(state.roomSettings?.linePrizeCount) || 1)) : 1,
    allowSamePlayerSecondLine: Number(state.game?.mode) === 90 && Boolean(state.roomSettings?.allowSamePlayerSecondLine),
    tiePolicy: state.roomSettings?.tiePolicy === 'same_ball' ? 'same_ball' : 'first_claim',
    claimMode: state.roomSettings?.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual',
    errors
  };
}

function playerPrizeReadiness(player) {
  if (!state.game || !player?.selectionConfirmed) return [];
  const prizes = prizeStatusPayload();
  const playerAlreadyWonLine = (prizes.line.winners || []).some(winner => winner.playerId === player.id);
  const activeClaimWindow = state.status === 'verifying'
    && state.claimWindow
    && Number(state.claimWindow.drawnCount) === state.game.drawn.length
    && Date.now() <= Number(state.claimWindow.expiresAtMs || 0);
  return (player.cardIds || []).map(cardId => {
    const card = state.game.cards.find(item => item.id === cardId);
    if (!card) return null;
    const analysis = analyzeCard(card, state.game.drawn, player.marks?.[cardId] || []);
    const alreadyWon = type => (prizes[type]?.winners || []).some(winner => winner.cardId === cardId);
    const samePlayerBlocked = Number(state.game.mode) === 90 && !prizes.allowSamePlayerSecondLine && playerAlreadyWonLine;
    const live = state.status === 'playing' || activeClaimWindow;
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
  const pendingPlayers = state.players.filter(player => playerEligibleForRound(player) && !playerSelectionComplete(player));
  const validUnassigned = new Set(state.game.cards.map(card => card.id).filter(cardId => !confirmedIds.has(cardId)));
  const preferredByPlayer = new Map();
  const preferredIds = new Set();
  for (const player of pendingPlayers) {
    const preferred = (player.reservedCardIds || [])
      .filter(cardId => validUnassigned.has(cardId) && state.cardReservations?.[cardId]?.playerId === player.id && !preferredIds.has(cardId))
      .slice(0, authorizedCardCount(player));
    preferred.forEach(cardId => preferredIds.add(cardId));
    preferredByPlayer.set(player.id, preferred);
  }
  let available = shuffle([...validUnassigned].filter(cardId => !preferredIds.has(cardId)));
  const assigned = [];

  for (const player of pendingPlayers) {
    const preferred = preferredByPlayer.get(player.id) || [];
    const requiredCount = authorizedCardCount(player);
    const chosen = diverseCardSelection([...preferred, ...available], requiredCount, preferred);
    if (chosen.length < requiredCount) throw new Error('No quedan cartones suficientemente diferentes para completar la asignación automática.');
    available = available.filter(cardId => !chosen.includes(cardId));
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

  for (const item of assigned) {
    for (const cardId of item.cardIds || []) {
      if (state.cardReservations?.[cardId]?.playerId === item.playerId) delete state.cardReservations[cardId];
    }
  }
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
  const selected = new Map();
  for (const claim of state.claims.filter(item => item.status === 'confirmed')) selected.set(claim.id, claim);
  for (const claim of state.claims.slice(-10)) selected.set(claim.id, claim);
  return [...selected.values()]
    .sort((left, right) => Number(left.receivedSequence || 0) - Number(right.receivedSequence || 0))
    .map(claim => {
      const payload = {
        id: claim.id,
        type: claim.type,
        playerName: claim.playerName,
        cardNumber: claim.cardNumber,
        createdAt: claim.createdAt,
        receivedAt: claim.receivedAt || claim.createdAt,
        receivedSequence: claim.receivedSequence || null,
        deltaFromFirstMs: Number(claim.deltaFromFirstMs) || 0,
        officialValid: Boolean(claim.officialValid),
        status: claim.status,
        resolvedAt: claim.resolvedAt || null,
        resolutionReason: claim.resolutionReason || null,
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
    eventMaxPlayers: EVENT_MAX_PLAYERS,
    eventMaxLotCards: EVENT_MAX_LOT_CARDS,
    eventMaxActiveCards: EVENT_MAX_ACTIVE_CARDS,
    maxCardsPerPlayer: MAX_CARDS_PER_PLAYER,
    maxCardOptions: MAX_CARD_OPTIONS,
    maxTieWinnersPerPrize: MAX_TIE_WINNERS_PER_PRIZE,
    lastResult: publicLastResult(),
    publicUrl: PUBLIC_URL || null,
    playerUrl: PUBLIC_URL ? `${PUBLIC_URL}/jugador` : null,
    version: APP_PUBLIC_VERSION,
    demo: Boolean(currentWorkspace().isDemo || state.demo),
    revision: Number(state.revision) || 0,
    workspace: { id: currentWorkspace().id, operatorId: currentWorkspace().operatorId || null, label: currentWorkspace().label }
  };
}

function currentAccessContext() {
  return { role: 'owner', name: 'Administrador principal', expiresAt: null, canCreateNewGames: true };
}

function finalExtractionPayload() {
  if (!state.active || !state.game || state.status !== 'finalizing' || state.transition?.type !== 'final-balls') return null;
  const transition = state.transition;
  const initialDrawnCount = Math.max(0, Number(transition.initialDrawnCount) || 0);
  const total = Number(state.game.mode) || 0;
  const drawnCount = state.game.drawn.length;
  return {
    active: true,
    initialDrawnCount,
    drawnCount,
    total,
    extractedAfterBingo: Math.max(0, drawnCount - initialDrawnCount),
    remaining: Math.max(0, total - drawnCount),
    remainingInitial: Math.max(0, Number(transition.remainingInitial) || total - initialDrawnCount),
    leadInEndsAt: transition.leadInEndsAt || null,
    endsAt: transition.endsAt || null,
    intervalMs: Math.max(0, Number(transition.intervalMs) || 0)
  };
}

function finalShowcasePayload() {
  if (!state.active || !state.game || state.status !== 'finished') return [];
  const claims = PRIZE_TYPES.flatMap(type => confirmedClaims(type))
    .sort((a, b) => new Date(a.resolvedAt || a.createdAt || 0) - new Date(b.resolvedAt || b.createdAt || 0));
  const grouped = new Map();
  for (const claim of claims) {
    const winner = winnerDetails(claim);
    const key = String(winner.cardId || `${winner.playerName}:${winner.cardNumber}`);
    if (!grouped.has(key)) grouped.set(key, {
      cardId: winner.cardId,
      cardNumber: winner.cardNumber,
      playerName: winner.playerName,
      mode: winner.mode,
      grid: deepCopy(winner.grid || []),
      firstConfirmedAt: winner.confirmedAt || winner.claimedAt || null,
      prizes: [],
      winningNumbers: new Set()
    });
    const entry = grouped.get(key);
    const winningNumbers = uniqueNumbers(winner.winningNumbers || []);
    winningNumbers.forEach(number => entry.winningNumbers.add(number));
    entry.prizes.push({
      type: winner.type,
      prizeNumber: winner.prizeNumber,
      prizeLabel: winner.prizeLabel,
      winningLineLabel: winner.winningLineLabel || (winner.type === 'bingo' ? 'Cartón completo' : null),
      winningNumbers
    });
  }
  return [...grouped.values()].map((entry, index) => ({
    ...entry,
    rank: index + 1,
    winningNumbers: [...entry.winningNumbers],
    prizeSummary: entry.prizes.map(prize => prize.prizeLabel).join(' · '),
    playSummary: [...new Set(entry.prizes.map(prize => prize.winningLineLabel).filter(Boolean))].join(' · ') || 'Jugada confirmada'
  }));
}

function adminConnectionCount(workspace = currentWorkspace()) {
  return [...workspace.sseClients].filter(client => client.role === 'admin').length;
}

function adminPresencePayload(workspace = currentWorkspace()) {
  const contingency = workspace.state.adminContingency || blankState().adminContingency;
  const connected = adminConnectionCount(workspace) > 0;
  return {
    connected,
    disconnectedSince: connected ? null : (contingency.disconnectedSince || null),
    activatesAt: connected ? null : (contingency.activatesAt || null),
    autoVerificationActive: Boolean(contingency.autoVerificationActive),
    activatedAt: contingency.activatedAt || null,
    thresholdSeconds: Math.round(ADMIN_CONTINGENCY_MS / 1000)
  };
}

function publicIntegrityPayload() {
  const integrity = state.game?.integrity;
  if (!integrity?.drawOrderCommitment) return null;
  const revealed = state.status === 'finished';
  const recomputed = revealed ? crypto.createHash('sha256').update((state.drawOrder || []).join(',')).digest('hex') : null;
  return {
    algorithm: 'SHA-256',
    sealedAt: integrity.lockedAt || null,
    commitment: integrity.drawOrderCommitment,
    shortCommitment: String(integrity.drawOrderCommitment).slice(0, 12).toUpperCase(),
    revealed,
    drawOrder: revealed ? [...(state.drawOrder || [])] : null,
    verified: revealed ? recomputed === integrity.drawOrderCommitment : null
  };
}

function broadcastPayload() {
  if (!state.active || !state.game) return { active: false, version: APP_PUBLIC_VERSION };
  const pendingClaim = state.claims.find(claim => claim.status === 'pending') || null;
  const latestConfirmedRaw = [...state.claims].reverse().find(claim => claim.status === 'confirmed') || null;
  const latestConfirmed = !pendingClaim && latestConfirmedRaw && Date.now() - new Date(latestConfirmedRaw.resolvedAt || 0).getTime() <= 20_000
    ? latestConfirmedRaw : null;
  return {
    active: true, version: APP_PUBLIC_VERSION, status: state.status, pauseReason: state.pauseReason || null, roomCode: state.roomCode, round: state.round, demo: Boolean(currentWorkspace().isDemo || state.demo),
    playersTotal: state.players.length, playersReady: state.players.filter(player => player.selectionConfirmed).length, playersConnected: connectedPlayerIds().size,
    roomSettings: state.roomSettings, transition: state.transition, publicClaims: publicClaimsPayload(), markingPolicy: markingPolicyPayload(),
    adminPresence: adminPresencePayload(), integrity: publicIntegrityPayload(),
    chat: { enabled: state.chat?.enabled !== false, locked: Boolean(state.chat?.locked), messages: (state.chat?.messages || []).slice(-CHAT_MAX_MESSAGES) },
    game: { id: state.game.id, number: state.game.number, mode: state.game.mode, presenter: PRESENTER_ID, rules: state.game.rules, drawn: state.game.drawn, lastBall: state.game.drawn.at(-1) ?? null, drawTimestamps: state.game.drawTimestamps || {}, lastDrawnAt: state.game.lastDrawnAt || null, total: state.game.mode },
    pendingClaim: pendingClaim ? { type: pendingClaim.type, playerName: pendingClaim.playerName, cardNumber: pendingClaim.cardNumber, eventPlayerId: pendingClaim.eventPlayerId || '', eventLotCode: pendingClaim.eventLotCode || '', eventCardNumber: pendingClaim.eventCardNumber || null, createdAt: pendingClaim.createdAt } : null,
    latestConfirmed: latestConfirmed ? { type: latestConfirmed.type, playerName: latestConfirmed.playerName, cardNumber: latestConfirmed.cardNumber, eventPlayerId: latestConfirmed.eventPlayerId || '', eventLotCode: latestConfirmed.eventLotCode || '', eventCardNumber: latestConfirmed.eventCardNumber || null, prizeNumber: latestConfirmed.prizeNumber || 1, prizeLabel: latestConfirmed.prizeLabel, resolvedAt: latestConfirmed.resolvedAt } : null,
    bingoConfirmed: prizeStatusPayload().bingo.closed,
    finalExtraction: finalExtractionPayload(),
    finalShowcase: finalShowcasePayload(),
    resultsReady: state.status === 'finished',
    highlightedCards: highlightedBroadcastCards(),
    broadcastUrl: shortBroadcastUrlFor(),
    castAppId: CAST_APP_ID || null,
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
      startPlan: { eligiblePlayers:0, connectedEligiblePlayers:0, selectedPlayers:0, autoAssignPlayers:0, pendingMarkingModePlayers:0, canStart:false, canStartFromAdmin:false },
      registrationSummary: { registeredPlayers:0, requestedCards:0, confirmedCards:0, assignedCards:0, pendingSelectionCards:0, playingCards:0 },
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
        markingModeChosen: Boolean(player.markingModeChosen),
        cardId,
        cardNumber: Number(card.eventCardNumber) || card.number,
        eventLotCode: safeEventLotCode(card.eventLotCode || ''),
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
    adminPresence: adminPresencePayload(), integrity: publicIntegrityPayload(),
    claimAutoResume: claimAutoResumePayload(),
    readyToStart: startPlanPayload().canStart,
    startPlan: startPlanPayload(),
    registrationSummary: registrationSummaryPayload(),
    preflight: preflightPayload(),
    roomCode: state.roomCode,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    endedAt: state.endedAt || null,
    updatedAt: state.updatedAt,
    round: state.round,
    roomSettings: state.roomSettings,
    waitingGame: waitingGamePayload(),
    markingPolicy: markingPolicyPayload(),
    chat: { enabled: state.chat?.enabled !== false, locked: Boolean(state.chat?.locked), messages: (state.chat?.messages || []).slice(-CHAT_MAX_MESSAGES), mutedPlayerIds: state.chat?.mutedPlayerIds || [] },
    assignmentTimer: assignmentTimerPayload(),
    prizeStatus: prizeStatusPayload(),
    bingoConfirmed: prizeStatusPayload().bingo.closed,
    adminMessage: state.adminMessage,
    transition: state.transition,
    deviceTransferRequests: (state.deviceTransferRequests || []).filter(request => request.status === 'pending'),
    testEvent: state.testEvent && new Date(state.testEvent.expiresAt || 0).getTime() > Date.now() ? state.testEvent : null,
    accessContext: currentAccessContext(),
    broadcastUrl: shortBroadcastUrlFor(),
    broadcastLongUrl: state.roomSettings?.broadcastToken ? `${PUBLIC_URL || `http://localhost:${PORT}`}/transmision/${encodeURIComponent(state.roomSettings.broadcastToken)}` : null,
    castAppId: CAST_APP_ID || null,
    joinUrl: `${PUBLIC_URL || `http://localhost:${PORT}`}/jugador?sala=${encodeURIComponent(state.roomCode)}&directo=1`,
    lanUrls: getLanAddresses().map(ip => `http://${ip}:${PORT}/jugador`),
    localUrl: `http://localhost:${PORT}`,
    game: state.game,
    players: state.players.map(player => ({
      id: player.id,
      name: playerDisplayName(player),
      nameSet: Boolean(player.nameSet),
      slotLabel: player.slotLabel,
      code: player.code,
      recoveryLinkAvailable: !player.virtual && Boolean(player.inviteClaimedAt || player.sessionToken),
      invitationUrl: player.virtual ? '' : invitationUrlForPlayer(player),
      invitationClaimed: Boolean(player.inviteClaimedAt),
      invitedAt: player.invitedAt || null,
      requestedCardCount: player.requestedCardCount || player.allowedCardCount,
      allowedCardCount: authorizedCardCount(player),
      cardIds: player.cardIds,
      selectionConfirmed: player.selectionConfirmed,
      offeredCardIds: player.offeredCardIds,
      reservedCardIds: player.reservedCardIds || [],
      autoMark: Boolean(player.autoMark),
      markingModeChosen: Boolean(player.markingModeChosen),
      virtual: Boolean(player.virtual),
      accessType: player.codeStatus === 'shared-key' ? 'general' : 'private',
      connected: connected.has(player.id),
      transferPending: (state.deviceTransferRequests || []).some(request => request.playerId === player.id && request.status === 'pending')
    })),
    cardStatus,
    claims: state.claims.slice(-100),
    claimWindow: state.claimWindow ? { ...state.claimWindow } : null,
    claimAutoVerifyMs: CLAIM_ADMIN_AUTO_VERIFY_MS,
    eventLog: state.eventLog.slice(-1000)
  };
}

function communityCreatorPlayersPayload(viewer) {
  if (state.roomSettings?.roomOrigin !== 'community') return null;
  if (String(state.communityCreatorPlayerId || '') !== String(viewer?.id || '')) return null;
  return (state.players || [])
    .filter(item => item?.nameSet && !item.virtual)
    .map(item => ({
      name: playerDisplayName(item),
      cardCount: item.selectionConfirmed ? (item.cardIds || []).length : 0,
      expectedCardCount: authorizedCardCount(item),
      ready: Boolean(item.selectionConfirmed),
      status: item.selectionConfirmed ? 'ready' : 'choosing'
    }));
}

function playerPayload(player) {
  if (!state.active || !state.game || !player) return { active: false, closedReason: String(state.closedReason || ''), returnToCommunity: !currentWorkspace().isDemo };
  if (state.status === 'waiting') refreshOffersForPlayer(player);
  const cards = state.game.cards.filter(card => player.cardIds.includes(card.id));
  const offers = state.game.cards.filter(card => (player.offeredCardIds || []).includes(card.id));
  const communityRecord = state.roomSettings?.roomOrigin === 'community' && state.roomSettings?.communityPublicId ? communityPublicRoomById(state.roomSettings.communityPublicId) : null;
  return {
    active: true,
    status: state.status,
    pauseReason: state.pauseReason || null,
    adminPresence: adminPresencePayload(), integrity: publicIntegrityPayload(),
    roomCode: state.roomCode,
    round: state.round,
    startedAt: state.startedAt,
    endedAt: state.endedAt || null,
    roomSettings: state.roomSettings,
    playerAd: currentWorkspace().isDemo ? { enabled:false, imageUrl:'', durationMs:10000, everyBalls:10 } : playerAdPublicPayload(),
    waitingGame: waitingGamePayload(),
    markingPolicy: markingPolicyPayload(),
    chat: { enabled: state.chat?.enabled !== false, locked: Boolean(state.chat?.locked), messages: (state.chat?.messages || []).slice(-CHAT_MAX_MESSAGES), muted: (state.chat?.mutedPlayerIds || []).includes(player.id) },
    assignmentTimer: assignmentTimerPayload(),
    claimWindow: state.claimWindow ? {
      id: state.claimWindow.id,
      type: state.claimWindow.type || null,
      types: Array.isArray(state.claimWindow.types) ? [...state.claimWindow.types] : (state.claimWindow.type ? [state.claimWindow.type] : []),
      expiresAtMs: Number(state.claimWindow.expiresAtMs) || 0,
      drawnCount: Number(state.claimWindow.drawnCount) || 0,
      lastBall: state.claimWindow.lastBall ?? null
    } : null,
    prizeStatus: prizeStatusPayload(),
    bingoConfirmed: prizeStatusPayload().bingo.closed,
    adminMessage: state.adminMessage,
    transition: state.transition,
    testEvent: state.testEvent && new Date(state.testEvent.expiresAt || 0).getTime() > Date.now() ? state.testEvent : null,
    readiness: playerPrizeReadiness(player),
    publicClaims: publicClaimsPayload(),
    broadcastUrl: shortBroadcastUrlFor(),
    castAppId: CAST_APP_ID || null,
    communityRoom: state.roomSettings?.roomOrigin === 'community' ? {
      publicId: state.roomSettings?.communityPublicId || '',
      name: state.roomSettings?.roomName || `Sala ${state.roomCode}`,
      kind: state.roomSettings?.communityAccessType === 'private' ? 'private' : 'public',
      creatorName: state.roomSettings?.hostName || '',
      isCreator: String(state.communityCreatorPlayerId || '') === String(player.id || ''),
      startMode: state.roomSettings?.communityStartMode || 'manual',
      startsAt: state.roomSettings?.scheduledAt || communityRecord?.startsAt || '',
      shareUrl: state.roomSettings?.communityPublicId ? communityPublicShareUrl(state.roomSettings.communityPublicId) : `${PUBLIC_URL || `http://localhost:${PORT}`}/jugador?sala=${encodeURIComponent(state.roomCode)}&directo=1`,
      playerCount: registrationSummaryPayload().registeredPlayers,
      cardCount: registrationSummaryPayload().playingCards,
      maxPlayers: Math.max(2, Number(state.roomSettings?.maxOpenPlayers) || MAX_PLAYERS),
      creatorPlayers: communityCreatorPlayersPayload(player),
      pendingSelectionPlayers: state.players.filter(item => item?.nameSet && !item.virtual && !item.selectionConfirmed).length,
      isManualCreator: state.status === 'waiting' && state.roomSettings?.communityStartMode === 'manual' && String(state.communityCreatorPlayerId || '') === String(player.id || ''),
      canStart: state.status === 'waiting' && state.roomSettings?.communityStartMode === 'manual' && String(state.communityCreatorPlayerId || '') === String(player.id || '') && registrationSummaryPayload().registeredPlayers >= 2,
      canCancel: ['waiting','starting','playing','verifying','paused','resuming','finalizing'].includes(state.status) && String(state.communityCreatorPlayerId || '') === String(player.id || ''),
      cancelAction: state.status === 'waiting' ? 'cancel' : 'interrupt',
      roundNumber: Math.max(1, Number(communityRecord?.roundNumber || state.round) || 1),
      rematch: state.status === 'finished' && state.communityRematch && !state.communityRematch.disabled ? {
        available: new Date(state.communityRematch.expiresAt || 0).getTime() > Date.now(),
        expiresAt: state.communityRematch.expiresAt || '',
        remainingMs: Math.max(0, new Date(state.communityRematch.expiresAt || 0).getTime() - Date.now()),
        ready: (state.communityRematch.readyPlayerIds || []).includes(String(player.id)),
        readyCount: (state.communityRematch.readyPlayerIds || []).length,
        isCreator: String(state.communityCreatorPlayerId || '') === String(player.id || ''),
        canOpen: String(state.communityCreatorPlayerId || '') === String(player.id || '')
      } : null
    } : null,
    demo: currentWorkspace().isDemo ? {
      active: true,
      label: state.demo?.label || 'DEMOSTRACIÓN — SIN VALIDEZ OFICIAL',
      expiresAt: state.demo?.expiresAt || null,
      autoSeconds: Number(state.game?.autoSeconds) || 4,
      startFlow: demoStartFlowPayload(),
      participants: state.players.map(item => ({ name: playerDisplayName(item), virtual: Boolean(item.virtual), cardCount: (item.cardIds || []).length }))
    } : null,
    game: {
      id: state.game.id,
      number: state.game.number,
      mode: state.game.mode,
      presenter: PRESENTER_ID,
      drawn: state.game.drawn,
      lastBall: state.game.drawn.at(-1) ?? null,
      drawTimestamps: state.game.drawTimestamps || {},
      lastDrawnAt: state.game.lastDrawnAt || null,
      phase: state.game.phase
    },
    player: {
      id: player.id,
      name: playerDisplayName(player),
      nameSet: Boolean(player.nameSet),
      slotLabel: player.slotLabel,
      personalPresenter: PRESENTER_ID,
      requestedCardCount: player.requestedCardCount || player.allowedCardCount,
      allowedCardCount: authorizedCardCount(player),
      confirmedPrizes: state.claims.filter(claim => claim.playerId === player.id && claim.status === 'confirmed').map(claim => ({ id: claim.id, type: claim.type, prizeNumber: claim.prizeNumber || 1, prizeLabel: claim.prizeLabel || prizeLabelFor(claim.type, claim.prizeNumber, state.game?.mode), cardNumber: claim.cardNumber, resolvedAt: claim.resolvedAt || null })),
      excludedFromRound: Boolean(player.excludedFromRound),
      selectionConfirmed: player.selectionConfirmed,
      reservedCardIds: player.reservedCardIds || [],
      reservationTtlSeconds: Math.round(CARD_RESERVATION_TTL_MS / 1000),
      offeredCards: offers,
      cards,
      marks: player.marks || {},
      autoMark: Boolean(player.autoMark),
      markingModeChosen: Boolean(player.markingModeChosen),
      autoMarkForced: false,
      demoHuman: Boolean(player.demoHuman),
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

function readForm(req, limit = 200_000) {
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
      try {
        const params = new URLSearchParams(body);
        resolve(Object.fromEntries(params.entries()));
      } catch { reject(new Error('Formulario inválido.')); }
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
      } else if (client.role === 'event') {
        const event = loadEvent(client.eventCode);
        const eventPlayer = event ? eventPlayerById(event, client.eventPlayerId) : null;
        if (!event || !eventPlayer || safeEventCode(state.eventContext?.eventCode) !== event.code) writeSse(client.res, 'logout', { reason:'El Evento dejó de estar disponible en esta sala.' });
        else writeSse(client.res, 'state', premiumEventPlayerLivePayloadFromContext(event,eventPlayer,client.accessedCard));
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



const CARD90_RANGES = [[1,9],[10,19],[20,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,90]];

function card90FiveColumnChoices() {
  const choices = [];
  for (let mask = 0; mask < (1 << 9); mask++) {
    const columns = [];
    for (let col = 0; col < 9; col++) if (mask & (1 << col)) columns.push(col);
    if (columns.length === 5) choices.push(columns);
  }
  return choices;
}

function generateCard90Pattern(columnCounts) {
  const counts = Array.isArray(columnCounts) ? columnCounts.map(Number) : [];
  if (counts.length !== 9 || counts.some(count => count < 1 || count > 2) || counts.reduce((sum, count) => sum + count, 0) !== 15) {
    throw new Error('Patrón inválido para cartón de 90 bolas.');
  }
  const choices = card90FiveColumnChoices();
  const firstRows = shuffle([...choices]);
  for (const first of firstRows) {
    const firstSet = new Set(first);
    if (counts.some((count, col) => (firstSet.has(col) ? 1 : 0) > count)) continue;
    const secondRows = shuffle([...choices]);
    for (const second of secondRows) {
      const secondSet = new Set(second);
      const third = [];
      let valid = true;
      for (let col = 0; col < 9; col++) {
        const used = (firstSet.has(col) ? 1 : 0) + (secondSet.has(col) ? 1 : 0);
        const remaining = counts[col] - used;
        if (remaining < 0 || remaining > 1) { valid = false; break; }
        if (remaining === 1) third.push(col);
      }
      if (!valid || third.length !== 5) continue;
      const rows = [first, second, third];
      return rows.map(columns => {
        const set = new Set(columns);
        return Array.from({ length: 9 }, (_, col) => set.has(col));
      });
    }
  }
  throw new Error('No se pudo distribuir un cartón de 90 bolas con 5 números por fila.');
}

function validCard90Grid(grid) {
  if (!Array.isArray(grid) || grid.length !== 3 || grid.some(row => !Array.isArray(row) || row.length !== 9)) return false;
  const numbers = [];
  for (const row of grid) {
    const rowNumbers = row.filter(Number.isFinite);
    if (rowNumbers.length !== 5) return false;
    numbers.push(...rowNumbers);
  }
  if (numbers.length !== 15 || new Set(numbers).size !== 15) return false;
  for (let col = 0; col < 9; col++) {
    const [minimum, maximum] = CARD90_RANGES[col];
    const values = [];
    for (let row = 0; row < 3; row++) {
      const value = grid[row][col];
      if (value === null || value === undefined || value === '') continue;
      if (!Number.isInteger(value) || value < minimum || value > maximum) return false;
      values.push(value);
    }
    if (values.length < 1 || values.length > 2) return false;
    if (values.length === 2 && values[0] >= values[1]) return false;
  }
  return true;
}

function generateCard90Server() {
  // Un cartón estándar tiene 15 números: 9 columnas aportan uno como base y
  // exactamente 6 columnas aportan un segundo número. Nunca hay columnas vacías
  // ni columnas llenas con tres números.
  for (let attempt = 0; attempt < 500; attempt++) {
    const columnCounts = Array(9).fill(1);
    for (const col of shuffle(Array.from({ length: 9 }, (_, index) => index)).slice(0, 6)) columnCounts[col] = 2;
    const pattern = generateCard90Pattern(columnCounts);
    const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
    for (let col = 0; col < 9; col++) {
      const rows = [0,1,2].filter(row => pattern[row][col]);
      const [minimum, maximum] = CARD90_RANGES[col];
      const values = shuffle(Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index))
        .slice(0, rows.length)
        .sort((a,b) => a-b);
      rows.forEach((row, index) => { grid[row][col] = values[index]; });
    }
    if (validCard90Grid(grid)) return grid;
  }
  throw new Error('No se pudo generar un cartón estándar de 90 bolas.');
}

function generateCard90StripColumnCounts() {
  // En una serie de 6, cada cartón aporta al menos un número por columna (6 en total).
  // Los números restantes que necesita cada columna son 3,4,4,4,4,4,4,4,5 para
  // completar exactamente los rangos 1-9, 10-19, ..., 80-90.
  const targets = CARD90_RANGES.map(([minimum, maximum]) => (maximum - minimum + 1) - 6);
  const subsets = [];
  const build = (start, chosen) => {
    if (chosen.length === 6) { subsets.push([...chosen]); return; }
    for (let col = start; col < 9; col++) {
      chosen.push(col); build(col + 1, chosen); chosen.pop();
    }
  };
  build(0, []);
  const remaining = [...targets];
  const selectedByCard = [];
  const choose = cardIndex => {
    if (cardIndex === 6) return remaining.every(value => value === 0);
    const cardsLeftAfter = 5 - cardIndex;
    for (const subset of shuffle([...subsets])) {
      if (subset.some(col => remaining[col] <= 0)) continue;
      subset.forEach(col => { remaining[col] -= 1; });
      const feasible = remaining.every(value => value >= 0 && value <= cardsLeftAfter)
        && remaining.reduce((sum, value) => sum + value, 0) === cardsLeftAfter * 6;
      if (feasible) {
        selectedByCard.push(subset);
        if (choose(cardIndex + 1)) return true;
        selectedByCard.pop();
      }
      subset.forEach(col => { remaining[col] += 1; });
    }
    return false;
  };
  if (!choose(0)) throw new Error('No se pudo distribuir una serie estándar de 6 cartones de 90 bolas.');
  return selectedByCard.map(extraColumns => {
    const counts = Array(9).fill(1);
    extraColumns.forEach(col => { counts[col] = 2; });
    return counts;
  });
}

function generateCard90StripServer() {
  // Una serie/hoja estándar de 6 cartones contiene 6 × 15 = 90 posiciones numéricas.
  // Las llenamos con 1..90 exactamente una vez, respetando columna y orden vertical.
  for (let attempt = 0; attempt < 200; attempt++) {
    const columnCountsByCard = generateCard90StripColumnCounts();
    const patterns = columnCountsByCard.map(generateCard90Pattern);
    const grids = Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => Array(9).fill(null)));
    for (let col = 0; col < 9; col++) {
      const [minimum, maximum] = CARD90_RANGES[col];
      const values = shuffle(Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index));
      let cursor = 0;
      for (const cardIndex of shuffle([0,1,2,3,4,5])) {
        const rows = [0,1,2].filter(row => patterns[cardIndex][row][col]);
        const selected = values.slice(cursor, cursor + rows.length).sort((a,b) => a-b);
        cursor += rows.length;
        rows.forEach((row, index) => { grids[cardIndex][row][col] = selected[index]; });
      }
      if (cursor !== values.length) throw new Error('Distribución incompleta en serie de 90 bolas.');
    }
    const allNumbers = grids.flat(2).filter(Number.isFinite).sort((a,b) => a-b);
    const completeStrip = allNumbers.length === 90 && allNumbers.every((value, index) => value === index + 1);
    if (completeStrip && grids.every(validCard90Grid)) return grids;
  }
  throw new Error('No se pudo generar una serie estándar de 6 cartones de 90 bolas.');
}

function generateCard75Server() {
  const grid = Array.from({ length: 5 }, () => Array(5).fill(null));
  const starts = [1,16,31,46,61];
  for (let col = 0; col < 5; col++) {
    const count = col === 2 ? 4 : 5;
    const values = shuffle(Array.from({ length: 15 }, (_, index) => starts[col] + index)).slice(0, count).sort((a,b) => a-b);
    const rows = col === 2 ? [0,1,3,4] : [0,1,2,3,4];
    rows.forEach((row, index) => { grid[row][col] = values[index]; });
  }
  grid[2][2] = 'LIBRE';
  return grid;
}

function generateDiverseCardsServer(count, mode, rules, maxSharedOverride = null) {
  const cards = [];
  const lineSignatures = new Set();
  const maxShared = maxSharedOverride !== null && maxSharedOverride !== undefined && Number.isFinite(Number(maxSharedOverride)) ? Number(maxSharedOverride) : (Number(mode) === 75 ? 12 : 6);
  let attempts = 0;
  while (cards.length < count && attempts++ < count * 5000) {
    const grid = Number(mode) === 75 ? generateCard75Server() : generateCard90Server();
    const card = {
      id: randomId('card'), number: String(cards.length + 1).padStart(3, '0'), name: `Cartón ${cards.length + 1}`,
      originalName: `Cartón ${cards.length + 1}`, mode, source: 'generated', grid,
      bets: { ambocabeza: mode === 90 && rules.ambocabeza !== false, line: rules.line !== false, doubleLine: mode === 75 && Boolean(rules.doubleLine), tripleLine: mode === 75 && Boolean(rules.tripleLine), corners: mode === 75 && Boolean(rules.corners), bingo: rules.bingo !== false }
    };
    const lines = cardWinningSignatures(card);
    if (lines.some(signature => lineSignatures.has(signature))) continue;
    if (cards.some(existing => sharedCardNumbers(existing, card) > maxShared || cardSignature(existing) === cardSignature(card))) continue;
    cards.push(card);
    lines.forEach(signature => lineSignatures.add(signature));
  }
  if (cards.length !== count) throw new Error(`No se pudieron generar cartones suficientemente diferentes: ${cards.length}/${count} tras ${attempts} intentos (máximo compartido ${maxShared}).`);
  return cards;
}


function safeCardLotCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^LG-[A-Z0-9]{6}$/.test(code) ? code : '';
}

function cardLotPath(code) {
  const safe = safeCardLotCode(code);
  if (!safe) return '';
  return path.join(CARD_LOTS_DIR, `${safe}.json`);
}

function randomCardLotCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 1000; attempt++) {
    let suffix = '';
    const bytes = crypto.randomBytes(6);
    for (let index = 0; index < 6; index++) suffix += alphabet[bytes[index] % alphabet.length];
    const code = `LG-${suffix}`;
    if (!fs.existsSync(cardLotPath(code))) return code;
  }
  throw new Error('No se pudo crear un código de lote único.');
}

function printableSiteLabel() {
  const configured = String(platform.community?.cardsPrintSite || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return configured || 'bingo-gorda.onrender.com/comunidad';
}

function normalizePrintableTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}

function printableTitleFilename(value) {
  const title = normalizePrintableTitle(value);
  if (!title) return '';
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
}

function cardLotPdfFilename(lot) {
  const title = printableTitleFilename(lot?.title);
  return title
    ? `${title}_BINGO_${Number(lot?.mode) === 75 ? 75 : 90}_${safeCardLotCode(lot?.code) || 'CARTONES'}.pdf`
    : `EL_BINGO_DE_LA_GORDA_${Number(lot?.mode) === 75 ? 75 : 90}_Lote_${safeCardLotCode(lot?.code) || 'CARTONES'}.pdf`;
}

function publicCardLot(lot) {
  return {
    version: Number(lot.version) || 1,
    code: lot.code,
    mode: Number(lot.mode) === 75 ? 75 : 90,
    seriesCount: Number(lot.seriesCount) || 1,
    cardsPerSeries: 6,
    totalCards: Number(lot.totalCards) || 6,
    createdAt: lot.createdAt,
    site: lot.site || printableSiteLabel(),
    title: normalizePrintableTitle(lot.title),
    series: Array.isArray(lot.series) ? lot.series.map(series => ({
      number: Number(series.number) || 1,
      cards: Array.isArray(series.cards) ? series.cards.map(card => ({
        seriesNumber: Number(card.seriesNumber) || Number(series.number) || 1,
        cardNumber: Number(card.cardNumber) || 1,
        globalNumber: Number(card.globalNumber) || 1,
        mode: Number(card.mode) === 75 ? 75 : 90,
        grid: Array.isArray(card.grid) ? card.grid : []
      })) : []
    })) : []
  };
}

function loadCardLot(code) {
  const file = cardLotPath(code);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!safeCardLotCode(parsed.code) || !Array.isArray(parsed.series)) return null;
    return publicCardLot(parsed);
  } catch {
    return null;
  }
}

function createPrintableCardLot(payload = {}) {
  const mode = Number(payload.mode) === 75 ? 75 : 90;
  const seriesCount = Math.max(1, Math.min(10, Math.round(Number(payload.seriesCount) || 1)));
  const totalCards = seriesCount * 6;
  const code = randomCardLotCode();
  const title = normalizePrintableTitle(payload.title);
  let series;
  if (mode === 90) {
    // En Bingo 90 cada serie impresa es una tira estándar de 6 cartones: entre los
    // seis aparecen todos los números del 1 al 90 una única vez.
    series = Array.from({ length: seriesCount }, (_, seriesIndex) => {
      const strip = generateCard90StripServer();
      return {
        number: seriesIndex + 1,
        cards: strip.map((grid, cardIndex) => ({
          seriesNumber: seriesIndex + 1,
          cardNumber: cardIndex + 1,
          globalNumber: seriesIndex * 6 + cardIndex + 1,
          mode,
          grid
        }))
      };
    });
  } else {
    const rules = roomRulesFor(75, { line:true, corners:true, doubleLine:true, tripleLine:true, bingo:true });
    const generated = generateDiverseCardsServer(totalCards, mode, rules, 13);
    series = Array.from({ length: seriesCount }, (_, seriesIndex) => ({
      number: seriesIndex + 1,
      cards: generated.slice(seriesIndex * 6, seriesIndex * 6 + 6).map((card, cardIndex) => ({
        seriesNumber: seriesIndex + 1,
        cardNumber: cardIndex + 1,
        globalNumber: seriesIndex * 6 + cardIndex + 1,
        mode,
        grid: card.grid
      }))
    }));
  }
  const lot = {
    version: 1,
    code,
    mode,
    seriesCount,
    cardsPerSeries: 6,
    totalCards,
    createdAt: nowIso(),
    site: printableSiteLabel(),
    title,
    series
  };
  const file = cardLotPath(code);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(lot, null, 2), 'utf8');
  fs.renameSync(temp, file);
  return publicCardLot(lot);
}

function validateCardLotClaim(payload = {}) {
  const lot = loadCardLot(payload.lot);
  if (!lot) throw new Error('No encontramos ese lote de cartones.');
  const seriesNumber = Math.max(1, Math.round(Number(payload.seriesNumber) || 0));
  const cardNumber = Math.max(1, Math.round(Number(payload.cardNumber) || 0));
  const cardData = (lot.series.find(item => Number(item.number) === seriesNumber)?.cards || []).find(item => Number(item.cardNumber) === cardNumber);
  if (!cardData) throw new Error('Ese cartón no pertenece al lote indicado.');
  const type = String(payload.type || '');
  const allowed = lot.mode === 75 ? ['line','doubleLine','tripleLine','corners','bingo'] : ['ambo','line','secondLine','bingo'];
  if (!allowed.includes(type)) throw new Error('La jugada a validar no corresponde a este Bingo.');
  const drawn = uniqueNumbers(Array.isArray(payload.drawn) ? payload.drawn : []).filter(number => number >= 1 && number <= lot.mode);
  const card = { mode:lot.mode, grid:cardData.grid };
  const analysis = analyzeCard(card, drawn);
  const consumed = new Set(Array.isArray(payload.consumedLineKeys) ? payload.consumedLineKeys.map(String) : []);
  let valid = false;
  let lineKey = '';
  if (type === 'ambo') valid = analysis.hasAmbo;
  else if (type === 'line' || type === 'secondLine') {
    const detail = (analysis.completeLines || []).find(item => !consumed.has(String(item.key)));
    valid = Boolean(detail);
    lineKey = detail?.key || '';
  } else if (type === 'doubleLine') valid = analysis.hasDoubleLine;
  else if (type === 'tripleLine') valid = analysis.hasTripleLine;
  else if (type === 'corners') valid = analysis.hasCorners;
  else if (type === 'bingo') valid = analysis.hasBingo;
  const missingNumbers = type === 'bingo'
    ? cardNumbers(card).filter(number => !drawn.includes(number)).slice(0, 12)
    : type === 'corners'
      ? [card.grid?.[0]?.[0],card.grid?.[0]?.[4],card.grid?.[4]?.[0],card.grid?.[4]?.[4]].filter(Number.isFinite).filter(number => !drawn.includes(number))
      : [];
  return { valid, type, lineKey, missingNumbers, seriesNumber, cardNumber, lot:lot.code };
}

function pdfStarCommands(cx, cy, outerRadius, innerRadius, rgb, color, topY) {
  const points = [];
  for (let index = 0; index < 10; index++) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  const [first, ...rest] = points;
  const pathCommands = [`${first[0].toFixed(2)} ${topY(first[1]).toFixed(2)} m`];
  rest.forEach(point => pathCommands.push(`${point[0].toFixed(2)} ${topY(point[1]).toFixed(2)} l`));
  pathCommands.push('h f');
  return `${rgb(color)} rg ${pathCommands.join(' ')}`;
}

function buildCardLotPdf(lot) {
  const publicLot = publicCardLot(lot);
  const mode = publicLot.mode;
  const PAGE_W = mode === 90 ? 842 : 595;
  const PAGE_H = mode === 90 ? 595 : 842;
  const logoPath = path.join(ROOT, 'assets', 'logo-pdf.jpg');
  const logo = fs.readFileSync(logoPath);
  const rgb = hex => hexRgb(hex).map(value => value.toFixed(3)).join(' ');
  const colors = { ink:'#21192A', muted:'#8A8291', purple:'#6D238C', pink:'#D83A84', gold:'#E0A71A', line:'#CFC8D4', pale:'#F8F6F9', empty:'#ECE8EF', white:'#FFFFFF' };
  const pageStreams = [];

  for (const series of publicLot.series) {
    const commands = [];
    const topY = (y, height = 0) => PAGE_H - y - height;
    const rect = (x, y, width, height, fill = null, stroke = null, lineWidth = 1) => {
      if (fill) commands.push(`${rgb(fill)} rg`);
      if (stroke) commands.push(`${rgb(stroke)} RG ${lineWidth} w`);
      commands.push(`${x.toFixed(2)} ${topY(y, height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    };
    const line = (x1,y1,x2,y2,color=colors.line,width=.6) => commands.push(`${rgb(color)} RG ${width} w ${x1.toFixed(2)} ${topY(y1).toFixed(2)} m ${x2.toFixed(2)} ${topY(y2).toFixed(2)} l S`);
    const emptyCell = (x, y, width, height) => {
      rect(x, y, width, height, colors.empty, colors.line, .55);
    };
    const text = (value, x, y, size = 10, options = {}) => {
      const font = options.bold ? 'F2' : 'F1';
      const color = options.color || colors.ink;
      const maxWidth = options.maxWidth || null;
      const shown = maxWidth ? fitPdfText(value, maxWidth, size) : pdfLatin(value);
      let tx = x;
      const width = pdfTextWidth(shown, size);
      if (options.align === 'center') tx = x - width / 2;
      if (options.align === 'right') tx = x - width;
      commands.push(`BT /${font} ${size.toFixed(2)} Tf ${rgb(color)} rg 1 0 0 1 ${tx.toFixed(2)} ${(PAGE_H - y - size).toFixed(2)} Tm (${pdfEscape(shown)}) Tj ET`);
    };
    const image = (x,y,width,height) => commands.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${topY(y,height).toFixed(2)} cm /Logo Do Q`);
    const marginX = mode === 90 ? 18 : 16;
    const marginTop = 12;
    const footerH = 25;
    const gapX = 9;
    const gapY = 7;
    const cardW = (PAGE_W - marginX * 2 - gapX) / 2;
    const cardH = (PAGE_H - marginTop - footerH - gapY * 2) / 3;

    rect(0, 0, PAGE_W, PAGE_H, '#FFFFFF');
    (series.cards || []).forEach((card, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = marginX + col * (cardW + gapX);
      const y = marginTop + row * (cardH + gapY);
      rect(x, y, cardW, cardH, '#FFFFFF', colors.line, .8);
      rect(x, y, cardW, 3.5, index % 2 ? colors.pink : colors.purple);
      const logoSize = mode === 90 ? 27 : 25;
      image(x + 7, y + 7, logoSize, logoSize);
      if (publicLot.title) {
        text(publicLot.title, x + 39, y + 5.5, mode === 90 ? 8.7 : 8.2, { bold:true, color:colors.purple, maxWidth:cardW * .58 });
        text(`BINGO ${mode} · Lote ${publicLot.code} · Serie ${String(series.number).padStart(2,'0')}`, x + 39, y + 19.5, 5.1, { color:colors.muted, maxWidth:cardW * .58 });
      } else {
        text(`BINGO ${mode}`, x + 39, y + 7, mode === 90 ? 10 : 9, { bold:true, color:colors.purple });
        text(`Lote ${publicLot.code} · Serie ${String(series.number).padStart(2,'0')}`, x + 39, y + 20, 5.4, { color:colors.muted, maxWidth:cardW * .45 });
      }
      const badgeSize = mode === 90 ? 31 : 28;
      const badgeX = x + cardW - 7 - badgeSize;
      const badgeY = y + 7;
      rect(badgeX, badgeY, badgeSize, badgeSize, '#FBEAF3', colors.pink, 1.15);
      const badgeFont = mode === 90 ? 13 : 12;
      text(String(card.cardNumber).padStart(2,'0'), badgeX + badgeSize / 2, badgeY + (badgeSize - badgeFont) / 2 - .6, badgeFont, { bold:true, color:colors.pink, align:'center' });

      if (mode === 90) {
        const gx = x + 7;
        const gy = y + 39;
        const gw = cardW - 14;
        const gh = cardH - 47;
        const cw = gw / 9;
        const ch = gh / 3;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 9; c++) {
            const value = card.grid?.[r]?.[c];
            const cx = gx + c * cw;
            const cy = gy + r * ch;
            if (value == null) emptyCell(cx, cy, cw, ch);
            else rect(cx, cy, cw, ch, '#FFFFFF', colors.line, .55);
            if (Number.isFinite(value)) text(String(value), cx + cw / 2, cy + ch * .24, Math.min(18, ch * .48), { bold:true, align:'center', color:colors.ink });
          }
        }
      } else {
        const gx = x + 8;
        const gy = y + 38;
        const gw = cardW - 16;
        const headerH = 17;
        const gh = cardH - 47;
        const cw = gw / 5;
        const ch = (gh - headerH) / 5;
        'BINGO'.split('').forEach((letter, c) => {
          const cx = gx + c * cw;
          rect(cx, gy, cw, headerH, c === 4 ? '#FBEAF3' : '#F3ECF7', colors.line, .55);
          text(letter, cx + cw / 2, gy + 3.3, 9.5, { bold:true, align:'center', color:c === 4 ? colors.pink : colors.purple });
        });
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            const value = card.grid?.[r]?.[c];
            const cx = gx + c * cw;
            const cy = gy + headerH + r * ch;
            const free = value === 'LIBRE';
            rect(cx, cy, cw, ch, free ? '#FFF8DF' : '#FFFFFF', free ? colors.gold : colors.line, free ? .9 : .55);
            if (free) {
              commands.push(pdfStarCommands(cx + cw / 2, cy + ch / 2, Math.min(cw,ch) * .26, Math.min(cw,ch) * .12, rgb, colors.gold, topY));
            } else if (Number.isFinite(value)) {
              text(String(value), cx + cw / 2, cy + ch * .23, Math.min(16, ch * .45), { bold:true, align:'center', color:colors.ink });
            }
          }
        }
      }
    });
    line(marginX, PAGE_H - footerH + 5, PAGE_W - marginX, PAGE_H - footerH + 5, '#E5E0E8', .5);
    text(publicLot.site || printableSiteLabel(), PAGE_W / 2, PAGE_H - 15, 7, { color:colors.muted, align:'center', maxWidth:PAGE_W - 80 });
    pageStreams.push(commands.join('\n'));
  }

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
  const pageIds = [];
  for (const stream of pageStreams) {
    const contentBuffer = Buffer.from(stream, 'latin1');
    const contentId = addObject(Buffer.concat([
      Buffer.from(`<< /Length ${contentBuffer.length} >>\nstream\n`, 'latin1'), contentBuffer, Buffer.from('\nendstream', 'latin1')
    ]));
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << /Logo ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const embeddedLot = Buffer.from(JSON.stringify(publicLot), 'utf8').toString('base64url');
  const embeddedMarker = Buffer.from(`LA_GORDA_CARD_LOT_V1\n${embeddedLot}\nLA_GORDA_CARD_LOT_END`, 'latin1');
  addObject(Buffer.concat([Buffer.from(`<< /Length ${embeddedMarker.length} >>\nstream\n`, 'latin1'), embeddedMarker, Buffer.from('\nendstream', 'latin1')]));
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


// -----------------------------------------------------------------------------
// MODO EVENTO PREMIUM - FASE 1 + FASE 2 + FASE 2.1
// Fase 1: Evento + diseñador de tanda + códigos privados + PDFs premium.
// Fase 2: jugadores + vinculación de varios cartones + acceso agrupado por código.
// Fase 2.1: ciclo de vida del evento: archivar, restaurar y eliminar definitivamente.
// El motor de partida todavía no cambia en estas fases.
// -----------------------------------------------------------------------------
function safeEventCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^EV-[A-Z0-9]{6}$/.test(code) ? code : '';
}
function safeEventLotCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^EVT-[A-Z0-9]{6}$/.test(code) ? code : '';
}
function eventPath(code) {
  const safe = safeEventCode(code);
  return safe ? path.join(EVENTS_DIR, `${safe}.json`) : '';
}
function eventLotPath(code) {
  const safe = safeEventLotCode(code);
  return safe ? path.join(EVENT_LOTS_DIR, `${safe}.json`) : '';
}
function randomPremiumCode(prefix, dir, validator) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 1000; attempt++) {
    const bytes = crypto.randomBytes(6);
    let suffix = '';
    for (let index = 0; index < 6; index++) suffix += alphabet[bytes[index] % alphabet.length];
    const code = `${prefix}-${suffix}`;
    const file = validator(code) ? path.join(dir, `${code}.json`) : '';
    if (file && !fs.existsSync(file)) return code;
  }
  throw new Error('No se pudo crear un código único para el evento.');
}
function randomEventCode() { return randomPremiumCode('EV', EVENTS_DIR, safeEventCode); }
function randomEventLotCode() { return randomPremiumCode('EVT', EVENT_LOTS_DIR, safeEventLotCode); }
function normalizeEventText(value, max = 80) {
  return String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function normalizeEventHex(value, fallback) {
  const raw = String(value || '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw.toUpperCase() : fallback;
}
function normalizeEventDate(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}
function eventLogoPath(code) {
  const safe = safeEventCode(code);
  return safe ? path.join(EVENT_ASSETS_DIR, `${safe}.jpg`) : '';
}
function eventLotLogoPath(code) {
  const safe = safeEventLotCode(code);
  return safe ? path.join(EVENT_ASSETS_DIR, `${safe}.jpg`) : '';
}
function saveEventLogo(code, dataUrl) {
  const file = eventLogoPath(code);
  if (!file) return false;
  if (!dataUrl) return false;
  const match = String(dataUrl).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('El logo del evento debe enviarse como JPEG.');
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > 2_500_000) throw new Error('El logo del evento es demasiado grande.');
  // La interfaz normaliza el logo a JPEG cuadrado 512 x 512.
  fs.writeFileSync(file, buffer);
  return true;
}
function publicEvent(event) {
  return {
    version: Number(event?.version) || 1,
    code: safeEventCode(event?.code),
    name: normalizeEventText(event?.name, 80),
    tagline: normalizeEventText(event?.tagline, 100),
    sponsor: normalizeEventText(event?.sponsor, 80),
    date: normalizeEventDate(event?.date),
    location: normalizeEventText(event?.location, 100),
    mode: Number(event?.mode) === 75 ? 75 : 90,
    colors: {
      primary: normalizeEventHex(event?.colors?.primary, '#6D238C'),
      secondary: normalizeEventHex(event?.colors?.secondary, '#D83A84'),
      accent: normalizeEventHex(event?.colors?.accent, '#E0A71A')
    },
    logoUrl: fs.existsSync(eventLogoPath(event?.code)) ? `/event-assets/${encodeURIComponent(event.code)}.jpg?v=${encodeURIComponent(event.updatedAt || event.createdAt || '1')}` : '/assets/logo.webp',
    createdAt: event?.createdAt || '',
    updatedAt: event?.updatedAt || event?.createdAt || '',
    status: event?.status || 'draft',
    archivedAt: event?.archivedAt || '',
    restoredAt: event?.restoredAt || '',
    lotCodes: Array.isArray(event?.lotCodes) ? event.lotCodes.filter(safeEventLotCode) : [],
    playersCount: Array.isArray(event?.players) ? event.players.length : 0,
    linkedCardsCount: Array.isArray(event?.players) ? event.players.reduce((sum, player) => sum + (Array.isArray(player?.cards) ? player.cards.length : 0), 0) : 0,
    live: event?.live && event.live.workspaceId ? {
      active: Boolean(event.live.active), roomCode: String(event.live.roomCode || ''),
      activatedAt: event.live.activatedAt || '', updatedAt: event.live.updatedAt || ''
    } : null
  };
}
function loadEvent(code) {
  const file = eventPath(code);
  if (!file || !fs.existsSync(file)) return null;
  try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); return safeEventCode(parsed.code) ? parsed : null; } catch { return null; }
}
function saveEvent(event) {
  const file = eventPath(event.code);
  if (!file) throw new Error('Código de evento no válido.');
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(event, null, 2), 'utf8');
  fs.renameSync(temp, file);
}
function createPremiumEvent(payload = {}) {
  const name = normalizeEventText(payload.name, 80);
  if (!name) throw new Error('Escribí el nombre del evento.');
  const code = randomEventCode();
  const now = nowIso();
  const event = {
    version: 1, code, name,
    tagline: normalizeEventText(payload.tagline, 100),
    sponsor: normalizeEventText(payload.sponsor, 80),
    date: normalizeEventDate(payload.date),
    location: normalizeEventText(payload.location, 100),
    mode: Number(payload.mode) === 75 ? 75 : 90,
    colors: {
      primary: normalizeEventHex(payload.colors?.primary, '#6D238C'),
      secondary: normalizeEventHex(payload.colors?.secondary, '#D83A84'),
      accent: normalizeEventHex(payload.colors?.accent, '#E0A71A')
    },
    status: 'draft', lotCodes: [], players: [], createdAt: now, updatedAt: now
  };
  if (payload.logoDataUrl) saveEventLogo(code, payload.logoDataUrl);
  saveEvent(event);
  return publicEvent(event);
}
function eventListPayload() {
  const events = [];
  for (const name of fs.readdirSync(EVENTS_DIR, { withFileTypes: true })) {
    if (!name.isFile() || !/^EV-[A-Z0-9]{6}\.json$/.test(name.name)) continue;
    const event = loadEvent(name.name.replace(/\.json$/, ''));
    if (event) events.push(publicEvent(event));
  }
  return events.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100);
}
function assertEventEditable(event) {
  if (!event) throw new Error('No encontramos ese evento.');
  if (event.status === 'archived') throw new Error('Este evento está archivado. Restauralo antes de modificarlo.');
  const liveWorkspace = event?.live?.active ? eventLiveWorkspace(event) : null;
  if (liveWorkspace && liveWorkspace.state?.active && liveWorkspace.state?.status !== 'waiting') {
    throw new Error('La partida de este Evento ya comenzó. Los jugadores y cartones quedaron congelados para proteger la integridad de la tanda.');
  }
}
function archivePremiumEvent(payload = {}) {
  const event = loadEvent(payload.eventCode);
  if (!event) throw new Error('No encontramos ese evento.');
  if (event.status === 'archived') return publicEvent(event);
  const liveWorkspace = event.live?.active ? eventLiveWorkspace(event) : null;
  if (liveWorkspace && ['starting','playing','paused','verifying','resuming','finalizing'].includes(String(liveWorkspace.state?.status || ''))) {
    throw new Error('Finalizá la partida del Evento antes de archivarlo.');
  }
  const now = nowIso();
  event.status = 'archived';
  event.archivedAt = now;
  if (event.live) event.live = { ...event.live, active:false, updatedAt:now, deactivatedAt:now };
  event.updatedAt = now;
  event.version = Math.max(3, Number(event.version) || 1);
  saveEvent(event);
  return publicEvent(event);
}
function restorePremiumEvent(payload = {}) {
  const event = loadEvent(payload.eventCode);
  if (!event) throw new Error('No encontramos ese evento.');
  if (event.status !== 'archived') return publicEvent(event);
  const now = nowIso();
  event.status = 'draft';
  event.archivedAt = '';
  event.restoredAt = now;
  event.updatedAt = now;
  event.version = Math.max(3, Number(event.version) || 1);
  saveEvent(event);
  return publicEvent(event);
}
function unlinkIfExists(file) {
  if (file && fs.existsSync(file)) fs.unlinkSync(file);
}
function deletePremiumEvent(payload = {}) {
  const event = loadEvent(payload.eventCode);
  if (!event) throw new Error('No encontramos ese evento.');
  if (event.status !== 'archived') throw new Error('Primero archivá el evento antes de eliminarlo definitivamente.');
  const confirmation = String(payload.confirmation || '').trim().toUpperCase();
  if (confirmation !== event.code) throw new Error(`Para eliminar definitivamente, escribí exactamente ${event.code}.`);
  const lotCodes = Array.isArray(event.lotCodes) ? event.lotCodes.filter(safeEventLotCode) : [];
  for (const lotCode of lotCodes) {
    const lot = loadEventLot(lotCode);
    if (lot && lot.eventCode === event.code) {
      unlinkIfExists(eventLotPath(lotCode));
      unlinkIfExists(eventLotLogoPath(lotCode));
    }
  }
  unlinkIfExists(eventLogoPath(event.code));
  unlinkIfExists(eventPath(event.code));
  const prefix = `${event.code}:`;
  for (const key of eventPlayerPresence.keys()) if (key.startsWith(prefix)) eventPlayerPresence.delete(key);
  return { ok:true, deleted:true, eventCode:event.code, lotsDeleted:lotCodes.length };
}
function randomEventCardAccessCode(used) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 1000; attempt++) {
    const bytes = crypto.randomBytes(8);
    let raw = '';
    for (let i=0;i<8;i++) raw += alphabet[bytes[i] % alphabet.length];
    const code = `${raw.slice(0,4)}-${raw.slice(4)}`;
    if (!used.has(code)) { used.add(code); return code; }
  }
  throw new Error('No se pudo crear un código privado para un cartón.');
}
function eventLotIntegrityPayload(lot) {
  return {
    version: lot.version, code: lot.code, eventCode: lot.eventCode, mode: lot.mode,
    totalCards: lot.totalCards, seriesCount: lot.seriesCount, createdAt: lot.createdAt,
    layout: lot.layout || undefined,
    qualityAudit: lot.qualityAudit || undefined,
    branding: lot.branding, cards: lot.cards.map(card => ({
      globalNumber: card.globalNumber, seriesNumber: card.seriesNumber, cardNumber: card.cardNumber,
      accessCode: card.accessCode, grid: card.grid
    }))
  };
}
function eventLotHash(lot) {
  return crypto.createHash('sha256').update(JSON.stringify(eventLotIntegrityPayload(lot))).digest('hex');
}
function publicEventLot(lot, includePrivate = false) {
  const base = {
    version: Number(lot?.version) || 1,
    code: safeEventLotCode(lot?.code), eventCode: safeEventCode(lot?.eventCode),
    mode: Number(lot?.mode) === 75 ? 75 : 90,
    totalCards: Number(lot?.totalCards) || 0, seriesCount: Number(lot?.seriesCount) || Math.ceil((Number(lot?.totalCards)||0)/6),
    cardsPerSeries: 6, cardsPerPage: 6, createdAt: lot?.createdAt || '', hash: String(lot?.hash || ''),
    layout: lot?.layout || { cardsPerPage:6, mathematicalSeries:false },
    qualityAudit: lot?.qualityAudit ? deepCopy(lot.qualityAudit) : null,
    branding: { ...(lot?.branding || {}) }
  };
  if (includePrivate) base.cards = (lot.cards || []).map(card => ({...card}));
  return base;
}
function loadEventLot(code) {
  const file = eventLotPath(code);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!safeEventLotCode(parsed.code) || !Array.isArray(parsed.cards)) return null;
    if (parsed.hash && parsed.hash !== eventLotHash(parsed)) return null;
    return parsed;
  } catch { return null; }
}
function eventNumericGridValues(grid) {
  return (Array.isArray(grid) ? grid.flat() : []).filter(Number.isFinite).map(Number).sort((a,b)=>a-b);
}
function eventCardNumberMask(values) {
  let mask = 0n;
  for (const value of values) if (Number.isInteger(value) && value >= 1 && value <= 90) mask |= (1n << BigInt(value - 1));
  return mask;
}
function eventBigIntPopcount(value) {
  let count = 0, current = value;
  while (current) { current &= current - 1n; count++; }
  return count;
}
function event90RowFourSignatures(grid) {
  const signatures = [];
  for (const row of grid || []) {
    const values = (row || []).filter(Number.isFinite).map(Number).sort((a,b)=>a-b);
    if (values.length !== 5) continue;
    for (let skip=0; skip<5; skip++) signatures.push(values.filter((_,index)=>index!==skip).join('-'));
  }
  return signatures;
}
function event90RowSignatures(grid) {
  return (grid || []).map(row => (row || []).filter(Number.isFinite).map(Number).sort((a,b)=>a-b).join('-')).filter(Boolean);
}
function generateBalancedEventCard90Server(numberFrequency = null) {
  const frequency = numberFrequency || Array(91).fill(0);
  for (let attempt=0; attempt<700; attempt++) {
    const columnCounts = Array(9).fill(1);
    for (const col of shuffle(Array.from({length:9},(_,index)=>index)).slice(0,6)) columnCounts[col]=2;
    const pattern = generateCard90Pattern(columnCounts);
    const grid = Array.from({length:3},()=>Array(9).fill(null));
    for (let col=0; col<9; col++) {
      const rows=[0,1,2].filter(row=>pattern[row][col]);
      const [minimum,maximum]=CARD90_RANGES[col];
      const candidates=Array.from({length:maximum-minimum+1},(_,index)=>minimum+index)
        .map(value=>({value,score:(Number(frequency[value])||0) + Math.random()*18}))
        .sort((a,b)=>a.score-b.score)
        .slice(0,rows.length).map(item=>item.value).sort((a,b)=>a-b);
      rows.forEach((row,index)=>{grid[row][col]=candidates[index];});
    }
    if(validCard90Grid(grid)) return grid;
  }
  throw new Error('No se pudo generar un cartón Bingo 90 Evento válido.');
}
function generatePremiumEventCards90(count, maxSharedLimit = event90SharedLimitForCount(count)) {
  const accepted = [], infos = [], rowFourSet = new Set(), frequency = Array(91).fill(0);
  const candidateBatch = count >= 700 ? 5 : count >= 300 ? 6 : 8;
  for (let index=0; index<count; index++) {
    let best = null, validSeen = 0;
    for (let attempt=0; attempt<120; attempt++) {
      const grid = generateBalancedEventCard90Server(frequency);
      const values = eventNumericGridValues(grid), mask = eventCardNumberMask(values), rowFours = event90RowFourSignatures(grid);
      if (rowFours.some(signature=>rowFourSet.has(signature))) continue;
      let maxShared=0, rejected=false;
      for (const info of infos) {
        const shared=eventBigIntPopcount(mask & info.mask);
        if(shared > maxSharedLimit){rejected=true;break;}
        if(shared>maxShared)maxShared=shared;
      }
      if(rejected)continue;
      validSeen++;
      const frequencyScore=values.reduce((sum,value)=>sum+(frequency[value]||0),0);
      const peakScore=values.reduce((peak,value)=>Math.max(peak,frequency[value]||0),0);
      const score=maxShared*100000 + peakScore*100 + frequencyScore + Math.random();
      if(!best || score<best.score) best={grid,values,mask,rowFours,maxShared,score};
      if(validSeen>=candidateBatch) break;
    }
    if(!best) throw new Error(`No se pudo mantener la diversidad exigida en Bingo 90: ${index}/${count} cartones respetando el límite configurado de ${maxSharedLimit} números compartidos.`);
    accepted.push(best.grid); infos.push({mask:best.mask}); best.rowFours.forEach(signature=>rowFourSet.add(signature)); best.values.forEach(value=>frequency[value]++);
  }
  return accepted;
}
function generateBalancedEventCard75Server(numberFrequency = null) {
  const frequency=numberFrequency||Array(76).fill(0), grid=Array.from({length:5},()=>Array(5).fill(null)), starts=[1,16,31,46,61];
  for(let col=0;col<5;col++){
    const count=col===2?4:5;
    const rows=col===2?[0,1,3,4]:[0,1,2,3,4];
    const values=Array.from({length:15},(_,index)=>starts[col]+index)
      .map(value=>({value,score:(frequency[value]||0)+Math.random()*14}))
      .sort((a,b)=>a.score-b.score).slice(0,count).map(item=>item.value).sort((a,b)=>a-b);
    rows.forEach((row,index)=>{grid[row][col]=values[index];});
  }
  grid[2][2]='LIBRE';
  return grid;
}
function generatePremiumEventCards75(count, maxSharedLimit = EVENT_75_MAX_SHARED) {
  const accepted=[], infos=[], winningSet=new Set(), frequency=Array(76).fill(0);
  const batch=count>=700?5:count>=300?6:8;
  for(let index=0;index<count;index++){
    let best=null, validSeen=0;
    for(let attempt=0;attempt<80;attempt++){
      const grid=generateBalancedEventCard75Server(frequency), values=eventNumericGridValues(grid), mask=eventCardNumberMask(values);
      const temp={mode:75,grid}, winning=cardWinningSignatures(temp);
      let maxShared=0,rejected=false;
      for(const info of infos){const shared=eventBigIntPopcount(mask&info.mask);if(shared>maxSharedLimit){rejected=true;break;}if(shared>maxShared)maxShared=shared;}
      if(rejected)continue;
      validSeen++;
      const freqScore=values.reduce((sum,value)=>sum+(frequency[value]||0),0),peak=values.reduce((m,v)=>Math.max(m,frequency[v]||0),0);
      const score=maxShared*100000+peak*100+freqScore+Math.random();
      if(!best||score<best.score)best={grid,values,mask,winning,maxShared,score};
      if(validSeen>=batch)break;
    }
    if(!best)throw new Error(`No se pudo generar la tanda Bingo 75 con la diversidad exigida: ${index}/${count}.`);
    accepted.push(best.grid);infos.push({mask:best.mask});best.winning.forEach(sig=>winningSet.add(sig));best.values.forEach(v=>frequency[v]++);
  }
  return accepted;
}
function validCard75Grid(grid) {
  if(!Array.isArray(grid)||grid.length!==5||grid.some(row=>!Array.isArray(row)||row.length!==5))return false;
  const starts=[1,16,31,46,61], seen=new Set();
  for(let col=0;col<5;col++)for(let row=0;row<5;row++){
    const value=grid[row][col];
    if(row===2&&col===2){if(value!=='LIBRE')return false;continue;}
    if(!Number.isInteger(value)||value<starts[col]||value>starts[col]+14||seen.has(value))return false;
    seen.add(value);
  }
  return seen.size===24;
}
function auditPremiumEventCards(cards, mode, configuredMaxShared = null) {
  const is90=Number(mode)===90, maxSharedLimit=Number.isFinite(Number(configuredMaxShared))?Number(configuredMaxShared):(is90?event90SharedLimitForCount(cards.length):EVENT_75_MAX_SHARED);
  const masks=[], exact=new Set(), codes=new Set(), rowSet=new Set(), rowFourSet=new Set();
  let invalidCards=0, duplicateCards=0, duplicateCodes=0, duplicateRows=0, nearDuplicateRows=0, duplicateWinningPatterns=0, maximumShared=0, overLimitPairs=0;
  const winningPatternSet=new Set();
  const distribution=Array(16).fill(0), frequency=Array((is90?90:75)+1).fill(0);
  for(const card of cards){
    const values=eventNumericGridValues(card.grid), signature=values.join('-');
    const valid=is90?validCard90Grid(card.grid):validCard75Grid(card.grid);
    if(!valid)invalidCards++;
    if(exact.has(signature))duplicateCards++; else exact.add(signature);
    if(codes.has(card.accessCode))duplicateCodes++; else codes.add(card.accessCode);
    values.forEach(value=>{if(frequency[value]!==undefined)frequency[value]++;});
    masks.push(eventCardNumberMask(values));
    if(is90){
      for(const sig of event90RowSignatures(card.grid)){if(rowSet.has(sig))duplicateRows++;else rowSet.add(sig);}
      for(const sig of event90RowFourSignatures(card.grid)){if(rowFourSet.has(sig))nearDuplicateRows++;else rowFourSet.add(sig);}
    } else {
      for(const sig of cardWinningSignatures({mode:75,grid:card.grid})){if(winningPatternSet.has(sig))duplicateWinningPatterns++;else winningPatternSet.add(sig);}
    }
  }
  for(let i=0;i<masks.length;i++)for(let j=i+1;j<masks.length;j++){
    const shared=eventBigIntPopcount(masks[i]&masks[j]);
    maximumShared=Math.max(maximumShared,shared); distribution[Math.min(15,shared)]++;
    if(shared>maxSharedLimit)overLimitPairs++;
  }
  const usedFrequency=frequency.slice(1), minFrequency=Math.min(...usedFrequency), maxFrequency=Math.max(...usedFrequency), averageFrequency=usedFrequency.reduce((a,b)=>a+b,0)/usedFrequency.length;
  let allowedSpread=Math.max(6,Math.ceil(averageFrequency*0.15)), balanceApproved=false, perColumn=null;
  if(is90) balanceApproved=(maxFrequency-minFrequency)<=allowedSpread;
  else {
    perColumn=[]; balanceApproved=true;
    for(let col=0;col<5;col++){
      const start=col*15+1, values=frequency.slice(start,start+15), average=values.reduce((a,b)=>a+b,0)/15;
      const minimum=Math.min(...values), maximum=Math.max(...values), spread=maximum-minimum, allowed=Math.max(4,Math.ceil(average*0.15));
      if(spread>allowed)balanceApproved=false;
      perColumn.push({column:'BINGO'[col],minimum,maximum,average:Number(average.toFixed(2)),spread,allowedSpread:allowed});
    }
    allowedSpread=Math.max(...perColumn.map(item=>item.allowedSpread));
  }
  const approved=invalidCards===0&&duplicateCards===0&&duplicateCodes===0&&overLimitPairs===0&&(!is90||(duplicateRows===0&&nearDuplicateRows===0))&&balanceApproved;
  return {
    version:1, approved, mode:Number(mode), auditedAt:nowIso(), cards:cards.length,
    rules:{maxSharedNumbers:maxSharedLimit, mathematicalSeries:false, cardsPerPrintPage:6, exactRequestedCount:true, maxRowSharedNumbers:is90?3:null},
    duplicateCards, duplicateCodes, invalidCards, maximumSharedNumbers:maximumShared, pairsAboveSharedLimit:overLimitPairs,
    duplicateRows:is90?duplicateRows:null, rowsSharingFourOfFive:is90?nearDuplicateRows:null, duplicateWinningPatterns:is90?null:duplicateWinningPatterns,
    sharedNumberDistribution:Object.fromEntries(distribution.map((value,index)=>[String(index),value])),
    numberFrequency:{minimum:minFrequency,maximum:maxFrequency,average:Number(averageFrequency.toFixed(2)),spread:maxFrequency-minFrequency,allowedSpread,balanceApproved,perColumn}
  };
}
function createPremiumEventLot(payload = {}) {
  const event = loadEvent(payload.eventCode);
  if (!event) throw new Error('No encontramos el evento indicado.');
  assertEventEditable(event);
  const mode = Number(event.mode) === 75 ? 75 : 90;
  const requested = Math.round(Number(payload.totalCards) || 60);
  const totalCards = Math.max(6, Math.min(EVENT_MAX_LOT_CARDS, requested));
  const seriesCount = Math.ceil(totalCards / 6); // campo legado: ahora representa páginas de impresión, no series matemáticas.
  const usedCodes = new Set(), cards = [];
  let grids;
  const qualitySharedLimit = mode === 90 ? event90SharedLimitForCount(totalCards) : EVENT_75_MAX_SHARED;
  if (mode === 90) grids = generatePremiumEventCards90(totalCards, qualitySharedLimit);
  else grids = generatePremiumEventCards75(totalCards, qualitySharedLimit);
  grids.forEach((grid,index)=>cards.push({
    seriesNumber:Math.floor(index/6)+1, cardNumber:index%6+1, globalNumber:index+1, mode, grid,
    accessCode:randomEventCardAccessCode(usedCodes)
  }));
  const qualityAudit=auditPremiumEventCards(cards,mode,qualitySharedLimit);
  if(!qualityAudit.approved) throw new Error(`La tanda no superó el control de calidad: duplicados ${qualityAudit.duplicateCards}, similitud máxima ${qualityAudit.maximumSharedNumbers}/${mode===90?15:24}, pares fuera de límite ${qualityAudit.pairsAboveSharedLimit}. No se creó la tanda.`);
  const code = randomEventLotCode();
  const customLogo = eventLogoPath(event.code);
  const logoSource = customLogo && fs.existsSync(customLogo) ? customLogo : path.join(ROOT, 'assets', 'logo-pdf.jpg');
  const logoTarget = eventLotLogoPath(code);
  fs.copyFileSync(logoSource, logoTarget);
  const logoBuffer = fs.readFileSync(logoTarget);
  const branding = {
    eventName: event.name, tagline: event.tagline, sponsor: event.sponsor,
    date: event.date, location: event.location, colors: event.colors,
    logoEventCode: event.code, logoLotCode: code,
    logoWidth: customLogo && fs.existsSync(customLogo) ? 512 : 360,
    logoHeight: customLogo && fs.existsSync(customLogo) ? 512 : 360,
    logoSha256: crypto.createHash('sha256').update(logoBuffer).digest('hex')
  };
  const lot = { version:2, code, eventCode:event.code, mode, totalCards, seriesCount, cardsPerSeries:6, cardsPerPage:6, createdAt:nowIso(), layout:{cardsPerPage:6,mathematicalSeries:false,lastPageCards:totalCards%6||6}, qualityAudit, branding, cards };
  lot.hash = eventLotHash(lot);
  const file = eventLotPath(code), temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(lot, null, 2), 'utf8'); fs.renameSync(temp, file);
  event.lotCodes = Array.from(new Set([...(event.lotCodes || []), code])); event.updatedAt = nowIso(); saveEvent(event);
  return publicEventLot(lot, false);
}
function eventLotSeries(lot) {
  const pageCount=Math.ceil((Number(lot.totalCards)||0)/6);
  return Array.from({length:pageCount}, (_, index) => ({
    number:index + 1,
    cards: lot.cards.filter(card => Number(card.seriesNumber) === index + 1)
  }));
}
function eventCardByGlobalNumber(lot, value) {
  const globalNumber = Math.max(1, Math.round(Number(value) || 0));
  return lot.cards.find(card => Number(card.globalNumber) === globalNumber) || null;
}
function premiumEventLotLogo(lot) {
  const file = eventLotLogoPath(lot?.code);
  if (file && fs.existsSync(file)) return { buffer:fs.readFileSync(file), width:Number(lot?.branding?.logoWidth)||360, height:Number(lot?.branding?.logoHeight)||360 };
  const eventFile = eventLogoPath(lot?.eventCode);
  if (eventFile && fs.existsSync(eventFile)) return { buffer:fs.readFileSync(eventFile), width:512, height:512 };
  return { buffer:fs.readFileSync(path.join(ROOT, 'assets', 'logo-pdf.jpg')), width:360, height:360 };
}
function pdfDocumentFromStreams(pageStreams, pageW, pageH, logoInfo, marker = '') {
  const objects = [];
  const addObject = body => { objects.push(body); return objects.length; };
  const catalogId = addObject(''); const pagesId = addObject('');
  const fontRegularId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const logo = logoInfo.buffer;
  const imageId = addObject(Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logoInfo.width} /Height ${logoInfo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`, 'latin1'),
    logo, Buffer.from('\nendstream', 'latin1')
  ]));
  const pageIds = [];
  for (const stream of pageStreams) {
    const contentBuffer = Buffer.from(stream, 'latin1');
    const contentId = addObject(Buffer.concat([Buffer.from(`<< /Length ${contentBuffer.length} >>\nstream\n`, 'latin1'), contentBuffer, Buffer.from('\nendstream', 'latin1')]));
    pageIds.push(addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << /Logo ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  if (marker) {
    const markerBuffer = Buffer.from(marker, 'utf8');
    addObject(Buffer.concat([Buffer.from(`<< /Length ${markerBuffer.length} >>\nstream\n`, 'latin1'), markerBuffer, Buffer.from('\nendstream', 'latin1')]));
  }
  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')]; const offsets = [0]; let length = parts[0].length;
  objects.forEach((body,index)=>{ offsets.push(length); const head=Buffer.from(`${index+1} 0 obj\n`,'latin1'); const content=Buffer.isBuffer(body)?body:Buffer.from(body,'latin1'); const tail=Buffer.from('\nendobj\n','latin1'); parts.push(head,content,tail); length += head.length+content.length+tail.length; });
  const xrefOffset=length; let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let index=1;index<=objects.length;index++) xref += `${String(offsets[index]).padStart(10,'0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(Buffer.from(xref,'latin1')); return Buffer.concat(parts);
}
function premiumPdfCanvas(commands, PAGE_W, PAGE_H, colors) {
  const rgb = hex => hexRgb(hex).map(value => value.toFixed(3)).join(' ');
  const topY = (y, height=0) => PAGE_H - y - height;
  const rect = (x,y,width,height,fill=null,stroke=null,lineWidth=1) => { if(fill)commands.push(`${rgb(fill)} rg`); if(stroke)commands.push(`${rgb(stroke)} RG ${lineWidth} w`); commands.push(`${x.toFixed(2)} ${topY(y,height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill&&stroke?'B':fill?'f':'S'}`); };
  const text = (value,x,y,size=10,options={}) => { const font=options.bold?'F2':'F1', color=options.color||colors.ink, maxWidth=options.maxWidth||null, shown=maxWidth?fitPdfText(value,maxWidth,size):pdfLatin(value); let tx=x; const width=pdfTextWidth(shown,size); if(options.align==='center')tx=x-width/2; if(options.align==='right')tx=x-width; commands.push(`BT /${font} ${size.toFixed(2)} Tf ${rgb(color)} rg 1 0 0 1 ${tx.toFixed(2)} ${(PAGE_H-y-size).toFixed(2)} Tm (${pdfEscape(shown)}) Tj ET`); };
  const image = (x,y,width,height) => commands.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${topY(y,height).toFixed(2)} cm /Logo Do Q`);
  return {rgb,topY,rect,text,image};
}
function drawPremiumCard(commands, canvas, card, x, y, cardW, cardH, lot, options={}) {
  const {rect,text,image} = canvas; const mode=lot.mode; const c=lot.branding.colors || {};
  const colors={ink:'#21192A',muted:'#6B6570',primary:normalizeEventHex(c.primary,'#6D238C'),secondary:normalizeEventHex(c.secondary,'#D83A84'),accent:normalizeEventHex(c.accent,'#E0A71A'),line:'#D8D2DC',empty:'#EEEAF1',white:'#FFFFFF'};
  rect(x,y,cardW,cardH,'#FFFFFF',colors.line,.8); rect(x,y,cardW,4,colors.primary);
  const logoSize=Math.min(34,cardH*.18); image(x+8,y+8,logoSize,logoSize);
  text(lot.branding.eventName || 'EL BINGO DE LA GORDA',x+logoSize+15,y+7,Math.min(11,cardH*.055),{bold:true,color:colors.primary,maxWidth:cardW*.56});
  const sub=[lot.branding.tagline,lot.branding.sponsor?`Sponsor: ${lot.branding.sponsor}`:''].filter(Boolean).join(' · ');
  if(sub) text(sub,x+logoSize+15,y+22,5.6,{color:colors.muted,maxWidth:cardW*.55});
  text(`Cartón ${String(card.globalNumber).padStart(4,'0')}`,x+cardW-9,y+8,9,{bold:true,color:colors.secondary,align:'right'});
  text(`Tanda ${lot.code} · Hoja ${String(card.seriesNumber).padStart(2,'0')}`,x+cardW-9,y+22,5.5,{color:colors.muted,align:'right',maxWidth:cardW*.38});
  if(mode===90){
    const gx=x+8, gy=y+42, gw=cardW-16, gh=cardH-51, cw=gw/9, ch=gh/3;
    for(let r=0;r<3;r++)for(let col=0;col<9;col++){const value=card.grid?.[r]?.[col],cx=gx+col*cw,cy=gy+r*ch;rect(cx,cy,cw,ch,value==null?colors.empty:'#FFFFFF',colors.line,.55);if(Number.isFinite(value))text(String(value),cx+cw/2,cy+ch*.23,Math.min(18,ch*.48),{bold:true,align:'center',color:colors.ink});}
  }else{
    const gx=x+9,gy=y+41,gw=cardW-18,headerH=Math.min(20,cardH*.10),gh=cardH-51,cw=gw/5,ch=(gh-headerH)/5;
    'BINGO'.split('').forEach((letter,col)=>{const cx=gx+col*cw;rect(cx,gy,cw,headerH,col===4?'#FBEAF3':'#F3ECF7',colors.line,.55);text(letter,cx+cw/2,gy+3,10,{bold:true,align:'center',color:col===4?colors.secondary:colors.primary});});
    for(let r=0;r<5;r++)for(let col=0;col<5;col++){const value=card.grid?.[r]?.[col],cx=gx+col*cw,cy=gy+headerH+r*ch,free=value==='LIBRE';rect(cx,cy,cw,ch,free?'#FFF8DF':'#FFFFFF',free?colors.accent:colors.line,free?.9:.55);if(free)commands.push(pdfStarCommands(cx+cw/2,cy+ch/2,Math.min(cw,ch)*.26,Math.min(cw,ch)*.12,canvas.rgb,colors.accent,canvas.topY));else if(Number.isFinite(value))text(String(value),cx+cw/2,cy+ch*.22,Math.min(18,ch*.44),{bold:true,align:'center',color:colors.ink});}
  }
}
function buildPremiumEventPrintPdf(lot) {
  const PAGE_W=842,PAGE_H=595,logo=premiumEventLotLogo(lot),streams=[];
  const colors={ink:'#21192A'};
  for(const series of eventLotSeries(lot)){
    const commands=[]; const canvas=premiumPdfCanvas(commands,PAGE_W,PAGE_H,colors); canvas.rect(0,0,PAGE_W,PAGE_H,'#FFFFFF');
    const marginX=18,marginTop=14,footerH=24,gapX=10,gapY=8,cardW=(PAGE_W-marginX*2-gapX)/2,cardH=(PAGE_H-marginTop-footerH-gapY*2)/3;
    series.cards.forEach((card,index)=>drawPremiumCard(commands,canvas,card,marginX+(index%2)*(cardW+gapX),marginTop+Math.floor(index/2)*(cardH+gapY),cardW,cardH,lot));
    canvas.text(`${lot.branding.eventName} · ${lot.code} · 6 cartones por hoja · CÓDIGOS PRIVADOS OMITIDOS`,PAGE_W/2,PAGE_H-15,6.7,{align:'center',color:'#77707C',maxWidth:PAGE_W-80}); streams.push(commands.join('\n'));
  }
  return pdfDocumentFromStreams(streams,PAGE_W,PAGE_H,logo,`LA_GORDA_EVENT_LOT_V1\n${lot.code}\n${lot.hash}\nNO_PRIVATE_CODES`);
}
function qrMatrixForText(value) {
  try {
    // Dependencia liviana MIT, instalada por npm install en Render.
    const qrcode = require('qrcode-generator');
    const qr = qrcode(0, 'M'); qr.addData(String(value)); qr.make();
    const count=qr.getModuleCount(), rows=[]; for(let r=0;r<count;r++){const row=[];for(let col=0;col<count;col++)row.push(Boolean(qr.isDark(r,col)));rows.push(row);} return rows;
  } catch (error) { return null; }
}
function drawQrCommands(commands, canvas, value, x, y, size) {
  const matrix=qrMatrixForText(value); if(!matrix){canvas.rect(x,y,size,size,'#FFFFFF','#111111',1);canvas.text('QR',x+size/2,y+size*.38,18,{bold:true,align:'center',color:'#111111'});return false;}
  const count=matrix.length,quiet=4,cell=size/(count+quiet*2); canvas.rect(x,y,size,size,'#FFFFFF','#111111',.5);
  for(let r=0;r<count;r++)for(let col=0;col<count;col++)if(matrix[r][col])canvas.rect(x+(col+quiet)*cell,y+(r+quiet)*cell,cell+.08,cell+.08,'#111111'); return true;
}
function eventPlayerEntryUrl(accessCode) { return `${PUBLIC_URL || `http://localhost:${PORT}`}/evento?codigo=${encodeURIComponent(accessCode)}`; }
function buildPremiumEventIndividualPdf(lot, card) {
  const PAGE_W=595,PAGE_H=842,logo=premiumEventLotLogo(lot),commands=[],canvas=premiumPdfCanvas(commands,PAGE_W,PAGE_H,{ink:'#21192A'}),c=lot.branding.colors||{};
  const primary=normalizeEventHex(c.primary,'#6D238C'),secondary=normalizeEventHex(c.secondary,'#D83A84'),accent=normalizeEventHex(c.accent,'#E0A71A');
  canvas.rect(0,0,PAGE_W,PAGE_H,'#FFFFFF'); canvas.rect(0,0,PAGE_W,12,primary); canvas.image(36,34,72,72);
  canvas.text(lot.branding.eventName||'EL BINGO DE LA GORDA',128,38,20,{bold:true,color:primary,maxWidth:420});
  if(lot.branding.tagline)canvas.text(lot.branding.tagline,128,66,10,{color:'#6B6570',maxWidth:420});
  const details=[lot.branding.date,lot.branding.location].filter(Boolean).join(' · '); if(details)canvas.text(details,128,84,8,{color:'#6B6570',maxWidth:420});
  if(lot.branding.sponsor)canvas.text(`Presentado por ${lot.branding.sponsor}`,128,99,8,{bold:true,color:secondary,maxWidth:420});
  canvas.rect(34,126,PAGE_W-68,430,'#FBFAFC','#DDD6E1',1); drawPremiumCard(commands,canvas,card,48,144,PAGE_W-96,390,lot,{individual:true});
  canvas.text(`CARTÓN ${String(card.globalNumber).padStart(4,'0')}`,42,585,17,{bold:true,color:primary});
  const assignedPlayer = eventPlayerForCard(loadEvent(lot.eventCode), lot.code, card.globalNumber);
  if (assignedPlayer) canvas.text(`Jugador: ${assignedPlayer.name}`,PAGE_W-42,588,10,{bold:true,color:secondary,align:'right',maxWidth:270});
  canvas.text('CÓDIGO PRIVADO DE ACCESO',42,616,8,{bold:true,color:'#6B6570'}); canvas.text(card.accessCode,42,632,25,{bold:true,color:secondary});
  const url=eventPlayerEntryUrl(card.accessCode), qrOk=drawQrCommands(commands,canvas,url,403,582,145);
  canvas.text(qrOk?'Escaneá para entrar con este cartón':'Usá el código para entrar al evento',475,735,7,{align:'center',color:'#6B6570',maxWidth:180});
  canvas.text(`Tanda ${lot.code} · SHA-256 ${lot.hash.slice(0,16)}…`,42,773,7,{color:'#77707C',maxWidth:500});
  canvas.text('El código de acceso es privado. No lo publiques ni lo compartas fuera del jugador asignado.',42,792,7,{color:'#77707C',maxWidth:500});
  return pdfDocumentFromStreams([commands.join('\n')],PAGE_W,PAGE_H,logo,`LA_GORDA_EVENT_CARD_V1\n${lot.code}\n${card.globalNumber}\n${card.accessCode}\n${lot.hash}`);
}
function csvEscape(value){const text=String(value??'');return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
function eventLotControlCsv(lot){const event=loadEvent(lot.eventCode);const rows=['tanda,evento,carton,hoja,posicion,codigo,jugador_id,jugador'];for(const card of lot.cards){const player=eventPlayerForCard(event,lot.code,card.globalNumber);rows.push([lot.code,lot.eventCode,String(card.globalNumber).padStart(4,'0'),String(card.seriesNumber).padStart(2,'0'),card.cardNumber,card.accessCode,player?.id||'',player?.name||''].map(csvEscape).join(','));}return '\uFEFF'+rows.join('\r\n');}
function eventLotManifest(lot){const event=loadEvent(lot.eventCode);const assignments=(eventPlayers(event)||[]).flatMap(player=>(player.cards||[]).filter(ref=>ref.lotCode===lot.code).map(ref=>({playerId:player.id,playerName:player.name,lotCode:ref.lotCode,cardNumber:ref.cardNumber})));return {...publicEventLot(lot,true),event:publicEvent(event),assignments,integrity:{algorithm:'SHA-256',hash:lot.hash,qualityAuditApproved:Boolean(lot.qualityAudit?.approved)},accessRule:'Cada código pertenece a un cartón. Si el cartón está vinculado a un jugador, cualquiera de sus códigos abre todos sus cartones vinculados.'};}
function crc32Buffer(buffer){let crc=0xFFFFFFFF;for(const byte of buffer){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);}return (crc^0xFFFFFFFF)>>>0;}
function dosDateTime(date=new Date()){let year=Math.max(1980,date.getFullYear());const dosTime=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);const dosDate=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();return {dosTime,dosDate};}
function buildStoredZip(entries){const locals=[],centrals=[];let offset=0;const {dosTime,dosDate}=dosDateTime();for(const entry of entries){const name=Buffer.from(entry.name.replace(/\\/g,'/'),'utf8'),data=Buffer.isBuffer(entry.data)?entry.data:Buffer.from(entry.data),crc=crc32Buffer(data);const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);local.writeUInt16LE(dosTime,10);local.writeUInt16LE(dosDate,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);locals.push(local,name,data);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt16LE(0,10);central.writeUInt16LE(dosTime,12);central.writeUInt16LE(dosDate,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);central.writeUInt32LE(0,38);central.writeUInt32LE(offset,42);centrals.push(central,name);offset+=local.length+name.length+data.length;}const centralStart=offset,centralBuffer=Buffer.concat(centrals);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralBuffer.length,12);end.writeUInt32LE(centralStart,16);end.writeUInt16LE(0,20);return Buffer.concat([...locals,centralBuffer,end]);}
function buildEventIndividualsZip(lot){const event=loadEvent(lot.eventCode);const safeName=printableTitleFilename(event?.name)||'EVENTO';const entries=lot.cards.map(card=>({name:`${safeName}/Carton_${String(card.globalNumber).padStart(4,'0')}.pdf`,data:buildPremiumEventIndividualPdf(lot,card)}));entries.push({name:`${safeName}/tanda.json`,data:Buffer.from(JSON.stringify(eventLotManifest(lot),null,2),'utf8')});entries.push({name:`${safeName}/control.csv`,data:Buffer.from(eventLotControlCsv(lot),'utf8')});return buildStoredZip(entries);}
function eventPrintPdfFilename(lot){const event=loadEvent(lot.eventCode),name=printableTitleFilename(event?.name)||'EVENTO';return `${name}_${lot.code}_6_CARTONES_POR_HOJA.pdf`;}
function eventIndividualsZipFilename(lot){const event=loadEvent(lot.eventCode),name=printableTitleFilename(event?.name)||'EVENTO';return `${name}_${lot.code}_CARTONES_INDIVIDUALES.zip`;}


// -----------------------------------------------------------------------------
// MODO EVENTO PREMIUM - FASE 2
// Jugadores persistentes, vinculación de cartones, importación CSV y acceso
// agrupado: cualquier código de un jugador abre todos sus cartones vinculados.
// -----------------------------------------------------------------------------
const EVENT_PLAYER_PRESENCE_MS = 90 * 1000;
const eventPlayerPresence = new Map();
function safeEventPlayerId(value){const id=String(value||'').trim().toUpperCase();return /^EVP-[A-Z0-9]{6}$/.test(id)?id:'';}
function eventPlayers(event){if(!event)return[];if(!Array.isArray(event.players))event.players=[];return event.players;}
function normalizeEventPlayerName(value){return normalizeEventText(value,80);}
function normalizedEventPlayerNameKey(value){return normalizeEventPlayerName(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();}
function randomEventPlayerId(event){const used=new Set(eventPlayers(event).map(player=>safeEventPlayerId(player.id)).filter(Boolean));const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';for(let attempt=0;attempt<1000;attempt++){const bytes=crypto.randomBytes(6);let raw='';for(let i=0;i<6;i++)raw+=alphabet[bytes[i]%alphabet.length];const id=`EVP-${raw}`;if(!used.has(id))return id;}throw new Error('No se pudo crear un identificador único para el jugador.');}
function eventCardRefKey(lotCode,cardNumber){return `${safeEventLotCode(lotCode)}:${Math.max(1,Math.round(Number(cardNumber)||0))}`;}
function cleanEventPlayerCards(event,player){const valid=[];const seen=new Set();for(const ref of Array.isArray(player?.cards)?player.cards:[]){const lotCode=safeEventLotCode(ref?.lotCode),cardNumber=Math.max(1,Math.round(Number(ref?.cardNumber)||0));if(!lotCode||!cardNumber||!Array.isArray(event?.lotCodes)||!event.lotCodes.includes(lotCode))continue;const lot=loadEventLot(lotCode);if(!lot||lot.eventCode!==event.code||!eventCardByGlobalNumber(lot,cardNumber))continue;const key=eventCardRefKey(lotCode,cardNumber);if(seen.has(key))continue;seen.add(key);valid.push({lotCode,cardNumber});}player.cards=valid;return valid;}
function eventPlayerById(event,id){const safe=safeEventPlayerId(id);return safe?eventPlayers(event).find(player=>safeEventPlayerId(player.id)===safe)||null:null;}
function eventPlayerForCard(event,lotCode,cardNumber){if(!event)return null;const key=eventCardRefKey(lotCode,cardNumber);for(const player of eventPlayers(event)){if((player.cards||[]).some(ref=>eventCardRefKey(ref.lotCode,ref.cardNumber)===key))return player;}return null;}
function eventLotsFor(event){return (event?.lotCodes||[]).map(code=>loadEventLot(code)).filter(lot=>lot&&lot.eventCode===event.code);}
function normalizeEventAccessCode(value){const raw=String(value||'').trim().toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g,'').slice(0,8);return raw.length===8?`${raw.slice(0,4)}-${raw.slice(4)}`:'';}
function eventCardLookupByAccess(event,accessCode){const code=normalizeEventAccessCode(accessCode);if(!code)return null;for(const lot of eventLotsFor(event)){const card=lot.cards.find(item=>item.accessCode===code);if(card)return{lot,card};}return null;}
function eventCardLookupGlobal(accessCode){const code=normalizeEventAccessCode(accessCode);if(!code)return null;for(const entry of fs.readdirSync(EVENT_LOTS_DIR,{withFileTypes:true})){if(!entry.isFile()||!/^EVT-[A-Z0-9]{6}\.json$/.test(entry.name))continue;const lot=loadEventLot(entry.name.replace(/\.json$/,''));if(!lot)continue;const card=lot.cards.find(item=>item.accessCode===code);if(!card)continue;const event=loadEvent(lot.eventCode);if(event)return{event,lot,card};}return null;}
function eventCardLookupForAdmin(event,payload={}){const accessCode=normalizeEventAccessCode(payload.accessCode||payload.codigo);if(accessCode){const found=eventCardLookupByAccess(event,accessCode);if(!found)throw new Error('Ese código no pertenece a este evento.');return found;}let lotCode=safeEventLotCode(payload.lotCode||payload.tanda);const lots=eventLotsFor(event);if(!lotCode){if(lots.length!==1)throw new Error('Indicá la tanda o usá el código privado del cartón.');lotCode=lots[0].code;}const lot=lots.find(item=>item.code===lotCode);if(!lot)throw new Error('La tanda indicada no pertenece a este evento.');const card=eventCardByGlobalNumber(lot,payload.cardNumber??payload.carton);if(!card)throw new Error('No encontramos ese cartón dentro de la tanda.');return{lot,card};}
function eventPresenceKey(eventCode,playerId){return `${safeEventCode(eventCode)}:${safeEventPlayerId(playerId)}`;}
function markEventPlayerPresence(eventCode,playerId){const key=eventPresenceKey(eventCode,playerId);if(key.includes(':EVP-'))eventPlayerPresence.set(key,Date.now());}
function eventPlayerPresenceState(eventCode,playerId){const seen=Number(eventPlayerPresence.get(eventPresenceKey(eventCode,playerId))||0);return{connected:seen>0&&Date.now()-seen<=EVENT_PLAYER_PRESENCE_MS,lastSeenAt:seen?new Date(seen).toISOString():''};}
function eventPlayerCardPayload(event,ref,includePrivate=false){const lot=loadEventLot(ref.lotCode);if(!lot||lot.eventCode!==event.code)return null;const card=eventCardByGlobalNumber(lot,ref.cardNumber);if(!card)return null;const payload={lotCode:lot.code,cardNumber:card.globalNumber,seriesNumber:card.seriesNumber,position:card.cardNumber,mode:lot.mode,grid:card.grid};if(includePrivate)payload.accessCode=card.accessCode;return payload;}
function eventAdminPlayersPayload(eventCode){const event=loadEvent(eventCode);if(!event)throw new Error('No encontramos ese evento.');const players=eventPlayers(event).map(player=>{cleanEventPlayerCards(event,player);const presence=eventPlayerPresenceState(event.code,player.id);return{id:player.id,name:normalizeEventPlayerName(player.name),cards:(player.cards||[]).map(ref=>eventPlayerCardPayload(event,ref,true)).filter(Boolean),createdAt:player.createdAt||'',updatedAt:player.updatedAt||player.createdAt||'',...presence};});const assignment=new Map();players.forEach(player=>player.cards.forEach(card=>assignment.set(eventCardRefKey(card.lotCode,card.cardNumber),player)));const lots=eventLotsFor(event).map(lot=>({code:lot.code,mode:lot.mode,totalCards:lot.totalCards,cards:lot.cards.map(card=>{const player=assignment.get(eventCardRefKey(lot.code,card.globalNumber));return{lotCode:lot.code,cardNumber:card.globalNumber,seriesNumber:card.seriesNumber,position:card.cardNumber,mode:lot.mode,grid:card.grid,accessCode:card.accessCode,playerId:player?.id||'',playerName:player?.name||''};})}));const totalCards=lots.reduce((sum,lot)=>sum+lot.totalCards,0),linkedCards=players.reduce((sum,player)=>sum+player.cards.length,0);return{phase:2,event:publicEvent(event),players,lots,stats:{players:players.length,totalCards,linkedCards,unassignedCards:Math.max(0,totalCards-linkedCards),connectedPlayers:players.filter(player=>player.connected).length}};}
function createEventPlayer(payload={}){const event=loadEvent(payload.eventCode);if(!event)throw new Error('No encontramos ese evento.');assertEventEditable(event);if(eventPlayers(event).length>=EVENT_MAX_PLAYERS)throw new Error(`El Modo Evento admite hasta ${EVENT_MAX_PLAYERS} jugadores.`);const name=normalizeEventPlayerName(payload.name);if(!name)throw new Error('Escribí el nombre del jugador.');const now=nowIso(),player={id:randomEventPlayerId(event),name,cards:[],createdAt:now,updatedAt:now};eventPlayers(event).push(player);event.version=Math.max(2,Number(event.version)||1);event.updatedAt=now;saveEvent(event);return eventAdminPlayersPayload(event.code);}
function updateEventPlayer(payload={}){const event=loadEvent(payload.eventCode);if(!event)throw new Error('No encontramos ese evento.');assertEventEditable(event);const player=eventPlayerById(event,payload.playerId);if(!player)throw new Error('No encontramos ese jugador.');const name=normalizeEventPlayerName(payload.name);if(!name)throw new Error('Escribí el nombre del jugador.');player.name=name;player.updatedAt=nowIso();event.version=Math.max(2,Number(event.version)||1);event.updatedAt=player.updatedAt;saveEvent(event);return eventAdminPlayersPayload(event.code);}
function deleteEventPlayer(payload={}){const event=loadEvent(payload.eventCode);if(!event)throw new Error('No encontramos ese evento.');assertEventEditable(event);const id=safeEventPlayerId(payload.playerId),index=eventPlayers(event).findIndex(player=>player.id===id);if(index<0)throw new Error('No encontramos ese jugador.');event.players.splice(index,1);event.version=Math.max(2,Number(event.version)||1);event.updatedAt=nowIso();saveEvent(event);eventPlayerPresence.delete(eventPresenceKey(event.code,id));return eventAdminPlayersPayload(event.code);}
function linkEventPlayerCard(payload={}){const event=loadEvent(payload.eventCode);if(!event)throw new Error('No encontramos ese evento.');assertEventEditable(event);const player=eventPlayerById(event,payload.playerId);if(!player)throw new Error('No encontramos ese jugador.');const{lot,card}=eventCardLookupForAdmin(event,payload);const assigned=eventPlayerForCard(event,lot.code,card.globalNumber);if(assigned&&assigned.id!==player.id)throw new Error(`El cartón ${String(card.globalNumber).padStart(4,'0')} ya está vinculado a ${assigned.name}. Desvinculalo antes de reasignarlo.`);cleanEventPlayerCards(event,player);const key=eventCardRefKey(lot.code,card.globalNumber);if(!(player.cards||[]).some(ref=>eventCardRefKey(ref.lotCode,ref.cardNumber)===key))player.cards.push({lotCode:lot.code,cardNumber:card.globalNumber});player.updatedAt=nowIso();event.version=Math.max(2,Number(event.version)||1);event.updatedAt=player.updatedAt;saveEvent(event);return eventAdminPlayersPayload(event.code);}
function unlinkEventPlayerCard(payload={}){const event=loadEvent(payload.eventCode);if(!event)throw new Error('No encontramos ese evento.');assertEventEditable(event);const player=eventPlayerById(event,payload.playerId);if(!player)throw new Error('No encontramos ese jugador.');const lotCode=safeEventLotCode(payload.lotCode),cardNumber=Math.max(1,Math.round(Number(payload.cardNumber)||0));const key=eventCardRefKey(lotCode,cardNumber);player.cards=(player.cards||[]).filter(ref=>eventCardRefKey(ref.lotCode,ref.cardNumber)!==key);player.updatedAt=nowIso();event.version=Math.max(2,Number(event.version)||1);event.updatedAt=player.updatedAt;saveEvent(event);return eventAdminPlayersPayload(event.code);}
function parseEventCsv(text){const source=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');const first=(source.split('\n').find(line=>line.trim())||'');const candidates=[',',';','\t'];let delimiter=',',best=-1;for(const candidate of candidates){const count=(first.match(new RegExp(candidate==='\t'?'\\t':`\\${candidate}`,'g'))||[]).length;if(count>best){best=count;delimiter=candidate;}}const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<=source.length;i++){const ch=i<source.length?source[i]:'\n';if(quoted){if(ch==='"'&&source[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===delimiter){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell);cell='';if(row.some(value=>String(value).trim()))rows.push(row);row=[];}else cell+=ch;}return rows;}
function eventCsvHeader(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,'_');}
function importEventPlayersCsv(payload={}){const event=loadEvent(payload.eventCode);if(!event)throw new Error('No encontramos ese evento.');assertEventEditable(event);const rows=parseEventCsv(payload.csvText);if(rows.length<2)throw new Error('El CSV no contiene filas para importar.');const headers=rows[0].map(eventCsvHeader),indexOf=(...names)=>{for(const name of names){const index=headers.indexOf(name);if(index>=0)return index;}return-1;};const nameIndex=indexOf('jugador','nombre','player','participante'),idIndex=indexOf('jugador_id','player_id','id'),cardIndex=indexOf('carton','card','nro_carton','numero_carton'),codeIndex=indexOf('codigo','code','codigo_privado'),lotIndex=indexOf('tanda','lot','lot_code');if(nameIndex<0&&idIndex<0)throw new Error('El CSV necesita una columna jugador/nombre o jugador_id.');if(cardIndex<0&&codeIndex<0)throw new Error('El CSV necesita una columna carton o codigo.');const working=deepCopy(event);working.players=Array.isArray(working.players)?working.players:[];let created=0,linked=0;const errors=[];for(let rowIndex=1;rowIndex<rows.length;rowIndex++){const cols=rows[rowIndex],line=rowIndex+1;try{const id=idIndex>=0?safeEventPlayerId(cols[idIndex]):'';const name=nameIndex>=0?normalizeEventPlayerName(cols[nameIndex]):'';let player=id?eventPlayerById(working,id):null;if(id&&!player)throw new Error(`jugador_id ${id} no existe`);if(!player&&name){const matches=eventPlayers(working).filter(item=>normalizedEventPlayerNameKey(item.name)===normalizedEventPlayerNameKey(name));if(matches.length>1)throw new Error(`hay más de un jugador llamado ${name}; usá jugador_id`);player=matches[0]||null;}if(!player){if(!name)throw new Error('falta el nombre del jugador');if(eventPlayers(working).length>=EVENT_MAX_PLAYERS)throw new Error(`se alcanzó el máximo de ${EVENT_MAX_PLAYERS} jugadores del Modo Evento`);const now=nowIso();player={id:randomEventPlayerId(working),name,cards:[],createdAt:now,updatedAt:now};eventPlayers(working).push(player);created++;}const selector={};if(codeIndex>=0&&normalizeEventAccessCode(cols[codeIndex]))selector.accessCode=cols[codeIndex];else{selector.cardNumber=cardIndex>=0?cols[cardIndex]:'';selector.lotCode=lotIndex>=0?cols[lotIndex]:'';}const{lot,card}=eventCardLookupForAdmin(working,selector);const assigned=eventPlayerForCard(working,lot.code,card.globalNumber);if(assigned&&assigned.id!==player.id)throw new Error(`cartón ${String(card.globalNumber).padStart(4,'0')} ya asignado a ${assigned.name}`);const key=eventCardRefKey(lot.code,card.globalNumber);if(!(player.cards||[]).some(ref=>eventCardRefKey(ref.lotCode,ref.cardNumber)===key)){player.cards.push({lotCode:lot.code,cardNumber:card.globalNumber});linked++;}player.updatedAt=nowIso();}catch(error){errors.push(`Línea ${line}: ${error.message}`);}}if(errors.length)throw new Error(`No se importó nada. Corregí el CSV:\n${errors.slice(0,8).join('\n')}${errors.length>8?`\n… y ${errors.length-8} error(es) más.`:''}`);event.players=working.players;event.version=Math.max(2,Number(event.version)||1);event.updatedAt=nowIso();saveEvent(event);return{...eventAdminPlayersPayload(event.code),import:{rows:rows.length-1,playersCreated:created,linksCreated:linked}};}
function publicEventAccessPayload(accessCode){const found=eventCardLookupGlobal(accessCode);if(!found)throw new Error('No encontramos ese código de cartón.');const{event,lot,card}=found;if(event.status==='archived')throw new Error('Este evento está archivado.');const player=eventPlayerForCard(event,lot.code,card.globalNumber);let refs=player?(player.cards||[]):[{lotCode:lot.code,cardNumber:card.globalNumber}];const cards=refs.map(ref=>eventPlayerCardPayload(event,ref,false)).filter(Boolean).sort((a,b)=>a.lotCode.localeCompare(b.lotCode)||a.cardNumber-b.cardNumber);if(player)markEventPlayerPresence(event.code,player.id);return{phase:2,event:publicEvent(event),player:player?{id:player.id,name:player.name}:null,accessedCard:{lotCode:lot.code,cardNumber:card.globalNumber},cards,message:player?`Código reconocido. Tenés ${cards.length} cartón${cards.length===1?'':'es'} vinculado${cards.length===1?'':'s'}.`:'Código reconocido. Este cartón todavía no está vinculado a un jugador.'};}
function heartbeatEventPlayer(accessCode){const found=eventCardLookupGlobal(accessCode);if(!found)throw new Error('No encontramos ese código de cartón.');if(found.event.status==='archived')throw new Error('Este evento está archivado.');const player=eventPlayerForCard(found.event,found.lot.code,found.card.globalNumber);if(player)markEventPlayerPresence(found.event.code,player.id);return{ok:true,playerId:player?.id||'',at:nowIso()};}


// MODO EVENTO PREMIUM · FASE 3
// El Evento se vincula a una sala operacional existente. No duplica el motor de Bingo.
function safeEventDisplayToken(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{12,160}$/.test(token) ? token : '';
}
function eventLiveWorkspace(event) {
  const id = String(event?.live?.workspaceId || '');
  const byId = id ? workspaces.get(id) : null;
  if (byId) return byId;
  const roomCode = String(event?.live?.roomCode || '').trim().toUpperCase();
  return roomCode ? findWorkspaceByRoomCode(roomCode) : null;
}
function eventPlayerByAnyCardNumber(event, cardNumber) {
  const number = Math.max(1, Math.round(Number(cardNumber) || 0));
  if (!number) return null;
  const matches = eventPlayers(event).filter(player => (player.cards || []).some(ref => Number(ref.cardNumber) === number));
  return matches.length === 1 ? matches[0] : null;
}
function premiumEventClaim(event, claim) {
  if (!claim) return null;
  const byId = safeEventPlayerId(claim.eventPlayerId || '') ? eventPlayerById(event, claim.eventPlayerId) : null;
  const byRef = !byId && safeEventLotCode(claim.eventLotCode || '')
    ? eventPlayerForCard(event, claim.eventLotCode, claim.eventCardNumber || claim.cardNumber)
    : null;
  const linked = byId || byRef || eventPlayerByAnyCardNumber(event, claim.eventCardNumber || claim.cardNumber);
  return {
    ...claim,
    playerName: linked?.name || claim.playerName || '',
    eventPlayerId: linked?.id || claim.eventPlayerId || '',
    cardNumber: Number(claim.eventCardNumber) || claim.cardNumber,
    eventLotCode: safeEventLotCode(claim.eventLotCode || '')
  };
}
function eventPremiumDisplayUrls(event) {
  const token = safeEventDisplayToken(event?.live?.displayToken);
  if (!token) return { tvUrl:'', transmissionUrl:'' };
  const qs = `evento=${encodeURIComponent(event.code)}&token=${encodeURIComponent(token)}`;
  return {
    tvUrl: `/evento-tv?${qs}`,
    transmissionUrl: `/evento-transmision?${qs}`
  };
}
function eventLiveAdminPayload(eventCode) {
  const event = loadEvent(eventCode);
  if (!event) throw new Error('No encontramos ese evento.');
  const workspace = eventLiveWorkspace(event);
  const bound = Boolean(event.live?.active && workspace);
  let room = null;
  if (workspace) room = workspaceContext.run(workspace, () => ({
    active:Boolean(state.active), status:state.status || 'closed', roomCode:state.roomCode || '',
    mode:Number(state.game?.mode)||null, lastBall:state.game?.drawn?.at(-1) ?? null,
    drawnCount:Array.isArray(state.game?.drawn)?state.game.drawn.length:0,
    playersTotal:Array.isArray(state.players)?state.players.length:0,
    playersConnected:connectedPlayerIds().size,
    updatedAt:state.updatedAt || ''
  }));
  const preparation = premiumEventCurrentPreparation(event, workspace);
  return { phase:4, event:publicEvent(event), bound, room, preparation, ...eventPremiumDisplayUrls(event) };
}
function activatePremiumEventLive(payload = {}, workspace = currentWorkspace()) {
  const event = loadEvent(payload.eventCode);
  if (!event) throw new Error('No encontramos ese evento.');
  assertEventEditable(event);
  if (!workspace?.state?.active || !workspace.state.game) throw new Error('Primero prepará una sala en el Admin general.');
  const roomMode = Number(workspace.state.game.mode) === 75 ? 75 : 90;
  if (roomMode !== Number(event.mode)) throw new Error(`El Evento es Bingo ${event.mode}, pero la sala actual es Bingo ${roomMode}.`);
  const preparation = preparePremiumEventRoom(event, workspace);
  const now = nowIso();
  const previousToken = safeEventDisplayToken(event.live?.displayToken);
  event.live = {
    active:true,
    workspaceId:workspace.id,
    roomCode:String(workspace.state.roomCode || ''),
    displayToken:previousToken || randomId('eventview').replace(/[^A-Za-z0-9_-]/g,''),
    activatedAt:event.live?.activatedAt || now,
    updatedAt:now,
    deactivatedAt:'',
    preparedAt:preparation.preparedAt,
    preparationFingerprint:preparation.fingerprint,
    linkedPlayers:preparation.linkedPlayers,
    linkedCards:preparation.linkedCards
  };
  event.version = Math.max(5, Number(event.version) || 1);
  event.updatedAt = now;
  saveEvent(event);
  return eventLiveAdminPayload(event.code);
}
function deactivatePremiumEventLive(payload = {}) {
  const event = loadEvent(payload.eventCode);
  if (!event) throw new Error('No encontramos ese evento.');
  const workspace = eventLiveWorkspace(event);
  if (workspace && ['starting','playing','paused','verifying','resuming','finalizing'].includes(String(workspace.state?.status || ''))) {
    throw new Error('No se puede desvincular el Evento mientras la partida está en curso. Finalizala primero.');
  }
  const now = nowIso();
  if (event.live) event.live = { ...event.live, active:false, updatedAt:now, deactivatedAt:now };
  event.version = Math.max(4, Number(event.version) || 1);
  event.updatedAt = now;
  saveEvent(event);
  return eventLiveAdminPayload(event.code);
}
function premiumEventPublicLivePayload(eventCode, displayToken) {
  const event = loadEvent(eventCode);
  if (!event || event.status === 'archived') throw new Error('Evento no disponible.');
  const supplied = safeEventDisplayToken(displayToken);
  const expected = safeEventDisplayToken(event.live?.displayToken);
  if (!supplied || !expected || !safeEqual(supplied, expected)) throw new Error('Acceso de pantalla no válido.');
  if (!event.live?.active) return { phase:4, event:publicEvent(event), live:false, room:null, eventStats:{ players:eventPlayers(event).length, linkedCards:eventPlayers(event).reduce((s,p)=>s+(p.cards||[]).length,0) } };
  const workspace = eventLiveWorkspace(event);
  if (!workspace) return { phase:4, event:publicEvent(event), live:false, room:null, eventStats:{ players:eventPlayers(event).length, linkedCards:eventPlayers(event).reduce((s,p)=>s+(p.cards||[]).length,0) } };
  return workspaceContext.run(workspace, () => {
    const room = broadcastPayload();
    room.pendingClaim = premiumEventClaim(event, room.pendingClaim);
    room.latestConfirmed = premiumEventClaim(event, room.latestConfirmed);
    return {
      phase:4, event:publicEvent(event), live:Boolean(room.active), room,
      eventStats:{
        players:eventPlayers(event).length,
        linkedCards:eventPlayers(event).reduce((s,p)=>s+(p.cards||[]).length,0),
        connectedPlayers:eventPlayers(event).filter(p=>eventPlayerPresenceState(event.code,p.id).connected).length
      }
    };
  });
}


// MODO EVENTO PREMIUM · FASE 4.1
// Alta capacidad y tandas diversificadas: hasta 1000 generados, 150 jugadores y 250 activos.
// La tanda vinculada se convierte en el juego oficial de la sala antes de la primera bolilla.
// El jugador entra por el código privado del PDF, recupera todos sus cartones y opera sobre
// el mismo estado/validador que usa el Admin, Conductor, TV y Transmisión Premium.
function premiumEventRoomCardKey(lotCode, cardNumber) {
  return `${safeEventLotCode(lotCode)}:${Math.max(1, Math.round(Number(cardNumber) || 0))}`;
}
function premiumEventRoomPlayer(event, eventPlayer) {
  const id = safeEventPlayerId(eventPlayer?.id);
  if (!id) return null;
  return (state.players || []).find(player => safeEventCode(player.eventCode) === event.code && safeEventPlayerId(player.eventPlayerId) === id) || null;
}
function premiumEventRoomCard(lotCode, cardNumber) {
  const key = premiumEventRoomCardKey(lotCode, cardNumber);
  return (state.game?.cards || []).find(card => premiumEventRoomCardKey(card.eventLotCode, card.eventCardNumber) === key) || null;
}
function premiumEventLinkedPlayers(event) {
  const rows = [];
  for (const source of eventPlayers(event)) {
    const refs = cleanEventPlayerCards(event, source);
    if (!refs.length) continue;
    rows.push({ eventPlayer:source, refs:[...refs] });
  }
  return rows;
}
function premiumEventPreparationFingerprint(event, rows) {
  const lots = eventLotsFor(event).map(lot => ({ code:lot.code, hash:lot.hash, mode:lot.mode })).sort((a,b)=>a.code.localeCompare(b.code));
  const players = rows.map(row => ({ id:row.eventPlayer.id, name:row.eventPlayer.name, cards:row.refs.map(ref=>({lotCode:ref.lotCode,cardNumber:ref.cardNumber})).sort((a,b)=>premiumEventRoomCardKey(a.lotCode,a.cardNumber).localeCompare(premiumEventRoomCardKey(b.lotCode,b.cardNumber))) })).sort((a,b)=>a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(JSON.stringify({ eventCode:event.code, mode:event.mode, lots, players })).digest('hex');
}
function preparePremiumEventRoom(event, workspace = currentWorkspace()) {
  if (!event) throw new Error('No encontramos ese evento.');
  return workspaceContext.run(workspace, () => {
    if (!state.active || !state.game) throw new Error('Primero prepará una sala en el Admin general.');
    if (state.status !== 'waiting' || (state.game.drawn || []).length) throw new Error('La tanda Evento sólo puede sincronizarse antes de la primera bolilla.');
    const roomMode = Number(state.game.mode) === 75 ? 75 : 90;
    if (roomMode !== Number(event.mode)) throw new Error(`El Evento es Bingo ${event.mode}, pero la sala actual es Bingo ${roomMode}.`);
    const rows = premiumEventLinkedPlayers(event);
    if (rows.length < (TEST_MODE ? 1 : MIN_PLAYERS)) throw new Error('Vinculá cartones a por lo menos 2 jugadores antes de preparar la partida Evento.');
    if (rows.length > EVENT_MAX_PLAYERS) throw new Error(`El Modo Evento admite hasta ${EVENT_MAX_PLAYERS} jugadores. Este Evento tiene ${rows.length} jugadores con cartones.`);
    const roomMax = state.roomSettings?.markingMode === 'manual_only' ? 2 : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(state.roomSettings?.maxCardsPerPlayer) || MAX_CARDS_PER_PLAYER));
    for (const row of rows) if (row.refs.length > roomMax) throw new Error(`${row.eventPlayer.name} tiene ${row.refs.length} cartones, pero esta sala admite hasta ${roomMax} por jugador.`);
    const linkedCount = rows.reduce((sum,row)=>sum+row.refs.length,0);
    if (linkedCount > EVENT_MAX_ACTIVE_CARDS) throw new Error(`El Modo Evento admite hasta ${EVENT_MAX_ACTIVE_CARDS} cartones activos por partida y tiene ${linkedCount} vinculados. La tanda puede contener hasta ${EVENT_MAX_LOT_CARDS}.`);
    const uniqueRefs = new Map();
    for (const row of rows) for (const ref of row.refs) {
      const lot = loadEventLot(ref.lotCode);
      if (!lot || lot.eventCode !== event.code || Number(lot.mode) !== roomMode) throw new Error(`La tanda ${ref.lotCode} no es válida para este Evento.`);
      if (Number(lot.version) >= 2 && !lot.qualityAudit?.approved) throw new Error(`La tanda ${ref.lotCode} no tiene una auditoría de calidad aprobada.`);
      // loadEventLot ya verifica SHA-256. Si el manifiesto fue alterado, retorna null.
      const card = eventCardByGlobalNumber(lot, ref.cardNumber);
      if (!card) throw new Error(`No encontramos el cartón ${ref.cardNumber} de ${ref.lotCode}.`);
      uniqueRefs.set(premiumEventRoomCardKey(lot.code, card.globalNumber), { lot, card });
    }
    const oneLot = new Set([...uniqueRefs.values()].map(item=>item.lot.code)).size === 1;
    const rules = state.game.rules || roomRulesFor(roomMode, {});
    const cards = [...uniqueRefs.values()].map(({lot,card}) => {
      const visible = String(card.globalNumber).padStart(4,'0');
      const uniqueNumber = oneLot ? visible : `${lot.code.slice(-3)}-${visible}`;
      return {
        id:`event-card:${event.code}:${lot.code}:${visible}`,
        number:uniqueNumber,
        name:`Cartón ${visible}`,
        originalName:`Cartón ${visible}`,
        mode:roomMode,
        source:'event',
        grid:deepCopy(card.grid),
        bets:{
          ambocabeza:roomMode===90 && rules.ambocabeza !== false,
          line:rules.line !== false,
          doubleLine:roomMode===75 && Boolean(rules.doubleLine),
          tripleLine:roomMode===75 && Boolean(rules.tripleLine),
          corners:roomMode===75 && Boolean(rules.corners),
          bingo:rules.bingo !== false
        },
        eventCode:event.code,
        eventLotCode:lot.code,
        eventCardNumber:Number(card.globalNumber)
      };
    });
    const cardMap = new Map(cards.map(card=>[premiumEventRoomCardKey(card.eventLotCode,card.eventCardNumber),card]));
    const usedPlayerCodes = new Set();
    const nextCode = () => { let code=''; do { code=freshNumericPlayerCode(); } while(usedPlayerCodes.has(code)); usedPlayerCodes.add(code); return code; };
    const auto = state.roomSettings?.markingMode !== 'manual_only';
    const players = rows.map((row,index) => {
      const cardIds = row.refs.map(ref=>cardMap.get(premiumEventRoomCardKey(ref.lotCode,ref.cardNumber))?.id).filter(Boolean);
      return {
        id:`event-player:${event.code}:${row.eventPlayer.id}`,
        eventMode:true, eventCode:event.code, eventPlayerId:row.eventPlayer.id,
        name:normalizeEventPlayerName(row.eventPlayer.name), nameSet:true,
        slotNumber:index+1, slotLabel:`Evento · ${normalizeEventPlayerName(row.eventPlayer.name)}`,
        personalPresenter:PRESENTER_ID, code:nextCode(), codeStatus:'event-private',
        directAccessToken:null, recoveryExpiresAt:null, inviteToken:null, inviteClaimedAt:null, invitedAt:null,
        allowedCardCount:cardIds.length, requestedCardCount:cardIds.length,
        cardIds, selectionConfirmed:true, offeredCardIds:[], reservedCardIds:[],
        sessionToken:null, sessionDeviceId:'', marks:Object.fromEntries(cardIds.map(id=>[id,[]])),
        autoMark:auto, markingModeChosen:true, notices:[], virtual:false, createdAt:nowIso()
      };
    });
    state.game.cards = cards;
    state.game.drawn = [];
    state.game.drawTimestamps = {};
    state.game.lastDrawnAt = null;
    state.game.phase = 'READY';
    delete state.game.integrity;
    state.players = players;
    state.cardReservations = {};
    state.claims = [];
    state.claimWindow = null;
    state.claimSequence = 0;
    state.roomSettings.eventMode = true;
    state.roomSettings.eventCode = event.code;
    state.roomSettings.joinOpen = false;
    state.eventContext = {
      phase:4.1, eventCode:event.code, preparedAt:nowIso(),
      fingerprint:premiumEventPreparationFingerprint(event,rows),
      linkedPlayers:players.length, linkedCards:cards.length, eventMaxPlayers:EVENT_MAX_PLAYERS, eventMaxActiveCards:EVENT_MAX_ACTIVE_CARDS,
      lotHashes:Object.fromEntries(eventLotsFor(event).map(lot=>[lot.code,lot.hash]))
    };
    syncAllAutoMarks();
    logEvent('event_phase4_prepared', { eventCode:event.code, players:players.length, cards:cards.length, fingerprint:state.eventContext.fingerprint });
    saveState(); broadcast();
    return deepCopy(state.eventContext);
  });
}
function premiumEventCurrentPreparation(event, workspace = eventLiveWorkspace(event)) {
  if (!workspace) return null;
  return workspaceContext.run(workspace, () => {
    if (safeEventCode(state.eventContext?.eventCode) !== event.code) return null;
    return deepCopy(state.eventContext);
  });
}
function premiumEventPlayerFromCode(accessCode) {
  const found = eventCardLookupGlobal(accessCode);
  if (!found) throw new Error('No encontramos ese código de cartón.');
  if (found.event.status === 'archived') throw new Error('Este evento está archivado.');
  const player = eventPlayerForCard(found.event, found.lot.code, found.card.globalNumber);
  return { ...found, player };
}
function premiumEventPlayerLivePayloadFromContext(event, eventPlayer, accessedCard = null) {
  const roomPlayer = eventPlayer ? premiumEventRoomPlayer(event,eventPlayer) : null;
  const roomMatches = safeEventCode(state.eventContext?.eventCode) === event.code;
  const live = Boolean(event.live?.active && state.active && state.game && roomMatches);
  const baseRefs = eventPlayer ? (eventPlayer.cards || []) : (accessedCard ? [{lotCode:accessedCard.lotCode,cardNumber:accessedCard.cardNumber}] : []);
  if (!live || !roomPlayer) {
    const cards = baseRefs.map(ref=>eventPlayerCardPayload(event,ref,false)).filter(Boolean);
    return { phase:4,event:publicEvent(event),live:false,player:eventPlayer?{id:eventPlayer.id,name:eventPlayer.name}:null,cards,room:null,message:eventPlayer?'Tus cartones están listos. Esperando que el conductor prepare la partida.':'Este cartón todavía no está vinculado a un jugador.' };
  }
  syncAutoMarksForPlayer(roomPlayer);
  const readinessById = new Map(playerPrizeReadiness(roomPlayer).map(item=>[String(item.cardId),item]));
  const cards = (eventPlayer.cards || []).map(ref=>{
    const card = premiumEventRoomCard(ref.lotCode,ref.cardNumber);
    if(!card)return null;
    const analysis=analyzeCard(card,state.game.drawn,roomPlayer.marks?.[card.id]||[]);
    return {
      lotCode:card.eventLotCode,cardNumber:Number(card.eventCardNumber),mode:card.mode,grid:deepCopy(card.grid),roomCardId:card.id,
      marks:[...(roomPlayer.marks?.[card.id]||[])],markedCount:roomPlayer.autoMark?analysis.markedCount:analysis.playerMarkedCount,totalNumbers:analysis.totalNumbers,
      readiness:readinessById.get(String(card.id))||null
    };
  }).filter(Boolean).sort((a,b)=>a.lotCode.localeCompare(b.lotCode)||a.cardNumber-b.cardNumber);
  const broadcast=broadcastPayload();
  const ownClaims=(state.claims||[]).filter(claim=>claim.playerId===roomPlayer.id).slice(-20).map(claim=>premiumEventClaim(event,claim));
  return {
    phase:4,event:publicEvent(event),live:true,
    player:{id:eventPlayer.id,name:eventPlayer.name,autoMark:Boolean(roomPlayer.autoMark),markingMode:roomPlayer.autoMark?'automatic':'manual'},
    cards,
    room:{active:true,status:state.status,pauseReason:state.pauseReason||null,roomCode:state.roomCode,startedAt:state.startedAt||null,endedAt:state.endedAt||null,
      markingMode:state.roomSettings?.markingMode||'normal',claimMode:state.roomSettings?.claimMode||'manual',
      game:{mode:state.game.mode,rules:deepCopy(state.game.rules),drawn:[...(state.game.drawn||[])],lastBall:state.game.drawn?.at(-1)??null,lastDrawnAt:state.game.lastDrawnAt||null,phase:state.game.phase||''},
      pendingClaim:premiumEventClaim(event,broadcast.pendingClaim),latestConfirmed:premiumEventClaim(event,broadcast.latestConfirmed),bingoConfirmed:Boolean(broadcast.bingoConfirmed)},
    ownClaims,notices:(roomPlayer.notices||[]).slice(-10),message:`${cards.length} cartón${cards.length===1?'':'es'} conectado${cards.length===1?'':'s'} a la partida.`
  };
}
function premiumEventPlayerLivePayload(accessCode) {
  const found=premiumEventPlayerFromCode(accessCode), {event,lot,card,player}=found;
  if(player)markEventPlayerPresence(event.code,player.id);
  const workspace=eventLiveWorkspace(event);
  const accessed={lotCode:lot.code,cardNumber:card.globalNumber};
  if(!workspace)return premiumEventPlayerLivePayloadFromContext(event,player,accessed);
  return workspaceContext.run(workspace,()=>premiumEventPlayerLivePayloadFromContext(event,player,accessed));
}
function premiumEventActionContext(payload={}) {
  const found=premiumEventPlayerFromCode(payload.codigo||payload.accessCode);
  if(!found.player)throw new Error('Este cartón todavía no está vinculado a un jugador.');
  const workspace=eventLiveWorkspace(found.event);
  if(!workspace||!found.event.live?.active)throw new Error('El Evento todavía no está conectado a una partida.');
  return { ...found, workspace };
}
function markPremiumEventCard(payload={}) {
  const ctx=premiumEventActionContext(payload);
  return workspaceContext.run(ctx.workspace,()=>{
    if(safeEventCode(state.eventContext?.eventCode)!==ctx.event.code)throw new Error('La sala todavía no fue preparada con esta tanda Evento.');
    const roomPlayer=premiumEventRoomPlayer(ctx.event,ctx.player); if(!roomPlayer)throw new Error('El jugador todavía no está sincronizado con la sala.');
    const lotCode=safeEventLotCode(payload.lotCode),cardNumber=Math.max(1,Math.round(Number(payload.cardNumber)||0));
    if(!(ctx.player.cards||[]).some(ref=>premiumEventRoomCardKey(ref.lotCode,ref.cardNumber)===premiumEventRoomCardKey(lotCode,cardNumber)))throw new Error('Ese cartón no pertenece al jugador.');
    const roomCard=premiumEventRoomCard(lotCode,cardNumber); if(!roomCard)throw new Error('El cartón no está activo en esta partida.');
    const number=Number(payload.number); if(!(state.game.drawn||[]).includes(number)&&Boolean(payload.marked!==false))throw new Error('Esa bolilla todavía no salió.');
    markNumber(roomPlayer,{cardId:roomCard.id,number,marked:payload.marked});
    markEventPlayerPresence(ctx.event.code,ctx.player.id);
    return premiumEventPlayerLivePayloadFromContext(ctx.event,ctx.player,{lotCode,cardNumber});
  });
}
function claimPremiumEventCard(payload={}) {
  const ctx=premiumEventActionContext(payload);
  return workspaceContext.run(ctx.workspace,()=>{
    if(safeEventCode(state.eventContext?.eventCode)!==ctx.event.code)throw new Error('La sala todavía no fue preparada con esta tanda Evento.');
    const roomPlayer=premiumEventRoomPlayer(ctx.event,ctx.player); if(!roomPlayer)throw new Error('El jugador todavía no está sincronizado con la sala.');
    const lotCode=safeEventLotCode(payload.lotCode),cardNumber=Math.max(1,Math.round(Number(payload.cardNumber)||0));
    if(!(ctx.player.cards||[]).some(ref=>premiumEventRoomCardKey(ref.lotCode,ref.cardNumber)===premiumEventRoomCardKey(lotCode,cardNumber)))throw new Error('Ese cartón no pertenece al jugador.');
    const roomCard=premiumEventRoomCard(lotCode,cardNumber); if(!roomCard)throw new Error('El cartón no está activo en esta partida.');
    const claim=createClaim(roomPlayer,{cardId:roomCard.id,type:payload.type});
    markEventPlayerPresence(ctx.event.code,ctx.player.id);
    return {ok:true,claim:premiumEventClaim(ctx.event,claim),state:premiumEventPlayerLivePayloadFromContext(ctx.event,ctx.player,{lotCode,cardNumber})};
  });
}


function normalizedGeneratedCount(value) {
  const number = Math.max(25, Math.min(250, Number(value) || 250));
  return Math.max(25, Math.min(250, Math.round(number / 25) * 25));
}

function roomRulesFor(mode, raw = {}) {
  const is75 = Number(mode) === 75;
  return {
    ambocabeza: !is75 && Boolean(raw.ambocabeza),
    line: raw.line !== false,
    doubleLine: is75 && Boolean(raw.doubleLine),
    tripleLine: is75 && Boolean(raw.tripleLine),
    corners: is75 && Boolean(raw.corners),
    bingo: raw.bingo !== false
  };
}

function createGeneratedGame(payload = {}) {
  const mode = Number(payload.mode) === 75 ? 75 : 90;
  const rules = roomRulesFor(mode, payload.rules || {});
  const count = normalizedGeneratedCount(payload.cardCount);
  const cards = generateDiverseCardsServer(count, mode, rules);
  return {
    id: randomId('game'), number: 1, mode, rules,
    drawMode: payload.drawMode === 'manual' ? 'manual' : 'automatic',
    autoSeconds: Math.max(2, Math.min(60, Number(payload.autoSeconds) || 6)),
    presenter: PRESENTER_ID,
    theme: 'clasico', phase: 'READY', drawn: [], createdAt: nowIso(), updatedAt: nowIso(), cards
  };
}

function resizeWaitingRoomCards(targetCount) {
  if (!state.active || !state.game || state.status !== 'waiting') throw new Error('La cantidad de cartones solo puede cambiar antes de iniciar.');
  const nextCount = normalizedGeneratedCount(targetCount);
  const cards = state.game.cards || [];
  if (nextCount === cards.length) return false;

  const protectedIds = new Set();
  for (const player of state.players || []) {
    for (const id of player.cardIds || []) protectedIds.add(String(id));
    for (const id of player.reservedCardIds || []) protectedIds.add(String(id));
  }

  if (nextCount < cards.length) {
    const kept = cards.slice(0, nextCount);
    const keptIds = new Set(kept.map(card => String(card.id)));
    const protectedRemoved = [...protectedIds].filter(id => !keptIds.has(id));
    if (protectedRemoved.length) throw new Error('No se puede reducir a esa cantidad porque eliminaría cartones ya asignados o reservados.');
    state.game.cards = kept;
  } else {
    const desired = generateDiverseCardsServer(nextCount, state.game.mode, state.game.rules);
    const existingSignatures = new Set(cards.map(cardSignature));
    const additions = [];
    for (const candidate of desired) {
      if (additions.length >= nextCount - cards.length) break;
      if (existingSignatures.has(cardSignature(candidate))) continue;
      if (cards.some(existing => sharedCardNumbers(existing, candidate) > (Number(state.game.mode) === 75 ? 12 : 6))) continue;
      const number = String(cards.length + additions.length + 1).padStart(3, '0');
      additions.push({ ...candidate, id: randomId('card'), number, name: `Cartón ${number}`, originalName: `Cartón ${number}` });
      existingSignatures.add(cardSignature(candidate));
    }
    if (additions.length !== nextCount - cards.length) throw new Error('No se pudieron generar los cartones adicionales sin repetir combinaciones.');
    state.game.cards = cards.concat(additions);
  }

  for (const player of state.players || []) {
    const valid = new Set(state.game.cards.map(card => String(card.id)));
    player.offeredCardIds = (player.offeredCardIds || []).filter(id => valid.has(String(id)));
    player.reservedCardIds = (player.reservedCardIds || []).filter(id => valid.has(String(id)));
  }
  state.game.updatedAt = nowIso();
  refreshAllOffers();
  logEvent('waiting_room_card_count_changed', { cards: state.game.cards.length });
  return true;
}

function syncLinkedScheduleToRoom(game, previous = {}) {
  if (!game?.roomCode) return false;
  const workspace = game.workspaceId ? workspaces.get(game.workspaceId) : findWorkspaceByRoomCode(game.roomCode);
  if (!workspace || !workspace.state?.active || String(workspace.state.roomCode || '') !== String(game.roomCode || '')) return false;
  return workspaceContext.run(workspace, () => {
    if (state.status !== 'waiting') throw new Error('La partida ya comenzó. La configuración crítica quedó bloqueada.');

    const previousMode = Number(previous.mode) === 75 ? 75 : 90;
    const nextMode = Number(game.mode) === 75 ? 75 : 90;
    const modeChanged = previousMode !== nextMode;
    if (modeChanged && state.players.length) {
      throw new Error('No se puede cambiar la modalidad porque ya hay jugadores registrados.');
    }

    const nextMax = game.markingMode === 'manual_only'
      ? Math.min(2, Math.max(1, Number(game.maxCardsPerPlayer) || 2))
      : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(game.maxCardsPerPlayer) || 4));
    const offenders = (state.players || []).filter(player => Math.max(Number(player.allowedCardCount) || 1, (player.cardIds || []).length) > nextMax);
    if (offenders.length) throw new Error(`No se puede bajar el máximo a ${nextMax}: ${offenders.length} jugador(es) ya tienen una cantidad mayor.`);

    if (modeChanged) {
      state.game = createGeneratedGame(scheduledGameRoomPayload(game));
      state.drawOrder = createSecureDrawOrder(state.game.mode);
      state.players = [];
      state.cardReservations = {};
    } else {
      resizeWaitingRoomCards(game.cardCount);
      state.game.rules = roomRulesFor(state.game.mode, game.rules || {});
      state.game.autoSeconds = Math.max(2, Math.min(60, Number(game.autoSeconds) || 6));
      for (const card of state.game.cards || []) {
        card.bets = {
          ambocabeza: Number(state.game.mode) === 90 && state.game.rules.ambocabeza !== false,
          line: state.game.rules.line !== false,
          doubleLine: Number(state.game.mode) === 75 && Boolean(state.game.rules.doubleLine),
          tripleLine: Number(state.game.mode) === 75 && Boolean(state.game.rules.tripleLine),
          corners: Number(state.game.mode) === 75 && Boolean(state.game.rules.corners),
          bingo: state.game.rules.bingo !== false
        };
      }
    }
    state.roomSettings.markingMode = game.markingMode === 'manual_only' ? 'manual_only' : 'normal';
    state.roomSettings.maxCardsPerPlayer = nextMax;
    state.roomSettings.linePrizeCount = Number(state.game.mode) === 90 ? Math.max(1, Math.min(2, Number(game.linePrizeCount) || 1)) : 1;
    state.roomSettings.whatsapp = String(game.whatsapp || platform.community?.whatsappNumber || '').trim();
    state.roomSettings.scheduledAt = game.startsAt;
    state.roomSettings.scheduledRegistrationMinutes = game.registrationMinutes;
    state.roomSettings.scheduledAutoStart = Boolean(game.autoStart);
    state.roomSettings.communityScheduleId = game.id;

    const startsMs = new Date(game.startsAt).getTime();
    const opensMs = startsMs - Math.max(1, Number(game.registrationMinutes) || 15) * 60_000;
    const now = Date.now();
    if (game.autoStart) {
      if (now < opensMs) {
        state.roomSettings.joinOpen = false;
        game.autoOpenedAt = null;
        game.autoClosedAt = null;
      } else if (now < startsMs) {
        state.roomSettings.joinOpen = state.players.length < Math.max(2, Math.min(MAX_PLAYERS, Number(state.roomSettings.maxOpenPlayers) || MAX_PLAYERS));
        game.autoOpenedAt ||= nowIso();
        game.autoClosedAt = null;
      } else {
        state.roomSettings.joinOpen = false;
        game.autoClosedAt ||= nowIso();
      }
    }
    refreshAllOffers();
    logEvent('scheduled_room_updated', { scheduleId: game.id, startsAt: game.startsAt, cards: state.game.cards.length, maxCardsPerPlayer: nextMax });
    saveState();
    broadcast();
    return true;
  });
}

function emptyRoomPlayer({ name = '', cardIds = [], allowedCardCount = 1, code = '', deviceId = '', openJoin = false } = {}) {
  const playerId = randomId('player');
  const roomMax = state.roomSettings?.markingMode === 'manual_only' ? 2 : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(state.roomSettings?.maxCardsPerPlayer) || MAX_CARDS_PER_PLAYER));
  const allowed = Math.max(1, Math.min(roomMax, Number(allowedCardCount) || 1));
  return {
    id: playerId,
    name: normalizePlayerName(name),
    nameSet: Boolean(normalizePlayerName(name)),
    slotNumber: state.players?.length ? state.players.length + 1 : 1,
    slotLabel: normalizePlayerName(name) || `Acceso ${(state.players?.length || 0) + 1}`,
    personalPresenter: PRESENTER_ID,
    code: code || randomCode(6),
    directAccessToken: null,
    recoveryExpiresAt: null,
    inviteToken: null,
    inviteClaimedAt: null,
    invitedAt: null,
    requestedCardCount: allowed,
    allowedCardCount: allowed,
    cardIds: [...cardIds],
    selectionConfirmed: cardIds.length > 0,
    offeredCardIds: [], reservedCardIds: [],
    sessionToken: openJoin ? randomId('session') : null,
    sessionDeviceId: openJoin ? String(deviceId || '') : '',
    openJoinDeviceId: openJoin ? String(deviceId || '') : '',
    marks: Object.fromEntries(cardIds.map(cardId => [cardId, []])),
    autoMark: false,
    markingModeChosen: state.roomSettings?.markingMode === 'manual_only',
    notices: [],
    codeStatus: openJoin ? 'shared-key' : 'generated'
  };
}

function availableUnassignedCards() {
  const used = new Set(state.players.flatMap(player => player.cardIds || []));
  return (state.game?.cards || []).filter(card => !used.has(card.id));
}

function chooseDiverseCardsForPlayer(count, mode) {
  const pool = shuffle(availableUnassignedCards());
  const selected = [];
  const strict = Number(mode) === 75 ? 9 : 4;
  for (const card of pool) {
    if (selected.every(existing => sharedCardNumbers(existing, card) <= strict)) selected.push(card);
    if (selected.length >= count) return selected;
  }
  // The generated pool already respects the global diversity rule. This fallback
  // chooses the best remaining cards rather than failing a large or test room.
  const remaining = pool.filter(card => !selected.includes(card));
  while (selected.length < count && remaining.length) {
    remaining.sort((a, b) => Math.max(0, ...selected.map(x => sharedCardNumbers(x, a))) - Math.max(0, ...selected.map(x => sharedCardNumbers(x, b))));
    selected.push(remaining.shift());
  }
  if (selected.length !== count) throw new Error('No quedan suficientes cartones disponibles.');
  return selected;
}

function waitingGamePayload() {
  const game = state.waitingGame || {};
  const sortBoard = board => (Array.isArray(board) ? board : [])
    .slice()
    .sort((a,b) => Number(b.bestScore || 0) - Number(a.bestScore || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'es'))
    .slice(0, 10);
  const legacy = Array.isArray(game.leaderboard) ? game.leaderboard : [];
  const redBlack = sortBoard(game.leaderboards?.red_black || (game.type === 'red_black' ? legacy : []));
  const higherLower = sortBoard(game.leaderboards?.higher_lower || (game.type === 'higher_lower' ? legacy : []));
  const aggregateByPlayer = new Map();
  for (const entry of [...redBlack, ...higherLower]) {
    const key = String(entry.playerId || entry.name || '');
    const current = aggregateByPlayer.get(key);
    if (!current || Number(entry.bestScore || 0) > Number(current.bestScore || 0)) aggregateByPlayer.set(key, { ...entry });
  }
  return {
    type: 'both',
    activeTypes: ['red_black', 'higher_lower'],
    leaderboards: { red_black: redBlack, higher_lower: higherLower },
    leaderboard: sortBoard([...aggregateByPlayer.values()])
  };
}

function createSimpleRoom(payload = {}) {
  const game = createGeneratedGame(payload);
  const markingMode = payload.markingMode === 'manual_only' ? 'manual_only' : 'normal';
  const whatsapp = String(payload.whatsapp || platform.community?.whatsappNumber || '').trim().slice(0, 40);
  const communityScheduleId = String(payload.communityScheduleId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const communitySchedule = communityScheduleId ? communityScheduledGames().find(item => item.id === communityScheduleId) : null;
  if (communityScheduleId && !communitySchedule) throw new Error('La partida programada ya no existe. Volvé a abrir la Agenda.');
  // Final: 4 cartones por defecto. Solo Manual fuerza máximo 2.
  const roomMaxCards = markingMode === 'manual_only'
    ? 2
    : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(payload.maxCardsPerPlayer) || 4));
  replaceCurrentState({
    ...blankState(), revision: 0, active: true, status: 'waiting', roomCode: uniqueRoomCode(6), createdAt: nowIso(), updatedAt: nowIso(), round: 1,
    roomSettings: {
      ...blankState().roomSettings,
      playerAudioAllowed: true, playerAudioDefault: true,
      linePrizeCount: Number(game.mode) === 90 ? Math.max(1, Math.min(2, Number(payload.linePrizeCount) || 1)) : 1,
      allowSamePlayerSecondLine: true, claimMode: payload.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual', tiePolicy: payload.claimMode === 'automatic_ties' ? 'same_ball' : 'first_claim', gameType: 'real',
      roomType: 'alpha',
      roomOrigin: payload.roomOrigin === 'community' ? 'community' : 'official',
      hostName: payload.roomOrigin === 'community' ? normalizeCommunityName(payload.hostName || 'Jugador') : '',
      roomName: payload.roomOrigin === 'community' ? String(payload.roomName || '').trim().replace(/\s+/g, ' ').slice(0, 30) : '',
      communityPublicId: payload.roomOrigin === 'community' ? String(payload.communityPublicId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) : '',
      communityStartMode: payload.roomOrigin === 'community' && payload.communityStartMode === 'scheduled' ? 'scheduled' : (payload.roomOrigin === 'community' ? 'manual' : ''),
      communityAccessType: payload.roomOrigin === 'community' && payload.communityAccessType === 'private' ? 'private' : 'public',
      // El acceso normal es exclusivamente mediante invitaciones privadas por jugador.
      joinOpen: false,
      maxOpenPlayers: Math.max(2, Math.min(MAX_PLAYERS, Number(payload.maxOpenPlayers) || MAX_PLAYERS)),
      accessKey: '', whatsapp,
      communityScheduleId: communitySchedule?.id || '',
      scheduledAt: communitySchedule?.startsAt || (payload.scheduledAt ? String(payload.scheduledAt) : ''),
      scheduledRegistrationMinutes: communitySchedule?.registrationMinutes || (payload.roomOrigin === 'community' && payload.communityStartMode === 'scheduled' ? 120 : 15),
      scheduledAutoStart: Boolean(communitySchedule?.autoStart || (payload.roomOrigin === 'community' && payload.communityStartMode === 'scheduled')),
      maxCardsPerPlayer: roomMaxCards, markingMode,
      claimAutoVerifySeconds: 10,
      presenterVoiceGender: 'female',
      // La transmisión existe siempre; no se configura al crear la partida.
      broadcastToken: randomId('live'), broadcastAlias: freshBroadcastAlias(currentWorkspace().id),
      transmission: normalizeTransmissionSettings()
    },
    waitingGame: { type: 'both', leaderboard: [], leaderboards: { red_black: [], higher_lower: [] } },
    drawOrder: createSecureDrawOrder(game.mode), game, players: [], cardReservations: {}, claims: [], eventLog: [],
    chat: { enabled: true, locked: false, messages: [], mutedPlayerIds: [], lastSentAt: {} }
  });
  if (communitySchedule) {
    communitySchedule.mode = Number(game.mode) === 75 ? 75 : 90;
    communitySchedule.roomCode = state.roomCode;
    communitySchedule.workspaceId = currentWorkspace().id;
    communitySchedule.autoOpenedAt = null;
    communitySchedule.autoClosedAt = null;
    communitySchedule.autoStartedAt = null;
    communitySchedule.autoStartError = '';
    communitySchedule.updatedAt = nowIso();
    savePlatform();
  }
  logEvent('functional_room_created', { markingMode, mode: game.mode, cards: game.cards.length, maxCardsPerPlayer: roomMaxCards, communityScheduleId: communitySchedule?.id || null, roomOrigin: state.roomSettings.roomOrigin, workspaceId: currentWorkspace().id });
  saveState(); broadcast();
  return adminPayload();
}

function openJoinPlayer(payload = {}) {
  if (!state.active || !state.game || !['alpha','test'].includes(state.roomSettings?.roomType)) throw new Error('Este enlace no corresponde a una sala abierta.');
  if (state.roomSettings?.roomOrigin === 'community' && state.roomSettings?.communityAccessType === 'private' && payload.communityAccessGranted !== true) throw new Error('Esta sala es privada. Ingresá desde su invitación y escribí la clave.');
  const deviceId = String(payload.deviceId || '').slice(0, 120);
  if (!deviceId) throw new Error('No se pudo identificar este dispositivo.');
  if (!state.roomSettings.joinOpen || state.status !== 'waiting') throw new Error('El ingreso a esta sala ya está cerrado.');
  const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(state.roomSettings.maxOpenPlayers) || MAX_PLAYERS));
  if (state.players.length >= maxPlayers) throw new Error('La sala ya alcanzó el límite de jugadores.');
  const name = validatePlayerName(payload.name);
  const roomMax = state.roomSettings?.markingMode === 'manual_only' ? 2 : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(state.roomSettings?.maxCardsPerPlayer) || MAX_CARDS_PER_PLAYER));
  const cardCount = Math.max(1, Math.min(roomMax, Number(payload.cardCount) || Math.min(2, roomMax)));
  const authorizedCards = state.players.reduce((total, player) => total + Math.max(1, Number(player.allowedCardCount) || 1), 0);
  if (authorizedCards + cardCount > MAX_ACTIVE_CARDS || authorizedCards + cardCount > state.game.cards.length) throw new Error('No quedan suficientes cartones disponibles para esa cantidad.');
  const player = emptyRoomPlayer({ name, cardIds: [], allowedCardCount: cardCount, deviceId, openJoin: true });
  player.slotNumber = state.players.length + 1; player.slotLabel = name;
  state.players.push(player);
  refreshOffersForPlayer(player, true);
  if (state.players.length >= maxPlayers) state.roomSettings.joinOpen = false;
  enforceAutoMarkPolicy(); updateCardDisplayNames();
  logEvent('alpha_player_joined', { playerId: player.id, playerName: name, requestedCards: cardCount, selectionPending: true });
  saveState(); broadcast();
  return { token: player.sessionToken, state: playerPayload(player), returning: false };
}

function updatePlayerApproval(payload = {}) {
  if (!state.active || !state.game || state.status !== 'waiting') throw new Error('La sala no está disponible para modificar jugadores.');
  const player = state.players.find(item => item.id === String(payload.playerId || ''));
  if (!player) throw new Error('No se encontró el jugador.');
  if (player.selectionConfirmed) throw new Error('El jugador ya confirmó sus cartones.');
  const roomMax = state.roomSettings?.markingMode === 'manual_only' ? 2 : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(state.roomSettings?.maxCardsPerPlayer) || MAX_CARDS_PER_PLAYER));
  const wanted = Math.max(1, Math.min(roomMax, Number(payload.allowedCardCount ?? payload.cardCount) || player.allowedCardCount || 1));
  const others = state.players.filter(item => item.id !== player.id).reduce((sum,item)=>sum+Math.max(1,Number(item.allowedCardCount)||1),0);
  if (others + wanted > state.game.cards.length || others + wanted > MAX_ACTIVE_CARDS) throw new Error('No hay suficientes cartones disponibles para autorizar esa cantidad.');
  if (wanted !== player.allowedCardCount) {
    releaseReservationsForPlayer(player);
    player.allowedCardCount = wanted;
    player.requestedCardCount = wanted;
    player.offeredCardIds = [];
    refreshOffersForPlayer(player, true);
  }
  logEvent('player_approval_updated', { playerId: player.id, authorized: authorizedCardCount(player) });
  saveState(); broadcast();
  return adminPayload();
}

function invitationUrlForPlayer(player) {
  if (!player?.inviteToken) return '';
  const base = PUBLIC_URL || `http://localhost:${PORT}`;
  return `${base}/invitacion/${encodeURIComponent(player.inviteToken)}`;
}

function findWorkspaceByInviteToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return null;
  return [...workspaces.values()].find(workspace => workspace.state?.active && (workspace.state.players || []).some(player => player.inviteToken === normalized)) || null;
}

function createInvitedPlayer(payload = {}) {
  if (!state.active || !state.game || state.status !== 'waiting') throw new Error('La sala no está disponible para agregar jugadores.');
  if (state.players.length >= MAX_PLAYERS) throw new Error(`La sala admite hasta ${MAX_PLAYERS} jugadores.`);
  const name = validatePlayerName(payload.name);
  const roomMax = state.roomSettings?.markingMode === 'manual_only' ? 2 : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(state.roomSettings?.maxCardsPerPlayer) || 4));
  const allowed = Math.max(1, Math.min(roomMax, Number(payload.allowedCardCount ?? payload.cardCount) || roomMax));
  const totalAuthorized = state.players.reduce((sum, player) => sum + Math.max(1, Number(player.allowedCardCount) || 1), 0);
  if (totalAuthorized + allowed > state.game.cards.length || totalAuthorized + allowed > MAX_ACTIVE_CARDS) throw new Error('No quedan suficientes cartones para autorizar esa cantidad.');
  const player = emptyRoomPlayer({ name, cardIds: [], allowedCardCount: allowed, openJoin: false });
  player.name = name;
  player.nameSet = true;
  player.slotNumber = state.players.length + 1;
  player.slotLabel = name;
  player.inviteToken = randomId('invite');
  player.invitedAt = nowIso();
  player.inviteClaimedAt = null;
  player.sessionToken = null;
  player.sessionDeviceId = '';
  player.openJoinDeviceId = '';
  player.codeStatus = 'private-invite';
  player.requestedCardCount = allowed;
  state.players.push(player);
  logEvent('player_invited', { playerId: player.id, playerName: name, allowedCardCount: allowed });
  saveState(); broadcast();
  return { state: adminPayload(), player: { id: player.id, name, allowedCardCount: allowed, inviteUrl: invitationUrlForPlayer(player) } };
}

function createBulkInvitedPlayers(payload = {}) {
  if (!state.active || !state.game || state.status !== 'waiting') throw new Error('La sala no está disponible para agregar jugadores.');
  const raw = Array.isArray(payload.names) ? payload.names : String(payload.names || '').split(/\r?\n|,/);
  const names = raw.map(normalizePlayerName).filter(Boolean).slice(0, MAX_PLAYERS);
  if (!names.length) throw new Error('Ingresá al menos un nombre.');
  const roomMax = state.roomSettings?.markingMode === 'manual_only' ? 2 : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(state.roomSettings?.maxCardsPerPlayer) || 4));
  const allowed = Math.max(1, Math.min(roomMax, Number(payload.allowedCardCount) || roomMax));

  // Validación transaccional: si hay un nombre repetido o no alcanzan cartones, no se crea ninguno.
  const canonical = names.map(canonicalPlayerName);
  if (new Set(canonical).size !== canonical.length) throw new Error('La lista contiene nombres repetidos.');
  const existing = new Set(state.players.map(player => canonicalPlayerName(player.name)));
  const duplicate = names.find((name, index) => existing.has(canonical[index]));
  if (duplicate) throw new Error(`Ya existe un jugador llamado ${duplicate} en esta partida.`);
  if (state.players.length + names.length > MAX_PLAYERS) throw new Error(`La sala admite hasta ${MAX_PLAYERS} jugadores.`);
  const totalAuthorized = state.players.reduce((sum, player) => sum + Math.max(1, Number(player.allowedCardCount) || 1), 0);
  const requestedTotal = totalAuthorized + names.length * allowed;
  if (requestedTotal > state.game.cards.length || requestedTotal > MAX_ACTIVE_CARDS) throw new Error('No quedan suficientes cartones para autorizar a todos esos jugadores.');

  const created = [];
  for (const name of names) {
    const result = createInvitedPlayer({ name, allowedCardCount: allowed });
    created.push(result.player);
  }
  return { state: adminPayload(), players: created };
}

function issueInvitationActivation(inviteToken) {
  const now = Date.now();
  for (const [key, item] of invitationActivationTokens.entries()) {
    if (!item || Number(item.expiresAt || 0) <= now) invitationActivationTokens.delete(key);
  }
  const activationToken = randomId('activate');
  invitationActivationTokens.set(activationToken, {
    inviteToken: String(inviteToken || ''),
    expiresAt: now + INVITATION_ACTIVATION_TTL_MS
  });
  return activationToken;
}

function consumeInvitationActivation(activationToken, inviteToken) {
  const key = String(activationToken || '').trim();
  const expectedInvite = String(inviteToken || '').trim();
  const item = invitationActivationTokens.get(key);
  if (!item) return false;
  invitationActivationTokens.delete(key);
  if (Number(item.expiresAt || 0) <= Date.now()) return false;
  return safeEqual(String(item.inviteToken || ''), expectedInvite);
}

function claimPlayerInvitation(token, deviceId = '') {
  if (!state.active || !state.game || !['waiting','starting','playing','verifying','paused','resuming','finalizing','finished'].includes(state.status)) throw new Error('La partida ya no admite ingresos.');
  const normalized = String(token || '').trim();
  const player = state.players.find(item => item.inviteToken === normalized && !item.virtual);
  if (!player) throw new Error('Este enlace de invitación no es válido.');
  if (player.inviteClaimedAt) throw new Error('Este enlace ya fue utilizado. Si cambiaste de dispositivo, pedile al administrador un enlace de recuperación.');
  player.sessionToken = randomId('session');
  player.sessionDeviceId = String(deviceId || randomId('device')).slice(0, 120);
  player.openJoinDeviceId = player.sessionDeviceId;
  player.lastLoginAt = nowIso();
  player.inviteClaimedAt = nowIso();
  if (state.status === 'waiting') refreshOffersForPlayer(player, true);
  logEvent('player_invitation_claimed', { playerId: player.id, playerName: playerDisplayName(player), allowedCardCount: player.allowedCardCount });
  saveState(); broadcast();
  return { token: player.sessionToken, playerId: player.id, playerName: playerDisplayName(player), state: playerPayload(player) };
}

function createPlayerRecoveryLink(payload = {}) {
  const player = state.players.find(item => item.id === String(payload.playerId || '') && !item.virtual);
  if (!player) throw new Error('No se encontró ese jugador.');
  const token = randomId('recover');
  player.directAccessToken = token;
  player.recoveryExpiresAt = new Date(Date.now() + PLAYER_RECOVERY_TTL_MS).toISOString();
  const base = PUBLIC_URL || `http://localhost:${PORT}`;
  const url = `${base}/jugador?recuperar=${encodeURIComponent(token)}`;
  logEvent('player_recovery_link_created', { playerId: player.id, playerName: playerDisplayName(player), expiresAt: player.recoveryExpiresAt });
  saveState();
  return { playerId: player.id, playerName: playerDisplayName(player), url, expiresAt: player.recoveryExpiresAt };
}

function recoverPlayerByDirectToken(payload = {}) {
  const token = String(payload.recoveryToken || '').trim();
  const deviceId = String(payload.deviceId || randomId('device')).trim().slice(0,120);
  if (!token) throw new Error('El enlace de recuperación no es válido.');
  const player = state.players.find(item => item.directAccessToken === token);
  if (!player || !player.recoveryExpiresAt || new Date(player.recoveryExpiresAt).getTime() <= Date.now()) {
    throw new Error('El enlace de recuperación venció o ya fue utilizado. Pedile uno nuevo al administrador.');
  }
  // Una sola sesión activa: recuperar acceso invalida inmediatamente la sesión anterior.
  player.sessionToken = randomId('session');
  player.sessionDeviceId = deviceId;
  player.openJoinDeviceId = deviceId;
  player.lastLoginAt = nowIso();
  player.directAccessToken = null;
  player.recoveryExpiresAt = null;
  logEvent('player_session_recovered', { playerId: player.id, playerName: playerDisplayName(player), previousSessionInvalidated: true });
  saveState(); broadcast();
  return { token: player.sessionToken, state: playerPayload(player), recovered: true };
}

function normalizedPlayerAccessCode(value) {
  return String(value || '').trim().toUpperCase();
}

function playerCodeMatchesAcrossWorkspaces(code) {
  const normalized = normalizedPlayerAccessCode(code);
  if (!normalized) return [];
  const matches = [];
  for (const workspace of workspaces.values()) {
    if (!workspace.state?.active) continue;
    const player = (workspace.state.players || []).find(item => normalizedPlayerAccessCode(item.code) === normalized);
    if (player) matches.push({ workspace, player });
  }
  return matches;
}

function freshNumericPlayerCode() {
  let code = '';
  let attempts = 0;
  do {
    code = randomNumericCode(6);
    attempts++;
  } while (playerCodeMatchesAcrossWorkspaces(code).length && attempts < 2000);
  if (!code || playerCodeMatchesAcrossWorkspaces(code).length) throw new Error('No se pudo generar un código de acceso único. Probá nuevamente.');
  return code;
}

function findWorkspaceByPlayerCode(code) {
  const matches = playerCodeMatchesAcrossWorkspaces(code);
  if (matches.length === 1) return matches[0].workspace;
  if (matches.length > 1) throw new Error('Ese código aparece en más de una sala activa. Usá el enlace de la sala.');
  return null;
}

function playerDirectUrl(player) {
  if (!player?.directAccessToken || !player?.recoveryExpiresAt || new Date(player.recoveryExpiresAt).getTime() <= Date.now()) return '';
  const base = PUBLIC_URL || `http://localhost:${PORT}`;
  return `${base}/jugador?recuperar=${encodeURIComponent(player.directAccessToken)}`;
}

function addOfficialPlayer(payload = {}) {
  if (!state.active || !state.game || state.roomSettings?.roomType !== 'official' || state.status !== 'waiting') throw new Error('La sala oficial no está disponible para agregar jugadores.');
  if (state.players.length >= MAX_PLAYERS) throw new Error(`La sala admite hasta ${MAX_PLAYERS} jugadores.`);
  const name = validatePlayerName(payload.name);
  const cardCount = Math.max(1, Math.min(4, Number(payload.cardCount) || 1));
  const activeCards = state.players.reduce((total, player) => total + (player.cardIds || []).length, 0);
  if (activeCards + cardCount > MAX_ACTIVE_CARDS) throw new Error(`La sala admite hasta ${MAX_ACTIVE_CARDS} cartones activos.`);
  const chosen = chooseDiverseCardsForPlayer(cardCount, state.game.mode);
  const code = freshNumericPlayerCode();
  const player = emptyRoomPlayer({ name, cardIds: chosen.map(card => card.id), allowedCardCount: cardCount, code });
  player.slotNumber = state.players.length + 1; player.slotLabel = name; player.autoMark = true;
  state.players.push(player); syncAutoMarksForPlayer(player); enforceAutoMarkPolicy(); updateCardDisplayNames();
  logEvent('official_player_added', { playerId: player.id, playerName: name, cards: cardCount });
  saveState(); broadcast();
  return { state: adminPayload(), player: { id: player.id, name, code: player.code, directJoinUrl: playerDirectUrl(player), roomJoinUrl: `${PUBLIC_URL || `http://localhost:${PORT}`}/jugador?sala=${encodeURIComponent(state.roomCode)}`, cardNumbers: chosen.map(card => card.number), cardCount } };
}

function removeRoomPlayer(payload = {}) {
  if (!state.active || state.status !== 'waiting') throw new Error('Solo se puede quitar un jugador antes de iniciar.');
  const id = String(payload.playerId || '');
  const player = state.players.find(item => item.id === id);
  if (!player) throw new Error('No se encontró el jugador.');
  releaseReservationsForPlayer(player);
  state.players = state.players.filter(item => item.id !== id);
  if (String(state.communityCreatorPlayerId || '') === id) state.communityCreatorPlayerId = null;
  state.roomSettings.joinOpen = state.roomSettings.roomType === 'test' && state.players.length < 10;
  updateCardDisplayNames(); enforceAutoMarkPolicy();
  logEvent('player_removed', { playerId: id, playerName: playerDisplayName(player) });
  saveState(); broadcast(); return adminPayload();
}

function updateJoinOpen(payload = {}) {
  if (!state.active || state.status !== 'waiting') throw new Error('El ingreso solo se controla mientras la sala está en espera.');
  const open = Boolean(payload.open);
  const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(state.roomSettings?.maxOpenPlayers) || MAX_PLAYERS));
  if (open && state.players.length >= maxPlayers) throw new Error('La sala ya está completa.');
  state.roomSettings.joinOpen = open;
  logEvent(open ? 'join_opened' : 'join_closed'); saveState(); broadcast(); return adminPayload();
}

function submitWaitingGameScore(player, payload = {}) {
  if (!state.active || state.status !== 'waiting') throw new Error('El minijuego solo está disponible en la sala de espera.');
  const gameType = ['red_black','higher_lower'].includes(payload.gameType) ? payload.gameType : 'red_black';
  const score = Math.max(0, Math.min(9999, Math.floor(Number(payload.score) || 0)));
  state.waitingGame ||= { type: 'both', leaderboard: [], leaderboards: { red_black: [], higher_lower: [] } };
  state.waitingGame.type = 'both';
  state.waitingGame.leaderboards ||= { red_black: [], higher_lower: [] };
  state.waitingGame.leaderboards[gameType] ||= [];
  const board = state.waitingGame.leaderboards[gameType];
  const entry = board.find(item => item.playerId === player.id);
  if (entry) { entry.bestScore = Math.max(Number(entry.bestScore) || 0, score); entry.name = playerDisplayName(player); entry.updatedAt = nowIso(); }
  else board.push({ playerId: player.id, name: playerDisplayName(player), bestScore: score, updatedAt: nowIso() });
  const aggregate = waitingGamePayload().leaderboard;
  state.waitingGame.leaderboard = aggregate;
  saveState(); broadcast(); return playerPayload(player);
}

function missingNumbersForLineCount(card, drawnValues, targetCount) {
  const drawn = new Set(uniqueNumbers(drawnValues));
  const definitions = lineDefinitions(card).map(line => new Set(line.values.filter(number => !drawn.has(number))));
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

function amboMissingForCard(card, drawnValues) {
  if (Number(card.mode) !== 90) return 99;
  const drawn = new Set(uniqueNumbers(drawnValues));
  let best = 99;
  for (const row of card.grid || []) {
    const values = row.filter(Number.isFinite);
    if (values.length !== 5) continue;
    if (values.slice(1, -1).some(number => drawn.has(number))) continue;
    const missing = Number(!drawn.has(values[0])) + Number(!drawn.has(values.at(-1)));
    best = Math.min(best, missing);
  }
  return best;
}

function broadcastRaceForCard(card, analysis, prizes) {
  const candidates = [];
  const add = (type, missing, enabled = true) => {
    const prize = prizes?.[type];
    const betName = claimBetName(type);
    if (!enabled || !prize || prize.closed || card.bets?.[betName] === false || !Number.isFinite(Number(missing))) return;
    const importance = { bingo: 0, tripleLine: 1, doubleLine: 2, corners: 3, line: 4, ambo: 5 }[type] ?? 9;
    const prizeNumber = type === 'line' ? Number(prize.nextNumber) || 1 : 1;
    candidates.push({ type, missing: Math.max(0, Number(missing) || 0), importance, prizeNumber, label: prize.nextLabel || prizeLabelFor(type, prizeNumber, card.mode) });
  };
  add('ambo', amboMissingForCard(card, state.game.drawn), Number(card.mode) === 90);
  add('line', analysis.lineMissing);
  const mode75 = Number(card.mode) === 75;
  add('doubleLine', mode75 && prizes?.doubleLine && !prizes.doubleLine.closed ? missingNumbersForLineCount(card, state.game.drawn, 2) : 99, mode75);
  add('tripleLine', mode75 && prizes?.tripleLine && !prizes.tripleLine.closed ? missingNumbersForLineCount(card, state.game.drawn, 3) : 99, mode75);
  add('corners', analysis.cornersMissing, Number(card.mode) === 75);
  add('bingo', analysis.bingoMissing);
  candidates.sort((a, b) => a.missing - b.missing || a.importance - b.importance);
  return candidates[0] || { type: 'bingo', missing: Number(analysis.bingoMissing) || 99, importance: 9, prizeNumber: 1, label: prizeLabelFor('bingo', 1, card.mode) };
}

function highlightedBroadcastCards() {
  if (!state.game || state.roomSettings?.transmission?.showCards === false) return [];
  const connected = connectedPlayerIds();
  const prizes = prizeStatusPayload();
  const rows = [];
  for (const player of state.players) for (const cardId of player.cardIds || []) {
    const card = state.game.cards.find(item => item.id === cardId); if (!card) continue;
    const analysis = analyzeCard(card, state.game.drawn, player.marks?.[cardId] || []);
    const race = broadcastRaceForCard(card, analysis, prizes);
    const score = race.missing * 10 + race.importance;
    rows.push({
      playerId: player.id, playerName: playerDisplayName(player), connected: connected.has(player.id), cardId,
      cardNumber: card.number, grid: card.grid, mode: card.mode, score,
      racePrizeType: race.type, racePrizeNumber: race.prizeNumber, racePrizeLabel: race.label, raceMissing: race.missing,
      lineMissing: analysis.lineMissing, bingoMissing: analysis.bingoMissing, marked: analysis.officialMarked || []
    });
  }
  return rows
    .sort((a,b) => a.score - b.score || a.bingoMissing - b.bingoMissing || String(a.cardNumber).localeCompare(String(b.cardNumber)))
    .slice(0, 6)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}


function partitionDiverseCardGroups(pool, sizes, mode) {
  const strict = Number(mode) === 75 ? 9 : 4;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const remaining = shuffle(pool);
    const groups = [];
    let ok = true;
    for (const size of sizes) {
      const group = [];
      for (let index = 0; index < remaining.length && group.length < size; ) {
        const card = remaining[index];
        if (group.every(existing => sharedCardNumbers(existing, card) <= strict)) {
          group.push(card); remaining.splice(index, 1);
        } else index++;
      }
      if (group.length !== size) { ok = false; break; }
      groups.push(group);
    }
    if (ok) return groups;
  }
  throw new Error('No se pudo formar una combinación suficientemente diversa para los jugadores.');
}

function createDemoRoom(payload = {}) {
  const mode = Number(payload.mode) === 75 ? 75 : 90;
  const markingMode = payload.markingMode === 'manual_only' ? 'manual_only' : 'normal';
  const aiCount = Math.max(1, Math.min(3, Math.floor(Number(payload.aiCount ?? payload.players) || 2)));
  const demoMaxCards = markingMode === 'manual_only' ? 2 : 4;
  const playerCardCount = Math.max(1, Math.min(demoMaxCards, Number(payload.playerCardCount ?? payload.cardsPerPlayer) || demoMaxCards));
  const allowedIntervals = new Set([2, 4, 6, 8]);
  const requestedInterval = Number(payload.autoSeconds) || 4;
  const autoSeconds = allowedIntervals.has(requestedInterval) ? requestedInterval : 4;
  const defaultRules = mode === 75
    ? { ambocabeza: false, line: true, doubleLine: true, tripleLine: true, corners: true, bingo: true }
    : { ambocabeza: true, line: true, doubleLine: false, tripleLine: false, corners: false, bingo: true };
  const rules = payload.rules && typeof payload.rules === 'object' ? roomRulesFor(mode, payload.rules) : defaultRules;
  if (!Object.values(rules).some(Boolean)) throw new Error('Elegí al menos una jugada para la demostración.');
  const linePrizeCount = mode === 90 ? Math.max(1, Math.min(2, Math.floor(Number(payload.linePrizeCount) || 2))) : 1;
  const requestedAiNames = Array.isArray(payload.aiNames) ? [...new Set(payload.aiNames.map(name => String(name || '').trim()).filter(name => DEMO_AI_NAME_POOL.includes(name)))] : [];
  const aiNames = requestedAiNames.length === aiCount ? requestedAiNames : shuffle(DEMO_AI_NAME_POOL).slice(0, aiCount);
  const totalCards = playerCardCount + aiCount * 2;
  const pool = generateDiverseCardsServer(Math.max(25, totalCards + 8), mode, rules);
  const aiGroups = partitionDiverseCardGroups(pool, Array(aiCount).fill(2), mode);
  const cards = pool.map((card, index) => ({ ...card, number: String(index + 1).padStart(3, '0'), name: `Cartón ${index + 1}`, originalName: `Cartón ${index + 1}` }));
  const mappedAiGroups = aiGroups.map(group => group.map(card => cards[pool.indexOf(card)]));
  const game = {
    id: randomId('demo_game'), number: 1, mode, rules, drawMode: 'automatic', autoSeconds,
    presenter: PRESENTER_ID,
    theme: 'clasico', phase: 'READY', drawn: [], createdAt: nowIso(), updatedAt: nowIso(), cards
  };
  const assignments = [{ allowedCardCount: playerCardCount, cardIds: [] }];
  for (let index = 0; index < aiCount; index++) assignments.push({ allowedCardCount: 2, cardIds: mappedAiGroups[index].map(card => card.id) });
  const workspace = ensureWorkspace(`demo_${randomCode(10).toLowerCase()}`);
  const demoEntryId = randomId('demoentry');
  workspace.isDemo = true;
  workspace.expiresAt = Date.now() + DEMO_TTL_MS;
  workspace.lastActivityAt = Date.now();
  return workspaceContext.run(workspace, () => {
    configureRoom({
      game,
      players: assignments,
      roomSettings: {
        playerAudioAllowed: true,
        playerAudioDefault: payload.sound !== false,
        linePrizeCount,
        allowSamePlayerSecondLine: true,
        tiePolicy: 'first_claim',
        gameType: 'test',
        roomType: 'test',
        joinOpen: false,
        maxOpenPlayers: 4,
        maxCardsPerPlayer: demoMaxCards,
        markingMode,
        argentinaHint: true
      },
      assignmentTimer: { enabled: false, durationMinutes: 10 }
    });
    const human = state.players[0];
    human.name = '';
    human.nameSet = false;
    human.slotLabel = 'Vos';
    human.virtual = false;
    human.demoHuman = true;
    human.autoMark = false;
    human.markingModeChosen = markingMode === 'manual_only';
    human.selectionConfirmed = false;
    human.cardIds = [];
    human.marks = {};
    // La demo entra con una sesión temporal propia: nunca pide ni expone un código privado.
    human.sessionToken = randomId('demo_session');
    human.sessionDeviceId = '';
    human.lastLoginAt = nowIso();
    refreshOffersForPlayer(human, true);
    state.players.slice(1).forEach((player, index) => {
      player.name = aiNames[index];
      player.nameSet = true;
      player.virtual = true;
      player.autoMark = true;
      player.markingModeChosen = true;
      player.selectionConfirmed = true;
    });
    state.roomSettings.simulatedChat = true;
    state.chat.enabled = true;
    state.demo = {
      active: true,
      entryId: demoEntryId,
      label: 'DEMOSTRACIÓN — SIN VALIDEZ OFICIAL',
      createdAt: nowIso(),
      expiresAt: new Date(workspace.expiresAt).toISOString(),
      aiNames,
      aiCount,
      playerCardCount,
      cardsPerAi: 2,
      autoSeconds,
      mode,
      rules: { ...rules },
      linePrizeCount,
      markingMode,
      waitingGames: true,
      startFlow: {
        phase: 'tutorial',
        tutorialResolved: false,
        tutorialResolution: null,
        tutorialResolvedAt: null,
        countdownEndsAt: null,
        startRequestedAt: null,
        error: null
      }
    };
    syncAllAutoMarks();
    updateCardDisplayNames();
    const demoChatOpeners = ['Hola 👋', 'Suerte para todos 🍀', 'Vamos que empieza 😄'];
    state.players.filter(player => player.virtual).slice(0, 2).forEach((player, index) => {
      try { appendChatMessage({ role: 'player', player, text: demoChatOpeners[index % demoChatOpeners.length] }); } catch {}
    });
    logEvent('demo_created', { aiNames, aiCount, playerCardCount, cardsPerAi: 2, mode, autoSeconds, rules, linePrizeCount, markingMode, waitingRoom: true, simulatedChat: true, waitingGames: true });
    saveState();
    const response = {
      workspaceId: workspace.id,
      roomCode: state.roomCode,
      demoSessionToken: human.sessionToken,
      demoEntryId,
      expiresAt: new Date(workspace.expiresAt).toISOString(),
      playerUrl: `/demo/jugar/${demoEntryId}/partida?demo=1`,
      participants: [{ name: playerDisplayName(human), virtual: false, cardCount: human.cardIds.length }, ...state.players.slice(1).map(player => ({ name: player.name, virtual: true, cardCount: player.cardIds.length }))],
      mode,
      rules: { ...rules },
      linePrizeCount,
      markingMode,
      autoSeconds
    };
    if (TEST_MODE) response.testAdminToken = createAdminSession({ workspaceId: workspace.id, role: 'owner', hardExpiresAt: workspace.expiresAt });
    return response;
  });
}

function createAdminSimulationRoom(payload = {}) {
  const playerCount = Math.max(2, Math.min(MAX_PLAYERS, Math.floor(Number(payload.playerCount) || 20)));
  const mode = Number(payload.mode) === 75 ? 75 : 90;
  const rules = roomRulesFor(mode, payload.rules || {});
  const autoSeconds = Math.max(3, Math.min(60, Number(payload.autoSeconds) || 6));
  const presenter = PRESENTER_ID;
  const cardCounts = Array.from({ length: playerCount }, () => crypto.randomInt(1, MAX_CARDS_PER_PLAYER + 1));
  const totalCards = cardCounts.reduce((sum, count) => sum + count, 0);
  if (totalCards > MAX_ACTIVE_CARDS) throw new Error(`La simulación pidió ${totalCards} cartones y el máximo es ${MAX_ACTIVE_CARDS}.`);
  const cards = generateDiverseCardsServer(totalCards, mode, rules);
  let offset = 0;
  const assignments = cardCounts.map(count => {
    const cardIds = cards.slice(offset, offset + count).map(card => card.id);
    offset += count;
    return { allowedCardCount: count, cardIds };
  });
  const game = {
    id: randomId('simulation_game'), number: 1, mode, rules, drawMode: 'automatic', autoSeconds,
    presenter, theme: 'clasico', phase: 'READY', drawn: [], createdAt: nowIso(), updatedAt: nowIso(), cards
  };
  configureRoom({
    game,
    players: assignments,
    roomSettings: {
      playerAudioAllowed: false,
      playerAudioDefault: false,
      linePrizeCount: mode === 90 ? Math.max(1, Math.min(2, Number(payload.linePrizeCount) || 1)) : 1,
      allowSamePlayerSecondLine: true,
      tiePolicy: 'first_claim',
      gameType: 'test',
      roomType: 'official',
      joinOpen: false,
      maxOpenPlayers: 0,
      argentinaHint: true,
      presenterVoiceGender: 'female',
      transmission: normalizeTransmissionSettings({ showNames: true })
    },
    assignmentTimer: { enabled: false, durationMinutes: 10 }
  });
  state.roomSettings.adminSimulation = true;
  state.roomSettings.simulatedPlayers = playerCount;
  state.roomSettings.simulatedCards = totalCards;
  state.roomSettings.simulatedChat = Boolean(payload.aiChatEnabled);
  state.chat.enabled = Boolean(payload.aiChatEnabled);
  state.players.forEach((player, index) => {
    player.name = adminSimulationName(index);
    player.nameSet = true;
    player.slotLabel = `IA ${String(index + 1).padStart(2, '0')}`;
    player.virtual = true;
    player.autoMark = true;
    player.markingModeChosen = true;
    player.selectionConfirmed = true;
    player.sessionToken = null;
    player.sessionDeviceId = '';
  });
  syncAllAutoMarks();
  updateCardDisplayNames();
  logEvent('admin_simulation_created', { playerCount, totalCards, cardCounts, mode, autoSeconds, simulatedChat: state.roomSettings.simulatedChat });
  saveState();
  broadcast();
  return adminPayload();
}

function ensureChatState() {
  state.chat ||= { enabled: true, locked: false, messages: [], mutedPlayerIds: [], lastSentAt: {}, lastStickerAt: {}, stickerSentAt: {} };
  state.chat.messages ||= [];
  state.chat.mutedPlayerIds ||= [];
  state.chat.lastSentAt ||= {};
  state.chat.lastStickerAt ||= {};
  state.chat.stickerSentAt ||= {};
  return state.chat;
}

function chatControlPayload(player = null) {
  const chat = ensureChatState();
  return {
    enabled: chat.enabled !== false,
    locked: Boolean(chat.locked),
    muted: player ? chat.mutedPlayerIds.includes(player.id) : false,
    maxLength: CHAT_MAX_LENGTH,
    cooldownMs: CHAT_COOLDOWN_MS
  };
}

function emitChatEvent(event, data) {
  for (const client of [...sseClients]) {
    try { writeSse(client.res, event, data); }
    catch { sseClients.delete(client); }
  }
}

function appendChatMessage({ role, player = null, text = '', stickerId = '' }) {
  const chat = ensureChatState();
  const normalizedStickerId = String(stickerId || '').trim().toLowerCase();
  const isSticker = Boolean(normalizedStickerId);
  if (isSticker && !CHAT_STICKER_IDS.has(normalizedStickerId)) throw new Error('Sticker no válido.');
  const clean = isSticker ? '' : String(text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
  if (!isSticker && !clean) throw new Error('Escribí un mensaje.');
  if (chat.enabled === false) throw new Error('El chat está deshabilitado.');
  if (role === 'player') {
    if (chat.locked) throw new Error('El administrador pausó el chat.');
    if (chat.mutedPlayerIds.includes(player.id)) throw new Error('Tu participación en el chat está silenciada.');
    const now = Date.now();
    if (isSticker) {
      const lastSticker = Number(chat.lastStickerAt[player.id]) || 0;
      if (now - lastSticker < CHAT_STICKER_COOLDOWN_MS) throw new Error('Esperá un momento antes de enviar otro sticker.');
      const windowTimes = (Array.isArray(chat.stickerSentAt[player.id]) ? chat.stickerSentAt[player.id] : []).map(Number).filter(at => now - at < CHAT_STICKER_WINDOW_MS);
      if (windowTimes.length >= CHAT_STICKER_WINDOW_MAX) throw new Error('Esperá un momento antes de enviar otro sticker.');
      windowTimes.push(now);
      chat.stickerSentAt[player.id] = windowTimes;
      chat.lastStickerAt[player.id] = now;
    } else {
      const last = Number(chat.lastSentAt[player.id]) || 0;
      if (now - last < CHAT_COOLDOWN_MS) throw new Error('Esperá dos segundos antes de enviar otro mensaje.');
      chat.lastSentAt[player.id] = now;
    }
  }
  const message = {
    id: randomId('chat'),
    role,
    playerId: player?.id || null,
    name: role === 'admin' ? 'Administración' : playerDisplayName(player),
    type: isSticker ? 'sticker' : 'text',
    text: clean,
    stickerId: isSticker ? normalizedStickerId : null,
    createdAt: nowIso()
  };
  chat.messages.push(message);
  if (chat.messages.length > CHAT_MAX_MESSAGES) chat.messages.splice(0, chat.messages.length - CHAT_MAX_MESSAGES);
  logEvent('chat_message', { messageId: message.id, role, playerId: message.playerId, type: message.type, stickerId: message.stickerId, length: clean.length });
  emitChatEvent('chat', message);
  return message;
}

function moderateChat(payload) {
  const chat = ensureChatState();
  const action = String(payload?.action || 'toggle').toLowerCase();
  if (action === 'lock') chat.locked = true;
  else if (action === 'unlock') chat.locked = false;
  else if (action === 'disable') chat.enabled = false;
  else if (action === 'enable') chat.enabled = true;
  else if (action === 'clear') chat.messages = [];
  else if (action === 'delete') chat.messages = chat.messages.filter(message => message.id !== String(payload.messageId || ''));
  else if (action === 'mute') {
    const playerId = String(payload.playerId || '');
    if (playerId && !chat.mutedPlayerIds.includes(playerId)) chat.mutedPlayerIds.push(playerId);
    const messageId = String(payload.messageId || '');
    if (messageId) chat.messages = chat.messages.filter(message => message.id !== messageId);
  } else if (action === 'unmute') chat.mutedPlayerIds = chat.mutedPlayerIds.filter(id => id !== String(payload.playerId || ''));
  else throw new Error('Acción de moderación no válida.');
  logEvent('chat_moderated', { action, playerId: payload?.playerId || null, messageId: payload?.messageId || null });
  saveState(); emitChatEvent('chat-control', { ...chatControlPayload(), messages: chat.messages.slice(-CHAT_MAX_MESSAGES), mutedPlayerIds: chat.mutedPlayerIds });
  return adminPayload();
}

function cardSignature(card) {
  return cardNumbers(card).slice().sort((a, b) => a - b).join(',');
}

function cardWinningSignatures(card) {
  return lineDefinitions(card)
    .filter(line => line.values.length)
    .map(line => line.values.slice().sort((a, b) => a - b).join(','));
}

function sharedCardNumbers(left, right) {
  const rightNumbers = new Set(cardNumbers(right));
  return cardNumbers(left).reduce((count, number) => count + (rightNumbers.has(number) ? 1 : 0), 0);
}

function validateCardStructure(card, expectedMode) {
  const mode = Number(expectedMode) === 75 ? 75 : 90;
  const label = card?.number || card?.id || 'sin número';
  if (!card || !Array.isArray(card.grid)) throw new Error(`El cartón ${label} no tiene una cuadrícula válida.`);
  const values = cardNumbers(card);
  if (new Set(values).size !== values.length) throw new Error(`El cartón ${label} contiene números repetidos.`);
  if (mode === 90) {
    if (card.grid.length !== 3 || card.grid.some(row => !Array.isArray(row) || row.length !== 9)) throw new Error(`El cartón ${label} debe tener una cuadrícula de 3 × 9.`);
    if (values.length !== 15) throw new Error(`El cartón ${label} debe contener exactamente 15 números.`);
    for (let row = 0; row < 3; row++) {
      if (card.grid[row].filter(Number.isFinite).length !== 5) throw new Error(`La fila ${row + 1} del cartón ${label} debe contener 5 números.`);
    }
    for (let col = 0; col < 9; col++) {
      const column = card.grid.map(row => row[col]).filter(Number.isFinite);
      if (column.length < 1 || column.length > 2) throw new Error(`La columna ${col + 1} del cartón ${label} debe contener 1 o 2 números.`);
      const [minimum, maximum] = CARD90_RANGES[col];
      if (column.some(number => number < minimum || number > maximum)) throw new Error(`El cartón ${label} tiene un número fuera de rango en la columna ${col + 1}.`);
      if (column.some((number, index) => index > 0 && number <= column[index - 1])) throw new Error(`La columna ${col + 1} del cartón ${label} no está ordenada.`);
    }
  } else {
    if (card.grid.length !== 5 || card.grid.some(row => !Array.isArray(row) || row.length !== 5)) throw new Error(`El cartón ${label} debe tener una cuadrícula de 5 × 5.`);
    if (values.length !== 24) throw new Error(`El cartón ${label} debe contener exactamente 24 números y una casilla LIBRE.`);
    if (card.grid?.[2]?.[2] !== 'LIBRE') throw new Error(`El cartón ${label} debe tener LIBRE en el centro.`);
    const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
    for (let col = 0; col < 5; col++) {
      const column = card.grid.map(row => row[col]).filter(Number.isFinite);
      const expected = col === 2 ? 4 : 5;
      if (column.length !== expected) throw new Error(`La columna ${'BINGO'[col]} del cartón ${label} debe contener ${expected} números.`);
      if (column.some(number => number < ranges[col][0] || number > ranges[col][1])) throw new Error(`El cartón ${label} tiene un número fuera de rango en la columna ${'BINGO'[col]}.`);
      if (column.some((number, index) => index > 0 && number <= column[index - 1])) throw new Error(`La columna ${'BINGO'[col]} del cartón ${label} no está ordenada.`);
    }
  }
}

function validateCardDiversity(cards, mode) {
  const maxShared = Number(mode) === 75 ? 12 : 6;
  const signatures = new Map();
  const winning = new Map();
  for (const card of cards) {
    const signature = cardSignature(card);
    if (signatures.has(signature)) throw new Error(`Los cartones ${signatures.get(signature)} y ${card.number} contienen exactamente los mismos números.`);
    signatures.set(signature, card.number);
    for (const lineSignature of cardWinningSignatures(card)) {
      if (winning.has(lineSignature)) throw new Error(`Los cartones ${winning.get(lineSignature)} y ${card.number} comparten una línea ganadora idéntica.`);
      winning.set(lineSignature, card.number);
    }
  }
  for (let left = 0; left < cards.length; left++) {
    for (let right = left + 1; right < cards.length; right++) {
      const shared = sharedCardNumbers(cards[left], cards[right]);
      if (shared > maxShared) throw new Error(`Los cartones ${cards[left].number} y ${cards[right].number} son demasiado parecidos: comparten ${shared} números; el máximo permitido es ${maxShared}.`);
    }
  }
}

function assertCardGroupDiversity(cards, mode, label = 'La selección') {
  if (cards.length < 2) return;
  const maxShared = Number(mode) === 75 ? 12 : 6;
  for (let left = 0; left < cards.length; left++) {
    for (let right = left + 1; right < cards.length; right++) {
      const shared = sharedCardNumbers(cards[left], cards[right]);
      if (shared > maxShared) throw new Error(`${label}: los cartones ${cards[left].number} y ${cards[right].number} son demasiado parecidos; comparten ${shared} números y el máximo es ${maxShared}.`);
      const lines = new Set(cardWinningSignatures(cards[left]));
      if (cardWinningSignatures(cards[right]).some(signature => lines.has(signature))) throw new Error(`${label}: los cartones ${cards[left].number} y ${cards[right].number} comparten una línea ganadora.`);
    }
  }
}

function assertPlayerCardDiversity(cardIds) {
  if (!state.game || cardIds.length < 2) return;
  const cards = cardIds.map(cardId => state.game.cards.find(card => card.id === cardId)).filter(Boolean);
  assertCardGroupDiversity(cards, state.game.mode, 'Tu selección');
}

function diverseCardSelection(poolIds, count, preferredIds = []) {
  const pool = [...new Set(poolIds.map(String))];
  const chosen = [];
  for (const preferred of preferredIds) {
    if (!pool.includes(preferred)) continue;
    try { assertPlayerCardDiversity([...chosen, preferred]); chosen.push(preferred); } catch {}
    if (chosen.length >= count) return chosen;
  }
  for (const cardId of shuffle(pool.filter(id => !chosen.includes(id)))) {
    try { assertPlayerCardDiversity([...chosen, cardId]); chosen.push(cardId); } catch { continue; }
    if (chosen.length >= count) return chosen;
  }
  return chosen;
}

function activePlayerCount() {
  return state.players.filter(player => player.selectionConfirmed).length;
}

function activeCardCount() {
  return state.players.reduce((sum, player) => sum + (player.selectionConfirmed ? player.cardIds.length : 0), 0);
}

function autoMarkRequired() {
  // ALFA: Manual y Automarcado son una elección del jugador en modo Normal.
  // Conservamos los límites históricos solo como métricas de compatibilidad.
  return false;
}

function markingPolicyPayload() {
  const manualOnly = state.roomSettings?.markingMode === 'manual_only';
  return {
    automaticRequired: false,
    manualAllowed: true,
    automaticAllowed: !manualOnly,
    manualOnly,
    playerLimit: MANUAL_MARK_MAX_PLAYERS,
    cardLimit: manualOnly ? 2 : MANUAL_MARK_MAX_CARDS,
    activePlayers: activePlayerCount(),
    activeCards: activeCardCount(),
    reason: manualOnly ? 'Partida SOLO MANUAL: máximo 2 cartones. Automarcado está deshabilitado.' : 'Elegí Manual o Automarcado antes de la primera bolilla. Podés cambiar durante la partida.'
  };
}

function enforceAutoMarkPolicy() {
  return false;
}

function createSecureDrawOrder(mode, drawn = []) {
  const prefix = uniqueNumbers(drawn).filter(number => number >= 1 && number <= mode);
  const used = new Set(prefix);
  return [...prefix, ...shuffle(Array.from({ length: mode }, (_, index) => index + 1).filter(number => !used.has(number)))];
}

function validateGame(game) {
  if (!game || !Array.isArray(game.cards)) throw new Error('No hay un juego válido para publicar.');
  if (game.cards.length < MIN_CARDS || game.cards.length > MAX_CARDS) throw new Error(`La sala online admite entre ${MIN_CARDS} y ${MAX_CARDS} cartones.`);
  const mode = Number(game.mode) === 75 ? 75 : 90;
  const ids = new Set();
  const numbers = new Set();
  for (const card of game.cards) {
    if (!card.id || ids.has(String(card.id))) throw new Error('Hay cartones sin identificador o repetidos.');
    ids.add(String(card.id));
    const cardNumber = String(card.number || '').trim();
    if (!cardNumber || numbers.has(cardNumber.toLocaleLowerCase('es'))) throw new Error('Hay cartones sin número o con numeración repetida.');
    numbers.add(cardNumber.toLocaleLowerCase('es'));
    validateCardStructure(card, mode);
  }
  validateCardDiversity(game.cards, mode);
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
    presenter: PRESENTER_ID,
    theme: game.theme || 'clasico',
    phase: game.phase || 'READY',
    drawn: uniqueNumbers(game.drawn).filter(n => n >= 1 && n <= mode),
    drawTimestamps: game.drawTimestamps && typeof game.drawTimestamps === 'object' ? Object.fromEntries(Object.entries(game.drawTimestamps).filter(([key, value]) => Number(key) >= 1 && Number(key) <= mode && !Number.isNaN(new Date(value).getTime()))) : {},
    lastDrawnAt: game.lastDrawnAt && !Number.isNaN(new Date(game.lastDrawnAt).getTime()) ? game.lastDrawnAt : null,
    prizes: game.prizes ? deepCopy(game.prizes) : undefined,
    createdAt: game.createdAt || nowIso(),
    updatedAt: game.updatedAt || nowIso(),
    integrity: game.integrity && typeof game.integrity === 'object' ? deepCopy(game.integrity) : undefined,
    cards: game.cards.map(card => ({
      id: String(card.id),
      number: String(card.number),
      name: String(card.name || 'Jugador'),
      originalName: String(card.originalName || card.name || `Cartón ${card.number}`),
      mode,
      source: card.source || 'generated',
      eventCode: safeEventCode(card.eventCode || ''),
      eventLotCode: safeEventLotCode(card.eventLotCode || ''),
      eventCardNumber: Number(card.eventCardNumber) || null,
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
    assertCardGroupDiversity(cardIds.map(cardId => game.cards.find(card => String(card.id) === cardId)).filter(Boolean), game.mode, slotLabel);
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
    do { code = freshNumericPlayerCode(); } while (assignedCodes.has(code));
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
      personalPresenter: PRESENTER_ID,
      code: nextPlayerCode(),
      directAccessToken: null,
      recoveryExpiresAt: null,
      allowedCardCount,
      cardIds,
      selectionConfirmed: cardIds.length > 0,
      offeredCardIds: [],
      reservedCardIds: [],
      sessionToken: null,
      sessionDeviceId: '',
      marks: Object.fromEntries(cardIds.map(cardId => [cardId, []])),
      autoMark: false,
      markingModeChosen: false,
      notices: []
    };
  });
  const sanitizedGame = sanitizeGame(payload.game);
  sanitizedGame.drawn = [];
  sanitizedGame.phase = 'READY';
  const requestedTimerMinutes = Math.max(MIN_ASSIGNMENT_MINUTES, Math.min(MAX_ASSIGNMENT_MINUTES, Number(payload.assignmentTimer?.durationMinutes) || 10));
  replaceCurrentState({
    version: 202602,
    revision: 0,
    active: true,
    status: 'waiting',
    roomCode: uniqueRoomCode(5),
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
      claimMode: payload.roomSettings?.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual',
      tiePolicy: payload.roomSettings?.claimMode === 'automatic_ties' ? 'same_ball' : (payload.roomSettings?.tiePolicy === 'same_ball' ? 'same_ball' : 'first_claim'),
      gameType: payload.roomSettings?.gameType === 'test' ? 'test' : 'real',
      whatsapp: String(payload.roomSettings?.whatsapp || '').slice(0, 40),
      argentinaHint: payload.roomSettings?.argentinaHint !== false,
      broadcastToken: randomId('live'),
      broadcastAlias: freshBroadcastAlias(currentWorkspace().id),
      roomType: payload.roomSettings?.roomType === 'test' ? 'test' : 'official',
      joinOpen: Boolean(payload.roomSettings?.joinOpen),
      maxOpenPlayers: Math.max(2, Math.min(10, Number(payload.roomSettings?.maxOpenPlayers) || 10)),
      presenterVoiceGender: 'female',
      transmission: normalizeTransmissionSettings(payload.roomSettings?.transmission)
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
    drawOrder: createSecureDrawOrder(sanitizedGame.mode),
    claimSequence: 0,
    claimWindow: null,
    testDrawOrderFixed: false,
    chat: { enabled: true, locked: false, messages: [], mutedPlayerIds: [], lastSentAt: {} },
    demo: currentWorkspace().isDemo ? { active: true, label: 'DEMOSTRACIÓN — SIN VALIDEZ OFICIAL', createdAt: nowIso() } : null,
    waitingGame: { type: 'both', leaderboard: [], leaderboards: { red_black: [], higher_lower: [] } },
    game: sanitizedGame,
    players,
    cardReservations: {},
    claims: [],
    eventLog: []
  });
  updateCardDisplayNames();
  refreshAllOffers();
  enforceAutoMarkPolicy();
  logEvent('room_opened', { roomCode: state.roomCode, players: players.length, cards: payload.game.cards.length, status: 'waiting' });
  saveState();
  broadcast();
  return adminPayload();
}

function updateGame(game) {
  if (!state.active) throw new Error('No hay una sala online abierta.');
  if (state.status !== 'waiting') throw new Error('La configuración, los cartones y las bolillas quedaron bloqueados al iniciar el sorteo.');
  validateGame(game);
  const sanitized = sanitizeGame(game);
  if (state.game?.id !== sanitized.id) throw new Error('La sala pertenece a otra partida. Cerrala y volvé a abrirla.');
  if (sanitized.drawn.length) throw new Error('Las bolillas solo pueden ser extraídas por el servidor.');
  state.game = sanitized;
  state.game.drawn = [];
  state.game.phase = 'READY';
  state.drawOrder = createSecureDrawOrder(state.game.mode);
  state.claims = [];
  state.claimSequence = 0;
  state.claimWindow = null;
  for (const player of state.players) {
    player.cardIds = (player.cardIds || []).filter(cardId => state.game.cards.some(card => card.id === cardId));
    player.selectionConfirmed = player.cardIds.length > 0;
    player.marks = Object.fromEntries(player.cardIds.map(cardId => [cardId, []]));
  }
  enforceAutoMarkPolicy();
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('waiting_game_updated', { cards: state.game.cards.length, mode: state.game.mode });
  saveState();
  broadcast();
  return adminPayload();
}

const automaticDrawTimers = new Map();

function clearAutomaticDrawTimer(workspace = currentWorkspace()) {
  const timer = automaticDrawTimers.get(workspace.id);
  if (timer) clearTimeout(timer);
  automaticDrawTimers.delete(workspace.id);
}

function scheduleAutomaticDraw() {
  const workspace = currentWorkspace();
  clearAutomaticDrawTimer(workspace);
  if (!state.active || state.status !== 'playing' || state.game?.drawMode !== 'automatic') return;
  if ((state.game?.drawn?.length || 0) >= Number(state.game?.mode || 0)) return;
  const minimumSeconds = currentWorkspace().isDemo ? 2 : 3;
  const delay = Math.max(minimumSeconds, Math.min(60, Number(state.game.autoSeconds) || 6)) * 1000;
  const timer = setTimeout(() => workspaceContext.run(workspace, () => {
    try { drawNextBall('automatic'); }
    catch (error) { console.error(`No se pudo extraer una bolilla automática en ${workspace.id}:`, error.message); }
  }), delay);
  automaticDrawTimers.set(workspace.id, timer);
}

const demoAutomationTimers = new Map();

function rememberDemoTimer(workspace, timer) {
  const timers = demoAutomationTimers.get(workspace.id) || new Set();
  timers.add(timer);
  demoAutomationTimers.set(workspace.id, timers);
  return timer;
}

function forgetDemoTimer(workspace, timer) {
  const timers = demoAutomationTimers.get(workspace.id);
  if (!timers) return;
  timers.delete(timer);
  if (!timers.size) demoAutomationTimers.delete(workspace.id);
}

function clearDemoAutomationTimers(workspace = currentWorkspace()) {
  const timers = demoAutomationTimers.get(workspace.id);
  if (timers) for (const timer of timers) clearTimeout(timer);
  demoAutomationTimers.delete(workspace.id);
}


const demoStartTimers = new Map();

function defaultDemoStartFlow() {
  return {
    phase: 'tutorial',
    tutorialResolved: false,
    tutorialResolution: null,
    tutorialResolvedAt: null,
    countdownEndsAt: null,
    startRequestedAt: null,
    error: null
  };
}

function ensureDemoStartFlow() {
  if (!state.demo || typeof state.demo !== 'object') return null;
  state.demo.startFlow = { ...defaultDemoStartFlow(), ...(state.demo.startFlow || {}) };
  return state.demo.startFlow;
}

function clearDemoStartTimer(workspace = currentWorkspace()) {
  const timer = demoStartTimers.get(workspace.id);
  if (timer) clearTimeout(timer);
  demoStartTimers.delete(workspace.id);
}

function demoHumanPlayer() {
  return state.players.find(item => item.demoHuman && !item.virtual) || null;
}

function demoHumanReady(player = demoHumanPlayer()) {
  return Boolean(player?.nameSet && player?.selectionConfirmed && (player.cardIds || []).length > 0);
}

function demoStartFlowPayload() {
  if (!currentWorkspace().isDemo || !state.demo) return null;
  const flow = ensureDemoStartFlow();
  let phase = flow.phase;
  if (state.status === 'starting') phase = 'starting';
  else if (state.status === 'playing') phase = 'playing';
  else if (['verifying','paused','resuming','finalizing','finished'].includes(state.status)) phase = state.status;
  return {
    phase,
    tutorialResolved: Boolean(flow.tutorialResolved),
    tutorialResolution: flow.tutorialResolution || null,
    tutorialResolvedAt: flow.tutorialResolvedAt || null,
    countdownEndsAt: flow.countdownEndsAt || null,
    startRequestedAt: flow.startRequestedAt || null,
    error: flow.error || null
  };
}

function cancelDemoStartFlow(reason = 'cancelled', { keepTutorial = true } = {}) {
  if (!currentWorkspace().isDemo || !state.demo) return;
  clearDemoStartTimer();
  const flow = ensureDemoStartFlow();
  if (!keepTutorial) {
    flow.tutorialResolved = false;
    flow.tutorialResolution = null;
    flow.tutorialResolvedAt = null;
  }
  flow.phase = flow.tutorialResolved ? 'ready' : 'tutorial';
  flow.countdownEndsAt = null;
  flow.startRequestedAt = null;
  flow.error = null;
  flow.cancelReason = reason;
}

function completeDemoStartCountdown(workspace = currentWorkspace()) {
  if (!workspace?.isDemo) return;
  return workspaceContext.run(workspace, () => {
    clearDemoStartTimer(workspace);
    if (!state.demo || state.status !== 'waiting') return;
    const flow = ensureDemoStartFlow();
    const player = demoHumanPlayer();
    if (!flow.tutorialResolved || !demoHumanReady(player)) {
      flow.phase = flow.tutorialResolved ? 'ready' : 'tutorial';
      flow.countdownEndsAt = null;
      saveState();
      broadcast();
      return;
    }
    const endMs = new Date(flow.countdownEndsAt || 0).getTime();
    if (Number.isFinite(endMs) && endMs > Date.now() + 25) {
      scheduleDemoStartCountdown(workspace);
      return;
    }
    flow.phase = 'starting';
    flow.countdownEndsAt = null;
    flow.startRequestedAt = nowIso();
    flow.error = null;
    saveState();
    broadcast();
    try {
      startRoom();
      logEvent('demo_server_start_requested', { playerId: player.id, tutorialResolution: flow.tutorialResolution || null });
      saveState();
    } catch (error) {
      flow.phase = 'error';
      flow.error = String(error?.message || 'No se pudo iniciar la demostración.').slice(0, 220);
      logEvent('demo_server_start_failed', { playerId: player?.id || null, error: flow.error });
      saveState();
      broadcast();
    }
  });
}

function scheduleDemoStartCountdown(workspace = currentWorkspace()) {
  clearDemoStartTimer(workspace);
  if (!workspace?.isDemo || !state.demo || state.status !== 'waiting') return;
  const flow = ensureDemoStartFlow();
  if (flow.phase !== 'countdown' || !flow.countdownEndsAt) return;
  const endMs = new Date(flow.countdownEndsAt).getTime();
  if (!Number.isFinite(endMs)) return;
  const delay = Math.max(0, endMs - Date.now());
  const timer = setTimeout(() => completeDemoStartCountdown(workspace), delay + 15);
  demoStartTimers.set(workspace.id, timer);
}

function resolveDemoTutorial(player, payload = {}) {
  if (!currentWorkspace().isDemo || !player?.demoHuman) throw new Error('Esta acción solo está disponible en la demostración.');
  if (state.status !== 'waiting') return playerPayload(player);
  const flow = ensureDemoStartFlow();
  flow.tutorialResolved = true;
  flow.tutorialResolution = payload?.skipped ? 'skipped' : 'complete';
  flow.tutorialResolvedAt = nowIso();
  flow.error = null;
  if (!demoHumanReady(player)) {
    flow.phase = 'ready';
    flow.countdownEndsAt = null;
  } else {
    flow.phase = 'countdown';
    flow.countdownEndsAt = new Date(Date.now() + DEMO_READY_COUNTDOWN_MS).toISOString();
  }
  logEvent('demo_tutorial_resolved', { playerId: player.id, resolution: flow.tutorialResolution, countdownEndsAt: flow.countdownEndsAt });
  saveState();
  broadcast();
  if (flow.phase === 'countdown') scheduleDemoStartCountdown();
  return playerPayload(player);
}

function retryDemoServerStart(player) {
  if (!currentWorkspace().isDemo || !player?.demoHuman) throw new Error('Esta acción solo está disponible en la demostración.');
  if (state.status !== 'waiting') return playerPayload(player);
  const flow = ensureDemoStartFlow();
  if (!flow.tutorialResolved) throw new Error('Primero terminá o saltá el tutorial.');
  if (!demoHumanReady(player)) throw new Error('Primero confirmá tu nombre y tus cartones.');
  flow.phase = 'countdown';
  flow.error = null;
  flow.countdownEndsAt = new Date(Date.now() + DEMO_READY_COUNTDOWN_MS).toISOString();
  saveState();
  broadcast();
  scheduleDemoStartCountdown();
  return playerPayload(player);
}

function demoPrizeTypes() {
  return Number(state.game?.mode) === 75
    ? ['corners', 'line', 'doubleLine', 'tripleLine', 'bingo']
    : ['ambo', 'line', 'bingo'];
}

function virtualClaimDelay() {
  if (TEST_MODE) return 30 + crypto.randomInt(0, 30);
  return 650 + crypto.randomInt(0, 900);
}

function virtualPlayersAreActive() {
  return Boolean(currentWorkspace().isDemo || state.roomSettings?.adminSimulation);
}

const SIMULATED_CHAT_TEXTS = [
  '🍀🍀🍀', 'Vamos 😄', 'Me falta poquito 🤞', 'Qué nervios 😅', '🎱✨', 'Dale dale 🔥',
  'Casi casi 👀', '👏👏👏', 'Suerte para todos 🍀', 'Nooo 😭', 'Vamos que sale 🎉', '😂😂',
  'Tengo fe 🤞', 'Qué buena partida 😎', '❤️', '🔥🔥', 'Me falta una 😬', 'A ver esa bolilla 👀'
];
const SIMULATED_CHAT_STICKERS = ['gorda-risa','gorda-festejo','gorda-ay-no','corazon','aplausos','suerte','ira','explosion'];

function scheduleSimulatedAiChat() {
  if (!(currentWorkspace().isDemo || state.roomSettings?.adminSimulation) || !state.roomSettings?.simulatedChat || state.chat?.enabled === false || state.chat?.locked) return 0;
  const workspace = currentWorkspace();
  if (currentWorkspace().isDemo && !TEST_MODE) {
    const now = Date.now();
    if (workspace.lastDemoChatAt && now - workspace.lastDemoChatAt < 9000) return 0;
    if (crypto.randomInt(0, 100) >= 18) return 0;
    workspace.lastDemoChatAt = now;
  }
  const connected = connectedPlayerIds();
  const players = state.players.filter(player => player.virtual && !connected.has(player.id));
  if (!players.length) return 0;
  const maxBurst = currentWorkspace().isDemo ? 1 : Math.min(4, Math.max(1, Math.ceil(players.length / 20)));
  const messageCount = 1 + crypto.randomInt(0, maxBurst);
  const chosen = [];
  const pool = [...players];
  while (chosen.length < messageCount && pool.length) chosen.push(pool.splice(crypto.randomInt(0, pool.length), 1)[0]);
  chosen.forEach((player, index) => {
    const delay = TEST_MODE ? 20 + index * 15 : 280 + crypto.randomInt(0, 1900) + index * 160;
    const timer = setTimeout(() => workspaceContext.run(workspace, () => {
      forgetDemoTimer(workspace, timer);
      try {
        if (!state.active || !(currentWorkspace().isDemo || state.roomSettings?.adminSimulation) || !state.roomSettings?.simulatedChat || state.chat?.enabled === false || state.chat?.locked) return;
        if (crypto.randomInt(0, 100) < 24) {
          const stickerId = SIMULATED_CHAT_STICKERS[crypto.randomInt(0, SIMULATED_CHAT_STICKERS.length)];
          appendChatMessage({ role: 'player', player, stickerId });
        } else {
          const text = SIMULATED_CHAT_TEXTS[crypto.randomInt(0, SIMULATED_CHAT_TEXTS.length)];
          appendChatMessage({ role: 'player', player, text });
        }
        saveState();
      } catch (error) {
        if (!/Esperá|pausó|silenciada|deshabilitado/i.test(error.message)) console.error(`No se pudo generar chat IA en ${workspace.id}:`, error.message);
      }
    }), delay);
    rememberDemoTimer(workspace, timer);
  });
  return chosen.length;
}

function scheduleVirtualPlayerClaims() {
  if (automaticTieClaimsEnabled()) return 0;
  if (!virtualPlayersAreActive() || state.status !== 'playing') return 0;
  const drawnCount = state.game.drawn.length;
  let candidates = [];
  let selectedType = null;
  for (const type of demoPrizeTypes()) {
    if (!isPrizeEnabled(type) || prizeStatusPayload()[type]?.closed) continue;
    const typeCandidates = [];
    for (const player of state.players) {
      if (!player.virtual || connectedPlayerIds().has(player.id)) continue;
      const card = (player.cardIds || [])
        .map(cardId => state.game.cards.find(item => item.id === cardId))
        .find(candidate => {
          if (!candidate || state.claims.some(claim => claim.cardId === candidate.id && claim.type === type && ['pending', 'confirmed'].includes(claim.status))) return false;
          const analysis = analyzeCard(candidate, state.game.drawn, player.marks?.[candidate.id] || []);
          return Boolean({ ambo: analysis.hasAmbo, line: analysis.hasLine, doubleLine: analysis.hasDoubleLine, tripleLine: analysis.hasTripleLine, corners: analysis.hasCorners, bingo: analysis.hasBingo }[type]);
        });
      if (card) typeCandidates.push({ player, card });
    }
    if (typeCandidates.length) { selectedType = type; candidates = typeCandidates; break; }
  }
  if (!selectedType) return 0;
  const workspace = currentWorkspace();
  for (const { player, card } of candidates) {
    const timer = setTimeout(() => workspaceContext.run(workspace, () => {
      forgetDemoTimer(workspace, timer);
      try {
        if (!virtualPlayersAreActive() || !state.active || !['playing', 'verifying'].includes(state.status) || state.game.drawn.length !== drawnCount) return;
        const window = state.claimWindow;
        if (state.status === 'verifying' && (!window || Number(window.drawnCount) !== drawnCount || Date.now() > Number(window.expiresAtMs || 0))) return;
        if (state.claims.some(claim => claim.cardId === card.id && claim.type === selectedType && ['pending', 'confirmed'].includes(claim.status))) return;
        const analysis = analyzeCard(card, state.game.drawn, player.marks?.[card.id] || []);
        const stillValid = Boolean({ ambo: analysis.hasAmbo, line: analysis.hasLine, doubleLine: analysis.hasDoubleLine, tripleLine: analysis.hasTripleLine, corners: analysis.hasCorners, bingo: analysis.hasBingo }[selectedType]);
        if (stillValid) createClaim(player, { cardId: card.id, type: selectedType, simulated: true });
      } catch (error) {
        console.error(`No se pudo registrar el reclamo de IA en ${workspace.id}:`, error.message);
      }
    }), virtualClaimDelay());
    rememberDemoTimer(workspace, timer);
  }
  return candidates.length;
}

function scheduleDemoResume() {
  if (!currentWorkspace().isDemo || state.status !== 'paused' || state.game?.phase !== 'PAUSED') return;
  const workspace = currentWorkspace();
  const timer = setTimeout(() => workspaceContext.run(workspace, () => {
    forgetDemoTimer(workspace, timer);
    try {
      if (workspace.isDemo && state.active && state.status === 'paused' && state.game && !prizeStatusPayload().bingo.closed) resumeRoom({ mode: 'automatic' });
    } catch (error) {
      console.error(`No se pudo reanudar la demostración ${workspace.id}:`, error.message);
    }
  }), 900);
  rememberDemoTimer(workspace, timer);
}

function autoResolveDemoClaimWindow(windowId) {
  if (!currentWorkspace().isDemo || !windowId || state.claimWindow?.id !== windowId) return;
  try {
    while (true) {
      const pending = state.claims
        .filter(claim => claim.claimWindowId === windowId && claim.status === 'pending')
        .sort((a, b) => Number(a.receivedSequence || 0) - Number(b.receivedSequence || 0));
      if (!pending.length) break;
      const next = pending[0];
      resolveClaim({ claimId: next.id, resolution: next.officialValid ? 'confirmed' : 'rejected', note: next.officialValid ? 'Validación automática de demostración.' : 'Reclamo inválido en la demostración.' });
    }
  } catch (error) {
    console.error(`No se pudo resolver automáticamente la demostración:`, error.message);
  }
  if (state.status === 'paused') scheduleDemoResume();
}

function scheduleDemoClaimResolution(windowId) {
  if (!currentWorkspace().isDemo || !windowId) return;
  const workspace = currentWorkspace();
  const key = `claim:${windowId}`;
  workspace.demoScheduled ||= new Set();
  if (workspace.demoScheduled.has(key)) return;
  workspace.demoScheduled.add(key);
  const delay = Math.max(20, Number(state.claimWindow?.expiresAtMs || Date.now()) - Date.now() + 35);
  const timer = setTimeout(() => workspaceContext.run(workspace, () => {
    forgetDemoTimer(workspace, timer);
    workspace.demoScheduled?.delete(key);
    autoResolveDemoClaimWindow(windowId);
  }), delay);
  rememberDemoTimer(workspace, timer);
}

function drawNextBall(source = 'manual') {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status !== 'playing') throw new Error('La partida no está habilitada para extraer una bolilla.');
  if (state.claims.some(claim => claim.status === 'pending')) throw new Error('Hay reclamos pendientes de resolución.');
  clearAutomaticDrawTimer();
  if (!Array.isArray(state.drawOrder) || state.drawOrder.length !== state.game.mode || state.drawOrder.some((number, index, all) => all.indexOf(number) !== index)) {
    state.drawOrder = createSecureDrawOrder(state.game.mode, state.game.drawn);
    logEvent('draw_order_recovered', { drawn: state.game.drawn.length });
  }
  const number = state.drawOrder[state.game.drawn.length];
  if (!Number.isFinite(number)) throw new Error('Ya no quedan bolillas por extraer.');
  state.game.drawn.push(number);
  state.game.drawTimestamps ||= {};
  state.game.lastDrawnAt = nowIso();
  state.game.drawTimestamps[String(number)] = state.game.lastDrawnAt;
  state.game.phase = state.game.drawMode === 'automatic' ? 'DRAWING' : 'READY';
  logEvent('ball_drawn', { number, position: state.game.drawn.length, source, drawRevision: Number(state.revision) + 1 });
  syncAllAutoMarks();
  const automaticAwards = processAutomaticClaimsForCurrentBall();
  if (!automaticAwards.length) scheduleVirtualPlayerClaims();
  scheduleSimulatedAiChat();
  if (state.game.drawn.length >= state.game.mode && state.status === 'playing') {
    const graceMs = currentWorkspace().isDemo
      ? Math.max(CLAIM_QUEUE_WINDOW_MS, DEMO_CLAIM_WINDOW_MS + 600)
      : FINAL_CLAIM_GRACE_MS;
    const startedAt = nowIso();
    state.status = 'playing';
    state.pauseReason = null;
    state.game.phase = 'FINAL_CLAIM_WINDOW';
    state.transition = {
      id: randomId('transition'), type: 'last-ball-claim-window', startedAt,
      endsAt: new Date(Date.now() + graceMs).toISOString()
    };
    logEvent('final_claim_window_opened', { round: state.round, balls: state.game.drawn.length, graceMs });
  }
  saveState();
  broadcast();
  if (state.status === 'finalizing' && state.transition?.type === 'final-balls') scheduleTransition();
  else if (state.transition?.type === 'last-ball-claim-window') scheduleTransition();
  else if (state.status === 'paused' && state.pauseReason === 'claim' && automaticTieClaimsEnabled()) scheduleClaimAutoResume();
  else if (state.status === 'playing') scheduleAutomaticDraw();
  return adminPayload();
}

function setTestDrawOrder(payload = {}) {
  if (!TEST_MODE) throw new Error('Esta función solo está disponible durante pruebas automáticas.');
  const demoBeforeFirstBall = currentWorkspace().isDemo && state.status === 'starting' && !(state.game?.drawn || []).length;
  if (!state.active || !state.game || (state.status !== 'waiting' && !demoBeforeFirstBall)) throw new Error('El orden de prueba solo puede fijarse antes de la primera bolilla.');
  const prefix = uniqueNumbers(payload.sequence || []).filter(number => number >= 1 && number <= state.game.mode);
  state.drawOrder = createSecureDrawOrder(state.game.mode, prefix);
  state.testDrawOrderFixed = true;
  logEvent('test_draw_order_set', { prefix });
  saveState();
  return adminPayload();
}

function updateDrawSettings(payload = {}) {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  const minimumSeconds = currentWorkspace().isDemo ? 2 : 3;
  const nextSeconds = Math.max(minimumSeconds, Math.min(60, Number(payload.autoSeconds ?? state.game.autoSeconds) || 6));
  state.game.autoSeconds = nextSeconds;
  if (state.status === 'waiting' && ['manual', 'automatic'].includes(payload.drawMode)) state.game.drawMode = payload.drawMode;
  logEvent('draw_settings_updated', { drawMode: state.game.drawMode, autoSeconds: state.game.autoSeconds });
  saveState();
  broadcast();
  if (state.status === 'playing') scheduleAutomaticDraw();
  return adminPayload();
}

const claimAutoResumeTimers = new Map();

function claimAutoResumePayload() {
  const workspace = currentWorkspace();
  const resumesAtMs = Number(workspace.claimAutoResumeAtMs) || 0;
  if (!resumesAtMs || state.status !== 'paused' || state.pauseReason !== 'claim') return null;
  return {
    active: true,
    resumesAt: new Date(resumesAtMs).toISOString(),
    remainingMs: Math.max(0, resumesAtMs - Date.now()),
    mode: workspace.claimAutoResumeMode || state.game?.drawMode || 'automatic'
  };
}

function clearClaimAutoResume(workspace = currentWorkspace(), reason = '') {
  const timer = claimAutoResumeTimers.get(workspace.id);
  if (timer) clearTimeout(timer);
  claimAutoResumeTimers.delete(workspace.id);
  const hadSchedule = Boolean(workspace.claimAutoResumeAtMs);
  workspace.claimAutoResumeAtMs = 0;
  workspace.claimAutoResumeMode = null;
  if (hadSchedule && reason) logEvent('claim_auto_resume_cancelled', { reason });
}

function scheduleClaimAutoResume() {
  const workspace = currentWorkspace();
  clearClaimAutoResume(workspace);
  if (workspace.isDemo || !state.active || !state.game || state.status !== 'paused' || state.pauseReason !== 'claim') return;
  if (state.claims.some(claim => claim.status === 'pending') || prizeStatusPayload().bingo.closed || state.game.drawn.length >= state.game.mode) return;
  const mode = state.game.drawMode === 'manual' ? 'manual' : 'automatic';
  const resumesAtMs = Date.now() + (TEST_MODE ? 250 : CLAIM_AUTO_RESUME_MS);
  workspace.claimAutoResumeAtMs = resumesAtMs;
  workspace.claimAutoResumeMode = mode;
  logEvent('claim_auto_resume_scheduled', { resumesAt: new Date(resumesAtMs).toISOString(), mode });
  const timer = setTimeout(() => workspaceContext.run(workspace, () => {
    claimAutoResumeTimers.delete(workspace.id);
    workspace.claimAutoResumeAtMs = 0;
    workspace.claimAutoResumeMode = null;
    try {
      if (!state.active || !state.game || state.status !== 'paused' || state.pauseReason !== 'claim') return;
      if (state.claims.some(claim => claim.status === 'pending') || prizeStatusPayload().bingo.closed) return;
      logEvent('claim_auto_resume_started', { mode });
      resumeRoom({ mode, automaticAfterClaim: true, immediate: true });
    } catch (error) {
      console.error(`No se pudo reanudar automáticamente ${workspace.id}:`, error.message);
    }
  }), Math.max(0, resumesAtMs - Date.now()));
  claimAutoResumeTimers.set(workspace.id, timer);
}

const transitionTimers = new Map();

function clearWorkspaceTransitionTimer(workspace = currentWorkspace()) {
  const timer = transitionTimers.get(workspace.id);
  if (timer) clearTimeout(timer);
  transitionTimers.delete(workspace.id);
}

function finalExtractionTiming(remainingBalls) {
  const count = Math.max(0, Number(remainingBalls) || 0);
  if (TEST_MODE) return { leadInMs: 45, intervalMs: 12, totalMs: 45 + Math.max(1, count) * 12 };
  if (currentWorkspace().isDemo) {
    const leadInMs = 900;
    const targetMs = Math.max(900, DEMO_FINAL_SEQUENCE_MS - leadInMs);
    const intervalMs = count ? Math.max(90, Math.min(350, Math.round(targetMs / count))) : 90;
    return { leadInMs, intervalMs, totalMs: leadInMs + Math.max(1, count) * intervalMs };
  }
  const leadInMs = FINAL_BALLS_LEAD_IN_MS;
  const intervalMs = count
    ? Math.max(FINAL_BALLS_MIN_INTERVAL_MS, Math.min(FINAL_BALLS_MAX_INTERVAL_MS, Math.round(FINAL_BALLS_SEQUENCE_MS / count)))
    : FINAL_BALLS_MIN_INTERVAL_MS;
  return { leadInMs, intervalMs, totalMs: leadInMs + Math.max(1, count) * intervalMs };
}

function scheduleFinalExtractionStep(workspace = currentWorkspace()) {
  clearWorkspaceTransitionTimer(workspace);
  const transition = state.transition;
  if (!state.active || state.status !== 'finalizing' || transition?.type !== 'final-balls') return;
  const initialCount = Math.max(0, Number(transition.initialDrawnCount) || 0);
  const alreadyExtracted = Math.max(0, (state.game?.drawn?.length || 0) - initialCount);
  const totalRemaining = Math.max(0, Number(transition.remainingInitial) || 0);
  if (alreadyExtracted >= totalRemaining || (state.game?.drawn?.length || 0) >= Number(state.game?.mode || 0)) {
    const timer = setTimeout(() => workspaceContext.run(workspace, () => completeTransition()), TEST_MODE ? 10 : 450);
    transitionTimers.set(workspace.id, timer);
    return;
  }
  const leadInEndsAtMs = new Date(transition.leadInEndsAt || transition.startedAt || Date.now()).getTime();
  const intervalMs = Math.max(1, Number(transition.intervalMs) || FINAL_BALLS_MIN_INTERVAL_MS);
  const dueAt = leadInEndsAtMs + alreadyExtracted * intervalMs;
  const delay = Math.max(0, dueAt - Date.now());
  const timer = setTimeout(() => workspaceContext.run(workspace, () => {
    transitionTimers.delete(workspace.id);
    runFinalExtractionStep();
  }), delay);
  transitionTimers.set(workspace.id, timer);
}

function runFinalExtractionStep() {
  const workspace = currentWorkspace();
  if (!state.active || state.status !== 'finalizing' || state.transition?.type !== 'final-balls' || !state.game) return;
  if (!Array.isArray(state.drawOrder) || state.drawOrder.length !== state.game.mode) state.drawOrder = createSecureDrawOrder(state.game.mode, state.game.drawn);
  const number = state.drawOrder[state.game.drawn.length];
  if (Number.isFinite(number)) {
    state.game.drawn.push(number);
    state.game.drawTimestamps ||= {};
    state.game.lastDrawnAt = nowIso();
    state.game.drawTimestamps[String(number)] = state.game.lastDrawnAt;
    state.game.phase = 'FINAL_EXTRACTION';
    logEvent('ball_drawn', { number, position: state.game.drawn.length, finalVerification: true, source: 'final-extraction' });
    syncAllAutoMarks();
    saveState();
    broadcast();
  }
  scheduleFinalExtractionStep(workspace);
}

function scheduleTransition() {
  const workspace = currentWorkspace();
  clearWorkspaceTransitionTimer(workspace);
  if (!state.active || !state.transition?.endsAt) return;
  if (state.transition.type === 'final-balls') return scheduleFinalExtractionStep(workspace);
  const delay = Math.max(0, new Date(state.transition.endsAt).getTime() - Date.now());
  const timer = setTimeout(() => workspaceContext.run(workspace, () => completeTransition()), delay);
  transitionTimers.set(workspace.id, timer);
}

function completeTransition() {
  clearWorkspaceTransitionTimer();
  if (!state.active || !state.transition) return;
  const type = state.transition.type;
  if (type === 'last-ball-claim-window') {
    if (state.claims.some(claim => claim.status === 'pending')) return;
    state.status = 'finished';
    state.pauseReason = null;
    state.game.phase = 'ROUND_END';
    state.endedAt = nowIso();
    state.transition = null;
    logEvent('game_finished', { round: state.round, balls: state.game.drawn.length, automatic: true, afterFinalClaimWindow: true });
    archiveCurrentResults();
    saveState();
    broadcast();
    return;
  }
  if (type === 'final-balls') {
    if (!Array.isArray(state.drawOrder) || state.drawOrder.length !== state.game.mode) state.drawOrder = createSecureDrawOrder(state.game.mode, state.game.drawn);
    while (state.game.drawn.length < state.game.mode) {
      const number = state.drawOrder[state.game.drawn.length];
      if (!Number.isFinite(number)) break;
      state.game.drawn.push(number);
      state.game.drawTimestamps ||= {};
      state.game.lastDrawnAt = nowIso();
      state.game.drawTimestamps[String(number)] = state.game.lastDrawnAt;
      logEvent('ball_drawn', { number, position: state.game.drawn.length, finalVerification: true, source: 'final-extraction-recovery' });
    }
    syncAllAutoMarks();
    state.status = 'finished';
    state.pauseReason = null;
    state.game.phase = 'ROUND_END';
    state.endedAt = nowIso();
    state.transition = null;
    logEvent('final_extraction_completed', { round: state.round, balls: state.game.drawn.length });
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
  if (state.status === 'playing') scheduleAutomaticDraw();
}

function startRoom(payload = {}) {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status !== 'waiting') return adminPayload();
  const forcedSimulationStart = Boolean(state.roomSettings?.adminSimulation && payload?.force === true);
  const planBefore = startPlanPayload();
  if (!forcedSimulationStart && state.roomSettings?.joinOpen) throw new Error('Primero cerrá las inscripciones. Cerrarlas no inicia el sorteo.');
  if (!forcedSimulationStart && planBefore.eligiblePlayers < (TEST_MODE ? 1 : 2)) throw new Error('Se necesitan al menos 2 jugadores habilitados para iniciar el sorteo.');
  if (state.roomSettings) state.roomSettings.joinOpen = false;

  // Al iniciar, ningún salón grande debe quedar esperando a que cada persona elija.
  // Todo jugador registrado es elegible; si todavía no eligió cartones, puede recibir asignación automática al iniciar.
  const hasPendingEligibleSelections = state.players.some(player => playerEligibleForRound(player) && !playerSelectionComplete(player));
  if (hasPendingEligibleSelections) {
    const assignmentReason = forcedSimulationStart
      ? 'simulation_start'
      : payload?.communityCreator
        ? 'community_creator_start'
        : payload?.automaticSchedule
          ? 'scheduled_start'
          : 'admin_start';
    autoAssignPendingPlayers(assignmentReason);
  }

  for (const player of state.players) {
    const eligible = playerEligibleForRound(player);
    player.excludedFromRound = !eligible;
    if (!eligible) continue;
    // No activar Automarcado sin decisión del jugador. Si aún no eligió, comienza Manual.
    if (!player.markingModeChosen) {
      player.markingModeChosen = true;
      player.autoMark = false;
    }
    syncAutoMarksForPlayer(player);
  }

  const preflight = preflightPayload();
  if (!preflight.ok) throw new Error(preflight.errors[0] || 'No se pudo preparar a todos los jugadores habilitados para iniciar.');
  if (state.game.drawn.length) throw new Error('La ronda ya contiene bolillas. Reiniciala antes de empezar.');
  enforceAutoMarkPolicy();
  if (!(TEST_MODE && state.testDrawOrderFixed && Array.isArray(state.drawOrder) && state.drawOrder.length === state.game.mode)) state.drawOrder = createSecureDrawOrder(state.game.mode);
  state.testDrawOrderFixed = false;
  const lockedConfiguration = {
    gameId: state.game.id, mode: state.game.mode, rules: state.game.rules, cards: state.game.cards,
    roomSettings: { linePrizeCount: state.roomSettings.linePrizeCount, allowSamePlayerSecondLine: state.roomSettings.allowSamePlayerSecondLine, tiePolicy: state.roomSettings.tiePolicy, claimMode: state.roomSettings.claimMode, gameType: state.roomSettings.gameType, markingMode: state.roomSettings.markingMode },
    markingPolicy: markingPolicyPayload()
  };
  state.game.integrity = { lockedAt: nowIso(), configurationSha256: crypto.createHash('sha256').update(JSON.stringify(lockedConfiguration)).digest('hex'), drawOrderCommitment: crypto.createHash('sha256').update(state.drawOrder.join(',')).digest('hex') };
  state.cardReservations = {}; for (const player of state.players) player.reservedCardIds = [];
  state.assignmentTimer = { ...(state.assignmentTimer || blankState().assignmentTimer), status: 'completed', endsAt: null, remainingMs: 0, completedAt: state.assignmentTimer?.completedAt || nowIso() };
  const startedAt = nowIso(); const largeRoomNotice = !forcedSimulationStart && state.players.length > LARGE_ROOM_NOTICE_THRESHOLD; const largeRoomNoticeMs = largeRoomNotice ? (TEST_MODE ? 30 : LARGE_ROOM_NOTICE_MS) : 0;
  const baseStartSequenceMs = forcedSimulationStart ? (TEST_MODE ? 50 : 900) : currentWorkspace().isDemo ? (TEST_MODE ? 100 : DEMO_START_SEQUENCE_MS) : START_SEQUENCE_MS;
  state.status = 'starting'; state.pauseReason = null; state.startedAt = startedAt; state.endedAt = null; state.game.phase = 'READY';
  state.transition = { id: randomId('transition'), type: 'start', startedAt, endsAt: new Date(Date.now() + baseStartSequenceMs + largeRoomNoticeMs).toISOString(), officialTime: new Date().toLocaleTimeString('es-AR', { timeZone: BINGO_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }), largeRoomNotice, noticeDurationMs: largeRoomNoticeMs, priorityNotice: largeRoomNotice ? { title: LARGE_ROOM_NOTICE_TITLE, text: LARGE_ROOM_NOTICE_TEXT } : null };
  logEvent('game_start_sequence', { round: state.round, players: state.players.length, selectedCards: state.players.reduce((sum, player) => sum + player.cardIds.length, 0), largeRoomNotice, forcedSimulationStart });
  saveState(); broadcast(); syncCommunityPublicRecordFromState('playing'); scheduleTransition(); return adminPayload();
}

function pauseRoom() {
  clearClaimAutoResume(currentWorkspace(), 'manual_pause');
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status !== 'playing') throw new Error('La partida solo se puede pausar mientras está en juego.');
  clearWorkspaceTransitionTimer();
  clearAutomaticDrawTimer();
  state.status = 'paused';
  state.pauseReason = 'manual';
  state.transition = null;
  state.game.phase = 'PAUSED';
  logEvent('game_paused');
  saveState(); broadcast();
  return adminPayload();
}

function resumeRoom(payload = {}) {
  const wasClaimPause = state.pauseReason === 'claim';
  clearClaimAutoResume(currentWorkspace(), payload?.automaticAfterClaim ? '' : 'manual_resume');
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status !== 'paused') throw new Error('La partida no está pausada.');
  clearAutomaticDrawTimer();
  const mode = payload.mode === 'manual' ? 'manual' : payload.mode === 'automatic' ? 'automatic' : state.game.drawMode;
  state.game.drawMode = mode;
  if (payload.immediate === true && wasClaimPause) {
    state.status = 'playing';
    state.pauseReason = null;
    state.transition = null;
    state.game.phase = mode === 'automatic' ? 'DRAWING' : 'READY';
    logEvent('game_resumed', { round: state.round, mode, immediateAfterClaim: true, automaticAfterClaim: Boolean(payload.automaticAfterClaim) });
    saveState(); broadcast(); scheduleAutomaticDraw();
    return adminPayload();
  }
  const startedAt = nowIso();
  state.status = 'resuming';
  state.pauseReason = null;
  state.transition = { id: randomId('transition'), type: 'resume', resumeMode: mode, startedAt, endsAt: new Date(Date.now() + (currentWorkspace().isDemo ? (TEST_MODE ? 100 : DEMO_RESUME_SEQUENCE_MS) : RESUME_SEQUENCE_MS)).toISOString() };
  state.game.phase = 'PAUSED';
  logEvent('game_resume_sequence', { mode });
  saveState(); broadcast(); scheduleTransition();
  return adminPayload();
}

function updateRoomSettings(payload) {
  if (!state.active) throw new Error('No hay una sala abierta.');
  if (state.status !== 'waiting' && (payload.gameType || payload.linePrizeCount !== undefined || payload.allowSamePlayerSecondLine !== undefined || payload.tiePolicy || payload.claimMode)) throw new Error('Las jugadas y reglas quedaron bloqueadas al iniciar el sorteo.');
  if (payload.playerAudioAllowed !== undefined) state.roomSettings.playerAudioAllowed = payload.playerAudioAllowed !== false;
  if (payload.playerAudioDefault !== undefined) state.roomSettings.playerAudioDefault = Boolean(payload.playerAudioDefault);
  if (state.status === 'waiting') {
    state.roomSettings.linePrizeCount = Number(state.game?.mode) === 90 ? Math.max(1, Math.min(2, Number(payload.linePrizeCount ?? state.roomSettings.linePrizeCount) || 1)) : 1;
    state.roomSettings.allowSamePlayerSecondLine = Number(state.game?.mode) === 90 && Boolean(payload.allowSamePlayerSecondLine ?? state.roomSettings.allowSamePlayerSecondLine);
    if (payload.claimMode) { state.roomSettings.claimMode = payload.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual'; state.roomSettings.tiePolicy = state.roomSettings.claimMode === 'automatic_ties' ? 'same_ball' : 'first_claim'; }
    else state.roomSettings.tiePolicy = payload.tiePolicy === 'same_ball' ? 'same_ball' : (payload.tiePolicy === 'first_claim' ? 'first_claim' : state.roomSettings.tiePolicy);
  }
  state.roomSettings.bingoPrizeCount = 1;
  if (payload.gameType) state.roomSettings.gameType = payload.gameType === 'test' ? 'test' : 'real';
  if (payload.whatsapp !== undefined) state.roomSettings.whatsapp = String(payload.whatsapp || '').slice(0, 40);
  if (payload.argentinaHint !== undefined) state.roomSettings.argentinaHint = payload.argentinaHint !== false;
  if (payload.transmission && typeof payload.transmission === 'object') state.roomSettings.transmission = normalizeTransmissionSettings(payload.transmission);
  state.roomSettings.broadcastToken ||= randomId('live');
  state.roomSettings.broadcastAlias ||= freshBroadcastAlias(currentWorkspace().id);
  if (payload.broadcastAlias !== undefined) {
    const alias = normalizeBroadcastAlias(payload.broadcastAlias);
    if (alias.length < 3) throw new Error('El link corto debe tener al menos 3 caracteres.');
    if (broadcastAliasTaken(alias, currentWorkspace().id)) throw new Error('Ese link corto ya está en uso. Elegí otro.');
    state.roomSettings.broadcastAlias = alias;
  }
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
  const officialActaPdf = actaPdf();
  const officialActaCsv = Buffer.from(actaCsv(), 'utf8');
  const playersCsv = Buffer.from(participantsCsv(), 'utf8');
  const acta = actaPayload();
  const { pdfFile, metaFile } = currentResultFiles();
  const savedAt = nowIso();
  const meta = {
    version: APP_PUBLIC_VERSION,
    id: historySafeId(`${state.endedAt || savedAt}_${state.roomCode}`),
    status: 'finished',
    roomCode: state.roomCode,
    roomOrigin: state.roomSettings?.roomOrigin === 'community' ? 'community' : 'official',
    roomType: state.roomSettings?.roomOrigin === 'community' ? (state.roomSettings?.communityAccessType === 'private' ? 'private' : 'public') : 'official',
    roomName: state.roomSettings?.roomName || (state.roomSettings?.roomOrigin === 'community' ? '' : 'EL BINGO DE LA GORDA'),
    communityPublicId: state.roomSettings?.communityPublicId || '',
    hostName: state.roomSettings?.hostName || '',
    workspaceId: currentWorkspace().id,
    gameNumber: state.game.number,
    round: state.round,
    mode: state.game.mode,
    claimMode: state.roomSettings?.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual',
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    savedAt,
    totalPlayers: acta.totalPlayers,
    activeCards: acta.activeCards,
    winners: (acta.winners || []).map(winner => ({
      type: winner.type,
      prizeLabel: winner.prizeLabel,
      playerName: winner.playerName,
      cardNumber: winner.cardNumber,
      claimedAt: winner.claimedAt,
      ballNumber: winner.ballNumber
    })),
    integrity: acta.integrity ? {
      algorithm: acta.integrity.algorithm,
      commitment: acta.integrity.commitment,
      sealedAt: acta.integrity.sealedAt,
      verified: acta.integrity.verified
    } : null,
    filename: resultsFilename(),
    sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    size: pdf.length,
    files: {
      resultsPdf: 'resultados.pdf',
      actaPdf: 'acta.pdf',
      actaCsv: 'acta.csv',
      participantsCsv: 'participantes.csv',
      actaJson: 'acta.json'
    }
  };

  const dir = archiveFolderForState('finished');
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(path.join(dir, 'resultados.pdf'), pdf);
  writeAtomic(path.join(dir, 'acta.pdf'), officialActaPdf);
  writeAtomic(path.join(dir, 'acta.csv'), officialActaCsv);
  writeAtomic(path.join(dir, 'participantes.csv'), playersCsv);
  writeAtomic(path.join(dir, 'acta.json'), JSON.stringify(acta, null, 2));
  writeAtomic(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));

  // Compatibilidad: se conserva el último resultado por workspace.
  writeAtomic(pdfFile, pdf);
  writeAtomic(metaFile, JSON.stringify(meta, null, 2));
  currentWorkspace().lastResultMeta = meta;
  state.historyArchiveId = meta.id;
  syncCommunityPublicRecordFromState('finished');
  prepareCommunityRematchWindow();
  return meta;
}

function archiveCancelledRoom() {
  if (!state.active || !state.roomCode) return null;
  const savedAt = nowIso();
  const endedAt = state.endedAt || savedAt;
  state.endedAt = endedAt;
  const meta = {
    version: APP_PUBLIC_VERSION,
    id: historySafeId(`${endedAt}_${state.roomCode}_cancelled`),
    status: 'cancelled',
    roomCode: state.roomCode,
    roomOrigin: state.roomSettings?.roomOrigin === 'community' ? 'community' : 'official',
    roomType: state.roomSettings?.roomOrigin === 'community' ? (state.roomSettings?.communityAccessType === 'private' ? 'private' : 'public') : 'official',
    roomName: state.roomSettings?.roomName || (state.roomSettings?.roomOrigin === 'community' ? '' : 'EL BINGO DE LA GORDA'),
    communityPublicId: state.roomSettings?.communityPublicId || '',
    hostName: state.roomSettings?.hostName || '',
    workspaceId: currentWorkspace().id,
    gameNumber: state.game?.number || null,
    round: state.round || 1,
    mode: state.game?.mode || null,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    endedAt,
    cancelledAt: endedAt,
    savedAt,
    totalPlayers: Array.isArray(state.players) ? state.players.length : 0,
    activeCards: Array.isArray(state.players) ? state.players.reduce((sum, player) => sum + (player.cardIds || []).length, 0) : 0,
    winners: [],
    cancelReason: String(state.closedReason || 'closed').slice(0, 80),
    integrity: state.game?.integrity?.drawOrderCommitment ? {
      algorithm: 'SHA-256',
      commitment: state.game.integrity.drawOrderCommitment,
      sealedAt: state.game.integrity.sealedAt || null,
      verified: false
    } : null,
    files: { summaryJson: 'resumen.json' }
  };
  const dir = archiveFolderForState('cancelled');
  fs.mkdirSync(dir, { recursive: true });
  const summary = {
    roomCode: state.roomCode,
    status: 'cancelled',
    roomOrigin: meta.roomOrigin,
    hostName: meta.hostName,
    mode: meta.mode,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    cancelledAt: endedAt,
    cancelReason: String(state.closedReason || 'closed').slice(0, 80),
    players: (state.players || []).map(player => ({
      name: playerDisplayName(player),
      cardCount: (player.cardIds || []).length,
      allowedCardCount: Number(player.allowedCardCount) || 1
    }))
  };
  writeAtomic(path.join(dir, 'resumen.json'), JSON.stringify(summary, null, 2));
  writeAtomic(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  state.historyArchiveId = meta.id;
  syncCommunityPublicRecordFromState('cancelled');
  return meta;
}

function finishRoom(payload = {}) {
  const workspace = currentWorkspace();
  const forceSimulation = Boolean(payload.forceSimulation) && Boolean(state.roomSettings?.adminSimulation || workspace.isDemo || state.demo);
  clearAutomaticDrawTimer(workspace);
  clearClaimAutoResume(workspace);
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status === 'finished') return adminPayload();
  if (!['playing', 'paused', 'verifying', 'finalizing'].includes(state.status)) throw new Error('El sorteo todavía no comenzó.');

  if (forceSimulation) {
    clearWorkspaceTransitionTimer(workspace);
    clearDemoAutomationTimers(workspace);
    clearDemoStartTimer(workspace);
    clearAutomaticClaimVerificationTimer(workspace);
    for (const claim of state.claims.filter(item => item.status === 'pending')) {
      claim.status = 'rejected';
      claim.resolvedAt = nowIso();
      claim.resolutionReason = 'simulation_finished_by_admin';
      claim.adminNote = 'Simulación finalizada manualmente por el administrador.';
      addClaimNotice(claim, 'rejected', `${claim.prizeLabel || prizeLabelFor(claim.type)} cancelado: la demostración fue finalizada.`);
    }
    state.claimWindow = null;
    state.transition = null;
    state.status = 'finished';
    state.pauseReason = null;
    state.endedAt = nowIso();
    state.game.phase = 'ROUND_END';
    logEvent('simulation_finished_by_admin', { round: state.round, balls: state.game.drawn.length });
    archiveCurrentResults();
    saveState();
    broadcast();
    return adminPayload();
  }

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
  player.markingModeChosen = false;
  player.autoMark = false;
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
  const authorizedCount = authorizedCardCount(player);
  if (requestedNumbers.length) {
    if (requestedNumbers.length > authorizedCount) throw new Error(`Este acceso admite hasta ${authorizedCount} cartón${authorizedCount === 1 ? '' : 'es'}.`);
    const normalized = [...new Set(requestedNumbers)];
    if (normalized.length !== requestedNumbers.length) throw new Error('Repetiste un número de cartón.');
    for (const number of normalized) {
      const card = state.game.cards.find(item => String(item.number).toUpperCase() === String(number).toUpperCase());
      if (!card) throw new Error(`No existe el cartón ${number}.`);
      if (occupied.has(card.id)) throw new Error(`El cartón ${number} ya pertenece a otro jugador.`);
      chosen.push(card.id);
    }
  } else {
    const available = state.game.cards.map(card => card.id).filter(cardId => !occupied.has(cardId));
    chosen = diverseCardSelection(available, authorizedCount, [...currentIds]);
    if (chosen.length < authorizedCount) throw new Error('No quedan cartones suficientemente diferentes para completar la asignación.');
  }
  assertPlayerCardDiversity(chosen);
  releaseReservationsForPlayer(player);
  player.cardIds = chosen;
  player.selectionConfirmed = true;
  player.markingModeChosen = false;
  player.autoMark = false;
  player.offeredCardIds = [];
  player.reservedCardIds = [];
  player.marks = Object.fromEntries(chosen.map(cardId => [cardId, []]));
  syncAutoMarksForPlayer(player);
  enforceAutoMarkPolicy();
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
  clearClaimAutoResume(currentWorkspace());
  if (state.active && state.status !== 'finished') throw new Error('Primero finalizá el sorteo actual antes de crear una sala nueva.');
  if (state.active) logEvent('new_room_requested');
  replaceCurrentState(blankState());
  saveState();
  broadcast();
  return adminPayload();
}

function closeRoom() {
  clearAutomaticDrawTimer();
  clearClaimAutoResume(currentWorkspace());
  clearWorkspaceTransitionTimer();
  logEvent('room_closed');
  state.endedAt ||= nowIso();
  if (state.roomCode && state.status !== 'finished' && !state.historyArchiveId) archiveCancelledRoom();
  state.active = false;
  state.status = 'closed';
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
      name: normalizePlayerName(rawPlayer.name || ''),
      nameSet: rawPlayer.nameSet === undefined ? Boolean(normalizePlayerName(rawPlayer.name || '')) : Boolean(rawPlayer.nameSet),
      slotNumber: Math.max(1, Number(rawPlayer.slotNumber) || index + 1),
      slotLabel: String(rawPlayer.slotLabel || `Acceso ${index + 1}`).slice(0, 80),
      personalPresenter: PRESENTER_ID,
      virtual: Boolean(rawPlayer.virtual),
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
      markingModeChosen: rawPlayer.markingModeChosen === undefined ? Boolean(rawPlayer.autoMark) : Boolean(rawPlayer.markingModeChosen),
      notices: Array.isArray(rawPlayer.notices) ? rawPlayer.notices.slice(-20) : []
    };
  });
  replaceCurrentState({
    version: 202602,
    revision: Math.max(0, Number(raw.revision) || 0),
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
    drawOrder: Array.isArray(raw.drawOrder) && raw.drawOrder.length === Number(raw.game.mode) ? uniqueNumbers(raw.drawOrder) : createSecureDrawOrder(Number(raw.game.mode) === 75 ? 75 : 90, raw.game.drawn || []),
    claimSequence: Math.max(0, Number(raw.claimSequence) || 0),
    claimWindow: raw.claimWindow && typeof raw.claimWindow === 'object' ? raw.claimWindow : null,
    chat: { enabled: raw.chat?.enabled !== false, locked: Boolean(raw.chat?.locked), messages: Array.isArray(raw.chat?.messages) ? raw.chat.messages.slice(-CHAT_MAX_MESSAGES) : [], mutedPlayerIds: Array.isArray(raw.chat?.mutedPlayerIds) ? raw.chat.mutedPlayerIds.map(String) : [], lastSentAt: {} },
    demo: raw.demo && typeof raw.demo === 'object' ? raw.demo : null,
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
    claims: Array.isArray(raw.claims) ? raw.claims.slice(-500) : [],
    eventLog: Array.isArray(raw.eventLog) ? raw.eventLog.slice(-2000) : []
  });
  state.roomSettings.claimMode = state.roomSettings.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual';
  state.roomSettings.tiePolicy = state.roomSettings.claimMode === 'automatic_ties' ? 'same_ball' : (state.roomSettings.tiePolicy === 'same_ball' ? 'same_ball' : 'first_claim');
  enforceAutoMarkPolicy();
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('backup_restored', { players: players.length, cards: state.game.cards.length, status: state.status });
  saveState();
  broadcast();
  scheduleTransition();
  if (state.status === 'playing') scheduleAutomaticDraw();
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
  player.personalPresenter = PRESENTER_ID;
  player.sessionToken = player.sessionToken || randomId('session');
  player.sessionDeviceId = deviceId || player.sessionDeviceId || randomId('device');
  player.lastLoginAt = nowIso();
  if (state.status === 'waiting') refreshOffersForPlayer(player);
  logEvent('player_login', { playerId: player.id, playerName: playerDisplayName(player) });
  saveState(); broadcast();
  return { token: player.sessionToken, state: playerPayload(player) };
}


function createAdminPlayerViewSession(payload = {}) {
  const playerId = String(payload.playerId || '');
  const player = state.players.find(item => item.id === playerId);
  if (!player) throw new Error('No se encontró el jugador.');
  const token = randomId('playerview');
  // La vista del administrador es SIEMPRE una simulación de solo lectura.
  // No inicia sesión como jugador, no usa código y nunca toma control de una IA.
  playerViewSessions.set(token, {
    workspaceId: currentWorkspace().id,
    playerId: player.id,
    readOnly: true,
    expiresAt: Date.now() + 60 * 60 * 1000
  });
  return {
    token,
    playerId: player.id,
    playerName: playerDisplayName(player),
    readOnly: true,
    virtual: Boolean(player.virtual),
    url: `/admin-player-preview?previewSession=${encodeURIComponent(token)}`
  };
}


function startDemoFromPlayer(player) {
  // Compatibilidad con clientes anteriores: la petición vieja ya no inicia directamente.
  // Solo informa al servidor que el recorrido previo quedó resuelto y el servidor arma la cuenta.
  if (!currentWorkspace().isDemo || !player?.demoHuman) throw new Error('Esta acción solo está disponible en la demostración.');
  const flow = ensureDemoStartFlow();
  if (!flow.tutorialResolved) {
    flow.tutorialResolved = true;
    flow.tutorialResolution = 'legacy';
    flow.tutorialResolvedAt = nowIso();
  }
  return retryDemoServerStart(player);
}

function restartDemoFromPlayer(player) {
  if (!currentWorkspace().isDemo || !player?.demoHuman) throw new Error('Esta acción solo está disponible en la demostración.');
  const previousWorkspace = currentWorkspace();
  const demo = state.demo || {};
  clearDemoStartTimer(previousWorkspace);
  clearAutomaticDrawTimer(previousWorkspace);
  clearWorkspaceTransitionTimer(previousWorkspace);
  clearClaimAutoResume(previousWorkspace);
  clearDemoAutomationTimers(previousWorkspace);
  return createDemoRoom({
    mode: Number(demo.mode || state.game?.mode) === 90 ? 90 : 75,
    aiCount: Math.max(1, Math.min(3, Number(demo.aiCount) || (state.players.filter(item => item.virtual).length || 2))),
    aiNames: Array.isArray(demo.aiNames) ? demo.aiNames : state.players.filter(item => item.virtual).map(item => item.name),
    playerCardCount: Math.max(1, Math.min(4, Number(demo.playerCardCount || player.allowedCardCount) || 2)),
    autoSeconds: Number(demo.autoSeconds || state.game?.autoSeconds) || 4,
    rules: demo.rules || state.game?.rules || {},
    linePrizeCount: Number(demo.linePrizeCount || state.roomSettings?.linePrizeCount) || 1,
    markingMode: demo.markingMode || state.roomSettings?.markingMode || 'normal',
    sound: state.roomSettings?.playerAudioDefault !== false
  });
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
  const authorizedCount = authorizedCardCount(player);
  if (!current.has(cardId) && current.size >= authorizedCount) throw new Error(`Solo podés reservar ${authorizedCount} cartón${authorizedCount === 1 ? '' : 'es'}.`);
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
  const authorizedCount = authorizedCardCount(player);
  if (selected.length < 1 || selected.length > authorizedCount) throw new Error(`Podés elegir entre 1 y ${authorizedCount} cartón${authorizedCount === 1 ? '' : 'es'}.`);
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
  assertPlayerCardDiversity(selected);
  releaseReservationsForPlayer(player, selected);
  if (selectedName) {
    player.name = selectedName;
    player.nameSet = true;
  }
  player.cardIds = selected;
  player.selectionConfirmed = true;
  if (state.roomSettings?.markingMode === 'manual_only') { player.autoMark = false; player.markingModeChosen = true; }
  player.offeredCardIds = [];
  player.reservedCardIds = [];
  for (const cardId of selected) delete state.cardReservations[cardId];
  player.marks = Object.fromEntries(selected.map(cardId => [cardId, []]));
  syncAutoMarksForPlayer(player);
  enforceAutoMarkPolicy();
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('cards_selected', { playerId: player.id, playerName: playerDisplayName(player), cardIds: selected });
  let demoShouldSchedule = false;
  if (currentWorkspace().isDemo && player.demoHuman) {
    const flow = ensureDemoStartFlow();
    if (flow?.tutorialResolved) {
      flow.phase = 'countdown';
      flow.error = null;
      flow.countdownEndsAt = new Date(Date.now() + DEMO_READY_COUNTDOWN_MS).toISOString();
      demoShouldSchedule = true;
    }
  }
  saveState();
  broadcast();
  if (demoShouldSchedule) scheduleDemoStartCountdown();
  return playerPayload(player);
}

function releaseOwnSelection(player) {
  if (!state.active || !selectionIsOpen()) throw new Error('La elección ya está cerrada.');
  if (currentWorkspace().isDemo && player?.demoHuman) cancelDemoStartFlow('selection_changed', { keepTutorial: true });
  releaseReservationsForPlayer(player);
  player.cardIds = [];
  player.selectionConfirmed = false;
  player.markingModeChosen = false;
  player.autoMark = false;
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
  if (state.roomSettings?.markingMode === 'manual_only' && Boolean(payload.enabled)) throw new Error('Esta partida es SOLO MANUAL. Automarcado está deshabilitado.');
  player.autoMark = state.roomSettings?.markingMode === 'manual_only' ? false : Boolean(payload.enabled);
  player.markingModeChosen = true;
  if (player.autoMark) syncAutoMarksForPlayer(player);
  logEvent('player_marking_mode_changed', { playerId: player.id, playerName: playerDisplayName(player), mode: player.autoMark ? 'automatic' : 'manual' });
  saveState(); broadcast(); return playerPayload(player);
}

function automaticTieClaimsEnabled() {
  return !currentWorkspace().isDemo && state.roomSettings?.claimMode === 'automatic_ties';
}

function automaticClaimValidity(type, analysis, lineDetail = null) {
  if (type === 'ambo') return Boolean(analysis?.hasAmbo);
  if (type === 'line') return Number(state.game?.mode) === 90 ? Boolean(lineDetail) : Boolean(analysis?.hasLine);
  if (type === 'doubleLine') return Boolean(analysis?.hasDoubleLine);
  if (type === 'tripleLine') return Boolean(analysis?.hasTripleLine);
  if (type === 'corners') return Boolean(analysis?.hasCorners);
  if (type === 'bingo') return Boolean(analysis?.hasBingo);
  return false;
}

function automaticClaimCandidates(type, prizeNumber = 1) {
  if (!state.game || !isPrizeEnabled(type)) return [];
  const mode = Number(state.game.mode) === 75 ? 75 : 90;
  const betName = claimBetName(type);
  const winners = [];
  const playerWonLine = new Set(confirmedClaims('line').map(claim => String(claim.playerId)));
  for (const player of state.players || []) {
    if (!player?.selectionConfirmed) continue;
    if (type === 'line' && mode === 90 && Number(prizeNumber) === 2 && !state.roomSettings?.allowSamePlayerSecondLine && playerWonLine.has(String(player.id))) continue;
    for (const cardId of player.cardIds || []) {
      const card = state.game.cards.find(item => item.id === cardId);
      if (!card || card.bets?.[betName] === false) continue;
      if (type !== 'line' || mode !== 90) {
        if (confirmedClaims(type).some(claim => claim.cardId === cardId)) continue;
      }
      const analysis = analyzeCard(card, state.game.drawn, player.marks?.[cardId] || []);
      const lineDetail = type === 'line' && mode === 90 ? nextUnclaimedLineDetail(cardId, analysis) : null;
      if (!automaticClaimValidity(type, analysis, lineDetail)) continue;
      winners.push({ player, card, analysis, lineDetail });
    }
  }
  return winners;
}

function registerAutomaticConfirmedClaim({ player, card, analysis, lineDetail, type, prizeNumber, batchId, resolvedAt, receivedEpochMs }) {
  state.claimSequence = Math.max(0, Number(state.claimSequence) || 0) + 1;
  const sequence = state.claimSequence;
  const claim = {
    id: randomId('claim'), type, prizeNumber, prizeLabel: prizeLabelFor(type, prizeNumber, state.game.mode),
    playerId: player.id, playerName: playerDisplayName(player), cardId: card.id, cardNumber: card.number,
    createdAt: resolvedAt, receivedAt: resolvedAt, receivedEpochMs, receivedSequence: sequence,
    receivedMonotonicNs: process.hrtime.bigint().toString(), deltaFromFirstMs: 0,
    claimWindowId: batchId, status: 'confirmed', officialValid: true, simulated: false, automatic: true,
    winningLineKey: type === 'line' && Number(state.game.mode) === 90 ? (lineDetail?.key || null) : null,
    drawnAtClaim: [...state.game.drawn], playerMarksAtClaim: [...(player.marks?.[card.id] || [])], comparison: analysis,
    tieGroupId: batchId, resolvedAt, adminNote: 'Detectado automáticamente por el servidor en la misma bolilla.',
    resolutionReason: 'automatic_same_ball'
  };
  state.claims.push(claim);
  addClaimNotice(claim, 'confirmed', `${claim.prizeLabel} detectado automáticamente en el cartón ${claim.cardNumber}.`);
  logEvent('claim_created', { claimId: claim.id, type, prizeNumber, playerId: player.id, cardId: card.id, officialValid: true, receivedSequence: sequence, deltaFromFirstMs: 0, automatic: true });
  logEvent('claim_resolved', { claimId: claim.id, resolution: 'confirmed', prizeNumber, officialValid: true, receivedSequence: sequence, reason: claim.resolutionReason, automatic: true });
  return claim;
}

function processAutomaticClaimsForCurrentBall() {
  if (!automaticTieClaimsEnabled() || !state.active || !state.game || state.status !== 'playing') return [];
  const resolvedAt = nowIso();
  const receivedEpochMs = Date.now();
  const batchId = randomId(`auto_ball_${state.game.drawn.length}`);
  const awarded = [];
  const mode = Number(state.game.mode) === 75 ? 75 : 90;

  for (const type of PRIZE_TYPES) {
    if (!isPrizeEnabled(type)) continue;
    if (type === 'line' && mode === 90) {
      let guard = 0;
      while (guard++ < 2) {
        const current = prizeStatusPayload().line;
        if (!current || current.closed) break;
        const prizeNumber = Math.max(1, Number(current.nextNumber) || 1);
        const candidates = automaticClaimCandidates('line', prizeNumber);
        if (!candidates.length) break;
        for (const candidate of candidates) awarded.push(registerAutomaticConfirmedClaim({ ...candidate, type:'line', prizeNumber, batchId, resolvedAt, receivedEpochMs }));
      }
      continue;
    }
    const current = prizeStatusPayload()[type];
    if (!current || current.closed) continue;
    const candidates = automaticClaimCandidates(type, 1);
    if (!candidates.length) continue;
    for (const candidate of candidates) awarded.push(registerAutomaticConfirmedClaim({ ...candidate, type, prizeNumber:1, batchId, resolvedAt, receivedEpochMs }));
  }

  if (!awarded.length) return awarded;
  clearWorkspaceTransitionTimer();
  clearAutomaticDrawTimer();
  state.claimWindow = null;
  state.transition = null;
  state.pauseReason = 'claim';
  const bingoWinners = awarded.filter(claim => claim.type === 'bingo');
  logEvent('automatic_claim_batch_confirmed', {
    batchId, ball: state.game.drawn.at(-1) ?? null, drawnCount: state.game.drawn.length,
    winners: awarded.map(claim => ({ claimId:claim.id, type:claim.type, prizeNumber:claim.prizeNumber, playerId:claim.playerId, cardId:claim.cardId }))
  });
  if (bingoWinners.length) {
    const startedAt = nowIso();
    const remainingInitial = Math.max(0, Number(state.game.mode || 0) - state.game.drawn.length);
    const timing = finalExtractionTiming(remainingInitial);
    const now = Date.now();
    state.status = 'finalizing';
    state.game.phase = 'BINGO_CONFIRMED';
    state.transition = {
      id: randomId('transition'), type: 'final-balls', startedAt,
      initialDrawnCount: state.game.drawn.length,
      remainingInitial,
      intervalMs: timing.intervalMs,
      leadInEndsAt: new Date(now + timing.leadInMs).toISOString(),
      endsAt: new Date(now + timing.totalMs).toISOString()
    };
    logEvent('bingo_confirmed_final_extraction', { claimIds:bingoWinners.map(claim => claim.id), tieCount:bingoWinners.length, remainingBalls:remainingInitial, leadInMs:timing.leadInMs, intervalMs:timing.intervalMs, automatic:true });
  } else {
    state.status = 'paused';
    state.game.phase = 'PAUSED';
  }
  return awarded;
}

function createClaim(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  if (state.roomSettings?.claimMode === 'automatic_ties' && !payload?.automaticSystem) throw new Error('Esta partida usa reclamo automático. El servidor detecta las jugadas ganadoras y los empates.');
  const requested = String(payload.type || '');
  const type = PRIZE_TYPES.includes(requested) ? requested : 'line';
  const nowMs = Date.now();
  const existingWindow = state.claimWindow;
  const windowOpen = state.status === 'verifying' && existingWindow && nowMs <= Number(existingWindow.expiresAtMs) && Number(existingWindow.drawnCount) === state.game.drawn.length;
  if (state.status !== 'playing' && !windowOpen) throw new Error('La partida todavía no comenzó, ya finalizó o la ventana de reclamos se cerró.');
  const cardId = String(payload.cardId || '');
  const card = state.game.cards.find(item => item.id === cardId);
  if (!card || !player.cardIds.includes(cardId)) throw new Error('Ese cartón no pertenece al jugador.');
  if (!isPrizeEnabled(type)) throw new Error(`La jugada ${prizeLabelFor(type)} no está habilitada en esta partida.`);
  const betName = claimBetName(type);
  if (card.bets?.[betName] === false) throw new Error(`Este cartón no participa por ${prizeLabelFor(type)}.`);
  const prizes = prizeStatusPayload();
  const prize = prizes[type];
  if (!prize || prize.closed) throw new Error(`La jugada ${prizeLabelFor(type)} ya fue adjudicada o no está habilitada.`);
  const isSequentialLine90 = type === 'line' && Number(state.game.mode) === 90;
  if (isSequentialLine90) {
    if (state.claims.some(claim => claim.type === 'line' && claim.cardId === cardId && claim.status === 'pending')) {
      throw new Error('Ese cartón ya tiene un reclamo de línea pendiente.');
    }
  } else if (state.claims.some(claim => claim.type === type && claim.cardId === cardId && ['pending', 'confirmed'].includes(claim.status))) {
    throw new Error(`Ese cartón ya reclamó ${prizeLabelFor(type)}.`);
  }

  if (!existingWindow || !windowOpen) {
    state.claimWindow = {
      id: randomId('claim_window'),
      type,
      types: [type],
      openedAt: nowIso(),
      openedAtMs: nowMs,
      expiresAtMs: nowMs + (currentWorkspace().isDemo ? (TEST_MODE ? CLAIM_QUEUE_WINDOW_MS : DEMO_CLAIM_WINDOW_MS) : CLAIM_QUEUE_WINDOW_MS),
      drawnCount: state.game.drawn.length,
      lastBall: state.game.drawn.at(-1) ?? null
    };
  } else {
    state.claimWindow.types = [...new Set([...(Array.isArray(state.claimWindow.types) ? state.claimWindow.types : [state.claimWindow.type].filter(Boolean)), type])];
  }
  const window = state.claimWindow;
  const windowClaims = state.claims.filter(claim => claim.claimWindowId === window.id);
  if (windowClaims.length >= 20) throw new Error('Se alcanzó el máximo de alertas simultáneas para esta verificación.');

  const analysis = analyzeCard(card, state.game.drawn, player.marks?.[cardId] || []);
  const lineDetail = type === 'line' && Number(state.game.mode) === 90 ? nextUnclaimedLineDetail(cardId, analysis) : null;
  const validity = { ambo: analysis.hasAmbo, line: Number(state.game.mode) === 90 ? Boolean(lineDetail) : analysis.hasLine, doubleLine: analysis.hasDoubleLine, tripleLine: analysis.hasTripleLine, corners: analysis.hasCorners, bingo: analysis.hasBingo };
  const valid = Boolean(validity[type]);
  state.claimSequence = Math.max(0, Number(state.claimSequence) || 0) + 1;
  const sequence = state.claimSequence;
  const receivedAt = nowIso();
  const priorSamePrize = state.claims.filter(claim => claim.type === type && claim.claimWindowId === window.id);
  const firstReceivedMs = priorSamePrize.length ? Math.min(...priorSamePrize.map(claim => Number(claim.receivedEpochMs) || nowMs)) : nowMs;
  const prizeNumber = type === 'line' && Number(state.game.mode) === 90 ? prize.awarded + 1 : 1;
  const claim = {
    id: randomId('claim'), type, prizeNumber, prizeLabel: prizeLabelFor(type, prizeNumber, state.game.mode),
    playerId: player.id, playerName: playerDisplayName(player), cardId,
    cardNumber: Number(card.eventCardNumber) || card.number,
    eventPlayerId: safeEventPlayerId(player.eventPlayerId || ''),
    eventCode: safeEventCode(player.eventCode || card.eventCode || ''),
    eventLotCode: safeEventLotCode(card.eventLotCode || ''),
    eventCardNumber: Number(card.eventCardNumber) || null,
    createdAt: receivedAt, receivedAt, receivedEpochMs: nowMs, receivedSequence: sequence,
    receivedMonotonicNs: process.hrtime.bigint().toString(), deltaFromFirstMs: Math.max(0, nowMs - firstReceivedMs),
    claimWindowId: window.id, status: 'pending', officialValid: valid, simulated: Boolean(payload.simulated),
    winningLineKey: type === 'line' && Number(state.game.mode) === 90 ? (lineDetail?.key || null) : null,
    drawnAtClaim: [...state.game.drawn], playerMarksAtClaim: [...(player.marks?.[cardId] || [])], comparison: analysis,
    tieGroupId: state.roomSettings.tiePolicy === 'same_ball' ? window.id : null
  };
  state.claims.push(claim);
  if (state.status === 'playing') {
    clearWorkspaceTransitionTimer();
    clearAutomaticDrawTimer();
    state.status = 'verifying';
    state.pauseReason = 'claim';
    state.transition = null;
    state.game.phase = 'REVIEWING_WINNER';
  }
  logEvent('claim_created', { claimId: claim.id, type, prizeNumber, playerId: player.id, cardId, officialValid: valid, receivedSequence: sequence, deltaFromFirstMs: claim.deltaFromFirstMs, simulated: claim.simulated });
  saveState();
  broadcast();
  if (currentWorkspace().isDemo) scheduleDemoClaimResolution(claim.claimWindowId);
  scheduleAutomaticClaimVerification(currentWorkspace());
  return claim;
}

function addClaimNotice(claim, resolution, textOverride = '') {
  const player = state.players.find(item => item.id === claim.playerId);
  if (!player) return;
  player.notices ||= [];
  const label = claim.prizeLabel || prizeLabelFor(claim.type, claim.prizeNumber, state.game.mode);
  player.notices.push({
    id: randomId('notice'), at: nowIso(), type: 'claim_result', claimId: claim.id, claimType: claim.type,
    prizeNumber: claim.prizeNumber || 1, cardNumber: claim.cardNumber, result: resolution, officialValid: claim.officialValid,
    text: textOverride || (resolution === 'confirmed' ? `${label} confirmado en el cartón ${claim.cardNumber}.` : `${label} rechazado en el cartón ${claim.cardNumber}.`)
  });
}

function rejectPendingClaim(claim, reason, note, text) {
  if (!claim || claim.status !== 'pending') return;
  claim.status = 'rejected';
  claim.resolvedAt = nowIso();
  claim.resolutionReason = reason;
  claim.adminNote = note;
  addClaimNotice(claim, 'rejected', text);
  logEvent('claim_resolved', { claimId: claim.id, resolution: 'rejected', reason, receivedSequence: claim.receivedSequence });
}

function refreshPendingPrizeLabels(type, claimWindowId) {
  const current = prizeStatusPayload()[type];
  const nextNumber = type === 'line' && Number(state.game?.mode) === 90
    ? Math.max(1, Math.min(Number(current?.total) || 1, (Number(current?.awarded) || 0) + 1))
    : 1;
  for (const item of state.claims.filter(claim => claim.status === 'pending' && claim.type === type && claim.claimWindowId === claimWindowId)) {
    item.prizeNumber = nextNumber;
    item.prizeLabel = prizeLabelFor(type, nextNumber, state.game?.mode);
  }
}

function resolveClaim(payload) {
  const claim = state.claims.find(item => item.id === payload.claimId);
  if (!claim) throw new Error('No se encontró el reclamo.');
  if (claim.status !== 'pending') return claim;
  const resolution = payload.resolution === 'confirmed' ? 'confirmed' : 'rejected';
  const activeWindow = state.claimWindow && claim.claimWindowId === state.claimWindow.id ? state.claimWindow : null;
  if (activeWindow && Date.now() < Number(activeWindow.expiresAtMs || 0)) {
    const remainingMs = Math.max(1, Number(activeWindow.expiresAtMs) - Date.now());
    throw new Error(`La ventana de auditoría sigue abierta. Esperá ${remainingMs} ms para registrar todas las alertas simultáneas.`);
  }

  if (resolution === 'confirmed') {
    if (!claim.officialValid) throw new Error('El sistema determinó que el reclamo no es válido.');
    const prizes = prizeStatusPayload();
    const current = prizes[claim.type];
    const sameWindow = state.claims.filter(item => item.claimWindowId === claim.claimWindowId && item.type === claim.type);
    if (state.roomSettings.tiePolicy !== 'same_ball') {
      const earlierValid = sameWindow
        .filter(item => item.officialValid && item.status === 'pending' && Number(item.receivedSequence) < Number(claim.receivedSequence))
        .sort((a, b) => Number(a.receivedSequence) - Number(b.receivedSequence))[0];
      if (earlierValid) throw new Error(`Primero debe resolverse el reclamo #${earlierValid.receivedSequence}, recibido antes por el servidor.`);
      if (current.closed) throw new Error(`La jugada ${prizeLabelFor(claim.type, claim.prizeNumber)} ya fue adjudicada.`);
    } else {
      const confirmedInWindow = sameWindow.filter(item => item.status === 'confirmed');
      if (confirmedInWindow.length >= MAX_TIE_WINNERS_PER_PRIZE) throw new Error(`El máximo es de ${MAX_TIE_WINNERS_PER_PRIZE} ganadores simultáneos por jugada.`);
      if (current.closed && !confirmedInWindow.length) throw new Error(`La jugada ${prizeLabelFor(claim.type, claim.prizeNumber)} ya fue adjudicada.`);
    }
    if (!(claim.type === 'line' && Number(state.game.mode) === 90) && confirmedClaims(claim.type).some(item => item.cardId === claim.cardId)) {
      throw new Error('Ese cartón ya fue confirmado para esta jugada.');
    }
    claim.prizeNumber = claim.type === 'line' && Number(state.game.mode) === 90 ? current.awarded + 1 : 1;
    claim.prizeLabel = prizeLabelFor(claim.type, claim.prizeNumber, state.game.mode);
  }

  claim.status = resolution;
  claim.resolvedAt = nowIso();
  claim.adminNote = String(payload.note || '').slice(0, 240);
  claim.resolutionReason = resolution === 'confirmed'
    ? (payload.automaticVerification ? 'automatic_verified' : 'first_valid_received')
    : (claim.officialValid ? (payload.automaticVerification ? 'automatic_rejected' : 'rejected_by_admin') : 'invalid_card');
  addClaimNotice(claim, resolution);

  if (resolution === 'confirmed' && state.roomSettings.tiePolicy !== 'same_ball') {
    const currentAfter = prizeStatusPayload()[claim.type];
    for (const later of state.claims.filter(item => item.status === 'pending' && item.claimWindowId === claim.claimWindowId && item.type === claim.type)) {
      if (!later.officialValid) {
        rejectPendingClaim(later, 'invalid_card', 'Reclamo inválido registrado durante la misma ventana.', `${later.prizeLabel} rechazado: el cartón no estaba completo.`);
        continue;
      }
      if (claim.type === 'line' && Number(state.game.mode) === 90 && !currentAfter?.closed) {
        // En Bingo 90 las líneas son posiciones globales del juego. Si hay dos premios,
        // el segundo reclamo válido conserva su lugar en la cola y pasa a disputar Línea 2,
        // incluso si llegó en la misma bolilla/ventana que Línea 1.
        continue;
      }
      if (currentAfter?.closed) {
        rejectPendingClaim(later, 'valid_but_received_later', `Reclamo válido recibido ${later.deltaFromFirstMs} ms después del ganador.`, `${later.prizeLabel} válido, pero recibido después del reclamo ganador.`);
      }
    }
  }
  refreshPendingPrizeLabels(claim.type, claim.claimWindowId);

  logEvent('claim_resolved', { claimId: claim.id, resolution, prizeNumber: claim.prizeNumber || 1, officialValid: claim.officialValid, receivedSequence: claim.receivedSequence, reason: claim.resolutionReason });
  clearWorkspaceTransitionTimer();
  clearAutomaticDrawTimer();
  state.transition = null;
  state.pauseReason = 'claim';
  const stillPending = state.claims.some(item => item.status === 'pending');
  if (stillPending) {
    state.status = 'verifying';
    state.game.phase = 'REVIEWING_WINNER';
  } else if (confirmedClaims('bingo').length) {
    const bingoClaim = confirmedClaims('bingo').at(-1);
    const startedAt = nowIso();
    const remainingInitial = Math.max(0, Number(state.game.mode || 0) - state.game.drawn.length);
    const timing = finalExtractionTiming(remainingInitial);
    const now = Date.now();
    state.status = 'finalizing';
    state.game.phase = 'BINGO_CONFIRMED';
    state.transition = {
      id: randomId('transition'), type: 'final-balls', startedAt,
      initialDrawnCount: state.game.drawn.length,
      remainingInitial,
      intervalMs: timing.intervalMs,
      leadInEndsAt: new Date(now + timing.leadInMs).toISOString(),
      endsAt: new Date(now + timing.totalMs).toISOString()
    };
    logEvent('bingo_confirmed_final_extraction', { claimId: bingoClaim.id, cardId: bingoClaim.cardId, cardNumber: bingoClaim.cardNumber, remainingBalls: remainingInitial, leadInMs: timing.leadInMs, intervalMs: timing.intervalMs });
  } else if (state.game.drawn.length >= state.game.mode) {
    state.status = 'finished';
    state.pauseReason = null;
    state.game.phase = 'ROUND_END';
    state.endedAt = nowIso();
    state.transition = null;
    logEvent('game_finished', { round: state.round, balls: state.game.drawn.length, afterFinalClaims: true });
    archiveCurrentResults();
  } else {
    state.status = 'paused';
    state.game.phase = 'PAUSED';
    const winnerApprovedInWindow = state.claims.some(item => item.claimWindowId === claim.claimWindowId && item.status === 'confirmed');
    if (winnerApprovedInWindow) scheduleClaimAutoResume();
  }
  saveState();
  broadcast();
  if (state.status === 'finalizing') scheduleTransition();
  return claim;
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

function claimAuditRowsFor(claim) {
  return state.claims
    .filter(item => item.type === claim.type && item.claimWindowId && item.claimWindowId === claim.claimWindowId)
    .sort((a, b) => Number(a.receivedSequence || 0) - Number(b.receivedSequence || 0))
    .map(item => ({
      id: item.id,
      sequence: Number(item.receivedSequence) || null,
      playerName: item.playerName,
      cardNumber: item.cardNumber,
      receivedAt: item.receivedAt || item.createdAt || null,
      deltaMs: Number(item.deltaFromFirstMs) || 0,
      officialValid: Boolean(item.officialValid),
      status: item.status,
      resolutionReason: item.resolutionReason || null,
      winner: item.id === claim.id
    }));
}

function winnerDetails(claim) {
  const card = state.game?.cards?.find(item => item.id === claim.cardId) || null;
  const drawnAtClaim = Array.isArray(claim.drawnAtClaim) ? claim.drawnAtClaim : [];
  const details = winningDetailsForClaim(claim);
  return {
    type: claim.type,
    automatic: Boolean(claim.automatic),
    tieGroupId: claim.tieGroupId || null,
    resolutionReason: claim.resolutionReason || null,
    prizeNumber: Number(claim.prizeNumber) || 1,
    prizeLabel: claim.prizeLabel || prizeLabelFor(claim.type, claim.prizeNumber, state.game?.mode),
    playerName: claim.playerName,
    cardId: claim.cardId,
    cardNumber: claim.cardNumber,
    claimedAt: claim.receivedAt || claim.createdAt || null,
    receivedSequence: Number(claim.receivedSequence) || null,
    deltaFromFirstMs: Number(claim.deltaFromFirstMs) || 0,
    claimAlerts: claimAuditRowsFor(claim),
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
  if (state.status !== 'finished') throw new Error('El acta se habilita cuando termina la extracción final de bolillas.');
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
    claimMode: state.roomSettings?.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual',
    status: state.status, presenter: PRESENTER_ID, createdAt: state.createdAt, startedAt: state.startedAt, endedAt: state.endedAt,
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
    claimAlerts: state.claims.slice().sort((a, b) => Number(a.receivedSequence || 0) - Number(b.receivedSequence || 0)).map(claim => ({
      sequence: Number(claim.receivedSequence) || null, type: claim.type, prizeLabel: claim.prizeLabel, playerName: claim.playerName, cardNumber: claim.cardNumber, receivedAt: claim.receivedAt || claim.createdAt || null, deltaMs: Number(claim.deltaFromFirstMs) || 0, officialValid: Boolean(claim.officialValid), status: claim.status, resolutionReason: claim.resolutionReason || null
    })),
    integrity: publicIntegrityPayload(),
    demo: Boolean(state.demo || currentWorkspace().isDemo),
    markingPolicy: markingPolicyPayload(),
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

function formatLocalTimeMs(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: BINGO_TIMEZONE,
      hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
      hour12: false
    }).format(new Date(value));
  } catch {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : `${formatLocalTime(value)}.${String(date.getMilliseconds()).padStart(3, '0')}`;
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

function claimAuditResultLabel(alert) {
  if (alert?.resolutionReason === 'automatic_same_ball') return 'GANADOR · AUTOMÁTICO · EMPATE MISMA BOLILLA';
  if (alert?.resolutionReason === 'automatic_verified') return 'GANADOR · VERIFICACIÓN AUTOMÁTICA';
  if (alert?.resolutionReason === 'automatic_rejected') return 'RECHAZADO · VERIFICACIÓN AUTOMÁTICA';
  if (alert?.status === 'confirmed') return 'GANADOR';
  if (alert?.resolutionReason === 'valid_but_received_later') return 'VÁLIDA POSTERIOR';
  if (alert?.resolutionReason === 'rejected_by_admin') return alert?.officialValid ? 'VÁLIDO · RECHAZADO POR ADMIN' : 'RECHAZADO POR ADMIN';
  if (alert?.resolutionReason === 'invalid_card') return 'INVÁLIDO';
  return alert?.resolutionReason || alert?.status || '—';
}

function actaCsv() {
  const acta = actaPayload();
  const lines = [
    ['LA GORDA - BINGO ONLINE - RESULTADOS'],
    ['Sala', acta.roomCode],
    ['Juego', acta.gameNumber],
    ['Ronda', acta.round],
    ['Bingo', acta.mode],
    ['Sistema de reclamos', acta.claimMode === 'automatic_ties' ? 'AUTOMÁTICO + EMPATES' : 'TRADICIONAL'],
    ['Inicio', formatLocalTimestamp(acta.startedAt)],
    ['Finalización', formatLocalTimestamp(acta.endedAt)],
    ['Jugadores', acta.totalPlayers],
    ['Cartones activos', acta.activeCards],
    ['Sello SHA-256', acta.integrity?.commitment || ''],
    ['Sorteo verificado', acta.integrity?.verified ? 'SÍ' : 'NO'],
    ['Orden sellado', (acta.integrity?.drawOrder || []).join(' · ')],
    [],
    ['ORDEN', 'BOLILLA', 'FECHA Y HORA'],
    ...acta.balls.map(row => [row.order, row.number, formatLocalTimestamp(row.at)]),
    [],
    ['ESTADO DE JUGADAS'],
    ...Object.values(acta.categories).map(category => [category.label, !category.enabled ? 'No sorteada' : category.winners.length ? `${category.winners.length} ganador(es)` : 'Sin ganador confirmado']),
    [],
    ['GANADORES'],
    ['JUGADA', 'JUGADOR', 'CARTÓN', 'HORA SERVIDOR', 'SECUENCIA', 'BOLILLA'],
    ...acta.winners.map(winner => [winner.prizeLabel, winner.playerName, winner.cardNumber, formatLocalTimeMs(winner.claimedAt), winner.receivedSequence, winner.ballNumber]),
    [],
    ['TODAS LAS ALERTAS DE JUGADAS'],
    ['SECUENCIA', 'JUGADA', 'JUGADOR', 'CARTÓN', 'HORA SERVIDOR', 'DIFERENCIA MS', 'VALIDACIÓN', 'RESULTADO'],
    ...acta.claimAlerts.map(alert => [alert.sequence, alert.prizeLabel, alert.playerName, alert.cardNumber, formatLocalTimeMs(alert.receivedAt), alert.deltaMs, alert.officialValid ? 'VÁLIDO' : 'INVÁLIDO', claimAuditResultLabel(alert)]),
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
    ['LA GORDA - BINGO ONLINE - JUGADORES Y CARTONES'],
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
  text(acta.demo ? 'DEMOSTRACIÓN - SIN VALIDEZ OFICIAL' : 'LA GORDA - BINGO ONLINE', 101, 47, 11, { bold: true, color: '#F7DDF0' });
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
    text(`Cartón ${winner.cardNumber} · ${formatLocalTimeMs(winner.claimedAt)} · #${winner.receivedSequence || '—'}`, x + 6, y + 17, metaSize, { color: COLORS.muted, maxWidth: width - 12 });
    const ballText = winner.ballOrder ? `Bolilla ${winner.ballNumber} (salida ${winner.ballOrder})` : 'Momento de canto no disponible';
    text(ballText, x + 6, y + 27, metaSize, { color: winner.type === 'bingo' ? COLORS.pink : COLORS.purple2, bold: true, maxWidth: width - 12 });
    const audit = Array.isArray(winner.claimAlerts) ? winner.claimAlerts : [];
    const otherAlerts = audit.filter(item => !item.winner);
    const auditWidth = !compact && width >= 120 && otherAlerts.length ? Math.min(58, width * .38) : 0;
    const compactAuditHeight = compact && otherAlerts.length ? Math.min(42, 15 + Math.min(3, otherAlerts.length) * 9) : 0;
    if (auditWidth) {
      rect(x + width - auditWidth - 4, y + 37, auditWidth, Math.max(28, height - 42), '#FBF7FC', '#D9CBE2', .5);
      text('OTRAS ALERTAS', x + width - auditWidth / 2 - 4, y + 41, 4.7, { bold: true, color: COLORS.purple2, align: 'center' });
      otherAlerts.slice(0, 4).forEach((item, index) => {
        const result = item.officialValid ? `+${item.deltaMs} ms · ${item.resolutionReason === 'valid_but_received_later' ? 'VÁLIDA POSTERIOR' : 'VÁLIDA'}` : 'INVÁLIDO';
        text(`#${item.sequence} ${formatLocalTimeMs(item.receivedAt)}`, x + width - auditWidth, y + 52 + index * 15, 4.2, { color: COLORS.ink, maxWidth: auditWidth - 7 });
        text(`${item.cardNumber} · ${result}`, x + width - auditWidth, y + 58 + index * 15, 4.0, { color: item.officialValid ? COLORS.purple2 : COLORS.red, maxWidth: auditWidth - 7 });
      });
    } else if (compactAuditHeight) {
      const ay = y + height - compactAuditHeight - 4;
      rect(x + 5, ay, width - 10, compactAuditHeight, '#FBF7FC', '#D9CBE2', .5);
      text('OTRAS ALERTAS RECIBIDAS', x + width / 2, ay + 3, 4.5, { bold: true, color: COLORS.purple2, align: 'center', maxWidth: width - 16 });
      otherAlerts.slice(0, 3).forEach((item, index) => {
        const result = item.officialValid ? `+${item.deltaMs} ms · VÁLIDA POSTERIOR` : 'INVÁLIDA';
        text(`#${item.sequence} · ${formatLocalTimeMs(item.receivedAt)} · Cartón ${item.cardNumber} · ${result}`, x + 9, ay + 12 + index * 9, 4.1, { color: item.officialValid ? COLORS.purple2 : COLORS.red, maxWidth: width - 18 });
      });
    }

    const grid = Array.isArray(winner.grid) ? winner.grid : [];
    const rowCount = Number(winner.mode) === 75 ? 5 : 3;
    const colCount = Number(winner.mode) === 75 ? 5 : 9;
    const gridTop = y + (compact ? 37 : 39);
    const gridBottomSpace = 5 + compactAuditHeight;
    const maxGridH = Math.max(18, height - (gridTop - y) - gridBottomSpace);
    const maxGridW = width - 12 - auditWidth;
    const cellW = Math.min(maxGridW / colCount, (Number(winner.mode) === 75 ? maxGridH / rowCount * 1.12 : maxGridH / rowCount * 1.55));
    const cellH = Math.min(maxGridH / rowCount, Number(winner.mode) === 75 ? cellW : cellW * .64);
    const actualW = cellW * colCount;
    const actualH = cellH * rowCount;
    const gx = x + 6 + Math.max(0, (maxGridW - actualW) / 2);
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
  text(acta.demo ? 'DEMO' : 'LA GORDA - BINGO ONLINE', 818, 582, 5.8, { bold: true, color: COLORS.purple2, align: 'right' });

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
  return `LA_GORDA_BINGO_ONLINE_Resultados_${date}_Sala_${state.roomCode || 'sala'}.pdf`;
}

function actaPdf() {
  return buildResultsPdf();
}

function sendBuffer(res, status, buffer, contentType, filename, disposition = 'attachment') {
  const safeDisposition = disposition === 'inline' ? 'inline' : 'attachment';
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Content-Disposition': `${safeDisposition}; filename="${filename}"`,
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
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg'
};

function safeInlineJson(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function accessErrorMarkup(message) {
  return message ? `<div class="error">${escapeHtml(message)}</div>` : '';
}

function accessRoomMetaMarkup(roomState) {
  const settings = roomState?.roomSettings || {};
  const mode = Number(roomState?.game?.mode) === 75 ? 75 : 90;
  const lineCount = mode === 90 ? Math.max(1, Number(settings.linePrizeCount) || 1) : 1;
  const marking = settings.markingMode === 'manual_only' ? 'Manual' : 'Manual / automático';
  return `<div class="roomMeta"><span class="chip">${mode} bolas</span><span class="chip">${lineCount} línea${lineCount === 1 ? '' : 's'}</span><span class="chip">GRATIS</span><span class="chip">${marking}</span></div>`;
}

function playerAccessContent({ workspace = null, error = '', direct = false, closed = false } = {}) {
  if (!workspace) {
    const waBase = communityWhatsappContactUrl();
    const waText = 'Hola. Ya tengo cartones para una partida de El Bingo de la Gorda pero perdí mi acceso. ¿Me podés enviar un nuevo link de recuperación?';
    const help = waBase ? `<a class="btn primary" href="${waBase}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">PEDIR NUEVO LINK POR WHATSAPP</a>` : '';
    return `<h2>Tu acceso es personal</h2>
      <p class="lead">Para entrar a una partida, abrí el link privado que te envió el administrador por WhatsApp.</p>
      ${accessErrorMarkup(error)}
      <div class="notice"><b>NO NECESITÁS CLAVE</b><br>Cada link ya identifica tu partida y la cantidad máxima de cartones que podés elegir. Si cambiaste de dispositivo, pedile al administrador un nuevo enlace de recuperación.</div>${help}`;
  }
  const roomState = workspace.state || {};
  const settings = roomState.roomSettings || {};
  if (closed) {
    const wa = String(settings.whatsapp || communityWhatsappNumber() || '').replace(/\D/g,'');
    const help = wa ? `<a class="btn primary" href="https://wa.me/${wa}?text=${encodeURIComponent(`Hola. Ya estaba inscripto/a en la sala ${roomState.roomCode || ''} y necesito recuperar mi acceso.`)}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">PEDIR NUEVO LINK POR WHATSAPP</a>` : '';
    return `<h2>Inscripciones cerradas</h2><p class="lead">Esta sala ya no acepta jugadores nuevos.</p>${accessRoomMetaMarkup(roomState)}${accessErrorMarkup(error)}<div class="notice"><b>¿YA ESTABAS INSCRIPTO?</b><br>No necesitás volver a anotarte. Entrá desde tu link o sesión privada. Si la perdiste, el administrador puede enviarte un enlace de recuperación.</div>${help}`;
  }
  const maxCards = settings.markingMode === 'manual_only' ? 2 : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(settings.maxCardsPerPlayer) || MAX_CARDS_PER_PLAYER));
  const options = Array.from({ length:maxCards }, (_, index) => index + 1).map(count => `<option value="${count}" ${count === Math.min(2,maxCards) ? 'selected' : ''}>${count} cartón${count === 1 ? '' : 'es'}</option>`).join('');
  const roomInfo = `<div class="notice"><b>PARTIDA GRATUITA</b><br>Después de entrar vas a poder elegir tus cartones directamente.</div>`;
  return `<h2>${direct ? 'Acceso directo listo' : 'Clave correcta'}</h2>
    <p class="lead">Escribí tu nombre y elegí cuántos cartones querés.</p>
    ${accessRoomMetaMarkup(roomState)}
    ${accessErrorMarkup(error)}
    <form method="post" action="/jugador/entrar" autocomplete="off">
      <input type="hidden" name="roomCode" value="${escapeHtml(roomState.roomCode || '')}">
      <div class="field"><label for="playerName">TU NOMBRE O APODO</label><input id="playerName" name="name" maxlength="20" required minlength="2" autofocus placeholder="Ej.: Laura"></div>
      <div class="field"><label for="cardCount">CANTIDAD DE CARTONES</label><select id="cardCount" name="cardCount">${options}</select></div>
      <button class="btn primary" type="submit">ENTRAR A LA SALA</button>
    </form>
    ${roomInfo}
    ${direct ? '' : '<a class="back" href="/jugador">← Cambiar clave</a>'}`;
}

function playerRecoveryContent({ workspace = null, token = '', error = '' } = {}) {
  const player = workspace?.state?.players?.find(item => item.directAccessToken === token) || null;
  if (!workspace || !player) {
    const waBase = communityWhatsappContactUrl();
    const help = waBase ? `<a class="btn primary" href="${waBase}?text=${encodeURIComponent('Hola. Mi enlace de recuperación de El Bingo de la Gorda venció o ya fue usado. ¿Me podés enviar uno nuevo?')}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">PEDIR NUEVO LINK POR WHATSAPP</a>` : '';
    return `<h2>Enlace no disponible</h2>${accessErrorMarkup(error || 'Este enlace venció o ya fue utilizado. Pedile uno nuevo al administrador.')}${help}<a class="btn secondary" href="/jugador" style="text-decoration:none;text-align:center">VOLVER AL INGRESO</a>`;
  }
  return `<h2>Recuperar acceso</h2>
    <p class="lead">Vas a recuperar la sesión de <b>${escapeHtml(playerDisplayName(player))}</b> en la sala ${escapeHtml(workspace.state.roomCode || '')}.</p>
    <div class="notice"><b>IMPORTANTE</b><br>Este enlace funciona una sola vez. Al recuperarlo, cualquier sesión anterior de este jugador quedará cerrada.</div>
    ${accessErrorMarkup(error)}
    <form method="post" action="/jugador/recuperar" autocomplete="off">
      <input type="hidden" name="recoveryToken" value="${escapeHtml(token)}">
      <button class="btn primary" type="submit">RECUPERAR MI ACCESO</button>
    </form>`;
}

function servePlayerRecoveryPage(res, options = {}) {
  const filePath = path.join(ROOT, 'acceso.html');
  fs.readFile(filePath, 'utf8', (error, html) => {
    if (error) return sendJson(res, 500, { error: 'No se pudo abrir la recuperación.' });
    const output = html.replace('<!--ACCESS_CONTENT-->', playerRecoveryContent(options));
    res.writeHead(200, {
      'Content-Type':'text/html; charset=utf-8',
      'Content-Length':Buffer.byteLength(output),
      'Cache-Control':'no-store, max-age=0',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'same-origin'
    });
    res.end(output);
  });
}

function serveInvitationActivationPage(res, player, inviteToken, activationToken) {
  const safeName = escapeHtml(playerDisplayName(player));
  const action = `/invitacion/${encodeURIComponent(String(inviteToken || ''))}`;
  const safeActivation = escapeHtml(activationToken);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#070914"><meta name="robots" content="noindex,nofollow,noarchive"><title>Entrando · EL BINGO DE LA GORDA</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#2c2052,#070914 55%,#02040a);color:#fff;font-family:Segoe UI,Arial,sans-serif;padding:18px;box-sizing:border-box}.box{width:min(460px,100%);background:#11182b;border:1px solid #ffffff24;border-radius:20px;padding:24px;text-align:center;box-shadow:0 20px 70px #0008}.box img{width:92px}.box h1{font-size:24px;margin-bottom:8px}.box p{color:#bac4d8;line-height:1.5}.spinner{width:38px;height:38px;border:4px solid #ffffff22;border-top-color:#ffca2f;border-radius:50%;margin:18px auto;animation:gira .8s linear infinite}.btn{display:inline-block;margin-top:10px;padding:12px 16px;border:0;border-radius:12px;background:#ffca2f;color:#241700;font-weight:900;cursor:pointer}@keyframes gira{to{transform:rotate(360deg)}}</style></head><body><main class="box"><img src="/assets/logo.webp" alt="EL BINGO DE LA GORDA" title="Volver a Comunidad" style="cursor:pointer" onclick="location.href='/comunidad?quedar=1'"><h1>Entrando a la partida</h1><p>Hola <b>${safeName}</b>. Estamos preparando tu sala privada.</p><div class="spinner" aria-hidden="true"></div><form id="activateInvite" method="post" action="${action}" autocomplete="off"><input type="hidden" name="activationToken" value="${safeActivation}"><noscript><button class="btn" type="submit">ENTRAR A LA PARTIDA</button></noscript></form></main><script>(()=>{const f=document.getElementById('activateInvite');const go=()=>{try{if(f.requestSubmit)f.requestSubmit();else f.submit()}catch{f.submit()}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(go,40),{once:true});else setTimeout(go,40)})();</script></body></html>`;
  res.writeHead(200, {
    'Content-Type':'text/html; charset=utf-8',
    'Content-Length':Buffer.byteLength(html),
    'Cache-Control':'no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'X-Robots-Tag':'noindex, nofollow, noarchive'
  });
  res.end(html);
}

function serveInvitationErrorPage(res, message) {
  const safe = escapeHtml(String(message || 'No se pudo abrir la invitación.'));
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#070914"><title>EL BINGO DE LA GORDA</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#2c2052,#070914 55%,#02040a);color:#fff;font-family:Segoe UI,Arial,sans-serif;padding:18px;box-sizing:border-box}.box{width:min(480px,100%);background:#11182b;border:1px solid #ffffff24;border-radius:20px;padding:24px;text-align:center;box-shadow:0 20px 70px #0008}.box img{width:92px}.box h1{font-size:24px}.box p{color:#bac4d8;line-height:1.5}.btn{display:inline-block;margin-top:10px;padding:12px 16px;border-radius:12px;background:#ffca2f;color:#241700;font-weight:900;text-decoration:none}</style></head><body><main class="box"><img src="/assets/logo.webp" alt="EL BINGO DE LA GORDA" title="Volver a Comunidad" style="cursor:pointer" onclick="location.href='/comunidad?quedar=1'"><h1>No se pudo abrir la invitación</h1><p>${safe}</p></main></body></html>`;
  res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store, max-age=0' });
  res.end(html);
}

function servePlayerAccessPage(res, options = {}) {
  const filePath = path.join(ROOT, 'acceso.html');
  fs.readFile(filePath, 'utf8', (error, html) => {
    if (error) return sendJson(res, 500, { error: 'No se pudo abrir la pantalla de acceso.' });
    const output = html.replace('<!--ACCESS_CONTENT-->', playerAccessContent(options));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(output),
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin'
    });
    res.end(output);
  });
}

function serveDemoPlayerPage(res, initialState, directToken = '') {
  return serveFile(res, path.join(ROOT, 'player.html'));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
}


function serveFile(res, filePath) {
  const normalized = path.normalize(filePath);
  const assetRoot = `${path.join(ROOT, 'assets')}${path.sep}`;
  const jsRoot = `${path.join(ROOT, 'js')}${path.sep}`;
  const cssRoot = `${path.join(ROOT, 'css')}${path.sep}`;
  const allowedHtml = new Set([
    path.join(ROOT, 'admin.html'),
    path.join(ROOT, 'evento-admin.html'),
    path.join(ROOT, 'evento.html'),
    path.join(ROOT, 'evento-conductor.html'),
    path.join(ROOT, 'evento-transmision.html'),
    path.join(ROOT, 'evento-tv.html'),
    path.join(ROOT, 'acceso.html'),
    path.join(ROOT, 'player.html'),
    path.join(ROOT, 'cast-receiver.html'),
    path.join(ROOT, 'transmision.html'),
    path.join(ROOT, 'tv.html'),
    path.join(ROOT, 'reglamento.html'),
    path.join(ROOT, 'demo.html'),
    path.join(ROOT, 'comunidad.html')
  ]);
  const allowed = allowedHtml.has(normalized) || normalized.startsWith(assetRoot) || normalized.startsWith(jsRoot) || normalized.startsWith(cssRoot);
  if (!allowed) return sendJson(res, 403, { error: 'Acceso denegado.' });
  fs.stat(normalized, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: 'Archivo no encontrado.' });
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(normalized).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ['.html', '.js'].includes(path.extname(normalized).toLowerCase()) ? 'no-store, max-age=0' : 'public, max-age=300',
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

function findWorkspaceByAccessKey(accessKey) {
  const normalized = normalizeAccessKey(accessKey);
  if (!normalized) return null;
  return [...workspaces.values()].find(workspace => workspace.state?.active && normalizeAccessKey(workspace.state?.roomSettings?.accessKey) === normalized) || null;
}

function findWorkspaceByRecoveryToken(recoveryToken) {
  const token = String(recoveryToken || '').trim();
  if (!token) return null;
  const now = Date.now();
  return [...workspaces.values()].find(workspace => workspace.state?.players?.some(player => player.directAccessToken === token && player.recoveryExpiresAt && new Date(player.recoveryExpiresAt).getTime() > now)) || null;
}

function findWorkspaceByDemoEntryId(entryId) {
  const normalized = String(entryId || '').trim();
  if (!/^demoentry_[a-f0-9]{24}$/.test(normalized)) return null;
  return [...workspaces.values()].find(workspace => workspace.isDemo && String(workspace.state?.demo?.entryId || '') === normalized) || null;
}


function cookieValue(req, name) {
  const header = String(req?.headers?.cookie || '');
  if (!header || !name) return '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return part.slice(separator + 1).trim(); }
  }
  return '';
}

function requestIsSecure(req) {
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return forwarded === 'https' || Boolean(req?.socket?.encrypted);
}

function setDemoSessionCookie(req, res, token) {
  const value = encodeURIComponent(String(token || ''));
  const parts = [
    `${DEMO_SESSION_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${Math.max(60, Math.floor(DEMO_TTL_MS / 1000))}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (requestIsSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearDemoSessionCookie(req, res) {
  const parts = [`${DEMO_SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (requestIsSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function setPlayerSessionCookie(req, res, token) {
  const value = encodeURIComponent(String(token || ''));
  const parts = [
    `${PLAYER_SESSION_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${PLAYER_SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  const demoClear = [`${DEMO_SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (requestIsSecure(req)) { parts.push('Secure'); demoClear.push('Secure'); }
  // Una sesión real siempre reemplaza cualquier DEMO previa en el mismo dispositivo.
  res.setHeader('Set-Cookie', [parts.join('; '), demoClear.join('; ')]);
}

function clearPlayerSessionCookie(req, res) {
  const parts = [`${PLAYER_SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (requestIsSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function playerTokenFrom(req, url) {
  const explicit = String(req.headers['x-player-token'] || url.searchParams.get('token') || '');
  if (explicit) return explicit;
  const demoContext = url.searchParams.get('demo') === '1';
  if (demoContext) {
    // Una pantalla DEMO debe permanecer aislada de cualquier sesión real que exista en el navegador.
    // Si la DEMO venció, no hacemos fallback a una partida real: devolvemos su token y la API responderá 401.
    const demoToken = cookieValue(req, DEMO_SESSION_COOKIE);
    const demoWorkspace = demoToken ? findWorkspaceByPlayerToken(demoToken) : null;
    if (demoWorkspace?.isDemo) return demoToken;
    return demoToken || '';
  }
  // Fuera de DEMO preservamos la regla actual: la partida real tiene prioridad absoluta.
  const playerToken = cookieValue(req, PLAYER_SESSION_COOKIE);
  if (playerToken && findWorkspaceByPlayerToken(playerToken)) return playerToken;
  const demoToken = cookieValue(req, DEMO_SESSION_COOKIE);
  if (demoToken && findWorkspaceByPlayerToken(demoToken)) return demoToken;
  return playerToken || demoToken || '';
}

function publicDemoCreation(result) {
  const copy = { ...(result || {}) };
  delete copy.demoSessionToken;
  delete copy.playerSessionToken;
  delete copy.playerCode;
  return copy;
}

function findWorkspaceByPlayerToken(token) {
  const normalized = String(token || '');
  if (!normalized) return null;
  const view = playerViewSession(normalized);
  if (view) return workspaces.get(view.workspaceId) || null;
  return [...workspaces.values()].find(workspace => workspace.state.players?.some(player => player.sessionToken === normalized)) || null;
}

const COMMUNITY_ACTIVE_RESUME_STATUSES = new Set(['starting','playing','paused','verifying','resuming','finalizing']);
function activePlayerResume(req) {
  const token = String(cookieValue(req, PLAYER_SESSION_COOKIE) || '').trim();
  if (!token) return null;
  const workspace = findWorkspaceByPlayerToken(token);
  if (!workspace || workspace.isDemo || !workspace.state?.active || !COMMUNITY_ACTIVE_RESUME_STATUSES.has(String(workspace.state?.status || ''))) return null;
  const player = workspace.state.players?.find(item => item.sessionToken === token && !item.demoHuman && !item.virtual);
  if (!player || !player.nameSet || !player.selectionConfirmed || !(player.cardIds || []).length) return null;
  return { workspace, player, token, status:String(workspace.state.status || ''), roomCode:String(workspace.state.roomCode || '') };
}
function communityHasExplicitDestination(url) {
  return Boolean(String(url?.searchParams?.get('mesa') || '').trim() || String(url?.searchParams?.get('ver') || '').trim() || url?.searchParams?.get('quedar') === '1');
}

function findWorkspaceByTransfer(requestId, deviceId = '') {
  return [...workspaces.values()].find(workspace => workspace.state.deviceTransferRequests?.some(request => request.id === String(requestId || '') && (!deviceId || request.deviceId === String(deviceId)))) || null;
}

function normalizeBroadcastAlias(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}

function broadcastAliasTaken(alias, exceptWorkspaceId = '') {
  const normalized = normalizeBroadcastAlias(alias);
  return [...workspaces.values()].some(workspace => workspace.id !== exceptWorkspaceId && normalizeBroadcastAlias(workspace.state.roomSettings?.broadcastAlias) === normalized);
}

function freshBroadcastAlias(exceptWorkspaceId = '') {
  let alias = '';
  do { alias = randomNumericCode(6); } while (broadcastAliasTaken(alias, exceptWorkspaceId));
  return alias;
}

function findWorkspaceByBroadcastToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return null;
  const alias = normalizeBroadcastAlias(normalized);
  return [...workspaces.values()].find(workspace => workspace.state.roomSettings?.broadcastToken === normalized || normalizeBroadcastAlias(workspace.state.roomSettings?.broadcastAlias) === alias) || null;
}

function shortBroadcastUrlFor(workspace = currentWorkspace()) {
  const alias = normalizeBroadcastAlias(workspace?.state?.roomSettings?.broadcastAlias);
  return alias ? `${PUBLIC_URL || `http://localhost:${PORT}`}/v/${encodeURIComponent(alias)}` : null;
}

function normalizeCommunityName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (name.length < 2) throw new Error('Escribí un nombre o apodo de al menos 2 caracteres.');
  if (COMMUNITY_RESERVED_NAMES.test(name)) throw new Error('Ese nombre está reservado para mensajes oficiales. Elegí otro.');
  return name;
}



function communityWhatsappGroupUrl() {
  const value = String(platform.community?.whatsappGroup || '').trim();
  return /^https:\/\/(?:chat\.)?whatsapp\.com\//i.test(value) ? value : '';
}

function communityWhatsappNumber() {
  return String(platform.community?.whatsappNumber || ownerWorkspace.state.roomSettings?.whatsapp || '').trim().slice(0, 60);
}

function communityWhatsappContactUrl() {
  const digits = communityWhatsappNumber().replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : '';
}

function communityActiveGamePayload() {
  const candidates = operationalWorkspaces()
    .filter(workspace => {
      const room = workspace.state;
      return room?.active && room.game && room.status !== 'closed' && room.status !== 'finished' && room.roomSettings?.roomOrigin !== 'community';
    })
    .sort((a, b) => {
      const rank = workspace => {
        const room = workspace.state;
        if (room.status === 'waiting' && room.roomSettings?.joinOpen) return 0;
        if (room.status === 'waiting' || room.status === 'starting') return 1;
        return 2;
      };
      return rank(a) - rank(b) || String(a.state.roomSettings?.scheduledAt || a.state.createdAt || '').localeCompare(String(b.state.roomSettings?.scheduledAt || b.state.createdAt || ''));
    });
  const workspace = candidates[0];
  if (!workspace) return null;
  return workspaceContext.run(workspace, () => {
    const current = state;
    const roomType = current.roomSettings?.roomType === 'test' ? 'test' : 'official';
    const canJoin = current.status === 'waiting' && Boolean(current.roomSettings?.joinOpen);
    current.roomSettings.broadcastToken ||= randomId('live');
    current.roomSettings.broadcastAlias ||= freshBroadcastAlias(workspace.id);
    const broadcastToken = current.roomSettings.broadcastToken;
    const schedule = communityScheduledGames().find(item => item.id === String(current.roomSettings?.communityScheduleId || '') || (item.roomCode && item.roomCode === current.roomCode));
    return {
      roomCode: current.roomCode,
      mode: Number(current.game.mode) === 75 ? 75 : 90,
      status: current.status,
      playerCount: Array.isArray(current.players) ? current.players.filter(player => player.selectionConfirmed || roomType === 'test' || player.nameSet).length : 0,
      roomType,
      canJoin,
      joinUrl: canJoin ? (roomType === 'test' ? `/jugador?sala=${encodeURIComponent(current.roomCode)}&prueba=1` : `/jugador?sala=${encodeURIComponent(current.roomCode)}&directo=1`) : '',
      scheduledAt: String(current.roomSettings?.scheduledAt || schedule?.startsAt || ''),
      drawnCount: Array.isArray(current.game?.drawn) ? current.game.drawn.length : 0,
      transmissionUrl: broadcastToken ? `/v/${encodeURIComponent(current.roomSettings.broadcastAlias)}` : '',
      transmissionEnabled: Boolean(broadcastToken)
    };
  });
}

function communityUpcomingGames() {
  const activeRoomCodes = new Set(operationalWorkspaces()
    .filter(workspace => workspace.state?.active)
    .map(workspace => String(workspace.state.roomCode || ''))
    .filter(Boolean));
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  return communityScheduledGames()
    .filter(item => {
      const time = new Date(item.startsAt).getTime();
      if (!Number.isFinite(time) || time < cutoff) return false;
      if (activeRoomCodes.has(String(item.roomCode || ''))) return false;
      return true;
    })
    .sort((a,b) => String(a.startsAt).localeCompare(String(b.startsAt)))
    .slice(0, 5)
    .map(item => ({
      id: item.id,
      startsAt: item.startsAt,
      mode: item.mode,
    }));
}

function pruneCommunityVisitors() {
  const cutoff = Date.now() - COMMUNITY_ONLINE_TTL_MS;
  for (const [id, seenAt] of communityVisitors) if (seenAt < cutoff) communityVisitors.delete(id);
}


function reservedOfficialScheduleCount(now = Date.now()) {
  const freeCount = operationalWorkspaces().filter(workspace => !workspace.state?.active || workspace.state.status === 'closed').length;
  if (!freeCount) return 0;
  const reserved = communityScheduledGames().filter(game => {
    if (game.roomCode) return false;
    const startsMs = new Date(game.startsAt).getTime();
    if (!Number.isFinite(startsMs)) return false;
    const opensMs = startsMs - Math.max(1, Number(game.registrationMinutes) || 15) * 60_000;
    return opensMs >= now && opensMs - now <= COMMUNITY_ROOM_RESERVATION_MS;
  }).length;
  return Math.min(freeCount, reserved);
}

function communityPrivateRoomAvailability() {
  const community = platform.community ||= blankCommunity();
  const free = operationalWorkspaces().filter(workspace => !workspace.state?.active || workspace.state.status === 'closed').length;
  const reserved = reservedOfficialScheduleCount();
  const available = community.privateRoomsEnabled !== false && free > reserved;
  let reason = '';
  if (community.privateRoomsEnabled === false) reason = 'La creación de salas privadas está desactivada.';
  else if (!free) reason = `Las ${MAX_OPERATIONAL_ROOMS} salas están ocupadas.`;
  else if (free <= reserved) reason = 'Los lugares libres están reservados para próximas partidas oficiales.';
  return {
    enabled: community.privateRoomsEnabled !== false,
    available,
    freeSlots: free,
    reservedSlots: reserved,
    maxPlayers: Math.max(2, Math.min(30, Number(community.privateRoomMaxPlayers) || 30)),
    maxCardsPerPlayer: Math.max(1, Math.min(4, Number(community.privateRoomMaxCardsPerPlayer) || 4)),
    reason
  };
}


function normalizeCommunityRoomAccessKey(value) {
  const key = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (key.length < 4) throw new Error('La clave de una sala privada debe tener entre 4 y 12 letras o números.');
  return key;
}

function hashCommunityRoomAccessKey(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function verifyCommunityRoomAccessKey(record, value) {
  if (!record || record.accessType !== 'private' || !record.accessKeyHash) return true;
  const key = normalizeCommunityRoomAccessKey(value);
  if (!safeEqual(hashCommunityRoomAccessKey(key), record.accessKeyHash)) throw new Error('Clave incorrecta.');
  if (!record.accessKeyAdmin) { record.accessKeyAdmin = key; savePlatform(); }
  return true;
}

function createCommunityRoomAccessGrant(record) {
  const token = randomId('roomgrant');
  communityRoomAccessGrants.set(token, { publicId: record.id, expiresAt: Date.now() + COMMUNITY_ROOM_ACCESS_TTL_MS });
  return token;
}

function communityRoomGrantFromReq(req) {
  const token = String(cookieValue(req, COMMUNITY_ROOM_ACCESS_COOKIE) || '').trim();
  const grant = token ? communityRoomAccessGrants.get(token) : null;
  if (!grant || grant.expiresAt <= Date.now()) { if (token) communityRoomAccessGrants.delete(token); return null; }
  return grant;
}

function reqMayAccessPrivateCommunityRoom(req, record) {
  if (!record || record.accessType !== 'private') return true;
  const grant = communityRoomGrantFromReq(req);
  return Boolean(grant && grant.publicId === record.id);
}

function setCommunityRoomAccessCookie(req, res, token) {
  const secure = requestIsSecure(req);
  const attrs = [`${COMMUNITY_ROOM_ACCESS_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.round(COMMUNITY_ROOM_ACCESS_TTL_MS/1000)}`];
  if (secure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function normalizeCommunityRoomName(value, creatorName = '') {
  const roomName = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  return roomName || `Sala de ${normalizeCommunityName(creatorName)}`.slice(0, 30);
}

function communityPublicRoomById(id) {
  const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  return communityPublicRooms().find(item => item.id === safe) || null;
}

function communityPublicShareUrl(id) {
  const base = PUBLIC_URL || `http://localhost:${PORT}`;
  return `${base}/mesa/${encodeURIComponent(String(id || ''))}`;
}

function communityPublicRoomAvailability() {
  const community = platform.community ||= blankCommunity();
  const free = operationalWorkspaces().filter(workspace => !workspace.state?.active || workspace.state.status === 'closed').length;
  const reserved = reservedOfficialScheduleCount();
  return {
    enabled: community.publicRoomsEnabled !== false && community.privateRoomsEnabled !== false,
    available: community.publicRoomsEnabled !== false && community.privateRoomsEnabled !== false && free > reserved,
    maxPlayers: Math.max(2, Math.min(30, Number(community.privateRoomMaxPlayers) || 30)),
    maxCardsPerPlayer: Math.max(1, Math.min(4, Number(community.privateRoomMaxCardsPerPlayer) || 4))
  };
}

function publicScheduleWindow(record) {
  const startsMs = new Date(record?.startsAt || 0).getTime();
  if (!Number.isFinite(startsMs)) return null;
  return { start: startsMs - COMMUNITY_PUBLIC_OPEN_MS, end: startsMs + COMMUNITY_PUBLIC_ESTIMATED_GAME_MS };
}

function officialScheduleWindow(game) {
  const startsMs = new Date(game?.startsAt || 0).getTime();
  if (!Number.isFinite(startsMs)) return null;
  const registrationMinutes = Math.max(1, Math.min(120, Number(game.registrationMinutes) || 15));
  return { start: startsMs - registrationMinutes * 60_000, end: startsMs + COMMUNITY_PUBLIC_ESTIMATED_GAME_MS };
}

function windowsOverlap(a, b) { return Boolean(a && b && a.start < b.end && b.start < a.end); }

function ensurePublicScheduleCapacity(startsMs, exceptId = '') {
  const target = { start: startsMs - COMMUNITY_PUBLIC_OPEN_MS, end: startsMs + COMMUNITY_PUBLIC_ESTIMATED_GAME_MS };
  let planned = 0;
  for (const official of communityScheduledGames()) {
    if (official.roomCode || official.autoStartedAt) continue;
    if (windowsOverlap(target, officialScheduleWindow(official))) planned++;
  }
  for (const record of communityPublicRooms()) {
    if (record.id === exceptId || record.startMode !== 'scheduled' || ['finished','cancelled'].includes(record.status)) continue;
    if (windowsOverlap(target, publicScheduleWindow(record))) planned++;
  }
  if (planned >= MAX_OPERATIONAL_ROOMS) throw new Error('Ese horario no está disponible. Elegí otro.');
}

function publicRoomPayload(record) {
  if (!record) return null;
  const candidate = (record.workspaceId && workspaces.get(record.workspaceId)) || (record.roomCode ? findWorkspaceByRoomCode(record.roomCode) : null);
  const workspace = candidate?.state?.active && String(candidate.state.roomSettings?.communityPublicId || '') === String(record.id) ? candidate : null;
  const room = workspace?.state || null;
  const status = room ? room.status : record.status;
  const waiting = Boolean(room && room.status === 'waiting');
  const joinOpen = Boolean(waiting && room.roomSettings?.joinOpen);
  const broadcastAlias = room ? normalizeBroadcastAlias(room.roomSettings?.broadcastAlias) : '';
  return {
    id: record.id,
    kind: record.accessType === 'private' ? 'private' : 'public',
    accessType: record.accessType === 'private' ? 'private' : 'public',
    requiresKey: record.accessType === 'private',
    name: record.name,
    creatorName: record.creatorName,
    mode: record.mode,
    maxPlayers: record.maxPlayers,
    maxCardsPerPlayer: record.maxCardsPerPlayer,
    autoSeconds: record.autoSeconds,
    claimMode: record.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual',
    linePrizeCount: record.linePrizeCount,
    rules: record.rules,
    startMode: record.startMode,
    startsAt: record.startsAt || '',
    opensAt: record.startMode === 'scheduled' && record.startsAt ? new Date(new Date(record.startsAt).getTime() - COMMUNITY_PUBLIC_OPEN_MS).toISOString() : '',
    roomCode: record.accessType === 'private' ? '' : (room?.roomCode || record.roomCode || ''),
    status: status || 'scheduled',
    playerCount: room ? (room.players || []).length : 0,
    joinOpen,
    joinUrl: joinOpen && record.accessType !== 'private' ? `/jugador?sala=${encodeURIComponent(room.roomCode)}&directo=1` : '',
    transmissionAvailable: Boolean(room && broadcastAlias),
    transmissionUrl: room && broadcastAlias && record.accessType !== 'private' ? `/v/${encodeURIComponent(broadcastAlias)}` : '',
    shareUrl: communityPublicShareUrl(record.id),
    roundNumber: Math.max(1, Number(record.roundNumber) || 1)
  };
}

function communityPublicRoomsPayload() {
  const now = Date.now();
  return communityPublicRooms()
    .map(publicRoomPayload)
    .filter(Boolean)
    .filter(item => {
      if (['waiting','starting','playing','verifying','paused','resuming','finalizing'].includes(item.status)) return true;
      if (item.status !== 'scheduled' || !item.startsAt) return false;
      const starts = new Date(item.startsAt).getTime();
      return Number.isFinite(starts) && starts > now - 10 * 60_000;
    })
    .sort((a,b) => {
      const rank = item => item.status === 'waiting' ? 0 : item.status === 'scheduled' ? 1 : 2;
      return rank(a) - rank(b) || String(a.startsAt || '').localeCompare(String(b.startsAt || '')) || String(a.name).localeCompare(String(b.name));
    })
    .slice(0, 30);
}

function officialLobbyRoomsPayload() {
  const active = operationalWorkspaces().filter(workspace => workspace.state?.active && workspace.state.roomSettings?.roomOrigin !== 'community' && workspace.state.status !== 'closed');
  const activeScheduleIds = new Set(active.map(workspace => String(workspace.state.roomSettings?.communityScheduleId || '')).filter(Boolean));
  const activeCards = active.map(workspace => workspaceContext.run(workspace, () => {
    state.roomSettings.broadcastAlias ||= freshBroadcastAlias(workspace.id);
    const scheduledAt = String(state.roomSettings?.scheduledAt || '');
    return {
      id: `official-${state.roomCode || workspace.id}`,
      kind: 'official', accessType: 'official', requiresKey: false,
      name: 'EL BINGO DE LA GORDA', mode: Number(state.game?.mode) === 75 ? 75 : 90,
      status: state.status, startsAt: scheduledAt, playerCount: (state.players || []).length,
      maxPlayers: Math.max(2, Number(state.roomSettings?.maxOpenPlayers) || MAX_PLAYERS),
      joinOpen: state.status === 'waiting' && Boolean(state.roomSettings?.joinOpen),
      joinUrl: state.status === 'waiting' && state.roomSettings?.joinOpen ? `/jugador?sala=${encodeURIComponent(state.roomCode)}&directo=1` : '',
      transmissionAvailable: true, transmissionUrl: shortBroadcastUrlFor(workspace) || '', shareUrl: '',
    };
  }));
  const upcoming = communityScheduledGames().filter(game => !activeScheduleIds.has(String(game.id || '')) && !game.roomCode && new Date(game.startsAt).getTime() > Date.now() - 10 * 60_000).map(game => ({
    id:`official-scheduled-${game.id}`, kind:'official', accessType:'official', requiresKey:false,
    name:'EL BINGO DE LA GORDA', mode:Number(game.mode) === 75 ? 75 : 90, status:'scheduled', startsAt:game.startsAt,
    playerCount:0, maxPlayers:MAX_PLAYERS, joinOpen:false, joinUrl:'', transmissionAvailable:false, transmissionUrl:'', shareUrl:'',
  }));
  return [...activeCards, ...upcoming];
}

function communityLobbyRoomsPayload() {
  const communityRooms = communityPublicRoomsPayload();
  const rooms = [...officialLobbyRoomsPayload(), ...communityRooms];
  const rank = item => item.kind === 'official' ? 0 : item.status === 'waiting' ? 1 : item.status === 'scheduled' ? 2 : 3;
  return rooms.sort((a,b) => rank(a)-rank(b) || String(a.startsAt || '').localeCompare(String(b.startsAt || '')) || String(a.name || '').localeCompare(String(b.name || ''))).slice(0, 40);
}

function syncCommunityPublicRecordFromState(finalStatus = '') {
  if (state.roomSettings?.roomOrigin !== 'community' || !state.roomSettings?.communityPublicId) return null;
  const record = communityPublicRoomById(state.roomSettings.communityPublicId);
  if (!record) return null;
  record.roomCode = state.roomCode || record.roomCode;
  record.workspaceId = currentWorkspace().id;
  record.openedAt ||= state.createdAt || nowIso();
  if (state.startedAt) record.startedAt = state.startedAt;
  if (state.endedAt) record.endedAt = state.endedAt;
  record.status = finalStatus || (state.status === 'waiting' ? 'waiting' : state.status === 'finished' ? 'finished' : state.status === 'closed' ? 'cancelled' : 'playing');
  record.updatedAt = nowIso();
  savePlatform();
  return record;
}

function openCommunityPublicRoom(record, { autoJoinCreator = false, deviceId = '' } = {}) {
  if (!record) throw new Error('La sala ya no existe.');
  if (record.roomCode) {
    const existing = (record.workspaceId && workspaces.get(record.workspaceId)) || findWorkspaceByRoomCode(record.roomCode);
    if (existing?.state?.active) return { workspace: existing, playerSessionToken: '' };
  }
  const availability = communityPublicRoomAvailability();
  if (!availability.available) throw new Error('Ahora no hay salas disponibles. Probá de nuevo en un rato.');
  const workspace = freeOperationalWorkspace();
  if (!workspace) throw new Error('Ahora no hay salas disponibles. Probá de nuevo en un rato.');
  let playerSessionToken = '';
  workspaceContext.run(workspace, () => {
    createSimpleRoom({
      mode: record.mode,
      cardCount: normalizedGeneratedCount(Math.max(25, Math.min(100, record.maxPlayers * record.maxCardsPerPlayer + 20))),
      autoSeconds: record.autoSeconds,
      claimMode: record.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual',
      rules: record.rules,
      linePrizeCount: record.linePrizeCount,
      markingMode: 'normal',
      maxCardsPerPlayer: record.maxCardsPerPlayer,
      roomOrigin: 'community',
      hostName: record.creatorName,
      roomName: record.name,
      communityPublicId: record.id,
      communityStartMode: record.startMode,
      communityAccessType: record.accessType,
      scheduledAt: record.startsAt || '',
      maxOpenPlayers: record.maxPlayers
    });
    state.communityCreatorCodeHash = record.creatorCodeHash;
    state.communityAccessKeyHash = record.accessKeyHash || null;
    // El creador organiza la sala con su código, pero no ocupa un lugar de jugador
    // hasta que elija explícitamente "Ingresar a jugar".
    state.communityHostKeyHash = null;
    state.communityHostName = '';
    state.communityHostExpiresAt = null;
    state.roomSettings.joinOpen = true;
    if (autoJoinCreator) {
      const joined = openJoinPlayer({ name: record.creatorName, cardCount: record.maxCardsPerPlayer, deviceId: String(deviceId || randomId('device')).slice(0,120), communityAccessGranted:true });
      state.communityCreatorPlayerId = joined.state?.player?.id || null;
      playerSessionToken = joined.token;
    }
    logEvent('community_public_room_opened', { publicRoomId:record.id, name:record.name, startMode:record.startMode, startsAt:record.startsAt || null, maxPlayers:record.maxPlayers });
    saveState(); broadcast();
  });
  record.workspaceId = workspace.id;
  record.roomCode = workspace.state.roomCode;
  record.openedAt = nowIso();
  record.status = 'waiting';
  record.updatedAt = nowIso();
  savePlatform();
  return { workspace, playerSessionToken };
}

function createCommunityPublicRoom(payload = {}) {
  const availability = communityPublicRoomAvailability();
  if (!availability.enabled) throw new Error('Ahora no se pueden crear salas.');
  const creatorName = normalizeCommunityName(payload.name);
  const roomName = normalizeCommunityRoomName(payload.roomName, creatorName);
  const mode = Number(payload.mode) === 75 ? 75 : 90;
  const maxPlayers = Math.max(2, Math.min(availability.maxPlayers, Math.round(Number(payload.maxPlayers) || Math.min(20, availability.maxPlayers))));
  const maxCardsPerPlayer = Math.max(1, Math.min(availability.maxCardsPerPlayer, Math.round(Number(payload.maxCardsPerPlayer) || availability.maxCardsPerPlayer)));
  const autoSeconds = Math.max(4, Math.min(20, Math.round(Number(payload.autoSeconds) || 8)));
  const linePrizeCount = mode === 90 ? Math.max(1, Math.min(2, Math.round(Number(payload.linePrizeCount) || 1))) : 1;
  const requestedRules = payload.rules && typeof payload.rules === 'object' ? payload.rules : {};
  const rules = mode === 90
    ? roomRulesFor(90, { ambocabeza:Boolean(requestedRules.ambocabeza), line:requestedRules.line !== false, bingo:true })
    : roomRulesFor(75, { line:requestedRules.line !== false, corners:Boolean(requestedRules.corners), doubleLine:Boolean(requestedRules.doubleLine), tripleLine:Boolean(requestedRules.tripleLine), bingo:true });
  const accessType = payload.accessType === 'private' ? 'private' : 'public';
  const accessKey = accessType === 'private' ? normalizeCommunityRoomAccessKey(payload.accessKey) : '';
  const accessKeyHash = accessType === 'private' ? hashCommunityRoomAccessKey(accessKey) : '';
  const startMode = payload.startMode === 'scheduled' ? 'scheduled' : 'manual';
  let startsAt = '';
  if (startMode === 'scheduled') {
    const starts = new Date(payload.startsAt || '');
    if (!Number.isFinite(starts.getTime())) throw new Error('Elegí el horario de inicio.');
    const lead = starts.getTime() - Date.now();
    if (lead < (TEST_MODE ? 1_000 : 60_000)) throw new Error('Elegí un horario posterior al actual.');
    if (lead > COMMUNITY_PUBLIC_MAX_AHEAD_MS) throw new Error('Podés programar una sala con hasta 36 horas de anticipación.');
    ensurePublicScheduleCapacity(starts.getTime());
    startsAt = starts.toISOString();
  }
  const creatorCode = randomCode(7);
  const creatorCodeHash = crypto.createHash('sha256').update(creatorCode).digest('hex');
  const record = normalizeCommunityPublicRoom({
    id: randomId('public'), name:roomName, creatorName, creatorCodeHash, accessType, accessKeyHash, accessKeyAdmin:accessKey, startMode, startsAt,
    mode, maxPlayers, maxCardsPerPlayer, autoSeconds, claimMode: payload.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual', linePrizeCount, rules,
    status:'scheduled', createdAt:nowIso(), updatedAt:nowIso()
  });
  communityPublicRooms().push(record);
  if (communityPublicRooms().length > 120) communityPublicRooms().splice(0, communityPublicRooms().length - 120);
  let playerSessionToken = '';
  const shouldOpenNow = startMode === 'manual' || (new Date(startsAt).getTime() - Date.now() <= COMMUNITY_PUBLIC_OPEN_MS);
  if (shouldOpenNow) {
    try {
      const opened = openCommunityPublicRoom(record, { autoJoinCreator:false, deviceId:String(payload.visitorId || '').slice(0,120) });
      playerSessionToken = opened.playerSessionToken;
    } catch (error) {
      const index = communityPublicRooms().findIndex(item => item.id === record.id);
      if (index >= 0) communityPublicRooms().splice(index, 1);
      savePlatform();
      throw error;
    }
  } else savePlatform();
  const publicPayload = publicRoomPayload(record);
  return {
    ...publicPayload,
    creatorCode,
    creatorCodeHint:'Guardalo para recuperar tu sala desde otro dispositivo.',
    enterNow:Boolean(record.roomCode),
    playerSessionToken
  };
}

function verifyCommunityCreatorCode(record, creatorCode) {
  if (!record || !record.creatorCodeHash) throw new Error('No se encontró esa sala.');
  const code = normalizeAccessKey(creatorCode || '');
  const digest = crypto.createHash('sha256').update(code).digest('hex');
  if (!safeEqual(digest, record.creatorCodeHash)) throw new Error('Código de creador incorrecto.');
  return code;
}

function cancelCommunityPublicRoom(payload = {}) {
  const publicId = String(payload.publicId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0,100);
  const record = communityPublicRoomById(publicId);
  verifyCommunityCreatorCode(record, payload.creatorCode);
  if (['finished','cancelled'].includes(record.status)) throw new Error('Esta sala ya terminó.');
  const workspace = (record.workspaceId && workspaces.get(record.workspaceId)) || (record.roomCode ? findWorkspaceByRoomCode(record.roomCode) : null);
  if (workspace?.state?.active && String(workspace.state.roomSettings?.communityPublicId || '') === record.id) {
    return workspaceContext.run(workspace, () => {
      if (state.status === 'finished') throw new Error('Esta partida ya terminó.');
      const wasStarted = Boolean(state.startedAt) || state.status !== 'waiting';
      state.closedReason = 'creator_cancelled';
      state.roomSettings.joinOpen = false;
      logEvent('community_public_room_cancelled_by_creator', { publicRoomId:record.id, wasStarted });
      closeRoom();
      record.status = 'cancelled';
      record.endedAt = state.endedAt || nowIso();
      record.updatedAt = nowIso();
      savePlatform();
      return { ok:true, publicId:record.id, status:'cancelled', wasStarted, message:wasStarted?'Partida finalizada.':'Sala cancelada.' };
    });
  }
  record.status = 'cancelled';
  record.endedAt = nowIso();
  record.updatedAt = record.endedAt;
  record.roomCode = '';
  record.workspaceId = '';
  savePlatform();
  return { ok:true, publicId:record.id, status:'cancelled', wasStarted:false, message:'Sala cancelada.' };
}

function recoverCommunityCreator(payload = {}) {
  const publicId = String(payload.publicId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0,100);
  const roomCode = String(payload.roomCode || '').trim().toUpperCase();
  const record = publicId ? communityPublicRoomById(publicId) : communityPublicRooms().find(item => String(item.roomCode || '').toUpperCase() === roomCode);
  verifyCommunityCreatorCode(record, payload.creatorCode);
  const workspace = (record.workspaceId && workspaces.get(record.workspaceId)) || (record.roomCode ? findWorkspaceByRoomCode(record.roomCode) : null);
  if (!workspace?.state?.active) {
    if (record.startMode === 'scheduled' && record.startsAt && record.status === 'scheduled') {
      return {
        token:'', pending:true, organizer:true, publicId:record.id, roomCode:'', status:'scheduled',
        name:record.name, mode:record.mode, claimMode:record.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual', maxPlayers:record.maxPlayers, startMode:record.startMode, startsAt:record.startsAt || '',
        playerCount:0, cardCount:0, pendingSelectionPlayers:0, players:[], canStart:false, joinOpen:false,
        shareUrl:communityPublicShareUrl(record.id), transmissionUrl:''
      };
    }
    throw new Error('La sala todavía no está disponible.');
  }
  return workspaceContext.run(workspace, () => {
    const summary = registrationSummaryPayload();
    const players = (state.players || [])
      .filter(item => item?.nameSet && !item.virtual)
      .map(item => ({
        name:playerDisplayName(item),
        cardCount:item.selectionConfirmed ? (item.cardIds || []).length : 0,
        expectedCardCount:authorizedCardCount(item),
        ready:Boolean(item.selectionConfirmed)
      }));
    return {
      token:'', organizer:true, roomCode:state.roomCode, publicId:record.id, status:state.status,
      name:record.name, mode:record.mode, claimMode:state.roomSettings?.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual', maxPlayers:record.maxPlayers, startMode:record.startMode, startsAt:record.startsAt || '',
      playerCount:summary.registeredPlayers, cardCount:summary.playingCards,
      pendingSelectionPlayers:players.filter(item => !item.ready).length, players,
      enterUrl:communityPublicShareUrl(record.id), shareUrl:communityPublicShareUrl(record.id),
      transmissionUrl:shortBroadcastUrlFor(), joinOpen:Boolean(state.status === 'waiting' && state.roomSettings?.joinOpen),
      canStart:state.status === 'waiting' && state.roomSettings?.communityStartMode === 'manual' && summary.registeredPlayers >= 2
    };
  });
}

function joinCommunityCreatorAsPlayer(req, res, payload = {}) {
  const publicId = String(payload.publicId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0,100);
  const record = communityPublicRoomById(publicId);
  verifyCommunityCreatorCode(record, payload.creatorCode);
  const workspace = (record.workspaceId && workspaces.get(record.workspaceId)) || (record.roomCode ? findWorkspaceByRoomCode(record.roomCode) : null);
  if (!workspace?.state?.active) throw new Error('La sala todavía no está disponible.');
  return workspaceContext.run(workspace, () => {
    let player = state.communityCreatorPlayerId ? state.players.find(item => item.id === state.communityCreatorPlayerId) : null;
    let token = '';
    if (!player) {
      if (state.status !== 'waiting' || !state.roomSettings?.joinOpen) throw new Error('La partida ya no acepta jugadores nuevos.');
      const joined = openJoinPlayer({
        name:record.creatorName,
        cardCount:record.maxCardsPerPlayer,
        deviceId:String(payload.deviceId || randomId('device')).slice(0,120),
        communityAccessGranted:true
      });
      token = joined.token;
      player = state.players.find(item => item.sessionToken === token) || null;
      state.communityCreatorPlayerId = player?.id || null;
    } else {
      player.sessionToken = randomId('session');
      player.sessionDeviceId = String(payload.deviceId || randomId('device')).slice(0,120);
      player.openJoinDeviceId = player.sessionDeviceId;
      player.lastLoginAt = nowIso();
      token = player.sessionToken;
    }
    saveState(); broadcast();
    setPlayerSessionCookie(req, res, token);
    return { ok:true, roomCode:state.roomCode, publicId:record.id, playerName:playerDisplayName(player), enterUrl:'/jugar' };
  });
}

function startCommunityRoomFromCreator(payload = {}) {
  const publicId = String(payload.publicId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0,100);
  const record = communityPublicRoomById(publicId);
  verifyCommunityCreatorCode(record, payload.creatorCode);
  const workspace = (record.workspaceId && workspaces.get(record.workspaceId)) || (record.roomCode ? findWorkspaceByRoomCode(record.roomCode) : null);
  if (!workspace?.state?.active) throw new Error('La sala todavía no está disponible.');
  return workspaceContext.run(workspace, () => {
    if (state.roomSettings?.roomOrigin !== 'community' || String(state.roomSettings?.communityPublicId || '') !== String(record.id)) throw new Error('La sala ya no está disponible.');
    if (state.roomSettings?.communityStartMode !== 'manual') throw new Error('Esta sala comenzará automáticamente en el horario programado.');
    if (state.status !== 'waiting') return { ok:true, room:publicRoomPayload(record) };
    if (registrationSummaryPayload().registeredPlayers < 2) throw new Error('Se necesitan al menos 2 jugadores para comenzar.');
    state.roomSettings.joinOpen = false;
    saveState(); broadcast();
    startRoom({ communityCreator:true });
    syncCommunityPublicRecordFromState('playing');
    return { ok:true, room:publicRoomPayload(record) };
  });
}

function startCommunityRoomFromPlayer(player) {
  if (state.roomSettings?.roomOrigin !== 'community') throw new Error('Esta partida no es una sala pública.');
  if (state.roomSettings?.communityStartMode !== 'manual') throw new Error('Esta sala comenzará automáticamente en el horario programado.');
  if (String(state.communityCreatorPlayerId || '') !== String(player?.id || '')) throw new Error('Solo quien creó la sala puede iniciar la partida.');
  if (state.status !== 'waiting') return playerPayload(player);
  if ((state.players || []).length < 2) throw new Error('Se necesitan al menos 2 jugadores para comenzar.');
  // Quien ya ingresó a la sala y definió su cantidad de cartones no debe frenar
  // a los demás: startRoom() completa automáticamente cualquier selección pendiente
  // con la cantidad autorizada. Los accesos sin nombre/cantidad confirmada no son
  // elegibles para la ronda y quedan fuera por playerEligibleForRound().
  state.roomSettings.joinOpen = false;
  saveState(); broadcast();
  startRoom({ communityCreator:true });
  syncCommunityPublicRecordFromState('playing');
  return playerPayload(player);
}

function cancelCommunityRoomFromPlayer(player) {
  if (state.roomSettings?.roomOrigin !== 'community') throw new Error('Esta partida no es una sala pública.');
  if (String(state.communityCreatorPlayerId || '') !== String(player?.id || '')) throw new Error('Solo quien creó la sala puede cancelarla.');
  if (!state.active || state.status === 'finished') throw new Error('Esta partida ya terminó.');
  const wasStarted = Boolean(state.startedAt) || state.status !== 'waiting';
  state.closedReason = 'creator_cancelled';
  state.roomSettings.joinOpen = false;
  logEvent('community_public_room_cancelled_by_creator', { publicRoomId:state.roomSettings?.communityPublicId || '', wasStarted });
  closeRoom();
  return { active:false, closedReason:'creator_cancelled', returnToCommunity:true, cancelled:true, wasStarted };
}

function processCommunityPublicRoomAutomation() {
  const now = Date.now();
  let platformChanged = false;
  for (const record of communityPublicRooms()) {
    if (record.startMode !== 'scheduled' || !record.startsAt || ['finished','cancelled'].includes(record.status)) continue;
    const startsMs = new Date(record.startsAt).getTime();
    if (!Number.isFinite(startsMs)) continue;
    if (!record.roomCode && now >= startsMs - COMMUNITY_PUBLIC_OPEN_MS) {
      try { openCommunityPublicRoom(record); platformChanged = true; }
      catch { /* Se reintenta cada segundo; las oficiales conservan prioridad. */ }
    }
    const workspace = (record.workspaceId && workspaces.get(record.workspaceId)) || (record.roomCode ? findWorkspaceByRoomCode(record.roomCode) : null);
    if (!workspace?.state?.active || String(workspace.state.roomCode || '') !== String(record.roomCode || '')) continue;
    workspaceContext.run(workspace, () => {
      if (now < startsMs || state.status !== 'waiting') return;
      if ((state.players || []).length < 2) {
        state.roomSettings.joinOpen = false;
        record.status = 'cancelled'; record.endedAt = nowIso(); record.updatedAt = nowIso(); platformChanged = true;
        closeRoom();
        return;
      }
      try {
        state.roomSettings.joinOpen = false;
        saveState(); broadcast();
        startRoom({ automaticSchedule:true, communityPublic:true });
        record.status = 'playing'; record.startedAt = state.startedAt || nowIso(); record.updatedAt = nowIso(); platformChanged = true;
      } catch (error) {
        logEvent('community_public_start_blocked', { publicRoomId:record.id, reason:String(error?.message || '') });
      }
    });
  }
  if (platformChanged) savePlatform();
  return platformChanged;
}

function accessCommunityRoom(req, res, payload = {}) {
  const publicId = String(payload.publicId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0,100);
  const record = communityPublicRoomById(publicId);
  if (!record || ['finished','cancelled'].includes(record.status)) throw new Error('Esta sala ya no está disponible.');
  if (record.accessType === 'private') verifyCommunityRoomAccessKey(record, payload.accessKey);
  const workspace = (record.workspaceId && workspaces.get(record.workspaceId)) || (record.roomCode ? findWorkspaceByRoomCode(record.roomCode) : null);
  if (!workspace?.state?.active || String(workspace.state.roomSettings?.communityPublicId || '') !== record.id) throw new Error(record.status === 'scheduled' ? 'La sala todavía no abrió.' : 'Esta sala ya no está disponible.');
  const grant = createCommunityRoomAccessGrant(record);
  setCommunityRoomAccessCookie(req, res, grant);
  const alias = normalizeBroadcastAlias(workspace.state.roomSettings?.broadcastAlias);
  return {
    ok:true, publicId:record.id, accessType:record.accessType,
    joinUrl: workspace.state.status === 'waiting' && workspace.state.roomSettings?.joinOpen ? `/jugador?sala=${encodeURIComponent(workspace.state.roomCode)}&directo=1` : '',
    transmissionUrl: alias ? `/v/${encodeURIComponent(alias)}` : ''
  };
}

function prepareCommunityRematchWindow() {
  if (state.roomSettings?.roomOrigin !== 'community' || state.status !== 'finished') return null;
  // El flujo histórico de revancha depende de que el creador sea jugador.
  // Si el creador organizó sin entrar como jugador, no ofrecemos revancha,
  // pero conservamos el plazo de cierre para liberar el workspace automáticamente.
  if (!state.communityCreatorPlayerId) {
    state.communityRematch = {
      expiresAt: new Date(Date.now() + COMMUNITY_FINISH_GRACE_MS).toISOString(),
      readyPlayerIds: [],
      createdAt: nowIso(),
      disabled: true
    };
    logEvent('community_finish_window_opened', { expiresAt:state.communityRematch.expiresAt, rematch:false });
    return state.communityRematch;
  }
  state.communityRematch = {
    expiresAt: new Date(Date.now() + COMMUNITY_FINISH_GRACE_MS).toISOString(),
    readyPlayerIds: [],
    createdAt: nowIso()
  };
  logEvent('community_rematch_window_opened', { expiresAt:state.communityRematch.expiresAt });
  return state.communityRematch;
}

function restartCommunityRoomForRematch(creatorPlayer) {
  const record = communityPublicRoomById(state.roomSettings?.communityPublicId || '');
  if (!record) throw new Error('No se encontró esta sala.');
  const rematch = state.communityRematch;
  if (!rematch || new Date(rematch.expiresAt || 0).getTime() <= Date.now()) throw new Error('La sala ya está cerrando.');
  const creatorId = String(state.communityCreatorPlayerId || '');
  if (String(creatorPlayer?.id || '') !== creatorId) throw new Error('Solo quien creó la sala puede abrir otra partida.');
  const keepIds = new Set([creatorId, ...(rematch.readyPlayerIds || []).map(String)]);
  const oldPlayers = (state.players || []).filter(player => keepIds.has(String(player.id))).map(player => ({
    id:String(player.id), name:playerDisplayName(player), sessionToken:String(player.sessionToken || ''), sessionDeviceId:String(player.sessionDeviceId || player.openJoinDeviceId || ''), allowedCardCount:Math.max(1, Number(player.allowedCardCount) || record.maxCardsPerPlayer)
  }));
  const oldChat = deepCopy(state.chat || blankState().chat);
  const nextRound = Math.max(2, Number(record.roundNumber || state.round || 1) + 1);
  const creatorCodeHash = record.creatorCodeHash;
  const accessKeyHash = record.accessKeyHash || '';
  createSimpleRoom({
    mode:record.mode, cardCount:normalizedGeneratedCount(Math.max(25, Math.min(100, record.maxPlayers * record.maxCardsPerPlayer + 20))),
    autoSeconds:record.autoSeconds, rules:record.rules, linePrizeCount:record.linePrizeCount, claimMode:record.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual',
    markingMode:'normal', maxCardsPerPlayer:record.maxCardsPerPlayer, roomOrigin:'community',
    hostName:record.creatorName, roomName:record.name, communityPublicId:record.id, communityStartMode:'manual', communityAccessType:record.accessType,
    maxOpenPlayers:record.maxPlayers
  });
  state.round = nextRound;
  state.communityCreatorCodeHash = creatorCodeHash;
  state.communityAccessKeyHash = accessKeyHash || null;
  state.chat = oldChat;
  state.players = [];
  state.communityCreatorPlayerId = null;
  for (const old of oldPlayers) {
    const fresh = emptyRoomPlayer({ name:old.name, allowedCardCount:Math.min(record.maxCardsPerPlayer, old.allowedCardCount), deviceId:old.sessionDeviceId, openJoin:true });
    fresh.id = old.id;
    fresh.sessionToken = old.sessionToken || randomId('session');
    fresh.sessionDeviceId = old.sessionDeviceId;
    fresh.openJoinDeviceId = old.sessionDeviceId;
    fresh.nameSet = true;
    fresh.slotNumber = state.players.length + 1;
    fresh.slotLabel = old.name;
    state.players.push(fresh);
    refreshOffersForPlayer(fresh, true);
    if (old.id === creatorId) state.communityCreatorPlayerId = fresh.id;
  }
  record.roomCode = state.roomCode;
  record.workspaceId = currentWorkspace().id;
  record.status = 'waiting'; record.startMode = 'manual'; record.startsAt = ''; record.startedAt = null; record.endedAt = null; record.roundNumber = nextRound; record.updatedAt = nowIso();
  state.communityRematch = null;
  logEvent('community_rematch_opened', { round:nextRound, returningPlayers:state.players.length });
  savePlatform(); saveState(); broadcast();
  return state.players.find(player => player.id === creatorId) || state.players[0] || null;
}

function communityRematchFromPlayer(player) {
  if (state.roomSettings?.roomOrigin !== 'community' || state.status !== 'finished' || !state.communityRematch || state.communityRematch.disabled) throw new Error('Ahora no se puede abrir otra partida.');
  if (new Date(state.communityRematch.expiresAt || 0).getTime() <= Date.now()) throw new Error('El tiempo para jugar otra partida terminó.');
  state.communityRematch.readyPlayerIds ||= [];
  if (!state.communityRematch.readyPlayerIds.includes(String(player.id))) state.communityRematch.readyPlayerIds.push(String(player.id));
  if (String(state.communityCreatorPlayerId || '') === String(player.id || '')) {
    const nextCreator = restartCommunityRoomForRematch(player);
    return playerPayload(nextCreator);
  }
  saveState(); broadcast();
  return playerPayload(player);
}

function maybeCloseFinishedCommunityRoom() {
  if (!state.active || state.status !== 'finished' || state.roomSettings?.roomOrigin !== 'community' || !state.communityRematch) return false;
  const expires = new Date(state.communityRematch.expiresAt || 0).getTime();
  if (!Number.isFinite(expires) || Date.now() < expires) return false;
  const record = communityPublicRoomById(state.roomSettings?.communityPublicId || '');
  state.closedReason = 'community_finished_timeout';
  closeRoom();
  if (record) { record.status='finished'; record.endedAt ||= state.endedAt || nowIso(); record.updatedAt=nowIso(); savePlatform(); }
  return true;
}

function createCommunityPrivateRoom(payload = {}) {
  const community = platform.community ||= blankCommunity();
  const availability = communityPrivateRoomAvailability();
  if (!availability.enabled) throw new Error('La creación de salas privadas está desactivada.');
  if (!availability.available) throw new Error(availability.reason || 'No hay lugar para crear otra sala en este momento.');
  const hostName = normalizeCommunityName(payload.name);
  const mode = Number(payload.mode) === 75 ? 75 : 90;
  const maxPlayers = Math.max(2, Math.min(availability.maxPlayers, Math.round(Number(payload.maxPlayers) || Math.min(20, availability.maxPlayers))));
  const maxCardsPerPlayer = Math.max(1, Math.min(availability.maxCardsPerPlayer, Math.round(Number(payload.maxCardsPerPlayer) || availability.maxCardsPerPlayer)));
  const autoSeconds = Math.max(4, Math.min(20, Math.round(Number(payload.autoSeconds) || 8)));
  const linePrizeCount = mode === 90 ? Math.max(1, Math.min(2, Math.round(Number(payload.linePrizeCount) || 1))) : 1;
  const requestedRules = payload.rules && typeof payload.rules === 'object' ? payload.rules : {};
  const rules = mode === 90
    ? roomRulesFor(90, { ambocabeza: Boolean(requestedRules.ambocabeza), line: requestedRules.line !== false, bingo: true })
    : roomRulesFor(75, { line: requestedRules.line !== false, corners: Boolean(requestedRules.corners), doubleLine: Boolean(requestedRules.doubleLine), tripleLine: Boolean(requestedRules.tripleLine), bingo: true });
  const cardCount = normalizedGeneratedCount(Math.max(25, Math.min(100, maxPlayers * maxCardsPerPlayer + 20)));
  const workspace = freeOperationalWorkspace();
  if (!workspace) throw new Error('No hay una sala disponible.');
  const hostKey = randomId('host');
  workspaceContext.run(workspace, () => {
    const created = createSimpleRoom({
      mode,
      cardCount,
      autoSeconds,
      rules,
      linePrizeCount,
      claimMode: payload.claimMode === 'automatic_ties' ? 'automatic_ties' : 'manual',
      markingMode: 'normal',
      maxCardsPerPlayer,
      roomOrigin: 'community',
      hostName,
      maxOpenPlayers: maxPlayers
    });
    state.communityHostKeyHash = crypto.createHash('sha256').update(hostKey).digest('hex');
    state.communityHostName = hostName;
    state.communityHostExpiresAt = new Date(Date.now() + COMMUNITY_HOST_TTL_MS).toISOString();
    state.roomSettings.joinOpen = true;
    logEvent('community_private_room_created', { hostName, maxPlayers, maxCardsPerPlayer });
    saveState();
    broadcast();
  });
  const roomCode = workspace.state.roomCode;
  return {
    roomCode,
    mode,
    hostName,
    maxPlayers,
    maxCardsPerPlayer,
    linePrizeCount,
    rules,
    joinUrl: `${PUBLIC_URL || `http://localhost:${PORT}`}/jugador?sala=${encodeURIComponent(roomCode)}&directo=1`,
    hostUrl: `${PUBLIC_URL || `http://localhost:${PORT}`}/admin#communityHost=${encodeURIComponent(roomCode)}.${encodeURIComponent(hostKey)}`,
    expiresInHours: Math.round(COMMUNITY_HOST_TTL_MS / 3600000)
  };
}

function createCommunityHostSession(payload = {}) {
  const roomCode = String(payload.roomCode || '').trim().toUpperCase();
  const hostKey = String(payload.hostKey || '').trim();
  const workspace = findWorkspaceByRoomCode(roomCode);
  if (!workspace?.state?.active || workspace.state?.roomSettings?.roomOrigin !== 'community' || !workspace.state.communityHostKeyHash) {
    throw new Error('La sala privada ya no está disponible.');
  }
  const expiresAt = new Date(workspace.state.communityHostExpiresAt || 0).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('El acceso de anfitrión venció. La sala puede ser administrada por La Gorda.');
  const digest = crypto.createHash('sha256').update(hostKey).digest('hex');
  if (!safeEqual(digest, workspace.state.communityHostKeyHash)) throw new Error('El acceso de anfitrión no es válido.');
  const token = createAdminSession({ workspaceId: workspace.id, role: 'community_host', hardExpiresAt: expiresAt });
  return {
    token,
    role: 'community_host',
    workspaceId: workspace.id,
    roomCode: workspace.state.roomCode,
    hostName: workspace.state.communityHostName || workspace.state.roomSettings?.hostName || 'Anfitrión'
  };
}

function communityStatePayload(visitorId = '') {
  const id = String(visitorId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (id) communityVisitors.set(id, Date.now());
  pruneCommunityVisitors();
  const community = platform.community ||= blankCommunity();
  return {
    now: nowIso(),
    chatEnabled: community.chatEnabled !== false,
    maxLength: COMMUNITY_CHAT_MAX_LENGTH,
    messages: (community.messages || []).slice(-60).map(message => {
      const reports = Array.isArray(message.reports) ? message.reports : [];
      const { reports: _privateReports, ...publicMessage } = message;
      return { ...publicMessage, reportedByMe: Boolean(id && reports.some(report => report.visitorId === id)) };
    }),
    onlineCount: communityVisitors.size,
    whatsapp: {
      groupUrl: communityWhatsappGroupUrl(),
      contactUrl: communityWhatsappContactUrl(),
      number: communityWhatsappNumber()
    },
    banners: communityBannersPublicPayload(),
    activeGame: communityActiveGamePayload(),
    upcomingGames: communityUpcomingGames(),
    publicRooms: communityPublicRoomsPayload(),
    lobbyRooms: communityLobbyRoomsPayload(),
    publicRoomAvailability: communityPublicRoomAvailability(),
    privateRooms: communityPrivateRoomAvailability(),
    tools: { cardsPrintSite: printableSiteLabel() },
    leaderboards: {
      red_black: (community.leaderboards?.red_black || []).slice(0, 8),
      higher_lower: (community.leaderboards?.higher_lower || []).slice(0, 8)
    }
  };
}

function appendCommunityMessage(req, payload = {}) {
  const community = platform.community ||= blankCommunity();
  if (community.chatEnabled === false) throw new Error('El chat de la comunidad está pausado.');
  const name = normalizeCommunityName(payload.name);
  const visitorId = String(payload.visitorId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!visitorId) throw new Error('No se pudo identificar este dispositivo. Recargá la página.');
  const stickerId = String(payload.stickerId || '').trim().toLowerCase();
  const isSticker = Boolean(stickerId);
  if (isSticker && !CHAT_STICKER_IDS.has(stickerId)) throw new Error('Sticker no válido.');
  const text = isSticker ? '' : String(payload.text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, COMMUNITY_CHAT_MAX_LENGTH);
  if (!isSticker && !text) throw new Error('Escribí un mensaje.');
  if (!isSticker) validateCommunityMessageContent(text, community);
  const now = Date.now();
  if (isSticker) {
    const lastSticker = Number(communityLastStickerAt.get(visitorId)) || 0;
    if (now - lastSticker < COMMUNITY_STICKER_COOLDOWN_MS) throw new Error('Esperá un momento antes de enviar otro sticker.');
    const windowTimes = (communityStickerSentAt.get(visitorId) || []).map(Number).filter(at => now - at < COMMUNITY_STICKER_WINDOW_MS);
    if (windowTimes.length >= COMMUNITY_STICKER_WINDOW_MAX) throw new Error('Esperá un momento antes de enviar otro sticker.');
    windowTimes.push(now);
    communityStickerSentAt.set(visitorId, windowTimes);
    communityLastStickerAt.set(visitorId, now);
  } else {
    const last = Number(communityLastSentAt.get(visitorId)) || 0;
    if (now - last < COMMUNITY_CHAT_COOLDOWN_MS) throw new Error('Esperá un momento antes de enviar otro mensaje.');
    communityLastSentAt.set(visitorId, now);
  }
  communityVisitors.set(visitorId, now);
  const message = { id: randomId('community'), role: 'guest', visitorId, name, type: isSticker ? 'sticker' : 'text', text, stickerId: isSticker ? stickerId : null, createdAt: nowIso(), reports: [] };
  community.messages ||= [];
  community.messages.push(message);
  if (community.messages.length > COMMUNITY_CHAT_MAX_MESSAGES) community.messages.splice(0, community.messages.length - COMMUNITY_CHAT_MAX_MESSAGES);
  savePlatform();
  return message;
}

function reportCommunityMessage(payload = {}) {
  const community = platform.community ||= blankCommunity();
  const visitorId = String(payload.visitorId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const messageId = String(payload.messageId || '').slice(0, 120);
  if (!visitorId || !messageId) throw new Error('No se pudo registrar el reporte.');
  const message = (community.messages || []).find(item => item.id === messageId);
  if (!message) throw new Error('Ese mensaje ya no está disponible.');
  if (message.role === 'official') throw new Error('Los mensajes oficiales no se pueden reportar desde este botón.');
  if (message.visitorId === visitorId) throw new Error('No hace falta reportar tu propio mensaje.');
  message.reports ||= [];
  if (message.reports.some(report => report.visitorId === visitorId)) return { alreadyReported: true, state: communityStatePayload(visitorId) };
  const now = Date.now();
  const times = (communityReportSentAt.get(visitorId) || []).map(Number).filter(at => now - at < COMMUNITY_REPORT_WINDOW_MS);
  if (times.length >= COMMUNITY_REPORT_WINDOW_MAX) throw new Error('Alcanzaste el límite de reportes por ahora.');
  times.push(now); communityReportSentAt.set(visitorId, times);
  message.reports.push({ visitorId, createdAt: nowIso() });
  savePlatform();
  return { alreadyReported: false, state: communityStatePayload(visitorId) };
}

function submitCommunityScore(payload = {}) {
  const community = platform.community ||= blankCommunity();
  const gameType = ['red_black','higher_lower'].includes(String(payload.gameType)) ? String(payload.gameType) : '';
  if (!gameType) throw new Error('Minijuego no válido.');
  const name = normalizeCommunityName(payload.name);
  const visitorId = String(payload.visitorId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!visitorId) throw new Error('No se pudo identificar este dispositivo.');
  const score = Math.max(0, Math.min(999, Math.floor(Number(payload.score) || 0)));
  const board = community.leaderboards[gameType] ||= [];
  const existing = board.find(item => item.visitorId === visitorId);
  if (existing) { existing.name = name; existing.bestScore = Math.max(Number(existing.bestScore) || 0, score); existing.updatedAt = nowIso(); }
  else board.push({ visitorId, name, bestScore: score, updatedAt: nowIso() });
  board.sort((a, b) => (Number(b.bestScore) || 0) - (Number(a.bestScore) || 0) || String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')));
  community.leaderboards[gameType] = board.slice(0, 60);
  savePlatform();
  return communityStatePayload(visitorId);
}

function scheduledGameRoomPayload(game = {}) {
  return {
    mode: Number(game.mode) === 75 ? 75 : 90,
    cardCount: normalizedGeneratedCount(game.cardCount || 250),
    autoSeconds: Math.max(2, Math.min(60, Number(game.autoSeconds) || 6)),
    rules: roomRulesFor(Number(game.mode) === 75 ? 75 : 90, game.rules || {}),
    linePrizeCount: Number(game.mode) === 90 ? Math.max(1, Math.min(2, Number(game.linePrizeCount) || 1)) : 1,
    markingMode: game.markingMode === 'manual_only' ? 'manual_only' : 'normal',
    maxCardsPerPlayer: Math.max(1, Number(game.maxCardsPerPlayer) || (game.markingMode === 'manual_only' ? 2 : 4)),
    whatsapp: String(game.whatsapp || platform.community?.whatsappNumber || '').trim(),
    communityScheduleId: String(game.id || '')
  };
}

function createRoomFromCommunitySchedule(game) {
  if (!game) throw new Error('La partida programada ya no existe.');
  let workspace = game.workspaceId ? workspaces.get(game.workspaceId) : null;
  if (workspace?.state?.active && String(workspace.state.roomCode || '') !== String(game.roomCode || '')) workspace = null;
  if (!workspace || workspace.state?.active) workspace = freeOperationalWorkspace();
  if (!workspace) throw new Error(`Ya están ocupadas las ${MAX_OPERATIONAL_ROOMS} salas disponibles.`);
  const result = workspaceContext.run(workspace, () => createSimpleRoom(scheduledGameRoomPayload(game)));
  game.workspaceId = workspace.id;
  game.roomCode = workspace.state.roomCode;
  game.updatedAt = nowIso();
  savePlatform();
  return result;
}

function updateCommunitySchedule(payload = {}) {
  const action = String(payload.action || 'save').toLowerCase();
  const games = communityScheduledGames();
  if (action === 'create-room') {
    const id = String(payload.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
    const game = games.find(item => item.id === id);
    if (!game) throw new Error('La partida programada ya no existe.');
    if (game.roomCode) throw new Error(`Esta programación ya está asociada a la sala ${game.roomCode}.`);
    createRoomFromCommunitySchedule(game);
    return communityAdminPayload();
  }
  if (action === 'delete') {
    const id = String(payload.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
    const index = games.findIndex(item => item.id === id);
    if (index < 0) throw new Error('La partida programada ya no existe.');
    if (games[index].roomCode) {
      const linked = (games[index].workspaceId && workspaces.get(games[index].workspaceId)) || findWorkspaceByRoomCode(games[index].roomCode);
      if (linked?.state?.active && String(linked.state.roomCode || '') === games[index].roomCode) {
        throw new Error('Esa programación está asociada a una sala activa. Cerrá esa sala antes de eliminarla.');
      }
    }
    games.splice(index, 1);
    savePlatform();
    return communityAdminPayload();
  }
  if (action === 'set-auto') {
    const id = String(payload.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
    const game = games.find(item => item.id === id);
    if (!game) throw new Error('La partida programada ya no existe.');
    game.autoStart = Boolean(payload.enabled);
    if (game.autoStart) game.autoStartError = '';
    game.updatedAt = nowIso();
    if (game.roomCode) {
      const linked = (game.workspaceId && workspaces.get(game.workspaceId)) || findWorkspaceByRoomCode(game.roomCode);
      if (linked?.state?.active && String(linked.state.roomCode || '') === game.roomCode) {
        linked.state.roomSettings.scheduledAutoStart = game.autoStart;
        workspaceContext.run(linked, () => { saveState(); broadcast(); });
      }
    }
    savePlatform();
    return communityAdminPayload();
  }
  if (action !== 'save') throw new Error('Acción de agenda no válida.');
  const id = String(payload.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const existing = id ? games.find(item => item.id === id) : null;
  if (id && !existing) throw new Error('La partida programada ya no existe.');
  const previous = existing ? deepCopy(existing) : null;
  const starts = new Date(payload.startsAt || '');
  if (!Number.isFinite(starts.getTime())) throw new Error('Elegí una fecha y hora válidas.');
  if (starts.getTime() < Date.now() - 5 * 60 * 1000) throw new Error('La fecha programada no puede estar en el pasado.');
  const mode = Number(payload.mode) === 75 ? 75 : 90;
  const whatsapp = String(payload.whatsapp || '').trim().slice(0, 40);
  const registrationMinutes = Math.max(1, Math.min(120, Math.round(Number(payload.registrationMinutes) || 15)));
  const markingMode = payload.markingMode === 'manual_only' ? 'manual_only' : 'normal';
  const maxCardsPerPlayer = markingMode === 'manual_only'
    ? Math.max(1, Math.min(2, Math.round(Number(payload.maxCardsPerPlayer) || 2)))
    : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Math.round(Number(payload.maxCardsPerPlayer) || 4)));
  const next = {
    id: existing?.id || randomId('agenda'),
    startsAt: starts.toISOString(),
    mode,
    whatsapp,
    registrationMinutes,
    autoStart: payload.autoStart === true,
    markingMode,
    maxCardsPerPlayer,
    cardCount: normalizedGeneratedCount(payload.cardCount || 250),
    autoSeconds: Math.max(2, Math.min(60, Math.round(Number(payload.autoSeconds) || 6))),
    linePrizeCount: mode === 90 ? Math.max(1, Math.min(2, Math.round(Number(payload.linePrizeCount) || 1))) : 1,
    rules: roomRulesFor(mode, payload.rules || {}),
    roomCode: existing?.roomCode || '',
    workspaceId: existing?.workspaceId || '',
    autoOpenedAt: existing?.roomCode ? null : null,
    autoClosedAt: existing?.roomCode ? null : null,
    autoStartedAt: existing?.autoStartedAt || null,
    autoStartError: '',
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  if (existing) {
    Object.assign(existing, next);
    if (existing.roomCode) {
      try {
        syncLinkedScheduleToRoom(existing, previous || {});
      } catch (error) {
        Object.assign(existing, previous || {});
        throw error;
      }
    }
  } else games.push(next);
  games.sort((a,b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  if (games.length > 40) games.splice(40);
  savePlatform();
  return communityAdminPayload();
}

function processCommunityScheduleAutomation() {
  const now = Date.now();
  let changed = false;

  // 1) Crea automáticamente todas las programaciones que ya llegaron a su
  // ventana de inscripción, hasta ocupar los dos slots operativos.
  const dueGames = communityScheduledGames()
    .filter(game => game.autoStart === true && !game.roomCode && !game.autoStartedAt)
    .sort((a,b) => String(a.startsAt).localeCompare(String(b.startsAt)))
    .filter(game => {
      const startsMs = new Date(game.startsAt).getTime();
      if (!Number.isFinite(startsMs)) return false;
      const registrationMinutes = Math.max(1, Math.min(120, Number(game.registrationMinutes) || 15));
      return now >= startsMs - registrationMinutes * 60_000;
    });

  for (const due of dueGames) {
    const free = freeOperationalWorkspace();
    if (!free) {
      const message = `Ya están ocupadas las ${MAX_OPERATIONAL_ROOMS} salas disponibles. Se reintentará automáticamente cuando quede un slot libre.`;
      if (due.autoStartError !== message) {
        due.autoStartError = message;
        due.updatedAt = nowIso();
        changed = true;
      }
      continue;
    }
    try {
      due.autoStartError = '';
      createRoomFromCommunitySchedule(due);
      changed = true;
    } catch (error) {
      due.autoStartError = String(error?.message || 'No se pudo crear automáticamente la sala.').slice(0, 300);
      due.updatedAt = nowIso();
      changed = true;
    }
  }

  // 2) Cada sala programada se automatiza dentro de su propio workspace.
  for (const game of communityScheduledGames()) {
    if (!game.autoStart || !game.roomCode) continue;
    const workspace = (game.workspaceId && workspaces.get(game.workspaceId)) || findWorkspaceByRoomCode(game.roomCode);
    if (!workspace?.state?.active || String(workspace.state.roomCode || '') !== String(game.roomCode || '')) continue;

    workspaceContext.run(workspace, () => {
      if (!state.game || state.status !== 'waiting') return;
      const startsMs = new Date(game.startsAt).getTime();
      if (!Number.isFinite(startsMs)) return;
      const registrationMinutes = Math.max(1, Math.min(120, Number(game.registrationMinutes) || 15));
      const opensMs = startsMs - registrationMinutes * 60_000;
      let changedState = false;

      if (now >= opensMs && now < startsMs && !game.autoOpenedAt) {
        const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(state.roomSettings?.maxOpenPlayers) || MAX_PLAYERS));
        state.roomSettings.joinOpen = state.players.length < maxPlayers;
        game.autoOpenedAt = nowIso();
        game.autoClosedAt = null;
        game.updatedAt = nowIso();
        game.autoStartError = '';
        logEvent('scheduled_join_opened', { scheduleId:game.id, startsAt:game.startsAt, registrationMinutes, workspaceId:workspace.id });
        changedState = true;
        changed = true;
      }

      if (now >= startsMs && !game.autoClosedAt) {
        state.roomSettings.joinOpen = false;
        game.autoClosedAt = nowIso();
        game.updatedAt = nowIso();
        logEvent('scheduled_join_closed', { scheduleId:game.id, startsAt:game.startsAt, workspaceId:workspace.id });
        changedState = true;
        changed = true;
      }

      if (changedState) {
        saveState();
        broadcast();
      }

      if (now >= startsMs && !game.autoStartedAt && !game.autoStartError && state.status === 'waiting') {
        try {
          startRoom({ automaticSchedule:true });
          game.autoStartedAt = state.startedAt || nowIso();
          game.updatedAt = nowIso();
          game.autoStartError = '';
          changed = true;
        } catch (error) {
          game.autoStartError = String(error?.message || 'No se pudo iniciar automáticamente.').slice(0, 300);
          game.updatedAt = nowIso();
          logEvent('scheduled_start_blocked', { scheduleId:game.id, reason:game.autoStartError, workspaceId:workspace.id });
          saveState();
          broadcast();
          changed = true;
        }
      }
    });
  }

  if (changed) savePlatform();
  return changed;
}

function updateCommunitySettings(payload = {}) {
  const community = platform.community ||= blankCommunity();
  if (payload.publicRoomsEnabled !== undefined) community.publicRoomsEnabled = payload.publicRoomsEnabled !== false;
  if (payload.privateRoomsEnabled !== undefined) { community.privateRoomsEnabled = payload.privateRoomsEnabled !== false; community.publicRoomsEnabled = payload.privateRoomsEnabled !== false; }
  if (payload.privateRoomMaxPlayers !== undefined) community.privateRoomMaxPlayers = Math.max(2, Math.min(30, Math.round(Number(payload.privateRoomMaxPlayers) || 30)));
  if (payload.privateRoomMaxCardsPerPlayer !== undefined) community.privateRoomMaxCardsPerPlayer = Math.max(1, Math.min(4, Math.round(Number(payload.privateRoomMaxCardsPerPlayer) || 4)));
  if (payload.cardsPrintSite !== undefined) {
    const value = String(payload.cardsPrintSite || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').slice(0, 160);
    if (value && !/^[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(value)) throw new Error('Escribí una dirección web válida para los cartones.');
    community.cardsPrintSite = value || 'bingo-gorda.onrender.com/comunidad';
  }
  if (payload.whatsappGroup !== undefined) {
    const value = String(payload.whatsappGroup || '').trim().slice(0, 500);
    if (value && !/^https:\/\/(?:chat\.)?whatsapp\.com\//i.test(value)) throw new Error('Pegá un enlace válido de invitación de WhatsApp.');
    community.whatsappGroup = value || blankCommunity().whatsappGroup;
  }
  if (payload.whatsappNumber !== undefined) community.whatsappNumber = String(payload.whatsappNumber || '').trim().slice(0, 60) || blankCommunity().whatsappNumber;
  if (Array.isArray(payload.banners)) {
    const current = [1,2,3].map(slot => normalizeCommunityBanner((community.banners || []).find(item => Number(item?.slot) === slot) || {}, slot));
    for (const incoming of payload.banners.slice(0,3)) {
      const slot = Math.max(1, Math.min(3, Math.round(Number(incoming?.slot) || 0)));
      const banner = current.find(item => item.slot === slot);
      if (!banner) continue;
      const type = ['none','url','whatsapp','phone'].includes(String(incoming.destinationType || '')) ? String(incoming.destinationType) : 'none';
      banner.enabled = incoming.enabled === true;
      banner.destinationType = type;
      banner.target = validateCommunityBannerTarget(type, incoming.target);
      banner.alt = String(incoming.alt || '').trim().replace(/\s+/g,' ').slice(0,120);
    }
    community.banners = current;
  }
  if (payload.playerAd && typeof payload.playerAd === 'object') {
    community.playerAd = normalizePlayerAd(community.playerAd || {});
    if (payload.playerAd.enabled !== undefined) {
      const enable = payload.playerAd.enabled === true;
      if (enable && !playerAdAdminPayload().hasImage) throw new Error('Subí una imagen de publicidad antes de activarla.');
      community.playerAd.enabled = enable;
    }
  }
  if (payload.chatEnabled !== undefined) community.chatEnabled = Boolean(payload.chatEnabled);
  if (payload.blockPhoneNumbers !== undefined) community.blockPhoneNumbers = Boolean(payload.blockPhoneNumbers);
  if (payload.blockWhatsappLinks !== undefined) community.blockWhatsappLinks = Boolean(payload.blockWhatsappLinks);
  savePlatform();
  return communityAdminPayload();
}

function moderateCommunity(payload = {}) {
  const community = platform.community ||= blankCommunity();
  const action = String(payload.action || '').toLowerCase();
  if (action === 'clear') community.messages = [];
  else if (action === 'delete') community.messages = (community.messages || []).filter(item => item.id !== String(payload.messageId || ''));
  else if (action === 'block-term') {
    const term = normalizeCommunityBlockedTerm(payload.term);
    if (term.length < 2) throw new Error('Escribí una palabra o frase de al menos 2 caracteres.');
    community.blockedTerms ||= [];
    if (!community.blockedTerms.includes(term)) community.blockedTerms.unshift(term);
    community.blockedTerms = community.blockedTerms.slice(0, COMMUNITY_FILTER_MAX_TERMS);
    if (payload.removeMatchingMessages === true) {
      community.messages = (community.messages || []).filter(item => !communityContainsBlockedTerm(item.text, [term]));
    } else if (payload.messageId) {
      const reported = (community.messages || []).find(item => item.id === String(payload.messageId));
      if (reported && communityContainsBlockedTerm(reported.text, [term])) reported.reports = [];
    }
  }
  else if (action === 'unblock-term') {
    const term = normalizeCommunityBlockedTerm(payload.term);
    community.blockedTerms = (community.blockedTerms || []).filter(item => normalizeCommunityBlockedTerm(item) !== term);
  }
  else throw new Error('Acción de moderación no válida.');
  savePlatform();
  return communityAdminPayload();
}


function operationalRoomSummary(workspace) {
  const room = workspace.state || blankState();
  const connectedPlayers = [...workspace.sseClients].filter(client => client.role === 'player').length;
  const adminConnections = [...workspace.sseClients].filter(client => client.role === 'admin').length;
  const roomMaxCards = room.roomSettings?.markingMode === 'manual_only' ? 2 : Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(room.roomSettings?.maxCardsPerPlayer) || MAX_CARDS_PER_PLAYER));
  const playerSummary = (Array.isArray(room.players) ? room.players : [])
    .filter(player => player?.nameSet)
    .map(player => {
      const requested = Number(player.allowedCardCount) || Number(player.requestedCardCount) || 1;
      const expected = Math.max(1, Math.min(roomMaxCards, requested));
      const selected = Boolean(player.selectionConfirmed);
      return {
        id: String(player.id || ''),
        name: playerDisplayName(player),
        cardCount: selected ? (player.cardIds || []).length : expected,
        selected,
        virtual: Boolean(player.virtual),
        connected: [...workspace.sseClients].some(client => client.role === 'player' && String(client.playerId || '') === String(player.id || ''))
      };
    });
  return {
    workspaceId: workspace.id,
    slot: workspaceOperationalIndex(workspace),
    label: workspace.label || `Sala ${workspaceOperationalIndex(workspace) || ''}`.trim(),
    active: Boolean(room.active),
    status: room.status || 'closed',
    roomCode: room.roomCode || '',
    roomOrigin: room.roomSettings?.roomOrigin === 'community' ? 'community' : 'official',
    communityAccessType: room.roomSettings?.roomOrigin === 'community' && room.roomSettings?.communityAccessType === 'private' ? 'private' : 'public',
    hostName: room.roomSettings?.hostName || room.communityHostName || '',
    mode: Number(room.game?.mode) || null,
    players: Array.isArray(room.players) ? room.players.length : 0,
    connectedPlayers,
    cards: playerSummary.reduce((sum, player) => sum + Number(player.cardCount || 0), 0),
    playerSummary,
    joinOpen: Boolean(room.roomSettings?.joinOpen),
    scheduledAt: room.roomSettings?.scheduledAt || '',
    createdAt: room.createdAt || null,
    startedAt: room.startedAt || null,
    adminConnections
  };
}

function operationalAdminPayload(session = null) {
  const memory = process.memoryUsage();
  return {
    selectedWorkspaceId: session?.workspaceId || currentWorkspace().id,
    maxRooms: MAX_OPERATIONAL_ROOMS,
    rooms: operationalWorkspaces().map(operationalRoomSummary),
    historyCount: historyEntries().length,
    diagnostics: {
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      totalSse: [...workspaces.values()].reduce((sum, workspace) => sum + workspace.sseClients.size, 0),
      dataDirConfigured: Boolean(process.env.BINGO_DATA_DIR),
      dataDir: DATA_DIR
    }
  };
}

function historyDetailPayload(roomCode) {
  const entry = historyEntryByRoomCode(roomCode);
  if (!entry) throw new Error('No se encontró esa partida en el historial.');
  let acta = null;
  const actaFile = historicalFile(entry, entry.files?.actaJson || 'acta.json');
  if (actaFile) {
    try { acta = JSON.parse(fs.readFileSync(actaFile, 'utf8')); } catch {}
  }
  return { ...historyPublicEntry(entry), acta };
}

function communityAdminPayload() {
  const community = platform.community ||= blankCommunity();
  return {
    communityUrl: `${PUBLIC_URL || `http://localhost:${PORT}`}/comunidad`,
    whatsappGroup: community.whatsappGroup || blankCommunity().whatsappGroup,
    whatsappNumber: community.whatsappNumber || blankCommunity().whatsappNumber,
    banners: communityBannersAdminPayload(),
    playerAd: playerAdAdminPayload(),
    chatEnabled: community.chatEnabled !== false,
    blockPhoneNumbers: community.blockPhoneNumbers !== false,
    blockWhatsappLinks: community.blockWhatsappLinks !== false,
    publicRoomsEnabled: community.publicRoomsEnabled !== false && community.privateRoomsEnabled !== false,
    publicRooms: communityPublicRooms().slice().sort((a,b) => String(a.startsAt || a.createdAt).localeCompare(String(b.startsAt || b.createdAt))).map(item => publicRoomPayload(item)),
    privateRoomsEnabled: community.privateRoomsEnabled !== false,
    privateRoomMaxPlayers: Math.max(2, Math.min(30, Number(community.privateRoomMaxPlayers) || 30)),
    privateRoomMaxCardsPerPlayer: Math.max(1, Math.min(4, Number(community.privateRoomMaxCardsPerPlayer) || 4)),
    privateRoomAvailability: communityPrivateRoomAvailability(),
    cardsPrintSite: printableSiteLabel(),
    blockedTerms: (community.blockedTerms || []).slice(0, COMMUNITY_FILTER_MAX_TERMS),
    scheduledGames: communityScheduledGames().slice().sort((a,b) => String(a.startsAt).localeCompare(String(b.startsAt))).map(item => ({ ...item })),
    messages: (community.messages || []).slice(-COMMUNITY_CHAT_MAX_MESSAGES).map(message => ({ ...message, reportCount: Array.isArray(message.reports) ? message.reports.length : 0 })),
    reportedMessages: (community.messages || []).filter(message => Array.isArray(message.reports) && message.reports.length).map(message => ({ ...message, reportCount: message.reports.length })).sort((a,b) => Number(b.reportCount)-Number(a.reportCount) || String(b.createdAt).localeCompare(String(a.createdAt))),
    leaderboards: community.leaderboards || { red_black: [], higher_lower: [] }
  };
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
  if (url.pathname === '/api/master/community' && req.method === 'GET') return sendJson(res, 200, communityAdminPayload());
  if (url.pathname === '/api/master/community/settings' && req.method === 'POST') return sendJson(res, 200, updateCommunitySettings(await readJson(req)));
  if (url.pathname === '/api/master/community/schedule' && req.method === 'POST') return sendJson(res, 200, updateCommunitySchedule(await readJson(req)));
  if (url.pathname === '/api/master/community/moderate' && req.method === 'POST') return sendJson(res, 200, moderateCommunity(await readJson(req)));
  if (url.pathname === '/api/master/admin-session' && req.method === 'POST') {
    return sendJson(res, 200, { adminToken: createAdminSession({ workspaceId: 'owner', role: 'owner' }) });
  }
  if (url.pathname === '/api/master/logout' && req.method === 'POST') {
    masterSessions.delete(masterTokenFrom(req, url));
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'Acción principal no encontrada.' });
}

async function dispatchAdminApi(req, res, url, session) {
  currentWorkspace().lastActivityAt = Date.now();

  if (url.pathname === '/api/admin/events' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    return sendJson(res, 200, { events:eventListPayload() });
  }
  if (url.pathname === '/api/admin/events/create' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    return sendJson(res, 200, createPremiumEvent(await readJson(req, 3_600_000)));
  }
  if (url.pathname === '/api/admin/events/archive' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    return sendJson(res, 200, archivePremiumEvent(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/restore' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    return sendJson(res, 200, restorePremiumEvent(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/delete' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    return sendJson(res, 200, deletePremiumEvent(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/live' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    try { return sendJson(res, 200, eventLiveAdminPayload(url.searchParams.get('event'))); } catch(error) { return sendJson(res, 404, { error:String(error.message || error) }); }
  }
  if (url.pathname === '/api/admin/events/live/activate' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    return sendJson(res, 200, activatePremiumEventLive(await readJson(req), currentWorkspace()));
  }
  if (url.pathname === '/api/admin/events/live/deactivate' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    return sendJson(res, 200, deactivatePremiumEventLive(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/lot/generate' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    return sendJson(res, 200, createPremiumEventLot(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/lot' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    const lot=loadEventLot(url.searchParams.get('lot')); if(!lot)return sendJson(res,404,{error:'No encontramos esa tanda de evento.'});
    return sendJson(res,200,eventLotManifest(lot));
  }
  if (url.pathname === '/api/admin/events/lot/print.pdf' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    const lot=loadEventLot(url.searchParams.get('lot')); if(!lot)return sendJson(res,404,{error:'No encontramos esa tanda de evento.'});
    return sendBuffer(res,200,buildPremiumEventPrintPdf(lot),'application/pdf',eventPrintPdfFilename(lot));
  }
  if (url.pathname === '/api/admin/events/lot/card.pdf' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    const lot=loadEventLot(url.searchParams.get('lot')); if(!lot)return sendJson(res,404,{error:'No encontramos esa tanda de evento.'});
    const card=eventCardByGlobalNumber(lot,url.searchParams.get('card')); if(!card)return sendJson(res,404,{error:'Ese cartón no pertenece a la tanda.'});
    return sendBuffer(res,200,buildPremiumEventIndividualPdf(lot,card),'application/pdf',`Carton_${String(card.globalNumber).padStart(4,'0')}_${lot.code}.pdf`);
  }
  if (url.pathname === '/api/admin/events/lot/individuals.zip' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    const lot=loadEventLot(url.searchParams.get('lot')); if(!lot)return sendJson(res,404,{error:'No encontramos esa tanda de evento.'});
    return sendBuffer(res,200,buildEventIndividualsZip(lot),'application/zip',eventIndividualsZipFilename(lot));
  }
  if (url.pathname === '/api/admin/events/lot/manifest.json' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    const lot=loadEventLot(url.searchParams.get('lot')); if(!lot)return sendJson(res,404,{error:'No encontramos esa tanda de evento.'});
    return sendBuffer(res,200,Buffer.from(JSON.stringify(eventLotManifest(lot),null,2),'utf8'),'application/json; charset=utf-8',`${lot.code}_tanda.json`);
  }
  if (url.pathname === '/api/admin/events/lot/control.csv' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error:'Modo Evento está reservado al administrador principal.' });
    const lot=loadEventLot(url.searchParams.get('lot')); if(!lot)return sendJson(res,404,{error:'No encontramos esa tanda de evento.'});
    return sendBuffer(res,200,Buffer.from(eventLotControlCsv(lot),'utf8'),'text/csv; charset=utf-8',`${lot.code}_control.csv`);
  }
  if (url.pathname === '/api/admin/events/players' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res,403,{error:'Modo Evento está reservado al administrador principal.'});
    return sendJson(res,200,eventAdminPlayersPayload(url.searchParams.get('event')));
  }
  if (url.pathname === '/api/admin/events/player/create' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res,403,{error:'Modo Evento está reservado al administrador principal.'});
    return sendJson(res,200,createEventPlayer(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/player/update' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res,403,{error:'Modo Evento está reservado al administrador principal.'});
    return sendJson(res,200,updateEventPlayer(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/player/delete' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res,403,{error:'Modo Evento está reservado al administrador principal.'});
    return sendJson(res,200,deleteEventPlayer(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/player/link' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res,403,{error:'Modo Evento está reservado al administrador principal.'});
    return sendJson(res,200,linkEventPlayerCard(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/player/unlink' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res,403,{error:'Modo Evento está reservado al administrador principal.'});
    return sendJson(res,200,unlinkEventPlayerCard(await readJson(req)));
  }
  if (url.pathname === '/api/admin/events/players/import' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res,403,{error:'Modo Evento está reservado al administrador principal.'});
    return sendJson(res,200,importEventPlayersCsv(await readJson(req,1_500_000)));
  }
  if (url.pathname === '/api/admin/state' && req.method === 'GET') return sendJson(res, 200, { ...adminPayload(), accessRole: session.role, selectedWorkspaceId: session.workspaceId });
  if (url.pathname === '/api/admin/workspaces' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'Solo el administrador principal puede cambiar de sala.' });
    return sendJson(res, 200, operationalAdminPayload(session));
  }
  if (url.pathname === '/api/admin/private-room-key' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'Solo el administrador principal puede consultar claves privadas.' });
    if (state.roomSettings?.roomOrigin !== 'community' || state.roomSettings?.communityAccessType !== 'private') throw new Error('La sala seleccionada no es privada.');
    const publicId = String(state.roomSettings?.communityPublicId || '');
    const record = publicId ? communityPublicRoomById(publicId) : null;
    const accessKey = record?.accessKeyAdmin || '';
    if (!accessKey) throw new Error('La clave de esta sala fue creada antes de esta actualización y todavía no puede recuperarse. Se guardará cuando vuelva a usarse correctamente.');
    return sendJson(res, 200, { accessKey });
  }
  if (url.pathname === '/api/admin/workspace/select' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'Solo el administrador principal puede cambiar de sala.' });
    const payload = await readJson(req);
    const workspaceId = String(payload.workspaceId || '');
    if (!OPERATIONAL_WORKSPACE_IDS.includes(workspaceId)) throw new Error('Sala de administración no válida.');
    session.workspaceId = workspaceId;
    session.expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
    return sendJson(res, 200, operationalAdminPayload(session));
  }
  if (url.pathname === '/api/admin/history' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'El historial completo solo está disponible para el administrador principal.' });
    const roomCode = String(url.searchParams.get('sala') || '').trim();
    return sendJson(res, 200, roomCode ? historyDetailPayload(roomCode) : { entries: historyListPayload() });
  }
  if (url.pathname === '/api/admin/history/file' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'El historial completo solo está disponible para el administrador principal.' });
    const entry = historyEntryByRoomCode(url.searchParams.get('sala'));
    if (!entry) throw new Error('No se encontró esa partida en el historial.');
    const type = String(url.searchParams.get('type') || 'acta-pdf');
    const map = {
      'results-pdf': [entry.files?.resultsPdf, 'application/pdf', `LA_GORDA_Resultados_${entry.roomCode}.pdf`],
      'acta-pdf': [entry.files?.actaPdf, 'application/pdf', `LA_GORDA_Acta_${entry.roomCode}.pdf`],
      'acta-csv': [entry.files?.actaCsv, 'text/csv; charset=utf-8', `LA_GORDA_Acta_${entry.roomCode}.csv`],
      'acta-json': [entry.files?.actaJson, 'application/json; charset=utf-8', `LA_GORDA_Acta_${entry.roomCode}.json`],
      'participants-csv': [entry.files?.participantsCsv, 'text/csv; charset=utf-8', `LA_GORDA_Jugadores_${entry.roomCode}.csv`]
    };
    const choice = map[type];
    if (!choice?.[0]) throw new Error('Ese archivo no está disponible para esta partida.');
    const file = historicalFile(entry, choice[0]);
    if (!file) throw new Error('El archivo histórico no está disponible.');
    return sendBuffer(res, 200, fs.readFileSync(file), choice[1], choice[2]);
  }
  if (url.pathname === '/api/admin/community' && req.method === 'GET') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'La Comunidad solo puede configurarla el administrador principal.' });
    return sendJson(res, 200, communityAdminPayload());
  }
  if (url.pathname === '/api/admin/community/settings' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'La Comunidad solo puede configurarla el administrador principal.' });
    return sendJson(res, 200, updateCommunitySettings(await readJson(req)));
  }
  if (url.pathname === '/api/admin/community/banner' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'Los banners solo puede configurarlos el administrador principal.' });
    return sendJson(res, 200, updateCommunityBannerImage(await readJson(req, 3_600_000)));
  }
  if (url.pathname === '/api/admin/community/player-ad' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'La publicidad solo puede configurarla el administrador principal.' });
    return sendJson(res, 200, updatePlayerAdImage(await readJson(req, 3_600_000)));
  }
  if (url.pathname === '/api/admin/community/schedule' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'La Agenda solo puede configurarla el administrador principal.' });
    return sendJson(res, 200, updateCommunitySchedule(await readJson(req)));
  }
  if (url.pathname === '/api/admin/community/moderate' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'La Comunidad solo puede moderarla el administrador principal.' });
    return sendJson(res, 200, moderateCommunity(await readJson(req)));
  }
  if (url.pathname === '/api/admin/create-simple-room' && req.method === 'POST') {
    if (session.role === 'community_host') return sendJson(res, 403, { error: 'El anfitrión administra solamente la sala privada que creó.' });
    return sendJson(res, 200, createSimpleRoom(await readJson(req)));
  }
  if (url.pathname === '/api/admin/create-ai-simulation' && req.method === 'POST') {
    if (session.role !== 'owner') return sendJson(res, 403, { error: 'La simulación masiva solo está disponible para el administrador principal.' });
    return sendJson(res, 200, createAdminSimulationRoom(await readJson(req)));
  }
  if (url.pathname === '/api/admin/add-official-player' && req.method === 'POST') return sendJson(res, 200, addOfficialPlayer(await readJson(req)));
  if (url.pathname === '/api/admin/invite-player' && req.method === 'POST') return sendJson(res, 200, createInvitedPlayer(await readJson(req)));
  if (url.pathname === '/api/admin/invite-players' && req.method === 'POST') return sendJson(res, 200, createBulkInvitedPlayers(await readJson(req)));
  if (url.pathname === '/api/admin/player-approval' && req.method === 'POST') return sendJson(res, 200, updatePlayerApproval(await readJson(req)));
  if (url.pathname === '/api/admin/player-view-session' && req.method === 'POST') return sendJson(res, 200, createAdminPlayerViewSession(await readJson(req)));
  if (url.pathname === '/api/admin/player-recovery-link' && req.method === 'POST') return sendJson(res, 200, createPlayerRecoveryLink(await readJson(req)));
  if (url.pathname === '/api/admin/remove-player' && req.method === 'POST') return sendJson(res, 200, removeRoomPlayer(await readJson(req)));
  if (url.pathname === '/api/admin/join-open' && req.method === 'POST') return sendJson(res, 200, updateJoinOpen(await readJson(req)));
  if (url.pathname === '/api/admin/configure' && req.method === 'POST') {
    if (session.role === 'community_host') return sendJson(res, 403, { error: 'El anfitrión no puede reemplazar la sala privada.' });
    const payload = await readJson(req);
    return sendJson(res, 200, configureRoom(payload));
  }
  if (url.pathname === '/api/admin/new-room' && req.method === 'POST') {
    if (session.role === 'community_host') return sendJson(res, 403, { error: 'El anfitrión no puede crear otra sala desde este acceso.' });
    assertOperatorMayStartNewGame(session);
    return sendJson(res, 200, newRoomState());
  }
  if (url.pathname === '/api/admin/game' && req.method === 'POST') return sendJson(res, 200, updateGame((await readJson(req)).game));
  if (url.pathname === '/api/admin/draw' && req.method === 'POST') return sendJson(res, 200, drawNextBall((await readJson(req)).source || 'manual'));
  if (url.pathname === '/api/admin/draw-settings' && req.method === 'POST') return sendJson(res, 200, updateDrawSettings(await readJson(req)));
  if (url.pathname === '/api/admin/test/draw-order' && req.method === 'POST') return sendJson(res, 200, setTestDrawOrder(await readJson(req)));
  if (url.pathname === '/api/admin/start' && req.method === 'POST') return sendJson(res, 200, startRoom(await readJson(req)));
  if (url.pathname === '/api/admin/cancel-claim-auto-resume' && req.method === 'POST') { clearClaimAutoResume(currentWorkspace(), 'kept_paused_by_admin'); saveState(); broadcast(); return sendJson(res, 200, adminPayload()); }
  if (url.pathname === '/api/admin/pause' && req.method === 'POST') return sendJson(res, 200, pauseRoom());
  if (url.pathname === '/api/admin/resume' && req.method === 'POST') return sendJson(res, 200, resumeRoom(await readJson(req)));
  if (url.pathname === '/api/admin/resolve-device-transfer' && req.method === 'POST') return sendJson(res, 200, resolveDeviceTransfer(await readJson(req)));
  if (url.pathname === '/api/admin/finish' && req.method === 'POST') return sendJson(res, 200, finishRoom(await readJson(req)));
  if (url.pathname === '/api/admin/assignment-timer' && req.method === 'POST') return sendJson(res, 200, controlAssignmentTimer(await readJson(req)));
  if (url.pathname === '/api/admin/settings' && req.method === 'POST') return sendJson(res, 200, updateRoomSettings(await readJson(req)));
  if (url.pathname === '/api/admin/message' && req.method === 'POST') return sendJson(res, 200, updateAdminMessage(await readJson(req)));
  if (url.pathname === '/api/admin/chat' && req.method === 'POST') { const payload = await readJson(req); appendChatMessage({ role: 'admin', text: payload.text, stickerId: payload.stickerId }); return sendJson(res, 200, adminPayload()); }
  if (url.pathname === '/api/admin/chat/moderate' && req.method === 'POST') return sendJson(res, 200, moderateChat(await readJson(req)));
  if (url.pathname === '/api/admin/release-selection' && req.method === 'POST') return sendJson(res, 200, releasePlayerSelection(await readJson(req)));
  if (url.pathname === '/api/admin/assign-player' && req.method === 'POST') return sendJson(res, 200, assignCardsToPlayer(await readJson(req)));
  if (url.pathname === '/api/admin/test-event' && req.method === 'POST') return sendJson(res, 200, sendTestEvent(await readJson(req)));
  if (url.pathname === '/api/admin/resolve' && req.method === 'POST') return sendJson(res, 200, resolveClaim(await readJson(req)));
  if (url.pathname === '/api/admin/acta' && req.method === 'GET') return sendJson(res, 200, actaPayload());
  if (url.pathname === '/api/admin/acta.csv' && req.method === 'GET') return sendBuffer(res, 200, Buffer.from(actaCsv(), 'utf8'), 'text/csv; charset=utf-8', `LA_GORDA_Acta_${state.roomCode || 'sala'}.csv`);
  if (url.pathname === '/api/admin/participants.csv' && req.method === 'GET') return sendBuffer(res, 200, Buffer.from(participantsCsv(), 'utf8'), 'text/csv; charset=utf-8', `LA_GORDA_Jugadores_${state.roomCode || 'sala'}.csv`);
  if (url.pathname === '/api/admin/acta.pdf' && req.method === 'GET') return sendBuffer(res, 200, actaPdf(), 'application/pdf', `LA_GORDA_Acta_${state.roomCode || 'sala'}.pdf`);
  if (url.pathname === '/api/admin/backup' && req.method === 'GET') {
    if (session.role === 'community_host') return sendJson(res, 403, { error: 'La copia completa está reservada al administrador principal.' });
    return sendJson(res, 200, backupPayload());
  }
  if (url.pathname === '/api/admin/restore' && req.method === 'POST') {
    if (session.role === 'community_host') return sendJson(res, 403, { error: 'La restauración está reservada al administrador principal.' });
    return sendJson(res, 200, restoreBackup(await readJson(req)));
  }
  if (url.pathname === '/api/admin/close' && req.method === 'POST') { closeRoom(); return sendJson(res, 200, { ok: true }); }
  if (url.pathname === '/api/admin/logout' && req.method === 'POST') { adminSessions.delete(adminTokenFrom(req, url)); return sendJson(res, 200, { ok: true }); }
  return sendJson(res, 404, { error: 'Acción de administrador no encontrada.' });
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname.startsWith('/api/master/')) return await handleMasterApi(req, res, url);
    if (url.pathname === '/api/ping' && req.method === 'GET') return sendJson(res, 200, { ok: true, at: nowIso(), version: APP_PUBLIC_VERSION });

    if (url.pathname === '/api/event/access-info' && req.method === 'GET') {
      try { return sendJson(res,200,publicEventAccessPayload(url.searchParams.get('codigo'))); }
      catch(error){ const message=String(error?.message||'No se pudo verificar el código.'); const status=message.includes('no válido')?400:(message.includes('archivado')?410:404); return sendJson(res,status,{error:message}); }
    }
    if (url.pathname === '/api/event/heartbeat' && req.method === 'POST') {
      if(!consumeRate(req,'event-heartbeat',120,60*1000))return sendJson(res,429,{error:'Demasiadas solicitudes. Esperá un momento.'});
      try { const payload=await readJson(req); return sendJson(res,200,heartbeatEventPlayer(payload.codigo)); }
      catch(error){ const message=String(error?.message||'No se pudo actualizar la conexión.'); return sendJson(res,message.includes('archivado')?410:404,{error:message}); }
    }
    if (url.pathname === '/api/event/player-state' && req.method === 'GET') {
      if(!consumeRate(req,'event-player-state',1200,60*1000))return sendJson(res,429,{error:'Demasiadas actualizaciones. Esperá un momento.'});
      try{return sendJson(res,200,premiumEventPlayerLivePayload(url.searchParams.get('codigo')))}catch(error){const message=String(error?.message||'No se pudo abrir el cartón.');return sendJson(res,message.includes('archivado')?410:404,{error:message})}
    }
    if (url.pathname === '/api/event/mark' && req.method === 'POST') {
      if(!consumeRate(req,'event-mark',500,60*1000))return sendJson(res,429,{error:'Demasiadas marcas. Esperá un momento.'});
      try{return sendJson(res,200,markPremiumEventCard(await readJson(req)))}catch(error){return sendJson(res,400,{error:String(error?.message||'No se pudo marcar el cartón.')})}
    }
    if (url.pathname === '/api/event/claim' && req.method === 'POST') {
      if(!consumeRate(req,'event-claim',120,60*1000))return sendJson(res,429,{error:'Demasiados reclamos. Esperá un momento.'});
      try{return sendJson(res,200,claimPremiumEventCard(await readJson(req)))}catch(error){return sendJson(res,400,{error:String(error?.message||'No se pudo enviar el reclamo.')})}
    }
    if (url.pathname === '/api/event/live-state' && req.method === 'GET') {
      if(!consumeRate(req,'event-live-state',300,60*1000)) return sendJson(res,429,{error:'Demasiadas actualizaciones. Esperá un momento.'});
      try { return sendJson(res,200,premiumEventPublicLivePayload(url.searchParams.get('evento'), url.searchParams.get('token'))); }
      catch(error){ const message=String(error?.message||'No se pudo abrir la pantalla del evento.'); return sendJson(res,message.includes('no válido')?401:404,{error:message}); }
    }
    if (url.pathname === '/api/community/state' && req.method === 'GET') return sendJson(res, 200, communityStatePayload(url.searchParams.get('visitorId')));
    if (url.pathname === '/api/community/resume' && req.method === 'GET') {
      const resume = activePlayerResume(req);
      return sendJson(res, 200, resume ? { resume:true, url:'/jugar', status:resume.status, roomCode:resume.roomCode } : { resume:false });
    }
    if (url.pathname === '/api/community/chat' && req.method === 'POST') {
      if (!consumeRate(req, 'community-chat', 35, 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados mensajes. Esperá un momento.' });
      const message = appendCommunityMessage(req, await readJson(req));
      return sendJson(res, 200, { message, state: communityStatePayload(message.visitorId) });
    }
    if (url.pathname === '/api/community/report' && req.method === 'POST') {
      if (!consumeRate(req, 'community-report', 60, 60 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados reportes. Probá más tarde.' });
      return sendJson(res, 200, reportCommunityMessage(await readJson(req)));
    }
    if (url.pathname === '/api/community/score' && req.method === 'POST') {
      if (!consumeRate(req, 'community-score', 80, 60 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados puntajes enviados. Probá más tarde.' });
      return sendJson(res, 200, submitCommunityScore(await readJson(req)));
    }
    if (url.pathname === '/api/community/cards/generate' && req.method === 'POST') {
      if (!consumeRate(req, 'community-card-lot', 30, 60 * 60 * 1000)) return sendJson(res, 429, { error: 'Generaste muchos lotes en poco tiempo. Probá más tarde.' });
      const lot = createPrintableCardLot(await readJson(req));
      return sendJson(res, 200, { ...lot, downloadUrl:`/api/community/cards/pdf?lot=${encodeURIComponent(lot.code)}` });
    }
    if (url.pathname === '/api/community/cards/lot' && req.method === 'GET') {
      const lot = loadCardLot(url.searchParams.get('lot'));
      if (!lot) return sendJson(res, 404, { error: 'No encontramos ese lote de cartones.' });
      return sendJson(res, 200, lot);
    }
    if (url.pathname === '/api/community/cards/validate' && req.method === 'POST') {
      if (!consumeRate(req, 'community-card-validate', 180, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiadas validaciones. Esperá un momento.' });
      return sendJson(res, 200, validateCardLotClaim(await readJson(req)));
    }
    if (url.pathname === '/api/community/cards/pdf' && req.method === 'GET') {
      const lot = loadCardLot(url.searchParams.get('lot'));
      if (!lot) return sendJson(res, 404, { error: 'No encontramos ese lote de cartones.' });
      return sendBuffer(res, 200, buildCardLotPdf(lot), 'application/pdf', cardLotPdfFilename(lot));
    }
    if (url.pathname === '/api/community/public-room' && req.method === 'POST') {
      if (!consumeRate(req, 'community-public-room', 15, 60 * 60 * 1000)) return sendJson(res, 429, { error: 'Se crearon demasiadas salas desde esta conexión. Probá más tarde.' });
      const created = createCommunityPublicRoom(await readJson(req));
      if (created.playerSessionToken) setPlayerSessionCookie(req, res, created.playerSessionToken);
      const { playerSessionToken, ...safeCreated } = created;
      return sendJson(res, 200, safeCreated);
    }
    if (url.pathname === '/api/community/creator-recover' && req.method === 'POST') {
      if (!consumeRate(req, 'community-creator-recover', 20, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      const recovered = recoverCommunityCreator(await readJson(req));
      const { token, ...safeRecovered } = recovered;
      return sendJson(res, 200, safeRecovered);
    }
    if (url.pathname === '/api/community/creator-state' && req.method === 'POST') {
      if (!consumeRate(req, 'community-creator-state', 240, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiadas actualizaciones. Esperá un momento.' });
      const organizerState = recoverCommunityCreator(await readJson(req));
      const { token, ...safeOrganizerState } = organizerState;
      return sendJson(res, 200, safeOrganizerState);
    }
    if (url.pathname === '/api/community/creator-join-player' && req.method === 'POST') {
      if (!consumeRate(req, 'community-creator-join-player', 20, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      return sendJson(res, 200, joinCommunityCreatorAsPlayer(req, res, await readJson(req)));
    }
    if (url.pathname === '/api/community/creator-start' && req.method === 'POST') {
      if (!consumeRate(req, 'community-creator-start', 20, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      return sendJson(res, 200, startCommunityRoomFromCreator(await readJson(req)));
    }
    if (url.pathname === '/api/community/room-access' && req.method === 'POST') {
      if (!consumeRate(req, 'community-room-access', 80, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      return sendJson(res, 200, accessCommunityRoom(req, res, await readJson(req)));
    }
    if (url.pathname === '/api/community/public-room/cancel' && req.method === 'POST') {
      if (!consumeRate(req, 'community-public-room-cancel', 20, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      return sendJson(res, 200, cancelCommunityPublicRoom(await readJson(req)));
    }
    if (url.pathname === '/api/community/private-room' && req.method === 'POST') return sendJson(res, 410, { error: 'Usá el creador de salas de Comunidad.' });
    if (url.pathname === '/api/community/host-login' && req.method === 'POST') return sendJson(res, 410, { error: 'El acceso de anfitrión separado no se utiliza.' });

    if (url.pathname === '/api/demo/create' && req.method === 'POST') {
      if (!consumeRate(req, 'demo-create', 40, 10 * 60 * 1000)) return sendJson(res, 429, { error: 'Se crearon muchas demostraciones desde esta conexión. Esperá unos minutos y probá de nuevo.' });
      const created = createDemoRoom(await readJson(req));
      setDemoSessionCookie(req, res, created.demoSessionToken);
      return sendJson(res, 200, publicDemoCreation(created));
    }

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
      const disposition = url.searchParams.get('preview') === '1' ? 'inline' : 'attachment';
      let workspace = requestedRoom ? findWorkspaceByRoomCode(requestedRoom) : ownerWorkspace;
      if (!workspace && requestedRoom) workspace = [...workspaces.values()].find(item => String(item.lastResultMeta?.roomCode || '').toUpperCase() === requestedRoom) || null;
      if (!workspace && requestedRoom) {
        const historical = historyEntryByRoomCode(requestedRoom);
        const file = historical ? historicalFile(historical, historical.files?.resultsPdf) : null;
        if (file) return sendBuffer(res, 200, fs.readFileSync(file), 'application/pdf', `LA_GORDA_BINGO_ONLINE_Resultados_Sala_${historical.roomCode}.pdf`, disposition);
      }
      if (!workspace) throw new Error('No se encontró un resultado finalizado para esa sala.');
      return workspaceContext.run(workspace, () => {
        const meta = currentWorkspace().lastResultMeta;
        if (requestedRoom && String(state.roomCode || '').toUpperCase() === requestedRoom && state.active && state.game) {
          if (state.status !== 'finished') throw new Error('Los resultados estarán disponibles cuando finalice el sorteo.');
          return sendBuffer(res, 200, buildResultsPdf(), 'application/pdf', resultsFilename(), disposition);
        }
        if (meta && fs.existsSync(currentWorkspace().resultPdfFile) && (!requestedRoom || String(meta.roomCode).toUpperCase() === requestedRoom)) {
          return sendBuffer(res, 200, fs.readFileSync(currentWorkspace().resultPdfFile), 'application/pdf', meta.filename || 'LA_GORDA_BINGO_ONLINE_Resultados.pdf', disposition);
        }
        if (requestedRoom) {
          const historical = historyEntryByRoomCode(requestedRoom);
          const file = historical ? historicalFile(historical, historical.files?.resultsPdf) : null;
          if (file) return sendBuffer(res, 200, fs.readFileSync(file), 'application/pdf', `LA_GORDA_BINGO_ONLINE_Resultados_Sala_${historical.roomCode}.pdf`, disposition);
        }
        throw new Error('No hay un sorteo finalizado disponible.');
      });
    }

    if (url.pathname === '/api/broadcast/state' && req.method === 'GET') {
      const workspace = findWorkspaceByBroadcastToken(url.searchParams.get('token'));
      if (!workspace) return sendJson(res, 404, { error: 'Enlace de transmisión no válido.' });
      const record = workspace.state.roomSettings?.roomOrigin === 'community' ? communityPublicRoomById(workspace.state.roomSettings?.communityPublicId || '') : null;
      if (record?.accessType === 'private' && !reqMayAccessPrivateCommunityRoom(req, record)) return sendJson(res, 401, { error: 'Esta transmisión es privada.' });
      return workspaceContext.run(workspace, () => sendJson(res, 200, broadcastPayload()));
    }

    if (url.pathname === '/api/player/alpha-join' && req.method === 'POST') {
      if (!consumeRate(req, 'alpha-join', 120, 10 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      const payload = await readJson(req); const workspace = findWorkspaceByAccessKey(payload.accessKey);
      if (!workspace) throw new Error('Clave de sala incorrecta o sala no disponible.');
      return workspaceContext.run(workspace, () => sendJson(res, 200, openJoinPlayer(payload)));
    }
    if (url.pathname === '/api/player/recover' && req.method === 'POST') {
      const payload = await readJson(req); const workspace = findWorkspaceByRecoveryToken(payload.recoveryToken);
      if (!workspace) throw new Error('El enlace de recuperación no es válido.');
      return workspaceContext.run(workspace, () => sendJson(res, 200, recoverPlayerByDirectToken(payload)));
    }
    if (url.pathname === '/api/player/open-join' && req.method === 'POST') {
      if (!consumeRate(req, 'open-join', 40, 10 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      const payload = await readJson(req); const workspace = findWorkspaceByRoomCode(payload.roomCode);
      if (!workspace) throw new Error('No se encontró esa sala.');
      return workspaceContext.run(workspace, () => sendJson(res, 200, openJoinPlayer(payload)));
    }
    if (url.pathname === '/api/player/login' && req.method === 'POST') {
      return sendJson(res, 410, { error: 'El acceso por código personal fue eliminado. Ingresá por el enlace/clave general y tu sesión privada.' });
    }
    if (url.pathname === '/api/player/request-transfer' && req.method === 'POST') {
      return sendJson(res, 410, { error: 'El cambio de dispositivo por código fue eliminado. Pedile al administrador un enlace privado de recuperación.' });
    }
    if (url.pathname === '/api/player/transfer-status' && req.method === 'POST') {
      return sendJson(res, 410, { error: 'El cambio de dispositivo por código fue eliminado.' });
    }
    if (url.pathname === '/api/admin-player-preview/state' && req.method === 'GET') {
      const token = String(url.searchParams.get('token') || '');
      const view = playerViewSession(token);
      const workspace = view ? workspaces.get(view.workspaceId) : null;
      if (!workspace) return sendJson(res, 401, { error: 'Vista previa vencida. Volvé a abrirla desde Administrador.' });
      return workspaceContext.run(workspace, () => {
        currentWorkspace().lastActivityAt = Date.now();
        const player = state.players.find(item => item.id === view.playerId);
        if (!player) return sendJson(res, 404, { error: 'El jugador de la vista previa ya no existe.' });
        return sendJson(res, 200, { ...playerPayload(player), adminPreview: true, adminPreviewVirtual: Boolean(player.virtual) });
      });
    }
    if (url.pathname.startsWith('/api/player/')) {
      const token = playerTokenFrom(req, url);
      const workspace = findWorkspaceByPlayerToken(token);
      if (!workspace) return sendJson(res, 401, { error: 'La sesión no es válida. Volvé a ingresar con tu código.' });
      return await workspaceContext.run(workspace, async () => {
        currentWorkspace().lastActivityAt = Date.now();
        const player = playerByToken(token);
        if (!player) return sendJson(res, 401, { error: 'La sesión no es válida.' });
        const viewSession = playerViewSession(token);
        const readOnlyPreview = Boolean(viewSession?.readOnly);
        if (url.pathname === '/api/player/state' && req.method === 'GET') return sendJson(res, 200, { ...playerPayload(player), adminPreview: readOnlyPreview });
        if (url.pathname === '/api/player/integrity.txt' && req.method === 'GET') {
          const integrity = publicIntegrityPayload();
          if (!integrity?.commitment) throw new Error('El sello todavía no está disponible.');
          const lines = [`BINGO DE LA GORDA`, `Sala: ${state.roomCode}`, `Algoritmo: ${integrity.algorithm}`, `Sello SHA-256: ${integrity.commitment}`, `Sellado: ${integrity.sealedAt || ''}`, `Revelado: ${integrity.revealed ? 'SI' : 'NO'}`, `Verificado: ${integrity.verified === true ? 'SI' : integrity.verified === false ? 'NO' : 'PENDIENTE'}`];
          if (integrity.revealed && Array.isArray(integrity.drawOrder)) lines.push(`Orden: ${integrity.drawOrder.join(',')}`);
          return sendBuffer(res, 200, Buffer.from(lines.join('\n'), 'utf8'), 'text/plain; charset=utf-8', `LA_GORDA_Sello_${state.roomCode || 'sala'}.txt`);
        }
        if (url.pathname === '/api/player/acta.pdf' && req.method === 'GET') {
          if (state.status !== 'finished') throw new Error('El acta se habilita al finalizar la partida.');
          return sendBuffer(res, 200, actaPdf(), 'application/pdf', `LA_GORDA_Acta_${state.roomCode || 'sala'}.pdf`);
        }
        if (readOnlyPreview) return sendJson(res, 403, { error: 'Vista previa del administrador: modo solo lectura.' });
        if (url.pathname === '/api/player/reserve' && req.method === 'POST') return sendJson(res, 200, reserveCard(player, await readJson(req)));
        if (url.pathname === '/api/player/renew-offers' && req.method === 'POST') return sendJson(res, 200, renewOffers(player));
        if (url.pathname === '/api/player/name' && req.method === 'POST') return sendJson(res, 200, setPlayerName(player, await readJson(req)));
        if (url.pathname === '/api/player/choose' && req.method === 'POST') return sendJson(res, 200, chooseCards(player, await readJson(req)));
        if (url.pathname === '/api/player/demo/tutorial' && req.method === 'POST') return sendJson(res, 200, resolveDemoTutorial(player, await readJson(req)));
        if (url.pathname === '/api/player/demo/retry' && req.method === 'POST') return sendJson(res, 200, retryDemoServerStart(player));
        if (url.pathname === '/api/player/demo/start' && req.method === 'POST') return sendJson(res, 200, startDemoFromPlayer(player));
        if (url.pathname === '/api/player/demo/reset' && req.method === 'POST') {
          const restarted = restartDemoFromPlayer(player);
          setDemoSessionCookie(req, res, restarted.demoSessionToken);
          return sendJson(res, 200, publicDemoCreation(restarted));
        }
        if (url.pathname === '/api/player/release' && req.method === 'POST') return sendJson(res, 200, releaseOwnSelection(player));
        if (url.pathname === '/api/player/mark' && req.method === 'POST') return sendJson(res, 200, markNumber(player, await readJson(req)));
        if (url.pathname === '/api/player/automark' && req.method === 'POST') return sendJson(res, 200, setAutoMark(player, await readJson(req)));
        if (url.pathname === '/api/player/claim' && req.method === 'POST') return sendJson(res, 200, createClaim(player, await readJson(req)));
        if (url.pathname === '/api/player/waiting-game/score' && req.method === 'POST') return sendJson(res, 200, submitWaitingGameScore(player, await readJson(req)));
        if (url.pathname === '/api/player/community-start' && req.method === 'POST') return sendJson(res, 200, startCommunityRoomFromPlayer(player));
        if (url.pathname === '/api/player/community-cancel' && req.method === 'POST') return sendJson(res, 200, cancelCommunityRoomFromPlayer(player));
        if (url.pathname === '/api/player/community-rematch' && req.method === 'POST') return sendJson(res, 200, communityRematchFromPlayer(player));
        if (url.pathname === '/api/player/chat' && req.method === 'POST') {
          if (!consumeRate(req, `chat-${player.id}`, 30, 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados mensajes. Esperá un momento.' });
          const payload = await readJson(req);
          return sendJson(res, 200, appendChatMessage({ role: 'player', player, text: payload.text, stickerId: payload.stickerId }));
        }
        return sendJson(res, 404, { error: 'Acción de jugador no encontrada.' });
      });
    }
    return sendJson(res, 404, { error: 'API no encontrada.' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'No se pudo completar la acción.' });
  }
}

const adminContingencyTimers = new Map();
const automaticClaimVerificationTimers = new Map();

function clearAdminContingencyTimer(workspace = currentWorkspace()) {
  const timer = adminContingencyTimers.get(workspace.id);
  if (timer) clearTimeout(timer);
  adminContingencyTimers.delete(workspace.id);
}

function clearAutomaticClaimVerificationTimer(workspace = currentWorkspace()) {
  const timer = automaticClaimVerificationTimers.get(workspace.id);
  if (timer) clearTimeout(timer);
  automaticClaimVerificationTimers.delete(workspace.id);
}

function resetAdminPresence(workspace = currentWorkspace()) {
  clearAdminContingencyTimer(workspace);
  return workspaceContext.run(workspace, () => {
    const previous = state.adminContingency || blankState().adminContingency;
    const changed = Boolean(previous.disconnectedSince || previous.activatesAt || previous.autoVerificationActive);
    state.adminContingency = { disconnectedSince: null, activatesAt: null, autoVerificationActive: false, activatedAt: null };
    if (changed) {
      logEvent('admin_reconnected', { automaticVerificationWasActive: Boolean(previous.autoVerificationActive) });
      saveState(); broadcast();
    }
  });
}

function scheduleAutomaticClaimVerification(workspace = currentWorkspace()) {
  clearAutomaticClaimVerificationTimer(workspace);
  workspaceContext.run(workspace, () => {
    const pending = state.claims.filter(item => item.status === 'pending').sort((a,b)=>Number(a.receivedSequence||0)-Number(b.receivedSequence||0));
    if (!pending.length) return;
    const oldest = pending[0];
    const claimDeadline = state.adminContingency?.autoVerificationActive ? Date.now() : Number(oldest.receivedEpochMs || Date.now()) + CLAIM_ADMIN_AUTO_VERIFY_MS;
    const auditDeadline = state.claimWindow ? Number(state.claimWindow.expiresAtMs || 0) + 20 : Date.now();
    const waitMs = Math.max(20, Math.max(claimDeadline, auditDeadline) - Date.now());
    const timer = setTimeout(() => workspaceContext.run(workspace, () => {
      automaticClaimVerificationTimers.delete(workspace.id);
      const queue = state.claims.filter(item => item.status === 'pending').sort((a,b)=>Number(a.receivedSequence||0)-Number(b.receivedSequence||0));
      for (const claim of queue) {
        if (claim.status !== 'pending') continue;
        try {
          resolveClaim({ claimId: claim.id, resolution: claim.officialValid ? 'confirmed' : 'rejected', automaticVerification: true, note: 'Verificación automática: el administrador no resolvió el reclamo dentro de 10 segundos.' });
        } catch (error) {
          if (claim.status === 'pending') {
            try { resolveClaim({ claimId: claim.id, resolution: 'rejected', automaticVerification: true, note: `Verificación automática: ${error.message}` }); } catch {}
          }
        }
      }
      const remaining = state.claims.some(item => item.status === 'pending');
      if (remaining) scheduleAutomaticClaimVerification(workspace);
      else if (state.status === 'paused' && state.pauseReason === 'claim' && state.game?.drawMode === 'automatic' && !confirmedClaims('bingo').length) {
        try { resumeRoom({ mode: 'automatic', immediate: true, automaticAfterClaim: true }); } catch {}
      }
    }), waitMs);
    automaticClaimVerificationTimers.set(workspace.id, timer);
  });
}

function activateAdminContingency(workspace = currentWorkspace()) {
  return workspaceContext.run(workspace, () => {
    if (adminConnectionCount(workspace) > 0 || !state.active || !state.game || ['closed','finished','waiting'].includes(state.status)) return;
    const contingency = state.adminContingency || blankState().adminContingency;
    if (contingency.autoVerificationActive) return;
    state.adminContingency = { ...contingency, autoVerificationActive: true, activatedAt: nowIso() };
    logEvent('admin_contingency_activated', { thresholdMs: ADMIN_CONTINGENCY_MS, status: state.status, drawMode: state.game.drawMode });
    saveState(); broadcast();
    scheduleAutomaticClaimVerification(workspace);
  });
}

function markAdminDisconnected(workspace = currentWorkspace()) {
  return workspaceContext.run(workspace, () => {
    if (adminConnectionCount(workspace) > 0 || !state.active || !state.game || ['closed','finished','waiting'].includes(state.status)) return;
    const contingency = state.adminContingency || blankState().adminContingency;
    if (!contingency.disconnectedSince) {
      const now = Date.now();
      state.adminContingency = {
        ...contingency,
        disconnectedSince: new Date(now).toISOString(),
        activatesAt: new Date(now + ADMIN_CONTINGENCY_MS).toISOString(),
        autoVerificationActive: false,
        activatedAt: null
      };
      logEvent('admin_disconnected', { contingencySeconds: Math.round(ADMIN_CONTINGENCY_MS/1000) });
      saveState(); broadcast();
    }
    clearAdminContingencyTimer(workspace);
    const target = new Date(state.adminContingency.activatesAt || 0).getTime();
    const delay = Math.max(0, target - Date.now());
    const timer = setTimeout(() => activateAdminContingency(workspace), delay);
    adminContingencyTimers.set(workspace.id, timer);
  });
}

function handleEvents(req, res, url) {
  const role = url.searchParams.get('role');
  let workspace = null;
  let player = null;
  let token = playerTokenFrom(req, url);
  if (role === 'admin') {
    token = url.searchParams.get('adminToken') || '';
    const session = adminSessionFrom(req, url);
    if (!session) return sendJson(res, 401, { error: 'Acceso de administrador denegado.' });
    workspace = workspaces.get(session.workspaceId) || null;
  } else if (role === 'player') {
    workspace = findWorkspaceByPlayerToken(token);
    if (workspace) player = workspaceContext.run(workspace, () => playerByToken(token));
    if (!player) return sendJson(res, 401, { error: 'Sesión inválida.' });
  } else if (role === 'broadcast') {
    workspace = findWorkspaceByBroadcastToken(url.searchParams.get('broadcastToken'));
    token = url.searchParams.get('broadcastToken') || '';
    if (!workspace) return sendJson(res, 401, { error: 'Transmisión no válida.' });
    const record = workspace.state.roomSettings?.roomOrigin === 'community' ? communityPublicRoomById(workspace.state.roomSettings?.communityPublicId || '') : null;
    if (record?.accessType === 'private' && !reqMayAccessPrivateCommunityRoom(req, record)) return sendJson(res, 401, { error: 'Esta transmisión es privada.' });
  } else if (role === 'event') {
    const accessCode=normalizeEventAccessCode(url.searchParams.get('codigo'));
    const found=accessCode?premiumEventPlayerFromCode(accessCode):null;
    if(!found?.player)return sendJson(res,401,{error:'Código de Evento no válido o sin jugador vinculado.'});
    workspace=eventLiveWorkspace(found.event);
    if(!workspace||!found.event.live?.active)return sendJson(res,409,{error:'El Evento todavía no está conectado a una partida.'});
    player={ id:found.player.id, eventCode:found.event.code, accessCode, accessedCard:{lotCode:found.lot.code,cardNumber:found.card.globalNumber} };
    token=accessCode;
    markEventPlayerPresence(found.event.code,found.player.id);
  } else return sendJson(res, 400, { error: 'Rol inválido.' });
  if (!workspace) return sendJson(res, 401, { error: 'Acceso inválido.' });
  return workspaceContext.run(workspace, () => {
    currentWorkspace().lastActivityAt = Date.now();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff'
    });
    res.write(': conectado\n\n');
    const client = { res, role, token, playerId: role==='event'?null:(player?.id || null), eventCode:role==='event'?player?.eventCode||'':'', eventPlayerId:role==='event'?player?.id||'':'', accessedCard:role==='event'?player?.accessedCard||null:null };
    sseClients.add(client);
    if (role === 'admin') resetAdminPresence(workspace);
    if (role === 'admin') writeSse(res, 'state', adminPayload());
    else if (role === 'broadcast') writeSse(res, 'state', broadcastPayload());
    else if (role === 'event') {
      const event=loadEvent(client.eventCode),eventPlayer=event?eventPlayerById(event,client.eventPlayerId):null;
      if(!event||!eventPlayer)return writeSse(res,'logout',{reason:'El Evento no está disponible.'});
      writeSse(res,'state',premiumEventPlayerLivePayloadFromContext(event,eventPlayer,client.accessedCard));
    } else writeSse(res, 'state', playerPayload(player));
    // La lista del Admin debe reflejar enseguida quién está realmente conectado.
    if (role === 'player' || role === 'event') setTimeout(() => workspaceContext.run(workspace, () => broadcast()), 0);
    req.on('close', () => workspaceContext.run(workspace, () => {
      sseClients.delete(client);
      if (role === 'admin') markAdminDisconnected(workspace);
      if (role === 'player' || role === 'event') setTimeout(() => workspaceContext.run(workspace, () => broadcast()), 0);
    }));
  });
}

function serveCommunityEndedRoomPage(res, record) {
  const historical = record?.roomCode ? historyEntryByRoomCode(record.roomCode) : null;
  const winner = historical?.winners?.find(item => item.type === 'bingo') || historical?.winners?.at(-1) || null;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0715"><title>${escapeHtml(record?.name || 'Sala')} · EL BINGO DE LA GORDA</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#321a45,#0b0715 55%,#04030a);color:#fff;font-family:Segoe UI,Arial,sans-serif;padding:18px;box-sizing:border-box}.box{width:min(480px,100%);background:#171020;border:1px solid #ffffff22;border-radius:22px;padding:26px;text-align:center;box-shadow:0 22px 70px #0009}.box img{width:92px}.box h1{font-size:25px;margin:10px 0}.box p{color:#c9bfd3;line-height:1.5}.tag{display:inline-block;padding:6px 10px;border-radius:999px;background:#2b1b39;color:#f4d6ff;font-size:11px;font-weight:900}.btn{display:block;margin-top:16px;padding:13px;border-radius:13px;background:#ffd45c;color:#281b00;text-decoration:none;font-weight:1000}</style></head><body><main class="box"><img src="/assets/logo.webp" alt="EL BINGO DE LA GORDA" title="Volver a Comunidad" style="cursor:pointer" onclick="location.href='/comunidad?quedar=1'"><span class="tag">PARTIDA FINALIZADA</span><h1>${escapeHtml(record?.name || 'Esta sala')}</h1><p>Esta partida ya terminó.${winner ? `<br><b>Ganó ${escapeHtml(winner.playerName || 'un jugador')}</b> con ${escapeHtml(winner.prizeLabel || 'Bingo')}.` : ''}</p><a class="btn" href="/comunidad">VOLVER A COMUNIDAD</a></main></body></html>`;
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Robots-Tag':'noindex, nofollow'}); res.end(html);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, version: APP_PUBLIC_VERSION, workspaces: workspaces.size });
  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('User-agent: *\nDisallow: /admin\nDisallow: /admin-principal\nDisallow: /operador\nDisallow: /transmision\nDisallow: /v\nDisallow: /tv\n');
  }
  if (url.pathname === '/api/events' && req.method === 'GET') return handleEvents(req, res, url);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);

  const invitationMatch = url.pathname.match(/^\/invitacion\/([^/]+)\/?$/);
  if (invitationMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const inviteToken = decodeURIComponent(invitationMatch[1] || '');
    const workspace = findWorkspaceByInviteToken(inviteToken);
    if (!workspace) return serveInvitationErrorPage(res, 'Este enlace no es válido o la partida ya terminó.');
    return workspaceContext.run(workspace, () => {
      const player = state.players.find(item => item.inviteToken === inviteToken && !item.virtual);
      if (!player) return serveInvitationErrorPage(res, 'Este enlace no es válido.');
      const currentSession = String(cookieValue(req, PLAYER_SESSION_COOKIE) || '').trim();
      if (player.inviteClaimedAt) {
        if (currentSession && currentSession === player.sessionToken) {
          res.writeHead(303, { Location:'/jugar', 'Cache-Control':'no-store, max-age=0', 'Referrer-Policy':'no-referrer' });
          return res.end();
        }
        return serveInvitationErrorPage(res, `El enlace de ${playerDisplayName(player)} ya fue utilizado. Si cambiaste de dispositivo, pedile al administrador un enlace de recuperación.`);
      }
      // WhatsApp, redes y antivirus suelen hacer GET/HEAD para generar una vista previa.
      // Esas consultas NUNCA deben consumir la invitación.
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Type':'text/html; charset=utf-8',
          'Cache-Control':'no-store, max-age=0',
          'X-Robots-Tag':'noindex, nofollow, noarchive',
          'Referrer-Policy':'no-referrer'
        });
        return res.end();
      }
      const activationToken = issueInvitationActivation(inviteToken);
      return serveInvitationActivationPage(res, player, inviteToken, activationToken);
    });
  }
  if (invitationMatch && req.method === 'POST') {
    const inviteToken = decodeURIComponent(invitationMatch[1] || '');
    const workspace = findWorkspaceByInviteToken(inviteToken);
    if (!workspace) return serveInvitationErrorPage(res, 'Este enlace no es válido o la partida ya terminó.');
    try {
      const form = await readForm(req);
      return workspaceContext.run(workspace, () => {
        const player = state.players.find(item => item.inviteToken === inviteToken && !item.virtual);
        if (!player) return serveInvitationErrorPage(res, 'Este enlace no es válido.');
        const currentSession = String(cookieValue(req, PLAYER_SESSION_COOKIE) || '').trim();
        if (player.inviteClaimedAt) {
          if (currentSession && currentSession === player.sessionToken) {
            res.writeHead(303, { Location:'/jugar', 'Cache-Control':'no-store, max-age=0', 'Referrer-Policy':'no-referrer' });
            return res.end();
          }
          return serveInvitationErrorPage(res, `El enlace de ${playerDisplayName(player)} ya fue utilizado. Si cambiaste de dispositivo, pedile al administrador un enlace de recuperación.`);
        }
        if (!consumeInvitationActivation(form.activationToken, inviteToken)) {
          return serveInvitationErrorPage(res, 'La activación venció. Volvé a abrir el enlace de WhatsApp para ingresar.');
        }
        try {
          const claimed = claimPlayerInvitation(inviteToken, randomId('device'));
          setPlayerSessionCookie(req, res, claimed.token);
          res.writeHead(303, { Location:'/jugar', 'Cache-Control':'no-store, max-age=0', 'Referrer-Policy':'no-referrer' });
          return res.end();
        } catch (error) {
          return serveInvitationErrorPage(res, error.message || 'No se pudo abrir la invitación.');
        }
      });
    } catch (error) {
      return serveInvitationErrorPage(res, error.message || 'No se pudo activar la invitación.');
    }
  }

  if (url.pathname === '/jugador/verificar' && req.method === 'POST') {
    try {
      if (!consumeRate(req, 'alpha-access-form', 120, 10 * 60 * 1000)) return servePlayerAccessPage(res, { error:'Demasiados intentos. Esperá unos minutos.' });
      const form = await readForm(req);
      const workspace = findWorkspaceByAccessKey(form.accessKey);
      if (!workspace) return servePlayerAccessPage(res, { error:'Clave incorrecta o sala no disponible.' });
      return workspaceContext.run(workspace, () => {
        if (!state.active || state.status !== 'waiting' || !state.roomSettings?.joinOpen) return servePlayerAccessPage(res, { workspace, closed:true, error:'El ingreso general está cerrado.' });
        return servePlayerAccessPage(res, { workspace, direct:false });
      });
    } catch (error) {
      return servePlayerAccessPage(res, { error:error.message || 'No se pudo verificar la sala.' });
    }
  }

  if (url.pathname === '/jugador/entrar' && req.method === 'POST') {
    let workspace = null;
    try {
      if (!consumeRate(req, 'alpha-entry-form', 120, 10 * 60 * 1000)) return servePlayerAccessPage(res, { error:'Demasiados intentos. Esperá unos minutos.' });
      const form = await readForm(req);
      workspace = findWorkspaceByRoomCode(form.roomCode);
      if (!workspace) return servePlayerAccessPage(res, { error:'La sala ya no está disponible.' });
      return workspaceContext.run(workspace, () => {
        try {
          const deviceId = randomId('device');
          const record = state.roomSettings?.roomOrigin === 'community' ? communityPublicRoomById(state.roomSettings?.communityPublicId || '') : null;
          const privateGranted = !record || record.accessType !== 'private' || reqMayAccessPrivateCommunityRoom(req, record);
          const joined = openJoinPlayer({ name:form.name, cardCount:Number(form.cardCount) || 1, deviceId, communityAccessGranted:privateGranted });
          const roomCode = String(joined.state?.roomCode || state.roomCode || '').trim().toUpperCase();
          setPlayerSessionCookie(req, res, joined.token);
          res.writeHead(303, {
            Location: '/jugar',
            'Cache-Control':'no-store, max-age=0'
          });
          return res.end();
        } catch (error) {
          return servePlayerAccessPage(res, { workspace, error:error.message || 'No se pudo ingresar a la sala.', direct:true });
        }
      });
    } catch (error) {
      return servePlayerAccessPage(res, { workspace, error:error.message || 'No se pudo ingresar a la sala.', direct:Boolean(workspace) });
    }
  }

  if (url.pathname === '/jugador/recuperar' && req.method === 'POST') {
    let workspace = null;
    try {
      if (!consumeRate(req, 'player-recovery-form', 40, 10 * 60 * 1000)) return servePlayerRecoveryPage(res, { error:'Demasiados intentos. Esperá unos minutos.' });
      const form = await readForm(req);
      const token = String(form.recoveryToken || '').trim();
      workspace = findWorkspaceByRecoveryToken(token);
      if (!workspace) return servePlayerRecoveryPage(res, { error:'Este enlace venció o ya fue utilizado.' });
      return workspaceContext.run(workspace, () => {
        try {
          const recovered = recoverPlayerByDirectToken({ recoveryToken:token, deviceId:randomId('device') });
          setPlayerSessionCookie(req, res, recovered.token);
          res.writeHead(303, { Location:'/jugar', 'Cache-Control':'no-store, max-age=0', 'Referrer-Policy':'no-referrer' });
          return res.end();
        } catch (error) {
          return servePlayerRecoveryPage(res, { workspace, token, error:error.message || 'No se pudo recuperar la sesión.' });
        }
      });
    } catch (error) {
      return servePlayerRecoveryPage(res, { workspace, error:error.message || 'No se pudo recuperar la sesión.' });
    }
  }

  if (url.pathname === '/demo/start' && req.method === 'POST') {
    try {
      if (!consumeRate(req, 'demo-create', 40, 10 * 60 * 1000)) {
        res.writeHead(303, { Location: '/demo?error=rate' });
        return res.end();
      }
      const form = await readForm(req);
      const mode = Number(form.mode) === 75 ? 75 : 90;
      const rules = mode === 75
        ? { ambocabeza:false, line:form.prizeLine === '1', doubleLine:form.prizeDouble === '1', tripleLine:form.prizeTriple === '1', corners:form.prizeCorners === '1', bingo:form.prizeBingo === '1' }
        : { ambocabeza:form.prizeAmbo === '1', line:form.prizeLine === '1', doubleLine:false, tripleLine:false, corners:false, bingo:form.prizeBingo === '1' };
      const created = createDemoRoom({
        mode,
        rules,
        linePrizeCount:Number(form.linePrizeCount) || 1,
        aiCount:Number(form.aiCount) || 2,
        aiNames:String(form.aiNames || '').split(',').map(name => name.trim()).filter(Boolean),
        playerCardCount:Number(form.playerCardCount) || (form.markingMode === 'manual_only' ? 2 : 4),
        markingMode:form.markingMode === 'manual_only' ? 'manual_only' : 'normal',
        autoSeconds:Number(form.autoSeconds) || 4,
        sound:true
      });
      setDemoSessionCookie(req, res, created.demoSessionToken);
      res.writeHead(303, { Location: `/demo/jugar/${encodeURIComponent(created.demoEntryId)}`, 'Cache-Control':'no-store' });
      return res.end();
    } catch (error) {
      console.error('No se pudo crear la DEMO directa:', error);
      res.writeHead(303, { Location: '/demo?error=create', 'Cache-Control':'no-store' });
      return res.end();
    }
  }

  const demoPlayerMatch = url.pathname.match(/^\/demo\/jugar\/(demoentry_[a-f0-9]{24})(\/partida)?\/?$/);
  if (demoPlayerMatch) {
    const entryId = demoPlayerMatch[1];
    const wantsGame = Boolean(demoPlayerMatch[2]);
    const workspace = findWorkspaceByDemoEntryId(entryId);
    if (!workspace) {
      res.writeHead(303, { Location: '/demo?error=session', 'Cache-Control':'no-store' });
      return res.end();
    }
    return workspaceContext.run(workspace, async () => {
      currentWorkspace().lastActivityAt = Date.now();
      const player = state.players.find(item => item.demoHuman && !item.virtual);
      if (!player) {
        res.writeHead(303, { Location: '/demo?error=session', 'Cache-Control':'no-store' });
        return res.end();
      }
      if (wantsGame) {
        if (!player.nameSet || !player.selectionConfirmed || !(player.cardIds || []).length) {
          res.writeHead(303, { Location: `/demo/jugar/${entryId}`, 'Cache-Control':'no-store' });
          return res.end();
        }
        return serveDemoPlayerPage(res, playerPayload(player), player.sessionToken);
      }
      if (req.method === 'GET') {
        refreshOffersForPlayer(player);
        return serveDemoPlayerPage(res, playerPayload(player), player.sessionToken);
      }
      return sendJson(res, 405, { error: 'La selección de la DEMO se realiza desde la interfaz unificada.' });
    });
  }


  const eventAssetMatch = url.pathname.match(/^\/event-assets\/(EV-[A-Z0-9]{6})\.jpg$/i);
  if (eventAssetMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const file=eventLogoPath(eventAssetMatch[1]); if(!file||!fs.existsSync(file))return sendJson(res,404,{error:'Logo de evento no disponible.'});
    const stat=fs.statSync(file); res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':stat.size,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}); if(req.method==='HEAD')return res.end(); return fs.createReadStream(file).pipe(res);
  }

  const communityBannerMatch = url.pathname.match(/^\/community-banner\/(1|2|3)\/?$/);
  if (communityBannerMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const slot = Number(communityBannerMatch[1]);
    const banner = communityBannersAdminPayload().find(item => item.slot === slot);
    if (!banner?.hasImage) return sendJson(res, 404, { error: 'Banner no disponible.' });
    const file = communityBannerFilePath(banner);
    const stat = fs.statSync(file);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin'
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }

  if (url.pathname === '/player-ad-banner' && (req.method === 'GET' || req.method === 'HEAD')) {
    const ad = playerAdAdminPayload();
    if (!ad?.hasImage) return sendJson(res, 404, { error: 'Publicidad no disponible.' });
    const file = playerAdFilePath(ad);
    const stat = fs.statSync(file);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin'
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }

  const publicRoomMatch = url.pathname.match(/^\/mesa\/([^/]+)\/?$/);
  if (publicRoomMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const publicId = decodeURIComponent(publicRoomMatch[1] || '');
    const record = communityPublicRoomById(publicId);
    if (!record) { res.writeHead(303, { Location:'/comunidad', 'Cache-Control':'no-store' }); return res.end(); }
    if (['finished','cancelled'].includes(record.status)) return serveCommunityEndedRoomPage(res, record);
    res.writeHead(303, { Location:`/comunidad?mesa=${encodeURIComponent(record.id)}`, 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' });
    return res.end();
  }

  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/comunidad', 'Cache-Control':'no-store, max-age=0' });
    return res.end();
  }
  if (url.pathname === '/admin-principal' || url.pathname === '/admin-principal/' || url.pathname === '/admin-principal.html') { res.writeHead(302, { Location: '/admin' }); return res.end(); }
  if (url.pathname === '/admin' || url.pathname === '/admin/') return serveFile(res, path.join(ROOT, 'admin.html'));
  if (url.pathname === '/evento-admin' || url.pathname === '/evento-admin/') return serveFile(res, path.join(ROOT, 'evento-admin.html'));
  if (url.pathname === '/evento' || url.pathname === '/evento/') return serveFile(res, path.join(ROOT, 'evento.html'));
  if (url.pathname === '/evento-conductor' || url.pathname === '/evento-conductor/') return serveFile(res, path.join(ROOT, 'evento-conductor.html'));
  if (url.pathname === '/evento-transmision' || url.pathname === '/evento-transmision/') return serveFile(res, path.join(ROOT, 'evento-transmision.html'));
  if (url.pathname === '/evento-tv' || url.pathname === '/evento-tv/') return serveFile(res, path.join(ROOT, 'evento-tv.html'));
  if (url.pathname === '/admin-player-preview' || url.pathname === '/admin-player-preview/') return serveFile(res, path.join(ROOT, 'player.html'));
  if (url.pathname === '/demo' || url.pathname === '/demo/') return serveFile(res, path.join(ROOT, 'demo.html'));
  if (url.pathname === '/comunidad' || url.pathname === '/comunidad/' || url.pathname === '/comunidad.html') {
    // Si este navegador ya pertenece a una partida real en curso, Comunidad funciona como puerta de regreso al cartón.
    // Un destino explícito (?mesa=... / ?ver=...) se respeta para no secuestrar invitaciones a otra sala.
    const resume = communityHasExplicitDestination(url) ? null : activePlayerResume(req);
    if (resume) {
      res.writeHead(303, { Location:'/jugar', 'Cache-Control':'no-store, max-age=0', 'Referrer-Policy':'no-referrer' });
      return res.end();
    }
    return serveFile(res, path.join(ROOT, 'comunidad.html'));
  }
  if (/^\/operador\/[^/]+\/?$/.test(url.pathname)) return sendJson(res, 404, { error: 'Los accesos temporales están deshabilitados.' });
  if (/^\/transmision\/[^/]+\/?$/.test(url.pathname) || /^\/v\/[^/]+\/?$/.test(url.pathname)) {
    const token = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
    const workspace = findWorkspaceByBroadcastToken(token);
    const record = workspace?.state?.roomSettings?.roomOrigin === 'community' ? communityPublicRoomById(workspace.state.roomSettings?.communityPublicId || '') : null;
    if (record?.accessType === 'private' && !reqMayAccessPrivateCommunityRoom(req, record)) { res.writeHead(303, { Location:`/comunidad?mesa=${encodeURIComponent(record.id)}&ver=1`, 'Cache-Control':'no-store' }); return res.end(); }
    return serveFile(res, path.join(ROOT, 'transmision.html'));
  }
  if (url.pathname === '/tv' || url.pathname === '/tv/' || url.pathname === '/tv.html' || /^\/tv\/[^/]+\/?$/.test(url.pathname)) return serveFile(res, path.join(ROOT, 'tv.html'));
  if (url.pathname === '/cast-receiver' || url.pathname === '/cast-receiver/') return serveFile(res, path.join(ROOT, 'cast-receiver.html'));
  if (url.pathname === '/jugador' || url.pathname === '/jugador/') {
    if (url.searchParams.get('demo') === '1') {
      const token = cookieValue(req, DEMO_SESSION_COOKIE);
      const workspace = findWorkspaceByPlayerToken(token);
      const player = workspace?.state?.players?.find(item => item.sessionToken === token && item.demoHuman);
      const entryId = workspace?.state?.demo?.entryId;
      if (!workspace?.isDemo || !player || !entryId) {
        clearDemoSessionCookie(req, res);
        res.writeHead(302, { Location: '/demo?error=session' });
        return res.end();
      }
      workspace.lastActivityAt = Date.now();
      res.writeHead(303, { Location: player.selectionConfirmed && player.nameSet ? `/demo/jugar/${entryId}/partida?demo=1` : `/demo/jugar/${entryId}`, 'Cache-Control':'no-store' });
      return res.end();
    }
    const currentSession = String(cookieValue(req, PLAYER_SESSION_COOKIE) || '').trim();
    const recoveryToken = String(url.searchParams.get('recuperar') || '').trim();
    if (recoveryToken) {
      // Un enlace explícito de recuperación siempre debe imponerse a una sesión previa.
      const workspace = findWorkspaceByRecoveryToken(recoveryToken);
      if (!workspace) return servePlayerRecoveryPage(res, { error:'Este enlace venció o ya fue utilizado.' });
      return workspaceContext.run(workspace, () => servePlayerRecoveryPage(res, { workspace, token:recoveryToken }));
    }
    const directRoom = String(url.searchParams.get('sala') || '').trim().toUpperCase();
    if (directRoom) {
      const workspace = findWorkspaceByRoomCode(directRoom);
      if (!workspace) return servePlayerAccessPage(res, { error:'El enlace de acceso no corresponde a una sala disponible.' });
      const sessionWorkspace = currentSession ? findWorkspaceByPlayerToken(currentSession) : null;
      const currentPlayer = sessionWorkspace?.state?.players?.find(item => item.sessionToken === currentSession && !item.demoHuman);
      if (sessionWorkspace === workspace && currentPlayer && workspace.state?.active) {
        res.writeHead(303, { Location:'/jugar', 'Cache-Control':'no-store, max-age=0', 'Referrer-Policy':'no-referrer' });
        return res.end();
      }
      if (currentSession && sessionWorkspace !== workspace) clearPlayerSessionCookie(req, res);
      return workspaceContext.run(workspace, () => {
        const record = state.roomSettings?.roomOrigin === 'community' ? communityPublicRoomById(state.roomSettings?.communityPublicId || '') : null;
        if (record?.accessType === 'private' && !reqMayAccessPrivateCommunityRoom(req, record)) { res.writeHead(303, { Location:`/mesa/${encodeURIComponent(record.id)}`, 'Cache-Control':'no-store' }); return res.end(); }
        if (!state.active || state.status !== 'waiting' || !state.roomSettings?.joinOpen) return servePlayerAccessPage(res, { workspace, direct:true, closed:true, error:'El ingreso general está cerrado.' });
        return servePlayerAccessPage(res, { workspace, direct:true });
      });
    }
    if (currentSession && findWorkspaceByPlayerToken(currentSession)) {
      res.writeHead(303, { Location:'/jugar', 'Cache-Control':'no-store, max-age=0', 'Referrer-Policy':'no-referrer' });
      return res.end();
    }
    if (currentSession) clearPlayerSessionCookie(req, res);
    return servePlayerAccessPage(res);
  }
  if (url.pathname === '/jugador/salir' || url.pathname === '/jugador/salir/') {
    clearPlayerSessionCookie(req, res);
    const destination = url.searchParams.get('comunidad') === '1' ? '/comunidad' : '/jugador';
    res.writeHead(303, { Location:destination, 'Cache-Control':'no-store, max-age=0' });
    return res.end();
  }
  if (url.pathname === '/jugar' || url.pathname === '/jugar/') {
    const token = String(cookieValue(req, PLAYER_SESSION_COOKIE) || '').trim();
    const workspace = findWorkspaceByPlayerToken(token);
    if (!workspace) {
      clearPlayerSessionCookie(req, res);
      res.writeHead(303, { Location:'/jugador', 'Cache-Control':'no-store, max-age=0' });
      return res.end();
    }
    return workspaceContext.run(workspace, () => {
      currentWorkspace().lastActivityAt = Date.now();
      const player = state.players.find(item => item.sessionToken === token && !item.demoHuman);
      if (!player || !state.active) {
        clearPlayerSessionCookie(req, res);
        res.writeHead(303, { Location:'/jugador', 'Cache-Control':'no-store, max-age=0' });
        return res.end();
      }
      return serveFile(res, path.join(ROOT, 'player.html'));
    });
  }
  if (url.pathname === '/reglamento' || url.pathname === '/reglamento/' || url.pathname === '/reglamento.html') return serveFile(res, path.join(ROOT, 'reglamento.html'));
  const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!(relative.startsWith('assets/') || relative.startsWith('js/') || relative.startsWith('css/'))) return sendJson(res, 404, { error: 'Archivo no encontrado.' });
  return serveFile(res, path.join(ROOT, relative));
});

setInterval(() => {
  for (const workspace of workspaces.values()) {
    workspaceContext.run(workspace, () => {
      try { processAssignmentDeadline(); }
      catch (error) { console.error(`No se pudo completar la asignación automática en ${workspace.id}:`, error.message); }
      try { maybeCloseFinishedCommunityRoom(); }
      catch (error) { console.error(`No se pudo cerrar la sala comunitaria finalizada en ${workspace.id}:`, error.message); }
      if (workspace.id === 'owner') {
        try { processCommunityScheduleAutomation(); }
        catch (error) { console.error(`No se pudo procesar la agenda automática:`, error.message); }
        try { processCommunityPublicRoomAutomation(); }
        catch (error) { console.error(`No se pudieron procesar las salas públicas programadas:`, error.message); }
      }
      if (workspace.isDemo && state.demo && state.status === 'waiting') {
        const flow = ensureDemoStartFlow();
        if (flow?.phase === 'countdown' && flow.countdownEndsAt) {
          const remaining = new Date(flow.countdownEndsAt).getTime() - Date.now();
          if (remaining <= 0) completeDemoStartCountdown(workspace);
          else if (!demoStartTimers.has(workspace.id)) scheduleDemoStartCountdown(workspace);
        }
      }
    });
  }
}, 1000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions) if (!session || session.expiresAt <= now) adminSessions.delete(token);
  for (const [token, expiresAt] of masterSessions) if (expiresAt <= now) masterSessions.delete(token);
  for (const workspace of [...workspaces.values()]) {
    if (workspace.isDemo && ((workspace.expiresAt && workspace.expiresAt <= now) || (workspace.lastActivityAt && now - workspace.lastActivityAt > DEMO_IDLE_TTL_MS))) {
      clearAutomaticDrawTimer(workspace); clearWorkspaceTransitionTimer(workspace); clearClaimAutoResume(workspace); clearDemoAutomationTimers(workspace); clearDemoStartTimer(workspace); workspaces.delete(workspace.id);
      try { fs.rmSync(path.dirname(workspace.stateFile), { recursive: true, force: true }); } catch {}
      continue;
    }
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

for (const workspace of workspaces.values()) workspaceContext.run(workspace, () => {
  scheduleTransition();
  if (workspace.isDemo && state.active && state.status === 'waiting' && ensureDemoStartFlow()?.phase === 'countdown') scheduleDemoStartCountdown(workspace);
  if (state.active && state.game && state.status === 'playing' && state.game.drawMode === 'automatic') scheduleAutomaticDraw();
  if (state.active && state.game && state.status === 'paused' && state.pauseReason === 'claim' && state.game.drawMode === 'automatic' && !confirmedClaims('bingo').length) scheduleClaimAutoResume();
  if (state.active && state.game && !['closed','finished','waiting'].includes(state.status) && adminConnectionCount(workspace) === 0) markAdminDisconnected(workspace);
});

server.listen(PORT, HOST, () => {
  console.log('\nEL BINGO DE LA GORDA');
  const base = PUBLIC_URL || `http://localhost:${PORT}`;
  console.log(`Administrador: ${base}/admin`);
  console.log(`Jugadores: ${base}/jugador`);
  if (ONLINE_MODE && !MASTER_ADMIN_PASSWORD) console.warn('ATENCIÓN: falta configurar MASTER_ADMIN_PASSWORD o ADMIN_PASSWORD.');
  if (!ONLINE_MODE) {
    const target = `http://localhost:${PORT}/admin`;
    const command = process.platform === 'win32' ? `start "" "${target}"` : process.platform === 'darwin' ? `open "${target}"` : `xdg-open "${target}"`;
    exec(command, () => {});
  }
  console.log(`Límites por sala: ${MAX_PLAYERS} jugadores · ${MAX_CARDS} cartones · ${MAX_CARDS_PER_PLAYER} por jugador\n`);
});
