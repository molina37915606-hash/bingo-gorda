'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { URL } = require('url');
const { exec } = require('child_process');

const ROOT = __dirname;
const DATA_DIR = process.env.BINGO_DATA_DIR ? path.resolve(process.env.BINGO_DATA_DIR) : path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'sala-online.json');
const PORT = Number(process.env.PORT || 3210);
const HOST = '0.0.0.0';
const ONLINE_MODE = process.env.RENDER === 'true' || process.env.ONLINE_MODE === 'true';
const PUBLIC_URL = String(process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const MIN_CARDS = 2;
const MAX_CARDS = 100;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 60;
const MAX_CARDS_PER_PLAYER = 4;
const MAX_CARD_OPTIONS = 10;
const MIN_ASSIGNMENT_MINUTES = 1;
const MAX_ASSIGNMENT_MINUTES = 30;
const CARD_RESERVATION_TTL_MS = 2 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });

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
  const bingoMissing = numbers.filter(n => !drawn.has(n)).length;
  const officialMarked = numbers.filter(n => drawn.has(n));
  const playerMarked = numbers.filter(n => marks.has(n));
  const missed = officialMarked.filter(n => !marks.has(n));
  const wrong = playerMarked.filter(n => !drawn.has(n));
  return {
    lineMissing,
    bingoMissing,
    hasLine: completeLines.length > 0,
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
    version: 7,
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
      playerAudioDefault: false,
      linePrizeCount: 1,
      bingoPrizeCount: 1,
      allowSamePlayerSecondLine: false
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
    game: null,
    players: [],
    cardReservations: {},
    claims: [],
    eventLog: []
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const defaults = blankState();
    const merged = {
      ...defaults,
      ...parsed,
      roomSettings: { ...defaults.roomSettings, ...(parsed.roomSettings || {}) },
      assignmentTimer: { ...defaults.assignmentTimer, ...(parsed.assignmentTimer || {}) },
      players: parsed.players || [],
      cardReservations: parsed.cardReservations || {},
      claims: parsed.claims || [],
      eventLog: parsed.eventLog || []
    };
    if (merged.active && !parsed.status) merged.status = merged.game?.drawn?.length ? 'playing' : 'waiting';
    if (!['closed', 'waiting', 'playing', 'finished'].includes(merged.status)) merged.status = 'closed';
    merged.roomSettings.linePrizeCount = Math.max(1, Math.min(2, Number(merged.roomSettings.linePrizeCount) || 1));
    merged.roomSettings.bingoPrizeCount = 1;
    merged.roomSettings.allowSamePlayerSecondLine = Boolean(merged.roomSettings.allowSamePlayerSecondLine);
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
      return {
        ...player,
        cardIds,
        allowedCardCount,
        selectionConfirmed: player.selectionConfirmed === undefined ? cardIds.length === allowedCardCount : Boolean(player.selectionConfirmed),
        offeredCardIds: Array.isArray(player.offeredCardIds) ? player.offeredCardIds.map(String) : [],
        reservedCardIds: Array.isArray(player.reservedCardIds) ? player.reservedCardIds.map(String) : [],
        marks: player.marks || {},
        autoMark: Boolean(player.autoMark),
        notices: player.notices || []
      };
    });
    return merged;
  } catch {
    return blankState();
  }
}

let state = loadState();
const sseClients = new Set();
const adminSessions = new Map();
const rateBuckets = new Map();

function saveState() {
  state.updatedAt = nowIso();
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temp, STATE_FILE);
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

function createAdminSession() {
  const token = randomId('admin');
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
}

function adminTokenFrom(req, url) {
  return String(req.headers['x-admin-token'] || url.searchParams.get('adminToken') || '');
}

