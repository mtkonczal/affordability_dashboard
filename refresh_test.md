# Refresh & verify runbook

**For:** an agent running this from the command line with repo access and the API
keys present.
**Written:** July 28, 2026, immediately after the second national trim.
**Goal:** run a real `Rscript fetch_data.R` and decide whether the result is
safe to commit.

This refresh is not routine. Two things make it different from a monthly data
pull:

1. Five series were added or converted in the trim (`electricity`,
   `utility_gas`, `coffee`, `bacon`, `butter`) whose `SERIES` entries have
   **never been executed** — the payloads were built by a side script because R
   and the API keys weren't available. This run is the first real test of that
   wiring.
2. Three series have metadata in `fetch_data.R` that disagrees with the
   committed payloads (see §1). This refresh will resolve that disagreement by
   overwriting the payloads — including, for `groceries`, **changing which
   series the card shows**. That needs a human decision first.

---

## 0. STOP — get a decision before running anything

**Do not run the refresh until the `groceries` question below is answered.** The
refresh will change a published number either way, and the point of asking first
is that afterwards you can't tell an intended change from a regression.

`data/app_data.js` currently has `groceries.fred_id = "CPIFABSL"`, and the
committed data matches CPIFABSL exactly. **CPIFABSL is "CPI: Food and
Beverages"** — food at home *plus restaurant meals plus alcoholic beverages*.

`fetch_data.R:262` declares `fred_id = "CUSR0000SAF11"`, which is **"CPI: Food
at Home"** — actual groceries. The card's label and subtitle already say "Food
at Home CPI (All Groceries)".

So the current card is mislabeled, and this refresh silently fixes it by moving
the line. Magnitudes:

