// Unit tests for the pure helpers in index.html's first <script type="text/babel">
// block — the formatting, anchoring, deflation and fact-sentence logic that
// every chart card runs through.
//
// These are pinned behavior, not aspirations: if a test here fails after an
// edit, decide whether the change was intended and update the test in the same
// commit. The ones that carry an editorial decision (the Dec-2019 anchor,
// percentage points on rate series, index series never quoting levels) say so
// in a comment, because those were deliberate calls and shouldn't drift by
// accident.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { loadHelpers, repoPath } = require('./lib/load.js');

const H = loadHelpers();
const {
  fmtVal, fmtDate, ordinal, pctChange, valueAt, sliceFrom, hoursToAfford,
  scaleByCPI, categoryLabel, ANCHORS, anchorById, anchorDate, buildFactText,
  isDeflatable, toReal, seriesForType, ALREADY_REAL_IDS,
} = H;

// ── The seam between the two script blocks ──────────────────────────────────

test('script blocks: everything the component block pulls off window is exported by the helper block', () => {
  // index.html hands helpers across a `const {...} = window;` destructure. A
  // name typo'd or forgotten on either side becomes `undefined` at module
  // scope and the whole app renders "Loading…" forever with one console error.
  // This is the check that a JSX-free test suite can still make cheaply.
  const html = fs.readFileSync(repoPath('index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(blocks.length >= 2, 'expected at least two babel blocks');

  const destructure = blocks[1].match(/const \{([\s\S]*?)\} = window;/);
  assert.ok(destructure, 'the component block no longer destructures helpers from window');
  const wanted = destructure[1].split(',').map(s => s.trim()).filter(Boolean);
  assert.ok(wanted.length > 10, `only found ${wanted.length} destructured helpers — regex drifted?`);

  const missing = wanted.filter(name => H[name] === undefined);
  assert.deepEqual(missing, [], 'destructured from window but never exported by the helper block');
});

test('script blocks: the helper block stays free of JSX so it can be tested headlessly', () => {
  const html = fs.readFileSync(repoPath('index.html'), 'utf8');
  const block0 = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1];
  // A component tag (<Foo ...) is the tell. Lowercase HTML tags appear inside
  // strings and comments, so only capitalized component tags are checked.
  const jsx = block0.match(/<[A-Z][A-Za-z]*[\s/>]/g);
  assert.equal(jsx, null, `JSX found in the pure-helpers block: ${jsx && jsx.join(', ')}`);
});

// A short monthly series, easy to reason about: 100 → 110 → 121.
const series = (pairs) => pairs.map(([date, value]) => ({ date, value }));
const MONTHLY = series([
  ['2019-11-01', 90],
  ['2019-12-01', 100],
  ['2024-06-01', 110],
  ['2025-01-01', 120],
  ['2026-06-01', 150],
]);

// ── fmtVal ──────────────────────────────────────────────────────────────────

test('fmtVal: percents get one decimal', () => {
  assert.equal(fmtVal(4.25, 'Rate (%)'), '4.3%');
  assert.equal(fmtVal(4, '% of Renters'), '4.0%');
});

test('fmtVal: dollars keep cents under $1,000 and drop them above', () => {
  assert.equal(fmtVal(3.129, '$ per Gallon'), '$3.13');
  assert.equal(fmtVal(999.5, '$'), '$999.50');
  assert.equal(fmtVal(1394, '$ per Month'), '$1,394');
  assert.equal(fmtVal(-1394, '$'), '$-1,394');
});

test('fmtVal: "Hours of Work" wins over the "$ per Hour" dollar branch', () => {
  // Order matters in fmtVal — both units contain "Hour".
  assert.equal(fmtVal(46.27, 'Hours of Work'), '46.3 hrs');
  assert.equal(fmtVal(34.5, '$ per Hour'), '$34.50');
});

test('fmtVal: billions and thousands', () => {
  assert.equal(fmtVal(1862.6976, '$ Billions'), '$1,862.7B');
  assert.equal(fmtVal(7432.6, 'Thousands of Jobs'), '7,433');
});

test('fmtVal: index levels and everything else fall through to one decimal', () => {
  assert.equal(fmtVal(105.23, 'Weeks'), '105.2');
  assert.equal(fmtVal(105.25, ''), '105.3');
});

// ── ordinal ─────────────────────────────────────────────────────────────────

test('ordinal: handles the teens, which the naive rule gets wrong', () => {
  const got = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 47, 51, 111, 112].map(ordinal);
  assert.deepEqual(got, [
    '1st', '2nd', '3rd', '4th', '11th', '12th', '13th',
    '21st', '22nd', '23rd', '47th', '51st', '111th', '112th',
  ]);
});