function isAdminAuthorized(req, url) {
  const token = adminTokenFrom(req, url);
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return true;
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

function refreshOffersForPlayer(player) {
  if (!state.game || !player || state.status !== 'waiting' || player.selectionConfirmed) {
    if (player) player.offeredCardIds = [];
    return;
  }
  const available = availableCardIdsFor(player);
  const allowedSet = new Set(available);
  const reserved = (player.reservedCardIds || []).filter(cardId => allowedSet.has(cardId));
  const kept = (player.offeredCardIds || []).filter(cardId => allowedSet.has(cardId) && !reserved.includes(cardId));
  const pool = shuffle(available.filter(cardId => !reserved.includes(cardId) && !kept.includes(cardId)));
  const target = Math.min(MAX_CARD_OPTIONS, available.length);
  player.offeredCardIds = [...reserved, ...kept, ...pool].slice(0, target);
}

function refreshAllOffers() {
  for (const player of state.players) refreshOffersForPlayer(player);
}

function updateCardDisplayNames() {
  if (!state.game) return;
  const ownerByCard = new Map(state.players.flatMap(player => player.cardIds.map(cardId => [cardId, player.name])));
  for (const card of state.game.cards) {
    card.originalName ||= card.name || `Cartón ${card.number}`;
    card.name = ownerByCard.get(card.id) || card.originalName;
  }
}

function allPlayersReady() {
  return state.players.length > 0 && state.players.every(player =>
    player.selectionConfirmed &&
    player.cardIds.length === player.allowedCardCount
  );
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
  const lineTotal = Math.max(1, Math.min(2, Number(state.roomSettings?.linePrizeCount) || 1));
  const bingoTotal = 1;
  const lineAwarded = confirmedClaims('line').length;
  const bingoAwarded = confirmedClaims('bingo').length;
  return {
    line: {
      total: lineTotal,
      awarded: lineAwarded,
      remaining: Math.max(0, lineTotal - lineAwarded),
      closed: lineAwarded >= lineTotal,
      nextNumber: Math.min(lineTotal, lineAwarded + 1),
      nextLabel: lineAwarded === 0 ? 'Primera línea' : 'Segunda línea',
      winners: confirmedClaims('line').map(claim => ({ playerId: claim.playerId, playerName: claim.playerName, cardId: claim.cardId, cardNumber: claim.cardNumber, prizeNumber: claim.prizeNumber || 1 }))
    },
    bingo: {
      total: bingoTotal,
      awarded: bingoAwarded,
      remaining: Math.max(0, bingoTotal - bingoAwarded),
      closed: bingoAwarded >= bingoTotal,
      nextNumber: 1,
      nextLabel: 'Bingo',
      winners: confirmedClaims('bingo').map(claim => ({ playerId: claim.playerId, playerName: claim.playerName, cardId: claim.cardId, cardNumber: claim.cardNumber, prizeNumber: 1 }))
    },
    allowSamePlayerSecondLine: Boolean(state.roomSettings?.allowSamePlayerSecondLine)
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
  const pendingPlayers = state.players.filter(player => !(player.selectionConfirmed && player.cardIds.length === player.allowedCardCount));
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
    assigned.push({ playerId: player.id, playerName: player.name, cardIds: chosen });
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
      prizeLabel: claim.prizeLabel || (claim.type === 'line' ? 'Primera línea' : 'Bingo')
    };
    if (claim.status === 'confirmed') {
      const card = state.game?.cards?.find(item => item.id === claim.cardId);
      if (card) {
        const completeLine = claim.comparison?.completeLines?.[0] || null;
        payload.winningCard = {
          id: card.id,
          number: card.number,
          name: card.name,
          mode: card.mode,
          grid: card.grid,
          bets: card.bets
        };
        payload.drawnAtClaim = claim.drawnAtClaim || [];
        payload.officialMarked = claim.comparison?.officialMarked || cardNumbers(card).filter(number => payload.drawnAtClaim.includes(number));
        payload.winningNumbers = claim.type === 'line'
          ? (completeLine?.values || [])
          : cardNumbers(card);
        payload.winningLineLabel = claim.type === 'line' ? (completeLine?.label || 'Línea completa') : null;
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
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    maxCardsPerPlayer: MAX_CARDS_PER_PLAYER,
    maxCardOptions: MAX_CARD_OPTIONS,
    publicUrl: PUBLIC_URL || null,
    playerUrl: PUBLIC_URL ? `${PUBLIC_URL}/jugador` : null
  };
}

function adminPayload() {
  if (!state.active || !state.game) {
    return {
      ...baseInfo(),
      active: false,
      status: 'closed',
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
        playerName: player.name,
        playerCode: player.code,
        connected: connected.has(player.id),
        autoMark: Boolean(player.autoMark),
        cardId,
        cardNumber: card.number,
        cardName: card.name,
        ...analysis,
        lineClaim: claimStateForCard(cardId, 'line'),
        bingoClaim: claimStateForCard(cardId, 'bingo')
      });
    }
  }
  return {
    ...baseInfo(),
    active: true,
    status: state.status,
    readyToStart: allPlayersReady(),
    roomCode: state.roomCode,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    endedAt: state.endedAt || null,
    updatedAt: state.updatedAt,
    round: state.round,
    roomSettings: state.roomSettings,
    assignmentTimer: assignmentTimerPayload(),
    prizeStatus: prizeStatusPayload(),
    adminMessage: state.adminMessage,
    lanUrls: getLanAddresses().map(ip => `http://${ip}:${PORT}/jugador`),
    localUrl: `http://localhost:${PORT}`,
    game: state.game,
    players: state.players.map(player => ({
      id: player.id,
      name: player.name,
      code: player.code,
      allowedCardCount: player.allowedCardCount,
      cardIds: player.cardIds,
      selectionConfirmed: player.selectionConfirmed,
      offeredCardIds: player.offeredCardIds,
      reservedCardIds: player.reservedCardIds || [],
      autoMark: Boolean(player.autoMark),
      connected: connected.has(player.id)
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
    roomCode: state.roomCode,
    round: state.round,
    startedAt: state.startedAt,
    endedAt: state.endedAt || null,
    roomSettings: state.roomSettings,
    assignmentTimer: assignmentTimerPayload(),
    prizeStatus: prizeStatusPayload(),
    adminMessage: state.adminMessage,
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
      name: player.name,
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
    format: 'el-bingo-de-la-gorda-v10-6-backup',
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
  return {
    id: String(game.id),
    number: Number(game.number) || 1,
    mode: Number(game.mode) === 75 ? 75 : 90,
    rules: game.rules || { ambocabeza: true, line: true, bingo: true },
    drawMode: game.drawMode || 'manual',
    autoSeconds: Number(game.autoSeconds) || 6,
    presenter: game.presenter || 'vero',
    theme: game.theme || 'clasico',
    phase: game.phase || 'READY',
    drawn: uniqueNumbers(game.drawn).filter(n => n >= 1 && n <= Number(game.mode || 90)),
    prizes: game.prizes ? deepCopy(game.prizes) : undefined,
    createdAt: game.createdAt || nowIso(),
    updatedAt: game.updatedAt || nowIso(),
    cards: game.cards.map(card => ({
      id: String(card.id),
      number: String(card.number),
      name: String(card.name || 'Jugador'),
      originalName: String(card.originalName || card.name || `Cartón ${card.number}`),
      mode: Number(card.mode) === 75 ? 75 : 90,
      source: card.source || 'generated',
      grid: deepCopy(card.grid),
      bets: card.bets || { ambocabeza: true, line: true, bingo: true }
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
    const name = String(raw.name || `Jugador ${index + 1}`).trim();
    const cardIds = [...new Set((raw.cardIds || []).map(String).filter(id => validCardIds.has(id)))];
    const allowedCardCount = Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(raw.allowedCardCount) || cardIds.length || 1));
    if (!name) throw new Error(`Falta el nombre del jugador ${index + 1}.`);
    if (cardIds.length > allowedCardCount) throw new Error(`${name} tiene más cartones elegidos que los autorizados.`);
    for (const cardId of cardIds) {
      if (used.has(cardId)) throw new Error('Un cartón fue elegido por más de un jugador.');
      used.add(cardId);
    }
    authorizedCards += allowedCardCount;
  }
  if (authorizedCards > game.cards.length) throw new Error(`Autorizaste ${authorizedCards} cartones, pero la partida tiene ${game.cards.length}.`);
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
    const name = String(raw.name || `Jugador ${index + 1}`).trim();
    const allowedCardCount = Math.max(1, Math.min(MAX_CARDS_PER_PLAYER, Number(raw.allowedCardCount) || (raw.cardIds || []).length || 1));
    const cardIds = [...new Set((raw.cardIds || []).map(String).filter(id => validCardIds.has(id)))].slice(0, allowedCardCount);
    return {
      id: randomId('player'),
      name,
      code: nextPlayerCode(),
      allowedCardCount,
      cardIds,
      selectionConfirmed: cardIds.length === allowedCardCount,
      offeredCardIds: [],
      reservedCardIds: [],
      sessionToken: null,
      marks: Object.fromEntries(cardIds.map(cardId => [cardId, []])),
      autoMark: false,
      notices: []
    };
  });
  const sanitizedGame = sanitizeGame(payload.game);
  sanitizedGame.drawn = [];
  sanitizedGame.phase = 'READY';
  const requestedTimerMinutes = Math.max(MIN_ASSIGNMENT_MINUTES, Math.min(MAX_ASSIGNMENT_MINUTES, Number(payload.assignmentTimer?.durationMinutes) || 10));
  state = {
    version: 7,
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
      playerAudioDefault: Boolean(payload.roomSettings?.playerAudioDefault),
      linePrizeCount: Math.max(1, Math.min(2, Number(payload.roomSettings?.linePrizeCount) || 1)),
      bingoPrizeCount: 1,
      allowSamePlayerSecondLine: Boolean(payload.roomSettings?.allowSamePlayerSecondLine)
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
    game: sanitizedGame,
    players,
    cardReservations: {},
    claims: [],
    eventLog: []
  };
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
  saveState();
  broadcast();
  return adminPayload();
}

function startRoom() {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status !== 'waiting') return adminPayload();
  if (!allPlayersReady()) throw new Error('Todos los jugadores deben elegir y confirmar sus cartones antes de iniciar.');
  if (state.game.drawn.length) throw new Error('La ronda ya contiene bolillas. Reiniciala antes de empezar.');
  state.cardReservations = {};
  for (const player of state.players) player.reservedCardIds = [];
  state.assignmentTimer = {
    ...(state.assignmentTimer || blankState().assignmentTimer),
    status: 'completed',
    endsAt: null,
    remainingMs: 0,
    completedAt: state.assignmentTimer?.completedAt || nowIso()
  };
  state.status = 'playing';
  state.startedAt = nowIso();
  state.endedAt = null;
  state.game.phase = state.game.drawMode === 'automatic' ? 'DRAWING' : 'READY';
  logEvent('game_started', { round: state.round, players: state.players.length, selectedCards: state.players.reduce((sum, player) => sum + player.cardIds.length, 0) });
  saveState();
  broadcast();
  return adminPayload();
}

function updateRoomSettings(payload) {
  if (!state.active) throw new Error('No hay una sala abierta.');
  state.roomSettings.playerAudioAllowed = payload.playerAudioAllowed !== false;
  state.roomSettings.playerAudioDefault = Boolean(payload.playerAudioDefault);
  if (state.status === 'waiting') {
    state.roomSettings.linePrizeCount = Math.max(1, Math.min(2, Number(payload.linePrizeCount ?? state.roomSettings.linePrizeCount) || 1));
    state.roomSettings.allowSamePlayerSecondLine = Boolean(payload.allowSamePlayerSecondLine ?? state.roomSettings.allowSamePlayerSecondLine);
  }
  state.roomSettings.bingoPrizeCount = 1;
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

function finishRoom() {
  if (!state.active || !state.game) throw new Error('No hay una sala abierta.');
  if (state.status === 'finished') return adminPayload();
  if (state.status !== 'playing') throw new Error('El sorteo todavía no comenzó.');
  if (state.claims.some(claim => claim.status === 'pending')) throw new Error('Primero resolvé el reclamo pendiente.');
  state.status = 'finished';
  state.endedAt = nowIso();
  state.game.phase = 'ROUND_END';
  logEvent('game_finished', { round: state.round, balls: state.game.drawn.length });
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
  if (!state.active || !selectionIsOpen()) throw new Error('Las elecciones ya están cerradas.');
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
  logEvent('player_selection_released', { playerId: player.id, playerName: player.name });
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
      marks,
      autoMark: Boolean(rawPlayer.autoMark),
      notices: Array.isArray(rawPlayer.notices) ? rawPlayer.notices.slice(-20) : []
    };
  });
  state = {
    version: 7,
    active: true,
    status: ['waiting', 'playing', 'finished'].includes(raw.status) ? raw.status : (raw.game.drawn?.length ? 'playing' : 'waiting'),
    roomCode: String(raw.roomCode || randomCode(5)).slice(0, 12),
    createdAt: raw.createdAt || nowIso(),
    startedAt: raw.startedAt || null,
    endedAt: raw.endedAt || null,
    updatedAt: nowIso(),
    round: Math.max(1, Number(raw.round) || 1),
    roomSettings: { ...blankState().roomSettings, ...(raw.roomSettings || {}) },
    assignmentTimer: { ...blankState().assignmentTimer, ...(raw.assignmentTimer || {}) },
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
  };
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('backup_restored', { players: players.length, cards: state.game.cards.length, status: state.status });
  saveState();
  broadcast();
  return adminPayload();
}

