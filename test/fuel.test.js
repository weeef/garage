const assert = require('node:assert/strict');
const F = require('../lib/fuel.js');
const S = require('../lib/sync.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

const SHELL = `SHELL
1234 MAIN ST
SPOKANE WA 99201
DATE 03/14/2025  TIME 17:42
PUMP# 7
UNLEADED REG
GALLONS   12.345
PRICE/GAL $3.459
FUEL SALE $42.70
TOTAL $42.70
VISA ************1234`;

const COSTCO = `COSTCO WHOLESALE #123
GASOLINE
Pump Gallons Price
06   15.234 G  $3.199/G
Regular
Total Sale $48.73
03/02/25 10:15`;

const EMAIL = `Your receipt from Chevron
Mar 3, 2025
Unleaded Plus 11.203 gal @ $4.299/gal
Total $48.16`;

const SNACKS = `7-ELEVEN
05/20/2025
DIESEL 20.000 GAL @ 4.100
CHIPS 2.49
TOTAL 84.49`;

const LITERS = `Petro-Canada
2025-01-11
Regular 45.20 L @ 1.659 /L
TOTAL $74.99`;

test('reads common receipt layouts', () => {
  const [s] = F.parseReceipts(SHELL);
  assert.deepEqual(s, { date: '2025-03-14', station: 'Shell', grade: 'regular', volume: 12.345, volumeUnit: 'gal', price: 3.459, total: 42.7, odometer: null });
  const [c] = F.parseReceipts(COSTCO);
  assert.equal(c.station, 'Costco');
  assert.equal(c.date, '2025-03-02');
  assert.equal(c.volume, 15.234);
  assert.equal(c.price, 3.199);
  assert.equal(c.total, 48.73);
  const [e] = F.parseReceipts(EMAIL);
  assert.equal(e.date, '2025-03-03');
  assert.equal(e.grade, 'midgrade');
  assert.equal(e.total, 48.16);
});

test('snacks on the same receipt are left out of the fuel cost', () => {
  const [r] = F.parseReceipts(SNACKS);
  assert.equal(r.grade, 'diesel');
  assert.equal(r.volume, 20);
  assert.equal(r.total, 82); // 20 gal x $4.10, not the $84.49 total
});

test('liters are converted for a vehicle in miles, and kept for one in km', () => {
  const [r] = F.parseReceipts(LITERS);
  assert.equal(r.volumeUnit, 'L');
  const mi = F.toFillUp(r, { id: 'v', unit: 'mi' }, '2025-06-01');
  assert.equal(mi.volume, 11.941);
  assert.equal(mi.price, 6.28);
  assert.equal(mi.total, 74.99);
  const km = F.toFillUp(r, { id: 'v', unit: 'km' }, '2025-06-01');
  assert.equal(km.volume, 45.2);
  assert.equal(km.price, 1.659);
});

test('several receipts pasted together come out separately', () => {
  const all = F.parseReceipts([SHELL, EMAIL, LITERS].join('\n\n'));
  assert.deepEqual(all.map((r) => r.date), ['2025-03-14', '2025-03-03', '2025-01-11']);
});

test('text with no fuel purchase in it gives nothing', () => {
  assert.deepEqual(F.parseReceipts('Thanks for shopping\nHave a nice day'), []);
});

test('a missing volume, price or total is worked out from the other two', () => {
  assert.equal(F.complete({ volume: 10, price: 3.5 }).total, 35);
  assert.equal(F.complete({ volume: 10, total: 35 }).price, 3.5);
  assert.equal(F.complete({ price: 3.5, total: 35 }).volume, 10);
});

const fill = (date, odometer, volume, total, extra) => ({ id: date, vehicleId: 'v', date, odometer, volume, total, price: total / volume, ...extra });

test('totals: all time, this year, last 12 months, by year, average price', () => {
  const now = new Date('2025-06-15T12:00:00');
  const st = F.fuelStats([
    fill('2024-03-01', 10000, 10, 30), fill('2024-08-01', 10300, 10, 35),
    fill('2025-01-10', 10600, 10, 32), fill('2025-05-01', 10900, 10, 40)
  ], { unit: 'mi' }, now);
  assert.equal(st.total, 137);
  assert.equal(st.thisYear, 72);
  assert.equal(st.last12, 107); // since 2024-06-15
  assert.deepEqual(st.byYear.map((y) => [y.year, y.total, y.fills]), [[2025, 72, 2], [2024, 65, 2]]);
  assert.equal(st.avgPrice, 3.425);
  assert.equal(st.perYear, 107); // a year of records: the last 12 months
  assert.equal(st.last.date, '2025-05-01');
});

test('fuel economy uses full tanks only, and partial fills roll into the next full one', () => {
  const st = F.fuelStats([
    fill('2025-01-01', 1000, 12, 40), fill('2025-01-08', 1150, 5, 17, { full: false }),
    fill('2025-01-15', 1300, 7, 24), fill('2025-01-22', 1600, 10, 33)
  ], { unit: 'mi' }, new Date('2025-02-01T12:00:00'));
  assert.equal(st.economy, 27.3); // 600 mi / 22 gal (5 + 7 + 10)
  assert.equal(st.economyUnit, 'mpg');
  assert.equal(st.costPerDistance, 0.123); // $74 for 600 mi (the first tank fuels earlier driving)
});

test('metric vehicles get L/100 km', () => {
  const st = F.fuelStats([fill('2025-01-01', 10000, 40, 70), fill('2025-01-10', 10500, 35, 60)], { unit: 'km' }, new Date('2025-02-01'));
  assert.equal(st.economy, 7); // 35 L over 500 km
  assert.equal(st.economyUnit, 'L/100 km');
  assert.equal(st.volumeUnit, 'L');
});

test('a yearly estimate needs a few weeks of history', () => {
  const now = new Date('2025-03-01T12:00:00');
  assert.equal(F.fuelStats([fill('2025-02-25', 0, 10, 40)], { unit: 'mi' }, now).perYear, null);
  const st = F.fuelStats([fill('2025-01-01', 0, 10, 40), fill('2025-02-01', 0, 10, 40)], { unit: 'mi' }, now);
  assert.equal(st.perYear, 495); // $80 over the 59 days since the first fill-up, scaled to a year
  assert.equal(st.perMonth, 41);
});

test('old receipts still give a yearly estimate, not $0', () => {
  const now = new Date('2026-10-04T12:00:00');
  const st = F.fuelStats([fill('2024-11-20', 0, 14, 43.7), fill('2025-03-03', 0, 11, 48.16), fill('2025-03-14', 0, 12, 42.7)], { unit: 'mi' }, now);
  assert.equal(st.last12, 0);
  assert.equal(st.perYear, 287); // $134.56 over 114 days of records plus one more ~57-day tank
});

test('fill-ups sync between phone and PC like the rest of the data', () => {
  const v = { id: 'v', name: 'Car', odometer: 1000 };
  const pc = { vehicles: [v], logs: [], schedules: [], fuel: [{ ...fill('2025-01-01', 1200, 10, 35), updatedAt: 5 }] };
  const phone = { vehicles: [v], logs: [], schedules: [] }; // a phone from before fuel tracking
  const merged = S.mergeData(phone, pc);
  assert.equal(merged.fuel.length, 1);
  assert.equal(merged.vehicles[0].odometer, 1200); // fill-up odometers count
  const orphan = S.mergeData({ vehicles: [], logs: [], schedules: [], fuel: [] }, { ...pc, vehicles: [] });
  assert.equal(orphan.fuel.length, 0);
  const next = { vehicles: [v], logs: [], schedules: [] };
  S.stampChanges(null, next, 9); // data without a fuel list still saves
  assert.deepEqual(next.deleted, {});
});

console.log(`\n${passed} fuel tests passed`);
