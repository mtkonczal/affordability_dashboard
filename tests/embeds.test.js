// Frozen blog-post embeds (embeds/<slug>/, written by scripts/snapshot_embed.py).
// These never refresh, so the only things worth pinning are that each snapshot
// is internally sound and that it still matches the template it was copied
// from at the time: a snapshot whose chart.html has no data.js, or whose
// series window is empty, would publish a blank chart inside a live post.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'embeds');
const slugs = fs.existsSync(root)
  ? fs.readdirSync(root).filter(d => d !== 'template' && fs.statSync(path.join(root, d)).isDirectory())
  : [];

for (const slug of slugs) {
  test(`embeds/${slug} snapshot is complete and sane`, () => {
    const dir = path.join(root, slug);
    for (const f of ['data.js', 'chart.html', 'README.md']) {
      assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
    }
    const win = {};
    new Function('window', fs.readFileSync(path.join(dir, 'data.js'), 'utf8'))(win);
    const p = win.EMBED_DATA;
    assert.ok(p && p.charts, 'data.js did not set window.EMBED_DATA');
    assert.strictEqual(p.slug, slug);
    assert.match(p.vintage, /^\d{4}-\d{2}-\d{2}$/);
    const ids = Object.keys(p.charts);
    assert.ok(ids.length > 0, 'no charts');
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    for (const id of ids) {
      const c = p.charts[id];
      assert.ok(c.series.length > 0, `${id}: no series`);
      assert.strictEqual(new Set(c.series.map(s => s.units)).size, 1, `${id}: lines with different units share an axis`);
      for (const s of c.series) {
        assert.ok(s.data.length >= 2, `${id}/${s.id}: fewer than two readings`);
        for (let i = 0; i < s.data.length; i++) {
          const d = s.data[i];
          assert.ok(Number.isFinite(d.value), `${id}/${s.id}: non-finite value at ${d.date}`);
          if (i) assert.ok(d.date > s.data[i - 1].date, `${id}/${s.id}: dates not ascending at ${d.date}`);
        }
      }
    }
    // Every chart sits in exactly one graphic, and every graphic has a snippet.
    const placed = Object.values(p.graphics).flat();
    assert.deepStrictEqual([...placed].sort(), [...ids].sort(), 'graphics must place each chart exactly once');
    for (const g of Object.values(p.graphics)) {
      assert.ok(readme.includes(`chart.html?ids=${g.join(',')}"`), `no iframe snippet for ${g.join(',')}`);
    }
  });
}
