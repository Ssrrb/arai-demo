'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { WebSocketServer, WebSocket } = require('ws');
const { hasProfanity } = require('./profanity');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

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

let entries = [];
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

async function initializeDatabase() {
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
}

async function refreshLeaderboard() {
  const result = await pool.query(`
    SELECT name, score, distance, bananas, achieved_at AS "achievedAt"
    FROM leaderboard_scores
    ORDER BY score DESC, distance DESC, achieved_at ASC
    LIMIT 10
  `);
  entries = result.rows;
  return entries;
}

async function saveHighScore({ key, name, score, distance, bananas }) {
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
  return result.rowCount === 1;
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
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; media-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
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
  if (request.method === 'GET' && pathname === '/api/name-check') {
    const name = cleanName(url.searchParams.get('name'));
    const reason = nameRejectionReason(url.searchParams.get('name'));
    if (reason) return sendJson(response, 200, { valid: false, available: false, reason });
    try {
      const currentName = cleanName(url.searchParams.get('current'));
      if (currentName && currentName.toLowerCase() === name.toLowerCase()) {
        return sendJson(response, 200, { valid: true, available: true });
      }
      const result = await pool.query('SELECT 1 FROM leaderboard_scores WHERE player_key = $1', [name.toLowerCase()]);
      return sendJson(response, 200, { valid: true, available: result.rowCount === 0 });
    } catch (error) {
      console.error('Could not check player name:', error);
      return sendJson(response, 503, { error: 'database-error' });
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
  let lastSubmission = 0;

  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type !== 'submitScore') return;

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

async function start() {
  await initializeDatabase();
  await refreshLeaderboard();
  server.listen(PORT, HOST, () => console.log(`Mine Cart Carnage listening on http://${HOST}:${PORT}`));
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const client of wss.clients) client.close(1001, 'Server shutting down');
  server.close();
  await pool.end().catch(error => console.error('Could not close database pool:', error));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch(async error => {
  console.error('Could not initialize leaderboard database:', error);
  await pool.end().catch(() => {});
  process.exit(1);
});
