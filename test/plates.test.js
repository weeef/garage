const assert = require('node:assert/strict');
const P = require('../lib/plates.js');
const CarUI = require('../lib/ui-car.js');
const G3 = require('../lib/car3d.js');
const GL = require('../lib/carlook.js');
const R = require('../lib/replica.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

test('states are found by code or name, any case', () => {
  assert.equal(P.stateCode('WA'), 'WA');
  assert.equal(P.stateCode('wa'), 'WA');
  assert.equal(P.stateCode('Washington'), 'WA');
  assert.equal(P.stateCode('new york'), 'NY');
  assert.equal(P.stateCode('Washington, D.C.'), 'DC');
  assert.equal(P.stateCode('Bavaria'), '');
  assert.equal(P.stateCode(''), '');
  assert.equal(Object.keys(P.STATES).length, 51); // 50 states and DC
});

test('every state has a complete design; unknown regions get a plain plate with their name', () => {
  const hex = /^#[0-9a-f]{6}$/i;
  for (const [code, s] of Object.entries(P.STATES)) {
    assert.ok(s.name && s.top !== undefined && s.bottom !== undefined, code);
    assert.ok(s.bg.length >= 2 && s.bg.every((c) => hex.test(c)), `${code} background`);
    for (const k of ['chars', 'ink', 'bottomInk']) if (s[k]) assert.match(s[k], hex, `${code} ${k}`);
    assert.ok(!s.style || ['script', 'serif', 'sans'].includes(s.style), code);
    for (const a of s.art) assert.ok(P.ART[a.split(':')[0]], `${code} draws ${a}`);
  }
  // Washington's standard plate: red "Washington", navy characters, Mount Rainier, "EVERGREEN STATE"
  const wa = P.design('wa');
  assert.equal(wa.name, 'Washington');
  assert.equal(wa.top, 'Washington');
  assert.equal(wa.bottom, 'EVERGREEN STATE');
  assert.deepEqual(wa.art, ['rainier']);
  assert.equal(wa.ink, '#c8102e');
  const other = P.design('Bavaria');
  assert.equal(other.code, '');
  assert.equal(other.name, 'Bavaria');
});

test('the dashboard shows the plate card (edit on click) when the vehicle has a plate', () => {
  const v = { id: 'a', body: 'hatchback', plate: 'CUP5218', plateState: 'WA' };
  const html = (veh) => CarUI.create({ vehicle: () => veh, esc: (s) => String(s), $: () => null, L: {}, G3, GL, R,
    P: { ...P, dataUrl: (t, s) => `data:image/png;base64,${t}-${s}` }, hints: { spin: 'drag', paint: 'paint' } }).stageHtml(veh);
  const out = html(v);
  assert.match(out, /class="plate-card" data-action="renewreg" title="Washington plate: edit"><img src="data:image\/png;base64,CUP5218-WA" alt="License plate CUP5218">/);
  assert.doesNotMatch(html({ ...v, plate: '' }), /plate-card/);
});

console.log(`\n${passed} plate tests passed`);
