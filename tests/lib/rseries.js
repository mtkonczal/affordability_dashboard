// Parse the SERIES declaration out of fetch_data.R.
//
// Why this exists: fetch_data.R is the source of truth for what each national
// card says, but the committed payloads are what the page actually reads. The
// two can drift for months without anything failing — the rest of the suite
// only ever checks the payloads against each other and against index.html.
// That happened: a commit corrected the source metadata for three BLS-only CPI
// series in fetch_data.R and never regenerated data/, so the script and the
// artifacts disagreed until someone read both by hand. source_parity.test.js
// closes that gap, and this is the parser it needs.
//
// This is deliberately NOT a general R parser. It relies on three formatting
// conventions that fetch_data.R has held to throughout, and it throws if they
// stop being true rather than quietly returning a wrong answer:
//
//   1. Each entry opens on its own line as exactly `  list(` (two spaces) and
//      closes as `  ),` or `  )` at the same indent.
//   2. Every field is one `    key = value` line at four spaces. No value spans
//      lines.
//   3. Strings are double-quoted and contain no backslash escapes.
//
// If you reformat SERIES, this parser is the thing that breaks first. That is
// intentional: a loud parse failure is the correct outcome, because a silent one
// would turn the parity test into a test that always passes.

const fs = require('fs');
const { repoPath } = require('./load');

/** Strip a trailing `# comment`, but not a `#` inside a string (e.g. a hex color). */
function stripComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inStr = !inStr;
    else if (c === '#' && !inStr) return line.slice(0, i);
  }
  return line;
}

function parseValue(raw) {
  const t = raw.trim().replace(/,$/, '').trim();
  if (t.startsWith('"')) {
    const end = t.indexOf('"', 1);
    if (end < 0) throw new Error(`rseries: unterminated string in ${JSON.stringify(raw)}`);
    return t.slice(1, end);
  }
  if (t === 'TRUE') return true;
  if (t === 'FALSE') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t; // NULL, a function call, something we don't model — kept as text
}

/** Scan one `NAME <- list(...)` block into plain objects, in declaration order. */
function parseEntries(text) {
  const entries = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = stripComment(raw).replace(/\s+$/, '');
    if (/^ {2}list\($/.test(line)) {
      cur = {};
      entries.push(cur);
      continue;
    }
    if (/^ {2}\),?$/.test(line)) {
      cur = null;
      continue;
    }
    if (!cur) continue;
    const m = line.match(/^ {4}(\w+)\s*=\s*(.+)$/);
    if (m) cur[m[1]] = parseValue(m[2]);
  }
  return entries;
}

/**
 * Every entry of `SERIES <- list(...)` in fetch_data.R, in declaration order,
 * as plain objects of the fields actually written in the file. Fields the entry
 * omits are absent (not null) — the caller needs that distinction, because
 * fetch_data.R drops NULL fields before serializing.
 */
function parseSeries() {
  const src = fs.readFileSync(repoPath('fetch_data.R'), 'utf8');

  const start = src.indexOf('SERIES <- list(');
  if (start < 0) throw new Error('rseries: could not find `SERIES <- list(` in fetch_data.R');
  const end = src.indexOf('STATE_METRICS', start);
  if (end < 0) throw new Error('rseries: could not find STATE_METRICS after SERIES');

  const entries = parseEntries(src.slice(start, end));

  // Guard against a formatting change silently emptying the parse.
  if (entries.length < 20) {
    throw new Error(
      `rseries: parsed only ${entries.length} SERIES entries — the SERIES ` +
      'formatting in fetch_data.R has probably changed. Fix this parser rather ' +
      'than letting source_parity.test.js pass on nothing.'
    );
  }
  const nameless = entries.filter(e => !e.id).length;
  if (nameless) throw new Error(`rseries: ${nameless} parsed entries have no id`);

  return entries;
}

/**
 * Every entry of `STATE_METRICS <- list(...)`, same contract as parseSeries.
 * Added August 2026 with the state rail: the state metrics gained a `category`
 * field, which the state view groups AND colors on, so an edit to it in
 * fetch_data.R that never reaches states_index.js is exactly the silent drift
 * source_parity exists to catch. Values that aren't strings/booleans/numbers
 * (`fred_pattern = function(s) …`, `national_id = NULL`) come back as raw text;
 * no caller needs to model them.
 */
function parseStateMetrics() {
  const src = fs.readFileSync(repoPath('fetch_data.R'), 'utf8');

  const start = src.indexOf('STATE_METRICS <- list(');
  if (start < 0) throw new Error('rseries: could not find `STATE_METRICS <- list(` in fetch_data.R');
  // The list closes with a `)` alone at column 0 — the same convention SERIES
  // uses, and the only one that can't be confused with an entry's `  ),`.
  const end = src.indexOf('\n)\n', start);
  if (end < 0) throw new Error('rseries: could not find the end of STATE_METRICS');

  const entries = parseEntries(src.slice(start, end));

  if (entries.length < 10) {
    throw new Error(
      `rseries: parsed only ${entries.length} STATE_METRICS entries — the ` +
      'formatting in fetch_data.R has probably changed. Fix this parser rather ' +
      'than letting source_parity.test.js pass on nothing.'
    );
  }
  const nameless = entries.filter(e => !e.id).length;
  if (nameless) throw new Error(`rseries: ${nameless} parsed state metrics have no id`);

  return entries;
}

module.exports = { parseSeries, parseStateMetrics, stripComment, parseValue };
