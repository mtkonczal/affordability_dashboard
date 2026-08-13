# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A static, self-contained affordability tracker dashboard with national and
state-level data to read. `fetch_data.R` pulls time series from FRED, the BLS API,
Zillow, the Census API, and (optionally) EIA, and writes static JS payloads
into `data/`; `index.html` renders three views (National / My State / Compare
States) with React + Chart.js loaded from CDNs. There is no build step, no
server, and no JS package manager. `about.html` is a static sources-and-methods
page.

## Common commands

```bash
# Run the test suite (no dependencies; Node 18+). Do this after any data
# refresh and after editing index.html. See tests/README.md.
node tests/run.js

# Refresh all time-series data (national + 51 states; takes several minutes)
Rscript fetch_data.R

# Refresh the KFF ACA benchmark premium + uninsured-rate time series (yearly).
# Writes data/kff/*.csv; then re-run fetch_data.R to fold them in. No API key.
python3 scripts/fetch_kff.py

# Rebuild the annual state indicators AND the NY Fed debt time series from raw
# sources (run yearly, after downloading the new NY Fed area report into
# data/annual/raw/). Writes data/annual/*.csv + data/nyfed/*.csv.
python3 scripts/convert_annual.py

# Refresh the Census ACS series — 20th/80th percentile income (B19080) and
# rent burden (B25070) — yearly, after the September ACS 1-year release.
# Writes data/census/*.csv; needs CENSUS_API_KEY (env or .Renviron).
python3 scripts/fetch_census.py

# View the dashboard (or use the static server in .claude/launch.json)
open index.html
```

Keys read from `.Renviron` / environment: `BLS_KEY` (required — SA CPI
subindexes not on FRED), `CENSUS_API_KEY` (required — county renter weights
for state rents), `EIA_KEY` (optional — state electricity bills; skipped
loudly when absent).

## Tests

`node tests/run.js` — Node's built-in runner, no `package.json`, no npm
install, ~2 seconds. Two suites, described in `tests/README.md`:

- `tests/data_contract.test.js` validates the committed payloads against what
  `index.html` assumes: manifest/payload parity, state `has`-list vs state
  files, date and value sanity, cached `latest_*`/`n_obs`, per-cadence
  staleness, CPI coverage for Real mode, no double-deflation, state-file vs
  metric-file agreement, **recomputed national ranks**, ZORI coverage ≥ 50%,
  `rent_hours` = rent ÷ wages, annual tile CSVs. **Run this after every data
  change** — `.github/workflows/update-data.yml` runs it as a gate before the
  automated commit, so a bad refresh is never published.
- `tests/helpers.test.js` pins the pure logic in index.html's first babel
  block, including the editorial rules in `buildFactText` (percentage points on
  rate series, no index levels in a public fact), the Dec-2019 anchor, the six
  recut category labels, and `railChangeText` — the National picker's row
  number, which follows the live anchor and the Real toggle and so has to obey
  the same pp/index/no-new-data rules the cards do. It also pins the shared
  change rule (`isRateSeries` / `changeIn` / `fmtChange` / `changeSince` /
  `changeBetween`) and guards it at the source: **the component block may not
  call `pctChange`/`pctChangeBetween` directly.** Those return percent, which is
  wrong for a rate — the card badges used them and published "+81.0%" for a
  mortgage rate that rose 3.0 pp, while the picker row beside it said "+3.0 pp".
  Every change the front end prints — card headline, dual badges, %-change view
  (rate series plot a pp difference and label the axis "pp"), heatmap cells and
  cumulative columns — now routes through the shared rule.
