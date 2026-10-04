const assert = require('node:assert/strict');
const S = require('../lib/sync.js');

let passed = 0;
const pending = [];
function test(name, fn) {
  pending.push(Promise.resolve().then(fn).then(
    () => { passed++; console.log('ok   ' + name); },
    (e) => { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
  ));
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const base = () => ({
  vehicles: [{ id: 'v1', name: 'Truck', odometer: 1000 }],
  logs: [{ id: 'l1', vehicleId: 'v1', service: 'Oil', date: '2026-01-01', odometer: 1000 }],
  schedules: []
});

test('stamp: new and edited items get a time, unchanged keep theirs, removed become tombstones', () => {
  const prev = base();
  prev.vehicles[0].updatedAt = 5;
  const next = clone(prev);
  next.logs[0].service = 'Oil change';
  next.logs.push({ id: 'l2', vehicleId: 'v1', service: 'Tires', date: '2026-02-01', odometer: 1500 });
  S.stampChanges(prev, next, 100);
  assert.equal(next.vehicles[0].updatedAt, 5);
  assert.equal(next.logs[0].updatedAt, 100);
  assert.equal(next.logs[1].updatedAt, 100);
  const after = clone(next);
  after.logs = after.logs.filter((l) => l.id !== 'l1');
  S.stampChanges(next, after, 200);
  assert.equal(after.deleted.l1, 200);
});

test('stamp: items from before sync existed stay unstamped', () => {
  const prev = base();
  const next = clone(prev);
  S.stampChanges(prev, next, 100);
  assert.equal(next.logs[0].updatedAt, undefined);
});

test('merge: edits on both sides survive, newer wins per item', () => {
  const a = base(); const b = base();
  a.logs.push({ id: 'pc', vehicleId: 'v1', service: 'Wipers', date: '2026-03-01', odometer: 2000, updatedAt: 10 });
  b.logs.push({ id: 'phone', vehicleId: 'v1', service: 'Battery', date: '2026-03-02', odometer: 2100, updatedAt: 11 });
  a.logs[0] = { ...a.logs[0], cost: 40, updatedAt: 20 };
  b.logs[0] = { ...b.logs[0], cost: 99, updatedAt: 30 };
  const m = S.mergeData(a, b);
  assert.deepEqual(m.logs.map((l) => l.id).sort(), ['l1', 'pc', 'phone']);
  assert.equal(m.logs.find((l) => l.id === 'l1').cost, 99);
  assert.equal(m.vehicles[0].odometer, 2100, 'odometer follows the highest log');
});

test('merge: deletion wins over an older edit, loses to a newer one', () => {
  const a = base(); const b = base();
  a.deleted = { l1: 50 };
  a.logs = [];
  b.logs[0].updatedAt = 40;
  assert.equal(S.mergeData(a, b).logs.length, 0);
  b.logs[0].updatedAt = 60;
  assert.equal(S.mergeData(a, b).logs.length, 1);
});

test('merge: deleting a vehicle drops its logs from the other device', () => {
  const a = base(); const b = base();
  a.vehicles = []; a.logs = []; a.deleted = { v1: 50, l1: 50 };
  b.logs.push({ id: 'new', vehicleId: 'v1', service: 'X', date: '2026-05-01', odometer: 1, updatedAt: 70 });
  const m = S.mergeData(a, b);
  assert.equal(m.vehicles.length, 0);
  assert.equal(m.logs.length, 0);
});

test('merge is order-insensitive (sameData)', () => {
  const a = base(); const b = base();
  a.logs.push({ id: 'x', vehicleId: 'v1', service: 'A', date: '2026-01-02', odometer: 1, updatedAt: 1 });
  b.schedules.push({ id: 's', vehicleId: 'v1', name: 'Oil', intervalMiles: 5000, intervalMonths: 6, updatedAt: 2 });
  assert.ok(S.sameData(S.mergeData(a, b), S.mergeData(b, a)));
});

// A tiny in-memory GitHub Gist API.
function fakeGitHub() {
  const gists = new Map();
  let n = 0;
  const calls = [];
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const fetchImpl = async (url, opts) => {
    const method = opts.method || 'GET';
    const path = url.replace('https://api.github.com', '');
    calls.push(method + ' ' + path.split('?')[0]);
    if (opts.headers.Authorization !== 'Bearer good') return json(401, {});
    if (method === 'GET' && path.startsWith('/gists?')) return json(200, [...gists.entries()].map(([id, g]) => ({ id, files: g.files })));
    if (method === 'POST' && path === '/gists') {
      const id = 'g' + (++n);
      gists.set(id, JSON.parse(opts.body));
      return json(201, { id });
    }
    const id = path.split('/')[2];
    if (!gists.has(id)) return json(404, {});
    if (method === 'GET') return json(200, { id, files: gists.get(id).files });
    if (method === 'PATCH') { gists.set(id, JSON.parse(opts.body)); return json(200, { id }); }
    return json(400, {});
  };
  return { fetchImpl, gists, calls };
}

test('syncNow: first device creates the gist, second finds it and both converge', async () => {
  const gh = fakeGitHub();
  const pc = base(); S.stampChanges(null, pc, 10);
  const r1 = await S.syncNow({ token: 'good', local: pc, fetchImpl: gh.fetchImpl });
  assert.ok(r1.gistId);
  assert.ok(r1.pushed);

  const phone = { vehicles: [], logs: [], schedules: [] };
  phone.vehicles.push({ id: 'v2', name: 'Bike', odometer: 5, updatedAt: 20 });
  const r2 = await S.syncNow({ token: 'good', local: phone, fetchImpl: gh.fetchImpl });
  assert.equal(r2.gistId, r1.gistId, 'second device found the same gist');
  assert.deepEqual(r2.data.vehicles.map((v) => v.id).sort(), ['v1', 'v2']);

  const r3 = await S.syncNow({ token: 'good', gistId: r1.gistId, local: r1.data, fetchImpl: gh.fetchImpl });
  assert.deepEqual(r3.data.vehicles.map((v) => v.id).sort(), ['v1', 'v2']);
  assert.equal(r3.pushed, false, 'nothing new from the PC, so no write');
});

test('syncNow: bad token gives a clear auth error', async () => {
  const gh = fakeGitHub();
  await assert.rejects(S.syncNow({ token: 'bad', local: base(), fetchImpl: gh.fetchImpl }), (e) => e.code === 'auth');
});

test('syncNow: a deleted gist is recreated', async () => {
  const gh = fakeGitHub();
  const r = await S.syncNow({ token: 'good', gistId: 'gone', local: base(), fetchImpl: gh.fetchImpl });
  assert.notEqual(r.gistId, 'gone');
  assert.ok(gh.gists.has(r.gistId));
});

Promise.all(pending).then(() => console.log(`\n${passed} sync tests passed`));
