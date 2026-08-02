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
  fmtVal, fmtDate, inferCadence, fmtObsDate, ordinal, pctChange, pctChangeBetween, valueAt, sliceFrom, hoursToAfford,
  scaleByCPI, categoryLabel, ANCHORS, anchorById, anchorDate, buildFactText,
  isDeflatable, toReal, seriesForType, ALREADY_REAL_IDS, railChangeText,
  isRateSeries, changeIn, fmtChange, changeSince, changeBetween,
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

test('pctChange: an anchor on/after the last reading is "no new data," not 0.0% unchanged', () => {
  // An annual series (e.g. Census ACS) whose latest reading is 2024 has
  // nothing to say about "since Jan 2025" or "the past year" — that's a
  // missing comparison, not a real "unchanged" measurement.
  const ANNUAL = series([['2022-01-01', 100], ['2023-01-01', 105], ['2024-01-01', 110]]);
  assert.equal(pctChange(ANNUAL, '2025-01-01'), null, 'anchor is after the last reading');
  assert.equal(pctChange(ANNUAL, '2024-01-01'), null, 'anchor lands exactly on the last reading');
  assert.equal(pctChange(ANNUAL, '2023-01-01'), (110 - 105) / 105 * 100, 'a real prior reading still works');
});

test('pctChangeBetween: same guard as pctChange, but for two arbitrary cutoffs (used by the heatmap)', () => {
  const ANNUAL = series([['2022-01-01', 100], ['2023-01-01', 105], ['2024-01-01', 110]]);
  assert.equal(pctChangeBetween(ANNUAL, '2022-01-01', '2023-01-01'), 5);
  assert.equal(pctChangeBetween(ANNUAL, '2024-01-01', '2025-01-01'), null,
    'both cutoffs resolve to the same 2024 reading — no new data in between');
  assert.equal(pctChangeBetween(ANNUAL, '2010-01-01', '2023-01-01'), null, 'no reading before the from-date');
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
  // job_openings and median_weeks_unemployed were cut in the July 2026 trim, so
  // no live series carries these units any more. The fixtures stay: the rule
  // under test is "only $ and Index units deflate", and a count/duration series
  // is the case most likely to be added back and silently mis-deflated.
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
  // The six groups of the August 2026 recut. Under the recut the category IS
  // the picker group, so these strings are the rail's group headers as well as
  // the card eyebrows.
  assert.equal(categoryLabel('income'), 'Paychecks & debt');
  assert.equal(categoryLabel('groceries'), 'Food');
  assert.equal(categoryLabel('housing'), 'Rent & homes');
  assert.equal(categoryLabel('bills'), 'Bills & getting around');
  assert.equal(categoryLabel('health'), 'Health & care');
  assert.equal(categoryLabel('overall'), 'Overall inflation');
  // An unrecognized category returns the raw id, deliberately: a stranded
  // series should look wrong on the card rather than quietly wear some other
  // group's name. The `known` sets in the other two suites are the real guard.
  assert.equal(categoryLabel('nonsense'), 'nonsense');
  assert.equal(typeof categoryLabel(undefined), 'string');
});

// ── The National picker's row number ────────────────────────────────────────
// railChangeText is what each row of the rail/menu shows next to a metric name.
// It follows the page anchor and the Nominal/Real toggle rather than pinning to
// Dec 2019, so a row and the card it opens can never print different answers to
// the same question. These pin the editorial rules, which were deliberate calls.

const railItem = (over) => Object.assign({
  id: 'x', units: '$ per Gallon',
  data: [
    { date: '2019-12-01', value: 100 },
    { date: '2024-01-01', value: 120 },
    { date: '2026-06-01', value: 150 },
  ],
}, over);

test('rail row: percent change off the active anchor, not a fixed one', () => {
  const it = railItem();
  assert.equal(railChangeText(it, '2019', 'nominal', null), '+50.0%');   // 100 → 150
  assert.equal(railChangeText(it, 'max', 'nominal', null), '+50.0%');
  // A different anchor must move the number, or the rail and the card diverge.
  assert.equal(railChangeText(it, 'y:2024', 'nominal', null), '+25.0%'); // 120 → 150
});