// ── Anchors ─────────────────────────────────────────────────────────────────

test('anchorDate: the 2019 anchor is December 2019, not January 2020', () => {
  // Deliberate: anchoring at 2020 bakes the COVID crash into the baseline.
  // Do not "fix" this to 2020-01-01.
  assert.equal(anchorDate('2019', MONTHLY), '2019-12-01');
});

test('anchorDate: fixed anchors resolve to fixed dates', () => {
  assert.equal(anchorDate('2025', MONTHLY), '2025-01-01');
  assert.equal(anchorDate('2000', MONTHLY), '2000-01-01');
});

test('anchorDate: a custom year anchor resolves to Jan 1 of that year', () => {
  assert.equal(anchorDate('y:2015', MONTHLY), '2015-01-01');
});

test('anchorDate: max uses the first observation, and survives an empty series', () => {
  assert.equal(anchorDate('max', MONTHLY), '2019-11-01');
  assert.equal(anchorDate('max', []), '1900-01-01');
});

test('anchorDate: 1y is one calendar year before today', () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  assert.equal(anchorDate('1y', MONTHLY), d.toISOString().slice(0, 10));
});

test('anchorById: labels every preset, and a custom year gets a "since YYYY" phrase', () => {
  assert.equal(anchorById('2019').phrase, 'since Dec 2019');
  assert.equal(anchorById('y:2015').label, '2015');
  assert.equal(anchorById('y:2015').phrase, 'since 2015');
  for (const a of ANCHORS) assert.equal(anchorById(a.id).id, a.id);
});

test('anchorById: an unrecognized id falls back to a valid anchor', () => {
  // Guards against a hand-edited deep link (#anchor=garbage) rendering a card
  // with no phrase. Note the fallback is Jan 2025 while the page's own default
  // anchor is 2019 — intentional-ish, but pinned here so it can't drift silently.
  const fallback = anchorById('not-an-anchor');
  assert.ok(ANCHORS.includes(fallback));
  assert.equal(fallback.id, '2025');
});

// ── pctChange / valueAt / sliceFrom ─────────────────────────────────────────

test('pctChange: measures from the last reading at or before the anchor', () => {
  assert.equal(pctChange(MONTHLY, '2019-12-01'), 50);            // 100 → 150
  assert.equal(pctChange(MONTHLY, '2020-03-01'), 50);            // clamps back to Dec 2019
  assert.equal(pctChange(MONTHLY, '2025-01-01'), 25);            // 120 → 150
});

test('pctChange: returns null when there is no baseline rather than a bogus number', () => {
  assert.equal(pctChange(MONTHLY, '2010-01-01'), null, 'anchor predates the series');
  assert.equal(pctChange([{ date: '2026-06-01', value: 150 }], '2019-12-01'), null, 'single point');
  assert.equal(pctChange(null, '2019-12-01'), null);
  assert.equal(pctChange(series([['2019-12-01', 0], ['2026-06-01', 150]]), '2019-12-01'), null,
    'a zero baseline would divide by zero');
});

test('valueAt: on-or-before lookup, null before the series starts', () => {
  assert.equal(valueAt(MONTHLY, '2019-12-01'), 100);
  assert.equal(valueAt(MONTHLY, '2024-12-31'), 110);
  assert.equal(valueAt(MONTHLY, '2030-01-01'), 150);
  assert.equal(valueAt(MONTHLY, '2000-01-01'), null);
  assert.equal(valueAt([], '2020-01-01'), null);
});

test('sliceFrom: includes the cutoff date itself', () => {
  assert.deepEqual(sliceFrom(MONTHLY, '2025-01-01').map(d => d.date), ['2025-01-01', '2026-06-01']);
  assert.equal(sliceFrom(MONTHLY, '2030-01-01').length, 0);
});

// ── Real / nominal ──────────────────────────────────────────────────────────