function loginPlayer(payload) {
  if (!state.active) throw new Error('La sala todavía no está abierta.');
  const roomCode = String(payload?.roomCode || '').trim().toUpperCase();
  if (roomCode && roomCode !== state.roomCode) throw new Error('El código de sala no coincide.');
  const normalized = String(payload?.code || '').trim().toUpperCase();
  const player = state.players.find(item => item.code === normalized);
  if (!player) throw new Error('Código incorrecto. Revisalo con el administrador.');
  player.sessionToken = randomId('session');
  player.lastLoginAt = nowIso();
  if (state.status === 'waiting') refreshOffersForPlayer(player);
  logEvent('player_login', { playerId: player.id, playerName: player.name });
  saveState();
  broadcast();
  return { token: player.sessionToken, state: playerPayload(player) };
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
    logEvent('card_reservation_released', { playerId: player.id, playerName: player.name, cardId });
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
  logEvent('card_reserved', { playerId: player.id, playerName: player.name, cardId });
  saveState();
  broadcast();
  return playerPayload(player);
}

function chooseCards(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  if (!selectionIsOpen()) throw new Error('La elección de cartones ya está cerrada.');
  purgeExpiredReservations();
  const selected = [...new Set((payload.cardIds || []).map(String))];
  if (selected.length !== player.allowedCardCount) throw new Error(`Debés elegir exactamente ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}.`);
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
  player.cardIds = selected;
  player.selectionConfirmed = true;
  player.offeredCardIds = [];
  player.reservedCardIds = [];
  for (const cardId of selected) delete state.cardReservations[cardId];
  player.marks = Object.fromEntries(selected.map(cardId => [cardId, []]));
  syncAutoMarksForPlayer(player);
  updateCardDisplayNames();
  refreshAllOffers();
  logEvent('cards_selected', { playerId: player.id, playerName: player.name, cardIds: selected });
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
  logEvent('cards_selection_changed', { playerId: player.id, playerName: player.name });
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
  logEvent('player_automark_changed', { playerId: player.id, playerName: player.name, enabled: player.autoMark });
  saveState();
  broadcast();
  return playerPayload(player);
}

