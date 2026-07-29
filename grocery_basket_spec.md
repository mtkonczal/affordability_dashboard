# Grocery Basket — spec for review

*Draft, July 28 2026. Nothing here is built yet. The question this answers: can
the tracker publish one dollar figure for "a week of groceries," and what
exactly would that figure mean?*

## What it is

One line, in dollars, showing what a fixed list of groceries costs each month.
Not an index. The headline sentence it is designed to produce — computed from the
committed payloads, so these are the actual numbers it would publish today:

> The same eight-item cart cost **$29.32** in December 2019. It costs **$43.29**
> today — **47.6% more**.

The tracker already carries eight BLS average price series in actual dollars
(nominal, as published). This adds nothing new from the source — it sums what is
already on the page.

## Why it's legitimate to sum these

BLS average prices are actual dollars per pound, dozen or gallon, so a weighted
sum is arithmetic rather than modelling — provided the quantities are fixed and
published. This is the same construction a newspaper "cost of Thanksgiving
dinner" story uses.

**It is not a price index and must never be described as one.** BLS says plainly
that average prices are best used to measure the price level in a given month,
not change over time, and that CPI index values are the right tool for change.
Our basket ignores that advice on purpose, and the About page has to say so: we
want the dollar figure precisely because it is concrete, and we accept that it
moves for reasons a proper index would adjust away (see Limits).

## The cart

Quantities are a rough week for a two-person household, rounded to units BLS
actually prices. **They are a stated convention, not a nutritional
recommendation and not a measured average of what anyone buys.**

| Item | Series | Qty | Dec 2019 | Jun 2026 |
|---|---|---|---|---|
| Eggs, grade A large | `APU0000708111` | 1 dozen | $1.54 | $2.14 |
| Milk, whole | `APU0000709112` | 1 gallon | $3.19 | $4.32 |
| Bread, white pan | `APU0000702111` | 1 lb | $1.36 | $1.81 |
| Ground beef, 100% | `APU0000703112` | 1 lb | $3.86 | $6.83 |
| Chicken breast, boneless | `APU0000FF1101` | 2 lb | $6.23 | $8.36 |
| Bacon, sliced | `APU0000704111` | 1 lb | $5.47 | $6.56 |
| Butter, sticks | `APU0000FS1101` | 1 lb | $3.62 | $3.82 |
| Coffee, ground roast | `APU0000717311` | 1 lb | $4.05 | $9.46 |
| **Total** | | | **$29.32** | **$43.29** |

Totals are computed from the unpublished-precision values (Dec 2019 = $29.325,
Jun 2026 = $43.293), so they will not always equal the sum of the rounded column
above to the cent.

Coffee alone contributes $5.40 of the $13.97 increase — worth knowing, because
the first question a hostile reader asks is which item is doing the work. Ground
beef adds another $2.96. Butter contributes 19 cents.

Eight items, all already on the page. Deliberately excluded:

- **Produce.** Bananas and potatoes were just cut for being flat, and adding
  them back inside the basket would reintroduce the same dead weight.
- **Rice and dried beans.** Worth adding as their own cards (they carry a real
  hardship story), but they last months rather than a week, so a weekly
  quantity would be arbitrary.
- **Anything discontinued.** No series that BLS has stopped publishing.

Two open questions for you:

1. **Is eight items enough to be credible?** It is defensible but visibly not a
   real grocery run — no produce, no cheese, no pasta. Adding tomatoes and
   cheddar would fix the optics at the cost of two more cards to maintain.
2. **Are the quantities right?** They drive the headline number, so they will
   get argued with. An alternative is to set every quantity to 1 unit and call
   it "one of each" — less realistic, much harder to dispute.

## How it's computed

- Monthly. For each month, `total = Σ (quantity × price)` over the eight series.
- **A month is published only if all eight series have a value.** Coffee is the
  binding constraint: BLS skipped most of 2008–09 and 2018–19, so those months
  simply have no basket. Partial sums are the one thing that would make the
  series lie — the total would drop when an item went missing and read as
  groceries getting cheaper.
- **The series starts April 2018** (butter's first month) and yields **83
  publishable months** out of the 99 in range. Of the 16 missing months, 15 are
  mid-2018 through September 2019, where coffee is unpublished; the sixteenth is
  October 2025, which is missing from every average-price series in the payload.
  The Dec-2019 anchor works; "Since 2000" and "Max" show no basket line. Same
  trade-off ZORI rent already carries.
- Not seasonally adjusted, because none of the inputs are.
- Units `$`, `rebase: false`, so the Real toggle deflates it by CPI-U like any
  other dollar card. In Real mode the sentence becomes "in today's dollars, the
  same cart cost $X in 2019" — which is the stronger version of the fact.

## Where it's built

`fetch_data.R`, as a derived series after the national download loop, next to
`rent_hours` — same pattern: read already-fetched series out of `all_data`,
merge on date, write `data/grocery_basket.csv` and a `SERIES`-shaped entry.
`source = "derived_grocery_basket"`. The basket definition lives in one named
list at the top of that block so the quantities are reviewable in one place.

It depends on all eight items appearing earlier in `SERIES`, so it inherits the
ordering constraint `rent_hours` already documents.

## Limits to state on the About page

- Fixed quantities, so it cannot capture people switching to cheaper items when
  prices rise — the substitution that CPI is built to handle. When beef gets
  expensive and shoppers buy chicken, the basket keeps charging for beef. This
  makes it an overstatement of the squeeze on a household that adapts, and a
  fair statement of the squeeze on one that doesn't.
- Not a measured average of anyone's spending. It is our cart, published so the
  arithmetic can be checked.
- No state figures. BLS publishes average prices nationally and by region only,
  so the basket can never appear in the state or map views.
- Eight items are not groceries. The number is a comparable yardstick over time,
  not an estimate of a grocery bill — a family of four spends far more.

## Cost of building it

Small: one derived block in `fetch_data.R`, one new card, three test additions
(all-eight-present rule, quantities match the published table, total equals the
hand-computed sum for one month). The maintenance risk is BLS discontinuing or
restarting a component series, which is exactly what happened to butter in 2012
— so the all-or-nothing rule above needs a loud failure, not a silent gap.