const CPI = series([
  ['2019-12-01', 100],
  ['2024-06-01', 120],
  ['2025-01-01', 125],
  ['2026-06-01', 150],
]);

test('isDeflatable: dollars and index levels yes, rates and counts no', () => {
  assert.equal(isDeflatable({ id: 'eggs', units: '$ per Dozen' }), true);
  assert.equal(isDeflatable({ id: 'groceries', units: 'Index (1982–84 = 100)' }), true);
  assert.equal(isDeflatable({ id: 'unemployment', units: 'Rate (%)' }), false);
  assert.equal(isDeflatable({ id: 'job_openings', units: 'Thousands of Jobs' }), false);
  assert.equal(isDeflatable({ id: 'median_weeks_unemployed', units: 'Weeks' }), false);
  assert.equal(isDeflatable(null), false);
});

test('isDeflatable: series that arrive inflation-adjusted are never deflated again', () => {
  for (const id of ALREADY_REAL_IDS) {
    assert.equal(isDeflatable({ id, units: '$' }), false, `${id} would be double-deflated`);
  }
  assert.equal(isDeflatable({ id: 'state_income', units: '$', already_real: true }), false);
});

test('toReal: the newest point is unchanged and earlier points rise into today\'s dollars', () => {
  const real = toReal(series([['2019-12-01', 100], ['2026-06-01', 150]]), CPI);
  assert.equal(real[1].value, 150);            // latest month is the numeraire
  assert.equal(real[0].value, 100 * 150 / 100); // 2019 dollars → 2026 dollars
});

test('toReal: a month with no CPI print uses the nearest earlier CPI', () => {
  const real = toReal(series([['2024-09-01', 100], ['2026-06-01', 100]]), CPI);
  assert.equal(real[0].value, 100 * 150 / 120, 'should fall back to the Jun 2024 CPI');
});

test('toReal: points older than the CPI history are dropped, not left nominal', () => {
  // Worth knowing: a series that starts before the deflator loses its early
  // points in Real mode rather than silently mixing nominal and real dollars.
  const real = toReal(series([['1999-01-01', 50], ['2026-06-01', 150]]), CPI);
  assert.deepEqual(real.map(d => d.date), ['2026-06-01']);
});

test('toReal: degenerate inputs pass through instead of throwing', () => {
  assert.deepEqual(toReal([], CPI), []);
  assert.deepEqual(toReal(MONTHLY, []), MONTHLY);
  assert.equal(toReal(null, CPI), null);
});

test('seriesForType: nominal is the untouched array; real only touches deflatables', () => {
  const dollars = { id: 'eggs', units: '$ per Dozen', data: MONTHLY };
  const rate = { id: 'unemployment', units: 'Rate (%)', data: MONTHLY };
  assert.equal(seriesForType(dollars, CPI, false), MONTHLY, 'nominal must not copy or alter');
  assert.equal(seriesForType(rate, CPI, true), MONTHLY, 'Real is a no-op on a rate');
  assert.notEqual(seriesForType(dollars, CPI, true), MONTHLY);
  assert.equal(seriesForType(dollars, CPI, true).slice(-1)[0].value, 150);
});

// ── Small math + labels ─────────────────────────────────────────────────────

test('hoursToAfford: rent ÷ wage, null on a zero or missing wage', () => {
  assert.equal(hoursToAfford(1500, 30), 50);
  assert.equal(hoursToAfford(1500, 0), null);
  assert.equal(hoursToAfford(1500, undefined), null);
});

test('scaleByCPI: scales a reference price by the CPI ratio', () => {
  assert.equal(scaleByCPI(CPI, '2026-06-01', 290, '2025-01-01'), 290 * 150 / 125);
  assert.equal(scaleByCPI(CPI, '1999-01-01', 290, '2025-01-01'), null);
});

test('categoryLabel: every real category has a label, unknowns do not crash', () => {
  assert.equal(categoryLabel('labor'), 'Work & Wages');
  assert.equal(categoryLabel('groceries'), 'Groceries');
  assert.equal(typeof categoryLabel('nonsense'), 'string');
});

test('fmtDate: accepts an ISO string or a Chart.js millisecond timestamp', () => {
  assert.equal(fmtDate('2026-06-01'), 'Jun 2026');
  assert.equal(fmtDate(Date.UTC(2026, 5, 15) + 12 * 3600 * 1000), 'Jun 2026');
});