function createClaim(player, payload) {
  if (!state.active || !state.game) throw new Error('La sala no está activa.');
  if (state.status !== 'playing') throw new Error('La partida todavía no comenzó o ya finalizó.');
  const type = payload.type === 'bingo' ? 'bingo' : 'line';
  const cardId = String(payload.cardId || '');
  const card = state.game.cards.find(item => item.id === cardId);
  if (!card || !player.cardIds.includes(cardId)) throw new Error('Ese cartón no pertenece al jugador.');
  if (type === 'line' && card.bets?.line === false) throw new Error('Este cartón no participa por línea.');
  if (type === 'bingo' && card.bets?.bingo === false) throw new Error('Este cartón no participa por bingo.');

  const prizes = prizeStatusPayload();
  const prize = prizes[type];
  if (prize.closed) throw new Error(type === 'line' ? 'Los premios de línea ya fueron entregados.' : 'El premio de bingo ya fue entregado.');
  if (state.claims.some(claim => claim.status === 'pending')) {
    throw new Error('Ya hay un reclamo siendo revisado. Esperá la decisión del administrador.');
  }
  if (state.claims.some(claim => claim.type === type && claim.cardId === cardId && claim.status === 'confirmed')) {
    throw new Error(`Ese cartón ya ganó ${type === 'line' ? 'línea' : 'bingo'}.`);
  }
  if (type === 'line' && !state.roomSettings.allowSamePlayerSecondLine && confirmedClaims('line').some(claim => claim.playerId === player.id)) {
    throw new Error('Este jugador ya ganó una línea y la sala no permite que gane la segunda.');
  }

  const analysis = analyzeCard(card, state.game.drawn, player.marks?.[cardId] || []);
  const valid = type === 'line' ? analysis.hasLine : analysis.hasBingo;
  const prizeNumber = prize.awarded + 1;
  const prizeLabel = type === 'line' ? (prizeNumber === 1 ? 'Primera línea' : 'Segunda línea') : 'Bingo';
  const claim = {
    id: randomId('claim'),
    type,
    prizeNumber,
    prizeLabel,
    playerId: player.id,
    playerName: player.name,
    cardId,
    cardNumber: card.number,
    createdAt: nowIso(),
    status: 'pending',
    officialValid: valid,
    drawnAtClaim: [...state.game.drawn],
    playerMarksAtClaim: [...(player.marks?.[cardId] || [])],
    comparison: analysis
  };
  state.claims.push(claim);
  state.game.phase = 'PAUSED';
  logEvent('claim_created', { claimId: claim.id, type, prizeNumber, playerId: player.id, cardId, officialValid: valid });
  saveState();
  broadcast();
  return claim;
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
    if (current.closed) throw new Error(claim.type === 'line' ? 'Los premios de línea ya fueron entregados.' : 'El premio de bingo ya fue entregado.');
    if (claim.type === 'line' && !state.roomSettings.allowSamePlayerSecondLine && confirmedClaims('line').some(item => item.playerId === claim.playerId)) {
      throw new Error('Este jugador ya ganó una línea y no está habilitado para ganar la segunda.');
    }
    if (confirmedClaims(claim.type).some(item => item.cardId === claim.cardId)) {
      throw new Error('Ese cartón ya recibió este premio.');
    }
    claim.prizeNumber = current.awarded + 1;
    claim.prizeLabel = claim.type === 'line' ? (claim.prizeNumber === 1 ? 'Primera línea' : 'Segunda línea') : 'Bingo';
  }

  claim.status = resolution;
  claim.resolvedAt = nowIso();
  claim.adminNote = String(payload.note || '').slice(0, 240);
  const player = state.players.find(item => item.id === claim.playerId);
  if (player) {
    player.notices ||= [];
    player.notices.push({
      id: randomId('notice'),
      at: nowIso(),
      type: 'claim_result',
      claimId: claim.id,
      claimType: claim.type,
      prizeNumber: claim.prizeNumber || 1,
      cardNumber: claim.cardNumber,
      result: resolution,
      officialValid: claim.officialValid,
      text: resolution === 'confirmed'
        ? `${claim.prizeLabel || (claim.type === 'line' ? 'Línea' : 'Bingo')} confirmada en el cartón ${claim.cardNumber}.`
        : `${claim.type === 'line' ? 'Línea' : 'Bingo'} rechazado en el cartón ${claim.cardNumber}.`
    });
  }
  logEvent('claim_resolved', { claimId: claim.id, resolution, prizeNumber: claim.prizeNumber || 1, officialValid: claim.officialValid });
  saveState();
  broadcast();
  return claim;
}


