# The sidebar format ("the merge")

How the National metric picker was rebuilt in August 2026, why each decision
went the way it did, and what it would take to put the same thing on the state
tabs. Written as a handoff: read this before touching `MetricPicker`,
`NationalView`, or any category id.

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
`NationalView`, so crossing the breakpoint loses nothing.

A row is: mark (`✓` / `＋`), metric name, change number. Group headers are
clickable bulk toggles. Above the list: a filter field, an "N of 31 on" count,
Select all, Clear.

**The category is the group.** Under the recut, `item.category` decides rail
placement, card render order, and color family simultaneously. There is no
separate id→group mapping that can drift out of sync — this is the single most
important structural fact, and the reason the extension work below is mostly a
data question rather than a UI question.

### Code map

| Where | What |
|---|---|
| `index.html` ~64–150 (`<style>`) | `.at-nat-layout`, `.at-rail`, `.at-natmenu`, `.at-prow*`, `.at-grp`, `.at-pfilter`, `.at-phead`, `.at-plnk`, `.at-pstub`, `.at-menubar`, `.at-menupop` |
| `index.html` ~707 | `CATEGORY_LABELS` + `categoryLabel()` (block one, pure) |
| `index.html` ~899 | `railChangeText()` (block one, pure, unit-tested) |
| `index.html` ~986 | `CATEGORY_META` — the six groups **in render order** |
| `index.html` ~1020 | `ESP_CATEGORY_COLOR` |
| `index.html` ~1034 | `ESP_METRIC_COLOR` — the state view's by-id fallback |
| `index.html` ~1780 | `MetricPicker` |
| `index.html` ~1861 | `NationalView` |
| `fetch_data.R` ~177 | the `category` field docs; `SERIES` entries carry the value |
| `tests/helpers.test.js` | `categoryLabel` + seven `railChangeText` tests |
| `tests/data_contract.test.js`, `tests/source_parity.test.js` | the two `known` category sets |

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
  `CATEGORY_LABELS`, `ESP_CATEGORY_COLOR`, and the `known` set in *both*
  `data_contract.test.js` and `source_parity.test.js`. A series in an unknown
  category vanishes from the National view with no error.
- **Never reorder `SERIES` entries in `fetch_data.R`.** `source_parity.test.js`
  checks SERIES order against payload order; a reshuffle churns every committed
  artifact. Move the section comment instead.
- **`category` is in `VERBATIM`** in `source_parity.test.js`. Editing it in
  `fetch_data.R` without re-running the script fails that suite by design. Fix
  with `Rscript fetch_data.R`, not by editing the test.
- **`ESP_METRIC_COLOR` must stay in step with `ESP_CATEGORY_COLOR`,** or the
  same series changes color when a reader switches tabs.
- **No state price index exists.** Never add or imply one. There is no state
  CPI, which is why `overall` cannot appear on a state tab.

---

## 5. Extending to the state tabs

### What transfers unchanged

`MetricPicker` is already generic over its `groups` prop — it takes
`[{ id, label, items }]` and knows nothing about national data. The CSS is
view-agnostic. `railChangeText` takes any item with `units` and `data`, which
state items already have.

### The blocker: state metrics have no `category`

`states_index.js` metrics carry `id, label, units, color, national_id,
frequency, source_label, source_url, description, invert_color, rebase,
n_states`. No `category`. That is precisely why `ESP_METRIC_COLOR` exists — it's
a by-id fallback standing in for the missing field.

Thirteen of the fourteen have a `national_id`, so the mapping is derivable, but
**it should be an explicit `category` on each `STATE_METRICS` entry in
`fetch_data.R`**, not derived at render time. Deriving it would recreate exactly
the id→group indirection the national recut deleted. Adding the field lets you
**delete `ESP_METRIC_COLOR` entirely**, since `espColorFor` would then resolve
through `ESP_CATEGORY_COLOR` like everything else.

Proposed mapping (14 metrics):

| category | state metrics | n |
|---|---|---|
| `housing` | `rent`, `home_prices`, `rent_hours`, `rent_burden` | 4 |
| `income` | `wages`, `income`, `income_20th`, `unemployment`, `debt_per_capita`, `studentloan_per_capita`, `cc_delinquency_90` | 7 |
| `health` | `aca_benchmark_premium`, `uninsured_rate` | 2 |
| `bills` | `electricity_bill` | 1 |

### The design problem this exposes

**Only four of the six groups exist on a state tab, and the balance is bad.**
`groceries` is empty (no state grocery data) and `overall` is structurally
impossible (no state CPI). `income` holds half the metrics; `bills` holds one.
A rail with a one-item group and a seven-item group is a worse rail than the
national one, and "Bills & getting around" as a heading over a lone electricity
bill reads like a mistake.

This is the real decision to make before writing any code, and it's a judgment
call for Mike, not for whoever picks this up:

1. **Same six groups, empty ones omitted.** Consistent vocabulary across tabs;
   accepts the lopsided rail.
2. **Fold `bills` into another group on state tabs only.** Better-looking rail;
   the same metric now sits under different headings on different tabs.
3. **No grouping on the state tab** — one flat alphabetical list of 14 in the
   rail. Fourteen items don't need six headings, and the flat list is honest
   about how little state data exists.
4. **Don't put a rail on the state tab at all** (see below).

### The prior question: does the state view even need a picker?

**The state view has no metric selection today.** It renders all 14 metrics
unconditionally, alphabetically, plus the annual stat tiles. So a rail there is
not the same job it does on National — on National it selects 7 of 31 from a
list too long to show as cards; on State there are 14 and they all render.

Adding a rail therefore means also deciding whether the state view *becomes*
selectable. That's a product change, not a port. The cheaper reading of "add it
to the state tabs" is that the state view should gain **grouping and the recut
vocabulary** — group headings between runs of cards — without gaining selection
at all. Settle this first; it determines whether `MetricPicker` is involved.

### Suggested sequence

1. Add `category` to the 14 `STATE_METRICS` entries in `fetch_data.R`; add the
   field to whatever `states_index.js` emits. Run `Rscript fetch_data.R`.
   Verify with `node tests/run.js` **before** any UI change, so a data failure
   and a UI failure can't be confused.
2. Delete `ESP_METRIC_COLOR` and let `espColorFor` fall through to
   `ESP_CATEGORY_COLOR`. Confirm no state series changes color.
3. Settle "grouping only, or selection too?" and the four-group balance.
4. Only then touch the view. If it does get a rail: change the state cards grid
   from `minmax(420px, 1fr)` to `minmax(380px, 1fr)` to match National, or the
   two tabs will size cards differently for no reason a reader can see.
5. `CompareView` is a different selection model (1–4 metrics, pinned states) and
   is **out of scope** — don't fold it in opportunistically.

---

## 6. Verifying without a browser

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