// ── buildFactText — the Copy-fact sentence comms actually pastes ─────────────

const factItem = (over) => Object.assign({
  id: 'eggs', label: 'Eggs', units: '$ per Dozen', category: 'groceries',
  fred_id: 'APU0000708111', data: MONTHLY,
}, over);

test('fact: dollar series read as from→to with both endpoints and the denominator', () => {
  const s = buildFactText(factItem(), { anchorId: '2019' });
  assert.match(s, /^Eggs: \$150\.00 per dozen in Jun 2026, up 50\.0% from \$100\.00 per dozen in Dec 2019/);
  assert.match(s, /Source: FRED series APU0000708111, via the Economic Security Project Affordability Tracker\.$/);
});

test('fact: rate series change in percentage points, never in percent', () => {
  // A fact-checker will flag "unemployment up 12%" as a percent of a percent.
  const s = buildFactText(factItem({
    id: 'unemployment', label: 'Unemployment Rate', units: 'Rate (%)',
    data: series([['2019-12-01', 3.6], ['2026-06-01', 5.1]]),
  }), { anchorId: '2019' });
  assert.match(s, /up 1\.5 percentage points/);
  assert.doesNotMatch(s, /up [\d.]+%/);
});

test('fact: index series quote percent change and never an index level', () => {
  const s = buildFactText(factItem({
    id: 'groceries', label: 'Groceries', units: 'Index (1982–84 = 100)', rebase: true,
    data: series([['2019-12-01', 100], ['2026-06-01', 128.4]]),
  }), { anchorId: '2019' });
  assert.match(s, /^Groceries: up 28\.4% since Dec 2019/);
  assert.doesNotMatch(s, /128\.4/, 'raw index points must not appear in a public fact');
});

test('fact: payroll counts are spoken in millions, not thousands', () => {
  const s = buildFactText(factItem({
    id: 'job_openings', label: 'Job Openings', units: 'Thousands of Jobs',
    data: series([['2019-12-01', 7000], ['2026-06-01', 7432.6]]),
  }), { anchorId: '2019' });
  assert.match(s, /7\.4 million/);
});

test('fact: the anchor being shown is not repeated in the parenthetical', () => {
  const on2019 = buildFactText(factItem(), { anchorId: '2019' });
  assert.match(on2019, /since January 2025/);
  assert.doesNotMatch(on2019, /since December 2019/, 'already the main clause');

  const on2025 = buildFactText(factItem(), { anchorId: '2025' });
  assert.match(on2025, /since December 2019/);
});

test('fact: a flat series says "essentially unchanged" rather than "up 0.0%"', () => {
  const s = buildFactText(factItem({
    data: series([['2019-12-01', 4.0], ['2026-06-01', 4.0]]),
  }), { anchorId: '2019' });
  assert.match(s, /essentially unchanged/);
});

test('fact: an anchor predating the series clamps to the first reading', () => {
  const s = buildFactText(factItem(), { anchorId: '2000' });
  assert.match(s, /from \$90\.00 per dozen in Nov 2019/, 'series starts Nov 2019, not 2000');
});

test('fact: rank text and the real-dollars note are appended when supplied', () => {
  const s = buildFactText(factItem(), { anchorId: '2019', rankText: '3rd highest of 51 states', realYear: 2026 });
  assert.match(s, /inflation-adjusted to 2026 dollars, CPI-U/);
  assert.match(s, / — 3rd highest of 51 states\. Source:/);
});

test('fact: a series with one point still produces a usable sentence', () => {
  const s = buildFactText(factItem({ data: series([['2026-06-01', 4.12]]) }), { anchorId: '2019' });
  assert.match(s, /^Eggs: \$4\.12 per dozen in Jun 2026/);
  assert.match(s, /Source: FRED series/);
});

test('fact: a non-FRED series names its own source instead of saying FRED', () => {
  const s = buildFactText(factItem({ fred_id: undefined, source_note: 'Zillow ZORI' }), { anchorId: '2019' });
  assert.match(s, /Source: Zillow ZORI, via/);
  const s2 = buildFactText(factItem({ fred_id: undefined, source_note: undefined }), { anchorId: '2019' });
  assert.match(s2, /Source: federal data, via/);
});