- `tests/source_parity.test.js` — **run this after every `SERIES` or
  `STATE_METRICS` edit.** Parses both lists out of `fetch_data.R` (via
  `tests/lib/rseries.js`: `parseSeries`, `parseStateMetrics`) and checks the
  committed payloads actually came from them: same ids in the same order,
  identical verbatim metadata, `rebase` derived from the units string,
  `manifest.json` in step with `app_data.js`, and no `source = "bls"` entry
  advertising a `fred_id` it wasn't fetched from. For state metrics it also pins
  the `category` set the state rail can render. The other suites only compare
  artifacts to each other, so **editing fetch_data.R without re-running it used
  to be invisible** — and a later routine refresh would then silently move a
  published number. Fix a failure with `Rscript fetch_data.R`, not by editing the
  test. If a refresh has to wait, add the field to `KNOWN_STALE` with a reason; a
  companion test fails once an exemption is no longer needed, so they get removed
  rather than accumulating. `rseries.js` depends on both lists keeping their
  current formatting and throws loudly if that changes, since a silent parse of
  zero entries would make the whole suite vacuous.

`tests/lib/load.js` runs each artifact with `new Function('window', src)` plus
a stub `window`/`document` — which works only because every script in this
project assigns onto `window`. **Constraint this adds: the first
`<script type="text/babel">` block in index.html must stay free of JSX and of
module-scope browser APIs.** It is the pure-helpers block (it ends with
`Object.assign(window, {...})`); components belong in the second block. To make
something in block two testable, move it to block one and destructure it from
`window` in block two — that's how `isDeflatable`/`toReal`/`seriesForType`
live there. A test asserts every name destructured from `window` is actually
exported, so a broken seam fails loudly instead of rendering "Loading…".

Nothing renders in the tests — charts, the choropleth, embed mode, deep links
and PNG export are still covered only by the manual pass in `What to Check.md`.

## Architecture

### Data flow

1. `SERIES` in `fetch_data.R` declares national indicators; `STATES` (50 + DC,
   with FIPS codes) × `STATE_METRICS` declares the state system. State FRED
   IDs are generated from patterns (`{ST}UR`, `{ST}STHPI`,
   `MEHOINUS{ST}A672N`, `SMU{fips}000000500000003`).
2. State rents: Zillow county ZORI aggregated with ACS renter-household
   weights (Census API); states under 50% renter coverage are omitted.
3. Annual layers: `data/annual/annual_meta.json` lists yearly *single-value*
   indicators (CCAoA, NY Fed, Urban); their `state,value` CSVs are attached to
   state payloads as stat tiles. Raw sources live in `data/annual/raw/`; see
   `data/annual/README.md`.
3b. Annual long-CSV time series (three dirs, one shape — `date,code,value`,
   `code` = `US`/postal; read by `read_long_dir()` in `fetch_data.R`; entries
   with `source = "kff"|"nyfed"|"census"` + `src_id` in `SERIES` /
   `STATE_METRICS` become national cards + state metrics — full annual time
   series, unlike the single-value tiles above):
   - `data/kff/` — `scripts/fetch_kff.py` (yearly, no key) scrapes the
     `gdocsObject` JSON in two KFF State Health Facts pages: ACA benchmark
     premium (metal-tier) and the uninsured rate.
   - `data/nyfed/` — `scripts/convert_annual.py` extracts every Q4 (2003→)
     from the NY Fed area report xlsx in `data/annual/raw/`: household debt
     per capita, student-loan debt per capita, 90+ credit-card delinquency.
     Q4 points are dated YYYY-12-01 so the Dec-2019 anchor hits Q4 2019. The
     `allUS` row becomes `US` — state metrics get a same-panel national
     overlay (never mix NY Fed states with G.19 national).
   - `data/census/` — `scripts/fetch_census.py` (yearly, needs
     `CENSUS_API_KEY`): 20th/80th percentile household income (B19080
     quintile upper limits — the ACS publishes no other percentiles; don't
     interpolate 25th/75th) and rent burden (B25070 share paying 30%+).
     These SERIES entries are `optional = TRUE`: missing files skip loudly
     without failing the build (the files may not exist before the first
     fetch_census.py run).
3c. Derived metrics, computed inside `fetch_data.R`: `rent_hours` = ZORI rent
   ÷ average hourly earnings, national and per state (`source =
   "derived_rent_hours"`; depends on rent + wages appearing earlier in
   `STATE_METRICS` — keep the order).
