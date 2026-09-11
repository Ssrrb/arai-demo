'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { WebSocketServer, WebSocket } = require('ws');
const { hasProfanity } = require('./profanity');
const fb = require('./firebase');

const PORT = 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;
const DATABASE_URL = process.env.DATABASE_URL;

const isDummyDatabaseUrl = !DATABASE_URL || DATABASE_URL.includes('@HOST:') || DATABASE_URL.includes('USER:PASSWORD') || DATABASE_URL.includes('//USER:');

let pool = null;
let isDatabaseAvailable = false;
let isFirebaseAvailable = false;

// In-memory mock storage fallback
const inMemoryScores = new Map([
  ['piloto01', { player_key: 'piloto01', name: 'PILOTO01', score: 1250, distance: 3400, bananas: 42, achieved_at: new Date(Date.now() - 3600000) }],
  ['tukupro', { player_key: 'tukupro', name: 'TUKUPRO', score: 980, distance: 2800, bananas: 31, achieved_at: new Date(Date.now() - 7200000) }],
  ['cosmica', { player_key: 'cosmica', name: 'COSMICA', score: 720, distance: 2100, bananas: 24, achieved_at: new Date(Date.now() - 10800000) }],
]);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let entries = Array.from(inMemoryScores.values()).map(({ name, score, distance, bananas, achieved_at }) => ({
  name, score, distance, bananas, achievedAt: new Date(achieved_at).toISOString(),
}));
let submissionChain = Promise.resolve();

function cleanName(value) {
  const name = String(value || '');
  return /^[a-zA-Z0-9]{2,12}$/.test(name) ? name : '';
}

function nameRejectionReason(value) {
  if (!cleanName(value)) return 'invalid-name';
  return hasProfanity(value) ? 'inappropriate-name' : null;
}

function integer(value, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= max ? number : null;
}

function publicEntries() {
  return entries.map(({ name, score, distance, bananas, achievedAt }) => ({
    name, score, distance, bananas, achievedAt,
  }));
}

let roundState = {
  status: 'waiting', // 'waiting' | 'running' | 'paused' | 'finished'
  duration: 120,     // in seconds
  remaining: 120,    // in seconds
  endsAt: null,      // timestamp in ms
  isFinished: false,
};
let roundTicker = null;

function getPublicRoundState() {
  return {
    status: roundState.status,
    duration: roundState.duration,
    remaining: roundState.remaining,
    endsAt: roundState.endsAt,
    isFinished: Boolean(roundState.isFinished || roundState.status === 'finished'),
  };
}

function broadcastRoundState() {
  const payload = JSON.stringify({ type: 'roundState', roundState: getPublicRoundState() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

function startRoundTicker() {
  if (roundTicker) clearInterval(roundTicker);
  roundTicker = setInterval(() => {
    if (roundState.status !== 'running' || !roundState.endsAt) return;
    const now = Date.now();
    const left = Math.max(0, Math.ceil((roundState.endsAt - now) / 1000));
    roundState.remaining = left;
    if (left <= 0) {
      roundState.remaining = 0;
      roundState.status = 'finished';
      roundState.isFinished = true;
      roundState.endsAt = null;
      stopRoundTicker();
      fb.setRoundLocked(true);
      if (isFirebaseAvailable) {
        fb.saveRoundStateToFirestore(roundState).catch(() => {});
      }
      broadcastRoundState();
      broadcastLeaderboard();
    }
  }, 1000);
}

function stopRoundTicker() {
  if (roundTicker) {
    clearInterval(roundTicker);
    roundTicker = null;
  }
}

function applyRoundAction(action, data = {}) {
  const now = Date.now();
  if (action === 'start') {
    const dur = integer(data.duration, 3600) || roundState.duration || 120;
    roundState.duration = dur;
    if (roundState.isFinished || roundState.remaining <= 0) {
      roundState.remaining = dur;
      roundState.isFinished = false;
    }
    roundState.status = 'running';
    roundState.endsAt = now + (roundState.remaining * 1000);
    fb.setRoundLocked(false);
    startRoundTicker();
  } else if (action === 'pause') {
    if (roundState.status === 'running') {
      if (roundState.endsAt) {
        roundState.remaining = Math.max(0, Math.ceil((roundState.endsAt - now) / 1000));
      }
      roundState.status = 'paused';
      roundState.endsAt = null;
      stopRoundTicker();
    }
  } else if (action === 'reset') {
    stopRoundTicker();
    const dur = integer(data.duration, 3600) || roundState.duration || 120;
    roundState.duration = dur;
    roundState.remaining = dur;
    roundState.status = 'waiting';
    roundState.isFinished = false;
    roundState.endsAt = null;
    fb.setRoundLocked(false);
  } else if (action === 'finish') {
    stopRoundTicker();
    roundState.remaining = 0;
    roundState.status = 'finished';
    roundState.isFinished = true;
    roundState.endsAt = null;
    fb.setRoundLocked(true);
  } else if (action === 'setDuration') {
    const dur = integer(data.duration, 3600);
    if (dur && dur >= 5) {
      roundState.duration = dur;
      if (roundState.status !== 'running') {
        roundState.remaining = dur;
      }
    }
  }

  if (isFirebaseAvailable) {
    fb.saveRoundStateToFirestore(roundState).catch(err => {
      console.warn('[Firebase] Notice saving round state:', err.message);
    });
  }

  broadcastRoundState();
  return getPublicRoundState();
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) reject(new Error('Body too large'));
    });
    request.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    request.on('error', reject);
  });
}

