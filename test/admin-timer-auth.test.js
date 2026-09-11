'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

test('admin authentication configuration and password fallback', () => {
  assert.match(envExample, /ADMIN_PASSWORD=/);
  assert.match(serverJs, /671944/);
  assert.match(serverJs, /\/api\/admin\/login/);
  assert.match(serverJs, /\/api\/admin\/logout/);
  assert.match(serverJs, /\/api\/admin\/verify/);
});

test('server.js protects round-state modifications with admin verification', () => {
  assert.match(serverJs, /isValidAdmin/);
  assert.match(serverJs, /activeAdminTokens/);
  assert.match(serverJs, /unauthorized/);
  assert.match(serverJs, /roundActionResult/);
});

test('index.html protects timer controls behind admin authentication UI', () => {
  // Admin button and controls container
  assert.match(html, /id="admin-auth-toggle-btn"/);
  assert.match(html, /id="timer-admin-controls"/);
  assert.match(html, /id="timer-spectator-hint"/);

  // Admin login modal
  assert.match(html, /id="admin-auth-modal"/);
  assert.match(html, /id="admin-auth-form"/);
  assert.match(html, /id="admin-password-input"/);

  // Client-side guard functions
  assert.match(html, /function setAdminMode\(/);
  assert.match(html, /function openAdminModal\(/);
  assert.match(html, /function verifyInitialAdminToken\(/);
  assert.match(html, /currentAdminToken/);
});
