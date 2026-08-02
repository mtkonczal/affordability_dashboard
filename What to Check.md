# What to Check

A quick visual review for someone new to this work. Open the tracker where it lives: **https://economicsecurityproject.org/affordability-data-tracker/** (it sits in a frame on that page). Click through the National, My State, Compare, and Map tabs. For each item below: *why* it came up, and *what you should see* if it's right.

---

**1. Cream top bar**
Why: the tracker's menu bar should match the ESP site's header, not float on plain white.
Confirm when: the bar holding the tab buttons is the same warm cream as the page around it.

**2. Fonts — one sans everywhere, serif only for big numbers**
Why: the tracker was using stand-in fonts; it should use ESP's real ones.
Confirm when: all labels, headings, and body text are a single clean sans-serif; only the large emphasis numbers (e.g. the "Hours of work" figures) are in a serif display face. If those big numbers look like a plain fallback serif (Times/Georgia), flag it.

**3. No section numbers**
Why: the little "§01 / §02" tags were visual clutter.
Confirm when: you see section headings with no "§" numbers anywhere.

**4. Calm, uniform cards**
Why: the bright colored line across the top of each chart made it look like unrelated widgets.
Confirm when: every card has the same thin neutral border; category color appears only in the small label above each chart, not as a top stripe.

**5. ESP chart colors**
Why: chart lines were saturated/neon; they should be ESP's palette.
Confirm when: chart lines lead with navy, green, gold and stay muted/warm — no bright neon lines. (Compare tab shows several at once.)

**6. Chevrons, not triangles**
Why: the little "Show ▾" triangles didn't match the ESP site's arrows.
Confirm when: expand/collapse and dropdowns use a clean single chevron; the "Show" chevron flips up when open.

**7. Rectangular buttons**
Why: button shapes were inconsistent (some pill-shaped, some not).
Confirm when: tabs, date controls, toggles, and download buttons are all lightly-rounded rectangles of the same shape.

**8. One button on/off style**
Why: selected states used assorted accent colors.
Confirm when: every selected button is navy with white text; every unselected one is cream with navy text and a thin navy border — no other colors used for on/off.

---

## The new National picker (August 2026)

The National tab's row of expanding category buttons was replaced by a list of all 31 metrics down the left-hand side. These items are about that change. Everything here is on the **National** tab.

**9. The list is on the left, and it scrolls with the page**
Why: the old picker was a bar across the top that had to be expanded a category at a time.
Confirm when: all 31 metrics are visible at once in a narrow column on the left, grouped under six headings, with the charts beside them. Scroll down: the list should slide up and out of view with everything else. If it scrolls *inside its own little box* while the charts stay put, that's wrong.

**10. Six group names, in budget order**
Why: the old names ("Big-ticket", "Daily", "Work & Wages") were internal shorthand.
Confirm when: the headings read **Rent & homes · Food · Bills & getting around · Health & care · Paychecks & debt · Overall inflation**, in that order — housing first, overall inflation last. Metrics inside each group are alphabetical.

**11. Every row shows a number before you click it**
Why: the point of the change is that the picker itself tells you what moved.
Confirm when: each row has the metric name and a change figure on the right. Now change "Measure from" at the top of the page: **every number in the list must change too.** Flip Nominal/Real: they change again. If the list and the chart card for the same metric ever disagree, that's the one real bug to catch here.

**12. Percentages vs. percentage points**
Why: a rate going from 3.5% to 6.3% has not risen "80%".
Confirm when: rate rows (30-Year Mortgage, Unemployment, Uninsured Rate, Rent Burden, the delinquency rows) read **"pp"** — e.g. "+2.8 pp". Price rows read "%". A row with nothing new published since the date you picked shows "—", not "0.0%".

**13. Clicking a group heading adds the whole group**
Why: the old category buttons did this and people used it.
Confirm when: clicking **Food** ticks all eight food rows without disturbing anything selected elsewhere; clicking it again unticks them. The heading should highlight on hover so it's clearly clickable.

**14. Narrow the window**
Why: there isn't room for a left-hand list on a small screen, so it becomes a menu.
Confirm when: dragging the browser narrower than about 1060px replaces the left list with a single **"Add a metric ▾"** button above the charts. Open it — same rows, same ticks, same filter text. Widen again and the list comes back with nothing lost.

**15. The filter box**
Confirm when: typing `egg` narrows the list to Eggs. The charts already on screen **do not change** — filtering hides rows, it never unselects anything. Clearing the box brings the full list back.

---

*Note: most of these can be confirmed by eye on the live page above. Three can hide a fault: #2, if the big numbers silently fall back to a generic serif, it still "works" but isn't the ESP font. #11, if the list's numbers stop following the date and Nominal/Real controls, the page is publishing two different answers to the same question. And #14 — the left-hand list is the part that has to survive inside the frame on the ESP page, so check it there rather than only on a standalone copy.*
