const assert = require('node:assert/strict');
const U = require('../lib/updatebanner.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

const now = 1_800_000_000_000;
const avail = { state: 'available', latest: '1.8.0', version: '1.7.0' };

test('prompts as soon as an update is found, and not otherwise', () => {
  assert.equal(U.shouldShow(avail, null, now), true);
  for (const state of ['idle', 'checking', 'none']) assert.equal(U.shouldShow({ state }, null, now), false, state);
  assert.equal(U.shouldShow({ state: 'error', message: 'offline' }, null, now), false); // a failed check stays quiet
  assert.equal(U.shouldShow({ state: 'error', message: 'x', latest: '1.8.0' }, null, now), true); // a failed download can retry
  assert.equal(U.shouldShow({ state: 'downloading', percent: 3 }, { version: '1.8.0', at: now }, now), true);
});

test('"Later" hides it for a few hours, then it comes back; a newer version shows right away', () => {
  const later = { version: '1.8.0', at: now };
  assert.equal(U.shouldShow(avail, later, now + 60 * 60 * 1000), false);
  assert.equal(U.shouldShow(avail, later, now + U.REMIND_AFTER + 1), true);
  assert.equal(U.shouldShow({ ...avail, latest: '1.9.0' }, later, now + 1000), true);
});

test('each state has the right buttons', () => {
  assert.match(U.bannerHtml(avail), /1\.8\.0 is out \(you have 1\.7\.0\)/);
  assert.match(U.bannerHtml(avail), /data-action="updl">UPDATE NOW/);
  assert.match(U.bannerHtml(avail), /data-action="updismiss"/);
  assert.match(U.bannerHtml({ state: 'downloading', latest: '1.8.0', percent: 42 }), /42%.*data-pct="42"/);
  assert.doesNotMatch(U.bannerHtml({ state: 'downloading', percent: 42 }), /<button/);
  assert.match(U.bannerHtml({ state: 'ready', latest: '1.8.0' }), /data-action="upinstall">RESTART &amp; UPDATE/);
  assert.match(U.bannerHtml({ state: 'ready', latest: '1.8.0', phone: true }), /data-action="reload">UPDATE NOW/);
  assert.match(U.bannerHtml({ state: 'error', latest: '1.8.0', message: 'Could not reach GitHub.' }), /Could not reach GitHub\..*data-action="updl">TRY AGAIN/);
});

test('text from outside is escaped and there are no inline styles (the CSP blocks them)', () => {
  const html = U.bannerHtml({ state: 'error', latest: '<b>1</b>', message: '<img src=x onerror=alert(1)>' });
  assert.doesNotMatch(html, /<img|<b>1/);
  assert.doesNotMatch(U.bannerHtml({ state: 'downloading', percent: 50 }), /style=/);
});

test('"Later" is remembered per version', () => {
  const store = {};
  const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  assert.equal(U.loadLater(storage), null);
  U.saveLater(storage, '1.8.0', now);
  assert.deepEqual(U.loadLater(storage), { version: '1.8.0', at: now });
  U.saveLater(storage, null);
  assert.equal(U.loadLater(storage), null);
});

console.log(`\n${passed} update banner tests passed`);