| | June 2026 level | Change since June 2020 |
|---|---|---|
| CPIFABSL (what's published now) | 346.391 | +28.9% |
| CUSR0000SAF11 (what the script says) | ~321.4 | +26.2% |
| **Effect of the refresh** | **−7%** | **−2.7pp** |

Ask the repo owner which they want, and record the answer in the report:

- **(a) Food at Home** — the label is already right, so change nothing in the
  script; expect the groceries line to drop ~7% and treat that as the intended
  fix. This is the option consistent with the card sitting above eight
  grocery-item cards.
- **(b) Food and Beverages** — then `fetch_data.R:262` must be changed back to
  `CPIFABSL` **and** the card's `label`/`subtitle` fixed to stop claiming food at
  home. Do not leave the label as-is.

If you cannot reach anyone, stop and report. Do not guess.

---

## 1. What this refresh is expected to change

Anything in this section is **expected**. Anything not in this section needs
explaining before a commit.

### 1a. Known metadata drift, will be corrected by the run

These three were fixed in `fetch_data.R` back in commit `7058dad` but the data
was never regenerated, so the payloads still carry the old values.

| series | payload now | `fetch_data.R` says | after the run |
|---|---|---|---|
| `groceries` | `fred_id: CPIFABSL` | `fred_id: CUSR0000SAF11` | per the §0 decision |
| `car_insurance` | `fred_id: CUUR0000SETE`, no `source_note`/`source_url` | `bls_id: CUSR0000SETE` + both fields | `source_note`/`source_url` appear; `fred_id` disappears; description wording changes |
| `childcare` | `fred_id: CUUR0000SEEB03`, no `source_note`/`source_url` | `bls_id: CUSR0000SEEB03` + both fields | same as above |

**Watch the SA/NSA question on these two.** `CUUR…` is the *not* seasonally
adjusted id; `CUSR…` is seasonally adjusted. The payloads record the NSA id
while their own descriptions claim "seasonally adjusted," and this was never
resolved against the source. So after the run:

- Report the new `car_insurance` and `childcare` values at **2000-01-01,
  2015-06-01, 2020-06-01, 2024-06-01, 2026-06-01** next to the current ones
  (§4 table) and say whether the series moved.
- If they moved, the committed data really was NSA and the refresh corrected it —
  say so plainly, because it means every car-insurance and childcare figure
  published so far was NSA labelled as SA.
- If they did not move, the ids were cosmetic and the data was always SA.
- Either way, check the new series for a **seasonal sawtooth** (a repeating
  same-month-every-year zigzag). An SA series should not have one. Flag it if it
  does, regardless of what the id says.

The §5 seasonality check run against the **current** committed data gives, as a
baseline to compare against:

| series | month-of-year spread now |
|---|---|
| `car_insurance` | 1.30 pp (July averages +1.12%, May −0.18%) |
| `childcare` | 0.16 pp |
| `cpi_all_items` | 0.08 pp (known-SA reference) |

`car_insurance` is an order of magnitude more seasonal-looking than the two
known-SA series. That is weak evidence the committed car-insurance data is NSA,
not proof — it may just be a genuinely lumpy series, since insurers reprice in
annual cycles. **If that 1.30 drops sharply after the refresh, the old data was
NSA.** If it stays, the ids were cosmetic. Report the new number either way.

### 1b. `last_updated` on every series

Goes from `2026-07-15` to the run date, across all of `app_data.js`,
`manifest.json`, `states_index.js` and the state files. Expected, ignore.

### 1c. Possibly new observations

Today is later in July than the committed stamp, so weekly series will likely
gain points:

- `gas` (weekly, currently ends 2026-07-13) and `mortgage` (weekly, currently
  ends 2026-07-09) — new weeks expected.
- Monthly CPI/average-price series end 2026-06-01. July data releases mid-August,
  so **no new monthly points are expected.** If a monthly series suddenly ends
  2026-07-01, that is a surprise — verify it against the BLS release calendar
  before accepting it.
- Annual series (`uninsured_rate`, `rent_burden`, `income_20th`, `us_median_income`
  end 2024; NY Fed series end 2025-12) should not move.

### 1d. Revisions

Seasonally adjusted CPI series get revised, so small changes to historical
values are normal. Large ones are not — see §3.

---

## 2. Running it

```bash
cd <repo>

# Confirm the keys are visible to R before burning a long run.
# BLS_KEY and CENSUS_API_KEY are required; EIA_KEY is optional.
Rscript -e 'cat("BLS:", nchar(Sys.getenv("BLS_KEY")), " CENSUS:", nchar(Sys.getenv("CENSUS_API_KEY")), " EIA:", nchar(Sys.getenv("EIA_KEY")), "\n")'

# Snapshot the pre-refresh state so you can diff numerically, not just by eye.
# data/ is committed, so git is the baseline — but capture it explicitly in case
# something goes wrong mid-run.
git status --short            # should be clean, or you are refreshing on top of edits
cp -r data /tmp/data_before

# The refresh. Several minutes (51 states x 14 metrics). Keep the full log.
Rscript fetch_data.R 2>&1 | tee /tmp/refresh.log; echo "EXIT: ${PIPESTATUS[0]}"
```

`jsonlite` is the only R dependency. If it's missing:
`Rscript -e 'install.packages("jsonlite", repos="https://cran.r-project.org/")'`.

**The exit code is the first gate.** `fetch_data.R` tries every series, then
exits non-zero if any failed. A non-zero exit means **do not commit** — the
GitHub Action treats it the same way, which is what keeps a bad refresh off the
site. Report which series failed and why; a stale-but-good `data/` beats a
partially-updated one.

`EIA_KEY` absent is *not* a failure — the script skips the state
electricity-bill metric and says so loudly. If it's skipped, note that
`state_electricity_bill.csv` and the `electricity_bill` entries will go missing
from the state payloads, which is a real (if intended) content change.

### Optional upstream refreshes

Only if asked — these are yearly, not monthly, and each needs its own
verification pass:

```bash
python3 scripts/fetch_kff.py        # ACA premium + uninsured rate (no key)
python3 scripts/fetch_census.py     # ACS income percentiles + rent burden
python3 scripts/convert_annual.py   # NY Fed; needs a new xlsx in data/annual/raw/
```

---

## 3. Hard stop conditions — do not commit if any of these hold

1. **`Rscript fetch_data.R` exited non-zero.**
2. **`node tests/run.js` does not pass 72/72** (see §5a first — a `KNOWN_STALE`
   exemption failure is expected after a successful refresh and is cleared by
   deleting the exemption, not by reverting the refresh).
3. **A series that was cut has come back.** None of these may appear in
   `data/app_data.js`, `data/manifest.json` or as a `data/*.csv`:
   `health_insurance`, `real_hourly_earnings`, `student_loans`, `job_openings`,
   `quits_rate`, `median_weeks_unemployed`, `bananas`, `potatoes`.
   If one reappears, the working tree isn't carrying the trim — check you're on
   the right branch before anything else.
4. **A series disappeared** that isn't in that list. In particular `new_cars`
   and `mortgage_delinquency` were both proposed for the cut and deliberately
   **kept** — if either vanishes, someone re-applied a superseded plan.
5. **The national series count isn't 35** (31 visible + 4 `overlay_only`).
6. **`cpi_all_items.category` isn't `"overall"`.**
7. **Any series' latest value moved more than ~5% from §4** without a reason you
   can name. Revisions are fractions of a point; 5% is a different series, a
   units change, or a bad parse.
8. **`electricity` is no longer `$ per kWh`, or `utility_gas` is missing.** That
   means the BLS average-price wiring for household energy didn't take, and the
   page is back to publishing index points where it promised cents per kWh.
9. **A `$`-unit series' values look like index levels** (e.g. electricity in the
   hundreds rather than ~0.2). Silent unit mismatch is the failure mode most
   likely to survive the tests and reach print.