function officialBallRows() {
  const events = (state.eventLog || []).filter(event => event.type === 'ball_drawn');
  return (state.game?.drawn || []).map((number, index) => {
    const matching = events.filter(event => Number(event.number) === Number(number));
    const event = matching.at(-1);
    return {
      order: index + 1,
      number: Number(number),
      at: event?.at || null
    };
  });
}

function actaPayload() {
  if (!state.active || !state.game) throw new Error('No hay una sala disponible.');
  const claims = confirmedClaims('line').concat(confirmedClaims('bingo')).sort((a, b) => new Date(a.resolvedAt || a.createdAt) - new Date(b.resolvedAt || b.createdAt));
  return {
    version: '10.6',
    roomCode: state.roomCode,
    round: state.round,
    gameNumber: state.game.number,
    mode: state.game.mode,
    status: state.status,
    presenter: state.game.presenter,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    totalPlayers: state.players.length,
    activeCards: state.players.reduce((sum, player) => sum + (player.selectionConfirmed ? player.cardIds.length : 0), 0),
    balls: officialBallRows(),
    winners: claims.map(claim => ({
      type: claim.type,
      prizeNumber: claim.prizeNumber || 1,
      prizeLabel: claim.prizeLabel || (claim.type === 'line' ? 'Línea' : 'Bingo'),
      playerName: claim.playerName,
      cardNumber: claim.cardNumber,
      confirmedAt: claim.resolvedAt || null
    }))
  };
}