3d. Build-time rankings: after the state loop, every state metric gets each
   state's national rank on the latest value (1 = highest, ties.method
   "min") baked into both payload shapes (`rank`, `rank_n`). The front end
   phrases direction; `invert_color` says whether high is good.
4. Outputs, all committed artifacts (re-run the script, don't hand-edit):
   - `data/app_data.js` — national series → `window.AFFORDABILITY_DATA`
   - `data/states_index.js` — state/metric catalog → `window.AFFORDABILITY_STATES`
   - `data/states/{st}.js` — one state, all metrics → `window.STATE_DATA[code]`
     (lazy-loaded by the My State view)
   - `data/state_metrics/{id}.js` — one metric, all states →
     `window.STATE_METRIC[id]` (lazy-loaded by the Compare view)
   - `data/{id}.csv`, `data/state_{id}.csv`, `data/manifest.json`
   - `data/kff/{id}.csv` — source input for the KFF series (from `fetch_kff.py`,
     read by `fetch_data.R`; not generated by it)
5. If anything fails to fetch, the script exits non-zero after trying
   everything, so the GitHub Action skips its commit and the deployed site
   keeps serving the last good data. EIA skipped for a missing key is not a
   failure.

### Front-end (`index.html`, single file, React via Babel-standalone)

- Four views in `AppMain`: `NationalView` (the metric rail/menu, chart cards,
  YoY heatmap), `StateView` (the same rail/menu over one state's metrics, each
  card with a national-rank badge, plus annual stat tiles; "United States" is a
  picker option built from the national payload — no default US overlay),
  `CompareView` (the same rail/menu, any number of metrics as side-by-side
  panels of pinned states, down to zero — clearing every metric shows the same
  "Pick a metric from the list to chart it." empty state as My State; the US
  average is pinnable like any state, not shown by default; defaults to the
  ACA benchmark premium; pinned
  lines are colored from `PIN_COLORS`, a **12-color** list of its own since
  August 2026 — it opens on the same navy/green/gold as `ESP_SERIES` and then
  diverges, and it is not an alias of that palette, which is the *category*
  table and has no meaning past six groups. Colors still cycle past twelve),
  and
  `MapView` (its own tab: the same rail/menu, single-select,
  **levels only** — a Map/Bar-chart toggle where Change/Level used to
  be, plus a year dropdown; within a year each state shows its last reading,
  so monthly/quarterly metrics default to the latest month. The sorted bar
  chart shares the map's sequential ramp (`LEVEL_RAMP`, pale blue → ESP navy
  `#2c3254`, quantile-clamped domain; the warm sand → burnt sienna ramp was
  retired in August 2026 because red carries a bad-news signal this
  direction-neutral scale doesn't mean). The hover card is warm red
  (`MAP_TIP`, the brand red deepened until cream text clears WCAG AA) so it
  reads as an overlay rather than as the darkest step of the ramp. Time series live on the pinned-states
  chart below (§02), which shows levels (default) or %-change and carries
  its own anchor + Nominal/Real + View controls — the global controls bar
  is hidden on this view. Both sections have CSV/PNG export footers: §01's
  CSV is the selected year's per-state snapshot (as shown, so deflated when
  Real is on) and its PNG rasterizes the SVG map or redraws the bar list
  onto the branded card (`downloadCardAsPNG` takes a `chartH` override to
  grow for the 51-row bar list); §02's CSV is the pinned states' full
  nominal series via `downloadCompareCSV`, like the Compare panels. Rebase/index metrics (home prices) are excluded from the map
  picker because index levels aren't comparable across states. Defaults to
  the ACA benchmark premium).
