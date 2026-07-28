// Loaders for the tracker's static artifacts, for use in Node tests.
//
// Everything this project ships is a plain <script> that assigns onto `window`
// (data/app_data.js, data/states_index.js, data/states/*.js,
// data/state_metrics/*.js, plus the first <script type="text/babel"> block in
// index.html, which ends with an Object.assign(window, {...}) of pure
// helpers). So we can run each of them in a vm context with a stub window and
// read the result — no bundler, no npm, no JSX transform.
//
// The one rule this depends on: the FIRST babel block in index.html must stay
// free of JSX and of browser APIs at module scope. It is the "pure helpers"
// block; components live in the second block. If a test suddenly fails with a
// SyntaxError or "document is not defined", something JSX-flavored moved into
// block one.

// Note: these run each script with `new Function(...)` rather than the `vm`
// module on purpose. A vm context is a separate JS realm, so arrays and objects
// it creates have a different Array.prototype and assert.deepStrictEqual
// rejects them as "same structure but not reference-equal". `new Function`
// keeps everything in this realm, with the browser globals passed in as
// parameters — the script bodies only touch `window` and `document`.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function repoPath(...parts) {
  return path.join(ROOT, ...parts);
}

function exists(rel) {
  return fs.existsSync(repoPath(rel));
}

// A minimal browser-ish global object: enough for the helper block's
// module-scope work (font/logo injection, a canvas probe) to run headlessly.
function stubWindow() {
  const win = {
    devicePixelRatio: 1,
    location: { hash: '', search: '', href: 'file:///index.html' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  const el = () => ({
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, appendChild() {}, removeChild() {}, remove() {}, click() {},
    getContext: () => null, toDataURL: () => '', width: 0, height: 0,
  });
  const doc = {
    documentElement: { classList: { add() {}, remove() {}, contains: () => false } },
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    createElement: el,
    createElementNS: el,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
  };
  return { win, doc };
}

/**
 * Run the pure-helpers block of index.html and return everything it exports
 * onto window (fmtVal, pctChange, anchorDate, toReal, buildFactText, ...).
 */
let _helpers = null;
function loadHelpers() {
  if (_helpers) return _helpers;
  const html = fs.readFileSync(repoPath('index.html'), 'utf8');
  const blocks = [...html.matchAll(
    /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g
  )].map(m => m[1]);
  if (!blocks.length) throw new Error('index.html: no <script type="text/babel"> block found');

  const { win, doc } = stubWindow();
  const baseKeys = new Set(Object.keys(win));
  const run = new Function(
    'window', 'document', 'navigator', 'Image', 'URL', 'Blob', 'fetch',
    blocks[0] + '\n//# sourceURL=index.html-helpers'
  );
  run(
    win, doc, { userAgent: 'node' },
    function Image() { return {}; },
    { createObjectURL: () => 'blob:', revokeObjectURL() {} },
    function Blob() { return {}; },
    () => Promise.reject(new Error('no network in tests'))
  );

  const exported = Object.keys(win).filter(k => !baseKeys.has(k));
  if (!exported.length) {
    throw new Error('index.html helper block exported nothing onto window');
  }
  _helpers = win;
  return _helpers;
}

/** Run one data/*.js payload file and return the stub window it wrote to. */
function loadPayload(relPath, seed = {}) {
  const src = fs.readFileSync(repoPath(relPath), 'utf8');
  const win = Object.assign({}, seed);
  new Function('window', src + `\n//# sourceURL=${relPath}`)(win);
  return win;
}

/** window.AFFORDABILITY_DATA — every national series, keyed by id. */
function loadNational() {
  return loadPayload('data/app_data.js').AFFORDABILITY_DATA;
}

/** window.AFFORDABILITY_STATES — the state/metric catalog. */
function loadStatesIndex() {
  return loadPayload('data/states_index.js').AFFORDABILITY_STATES;
}

// The 51 state files and 14 metric files get read by several tests each;
// memoize so a full run stays under a couple of seconds.
const _states = new Map();
const _metrics = new Map();

/** data/states/{code}.js → one state, all metrics. */
function loadState(code) {
  const key = code.toUpperCase();
  if (!_states.has(key)) {
    const win = loadPayload(`data/states/${key.toLowerCase()}.js`, { STATE_DATA: {} });
    _states.set(key, win.STATE_DATA[key]);
  }
  return _states.get(key);
}

/** data/state_metrics/{id}.js → one metric, all states. */
function loadStateMetric(id) {
  if (!_metrics.has(id)) {
    const win = loadPayload(`data/state_metrics/${id}.js`, { STATE_METRIC: {} });
    _metrics.set(id, win.STATE_METRIC[id]);
  }
  return _metrics.get(id);
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(repoPath('data', 'manifest.json'), 'utf8'));
}

module.exports = {
  ROOT, repoPath, exists,
  loadHelpers, loadPayload, loadNational, loadStatesIndex,
  loadState, loadStateMetric, loadManifest,
};
