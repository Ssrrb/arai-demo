'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_FILE = process.env.LEADERBOARD_FILE || path.join(ROOT, 'data', 'leaderboard.json');
const MAX_ENTRIES = 100;

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

let entries = loadEntries();
let writeChain = Promise.resolve();

function cleanName(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, ' ').slice(0, 16);
}

function integer(value, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= max ? number : null;
}

function publicEntries() {
  return entries.slice(0, 10).map(({ name, score, distance, bananas, achievedAt }) => ({
    name, score, distance, bananas, achievedAt,
  }));
}

function sortEntries(list) {
  return list.sort((a, b) => b.score - a.score || b.distance - a.distance || a.achievedAt.localeCompare(b.achievedAt));
}

function loadEntries() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? sortEntries(parsed).slice(0, MAX_ENTRIES) : [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load leaderboard:', error);
    return [];
  }
}

function persistEntries() {
  const snapshot = JSON.stringify(entries, null, 2);
  writeChain = writeChain.then(async () => {
    await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const temporary = `${DATA_FILE}.tmp`;
    await fs.promises.writeFile(temporary, snapshot);
    await fs.promises.rename(temporary, DATA_FILE);
  }).catch(error => console.error('Could not persist leaderboard:', error));
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

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
  if (request.method === 'GET' && pathname === '/healthz') return sendJson(response, 200, { ok: true });
  if (request.method === 'GET' && pathname === '/api/leaderboard') return sendJson(response, 200, { entries: publicEntries() });
  if ((request.method === 'GET' || request.method === 'HEAD') && pathname !== '/ws') return serveStatic(request, response, pathname);
  sendJson(response, 405, { error: 'Method not allowed' });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const seenRuns = new Set();

function broadcastLeaderboard() {
  const payload = JSON.stringify({ type: 'leaderboard', entries: publicEntries() });
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(payload);
}

wss.on('connection', socket => {
  socket.send(JSON.stringify({ type: 'leaderboard', entries: publicEntries() }));
  let lastSubmission = 0;

  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type !== 'submitScore') return;

    const now = Date.now();
    if (now - lastSubmission < 1000) return;
    lastSubmission = now;

    const name = cleanName(message.name);
    const score = integer(message.score, 1_000_000_000);
    const distance = integer(message.distance, 10_000_000);
    const bananas = integer(message.bananas, 10_000_000);
    const runId = String(message.runId || '').slice(0, 80);
    if (name.length < 2 || score === null || distance === null || bananas === null || !runId || seenRuns.has(runId)) return;
    seenRuns.add(runId);
    if (seenRuns.size > 10_000) seenRuns.delete(seenRuns.values().next().value);

    const key = name.toLocaleLowerCase('en-US');
    const existing = entries.find(entry => entry.key === key);
    if (existing && (existing.score > score || (existing.score === score && existing.distance >= distance))) return;

    if (existing) entries = entries.filter(entry => entry !== existing);
    entries.push({ key, name, score, distance, bananas, achievedAt: new Date().toISOString() });
    entries = sortEntries(entries).slice(0, MAX_ENTRIES);
    persistEntries();
    broadcastLeaderboard();
  });
});

server.listen(PORT, HOST, () => console.log(`Mine Cart Carnage listening on http://${HOST}:${PORT}`));

function shutdown() {
  for (const client of wss.clients) client.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
