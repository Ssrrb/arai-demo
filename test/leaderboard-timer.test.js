'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('classification modal contains selectable timer UI', () => {
  // Timer card and display
  assert.match(html, /id="leaderboard-timer-card"/);
  assert.match(html, /id="timer-display"/);
  assert.match(html, /id="timer-progress-fill"/);
  assert.match(html, /id="timer-status-badge"/);

  // Duration dropdown and +/- step buttons
  assert.match(html, /id="timer-select"/);
  assert.match(html, /id="timer-sub-btn"/);
  assert.match(html, /id="timer-add-btn"/);

  // Top presets buttons (30s, 1m, 2m, etc.) and sound button are removed per design request
  assert.doesNotMatch(html, /id="timer-presets"/);
  assert.doesNotMatch(html, /id="timer-sound-btn"/);

  // Timer controls
  assert.match(html, /id="timer-start-btn"/);
  assert.match(html, /id="timer-reset-btn"/);
});

test('classification includes sound effects for countdown and completion', () => {
  assert.match(html, /playTimerTick/);
  assert.match(html, /playTimerFanfare/);
  assert.match(html, /timerSoundEnabled/);
  assert.match(html, /toggleTimerSound/);
});

test('classification includes confetti animation and 1st and 2nd place highlight', () => {
  // Confetti canvas and engine
  assert.match(html, /id="confetti-canvas"/);
  assert.match(html, /fireConfetti/);

  // Celebration banner and podium highlight
  assert.match(html, /id="timer-celebration-banner"/);
  assert.match(html, /id="celebration-podium-cards"/);
  assert.match(html, /rank-first/);
  assert.match(html, /rank-second/);
  assert.match(html, /spotlight-active/);
  assert.match(html, /1º PUESTO/);
  assert.match(html, /2º PUESTO/);
});

test('classification displays top 6 players on podium when round finishes', () => {
  // Podium configuration for top 6 positions
  assert.match(html, /podiumConfigs/);
  assert.match(html, /🥇 1º PUESTO/);
  assert.match(html, /🥈 2º PUESTO/);
  assert.match(html, /🥉 3º PUESTO/);
  assert.match(html, /🎖️ 4º PUESTO/);
  assert.match(html, /🎖️ 5º PUESTO/);
  assert.match(html, /🎖️ 6º PUESTO/);
  assert.match(html, /PODIO OFICIAL DE LOS TOP 6 JUGADORES/);
  assert.match(html, /rank-top6/);
  assert.match(html, /winner-badge bronze/);
  assert.match(html, /winner-badge top6/);
});

