# tests/

```bash
node tests/run.js            # everything
node --test tests/data_contract.test.js
node --test tests/helpers.test.js
node --test tests/source_parity.test.js
```

No dependencies, no build step, no `package.json`. Node 18+ and the repo as it
sits. A full run takes a couple of seconds.

## What's here

**`data_contract.test.js` — run this after every data change.** It loads
`data/app_data.js`, `data/states_index.js`, all 51 `data/states/*.js` and all 14
`data/state_metrics/*.js` and checks the things `index.html` assumes but never
verifies:

- manifest and payloads list the same series; every series has the fields the
  front end reads; every `category` is one `CATEGORY_META` can render
- dates are real, sorted, unduplicated; values are finite; cached
  `latest_value` / `latest_date` / `n_obs` match the series they summarize
- nothing has gone stale relative to its own inferred release cadence
  (monthly ≤ 3 months back, quarterly ≤ 9, annual ≤ 36 — generous enough that a
  normal release lag doesn't trip it, tight enough to catch a stalled fetch)
- Real mode holds together: the CPI deflator exists, is monthly, and keeps up
  with the series it deflates; already-real series never deflate twice; rates
  and counts are a no-op
- state files and compare-view files agree; `n_states` matches reality; **the
  baked-in national ranks are recomputed and checked** (they're built once in
  `fetch_data.R` and just printed by the UI, so a wrong rank is invisible)
- ZORI rent coverage never drops below the 50% renter-household rule
- `rent_hours` really equals rent ÷ wages (it depends on ordering inside
  `STATE_METRICS`)
- annual stat-tile CSVs exist and their attached values are numbers

**`source_parity.test.js` — run this after every change to `SERIES`.** It parses
the `SERIES` list straight out of `fetch_data.R` and checks that the committed
payloads actually came from it: same ids in the same order, and identical
`label` / `subtitle` / `category` / `units` / `description` / `color` /
`fred_id` / `source_url` / `source_note` / `is_new` / `invert_color` /
`overlay_only`, plus `rebase` derived from the units string rather than set by
hand. It also checks `manifest.json` against `app_data.js`, and that a
`source = "bls"` entry doesn't advertise a `fred_id` it wasn't fetched from.

This exists because the other two suites only compare the artifacts to each
other, so **editing `fetch_data.R` without re-running it was invisible.** That
really happened: commit `7058dad` fixed the source metadata for three BLS-only
CPI series and never regenerated `data/`, and the repo carried two different
answers for months. The nasty part isn't the stale metadata — it's that the next
routine refresh silently applies the pending edit and moves a published number
for reasons unconnected to that day's commit. `groceries` was one field away from
shifting ~7% with no visible cause.

If it fails, the fix is normally `Rscript fetch_data.R`, not a test edit. When a
refresh genuinely has to wait, add the field to `KNOWN_STALE` with a comment
saying why — and note that a further test **fails once an exemption stops being
necessary**, so exemptions get deleted after a refresh instead of piling up and
hiding the next real regression.

The R parsing lives in `lib/rseries.js`. It is not a general R parser: it relies
on `SERIES` keeping its current formatting (one `  list(` per entry, one
`    key = value` per line, no multi-line strings) and **throws** if that stops
holding, because a parser that silently returns nothing would turn this suite
into one that always passes.

**`helpers.test.js`** pins the pure logic in `index.html`'s first
`<script type="text/babel">` block: `fmtVal`, `ordinal`, the anchor resolution
(including **the Dec-2019 anchor**, which is a deliberate choice — see the
comment), `pctChange` / `valueAt` / `sliceFrom` boundary behavior, the
Nominal/Real transform, and `buildFactText` — the Copy-fact sentence comms
pastes into press releases, where the editorial rules are enforced: rate series
change in *percentage points*, index series quote percent change and never an
index level, payroll counts are spoken in millions.

## How it works

`tests/lib/load.js` runs each artifact with `new Function('window', src)` and a
stub `window`/`document`, then reads what got assigned. That works because
everything this project ships is a plain script that assigns onto `window` —
including the helper block, which ends with an `Object.assign(window, {...})`.
No bundler, no JSX transform, no browser.

**The one rule this depends on:** the *first* `<script type="text/babel">` block
in `index.html` stays free of JSX and of browser APIs at module scope. It's the
pure-helpers block; components live in the second. If a test suddenly dies with
a `SyntaxError` or `document is not defined`, something JSX-flavored moved into
block one — move it back, or export it from block one and destructure it in
block two (that's how `toReal` and friends got here).

## Adding tests

A new national series or state metric needs no new test — the contract tests
sweep whatever is in the payloads. Write a new test when you add a *rule*:
a new units string that formats specially, a new derived metric, a new
editorial constraint on the fact sentence.

## Not covered

Nothing renders here. Chart drawing, the choropleth projection, the map's
color ramp, embed mode, deep links, and the PNG exports are all untested —
they'd need a headless browser (Playwright), which would mean the repo's first
npm dependency. `What to Check.md` is still the visual pass for those.
