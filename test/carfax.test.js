const assert = require('node:assert/strict');
const C = require('../lib/carfax.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

// Shaped like a CARFAX report's "Detailed History" table copied from the browser.
const REPORT = `
Service History
Date	Mileage	Source	Comments
05/14/2021	45,123	Jiffy Lube
Pittsburgh, PA
(412) 555-1234
www.jiffylube.com	Vehicle serviced
- Oil and filter changed
- Tire(s) rotated
- Cabin air filter replaced
11/02/2021	51,880 mi	Discount Tire
Monroeville, PA	Tire(s) mounted
Wheel(s) balanced
03/20/2022	55,010	Pennsylvania
Motor Vehicle Dept.	Title issued or updated
Registration renewed
Jun 3, 2022	58,400 miles	Toyota of Pittsburgh	Maintenance inspection completed
Brake fluid flushed/changed
Spark plugs replaced
`;

test('finds every dated record', () => {
  const r = C.parseCarfax(REPORT);
  assert.deepEqual(r.map((x) => x.date), ['2021-05-14', '2021-11-02', '2022-03-20', '2022-06-03']);
  assert.deepEqual(r.map((x) => x.odometer), [45123, 51880, 55010, 58400]);
});

test('shop names are not mistaken for work', () => {
  const r = C.parseCarfax(REPORT);
  assert.equal(r[0].shop, 'Jiffy Lube');
  assert.equal(r[1].shop, 'Discount Tire');
  assert.equal(r[3].shop, 'Toyota of Pittsburgh');
});

test('title/registration records are not services', () => {
  const r = C.parseCarfax(REPORT);
  assert.equal(r[2].isService, false);
});

test('work maps onto schedule names; "Vehicle serviced" dropped when specifics exist', () => {
  const r = C.parseCarfax(REPORT);
  const v = { id: 'v1', unit: 'mi' };
  const e = C.toEntries(r, v, []);
  const on = (d) => e.filter((x) => x.date === d).map((x) => x.service);
  assert.deepEqual(on('2021-05-14'), ['Oil & filter change', 'Tire rotation', 'Cabin air filter']);
  assert.deepEqual(on('2021-11-02'), ['Tire(s) mounted', 'Wheel(s) balanced']);
  assert.deepEqual(on('2022-06-03'), ['Brake fluid flush', 'Spark plugs']);
  assert.ok(e.every((x) => x.by === 'Shop' && x.notes.startsWith('Imported from CARFAX')));
});

test('already-logged services are flagged as duplicates', () => {
  const v = { id: 'v1', unit: 'mi' };
  const logs = [{ vehicleId: 'v1', date: '2021-05-14', service: 'oil & filter change' }];
  const e = C.toEntries(C.parseCarfax(REPORT), v, logs);
  assert.equal(e.find((x) => x.service === 'Oil & filter change').duplicate, true);
  assert.equal(e.find((x) => x.service === 'Tire rotation').duplicate, false);
});

test('miles convert for a km vehicle', () => {
  const e = C.toEntries(C.parseCarfax('01/01/2020 10,000 mi\nOil changed'), { id: 'v', unit: 'km' }, []);
  assert.equal(e[0].odometer, 16090);
});

test('record without mileage keeps odometer null', () => {
  const e = C.toEntries(C.parseCarfax('2020-01-01\nQuick Lube Shop\nOil and filter changed'), { id: 'v', unit: 'mi' }, []);
  assert.equal(e[0].odometer, null);
  assert.equal(e[0].service, 'Oil & filter change');
});

test('junk text yields nothing', () => {
  assert.equal(C.parseCarfax('hello there\nno dates here').length, 0);
});

console.log(`\n${passed} carfax tests passed`);