function formatLocalTimestamp(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function actaCsv() {
  const acta = actaPayload();
  const lines = [
    ['EL BINGO DE LA GORDA - ACTA FINAL'],
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
    ['GANADORES'],
    ['PREMIO', 'JUGADOR', 'CARTÓN', 'CONFIRMADO'],
    ...acta.winners.map(winner => [winner.prizeLabel, winner.playerName, winner.cardNumber, formatLocalTimestamp(winner.confirmedAt)])
  ];
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + lines.map(row => row.map(quote).join(';')).join('\r\n');
}

function asciiText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

function pdfEscape(value) {
  return asciiText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSimplePdf(lines) {
  const pageLines = [];
  for (let index = 0; index < lines.length; index += 48) pageLines.push(lines.slice(index, index + 48));
  if (!pageLines.length) pageLines.push(['Sin datos.']);

  const objects = [];
  const addObject = body => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];

  for (const page of pageLines) {
    const commands = ['BT', '/F1 10 Tf', '40 805 Td'];
    page.forEach((line, index) => {
      if (index > 0) commands.push('0 -15 Td');
      commands.push(`(${pdfEscape(line)}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index++) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function actaPdf() {
  const acta = actaPayload();
  const lines = [
    'EL BINGO DE LA GORDA - ACTA FINAL',
    `Sala: ${acta.roomCode}   Juego: ${acta.gameNumber}   Ronda: ${acta.round}`,
    `Modalidad: Bingo ${acta.mode}`,
    `Inicio: ${formatLocalTimestamp(acta.startedAt)}`,
    `Finalizacion: ${formatLocalTimestamp(acta.endedAt)}`,
    `Jugadores: ${acta.totalPlayers}   Cartones activos: ${acta.activeCards}`,
    '',
    'ORDEN  BOLILLA  FECHA Y HORA',
    ...acta.balls.map(row => `${String(row.order).padStart(5)}  ${String(row.number).padStart(7)}  ${formatLocalTimestamp(row.at)}`),
    '',
    'GANADORES',
    ...(acta.winners.length
      ? acta.winners.map(winner => `${winner.prizeLabel}: ${winner.playerName} - Carton ${winner.cardNumber} - ${formatLocalTimestamp(winner.confirmedAt)}`)
      : ['Sin premios confirmados.'])
  ];
  return buildSimplePdf(lines);
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
  '.txt': 'text/plain; charset=utf-8'
};

function serveFile(res, filePath) {
  const normalized = path.normalize(filePath);
  const assetRoot = `${path.join(ROOT, 'assets')}${path.sep}`;
  const jsRoot = `${path.join(ROOT, 'js')}${path.sep}`;
  const allowedHtml = new Set([
    path.join(ROOT, 'ABRIR_EL_BINGO_DE_LA_GORDA.html'),
    path.join(ROOT, 'jugador.html')
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

async function handleApi(req, res, url) {
  try {
    if (url.pathname === '/api/info' && req.method === 'GET') {
      return sendJson(res, 200, { ...baseInfo(), port: PORT, lanUrls: getLanAddresses().map(ip => `http://${ip}:${PORT}/jugador`), active: state.active, status: state.status, roomCode: state.roomCode });
    }

    if (url.pathname === '/api/ping' && req.method === 'GET') return sendJson(res, 200, { ok: true, at: nowIso() });

    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      if (!consumeRate(req, 'admin-login', 15, 15 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      const payload = await readJson(req);
      const localWithoutPassword = !ONLINE_MODE && isLoopback(req) && !ADMIN_PASSWORD;
      if (!localWithoutPassword) {
        if (!ADMIN_PASSWORD) return sendJson(res, 503, { error: 'El servidor no tiene configurada la variable ADMIN_PASSWORD.' });
        if (!safeEqual(payload.password || '', ADMIN_PASSWORD)) return sendJson(res, 401, { error: 'Contraseña de administrador incorrecta.' });
      }
      const token = createAdminSession();
      return sendJson(res, 200, { token, expiresInHours: 24, onlineMode: ONLINE_MODE });
    }

    if (url.pathname.startsWith('/api/admin/')) {
      if (!isAdminAuthorized(req, url)) return sendJson(res, 401, { error: 'Ingresá como administrador.' });
      if (url.pathname === '/api/admin/state' && req.method === 'GET') return sendJson(res, 200, adminPayload());
      if (url.pathname === '/api/admin/configure' && req.method === 'POST') return sendJson(res, 200, configureRoom(await readJson(req)));
      if (url.pathname === '/api/admin/game' && req.method === 'POST') return sendJson(res, 200, updateGame((await readJson(req)).game));
      if (url.pathname === '/api/admin/start' && req.method === 'POST') return sendJson(res, 200, startRoom());
      if (url.pathname === '/api/admin/finish' && req.method === 'POST') return sendJson(res, 200, finishRoom());
      if (url.pathname === '/api/admin/assignment-timer' && req.method === 'POST') return sendJson(res, 200, controlAssignmentTimer(await readJson(req)));
      if (url.pathname === '/api/admin/settings' && req.method === 'POST') return sendJson(res, 200, updateRoomSettings(await readJson(req)));
      if (url.pathname === '/api/admin/message' && req.method === 'POST') return sendJson(res, 200, updateAdminMessage(await readJson(req)));
      if (url.pathname === '/api/admin/release-selection' && req.method === 'POST') return sendJson(res, 200, releasePlayerSelection(await readJson(req)));
      if (url.pathname === '/api/admin/resolve' && req.method === 'POST') return sendJson(res, 200, resolveClaim(await readJson(req)));
      if (url.pathname === '/api/admin/acta' && req.method === 'GET') return sendJson(res, 200, actaPayload());
      if (url.pathname === '/api/admin/acta.csv' && req.method === 'GET') return sendBuffer(res, 200, Buffer.from(actaCsv(), 'utf8'), 'text/csv; charset=utf-8', `Bingo_Acta_${state.roomCode || 'sala'}.csv`);
      if (url.pathname === '/api/admin/acta.pdf' && req.method === 'GET') return sendBuffer(res, 200, actaPdf(), 'application/pdf', `Bingo_Acta_${state.roomCode || 'sala'}.pdf`);
      if (url.pathname === '/api/admin/backup' && req.method === 'GET') return sendJson(res, 200, backupPayload());
      if (url.pathname === '/api/admin/restore' && req.method === 'POST') return sendJson(res, 200, restoreBackup(await readJson(req)));
      if (url.pathname === '/api/admin/close' && req.method === 'POST') { closeRoom(); return sendJson(res, 200, { ok: true }); }
      if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
        adminSessions.delete(adminTokenFrom(req, url));
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 404, { error: 'Acción de administrador no encontrada.' });
    }

    if (url.pathname === '/api/player/login' && req.method === 'POST') {
      if (!consumeRate(req, 'player-login', 60, 10 * 60 * 1000)) return sendJson(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
      return sendJson(res, 200, loginPlayer(await readJson(req)));
    }

    if (url.pathname.startsWith('/api/player/')) {
      const token = req.headers['x-player-token'] || url.searchParams.get('token');
      const player = playerByToken(token);
      if (!player) return sendJson(res, 401, { error: 'La sesión no es válida. Volvé a ingresar con tu código.' });
      if (url.pathname === '/api/player/state' && req.method === 'GET') return sendJson(res, 200, playerPayload(player));
      if (url.pathname === '/api/player/reserve' && req.method === 'POST') return sendJson(res, 200, reserveCard(player, await readJson(req)));
      if (url.pathname === '/api/player/choose' && req.method === 'POST') return sendJson(res, 200, chooseCards(player, await readJson(req)));
      if (url.pathname === '/api/player/release' && req.method === 'POST') return sendJson(res, 200, releaseOwnSelection(player));
      if (url.pathname === '/api/player/mark' && req.method === 'POST') return sendJson(res, 200, markNumber(player, await readJson(req)));
      if (url.pathname === '/api/player/automark' && req.method === 'POST') return sendJson(res, 200, setAutoMark(player, await readJson(req)));
      if (url.pathname === '/api/player/claim' && req.method === 'POST') return sendJson(res, 200, createClaim(player, await readJson(req)));
      return sendJson(res, 404, { error: 'Acción de jugador no encontrada.' });
    }

    return sendJson(res, 404, { error: 'API no encontrada.' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'No se pudo completar la acción.' });
  }
}

function handleEvents(req, res, url) {
  const role = url.searchParams.get('role');
  let player = null;
  let token = url.searchParams.get('token') || '';
  if (role === 'admin') {
    token = url.searchParams.get('adminToken') || '';
    if (!isAdminAuthorized(req, new URL(`${url.origin}${url.pathname}?adminToken=${encodeURIComponent(token)}`))) return sendJson(res, 401, { error: 'Acceso de administrador denegado.' });
  } else if (role === 'player') {
    player = playerByToken(token);
    if (!player) return sendJson(res, 401, { error: 'Sesión inválida.' });
  } else {
    return sendJson(res, 400, { error: 'Rol inválido.' });
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff'
  });
  res.write(': conectado\n\n');
  const client = { res, role, token, playerId: player?.id || null };
  sseClients.add(client);
  if (role === 'admin') writeSse(res, 'state', adminPayload());
  else writeSse(res, 'state', playerPayload(player));
  req.on('close', () => { sseClients.delete(client); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, version: '10.6', active: state.active, status: state.status });
  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('User-agent: *\nDisallow: /admin\n');
  }
  if (url.pathname === '/api/events' && req.method === 'GET') return handleEvents(req, res, url);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);

  if (url.pathname === '/') {
    res.writeHead(302, { Location: ONLINE_MODE ? '/jugador' : '/admin' });
    return res.end();
  }
  if (url.pathname === '/admin' || url.pathname === '/admin/') return serveFile(res, path.join(ROOT, 'ABRIR_EL_BINGO_DE_LA_GORDA.html'));
  if (url.pathname === '/jugador' || url.pathname === '/jugador/') return serveFile(res, path.join(ROOT, 'jugador.html'));
  const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!(relative.startsWith('assets/') || relative.startsWith('js/'))) return sendJson(res, 404, { error: 'Archivo no encontrado.' });
  return serveFile(res, path.join(ROOT, relative));
});