test('rail row: a falling series gets a real minus sign, not a hyphen', () => {
  const it = railItem({ data: [{ date: '2019-12-01', value: 200 }, { date: '2026-06-01', value: 150 }] });
  assert.equal(railChangeText(it, '2019', 'nominal', null), '−25.0%');
  assert.ok(railChangeText(it, '2019', 'nominal', null).startsWith('−'));
});

test('rail row: rate series move in percentage points, never in percent', () => {
  // "up 12%" on a rate is a percent-of-a-percent that fact-checkers flag.
  const it = railItem({
    units: 'Rate (%)',
    data: [{ date: '2019-12-01', value: 3.5 }, { date: '2026-06-01', value: 6.3 }],
  });
  assert.equal(railChangeText(it, '2019', 'nominal', null), '+2.8 pp');
});

test('rail row: an anchor on the last reading is "—", not a false 0.0%', () => {
  // An annual series with nothing published since isn't "unchanged", it's "no
  // new data since" — and a 0.0% badge would claim the former.
  const it = railItem({ data: [{ date: '2019-12-01', value: 100 }, { date: '2024-01-01', value: 120 }] });
  assert.equal(railChangeText(it, 'y:2024', 'nominal', null), '—');
  assert.equal(railChangeText(railItem({ data: [] }), '2019', 'nominal', null), '—');
  assert.equal(railChangeText(railItem({ data: [{ date: '2026-06-01', value: 9 }] }), '2019', 'nominal', null), '—');
});

test('rail row: an anchor predating the series clamps forward, like the card does', () => {
  const it = railItem({ data: [{ date: '2015-01-01', value: 50 }, { date: '2026-06-01', value: 75 }] });
  assert.equal(railChangeText(it, '2000', 'nominal', null), '+50.0%');
});

test('rail row: Real deflates a dollar series and leaves a rate alone', () => {
  const cpi = [
    { date: '2019-12-01', value: 100 },
    { date: '2026-06-01', value: 125 },
  ];
  const dollars = railItem({
    data: [{ date: '2019-12-01', value: 100 }, { date: '2026-06-01', value: 150 }],
  });
  // Nominal +50%; in 2026 dollars the 2019 reading is 125, so real is +20%.
  assert.equal(railChangeText(dollars, '2019', 'nominal', cpi), '+50.0%');
  assert.equal(railChangeText(dollars, '2019', 'real', cpi), '+20.0%');

  const rate = railItem({
    units: 'Rate (%)',
    data: [{ date: '2019-12-01', value: 3.5 }, { date: '2026-06-01', value: 6.3 }],
  });
  assert.equal(railChangeText(rate, '2019', 'real', cpi), '+2.8 pp');
});

test('rail row: an already-real series is never deflated twice', () => {
  const cpi = [{ date: '2019-12-01', value: 100 }, { date: '2026-06-01', value: 125 }];
  const income = railItem({
    id: 'us_median_income', units: '$', already_real: true,
    data: [{ date: '2019-12-01', value: 100 }, { date: '2026-06-01', value: 150 }],
  });
  assert.equal(railChangeText(income, '2019', 'real', cpi), '+50.0%');
});

// ── The one change rule every surface shares ────────────────────────────────
// A rate series moves in percentage points. Before August 2026 only the picker
// row and the Copy-fact sentence knew that: the card headline, the dual anchor
// badges, the %-change view and the heatmap all ran raw pctChange, so the
// mortgage card printed "+81.0%" for a rate that went 3.68% → 6.66% while the
// row beside it printed "+3.0 pp". These pin the shared rule.

const RATE = { units: 'Rate (%)' };
const DOLLARS = { units: '$ per Dozen' };
const rateSeries = [{ date: '2019-12-01', value: 3.68 }, { date: '2026-06-01', value: 6.66 }];

test('change rule: a rate series is anything whose units carry a %', () => {
  assert.equal(isRateSeries(RATE), true);
  assert.equal(isRateSeries({ units: '% of Renters' }), true);   // rent burden
  assert.equal(isRateSeries(DOLLARS), false);
  assert.equal(isRateSeries({ units: 'Index (1982–84 = 100)' }), false);
  assert.equal(isRateSeries(null), false);
});

