// Does fetch_data.R still describe the data we actually shipped?
//
// The rest of the suite checks the committed payloads against each other and
// against what index.html assumes. Nothing checked them against the script that
// generates them — so when someone edits a label or a series id in fetch_data.R
// and doesn't re-run it, the repo carries two different answers and every test
// passes. Not hypothetical: commit 7058dad corrected the source metadata for
// three BLS-only CPI series and never regenerated data/, and the mismatch
// survived several commits because nothing was looking.
//
// The failure mode is specifically nasty. Nobody notices at the time, because the
// deployed page keeps serving the old data quite happily. Then months later a
// routine refresh runs, silently applies the pending edit, and a published number
// moves for reasons unconnected to anything in that day's commit. Worst case
// found in practice: `groceries` shipped as CPIFABSL ("Food and Beverages" —
// includes restaurant meals and alcohol) while both its own label and
// fetch_data.R said food-at-home, so the next refresh was primed to move the
// groceries line ~7% with no visible cause.
//
// So: after any change to SERIES, either re-run `Rscript fetch_data.R` or add a
// KNOWN_STALE exemption below. A failure here is not a broken test — it is the
// repo telling you the artifacts are stale.
//
// Two things this deliberately does NOT check, because they legitimately differ
// between the script and the payload:
//   - `last_updated`, `latest_*`, `yoy_change`, `n_obs`, `data` — computed at
//     fetch time from data that moves. data_contract.test.js covers those.
//   - `from`, `source`, `bls_id`, `src_id`, `kff_id`, `optional`, `scale` — fetch
//     inputs that are never serialized into the payload.

const test = require('node:test');
const assert = require('node:assert');

const { loadNational, loadManifest, loadStatesIndex } = require('./lib/load');
const { parseSeries, parseStateMetrics } = require('./lib/rseries');

const NAT = loadNational();
const MANIFEST = loadManifest().national;
const SERIES = parseSeries();
const BY_ID = new Map(SERIES.map(s => [s.id, s]));
const IDX = loadStatesIndex();
const STATE_METRICS = parseStateMetrics();

// Series built inside fetch_data.R after the SERIES loop rather than declared in
// it. Listed explicitly so adding a derived series is a conscious edit here
// instead of a silent hole in the parity check.
const DERIVED_IDS = ['rent_hours'];

// ── Known-stale exemptions ───────────────────────────────────────────────────
// Fields where fetch_data.R and the committed payload are KNOWN to disagree and
// the disagreement is accepted for now. Every entry is a promise that the next
// real `Rscript fetch_data.R` will resolve it — and the last test in this file
// fails if an exemption is no longer needed, so these get deleted rather than
// accumulating.
//
// All of the below trace to commit 7058dad, which fixed fetch_data.R without
// regenerating data/. Resolving them needs R plus BLS_KEY/CENSUS_API_KEY, which
// is what refresh_test.md walks through. Read that before clearing these:
// `groceries` in particular changes which series the card plots, so it needs a
// decision, not just a refresh.
const KNOWN_STALE = {};

// Copied verbatim from the SERIES entry into the payload, via
//   compact(cfg[c("id","label",...)])
// `compact()` drops NULLs, so a field absent from the entry must be absent from
// the payload too — that asymmetry is how the stale `fred_id` on car_insurance
// and childcare is detectable at all.
const VERBATIM = ['label', 'subtitle', 'category', 'units', 'description',
                  'color', 'fred_id', 'source_url'];

// Written as `isTRUE(cfg$x)`: true only if the entry says TRUE, else false.
const FLAGS = ['is_new', 'invert_color', 'overlay_only'];

const ZORI_NOTE = 'Zillow Observed Rent Index (ZORI), smoothed & seasonally adjusted';

/** What the payload's `source_note` should be for a given SERIES entry. */
function expectedSourceNote(cfg) {
  if (cfg.source_note !== undefined) return cfg.source_note;
  if (cfg.source === 'zori') return ZORI_NOTE;
  return undefined;
}

/**
 * Every field where fetch_data.R and data/app_data.js disagree, as
 * { id, field, declared, shipped } — exemptions included, so the exemption
 * checker can see them too. One collector, so every test below is filtering the
 * same evidence rather than re-deriving it.
 */
function collectDrift() {
  const out = [];
  const add = (id, field, declared, shipped) => out.push({ id, field, declared, shipped });

  for (const cfg of SERIES) {
    const item = NAT[cfg.id];
    if (!item) continue;

    for (const field of VERBATIM) {
      if (cfg[field] === undefined) {
        if (item[field] !== undefined) add(cfg.id, field, undefined, item[field]);
      } else if (item[field] !== cfg[field]) {
        add(cfg.id, field, cfg[field], item[field]);
      }
    }

    for (const field of FLAGS) {
      const expected = cfg[field] === true;
      if (item[field] !== expected) add(cfg.id, field, expected, item[field]);
    }

    // fetch_data.R: rebase_flag <- grepl("^Index", cfg$units)
    const rebase = /^Index/.test(cfg.units || '');
    if (item.rebase !== rebase) add(cfg.id, 'rebase', rebase, item.rebase);

    const note = expectedSourceNote(cfg);
    if (item.source_note !== note) add(cfg.id, 'source_note', note, item.source_note);
  }
  return out;
}

