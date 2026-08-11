# The sidebar format ("the merge")

How the National metric picker was rebuilt in August 2026, why each decision
went the way it did, and how it then became the metric control on every tab.
Written as a handoff: read this before touching `MetricPicker`, any of the four
views that render it, or any category id.

**Status:** the extension proposed in §5 shipped on 2 August 2026, first to My
State and then to Compare States and Map. **All four tabs now use one
`MetricPicker`.** §5 records what was built and which open questions were
settled how; §6 covers the two all-states tabs, where "picked" means something
different and the component grew a `mode`.

Origin: `picker_mockups.html`, options **6 + 2 + 11**, which the team chose at
the July 2026 review. Open the "The merge · 6 + 2 + 11" tab in that file to see
the prototype the team actually approved. What shipped differs from it in three
places, all listed under [Deviations](#deviations-from-the-mockup) — do not
"fix" those back toward the mockup without reading why.

---

## 1. What shipped

**One row component, two containers.** `MetricPicker` renders the same list of
rows into either a **220px left rail** (≥1060px) or a **menu** behind an
"Add a metric ▾" button (<1060px). Both are always in the DOM; CSS decides
which is visible. They share one selection Set and one filter string, held by
the view, so crossing the breakpoint loses nothing.

A row is: mark (`✓` / `＋`), metric name, change number. Group headers are
clickable bulk toggles. Above the list: a filter field, an "N of 31 on" count,
Select all, Clear. That is the National configuration; §6 has the table of what
each tab varies.

**The category is the group.** Under the recut, `item.category` decides rail
placement, card render order, and color family simultaneously. There is no
separate id→group mapping that can drift out of sync — this is the single most
important structural fact, and the reason the extension work below is mostly a
data question rather than a UI question.

### Code map

| Where | What |
|---|---|
| `index.html` ~64–150 (`<style>`) | `.at-nat-layout`, `.at-rail`, `.at-natmenu`, `.at-prow*`, `.at-grp`, `.at-pfilter`, `.at-phead`, `.at-plnk`, `.at-pstub`, `.at-menubar`, `.at-menupop` — shared by both tabs |
| `index.html` ~692 | `anchorObsDate()` — one anchor, one observation (block one, unit-tested) |
| `index.html` ~750 | `CATEGORY_LABELS` + `categoryLabel()` (block one, pure) |
| `index.html` ~987 | `railChangeText()` (block one, pure, unit-tested) |
| `index.html` ~1068 | `CATEGORY_META` — the six groups **in render order** |
| `index.html` ~1094 | `allStatesPickerGroups()` — the rail's rows for Compare and Map, change numbers off the US series |
| `index.html` ~1139 | `ESP_CATEGORY_COLOR` — the only color table; `ESP_METRIC_COLOR` is gone |
| `index.html` ~1929 | `MetricPicker` — one component, all four tabs; `mode` is the only difference |
| `index.html` ~2032 | `NationalView` (`mode` default, `multi`) |
| `index.html` ~2196 | `StateView` (`multi`) |
| `index.html` ~3084 | `CompareView` (`multi`, since late Aug 2026 — was `keep-one`) |
| `index.html` ~3260 | `MapView` (`single`) |
| `fetch_data.R` ~177 | the `category` field docs; `SERIES` entries carry the value |
| `fetch_data.R` ~791 | the `STATE_METRICS` header: `category` on state metrics, and why `bills` is folded |
| `tests/helpers.test.js` | `categoryLabel`, the `railChangeText` tests, `anchorObsDate` |
| `tests/lib/rseries.js` | `parseSeries` + `parseStateMetrics` |
| `tests/data_contract.test.js`, `tests/source_parity.test.js` | the `known` category sets — **four of them now**, national and state in each file |

### The six categories

Order is **editorial, not alphabetical**, and is defined solely by the order of
`CATEGORY_META`.

| id | label | color | n |
|---|---|---|---|
| `housing` | Rent & homes | navy `#2c3254` | 5 |
| `groceries` | Food | gold `#ebc382` | 8 |
| `bills` | Bills & getting around | purple `#472b51` | 7 |
| `health` | Health & care | brick `#b0645f` | 3 |
| `income` | Paychecks & debt | green `#70ad8f` | 7 |
| `overall` | Overall inflation | olive `#7f8c53` | 1 |

Retired: `big`, `daily`, `labor`, `debt`.

---

## 2. Decisions, and why

Each of these was argued and settled. If you want to reverse one, reverse it
deliberately — don't let it drift.

**Group order is editorial, headline CPI last.** The old comms rule was that
categories sort alphabetically. That rule was a proxy for "don't let ordering
imply a ranking we can't defend," and that risk lives at the *metric* level,
where a reader compares coffee to ground beef. Metrics remain strictly
alphabetical inside every group. Groups run biggest-household-line-first, with
Overall inflation **last**: readers come for specific items, and ending on the
overall index lets the individual prices add up to it rather than trailing it.

**The recut went into the data, not into a display map.** The alternative was a
`NATIONAL_GROUPS` constant in `index.html` leaving `category` alone. Rejected
because it would have left the rail saying "Rent & homes" while the card inside
it said "BIG-TICKET" in its eyebrow and painted navy next to car insurance.

**Category ids were renamed, not just relabelled.** An id called `big` holding
mortgages while cars sat in `daily` is a trap for the next person. The churn is
mechanical and every site of it is enumerated by the tests.

**Row numbers follow the anchor and the Real toggle.** The mockup pinned them to
Dec 2019 nominal. Changed because this is a fact-checking surface: if the toggle
says Real and the card reads one way while the rail beside it reads another, the
page has published two different answers to the same question on one screen —
and the rail is the easier one to misread, having no chart or date beside it.
The cost is that under the **Max** anchor every series measures from its own
first observation, so the column isn't internally comparable. Accepted: the
cards already have that property, and Max is inherently per-series.

**Group headers are bulk toggles.** Carried over from the chip picker; CLAUDE.md
records it as a comms request in those words ("let me throw groceries in with
Big Ticket"). The mockup's headers were inert `<p>` elements, which would have
silently deleted a documented request under cover of a redesign. Hit area is the
header text, not the full row, so a near-miss lands on nothing.

**The rail has no inner scroll, no border, and no background of its own.** Those
three things — not the left-rail concept — were what made the earlier proposal
read as bolted on. The rail runs long in normal document flow and the page
scrolls as one document.

**1060px breakpoint, 220px rail, cards at `minmax(380px, 1fr)`.** Chart column =
page − 112px (`.at-pad`) − 220px. Two 380px columns need 760px, so the rail pays
for itself from ~1092px. Known wart: between 1060 and 1092 the cards fall to one
column while the grid's `i % 2` border logic still assumes two, leaving a stray
right-hand hairline. Pre-existing logic, newly reachable above 960px.

---

## 3. Deviations from the mockup

**No sticky "back to the picker" bar.** This is the one that will look like an
omission. The ESP page resizes the iframe to the tracker's full content height
(`esp-dashboard-height`, see DEPLOYMENT.md), so **the iframe never scrolls — the
parent page does**. Inside it, `position: fixed` pins to the bottom of the whole
document rather than the reader's screen, and `sticky` has nothing to stick
against. The mockup's bar and its `IntersectionObserver` are silently inert in
embed, which is the only deployment the public sees. Building it would mean the
team reviews behavior the audience never gets.

If reaching the picker from deep in the charts turns out to hurt, the
embed-safe answer is **a second picker in normal document flow below the
cards** — not a floating anything. Any future viewport-relative UI in this
project is subject to the same constraint.

**No "See all the numbers" table.** The mockup's sortable modal (option 11 in
full) was cut on request.

**Filter field kept.** Nobody asked for it; it's the only fast path to a
specific metric now that the table is gone. It filters the list only — charts on
screen are never touched and the selection is never cleared.

---

## 4. Invariants

Things that will break quietly if violated.

- **The first `<script type="text/babel">` block must stay free of JSX** and of
  module-scope browser APIs. `tests/lib/load.js` runs it with `new Function`.
  `railChangeText` lives there for exactly this reason. Components go in block
  two.
- **A name destructured from `window` in block two must be exported in block
  one.** A test enforces this; a miss renders "Loading…" forever.
- **A new or renamed category needs five edits:** `CATEGORY_META`,
  `CATEGORY_LABELS`, `ESP_CATEGORY_COLOR`, and the *national* `known` set in
  both `data_contract.test.js` and `source_parity.test.js`. A series in an
  unknown category vanishes from the National view with no error. A category
  reaching a **state** metric needs the two state `known` sets as well — those
  are deliberately narrower (`housing`, `health`, `income`), so widening one is
  a decision, not a formality.
- **Never reorder `SERIES` entries in `fetch_data.R`.** `source_parity.test.js`
  checks SERIES order against payload order; a reshuffle churns every committed
  artifact. Move the section comment instead. The same now holds for
  `STATE_METRICS`.
- **`category` is in `VERBATIM`** in `source_parity.test.js`, for both `SERIES`
  and `STATE_METRICS`. Editing it in `fetch_data.R` without re-running the
  script fails that suite by design. Fix with `Rscript fetch_data.R`, not by
  editing the test.
- **Color comes from `category` alone.** `ESP_CATEGORY_COLOR` is the only table;
  don't add a by-id map beside it (a test fails if `ESP_METRIC_COLOR` returns).
  The one place the two tabs differ is state electricity, navy by the fold.
- **One anchor, one observation.** Anything that needs the reading an anchor
  refers to calls `anchorObsDate`, never `anchorDate` + `sliceFrom` directly.
  Bypassing it is how the same card came to publish +55.6% and +56.3% for the
  same question (§5).
- **No state price index exists.** Never add or imply one. There is no state
  CPI, which is why `overall` cannot appear on a state tab.

---

## 5. The state tabs (shipped 2 August 2026)

`StateView` now renders the same `MetricPicker` in the same two containers, and
crosses the 1060px breakpoint identically. `MetricPicker` needed **no changes**:
it was already generic over `[{ id, label, items }]`, and the CSS was already
view-agnostic.

### What was decided

| Question | Decision |
|---|---|
| Grouping only, or selection too? | **Full rail + selection.** The state view is now selectable. |
| Group balance | **`bills` folded into `housing`,** in the data. Three groups: housing 5, income 7, health 2. |
| `category` on state metrics | **Explicit field on each `STATE_METRICS` entry,** not derived at render time. |
| `ESP_METRIC_COLOR` | **Deleted.** |
| Default selection | **All metrics on** — what the view did before it had a picker. |
| `CompareView` | Untouched in this pass. Picked up straight after — see §6. |

### Three differences from National, all deliberate

- **Defaults to every metric on.** Before the rail, the state view rendered all
  14 unconditionally, so a reader who never touches the rail sees exactly what
  shipped before; the rail only adds the ability to cut down. National defaults
  to 7 of 31 because 31 cards is not a page.
- **Selection is keyed on the bare metric id** (`rent`), not the per-state card
  id (`il_rent`), so stepping through states with ← → keeps it. A metric the next
  state lacks is simply absent from the list. "Select all" covers the whole
  catalog rather than the current state's subset, so it can't quietly drop a
  metric the next state does publish; the *count* ("14 of 14 on") is over what
  the state on screen actually has.
- **Three groups, not six.** `groceries` has no state data and `overall` is
  impossible (no state CPI). `bills` was folded into `housing` **in
  `fetch_data.R`**, not at render time — see below.

### The fold is in the data, on purpose

A rail heading reading "Bills & getting around" over one lone electricity bill
reads like a bug, so state `electricity_bill` carries `category = "housing"`.
The alternative — leave it in `bills` and merge the groups only in the rail —
was rejected for the same reason the national recut went into the data: the card
would then sit in the housing run wearing a "Bills & getting around" eyebrow and
painting purple. Under the recut the category *is* the group, so a display-time
merge cannot be consistent.

**Consequence to know about:** the state electricity card draws navy while the
national electricity card draws purple. Accepted. They are different series
anyway (EIA's average monthly bill vs the national CPI/APU price), and it is a
home bill.

### `ESP_METRIC_COLOR` was deleted, and it had never run

Worth knowing, because the old §5 described it as "the state view's by-id
fallback" and it wasn't: state cards build their item id as `il_rent`, not
`rent`, and set `category: 'state'`, so **both** lookups in `espColorFor` missed
and every state card fell through to the pre-ESP hex still sitting in the
payload. The state tab was off-palette for its whole life — indigo home prices,
teal electricity, rose debt. Giving state metrics a real `category` is what put
it on the ESP palette; 13 of the 14 landed on exactly the hex
`ESP_METRIC_COLOR` had been trying to give them, and electricity is navy rather
than purple because of the fold.

Two tests guard the seam now: `states: every metric carries a category the state
rail can render` and `states: no metric relies on a by-id color map that no
longer exists` (which also fails if anyone reintroduces the map).

### The anchor bug this surfaced

Putting a rail next to the state cards exposed a real defect, fixed in the same
change. `anchorDate` returns a calendar date, but a series only publishes on its
own schedule, and the two helpers that landed that date on a reading went in
opposite directions:

- `valueAt` (the badges, Copy fact) → the last reading **on or before** it.
- `sliceFrom` (the chart window, and so the baseline of every cumulative
  %-change number) → the first reading **at or after** it.

Every monthly series publishes in December 2019, so nothing turned on it. FHFA
home prices are quarterly: the Illinois card printed a **+55.6%** headline
captioned "since Dec 2019" directly above its own badge reading **+56.3% since
Dec '19**. One card, one question, two published answers — and the headline's
was measured from Q1 2020, which is mislabelled and, on the Pre-COVID anchor
specifically, not pre-COVID.

`anchorObsDate(data, anchorId)` (block one, unit-tested) is now the single
resolution every surface uses: the last reading on or before the anchor,
clamping forward only when the anchor predates the series. Call sites:
`railChangeText`, `ChartCard`, `CompareChart`.

**What moved.** Every number that changed moved onto the value the same card's
badge was already publishing. In the default view ($ levels, Pre-COVID) the only
headline that changed is state Home Prices, 55.6% → 56.3%. The rest are in the
%-change view and under the **1 Year** anchor, which is dated from *today* and
so never lands on a monthly observation — "1 Year" was quietly measuring 11
months and now measures 12. Two families of previously-wrong numbers also got
fixed: annual series under the Pre-COVID anchor in %-change view were measuring
from 2020 or 2021 rather than 2019 (national `income_20th` read +19.5% where its
badge said +24.7%), and annual series under the 1 Year anchor were resolving to
their own last reading and printing "+0.0%".

If this ever needs reverting it is one helper and three call sites.

### Still true, still worth not breaking

- The state cards grid moved from `minmax(420px, 1fr)` to `minmax(380px, 1fr)`
  to match National. The 1060–1092px hairline wart in §2 now applies to both
  tabs equally.
- The annual stat tiles stayed **outside** the rail layout, full width, the way
  National's heatmap does.
- `source_parity.test.js` now parses `STATE_METRICS` too
  (`rseries.parseStateMetrics`) and checks the committed catalog against it —
  metadata verbatim, order, and the category set. Before this, editing a state
  metric in `fetch_data.R` without re-running the script was invisible.

---

## 6. Compare States and Map (shipped 2 August 2026)

Both tabs lost their bespoke pill bars and took the rail. The row, the CSS and
the two containers are byte-identical across all four tabs; what varies is one
`mode` prop, because the four views don't mean the same thing by "picked".

| mode | tabs | rows | group headers | head |
|---|---|---|---|---|
| `multi` | National, My State, Compare States | `✓` / `＋` | bulk toggle | count · Select all · Clear |
| `single` | Map | `●` / `○` | plain labels | filter only |

> **Update, August 2026 (later same month):** Compare's `keep-one` mode
> (below, kept for the record) was unified into `multi`. Emptying Compare all
> the way to zero panels now shows the same "Pick a metric from the list to
> chart it." empty state My State already had, so Clear has somewhere valid
> to land and Select all is just the same affordance every other tab gives —
> the 14-panel/51-state-payload cost that motivated leaving it out is now an
> accepted tradeoff rather than a hard no. The group-toggle guard described
> below (no-op when a group holds everything selected) is gone too; removing
> such a group now empties the view like it does everywhere else.

### Why each mode differed (historical: `keep-one`, retired)

**`keep-one` (Compare, as shipped 2 Aug 2026).** A Compare tab with no panels
has nothing to show, so the last metric couldn't be removed — that was already
true of the pill bar. Two consequences: **Clear was absent**, since there was
no valid empty state to clear to, and **Select all was absent**, because one
click would open all 14 panels, each lazy-loading a 51-state payload and
drawing a chart. (Fourteen was still reachable, at fourteen deliberate clicks,
exactly as it was with pills.) Group headers stayed — they cap at seven, and
bulk-toggling is the documented comms request. The group toggle was
**guarded**: removing a group that held everything currently selected was a
no-op rather than an empty view.

**`single` (Map).** The choropleth paints one measure at a time. Clicking a row
switches; clicking the selected row does nothing. `＋` would have said "add
another", which this tab cannot do, so rows use radio marks and carry
`role="radio"` inside a `role="radiogroup"` list. Group headings are plain
labels for the same reason: a hover highlight on a heading that can't bulk-toggle
promises a click that does nothing. The head is just the filter — "1 of 13 on"
says nothing when only 1 is ever possible. Collapsed into the menu, the summary
beside the button shows **the chosen measure's name** rather than a count, which
is the one thing a reader needs when the list is hidden.

Map lists **13**, not 14: index-level metrics (home prices) stay out, because
FHFA levels aren't comparable across states. That filter already existed and the
rail inherits it.

### The row number on a tab with no state selected

Neither tab has a state, so there is no state series for the row to describe.
Both use the **US series** for the metric — the same figure the National rail
prints, read from the already-loaded national payload, so there is no extra
fetch and the two tabs can't contradict National. `allStatesPickerGroups` builds
this. The electricity bill has no national counterpart (EIA publishes state
bills, not a US average) and its row reads `—` rather than inventing one.

On Map the numbers follow **that tab's own** anchor and Nominal/Real toggle,
which live on the §02 chart controls rather than the global bar (hidden on Map).
So a row describes change over time in the US series while §01 beside it paints
state levels for a single year. Two different questions, correctly labelled, but
worth knowing before reading a row as if it described the map.

### Layout note

The rail sits beside the map, as on every other tab, which costs the choropleth
about 220px: 891px wide at a 1280px viewport, down from ~1111. The SVG scales
cleanly. One visible side effect of the narrower column is that Map's section
head (title · source · Map/Bar toggle · year) now wraps to two lines at 1280px
where it used to fit on one. Cosmetic, and it unwraps on wider screens.

---

## 7. Verifying without a browser

There's no test that renders anything, so these two checks are worth keeping.
They caught real problems during the original build.

**Compile all Babel blocks** — a JSX syntax error otherwise shows up as a blank
page:

```bash
npm install --prefix /tmp @babel/standalone react@18.3.1 react-dom@18.3.1 --silent

node -e '
const fs=require("fs"), B=require("/tmp/node_modules/@babel/standalone");
const s=fs.readFileSync("index.html","utf8");
const re=/<script type="text\/babel" data-presets="react">([\s\S]*?)<\/script>/g;
let m,i=0,bad=0;
while((m=re.exec(s))){i++; try{B.transform(m[1],{presets:["react"]})}
  catch(e){bad++; console.log("block "+i+": "+e.message.split("\n")[0])}}
console.log(bad?"SYNTAX ERRORS":"all "+i+" blocks compile");'
```

**Render `AppMain` server-side** and assert on the HTML. Stub
`document.documentElement.classList.contains` to return `true` for `"embed"` to
check embed mode. Effects don't run, so charts stay uninitialised — but row
counts, group order, selected state, and card eyebrows are all assertable. See
the harness pattern: load `data/app_data.js` and `data/states_index.js` onto a
`window` stub, run block one raw, run block two through Babel, then
`renderToStaticMarkup(createElement(window.AppMain, { data: window.AFFORDABILITY_DATA }))`.

**Confirm a refresh moved only what you intended.** The payloads are one-line
files, so `git diff` is useless. Load the old and new versions and walk them:
after the recut this reported exactly `category` (25) and `last_updated` (34),
with zero series-value changes — which is what proves a metadata edit didn't
quietly move a published number.

Manual pass: `What to Check.md` items 9–15, and `embed_test.html` widened to the
real ESP column width. The breakpoint switch, hover states, filter behavior and
the rail inside the actual iframe have never been machine-verified.
