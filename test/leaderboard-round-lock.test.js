'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const firebaseJs = fs.readFileSync(path.join(root, 'firebase.js'), 'utf8');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');

test('firestore.rules enforces round active check to prevent late winner registrations', () => {
  assert.match(firestoreRules, /function isRoundActive\(\)/);
  assert.match(firestoreRules, /match \/leaderboard_scores\/\{playerKey\}/);
  assert.match(firestoreRules, /allow create:[\s\S]*?isRoundActive\(\)/);
  assert.match(firestoreRules, /allow update:[\s\S]*?isRoundActive\(\)/);
  assert.match(firestoreRules, /match \/round_state\/\{stateId\}/);
});

test('firebase.js enforces in-memory and cloud round lock checks', () => {
  const fb = require('../firebase.js');
  assert.equal(typeof fb.setRoundLocked, 'function');
  assert.equal(typeof fb.isRoundLocked, 'function');
  assert.equal(typeof fb.saveRoundStateToFirestore, 'function');
  assert.equal(typeof fb.getRoundStateFromFirestore, 'function');

  fb.setRoundLocked(true);
  assert.equal(fb.isRoundLocked(), true);

  fb.setRoundLocked(false);
  assert.equal(fb.isRoundLocked(), false);
});

test('server.js blocks score saving and rejects submissions when round is finished', () => {
  assert.match(serverJs, /if \(roundState\.isFinished \|\| roundState\.status === 'finished'\)/);
  assert.match(serverJs, /reason:\s*'round-finished'/);
  assert.match(serverJs, /\/api\/round-state/);
});

test('client UI in index.html prevents submissions and signals locked positions', () => {
  assert.match(html, /id="round-locked-banner"/);
  assert.match(html, /id="timer-finish-btn"/);
  assert.match(html, /function submitRun\(\)/);
  assert.match(html, /if \(timerFinished\)/);
  assert.match(html, /reason === 'round-finished'/);
  assert.match(html, /showRoundFinishedNotification/);
  assert.match(html, /🔒 RONDA FINALIZADA/);
});