- **The metric picker is "the merge"** (August 2026) — options 6 + 2 + 11 from
  `picker_mockups.html`, which the team picked at the July review. One row
  component (`MetricPicker`) in two containers: a **220px left rail** above
  1060px, and the same rows as a **menu** below it. Both are always rendered;
  CSS decides which is visible, and they share one selection and one filter
  string, so crossing the breakpoint loses nothing. It replaced the collapsible
  category-chip bar, which is gone along with `styles.catPill` / `checkChip` /
  `checkBox`. **All four views use it** — same component, same CSS, same
  breakpoint (My State, then Compare and Map, all 2 Aug 2026; the bespoke metric
  and measure pill bars are gone). `sidebar_format.md` is the full handoff doc.
  - One `mode` prop is the only difference between tabs, because they don't mean
    the same thing by "picked". `multi` (National, My State, **and Compare
    since August 2026**): add and remove freely, down to nothing, group headers
    bulk-toggle, Select all + Clear. Compare used to run its own `keep-one`
    mode — the last metric couldn't be removed, so no Clear (nothing valid to
    clear to) and no Select all (one click opening 14 panels, each lazy-loading
    a 51-state payload, read as broken rather than fast). It was unified with
    `multi`: emptying Compare now shows the same "Pick a metric from the list
    to chart it." empty state as My State, so Clear has somewhere to land and
    Select all's cost is an accepted tradeoff. `single` (Map): rows are radio
    marks `●`/`○` with `role="radio"`, group headings are plain labels, and the
    head is just the filter — `＋` would say "add another" and "1 of 13 on"
    says nothing when only one is ever possible. Collapsed into the menu, Map's
    summary shows the chosen measure's *name*, not a count. A test pins four
    call sites and the one named mode (`single`), so a fifth tab growing its
    own picker, or Compare growing a bespoke one again, fails loudly.
  - **Compare and Map have no state selected**, so their row numbers use the
    **US series** for the metric (`allStatesPickerGroups`), read from the
    already-loaded national payload — the same figure the National rail prints,
    no extra fetch, no cross-tab disagreement. The electricity bill has no
    national counterpart (EIA publishes state bills, not a US average) and reads
    `—`. On Map those numbers follow that tab's own anchor and Real toggle, down
    on the §02 controls, while §01 beside them paints state levels for one year.
  - Map lists 13, not 14: index-level metrics stay out (FHFA levels aren't
    comparable across states), a filter that predates the rail.
  - The rail costs the choropleth ~220px (891px wide at a 1280px viewport). Side
    effect: Map's section head wraps to two lines at 1280 where it used to fit
    on one. Cosmetic.
  - The rail has **no inner scroll, no border and no background of its own** —
    those three things, not the concept, were what made the earlier left-rail
    proposal read as bolted on. It runs long in normal document flow.
  - **No sticky "back to the picker" bar, deliberately.** The ESP page resizes
    the iframe to the tracker's full content height, so the iframe never
    scrolls — the parent page does. `position:fixed` inside it pins to the
    bottom of the whole document, not the reader's screen, and `sticky` has
    nothing to stick against. Such a bar would work only on the standalone page.
    If reaching the picker from deep in the charts proves painful, the
    embed-safe answer is a second picker in normal flow below the cards.
  - Rows carry name + change + a plus/check. **The change follows the global
    anchor and the Nominal/Real toggle** (`railChangeText`, pure, in block one)
    rather than pinning to Dec 2019, so a row and the card it opens can never
    print two different answers. Percentage points on rate series, % only on
    index series, `—` when the anchor lands on the last reading.
  - **Group headers are bulk toggles** (the standing comms request, "let me
    throw groceries in with Big Ticket"), additive, with the hit area on the
    header text rather than the full row.
  - 1060px is the breakpoint: a 220px rail leaves room for two 380px chart
    columns once the page is ~1092px. Between 1060 and 1092 the cards briefly
    fall to one column. Both views' cards are `minmax(380px, 1fr)` (the state
    view moved off 420 with the rail), so they behave identically.
  - **The card grid's hairlines are drawn in CSS, not by index math**
    (`.at-cards-clip` / `.at-cards-grid > .at-card`, August 2026). Every card
    carries a right and bottom rule; the grid is pulled 1px past an
    `overflow: hidden` wrapper so the outermost rules get clipped instead of
    drawn. The grid is `auto-fit`, so it resolves to anywhere from one to four
    columns, and the `i % 2` logic this replaced assumed two: on a wide monitor
    a four-card row lost its rule between the 2nd and 3rd cards, straight down
    the middle, and the last row carried a half-width horizontal rule. Don't
    reintroduce a per-card `borderRight`/`borderBottom` computed from the index.
  - On the state tab: **defaults to every metric on** (that's what the view did
    before it had a picker), selection is keyed on the bare metric id so
    stepping through states with ← → keeps it, and only three groups can appear
    — `groceries` has no state data, `overall` is impossible with no state CPI,
    and `bills` is folded into `housing` in `fetch_data.R` because a heading
    over one lone electricity bill reads like a bug. The state selector bar and
    the annual stat tiles stay full width, outside the rail layout.
  - **One anchor, one observation** (`anchorObsDate`, block one). `anchorDate`
    returns a calendar date; `valueAt` used to land it on the last reading on or
    before, while `sliceFrom` took the first at or after, so a series with
    nothing published in the anchor month got two answers. Quarterly FHFA home
    prices printed a "+55.6% since Dec 2019" headline above a "+56.3% since Dec
    '19" badge on the same card. Everything — rail row, card headline, badges,
    chart window, Compare panels — now resolves through `anchorObsDate` (last
    reading on or before; clamps forward only if the anchor predates the
    series). Every number that moved moved onto the badge's value. Don't call
    `anchorDate` + `sliceFrom` directly for this.
  - **The caption names the reading, not the anchor** (`measuredFromPhrase` /
    `measuredFromPhraseMulti`, block one, August 2026). `anchorObsDate`'s
    forward clamp made the old guard unreachable: it fired on `change == null`,
    the symptom of an *un*clamped miss, so a series starting after the anchor
    got a correct number under a false date. The ACA benchmark premium (first
    reading 2018) read "+29.9% since 2000" on the Since-2000 anchor, above a
    Copy-fact button that correctly said "up 29.9% from $481.00 in 2018" — 11
    national cards, every state card with a short series, the Compare and Map
    §02 PNG range labels and the Map §02 footnote. The rule now tests the
    condition: when the base observation lands **later** than the anchor's
    calendar date, name the observation (`fmtObsDate`, so cadence carries —
    "since 2018", "since Jan 2015"). Two deliberate narrowings: landing
    *earlier* inside the anchor's own period is the badge convention
    `anchorObsDate` exists to enforce (quarterly FHFA on Q4 2019, annual series
    on Jan 2019) and keeps saying "since Dec 2019"; and the comparison is at
    **month** granularity, so gas and the 30-year mortgage — which begin Jan 3
    and Jan 7 2000 — keep a true, readable "since 2000" instead of trading it
    for "since Jan 3, 2000". Multi-line charts (Compare panels, the Map's
    pinned chart) take the earliest line, the plot's actual left edge. Pinned
    on fixtures in `helpers.test.js` and swept across every committed series ×
    anchor in `data_contract.test.js`. Don't caption a chart with a bare
    `anchorById(anchorId).phrase`; `emptyWindowNote` is the one exception, where
    "No data since 2000" is true.