---

## 4. Baseline — the committed state before the refresh

Compare every row. Cells marked → are the ones §1 predicts will change.

| id | category | units | n_obs | latest | date |
|---|---|---|---|---|---|
| `water_sewer_trash` | daily | Index | 317 | 331.474 | 2026-06-01 |
| `gas` | daily | $ per Gallon | 1385 | 3.728 | 2026-07-13 → later week |
| `electricity` | daily | **$ per kWh** | 317 | 0.198 | 2026-06-01 |
| `utility_gas` | daily | **$ per Therm** | 317 | 1.688 | 2026-06-01 |
| `groceries` | groceries | Index | 317 | 346.391 | 2026-06-01 → **see §0** |
| `eggs` | groceries | $ per Dozen | 317 | 2.141 | 2026-06-01 |
| `ground_beef` | groceries | $ per Pound | 316 | 6.825 | 2026-06-01 |
| `chicken_breast` | groceries | $ per Pound | 245 | 4.181 | 2026-06-01 |
| `milk` | groceries | $ per Gallon | 317 | 4.317 | 2026-06-01 |
| `bread` | groceries | $ per Pound | 317 | 1.814 | 2026-06-01 |
| `coffee` | groceries | $ per Pound | 277 | 9.457 | 2026-06-01 |
| `bacon` | groceries | $ per Pound | 317 | 6.561 | 2026-06-01 |
| `butter` | groceries | $ per Pound | 98 | 3.816 | 2026-06-01 |
| `car_insurance` | big | Index | 316 | 858.747 | 2026-06-01 → **see §1a** |
| `new_cars` | big | Index | 318 | 178.67 | 2026-06-01 |
| `used_cars` | big | Index | 318 | 179.591 | 2026-06-01 |
| `childcare` | big | Index | 317 | 400.148 | 2026-06-01 → **see §1a** |
| `zori_rent` | big | $ per Month | 137 | 1951 | 2026-05-01 |
| `median_home_price` | big | $ | 105 | 403200 | 2026-01-01 |
| `mortgage` | big | Rate (%) | 1384 | 6.49 | 2026-07-09 → later week |
| `aca_benchmark_premium` | big | $ per Month | 9 | 625 | 2026-01-01 |
| `uninsured_rate` | big | Rate (%) | 16 | 8.2 | 2024-01-01 |
| `rent_burden` | big | % of Renters | 18 | 51.8 | 2024-01-01 |
| `unemployment` | labor | Rate (%) | 317 | 4.2 | 2026-06-01 |
| `hourly_earnings` | labor | $ per Hour | 244 | 37.64 | 2026-06-01 |
| `income_20th` | labor | $ | 18 | 33775 | 2024-01-01 |
| `cpi_all_items` | **overall** | Index | 317 | 332.568 | 2026-06-01 |
| `credit_card_delinquency` | debt | Rate (%) | 105 | 2.92 | 2026-01-01 |
| `mortgage_delinquency` | debt | Rate (%) | 105 | 1.89 | 2026-01-01 |
| `debt_per_capita` | debt | $ per Person | 23 | 63200 | 2025-12-01 |
| `studentloan_per_capita` | debt | $ per Person | 23 | 5460 | 2025-12-01 |
| `cc_delinquency_90` | debt | % of Balance | 23 | 12.4 | 2025-12-01 |
| `us_home_price_index` | big | Index (1980 Q1) | 105 | 713.09 | 2026-01-01 |
| `us_median_income` | labor | $ | 25 | 83730 | 2024-01-01 |
| `rent_hours` | labor | Hours of Work | 137 | 52 | 2026-05-01 |