test('change rule: rates move in points, everything else in percent', () => {
  assert.equal(changeIn(3.68, 6.66, true).toFixed(1), '3.0');
  assert.equal(changeIn(3.68, 6.66, false).toFixed(1), '81.0');
  // A percent change with no base to divide by is null, not Infinity; a
  // percentage-point change off zero is perfectly well defined.
  assert.equal(changeIn(0, 5, false), null);
  assert.equal(changeIn(0, 5, true), 5);
  assert.equal(changeIn(null, 5, true), null);
  assert.equal(changeIn(3, undefined, false), null);
});

test('change rule: formatting carries the unit and a real minus sign', () => {
  assert.equal(fmtChange(2.98, true), '+3.0 pp');
  assert.equal(fmtChange(-1.04, true), '−1.0 pp');
  assert.equal(fmtChange(81.0, false), '+81.0%');
  assert.equal(fmtChange(-40.3, false), '−40.3%');
});

test('change rule: the card badges and the picker row cannot disagree', () => {
  // The bug this fixes: same series, same anchor, two published answers.
  const item = { ...RATE, data: rateSeries };
  const badge = changeSince(item.data, '2019-12-01', item);
  assert.equal(fmtChange(badge, isRateSeries(item)), '+3.0 pp');
  assert.equal(railChangeText(item, '2019', 'nominal', null), '+3.0 pp');
});

test('change rule: dollar series are untouched by it', () => {
  const item = { ...DOLLARS, data: [{ date: '2019-12-01', value: 1.53 }, { date: '2026-06-01', value: 2.14 }] };
  assert.equal(fmtChange(changeSince(item.data, '2019-12-01', item), false), '+39.9%');
});

test('change rule: changeSince keeps pctChange\'s "no new data" contract', () => {
  // An annual rate with nothing published since the anchor is not "+0.0 pp".
  const item = { ...RATE, data: [{ date: '2019-12-01', value: 9.2 }, { date: '2024-01-01', value: 8.2 }] };
  assert.equal(changeSince(item.data, '2024-01-01', item), null);
  assert.equal(changeSince(item.data, '2025-01-01', item), null);
  assert.equal(changeSince([], '2019-12-01', item), null);
  assert.equal(changeSince([{ date: '2026-06-01', value: 4 }], '2019-12-01', item), null);
});

test('change rule: changeBetween handles the heatmap\'s year-over-year cells', () => {
  const rate = { ...RATE, data: [
    { date: '2023-01-15', value: 3.4 }, { date: '2024-01-15', value: 3.7 }, { date: '2025-01-15', value: 4.1 },
  ] };
  assert.equal(changeBetween(rate.data, '2024-01-15', '2025-01-15', rate).toFixed(1), '0.4');
  const dollars = { ...DOLLARS, data: [
    { date: '2024-01-15', value: 2.00 }, { date: '2025-01-15', value: 2.50 },
  ] };
  assert.equal(changeBetween(dollars.data, '2024-01-15', '2025-01-15', dollars).toFixed(1), '25.0');
});

test('fmtVal: the %-change view labels a rate axis in points, not percent', () => {
  // displayUnits for a rate series in %-change mode. Without the pp branch
  // this hits the '%' branch and stamps a percent sign on a pp figure.
  assert.equal(fmtVal(3.0, 'pp change since Dec 2019'), '3.0 pp');
  assert.equal(fmtVal(-1.4, 'pp change'), '-1.4 pp');
  assert.equal(fmtVal(39.9, '% change since Dec 2019'), '39.9%');
});

