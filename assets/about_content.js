// The About / sources-and-methods content — single source of truth, loaded
// as a script payload (like the data/*.js files) by BOTH about.html (the
// standalone page) and index.html (the in-app About view). A plain <script>
// include works everywhere, including file:// where fetch() is blocked.
//
// Edit the HTML below directly; it's a JS template literal, so avoid
// backticks (`) and ${ inside the content.
//
// Structure (July 2026 rewrite): tables first. The former "How the tracker
// updates" and "Methods, honestly stated" prose sections were cut; the
// load-bearing definitions they carried now live in the Notes column of the
// table they apply to, or in the bold lead-in notes directly under each table.
//
// August 2026: the Updates column is plain text (Weekly / Monthly / Quarterly /
// Annual). It used to be a color-coded .freq badge, which read as a status
// signal the cadence doesn't carry. The .freq CSS is gone from about.html and
// from the .at-about block in index.html; don't reintroduce it. Notes were cut
// back to definitions and caveats a reader needs, with the changelog lines
// ("previously shown as", "new to the dashboard") removed.
window.ABOUT_CONTENT = `
    <h2>National series</h2>
    <p class="lead">
      Every series here is public.
    </p>
    <div class="table-wrap">
    <table>
      <thead><tr><th>Series</th><th>Source</th><th>Updates</th><th>Notes</th></tr></thead>
      <tbody>
        <tr>
          <td><b>Groceries (all), new &amp; used cars, car insurance, childcare, inflation</b></td>
          <td>BLS Consumer Price Index, via FRED and the BLS public API</td>
          <td>Monthly</td>
          <td>Seasonally adjusted where BLS publishes it that way. These are price indexes, so they display as cumulative percent change, not index points. There is no CPI card for health insurance: that index prices only the share of a premium insurers keep for administration and profit, not what a household pays, so it can fall in a year when premiums jump. The ACA benchmark premium below is the premium series.</td>
        </tr>
        <tr>
          <td><b>Eggs, ground beef, chicken, milk, bread, coffee, bacon</b></td>
          <td>BLS Average Price data (US city average)</td>
          <td>Monthly</td>
          <td>Retail dollar prices, not indexes. Not seasonally adjusted, so egg and meat prices swing with the season. BLS publishes these nationally and by region, never by state, so they appear only on the national view. Coffee is missing in scattered months, including most of 2008&ndash;09 and 2018&ndash;19; those months are left blank.</td>
        </tr>
        <tr>
          <td><b>Electricity, natural gas</b></td>
          <td>BLS Average Price data (US city average)</td>
          <td>Monthly</td>
          <td>Dollars per kilowatt-hour and dollars per therm, the units on a utility bill. Not seasonally adjusted, and household energy use is strongly seasonal, so compare a month with the same month a year earlier. National and regional only; the state view carries an average monthly residential electricity bill from the EIA instead.</td>
        </tr>
        <tr>
          <td><b>Gasoline</b></td>
          <td>US Energy Information Administration, via FRED</td>
          <td>Weekly</td>
          <td>Regular unleaded, US average pump price, all formulations.</td>
        </tr>
        <tr>
          <td><b>Water &amp; sewer</b></td>
          <td>BLS CPI (water, sewer &amp; trash collection services), via FRED</td>
          <td>Monthly</td>
          <td>National only. No public state-level water-rate series exists (the AWWA rate survey is proprietary), so the dashboard shows no state water bills.</td>
        </tr>
        <tr>
          <td><b>Rent (market)</b></td>
          <td>Zillow Observed Rent Index (ZORI)</td>
          <td>Monthly</td>
          <td>Typical <i>asking</i> rent on a new lease, in dollars, and the dashboard's only rent measure. CPI rent averages across all tenants, including people holding long-standing leases, so it lags what someone signing a lease today pays. Smoothed and seasonally adjusted by Zillow. Starts in 2015, so the longest comparison windows show no rent line.</td>
        </tr>
        <tr>
          <td><b>Median home price</b></td>
          <td>Census Bureau / HUD, via FRED</td>
          <td>Quarterly</td>
          <td>Median sales price of houses sold. It reflects what sold: a shift toward smaller or cheaper homes pulls the median down without any house getting cheaper.</td>
        </tr>
        <tr>
          <td><b>30-year mortgage rate</b></td>
          <td>Freddie Mac Primary Mortgage Market Survey, via FRED</td>
          <td>Weekly</td>
          <td>Average rate on a 30-year fixed conforming loan.</td>
        </tr>
        <tr>
          <td><b>Wages, unemployment</b></td>
          <td>BLS (CES, CPS), via FRED</td>
          <td>Monthly</td>
          <td>Wages are average hourly earnings of all private employees, in nominal dollars. Switch the page to Real to deflate them by CPI-U and restate them in the latest month's dollars. Job openings, the quit rate and unemployment duration are not here: they measure labor-market slack, not what a household can afford.</td>
        </tr>
        <tr>
          <td><b>Credit card &amp; mortgage delinquency rates</b></td>
          <td>Federal Reserve (bank call reports), via FRED</td>
          <td>Quarterly</td>
          <td>Delinquency is 30+ days late at all commercial banks. For debt per person and per state, use household debt per capita below; it comes from a different panel and a stricter delinquency threshold, so don't mix the two. The national student loan balance is not shown: a trillion-dollar aggregate says little about any household, and student loan debt per capita covers the concept per person and per state.</td>
        </tr>
        <tr>
          <td><b>ACA benchmark premium</b></td>
          <td><a href="https://www.kff.org/affordable-care-act/state-indicator/average-marketplace-premiums-by-metal-tier/" target="_blank" rel="noopener">KFF</a> State Health Facts (Average Marketplace Premiums by Metal Tier)</td>
          <td>Annual</td>
          <td>Monthly premium for the second-lowest-cost silver plan for a 40-year-old, before any subsidy. Subsidies are pegged to this plan, which makes it the standard yardstick for marketplace costs. Plan years 2018 onward.</td>
        </tr>
        <tr>
          <td><b>Uninsured rate</b></td>
          <td><a href="https://www.kff.org/state-health-policy-data/state-indicator/total-population/" target="_blank" rel="noopener">KFF</a> State Health Facts (Health Insurance Coverage of the Total Population)</td>
          <td>Annual</td>
          <td>Share of the total population with no health coverage; KFF estimates built on the Census ACS. 2008 onward, with no 2020 point, because the ACS published no comparable 1-year estimates that year.</td>
        </tr>
        <tr>
          <td><b>Household debt per capita</b></td>
          <td><a href="https://www.newyorkfed.org/microeconomics/databank.html" target="_blank" rel="noopener">NY Fed</a> Consumer Credit Panel / Equifax, State-Level Household Debt Statistics</td>
          <td>Annual</td>
          <td>Total household debt per person with a credit file, not per resident. Each point is a fourth quarter, 2003 onward. The same panel supplies the state series, so the national and state lines are directly comparable.</td>
        </tr>
        <tr>
          <td><b>Rent burden</b></td>
          <td>Census ACS 1-year estimates, table B25070</td>
          <td>Annual</td>
          <td>Share of renter households paying 30% or more of income on gross rent. 2005 onward, no 2020 point. Households where the ratio can't be computed drop out of the denominator.</td>
        </tr>
        <tr>
          <td><b>Income: 20th percentile</b></td>
          <td>Census ACS 1-year estimates, table B19080</td>
          <td>Annual</td>
          <td>A quintile upper limit: the income level one in five households falls below. The ACS publishes quintile limits and not arbitrary percentiles, so the dashboard uses the published 20th point instead of interpolating a 25th. Nominal dollars; the Real switch deflates them.</td>
        </tr>
        <tr>
          <td><b>Rent in hours of work</b></td>
          <td>Derived: Zillow ZORI ÷ BLS average hourly earnings</td>
          <td>Monthly</td>
          <td>Hours at the average private-sector wage needed to cover one month's market-rate rent. Both inputs are nominal, so inflation cancels and the ratio is already real. 2015 onward.</td>
        </tr>
      </tbody>
    </table>
    </div>

    <p class="lead">
      <b>Units.</b> Dollar series display in dollars. Index series (CPI subindexes, the FHFA
      house price index) display as cumulative percent change. The page-wide
      <b>Nominal / Real</b> switch deflates dollar and index series by CPI-U (all items) and
      restates them in the latest month's dollars, so the newest point is unchanged and
      earlier points are lifted into today's money. Real is a no-op for rates, durations and
      counts, which are already comparable over time, and for series that arrive
      inflation-adjusted, like median household income.
    </p>

    <p class="lead">
      <b>Comparison points.</b> The "Measure from" control sets the baseline: one year,
      January 2025, 2019, 2000, or the full history. The 2019 anchor is <b>December 2019</b>,
      not early or mid-2020. Anchoring inside 2020 puts the COVID price collapse in the
      baseline (gasoline bottomed out in April 2020) and produces changes that don't survive
      a second look. The dashboard opens on December 2019. Individual cards can override the
      baseline; Nominal/Real and the dollars/percent toggle are page-wide.
    </p>

    <h2>State series</h2>
    <p class="lead">
      Each state series covers all 50 states and DC unless the Notes say otherwise. State dollar series are deflated by the national CPI-U.
    </p>
    <div class="table-wrap">
    <table>
      <thead><tr><th>Series</th><th>Source</th><th>Updates</th><th>Notes</th></tr></thead>
      <tbody>
        <tr>
          <td><b>Unemployment rate</b></td>
          <td>BLS Local Area Unemployment Statistics, via FRED</td>
          <td>Monthly</td>
          <td>Seasonally adjusted.</td>
        </tr>
        <tr>
          <td><b>Hourly wages</b></td>
          <td>BLS state Current Employment Statistics, via FRED</td>
          <td>Monthly</td>
          <td>Average hourly earnings, all private employees. Not seasonally adjusted, so month-to-month movement inside a state partly reflects seasonality; year-over-year and baseline comparisons are unaffected. Series start in 2007.</td>
        </tr>
        <tr>
          <td><b>Home prices</b></td>
          <td>FHFA All-Transactions House Price Index, via FRED</td>
          <td>Quarterly</td>
          <td>An index shown as percent change, not a dollar price; dollar-level state sale prices require proprietary data. Index levels aren't comparable across states, so this series is left off the map. Not seasonally adjusted.</td>
        </tr>
        <tr>
          <td><b>Median household income</b></td>
          <td>Census Bureau (CPS ASEC), via FRED</td>
          <td>Annual</td>
          <td>Published in inflation-adjusted dollars, so the Real switch leaves it alone. State-year estimates from a household survey carry real sampling error; read one-year moves in small states with care.</td>
        </tr>
        <tr>
          <td><b>Rent (market)</b></td>
          <td>Zillow ZORI, county data aggregated by ESP</td>
          <td>Monthly</td>
          <td>Zillow publishes ZORI for counties, not states, so we aggregate county ZORI to the state level using fixed county renter-household weights (Census ACS 2019&ndash;2023), renter households being the right universe for a rental price. States where the covered counties hold less than half of the state's renter households are dropped rather than published on partial coverage, and every state card displays its coverage share. Asking rent on new leases, like the national series.</td>
        </tr>
        <tr>
          <td><b>Electricity bills</b></td>
          <td>EIA Form 861M</td>
          <td>Monthly</td>
          <td>Average monthly residential bill: residential revenue ÷ customer accounts. It moves with usage as well as with rates, so summer and winter bills differ in states with electric heat or heavy air conditioning. The most recent months are preliminary and get revised.</td>
        </tr>
        <tr>
          <td><b>ACA benchmark premium</b></td>
          <td><a href="https://www.kff.org/affordable-care-act/state-indicator/average-marketplace-premiums-by-metal-tier/" target="_blank" rel="noopener">KFF</a> State Health Facts</td>
          <td>Annual</td>
          <td>The same benchmark premium as the national card, by state: second-lowest-cost silver, age 40, before subsidies. Plan years 2018 onward. A dollar premium, so unlike the CPI series it compares directly across states.</td>
        </tr>
        <tr>
          <td><b>Uninsured rate</b></td>
          <td><a href="https://www.kff.org/state-health-policy-data/state-indicator/total-population/" target="_blank" rel="noopener">KFF</a> State Health Facts</td>
          <td>Annual</td>
          <td>Share of each state's population with no health coverage; KFF estimates from the Census ACS. 2008 onward, no 2020 point.</td>
        </tr>
        <tr>
          <td><b>Household debt, student loan debt (per capita); credit card delinquency (90+)</b></td>
          <td><a href="https://www.newyorkfed.org/microeconomics/databank.html" target="_blank" rel="noopener">NY Fed</a> Consumer Credit Panel / Equifax, State-Level Household Debt Statistics</td>
          <td>Annual</td>
          <td>Per person with a credit file (ages 18+), not per resident, so states with more people outside the credit system aren't strictly comparable on a population basis. Delinquency is the percent of balance 90+ days late, stricter than the 30-day national bank series above; the two are not interchangeable. Each point is a fourth quarter, 2003 onward. One panel covers the US and every state, so the national overlay on these charts is built the same way as the state lines.</td>
        </tr>
        <tr>
          <td><b>Rent burden</b></td>
          <td>Census ACS 1-year, table B25070</td>
          <td>Annual</td>
          <td>Share of renter households paying 30% or more of income on gross rent. 2005 onward, no 2020 point.</td>
        </tr>
        <tr>
          <td><b>Income: 20th percentile</b></td>
          <td>Census ACS 1-year, table B19080</td>
          <td>Annual</td>
          <td>A quintile upper limit, the exact percentile the ACS publishes; see the national table above. Nominal dollars.</td>
        </tr>
        <tr>
          <td><b>Rent in hours of work</b></td>
          <td>Derived: Zillow ZORI ÷ BLS state hourly earnings</td>
          <td>Monthly</td>
          <td>Hours at the state's average private-sector wage to cover a month's market rent. Inherits the rent series' coverage limits, so states missing there are missing here.</td>
        </tr>
      </tbody>
    </table>
    </div>

    <p class="lead">
      <b>Rankings.</b> Every state metric carries a national rank, computed when the data is
      built, from each state's latest value (1 = highest; ties share a rank).
    </p>

    <h2>Annual state indicators</h2>
    <p class="lead">
      Some of these are published only once a year. These appear as stat
      tiles on each state's page: context for the live series, at a fixed vintage rather than
      a moving time series.
    </p>
    <div class="table-wrap">
    <table>
      <thead><tr><th>Indicator</th><th>Source &amp; vintage</th><th>Definition</th></tr></thead>
      <tbody>
        <tr>
          <td><b>Infant child care, center-based</b></td>
          <td><a href="https://info.childcareaware.org/price-and-supply-2025" target="_blank" rel="noopener">Child Care Aware of America</a>, 2025</td>
          <td>Annual price of full-time center-based care for an infant. CO, DC, NM and SC reported no 2025 price. Seven states (AL, FL, MT, PA, TX, WV, WY) carry a footnote flag in CCAoA's published tables; check the report before quoting those states specifically.</td>
        </tr>
        <tr>
          <td><b>Medical debt in collections</b></td>
          <td><a href="https://apps.urban.org/features/debt-interactive-map/" target="_blank" rel="noopener">Urban Institute, Debt in America</a>, Aug 2025 panel</td>
          <td>Share of people with a credit record who have medical debt in collections. Seven states that restrict medical-debt credit reporting (CA, CO, IL, NY, RI, VT, WA) have no comparable 2025 value and show no tile. That is an artifact of reporting rules, not an absence of medical debt.</td>
        </tr>
        <tr>
          <td><b>Any debt in collections</b></td>
          <td>Urban Institute, Debt in America, Aug 2025 panel</td>
          <td>Share of people with a credit record who have any debt in collections.</td>
        </tr>
      </tbody>
    </table>
    </div>

    <p class="note">
      Corrections and questions are welcome: write to
      <a href="mailto:press@economicsecurityproject.org">press@economicsecurityproject.org</a>. Every series
      identifier is declared explicitly in the dashboard's data pipeline, and every CSV
      download carries its source.
    </p>

`;