- **Six categories, recut August 2026** — `housing` (Rent & homes), `groceries`
  (Food), `bills` (Bills & getting around), `health` (Health & care), `income`
  (Paychecks & debt), `overall` (Overall inflation). The old `big` / `daily` /
  `labor` / `debt` ids are retired. **Under the recut the category IS the picker
  group**, so `category` decides rail placement and color family — on both tabs:
  `STATE_METRICS` entries carry the same field, with the same six values, of
  which three are reachable on a state tab. It no longer decides **card order**:
  since August 2026 the National and My State grids render newest-added-first
  (see the card-order note under the picker); category order survives only as
  the *initial* layout and as what Select all produces.
  - `CATEGORY_META` order is **editorial, not alphabetical** — biggest household
    line first, headline CPI **last** (readers come for specific items; ending
    on the overall index lets the individual prices add up to it). The
    alphabetical comms rule still holds strictly *within* each group.
  - Color families: housing = navy, groceries = gold, bills = purple,
    health = brick, income = green, overall = olive. Merging `labor` and `debt`
    freed brick, which went to health. `ESP_CATEGORY_COLOR` is now the **only**
    color table: `ESP_METRIC_COLOR`, the by-id map that stood in for the missing
    state `category`, is deleted. It had never actually run — state cards build
    their item id as `il_rent` and set `category: 'state'`, so both lookups
    missed and every state card fell through to the pre-ESP hex in the payload,
    leaving the state tab off-palette. Giving state metrics a real category
    fixed that; don't reintroduce a by-id map (a test fails if you do). The one
    cross-tab difference is state electricity, navy rather than purple, by the
    `bills`→`housing` fold.
  - Adding or renaming a category means four places: `CATEGORY_META`,
    `CATEGORY_LABELS`, `ESP_CATEGORY_COLOR` in index.html, plus the `known` sets
    in **both** `tests/data_contract.test.js` and `tests/source_parity.test.js`.
    A series in an unknown category silently vanishes from the National view;
    those two tests are the guard. Each file has a **second, narrower** `known`
    set for state metrics (`housing`, `health`, `income`) — widening that one is
    a design decision, not a formality. `categoryLabel` falls back to the raw id
    rather than to a plausible-looking group name, so a stranded series looks
    wrong on the card instead of quietly wearing someone else's label.