setInterval(() => {
  try { processAssignmentDeadline(); }
  catch (error) { console.error('No se pudo completar la asignación automática:', error); }
}, 1000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of adminSessions) if (expiresAt <= now) adminSessions.delete(token);
  if (state.active && state.status === 'waiting' && purgeExpiredReservations()) {
    refreshAllOffers();
    saveState();
    broadcast();
  }
  for (const client of [...sseClients]) {
    try { client.res.write(': ping\n\n'); }
    catch { sseClients.delete(client); }
  }
}, 20_000).unref();

server.listen(PORT, HOST, () => {
  console.log('\nEL BINGO DE LA GORDA - V10.6 ONLINE');
  if (ONLINE_MODE) {
    console.log(`Jugadores: ${PUBLIC_URL || 'URL pública de Render'}/jugador`);
    console.log(`Administrador: ${PUBLIC_URL || 'URL pública de Render'}/admin`);
    if (!ADMIN_PASSWORD) console.warn('ATENCIÓN: falta configurar ADMIN_PASSWORD.');
  } else {
    const addresses = getLanAddresses();
    console.log(`Administrador: http://localhost:${PORT}/admin`);
    addresses.forEach(ip => console.log(`Jugadores: http://${ip}:${PORT}/jugador`));
    const target = `http://localhost:${PORT}/admin`;
    const command = process.platform === 'win32' ? `start "" "${target}"` : process.platform === 'darwin' ? `open "${target}"` : `xdg-open "${target}"`;
    exec(command, () => {});
  }
  console.log(`Límites: ${MAX_PLAYERS} jugadores · ${MAX_CARDS} cartones · ${MAX_CARDS_PER_PLAYER} por jugador\n`);
});