const DRIFT = collectDrift();

function isExempt(d) {
  return (KNOWN_STALE[d.id] || []).includes(d.field);
}

function fmt(d) {
  return `${d.id}.${d.field}\n    fetch_data.R: ${JSON.stringify(d.declared)}\n    payload:      ${JSON.stringify(d.shipped)}`;
}

test('parity: SERIES and the payload list the same series, in the same order', () => {
  const declared = SERIES.map(s => s.id);
  const shipped = Object.keys(NAT).filter(id => !DERIVED_IDS.includes(id));

  const dupes = declared.filter((id, i) => declared.indexOf(id) !== i);
  assert.deepEqual(dupes, [], 'fetch_data.R declares a duplicate series id');
  assert.deepEqual(declared.filter(id => !(id in NAT)), [],
    'declared in fetch_data.R but missing from data/app_data.js');
  assert.deepEqual(shipped.filter(id => !BY_ID.has(id)), [],
    'in data/app_data.js but not declared in fetch_data.R (add it to DERIVED_IDS ' +
    'if it is built after the SERIES loop)');
  // Order matters: fetch_data.R writes the payload by iterating SERIES, so a
  // mismatch means the payload was hand-edited rather than regenerated.
  assert.deepEqual(shipped, declared, 'payload key order != SERIES order');
});

test('parity: every derived series really is absent from SERIES', () => {
  assert.deepEqual(DERIVED_IDS.filter(id => BY_ID.has(id)), [],
    'listed in DERIVED_IDS but actually declared in SERIES — remove it from the list');
  assert.deepEqual(DERIVED_IDS.filter(id => !(id in NAT)), [],
    'listed in DERIVED_IDS but not in the payload — the derived block did not run');
});

test('parity: no unexpected metadata drift between fetch_data.R and the payload', () => {
  const bad = DRIFT.filter(d => !isExempt(d)).map(fmt);
  assert.deepEqual(bad, [],
    `${bad.length} field(s) differ. Either re-run \`Rscript fetch_data.R\` so the ` +
    'artifacts match the script, or revert the SERIES edit. Only add a ' +
    'KNOWN_STALE exemption if the refresh genuinely has to wait.');
});

test('parity: rebase is derived from units, never set by hand', () => {
  // The front end uses rebase to decide whether to show cumulative % change
  // instead of raw levels. A wrong value means a card publishes index points —
  // the thing CLAUDE.md says never to do — so this gets its own named test even
  // though the generic drift check above also covers it.
  const bad = DRIFT.filter(d => d.field === 'rebase').map(fmt);
  assert.deepEqual(bad, []);
});

test('parity: a BLS-only series does not advertise a FRED id it was not fetched from', () => {
  // For source = "bls" entries the fetch uses bls_id. Some also set fred_id
  // because FRED mirrors the series (the APU average-price items); where it
  // doesn't, fred_id must be absent or the card's "view source" link points at a
  // series that isn't the one plotted. When both are set they must match.
  const bad = [];
  for (const cfg of SERIES) {
    if (cfg.source !== 'bls' || !NAT[cfg.id]) continue;
    if (cfg.fred_id !== undefined && cfg.fred_id !== cfg.bls_id) {
      bad.push(`${cfg.id}: SERIES sets fred_id=${cfg.fred_id} and bls_id=${cfg.bls_id} — these must match, or the CSV link and the plotted data disagree`);
    }
  }
  assert.deepEqual(bad, []);
});

