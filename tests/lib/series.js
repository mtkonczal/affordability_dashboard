// Shared checks for a `[{date, value}, ...]` time series, the one shape every
// payload in this project uses (national series, state metrics, compare
// panels). Each function returns an array of human-readable problem strings so
// a single failing assertion can name every bad point at once.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Structural problems: bad dates, non-finite values, unsorted, duplicated. */
function seriesProblems(data, { allowEmpty = false } = {}) {
  const bad = [];
  if (!Array.isArray(data)) return ['data is not an array'];
  if (!data.length) return allowEmpty ? [] : ['data is empty'];

  const seen = new Set();
  let prev = null;
  data.forEach((pt, i) => {
    if (!pt || typeof pt !== 'object') { bad.push(`[${i}] not an object`); return; }
    if (!ISO_DATE.test(pt.date || '')) {
      bad.push(`[${i}] date ${JSON.stringify(pt.date)} is not YYYY-MM-DD`);
    } else {
      if (Number.isNaN(Date.parse(pt.date + 'T00:00:00Z'))) {
        bad.push(`[${i}] date ${pt.date} is not a real calendar date`);
      }
      if (seen.has(pt.date)) bad.push(`[${i}] duplicate date ${pt.date}`);
      seen.add(pt.date);
      if (prev && pt.date < prev) bad.push(`[${i}] date ${pt.date} is out of order (after ${prev})`);
      prev = pt.date;
    }
    if (typeof pt.value !== 'number' || !Number.isFinite(pt.value)) {
      bad.push(`[${i}] value ${JSON.stringify(pt.value)} at ${pt.date} is not a finite number`);
    }
  });
  return bad;
}

/** Does the payload's cached `latest_value`/`latest_date` match the series? */
function latestProblems(item, data) {
  const bad = [];
  if (!data || !data.length) return bad;
  const last = data[data.length - 1];
  if (item.latest_date != null && item.latest_date !== last.date) {
    bad.push(`latest_date ${item.latest_date} != last observation ${last.date}`);
  }
  if (item.latest_value != null && Math.abs(item.latest_value - last.value) > 1e-6) {
    bad.push(`latest_value ${item.latest_value} != last value ${last.value}`);
  }
  if (item.n_obs != null && item.n_obs !== data.length) {
    bad.push(`n_obs ${item.n_obs} != data length ${data.length}`);
  }
  return bad;
}

/** Whole months between two YYYY-MM-DD strings (a before b). */
function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** Newest date in a series. */
function maxDate(data) {
  return data && data.length ? data[data.length - 1].date : null;
}

module.exports = { ISO_DATE, seriesProblems, latestProblems, monthsBetween, maxDate };
