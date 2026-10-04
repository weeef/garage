const assert = require('node:assert/strict');
const T = require('../lib/themes.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

test('every theme sets every color the stylesheets use', () => {
  const keys = Object.keys(T.THEMES[0].vars).sort();
  for (const t of T.THEMES) assert.deepEqual(Object.keys(t.vars).sort(), keys, t.id);
  assert.equal(new Set(T.THEMES.map((t) => t.id)).size, T.THEMES.length);
});

test('button text is black on light accents and white on dark ones', () => {
  assert.equal(T.onColor('#ffb000'), '#111111');
  assert.equal(T.onColor('#22e4ff'), '#111111');
  assert.equal(T.onColor('#c8102e'), '#ffffff');
  assert.equal(T.onColor('#0d1a3a'), '#ffffff');
});

test('a custom accent overrides the theme; junk falls back to the default theme', () => {
  const r = T.resolve({ id: 'racing', accent: '#00ff00' });
  assert.equal(r.theme.id, 'racing');
  assert.equal(r.vars.accent, '#00ff00');
  assert.equal(r.vars['on-accent'], '#111111');
  const j = T.resolve({ id: 'nope', accent: 'red; background: url(x)' });
  assert.equal(j.theme.id, 'garage');
  assert.equal(j.vars.accent, '#ffb000');
});

test('preferences round-trip through storage', () => {
  const store = {};
  const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  assert.deepEqual(T.load(storage), {});
  T.save(storage, { id: 'gulf', accent: '#123456' });
  assert.deepEqual(T.load(storage), { id: 'gulf', accent: '#123456' });
  T.save(storage, { id: 'bogus', accent: 'x' });
  assert.deepEqual(T.load(storage), { id: 'garage', accent: '' });
});

test('the picker marks the current theme and offers a reset only for a custom accent', () => {
  const html = T.pickerHtml({ id: 'brg' });
  assert.match(html, /theme-chip on" data-action="theme" data-id="brg"/);
  assert.doesNotMatch(html, /accentreset/);
  assert.match(T.pickerHtml({ id: 'brg', accent: '#abcdef' }), /data-action="accentreset"/);
  assert.doesNotMatch(html, /style=/); // the CSP forbids inline styles
});

test('brand themes are suggested for the vehicle\'s make', () => {
  assert.equal(T.forMake('FORD').id, 'ford');
  assert.equal(T.forMake('Mercedes-Benz').id, 'mercedes');
  assert.equal(T.forMake('RAM').id, 'dodge');
  assert.equal(T.forMake('Rambler'), null); // whole words only
  assert.equal(T.forMake(''), null);
  const html = T.pickerHtml({ id: 'garage' }, 'Volkswagen');
  const brands = html.slice(html.indexOf('Brands'));
  assert.match(brands, /^Brands<\/div><div class="theme-grid"><button[^>]*data-id="volkswagen"/);
  assert.match(brands, /your make/);
});

test('every theme keeps text readable on its background', () => {
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const t of T.THEMES) {
    assert.ok(ratio(t.vars.text, t.vars.bg) >= 7, `${t.id} text`);
    assert.ok(ratio(t.vars.dim, t.vars.panel) >= 3, `${t.id} dim text ${ratio(t.vars.dim, t.vars.panel).toFixed(2)}`);
    assert.ok(ratio(t.vars.accent, t.vars.bg) >= 3, `${t.id} accent ${ratio(t.vars.accent, t.vars.bg).toFixed(2)}`);
  }
});

console.log(`\n${passed} theme tests passed`);