`overlay_only` (4): `us_home_price_index`, `us_median_income`,
`studentloan_per_capita`, `cc_delinquency_90`.

### The five series this run is really testing

Their `SERIES` entries have never been executed. The committed values came from
FRED's published history, so **a correct run should reproduce them almost
exactly** — same `n_obs`, same latest value. Small differences are acceptable
only if you can attribute them.

| id | BLS id | expect latest | expect n_obs | note |
|---|---|---|---|---|
| `electricity` | `APU000072610` | 0.198 | 317 | gap at 2025-10 |
| `utility_gas` | `APU000072620` | 1.688 | 317 | gap at 2025-10 |
| `coffee` | `APU0000717311` | 9.457 | 277 | many gaps: most of 2008–09, 2018–19 |
| `bacon` | `APU0000704111` | 6.561 | 317 | gap at 2025-10 |
| `butter` | `APU0000FS1101` | 3.816 | 98 | **starts 2018-04**, not 2000 |

If the BLS API rejects one of these ids the whole script exits non-zero and
nothing gets committed. Report the failing id verbatim from `/tmp/refresh.log`;
these are the newest and least-proven entries in the file, so they're the most
likely culprit.

---

## 5. Verification

### 5a. Clear the KNOWN_STALE exemptions

`tests/source_parity.test.js` compares `fetch_data.R`'s `SERIES` against the
committed payloads. The three §1a drifts are currently exempted in its
`KNOWN_STALE` map so the suite is green while they're outstanding.

**A successful refresh makes those exemptions obsolete, and the suite will tell
you so** — the last test in that file fails with `exempted but no longer
drifting` for each one. That failure is the confirmation the refresh worked.
When you see it:

1. Delete the resolved entries from `KNOWN_STALE` in
   `tests/source_parity.test.js` (all three should clear: `groceries`,
   `car_insurance`, `childcare`).
2. Re-run `node tests/run.js` and confirm it's green with the exemptions gone.

If a drift *doesn't* clear, do not delete its exemption — report which field
survived and why, because it means the script and the artifacts still disagree.

### 5b. Run the checks

```bash
# Gate 2. Must be 72/72 (64 before source_parity.test.js was added).
# Runs in ~2s, no npm install.
node tests/run.js

# What actually moved.
git diff --stat
```

Then run these checks and put the output in the report.

