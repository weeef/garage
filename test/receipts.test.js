const assert = require('node:assert/strict');
const L = require('../lib/logic.js');
const RU = require('../lib/ui-receipts.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

// A stand-in for the app: data, a fake device store, and dialogs that answer "yes".
function makeApp(logs) {
  const files = new Map();
  let n = 0;
  const app = {
    data: () => ({ logs }),
    persist() {}, render() {}, toast() {}, $: () => null,
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    confirmDialog: (_t, _m, _ok, yes) => yes(),
    uid: () => `id-${String(++n).padStart(8, '0')}`,
    store: {
      save: async (id, bytes) => { files.set(id, bytes); return true; },
      open: async (id) => files.has(id),
      list: async () => [...files.keys()],
      remove: async (id) => { files.delete(id); }
    }
  };
  return { app, files };
}
const pdf = (name, size = 2048) => ({ name, size, type: 'application/pdf', arrayBuffer: async () => new Uint8Array([37, 80, 68, 70, 45]).buffer });

(async () => {
  await test('entries done the same day are one visit', () => {
    const visits = L.groupVisits([
      { id: 'a', date: '2026-08-26', service: 'Oil change', cost: 60, odometer: 61400, by: 'Shop' },
      { id: 'b', date: '2026-08-26', service: 'Tire rotation', cost: 25, odometer: 61400, by: 'Shop' },
      { id: 'c', date: '2026-05-01', service: 'Wipers', cost: 20, odometer: 58000, by: 'DIY' },
      { id: 'd', date: '2026-08-26', service: 'Air filter', cost: 30, odometer: 61401, by: 'DIY' }
    ]);
    assert.equal(visits.length, 2);
    assert.deepEqual(visits.map((v) => v.date), ['2026-08-26', '2026-05-01']); // newest first
    const [big] = visits;
    assert.deepEqual(big.entries.map((e) => e.id), ['a', 'd', 'b']); // priciest first
    assert.equal(big.total, 115);
    assert.equal(big.odometer, 61401);
    assert.equal(big.by, 'DIY + Shop');
    assert.deepEqual(L.groupVisits([]), []);
  });

  await test('a receipt added to a visit is stored once and listed on every entry of that visit', async () => {
    const logs = [{ id: 'a', date: '2026-08-26' }, { id: 'b', date: '2026-08-26' }, { id: 'c', date: '2026-05-01' }];
    const { app, files } = makeApp(logs);
    const R = RU.create(app);
    assert.equal(await R.attach(pdf('Les Schwab 4412.pdf'), [logs[0], logs[1]]), undefined);
    assert.equal(files.size, 1);
    assert.equal(logs[0].receipts[0].id, logs[1].receipts[0].id);
    assert.equal(logs[0].receipts[0].name, 'Les Schwab 4412.pdf');
    assert.equal(logs[2].receipts, undefined);
    assert.equal(R.receiptsOf(logs).length, 1);
  });

  await test('only PDFs, and not huge ones', async () => {
    const logs = [{ id: 'a' }];
    const { app, files } = makeApp(logs);
    const R = RU.create(app);
    assert.match(await R.attach({ name: 'photo.jpg', size: 10, type: 'image/jpeg' }, logs), /isn't a PDF/);
    assert.match(await R.attach(pdf('huge.pdf', RU.MAX_BYTES + 1), logs), /is over/);
    assert.equal(files.size, 0);
  });

  await test('removing a receipt from a visit deletes the file once nothing lists it', async () => {
    const logs = [{ id: 'a' }, { id: 'b' }];
    const { app, files } = makeApp(logs);
    const R = RU.create(app);
    await R.attach(pdf('r.pdf'), logs);
    const id = logs[0].receipts[0].id;
    R.remove(id, ['a', 'b']);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(logs.map((l) => l.receipts.length), [0, 0]);
    assert.equal(files.size, 0);
  });

  await test('pruning keeps files still listed and drops orphans (a deleted entry)', async () => {
    const logs = [{ id: 'a' }, { id: 'b' }];
    const { app, files } = makeApp(logs);
    const R = RU.create(app);
    await R.attach(pdf('keep.pdf'), [logs[0]]);
    await R.attach(pdf('orphan.pdf'), [logs[1]]);
    logs.splice(1, 1); // entry b deleted
    await R.prune();
    assert.deepEqual([...files.keys()], [logs[0].receipts[0].id]);
  });

  await test('chips: escaped names, open / remove / add actions for the visit', async () => {
    const logs = [{ id: 'a' }, { id: 'b' }];
    const { app } = makeApp(logs);
    const R = RU.create(app);
    await R.attach(pdf('<b>bad</b>.pdf'), logs);
    const html = R.chipsHtml(logs);
    assert.doesNotMatch(html, /<b>bad/);
    assert.match(html, /data-action="rcptopen" data-id="id-00000001"/);
    assert.match(html, /data-action="rcptdel" data-id="id-00000001\|a,b"/);
    assert.match(html, /data-action="rcptadd" data-id="a,b">\+ RECEIPT/);
    assert.doesNotMatch(R.chipsHtml(logs, { add: false }), /rcptadd/);
  });

  console.log(`\n${passed} receipt tests passed`);
})();
