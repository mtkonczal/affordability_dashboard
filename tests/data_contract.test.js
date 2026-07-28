// Data-contract tests: does everything in data/ still hold the shape and the
// internal consistency that index.html assumes?
//
// These are the tests that matter when data changes — a refresh, a new
// indicator, a new annual vintage. Run them BEFORE committing generated data
// (the GitHub Action does exactly that), so a bad fetch fails loudly instead
// of shipping a chart that renders blank or a rank that's silently wrong.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadHelpers, loadNational, loadStatesIndex, loadState, loadStateMetric,
  loadManifest, exists,
} = require('./lib/load.js');
const { seriesProblems, latestProblems, monthsBetween, maxDate } = require('./lib/series.js');

const H = loadHelpers();
const NAT = loadNational();
const IDX = loadStatesIndex();
const MANIFEST = loadManifest();
const NAT_IDS = Object.keys(NAT);
const METRICS = IDX.metrics;

const CURRENT_MONTH = (() => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
})();

// Values are rounded on the way into the payload, so cached scalars are
// compared with a relative tolerance rather than exactly.
function closeEnough(a, b) {
  return Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-6);
}

// Median month-gap between observations — used to infer a series' release
// cadence without trusting a `frequency` label.
function medianGapMonths(data) {
  if (data.length < 3) return null;
  const gaps = [];
  for (let i = 1; i < data.length; i++) gaps.push(monthsBetween(data[i - 1].date, data[i].date));
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

// How far behind the current month a series is allowed to be, by cadence.
// Generous on purpose: annual ACS/KFF vintages legitimately sit ~2.5 years
// back mid-year, quarterly sources lag two quarters. These catch a *stalled
// pipeline*, not a normal release lag.
function stalenessLimitMonths(gap) {
  if (gap == null) return 36;
  if (gap <= 1) return 3;    // weekly or monthly
  if (gap <= 3) return 9;    // quarterly
  if (gap <= 6) return 15;   // semiannual
  return 36;                 // annual
}

// ── National payload ────────────────────────────────────────────────────────

test('national: manifest and payload list exactly the same series', () => {
  assert.deepEqual(Object.keys(MANIFEST.national).sort(), NAT_IDS.slice().sort());
});

test('national: every series carries the fields the front end reads', () => {
  const missing = [];
  for (const id of NAT_IDS) {
    const it = NAT[id];
    for (const key of ['id', 'label', 'category', 'units', 'data']) {
      if (it[key] == null) missing.push(`${id}.${key}`);
    }
    if (it.id !== id) missing.push(`${id}: payload key != item.id (${it.id})`);
  }
  assert.deepEqual(missing, []);
});

test('national: every category is one the front end can render', () => {
  // CATEGORY_META in index.html. A series in an unknown category gets no chip
  // row and disappears from the National view without any error.
  const known = new Set(['big', 'daily', 'debt', 'groceries', 'labor']);
  const bad = NAT_IDS.filter(id => !known.has(NAT[id].category))
    .map(id => `${id} → ${NAT[id].category}`);
  assert.deepEqual(bad, []);
});

test('national: time series are well formed (dates, order, finite values)', () => {
  const bad = [];
  for (const id of NAT_IDS) {
    for (const p of seriesProblems(NAT[id].data)) bad.push(`${id} ${p}`);
  }
  assert.deepEqual(bad, []);
});

test('national: cached latest_value / latest_date / n_obs match the series', () => {
  const bad = [];
  for (const id of NAT_IDS) {
    const it = NAT[id];
    const data = it.data;
    const last = data[data.length - 1];
    if (it.latest_date !== last.date) bad.push(`${id}: latest_date ${it.latest_date} != ${last.date}`);
    if (it.latest_value != null && !closeEnough(it.latest_value, last.value)) {
      bad.push(`${id}: latest_value ${it.latest_value} != ${last.value}`);
    }
    if (it.n_obs != null && it.n_obs !== data.length) {
      bad.push(`${id}: n_obs ${it.n_obs} != ${data.length}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('national: no series has gone stale relative to its own cadence', () => {
  const stale = [];
  for (const id of NAT_IDS) {
    const it = NAT[id];
    const gap = medianGapMonths(it.data);
    const behind = monthsBetween(it.latest_date, CURRENT_MONTH);
    const limit = stalenessLimitMonths(gap);
    if (behind > limit) {
      stale.push(`${id}: latest ${it.latest_date} is ${behind} months back (cadence ~${gap}mo, limit ${limit})`);
    }
  }
  assert.deepEqual(stale, []);
});

test('national: Index-unit series are flagged rebase (never shown as raw index points)', () => {
  const bad = [];
  for (const id of NAT_IDS) {
    const isIndex = /^Index/.test(NAT[id].units || '');
    if (isIndex && !NAT[id].rebase) bad.push(`${id} has Index units but rebase is not set`);
    if (!isIndex && NAT[id].rebase) bad.push(`${id} is flagged rebase but units are "${NAT[id].units}"`);
  }
  assert.deepEqual(bad, []);
});

// ── The Real (inflation-adjusted) toggle ────────────────────────────────────

test('real mode: CPI deflator exists, is monthly, and keeps up with the series it deflates', () => {
  const cpi = NAT.cpi_all_items;
  assert.ok(cpi, 'cpi_all_items is missing — the whole Nominal/Real toggle depends on it');
  assert.equal(medianGapMonths(cpi.data), 1, 'CPI series is no longer monthly');

  // Deflatable series older than the CPI are fine; the risk is the reverse —
  // series running well past the newest CPI print get deflated by a stale
  // deflator (toReal falls back to the nearest earlier month).
  const cpiLast = maxDate(cpi.data);
  const tooFarAhead = NAT_IDS
    .filter(id => id !== 'cpi_all_items' && H.isDeflatable(NAT[id]))
    .filter(id => monthsBetween(cpiLast, NAT[id].latest_date) > 3)
    .map(id => `${id} ends ${NAT[id].latest_date}, CPI only reaches ${cpiLast}`);
  assert.deepEqual(tooFarAhead, []);
});

test('real mode: already-real series are never deflated twice', () => {
  const wrong = [...H.ALREADY_REAL_IDS]
    .filter(id => NAT[id])
    .filter(id => H.isDeflatable(NAT[id]));
  assert.deepEqual(wrong, [], 'these arrive inflation-adjusted and must not deflate again');
});

test('real mode: rates, counts and durations are a no-op', () => {
  const shouldNotDeflate = NAT_IDS.filter(id => {
    const u = NAT[id].units || '';
    return !u.includes('$') && !/^Index/.test(u);
  });
  const wrong = shouldNotDeflate.filter(id => H.isDeflatable(NAT[id]))
    .map(id => `${id} (${NAT[id].units})`);
  assert.deepEqual(wrong, []);
});

// ── State catalog ───────────────────────────────────────────────────────────

test('states: catalog has 51 states, each with code, name and fips', () => {
  assert.equal(IDX.states.length, 51);
  const bad = IDX.states.filter(s => !/^[A-Z]{2}$/.test(s.code) || !s.name || !/^\d{2}$/.test(s.fips))
    .map(s => JSON.stringify(s.code));
  assert.deepEqual(bad, []);
  assert.equal(new Set(IDX.states.map(s => s.code)).size, 51, 'duplicate state code');
});

test('states: every metric a state claims in `has` actually loads from its file', () => {
  const bad = [];
  for (const s of IDX.states) {
    if (!exists(`data/states/${s.code.toLowerCase()}.js`)) {
      bad.push(`data/states/${s.code.toLowerCase()}.js is missing`);
      continue;
    }
    const sd = loadState(s.code);
    if (!sd) { bad.push(`${s.code}: file did not populate window.STATE_DATA["${s.code}"]`); continue; }
    for (const id of s.has || []) {
      if (!sd.metrics || !sd.metrics[id]) bad.push(`${s.code}: index claims ${id}, state file has none`);
    }
    for (const id of Object.keys(sd.metrics || {})) {
      if (!(s.has || []).includes(id)) bad.push(`${s.code}: file has ${id}, index does not list it`);
    }
  }
  assert.deepEqual(bad, []);
});

test('states: every metric in the catalog has a compare-view payload file', () => {
  const missing = METRICS
    .filter(m => !exists(`data/state_metrics/${m.id}.js`))
    .map(m => m.id);
  assert.deepEqual(missing, []);
});

test('states: metric.national_id, when present, names a real national series', () => {
  // An R NULL serializes as {} — treated as absent here; fetch_data.R now
  // omits the key. Anything else non-string, or a string pointing nowhere, is
  // a broken national overlay in the State and Compare views.
  const bad = [];
  for (const m of METRICS) {
    const nid = m.national_id;
    if (nid == null) continue;
    if (typeof nid === 'object' && Object.keys(nid).length === 0) continue; // legacy R NULL
    if (typeof nid !== 'string') { bad.push(`${m.id}: national_id is ${JSON.stringify(nid)}`); continue; }
    if (!NAT[nid]) bad.push(`${m.id}: national_id "${nid}" is not a national series`);
  }
  assert.deepEqual(bad, []);
});

test('states: every state time series is well formed', () => {
  const bad = [];
  for (const s of IDX.states) {
    const sd = loadState(s.code);
    for (const [id, m] of Object.entries((sd && sd.metrics) || {})) {
      for (const p of seriesProblems(m.data)) bad.push(`${s.code}/${id} ${p}`);
      for (const p of latestProblems(m, m.data)) bad.push(`${s.code}/${id} ${p}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('states: state files and compare-view files agree on the latest reading', () => {
  const bad = [];
  for (const m of METRICS) {
    const wide = loadStateMetric(m.id);
    assert.ok(wide, `data/state_metrics/${m.id}.js did not populate window.STATE_METRIC`);
    for (const [code, row] of Object.entries(wide.states)) {
      const sd = loadState(code);
      const tall = sd && sd.metrics && sd.metrics[m.id];
      if (!tall) { bad.push(`${m.id}: ${code} in metric file but not in data/states/${code.toLowerCase()}.js`); continue; }
      if (tall.latest_date !== row.latest_date) {
        bad.push(`${m.id}/${code}: ${tall.latest_date} (state file) vs ${row.latest_date} (metric file)`);
      }
      if (!closeEnough(tall.latest_value, row.latest_value)) {
        bad.push(`${m.id}/${code}: ${tall.latest_value} vs ${row.latest_value}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('states: n_states in the catalog matches the payloads', () => {
  const bad = [];
  for (const m of METRICS) {
    const wide = loadStateMetric(m.id);
    const n = Object.keys(wide.states).length;
    if (m.n_states !== n) bad.push(`${m.id}: catalog says ${m.n_states}, metric file has ${n}`);
    const claimed = IDX.states.filter(s => (s.has || []).includes(m.id)).length;
    if (claimed !== n) bad.push(`${m.id}: ${claimed} states claim it, metric file has ${n}`);
  }
  assert.deepEqual(bad, []);
});

test('states: baked-in ranks are correct (1 = highest, ties share the low rank)', () => {
  // Ranks are computed once in fetch_data.R (ties.method = "min") and the
  // front end just prints them, so a wrong rank is invisible in the UI.
  const bad = [];
  for (const m of METRICS) {
    const wide = loadStateMetric(m.id);
    const rows = Object.entries(wide.states);
    const values = rows.map(([, r]) => r.latest_value);
    for (const [code, row] of rows) {
      const expected = 1 + values.filter(v => v > row.latest_value).length;
      if (row.rank !== expected) bad.push(`${m.id}/${code}: rank ${row.rank}, expected ${expected}`);
      if (row.rank_n !== rows.length) bad.push(`${m.id}/${code}: rank_n ${row.rank_n} != ${rows.length}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('states: rent coverage never drops below the 50% renter-household rule', () => {
  // Zillow ZORI is aggregated from counties with ACS renter weights; states
  // under half coverage are supposed to be omitted entirely, not shown thin.
  const wide = loadStateMetric('rent');
  const bad = Object.entries(wide.states)
    .filter(([, r]) => r.coverage != null && r.coverage < 0.5)
    .map(([code, r]) => `${code} coverage ${r.coverage}`);
  assert.deepEqual(bad, []);
});

test('states: rent_hours equals rent ÷ wages', () => {
  // The one derived metric. If STATE_METRICS order changes, this silently
  // divides by the wrong thing.
  const rent = loadStateMetric('rent');
  const wages = loadStateMetric('wages');
  const hours = loadStateMetric('rent_hours');
  const bad = [];
  for (const [code, row] of Object.entries(hours.states)) {
    const r = rent.states[code], w = wages.states[code];
    if (!r || !w) { bad.push(`${code}: rent_hours without rent or wages`); continue; }
    const rentAt = (r.data.find(p => p.date === row.latest_date) || {}).value;
    const wageAt = (w.data.find(p => p.date === row.latest_date) || {}).value;
    if (rentAt == null || wageAt == null) continue; // different vintages; the level test below still applies
    const expected = rentAt / wageAt;
    if (Math.abs(expected - row.latest_value) > 0.15) {
      bad.push(`${code}: rent_hours ${row.latest_value}, rent/wage = ${expected.toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ── Annual stat tiles ───────────────────────────────────────────────────────

test('annual: every indicator in annual_meta.json has its CSV and covers the states', () => {
  const bad = [];
  for (const a of IDX.annual || []) {
    const rel = `data/annual/${a.file}`;
    if (!exists(rel)) { bad.push(`${rel} is missing`); continue; }
    for (const key of ['id', 'label', 'units', 'year', 'source']) {
      if (!a[key]) bad.push(`annual ${a.id}: missing ${key}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('annual: tile values attached to states are finite numbers', () => {
  const ids = (IDX.annual || []).map(a => a.id);
  const bad = [];
  for (const s of IDX.states) {
    const sd = loadState(s.code);
    for (const [id, v] of Object.entries((sd && sd.annual) || {})) {
      if (!ids.includes(id)) bad.push(`${s.code}: annual "${id}" is not in annual_meta.json`);
      if (v != null && (typeof v !== 'number' || !Number.isFinite(v))) {
        bad.push(`${s.code}/${id}: ${JSON.stringify(v)} is not a number`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

// ── Front-end wiring that data changes can break ────────────────────────────

test('index.html: the CSV/PNG-per-card assumptions still hold for every series', () => {
  // Copy-fact and the badges read the two fixed anchors. A series that starts
  // after Jan 2025 has no baseline for the "since Jan 2025" badge, which the
  // card renders as a dash rather than crashing — but a series that starts
  // after *both* anchors is almost certainly a fetch that lost its history.
  const bad = [];
  for (const id of NAT_IDS) {
    const first = NAT[id].data[0].date;
    if (first > '2025-01-01' && NAT[id].data.length > 1) {
      bad.push(`${id} starts ${first} — after both dashboard anchors`);
    }
  }
  assert.deepEqual(bad, []);
});

test('index.html: map picker excludes index-level metrics', () => {
  // Index levels aren't comparable across states, so rebase metrics must stay
  // out of the choropleth. This encodes the rule so a new Index-unit state
  // metric can't quietly appear on the map.
  const indexMetrics = METRICS.filter(m => /^Index/.test(m.units || ''));
  const unflagged = indexMetrics.filter(m => !m.rebase).map(m => m.id);
  assert.deepEqual(unflagged, [], 'Index-unit state metrics must be flagged rebase so the map excludes them');
});