- The choropleth lazy-loads topojson-client + the full d3 bundle (the
  standalone d3-geo UMD breaks without d3-array/internmap — don't swap it
  in) and the us-atlas `states-10m.json` topology from jsDelivr on first
  open. The topology is raw lon/lat (not pre-projected); USMap projects
  with `geoAlbersUsa().scale(1300).translate([487.5, 305])` (standard
  975×610 layout) and memoizes path strings per topology load. The level
  color scale is d3-free (pre-sampled Lab ramp) so the bar chart renders
  before the map libs load; click pins a state on the overlay chart.
- Global controls: anchor ("Measure from": 1Y / Since Jan 2025 / 2019
  (Dec 2019) / Since 2000 / Max, **defaults to 2019**), a Nominal/Real type
  toggle, and a $-levels vs %-change toggle. Cards can override the anchor
  locally; Nominal/Real and $/% are page-wide only. The whole bar is hidden
  on the Map view (see `MapView` above).
- Nominal/Real: `priceType` in `AppMain` drives everything via `seriesForType()`
  / `toReal()` (deflate by CPI-U all-items = `cpi_all_items`, latest-month
  dollars). `isDeflatable()` gates it — only `$`/`Index`-unit series deflate;
  rates/counts are a no-op and `ALREADY_REAL_IDS` (income, real earnings) are
  never double-deflated. State series use the national CPI-U (no state CPI).
- Every card shows dual badges (change since Jan 2025 and since Dec 2019),
  and has Copy-fact / CSV / PNG buttons.
- **PNG export re-renders Chart.js charts offscreen; it does not photograph the
  on-page canvas** (`chartToExportCanvas`, block one, August 2026). The branded
  card's chart slot is 1280×540 (2.37:1) and a card canvas is ~695×480 (1.45:1),
  so the old straight `drawImage` into the slot stretched every chart ~60% wide,
  by an amount that changed with the reader's window. The offscreen clone keeps
  the live chart's logical **height** (the area-fill gradient is built in
  logical units against the card's own context, so changing the height moves
  where the fade lands) and takes its width from the slot ratio, at a
  `devicePixelRatio` that makes the buffer land on exactly the slot's device
  pixels. `Chart.getChart()` is what distinguishes a chart canvas from the map
  and bar-list canvases, which rasterize themselves at 1280 wide and fall
  through to the source. The final `drawImage` is contain-fit, so nothing can be
  stretched again even on that fallback path. The export's wordmark reads
  **"AFFORDABILITY DASHBOARD"** — see the naming note below.