async function initializeDatabase() {
  // Test and initialize Firebase Firestore
  try {
    const fbConnected = await fb.testConnection();
    if (fbConnected && fb.db) {
      isFirebaseAvailable = true;
      console.log('[AI Studio] Connected to Firebase Firestore for real classification scores');
      fb.subscribeToLeaderboard((updatedEntries) => {
        entries = updatedEntries;
        broadcastLeaderboard();
      });
      try {
        const savedState = await fb.getRoundStateFromFirestore();
        if (savedState) {
          roundState.duration = savedState.duration || 120;
          roundState.status = savedState.status || 'waiting';
          roundState.remaining = savedState.remaining || 0;
          roundState.isFinished = Boolean(savedState.is_finished || savedState.status === 'finished');
          if (roundState.isFinished) {
            fb.setRoundLocked(true);
          }
        }
      } catch (err) {
        console.warn('[AI Studio] Could not load round state from Firestore:', err.message);
      }
    }
  } catch (error) {
    console.warn('[AI Studio] Firebase connection test notice:', error.message);
  }

  if (DATABASE_URL && !isDummyDatabaseUrl) {
    try {
      pool = new Pool({ connectionString: DATABASE_URL, max: 10, connectionTimeoutMillis: 3000 });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS leaderboard_scores (
          player_key VARCHAR(16) PRIMARY KEY,
          name VARCHAR(16) NOT NULL,
          score INTEGER NOT NULL CHECK (score >= 0),
          distance INTEGER NOT NULL CHECK (distance >= 0),
          bananas INTEGER NOT NULL CHECK (bananas >= 0),
          achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS leaderboard_scores_ranking_idx
        ON leaderboard_scores (score DESC, distance DESC, achieved_at ASC)
      `);
      isDatabaseAvailable = true;
      console.log('[AI Studio] Connected to PostgreSQL leaderboard database');
    } catch (error) {
      console.warn(`[AI Studio] PostgreSQL unavailable (${error.message})`);
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
      }
      isDatabaseAvailable = false;
    }
  }
}

async function refreshLeaderboard() {
  if (isFirebaseAvailable) {
    try {
      const fbEntries = await fb.getLeaderboardScores(10);
      if (Array.isArray(fbEntries)) {
        entries = fbEntries;
        return entries;
      }
    } catch (error) {
      console.warn('[AI Studio] Firestore fetch error, falling back:', error.message);
    }
  }

  if (isDatabaseAvailable && pool) {
    try {
      const result = await pool.query(`
        SELECT name, score, distance, bananas, achieved_at AS "achievedAt"
        FROM leaderboard_scores
        ORDER BY score DESC, distance DESC, achieved_at ASC
        LIMIT 10
      `);
      entries = result.rows;
      return entries;
    } catch (error) {
      console.warn('[AI Studio] Database refresh failed, falling back to in-memory:', error.message);
    }
  }

  const all = Array.from(inMemoryScores.values());
  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.distance !== a.distance) return b.distance - a.distance;
    return new Date(a.achieved_at || a.achievedAt) - new Date(b.achieved_at || b.achievedAt);
  });
  entries = all.slice(0, 10).map(({ name, score, distance, bananas, achieved_at, achievedAt }) => ({
    name, score, distance, bananas, achievedAt: achievedAt || (achieved_at ? new Date(achieved_at).toISOString() : new Date().toISOString()),
  }));
  return entries;
}

async function saveHighScore({ key, name, score, distance, bananas }) {
  if (roundState.isFinished || roundState.status === 'finished') {
    console.warn(`[Score Blocked] Submission rejected for ${name} (${score} pts): Round is finished and positions are locked.`);
    return false;
  }

  let savedToCloud = false;

  if (isFirebaseAvailable) {
    try {
      const accepted = await fb.saveLeaderboardScore({ key, name, score, distance, bananas });
      if (accepted) savedToCloud = true;
    } catch (error) {
      console.warn('[AI Studio] Firestore save error:', error.message);
    }
  }

  if (isDatabaseAvailable && pool) {
    try {
      const result = await pool.query(`
        INSERT INTO leaderboard_scores (player_key, name, score, distance, bananas, achieved_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (player_key) DO UPDATE SET
          name = EXCLUDED.name,
          score = EXCLUDED.score,
          distance = EXCLUDED.distance,
          bananas = EXCLUDED.bananas,
          achieved_at = EXCLUDED.achieved_at
        WHERE leaderboard_scores.score < EXCLUDED.score
           OR (leaderboard_scores.score = EXCLUDED.score
               AND leaderboard_scores.distance < EXCLUDED.distance)
        RETURNING player_key
      `, [key, name, score, distance, bananas]);
      if (result.rowCount === 1) savedToCloud = true;
    } catch (error) {
      console.warn('[AI Studio] Database save failed:', error.message);
    }
  }

  const existing = inMemoryScores.get(key);
  if (!existing) {
    inMemoryScores.set(key, { player_key: key, name, score, distance, bananas, achieved_at: new Date() });
    return true;
  }
  if (score > existing.score || (score === existing.score && distance > existing.distance)) {
    inMemoryScores.set(key, { player_key: key, name, score, distance, bananas, achieved_at: new Date() });
    return true;
  }
  return savedToCloud;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function serveStatic(request, response, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (relative !== 'index.html' && !relative.startsWith('assets/')) {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }
  const filename = path.resolve(ROOT, relative);
  if (!filename.startsWith(`${ROOT}${path.sep}`)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(response, 404, { error: 'Not found' });
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': relative === 'index.html' ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss: https://*.googleapis.com https://*.firebaseio.com https://firestore.googleapis.com; media-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors *",
    });
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(filename).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  if (request.method === 'GET' && pathname === '/healthz') return sendJson(response, 200, { ok: true });
  if (request.method === 'GET' && pathname === '/api/leaderboard') return sendJson(response, 200, { entries: publicEntries() });
  if ((request.method === 'GET' || request.method === 'POST') && pathname === '/api/leaderboard/reset') {
    try {
      let count = 0;
      if (isFirebaseAvailable) {
        count = await fb.clearLeaderboardScores();
      }
      if (isDatabaseAvailable && pool) {
        await pool.query('DELETE FROM leaderboard_scores');
      }
      inMemoryScores.clear();
      entries = [];
      applyRoundAction('reset');
      broadcastLeaderboard();
      return sendJson(response, 200, { ok: true, deleted: count, message: 'Leaderboard y ronda reiniciados con éxito en Firebase y servidor.' });
    } catch (err) {
      return sendJson(response, 500, { ok: false, error: err.message });
    }
  }
  if (request.method === 'GET' && pathname === '/api/round-state') {
    return sendJson(response, 200, { ok: true, roundState: getPublicRoundState() });
  }
  if (request.method === 'POST' && pathname === '/api/round-state') {
    try {
      const body = await readJsonBody(request);
      const updated = applyRoundAction(body.action, body);
      return sendJson(response, 200, { ok: true, roundState: updated });
    } catch (err) {
      return sendJson(response, 400, { ok: false, error: err.message });
    }
  }
  if (request.method === 'GET' && pathname === '/api/firebase-config') {
    return sendJson(response, 200, {
      projectId: fb.firebaseConfig.projectId,
      appId: fb.firebaseConfig.appId,
      apiKey: fb.firebaseConfig.apiKey,
      authDomain: fb.firebaseConfig.authDomain,
      firestoreDatabaseId: fb.firebaseConfig.firestoreDatabaseId,
      storageBucket: fb.firebaseConfig.storageBucket,
      messagingSenderId: fb.firebaseConfig.messagingSenderId,
    });
  }
  if (request.method === 'GET' && pathname === '/api/name-check') {
    const name = cleanName(url.searchParams.get('name'));
    const reason = nameRejectionReason(url.searchParams.get('name'));
    if (reason) return sendJson(response, 200, { valid: false, available: false, reason });
    try {
      const currentName = cleanName(url.searchParams.get('current'));
      if (currentName && currentName.toLowerCase() === name.toLowerCase()) {
        return sendJson(response, 200, { valid: true, available: true });
      }
      if (isFirebaseAvailable) {
        const available = await fb.isNameAvailable(name.toLowerCase());
        return sendJson(response, 200, { valid: true, available });
      }
      if (isDatabaseAvailable && pool) {
        const result = await pool.query('SELECT 1 FROM leaderboard_scores WHERE player_key = $1', [name.toLowerCase()]);
        return sendJson(response, 200, { valid: true, available: result.rowCount === 0 });
      }
      const available = !inMemoryScores.has(name.toLowerCase());
      return sendJson(response, 200, { valid: true, available });
    } catch (error) {
      console.warn('Could not check player name against database, using in-memory:', error.message);
      const available = !inMemoryScores.has(name.toLowerCase());
      return sendJson(response, 200, { valid: true, available });
    }
  }
  if ((request.method === 'GET' || request.method === 'HEAD') && pathname !== '/ws') return serveStatic(request, response, pathname);
  sendJson(response, 405, { error: 'Method not allowed' });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const seenRuns = new Set();

function safeSend(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcastLeaderboard() {
  const payload = JSON.stringify({ type: 'leaderboard', entries: publicEntries() });
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(payload);
}

async function processSubmission(socket, submission) {
  if (roundState.isFinished || roundState.status === 'finished') {
    seenRuns.delete(submission.runId);
    safeSend(socket, {
      type: 'scoreResult',
      runId: submission.runId,
      accepted: false,
      reason: 'round-finished',
      message: 'La ronda ha finalizado. La clasificación está cerrada y no se aceptan nuevos ganadores ni cambios de posición.',
    });
    return;
  }
  try {
    const accepted = await saveHighScore(submission);
    if (accepted) {
      await refreshLeaderboard();
      broadcastLeaderboard();
    }
    safeSend(socket, {
      type: 'scoreResult',
      runId: submission.runId,
      accepted,
      reason: accepted ? undefined : 'not-a-high-score',
    });
  } catch (error) {
    seenRuns.delete(submission.runId);
    console.error('Could not save score:', error);
    safeSend(socket, { type: 'scoreResult', runId: submission.runId, accepted: false, reason: 'database-error' });
  }
}

wss.on('connection', socket => {
  safeSend(socket, { type: 'leaderboard', entries: publicEntries() });
  safeSend(socket, { type: 'roundState', roundState: getPublicRoundState() });
  let lastSubmission = 0;

  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.type === 'roundAction') {
      const result = applyRoundAction(message.action, message);
      safeSend(socket, { type: 'roundActionResult', ok: true, roundState: result });
      return;
    }

    if (message.type !== 'submitScore') return;

    if (roundState.isFinished || roundState.status === 'finished') {
      safeSend(socket, {
        type: 'scoreResult',
        runId: message.runId,
        accepted: false,
        reason: 'round-finished',
        message: 'La ronda ha finalizado. La clasificación está cerrada y no se aceptan nuevos ganadores ni cambios de posición.',
      });
      return;
    }

    const now = Date.now();
    if (now - lastSubmission < 1000) {
      safeSend(socket, { type: 'scoreResult', runId: message.runId, accepted: false, reason: 'rate-limited' });
      return;
    }
    lastSubmission = now;

    const name = cleanName(message.name);
    const nameReason = nameRejectionReason(message.name);
    const score = integer(message.score, 1_000_000_000);
    const distance = integer(message.distance, 10_000_000);
    const bananas = integer(message.bananas, 10_000_000);
    const runId = String(message.runId || '').slice(0, 80);
    if (nameReason) {
      safeSend(socket, { type: 'scoreResult', runId, accepted: false, reason: nameReason });
      return;
    }
    if (score === null || distance === null || bananas === null || !runId) {
      safeSend(socket, { type: 'scoreResult', runId, accepted: false, reason: 'invalid-submission' });
      return;
    }
    if (seenRuns.has(runId)) {
      safeSend(socket, { type: 'scoreResult', runId, accepted: false, reason: 'duplicate-run' });
      return;
    }
    seenRuns.add(runId);
    if (seenRuns.size > 10_000) seenRuns.delete(seenRuns.values().next().value);

    const submission = { runId, key: name.toLowerCase(), name, score, distance, bananas };
    submissionChain = submissionChain.then(() => processSubmission(socket, submission));
  });
});

server.on('error', (error) => {
  console.error('[HTTP Server Error]:', error.message);
});

wss.on('error', (error) => {
  console.error('[WebSocket Server Error]:', error.message);
});

async function start() {
  server.listen(PORT, HOST, () => {
    console.log(`TUKU: No Te Caigas listening on http://${HOST}:${PORT}`);
  });

  try {
    await initializeDatabase();
    await refreshLeaderboard();
    broadcastLeaderboard();
  } catch (error) {
    console.warn('[AI Studio] Database initialization notice on start:', error.message);
  }
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const client of wss.clients) client.close(1001, 'Server shutting down');
  server.close();
  if (pool) {
    await pool.end().catch(error => console.error('Could not close database pool:', error));
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch(async error => {
  console.error('Could not start server:', error);
  if (pool) {
    await pool.end().catch(() => {});
  }
  process.exit(1);
});