```bash
# Series inventory: count, categories, and that no cut series returned.
python3 - <<'EOF'
import json
raw = open('data/app_data.js').read()
p = json.loads(raw[raw.index('{'):raw.rindex('}')+1])
vis = [v for v in p.values() if not v['overlay_only']]
print('series %d (expect 35), visible %d (expect 31)' % (len(p), len(vis)))
from collections import Counter
print('categories:', dict(Counter(v['category'] for v in vis)))
print('cpi category:', p['cpi_all_items']['category'], '(expect overall)')
gone = ['health_insurance','real_hourly_earnings','student_loans','job_openings',
        'quits_rate','median_weeks_unemployed','bananas','potatoes']
back = [g for g in gone if g in p]
print('RESURRECTED (must be empty):', back)
kept = [k for k in ['new_cars','mortgage_delinquency'] if k not in p]
print('WRONGLY CUT (must be empty):', kept)
for sid in ['electricity','utility_gas','coffee','bacon','butter']:
    it = p.get(sid)
    print('  %-12s %-14s %-8s n=%s' % (sid, it['units'], it['latest_value'], it['n_obs']) if it else '  MISSING: '+sid)
EOF

# Numerical before/after on every series, so nothing moves unnoticed.
python3 - <<'EOF'
import json
def load(path):
    raw = open(path).read()
    return json.loads(raw[raw.index('{'):raw.rindex('}')+1])
a, b = load('/tmp/data_before/app_data.js'), load('data/app_data.js')
for sid in sorted(set(a) | set(b)):
    if sid not in a: print('ADDED   ', sid); continue
    if sid not in b: print('REMOVED ', sid); continue
    x, y = a[sid], b[sid]
    notes = []
    if x['units'] != y['units']: notes.append('UNITS %s -> %s' % (x['units'], y['units']))
    if x['category'] != y['category']: notes.append('CAT %s -> %s' % (x['category'], y['category']))
    if x.get('fred_id') != y.get('fred_id'): notes.append('ID %s -> %s' % (x.get('fred_id'), y.get('fred_id')))
    if x['latest_date'] != y['latest_date']: notes.append('newdate %s -> %s' % (x['latest_date'], y['latest_date']))
    if x['latest_value'] != y['latest_value']:
        pct = (y['latest_value'] - x['latest_value']) / x['latest_value'] * 100 if x['latest_value'] else float('inf')
        notes.append('value %s -> %s (%+.2f%%)%s' % (x['latest_value'], y['latest_value'], pct,
                     '  <<< OVER 5%, INVESTIGATE' if abs(pct) > 5 else ''))
    if x['n_obs'] != y['n_obs']: notes.append('n_obs %d -> %d' % (x['n_obs'], y['n_obs']))
    if notes: print('%-24s %s' % (sid, ' | '.join(notes)))
EOF

# SA sanity: a seasonally adjusted series should not repeat the same month-of-year
# shape every year. Prints the mean change by calendar month.
python3 - <<'EOF'
import json, statistics
raw = open('data/app_data.js').read()
p = json.loads(raw[raw.index('{'):raw.rindex('}')+1])
for sid in ['car_insurance','childcare','cpi_all_items']:
    d = [x for x in p[sid]['data'] if x['date'] >= '2010-01-01']
    bym = {}
    for a, b in zip(d, d[1:]):
        bym.setdefault(b['date'][5:7], []).append((b['value']-a['value'])/a['value']*100)
    means = {m: statistics.mean(v) for m, v in sorted(bym.items()) if len(v) > 3}
    spread = max(means.values()) - min(means.values())
    print('%-16s month-of-year spread %.2f pp %s' % (sid, spread,
          '<<< looks SEASONAL, not SA' if spread > 1.5 else 'ok'))
    print('   ', {m: round(v, 2) for m, v in means.items()})
EOF

# Payload vs the script's own declarations. This is now also a real test —
# tests/source_parity.test.js — so `node tests/run.js` covers it. Kept here as a
# standalone check because it prints the actual before/after strings, which is
# what you want while judging a refresh. Run against the CURRENT committed data
# it reports exactly 1 drift field (car_insurance.description); after a
# successful refresh it must report 0. Any OTHER field is a new problem.
python3 - <<'EOF'
import re, json
src = open('fetch_data.R').read()
block = src[src.index('SERIES <- list('):src.index('STATE_METRICS')]
entries = re.split(r'\n  list\(', block)
def f(e, k):
    m = re.search(r'\b' + k + r'\s+= "((?:[^"\\]|\\.)*)"', e)
    return m.group(1) if m else None
raw = open('data/app_data.js').read()
p = json.loads(raw[raw.index('{'):raw.rindex('}')+1])
bad = 0
for e in entries:
    sid = f(e, 'id')
    if not sid or sid not in p: continue
    for k in ['label', 'subtitle', 'category', 'units', 'description']:
        if f(e, k) is not None and f(e, k) != p[sid].get(k):
            print('DRIFT %s.%s\n  R:       %s\n  payload: %s' % (sid, k, f(e, k), p[sid].get(k)))
            bad += 1
print('drift fields:', bad, '(expect 0)')
EOF
```

Finally, open the page and look at it — nothing above renders anything:

```bash
open index.html          # or: python3 -m http.server 8000
```

- National view: all six category rows present, "All prices (CPI)" first and
  holding only Inflation (CPI).
- Electricity reads as a dollar amount per kWh (~$0.20), not an index level.
- No card stuck on "Loading…" — that means a JS error; check the browser console.
- Toggle Nominal/Real: dollar and index cards move, rates don't, and there is no
  longer a separate real-wage card.
- Spot-check one state view and the map tab still render.

---

## 6. Report back

- The §0 decision, who made it, and what was done about it.
- Exit code, and any series the log reported as failed or skipped.
- `node tests/run.js` result.
- Output of each §5 check, especially the before/after diff.
- For `car_insurance` and `childcare`: did the values move, and what does the
  seasonality check say? State whether the previously published data was NSA.
- Whether the five new series reproduced their expected values.
- Anything in `git diff` you could not attribute to §1.
- Your recommendation: commit, or hold and why.

**Do not commit if any §3 condition holds.** The deployed site keeps serving the
last good data when a refresh is rejected, which is the intended behaviour, not
a failure.