- **The product is the "Affordability Dashboard"** (renamed from "Affordability
  Tracker", August 2026). Reader-visible copy lives in five places and they have
  to agree: `<title>` in index.html, the Copy-fact string (`buildFactText` — a
  test pins it, since that sentence gets pasted into press releases), the PNG
  export wordmark, about.html's `<title>` + kicker, and the About prose shared
  through `assets/about_content.js`. Lowercase "the tracker" in body copy went
  to "the dashboard" in the same pass; what's left in the repo is comments and
  internal docs. **Two things still say Tracker on purpose:** the ESP page slug
  `economicsecurityproject.org/affordability-data-tracker` and its iframe
  `title="Affordability Tracker"` (both in DEPLOYMENT.md, both owned by whoever
  edits the ESP page), and the four root design-review files
  (`picker_mockups.html`, `response.html`, `final_design_edits_summary.html`,
  `embed_test.html`) — those are dated records of a review, so renaming inside
  them would misreport what the team looked at. The GitHub Pages path is already
  `/affordability_dashboard/`, so no repo rename is needed.
- Deep links via the URL hash: `#view=state&state=IL&anchor=2019&type=real`
  (`view=map&metric=rent` for the map tab; `state=US` is valid).
- Embed mode via the query string (`?embed=1`, composes with any hash): for
  the iframe on the ESP site, which brings its own header. Hides the navy
  topbar and its navy hero, and renders the same masthead (title + subtitle,
  `SITE_TITLE` / `SITE_SUBTITLE`) in the light palette above the view tabs,
  with "Updated …" and an "About the data" link on that row's right.
  Backgrounds are now identical in both modes (see the color note below), and
  `height:100%`/min-heights come off `body`/`#root` so the
  height-postMessage script at the bottom of the page
  (`esp-dashboard-height`, consumed by the ESP parent page — see
  DEPLOYMENT.md) can shrink as well as grow. `embed_test.html` is a local
  stand-in for the ESP parent page (same iframe attributes + height
  listener as DEPLOYMENT.md) — open it to test embed mode without
  deploying. About opens *in-app* in both modes — in embed the iframe must
  never navigate to about.html, which has no height script or embed
  chrome; standalone gets the same behavior for one navigation model. The
  sources & methods content lives in `assets/about_content.js`
  (`window.ABOUT_CONTENT`, a template literal — no backticks/`${` in the
  content), the single source of truth shared by about.html and
  `AboutView`, which lazy-loads it like the data payloads (script tag, no
  fetch, works on file://) and injects it under the scoped `.at-about`
  styles (kept in sync with about.html's own CSS). `AboutView` is a fifth
  view (`view=about`, deep-linkable) with "Back to the tracker" returning
  to the view the reader left; entering/leaving it scrolls the app top
  back into view (scrollIntoView reaches the parent page's scroll
  cross-origin). about.html stays live for direct links/bookmarks; its
  back links carry any incoming hash back to index.html.
- **Color surfaces (August 2026).** `PAPER` `#FFFDF2` is the whole surround —
  page, left rail, menu bars, standalone and embed alike — and `SURFACE`
  `#FFFFFF` is the data panels only: the card grid, the heatmap, the map and
  bar chart, the Compare panels, the annual stat tiles, the About tables. This
  is for the ESP Resources template at
  economicsecurityproject.org/affordability-data-tracker, whose page background
  is `#FFFDF2`. It inverted the old scheme (beige `#f4f2e4` page with cream
  panels, card interiors transparent) and it dropped the embed-only override
  that used to make the page white. `BEIGE` survives only as the heatmap's
  empty-cell tint. about.html carries the same split via `--paper` / `--surface`.
- **Masthead.** `SITE_TITLE` / `SITE_SUBTITLE` render in **both** modes. They
  used to live in the standalone-only navy hero, so the ESP embed — the
  tracker's actual home — showed a bare row of tabs and never named the thing.
  The old kicker ("The Affordability Tracker · YYYY") and headline ("What's
  gotten more expensive.") are gone. Keep these in step with `<title>` and with
  about.html's kicker.
- **`FEEDBACK_EMAIL` is `press@economicsecurityproject.org`** (August 2026; it
  was the `TKTKATESP` placeholder). Two places, both live `mailto:` links: the
  index footer and the corrections note in `assets/about_content.js`, which
  about.html shares. Change them together.
- **Card order is newest-added-first** on National and My State
  (`selAdd`/`selRemove` in block one; each view holds the order array and
  derives its `selectedIds` Set from it, never the reverse). Taxonomy order was
  predictable but invisible: adding a metric inserted its card inside its
  category block, often screens below the fold, and read as nothing happening.
  Taxonomy order still supplies the first paint and Select all, where nothing
  is "most recent". Compare and Map are unaffected.
- **A card whose measure-from window holds fewer than two readings draws a
  blank panel, not a chart** (`emptyWindowNote`, block one). An annual Census
  series measured from Jan 2025 when its last point is 2024 clamps back to that
  one observation, and Chart.js still paints a full y-axis around it, which
  reads as a broken chart rather than as missing data. In % mode the headline
  goes to `—` rather than "+0.0%", which would claim "unchanged" beside a note
  saying there has been no reading.
- Index-unit series (`rebase: true`) always display as cumulative % change,
  never raw index points. The 2019 anchor is Dec 2019 (not 2020 — avoids COVID
  base effects). Don't change these without flagging it.

### Adding indicators

- **National series:** append to `SERIES` in `fetch_data.R`, run the script. Its
  `category` decides which rail group it lands in, where its card renders and
  what color it draws in — pick from the six above. `ESP_CATEGORY_COLOR` in
  index.html overrides the entry's `color` at render time, so the hex there only
  matters for anything reading the payload directly. Don't reorder existing
  `SERIES` entries when recutting categories: `source_parity.test.js` checks
  SERIES order against payload order, so a reshuffle churns every committed
  artifact for no reader benefit. Move the section comment, not the entry.
- **BLS average price (a dollar figure, not an index):** add a
  `source = "bls"` entry with `bls_id = "APU…"` and the same string as
  `fred_id` (the id pattern is `APU` + `0000` for the US city average + the BLS
  item code, e.g. `APU000072610` = electricity per kWh). Prefer these over the
  matching CPI subindex whenever a reader would quote the number: "19.8 cents a
  kilowatt-hour" travels, "the index is at 305.7" does not. Three caveats to
  carry into the series `description`: average prices are **not seasonally
  adjusted**, BLS leaves months unpublished in some series (coffee) and
  restarts others under a new id (butter, 2018), and **there are no state
  average prices** — national and 4-region only, so these can never feed the
  state or map views.
- **State metric:** append to `STATE_METRICS` (a FRED ID pattern or a custom
  source) **with a `category`**, run the script. The front end picks it up from
  `states_index.js`; the category decides its rail group, card order and color,
  and a metric without one vanishes from the state view. Use `housing`, `health`
  or `income` — the only three reachable on a state tab, and the two `known` sets
  in the test suite say so. Don't reorder existing entries: `source_parity`
  checks `STATE_METRICS` order against payload order.
- **Annual indicator (stat tile):** drop a `state,value` CSV in `data/annual/`,
  describe it in `annual_meta.json`, run the script.
- **KFF (or other annual time series):** if a KFF State Health Facts indicator,
  add it to `INDICATORS` in `scripts/fetch_kff.py` (select the column by name)
  and run it; then add `source = "kff"` entries to `SERIES` and/or
  `STATE_METRICS` pointing at the resulting `data/kff/{id}.csv`.

### Notes for editing

- The HTML is hand-written and self-contained; do not introduce a bundler or
  framework unless asked.
- Chart.js is pinned to `4.4.0` via jsDelivr; the date adapter is
  `chartjs-adapter-date-fns@3.0.0`. React 18.3.1 dev builds + Babel standalone
  come from unpkg (known perf trade-off, deliberate for now).
- No state CPI exists. Never add or imply state-level price indexes; the
  About page and state view say this explicitly.
