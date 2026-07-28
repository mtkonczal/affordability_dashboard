#!/usr/bin/env node
// Run the whole suite:  node tests/run.js
//
// Uses Node's built-in test runner (node:test) — no package.json, no npm
// install, nothing to keep in sync with the CDN-loaded front end. Needs Node
// 18+; ubuntu-latest GitHub runners and any recent local Node both qualify.
//
// Exits non-zero if anything fails, which is what makes it usable as a gate in
// .github/workflows/update-data.yml before generated data gets committed.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.test.js'))
  .sort()
  .map(f => path.join(dir, f));

if (!files.length) {
  console.error('No *.test.js files found in tests/');
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], {
  stdio: 'inherit',
  cwd: path.resolve(dir, '..'),
});

process.exit(res.status == null ? 1 : res.status);