test('script blocks: the component block never prints a change without the unit rule', () => {
  // The regression guard for the actual bug: the card reached for pctChange
  // directly, which has no idea the series is a rate. Every change the
  // component block renders must come from changeSince/changeBetween.
  const html = fs.readFileSync(repoPath('index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const componentBlock = blocks[1];
  const calls = [...componentBlock.matchAll(/\bpctChange(Between)?\s*\(/g)];
  assert.deepEqual(calls.map(m => m[0]), [],
    'the component block calls pctChange directly — use changeSince/changeBetween so rate series stay in pp');
});

test('fmtDate: accepts an ISO string or a Chart.js millisecond timestamp', () => {
  assert.equal(fmtDate('2026-06-01'), 'Jun 2026');
  assert.equal(fmtDate(Date.UTC(2026, 5, 15) + 12 * 3600 * 1000), 'Jun 2026');
});

// ── inferCadence / fmtObsDate ────────────────────────────────────────────────

test('inferCadence: buckets by the dominant day-gap, not a hand-set tag', () => {
  const weekly = series([['2026-06-01', 1], ['2026-06-08', 1], ['2026-06-15', 1], ['2026-06-22', 1]]);
  assert.equal(inferCadence(weekly), 'weekly');
  const monthly = series([['2026-01-01', 1], ['2026-02-01', 1], ['2026-03-01', 1], ['2026-04-01', 1]]);
  assert.equal(inferCadence(monthly), 'monthly');
  const quarterly = series([['2025-01-01', 1], ['2025-04-01', 1], ['2025-07-01', 1], ['2025-10-01', 1]]);
  assert.equal(inferCadence(quarterly), 'quarterly');
  const annual = series([['2019-12-01', 1], ['2020-12-01', 1], ['2021-12-01', 1], ['2022-12-01', 1]]);
  assert.equal(inferCadence(annual), 'annual');
});

test('inferCadence: a couple of skipped months does not flip a monthly series to annual', () => {
  // Coffee-style gaps: mostly ~30 days, with one BLS-unpublished stretch.
  const withGaps = series([
    ['2018-01-01', 1], ['2018-02-01', 1], ['2018-03-01', 1],
    ['2018-06-01', 1], ['2018-07-01', 1], ['2018-08-01', 1],
  ]);
  assert.equal(inferCadence(withGaps), 'monthly');
});

test('inferCadence: fewer than two gaps defaults to monthly rather than guessing', () => {
  // One big gap alone can't distinguish "annual series" from "anchor
  // clamped back to a sparse series' first reading" — see the MONTHLY
  // fixture below, whose real gaps span from 30 days to several years.
  assert.equal(inferCadence([{ date: '2019-12-01', value: 1 }, { date: '2026-06-01', value: 1 }]), 'monthly');
  assert.equal(inferCadence([]), 'monthly');
  assert.equal(inferCadence(null), 'monthly');
});

test('fmtObsDate: year-only for annual, full date for weekly, month+year otherwise', () => {
  const annual = series([['2019-12-01', 1], ['2020-12-01', 1], ['2021-12-01', 1]]);
  assert.equal(fmtObsDate('2021-12-01', annual), '2021');
  const weekly = series([['2026-07-06', 1], ['2026-07-13', 1], ['2026-07-20', 1]]);
  assert.equal(fmtObsDate('2026-07-20', weekly), 'Jul 20, 2026');
  assert.equal(fmtObsDate('2026-06-01', MONTHLY), 'Jun 2026');
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

test('fact: a weekly series reads "on" a specific date rather than "in" it', () => {
  const weekly = series([
    ['2019-11-25', 2.47], ['2019-12-02', 2.50], ['2019-12-09', 2.52],
    ['2026-07-13', 3.90], ['2026-07-20', 3.93], ['2026-07-27', 3.95],
  ]);
  const s = buildFactText(factItem({ id: 'gas', label: 'Gasoline', units: '$ per Gallon', fred_id: 'GASREGCOVW', data: weekly }), { anchorId: '2019' });
  assert.match(s, /\$3\.95 per gallon on Jul 27, 2026/);
  assert.match(s, /\$2\.47 per gallon on Nov 25, 2019/);
  assert.doesNotMatch(s, / in Jul| in Nov/);
});

test('fact: a non-FRED series names its own source instead of saying FRED', () => {
  const s = buildFactText(factItem({ fred_id: undefined, source_note: 'Zillow ZORI' }), { anchorId: '2019' });
  assert.match(s, /Source: Zillow ZORI, via/);
  const s2 = buildFactText(factItem({ fred_id: undefined, source_note: undefined }), { anchorId: '2019' });
  assert.match(s2, /Source: federal data, via/);
});