test('parity: manifest.json carries the same metadata as the payload', () => {
  // manifest.json is written from the same objects, minus the data arrays, so
  // any divergence means one of the two was edited directly. No exemptions here:
  // these two artifacts are always generated together.
  const bad = [];
  const keys = [...VERBATIM, ...FLAGS, 'rebase', 'source_note',
                'latest_value', 'latest_date', 'yoy_change', 'n_obs', 'last_updated'];
  for (const id of Object.keys(NAT)) {
    const m = MANIFEST[id];
    if (!m) { bad.push(`${id}: missing from manifest.json`); continue; }
    for (const key of keys) {
      if (JSON.stringify(m[key]) !== JSON.stringify(NAT[id][key])) {
        bad.push(`${id}.${key}: manifest ${JSON.stringify(m[key])} != payload ${JSON.stringify(NAT[id][key])}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('parity: every category in SERIES is one the front end can render', () => {
  // data_contract.test.js checks this for the payload. Checking SERIES too
  // catches a new category *before* a refresh ships it, which is when it is
  // cheap to fix.
  const known = new Set(['housing', 'groceries', 'bills', 'health', 'income', 'overall']);
  const bad = SERIES.filter(s => !known.has(s.category)).map(s =>
    `${s.id} → ${s.category} (add it to CATEGORY_META, CATEGORY_LABELS and ` +
    'ESP_CATEGORY_COLOR in index.html, and to the known set in ' +
    'data_contract.test.js and here)');
  assert.deepEqual(bad, []);
});

// ── State metrics ────────────────────────────────────────────────────────────
// Same drift risk as SERIES, and it went unwatched until August 2026: nothing
// compared STATE_METRICS in fetch_data.R against the committed states_index.js,
// so an edit there could sit unshipped until a routine refresh applied it.
// `category` is the field that makes this urgent — the state view groups on it
// AND colors on it, so a pending edit doesn't just move a label, it moves cards
// between rail groups and repaints them.

test('parity: states_index metrics match STATE_METRICS, same ids in the same order', () => {
  const declared = STATE_METRICS.map(m => m.id);
  const shipped = IDX.metrics.map(m => m.id);
  // A declared metric legitimately drops out when no state has data for it
  // (fetch_data.R filters n_states > 0), so the shipped list is a subsequence of
  // the declared one, not necessarily equal to it.
  assert.deepEqual(shipped, declared.filter(id => shipped.includes(id)),
    'states_index.js metric order does not follow STATE_METRICS — re-run ' +
    '`Rscript fetch_data.R` rather than reordering either list.');
  const unknown = shipped.filter(id => !declared.includes(id));
  assert.deepEqual(unknown, [], 'shipped metrics that STATE_METRICS does not declare');
});

test('parity: state metric metadata is verbatim from STATE_METRICS', () => {
  const byId = new Map(STATE_METRICS.map(m => [m.id, m]));
  const bad = [];
  for (const m of IDX.metrics) {
    const cfg = byId.get(m.id);
    if (!cfg) continue; // covered by the test above
    for (const key of ['label', 'category', 'units', 'color', 'description', 'source_label', 'source_url']) {
      if (cfg[key] !== m[key]) {
        bad.push(`${m.id}.${key}: fetch_data.R ${JSON.stringify(cfg[key])} != payload ${JSON.stringify(m[key])}`);
      }
    }
    // Derived the same way the national payload derives it.
    const rebase = /^Index/.test(cfg.units || '');
    if (rebase !== !!m.rebase) bad.push(`${m.id}.rebase: units "${cfg.units}" implies ${rebase}, payload says ${!!m.rebase}`);
    if (!!cfg.invert_color !== !!m.invert_color) bad.push(`${m.id}.invert_color: fetch_data.R ${!!cfg.invert_color} != payload ${!!m.invert_color}`);
  }
  assert.deepEqual(bad, [],
    'STATE_METRICS and states_index.js disagree. Fix with `Rscript fetch_data.R`, ' +
    'not by editing this test.');
});

test('parity: every state metric category is one the state rail can render', () => {
  // Three of the six, and that is structural. "groceries" has no state data;
  // "overall" is impossible because there is no state CPI (never add or imply
  // one); "bills" is folded into housing on purpose, because a rail heading over
  // one lone electricity bill reads like a bug. If a state metric ever lands in
  // groceries or bills, that is a decision to make in fetch_data.R and in
  // sidebar_format.md — not a test to loosen quietly.
  const known = new Set(['housing', 'health', 'income']);
  const bad = STATE_METRICS.filter(m => !known.has(m.category)).map(m =>
    `${m.id} → ${m.category === undefined ? '(no category)' : m.category}`);
  assert.deepEqual(bad, [],
    'A state metric with no category vanishes from the state view picker, and a ' +
    'metric in an unexpected group changes what the rail claims. See the ' +
    'STATE_METRICS comment in fetch_data.R.');
});

test('parity: no KNOWN_STALE exemption has outlived its usefulness', () => {
  // The self-cleaning half of the exemption mechanism. Once a refresh resolves a
  // drift, its exemption is dead weight that would hide the next real
  // regression on that field — so leaving it in place is itself a failure.
  const stale = [];
  for (const [id, fields] of Object.entries(KNOWN_STALE)) {
    if (!(id in NAT)) {
      stale.push(`${id}: exempted but no longer a series at all — delete the entry`);
      continue;
    }
    for (const field of fields) {
      if (!DRIFT.some(d => d.id === id && d.field === field)) {
        stale.push(`${id}.${field}: exempted but no longer drifting — delete it from KNOWN_STALE`);
      }
    }
  }
  assert.deepEqual(stale, [],
    'These exemptions are obsolete. The data has been refreshed; remove them so ' +
    'the fields are checked again.');
});
