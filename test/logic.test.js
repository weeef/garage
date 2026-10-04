const assert = require('node:assert/strict');
const L = require('../lib/logic.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

const car = { id: 'v1', odometer: 100000 };
const oil = { id: 's1', vehicleId: 'v1', name: 'Oil & filter change', intervalMiles: 5000, intervalMonths: 6 };
const NOW = '2026-10-03';

test('addMonths clamps to month end', () => {
  assert.equal(L.formatDate(L.addMonths(new Date(2026, 0, 31), 1)), '2026-02-28');
  assert.equal(L.formatDate(L.addMonths(new Date(2028, 0, 31), 1)), '2028-02-29');
  assert.equal(L.formatDate(L.addMonths(new Date(2026, 10, 15), 3)), '2027-02-15');
});

test('parseDate is local, no off-by-one', () => {
  const d = L.parseDate('2026-10-03');
  assert.equal(d.getDate(), 3);
  assert.equal(d.getMonth(), 9);
  assert.equal(L.parseDate('garbage'), null);
});

test('a differently named log of the same work resets the schedule', () => {
  const brakes = { id: 's2', vehicleId: 'v1', name: 'Brake pads & rotors inspection', intervalMiles: 20000, intervalMonths: 12 };
  const fluid = { id: 's3', vehicleId: 'v1', name: 'Brake fluid flush', intervalMiles: 30000, intervalMonths: 24 };
  const logs = [
    { vehicleId: 'v1', service: 'Brake pads & rotors inspection', date: '2018-02-08', odometer: 27876 },
    { vehicleId: 'v1', service: 'Brake service', date: '2026-07-11', odometer: 99556 }
  ];
  const st = L.computeStatus(brakes, logs, car, NOW);
  assert.equal(st.last.date, '2026-07-11');
  assert.equal(st.status, 'ok');
  assert.equal(L.computeStatus(fluid, logs, car, NOW).status, 'unknown', 'brake job is not a fluid flush');
});

test('service topics', () => {
  assert.equal(L.serviceTopic('Replaced front pads and rotors'), 'brakes');
  assert.equal(L.serviceTopic('Brake fluid exchange'), 'brake-fluid');
  assert.equal(L.serviceTopic('Oil & filter change'), 'oil');
  assert.equal(L.serviceTopic('Oil leak repair'), null);
  assert.equal(L.serviceTopic('Cabin air filter'), 'cabin-filter');
  assert.equal(L.serviceTopic('Engine air filter'), 'air-filter');
  assert.equal(L.serviceTopic('Wiper blades'), 'wipers');
  assert.equal(L.serviceTopic('Detail'), null);
});

test('no log means unknown', () => {
  const st = L.computeStatus(oil, [], car, NOW);
  assert.equal(st.status, 'unknown');
});

test('ok when well within both intervals', () => {
  const logs = [{ vehicleId: 'v1', service: 'oil & filter change', date: '2026-09-01', odometer: 99000, cost: 50 }];
  const st = L.computeStatus(oil, logs, car, NOW);
  assert.equal(st.status, 'ok');
  assert.equal(st.nextMiles, 104000);
  assert.equal(st.milesLeft, 4000);
  assert.equal(L.formatDate(st.nextDate), '2027-03-01');
});

test('soon by miles', () => {
  const logs = [{ vehicleId: 'v1', service: 'Oil & filter change', date: '2026-09-01', odometer: 95200, cost: 0 }];
  const st = L.computeStatus(oil, logs, car, NOW);
  assert.equal(st.milesLeft, 200);
  assert.equal(st.status, 'soon');
});

test('soon by date (within 30 days)', () => {
  const logs = [{ vehicleId: 'v1', service: 'Oil & filter change', date: '2026-04-20', odometer: 99500, cost: 0 }];
  const st = L.computeStatus(oil, logs, car, NOW);
  assert.equal(st.daysLeft, 17);
  assert.equal(st.status, 'soon');
});

test('overdue by miles beats ok date', () => {
  const logs = [{ vehicleId: 'v1', service: 'Oil & filter change', date: '2026-09-20', odometer: 94000, cost: 0 }];
  const st = L.computeStatus(oil, logs, car, NOW);
  assert.equal(st.milesLeft, -1000);
  assert.equal(st.status, 'overdue');
});

test('overdue by date beats ok miles', () => {
  const logs = [{ vehicleId: 'v1', service: 'Oil & filter change', date: '2026-01-01', odometer: 99900, cost: 0 }];
  const st = L.computeStatus(oil, logs, car, NOW);
  assert.ok(st.daysLeft < 0);
  assert.equal(st.status, 'overdue');
});

test('time-only schedule works (battery test)', () => {
  const batt = { id: 's2', vehicleId: 'v1', name: 'Battery test', intervalMiles: 0, intervalMonths: 12 };
  const logs = [{ vehicleId: 'v1', service: 'Battery test', date: '2026-06-01', odometer: 98000, cost: 0 }];
  const st = L.computeStatus(batt, logs, car, NOW);
  assert.equal(st.nextMiles, null);
  assert.equal(st.status, 'ok');
});

test('uses the latest matching log and ignores other vehicles', () => {
  const logs = [
    { vehicleId: 'v1', service: 'Oil & filter change', date: '2025-01-01', odometer: 60000, cost: 0 },
    { vehicleId: 'v1', service: 'Oil & filter change', date: '2026-09-01', odometer: 99000, cost: 0 },
    { vehicleId: 'v2', service: 'Oil & filter change', date: '2026-09-30', odometer: 5000, cost: 0 }
  ];
  const st = L.computeStatus(oil, logs, car, NOW);
  assert.equal(st.last.odometer, 99000);
});

test('allStatuses sorts overdue first, unknown last', () => {
  const schedules = [
    { id: 'a', vehicleId: 'v1', name: 'Unlogged', intervalMiles: 1000, intervalMonths: 0 },
    oil,
    { id: 'b', vehicleId: 'v1', name: 'Tire rotation', intervalMiles: 7500, intervalMonths: 6 }
  ];
  const logs = [
    { vehicleId: 'v1', service: 'Oil & filter change', date: '2026-09-01', odometer: 99000, cost: 0 },
    { vehicleId: 'v1', service: 'Tire rotation', date: '2025-01-01', odometer: 80000, cost: 0 }
  ];
  const out = L.allStatuses(car, schedules, logs, NOW).map((s) => s.status);
  assert.deepEqual(out, ['overdue', 'ok', 'unknown']);
});

test('vehicleStats totals, last 12 months and cost per mile', () => {
  const logs = [
    { vehicleId: 'v1', service: 'a', date: '2024-01-01', odometer: 80000, cost: 100, by: 'Shop' },
    { vehicleId: 'v1', service: 'b', date: '2026-05-01', odometer: 100000, cost: 50.5, by: 'DIY' }
  ];
  const s = L.vehicleStats(car, logs, NOW);
  assert.equal(s.count, 2);
  assert.equal(s.total, 150.5);
  assert.equal(s.last12, 50.5);
  assert.equal(s.diyCount, 1);
  assert.ok(Math.abs(s.costPerMile - 150.5 / 20000) < 1e-9);
  assert.equal(L.vehicleStats(car, [], NOW).costPerMile, null);
});

test('highestOdometer', () => {
  const logs = [{ vehicleId: 'v1', odometer: 120000 }, { vehicleId: 'v2', odometer: 999999 }];
  assert.equal(L.highestOdometer(car, logs), 120000);
});

test('CSV escapes commas, quotes and newlines', () => {
  const logs = [{ vehicleId: 'v1', service: 'Oil, "synthetic"', date: '2026-01-01', odometer: 1, cost: 10, by: 'DIY', notes: 'line1\nline2' }];
  const csv = L.logsToCsv(car, logs);
  assert.ok(csv.startsWith('Date,Odometer,Service,Cost,By,Notes\r\n'));
  assert.ok(csv.includes('"Oil, ""synthetic"""'));
  assert.ok(csv.includes('"line1\nline2"'));
});

// A row shaped like NHTSA's DecodeVinValues result (fields trimmed to what we use).
const NHTSA_ROW = {
  Make: 'FORD', Model: 'Focus', ModelYear: '2012', Trim: 'SE', Series: '', ErrorCode: '1',
  DisplacementL: '2.0', EngineCylinders: '4', FuelTypePrimary: 'Gasoline', BodyClass: 'Hatchback/Liftback/Notchback'
};

test('normalizeVin uppercases and strips spaces/dashes', () => {
  assert.equal(L.normalizeVin(' 1m8g-dm9a xkp 042788 '), '1M8GDM9AXKP042788'.toUpperCase());
});

test('vinCheckDigitOk accepts known-valid VINs and rejects typos', () => {
  assert.equal(L.vinCheckDigitOk('1M8GDM9AXKP042788'), true);  // classic example, check digit X
  assert.equal(L.vinCheckDigitOk('11111111111111111'), true);  // check digit 1
  assert.equal(L.vinCheckDigitOk('1M8GDM9AXKP042789'), false); // one changed digit breaks it
  assert.equal(L.vinCheckDigitOk('1M8GDM9A1KP042788'), false); // wrong check digit
  assert.equal(L.vinCheckDigitOk('1FAHP3K22CL123456'), false); // NHTSA flags this one too
  assert.equal(L.vinCheckDigitOk('short'), false);
});

test('vinProblem reports shape problems', () => {
  assert.equal(L.vinProblem('1M8GDM9AXKP042788'), null);
  assert.match(L.vinProblem('1M8GDM9A'), /8\/17/);
  assert.match(L.vinProblem('1M8GDM9AXKP04278O'), /I, O or Q/);
  assert.match(L.vinProblem('1M8GDM9AXKP0427!8'), /letters and digits/);
  assert.equal(L.vinProblem(''), '0/17 characters');
});

test('vehicleFromNhtsa maps fields, title-cases make, joins trim', () => {
  const d = L.vehicleFromNhtsa(NHTSA_ROW);
  assert.equal(d.ok, true);
  assert.equal(d.year, 2012);
  assert.equal(d.make, 'Ford');
  assert.equal(d.model, 'Focus SE');
  assert.equal(d.engine, '2.0L 4-cyl Gasoline');
  assert.equal(L.describeDecoded(d), '2012 Ford Focus SE · 2.0L 4-cyl Gasoline');
});

test('vehicleFromNhtsa make casing and trim edge cases', () => {
  assert.equal(L.vehicleFromNhtsa({ Make: 'MERCEDES-BENZ', Model: 'C300' }).make, 'Mercedes-Benz');
  assert.equal(L.vehicleFromNhtsa({ Make: 'BMW', Model: '328i' }).make, 'BMW');
  assert.equal(L.vehicleFromNhtsa({ Make: 'LAND ROVER', Model: 'Defender' }).make, 'Land Rover');
  assert.equal(L.vehicleFromNhtsa({ Make: 'Ford', Model: 'F-150', Trim: '' }).model, 'F-150');
  assert.equal(L.vehicleFromNhtsa({ Make: 'FORD', Model: 'Focus ST', Trim: 'ST' }).model, 'Focus ST'); // no duplicate trim
  assert.equal(L.vehicleFromNhtsa({ Make: 'TOYOTA', Model: 'Camry', Trim: '', Series: 'LE' }).model, 'Camry LE');
});

test('vehicleFromNhtsa flags an empty / failed decode', () => {
  assert.equal(L.vehicleFromNhtsa({ Make: '', Model: '', ModelYear: '', ErrorCode: '7' }).ok, false);
  assert.equal(L.vehicleFromNhtsa(null).ok, false);
});

test('registration: ok, due soon within 30 days, overdue once past', () => {
  const today = new Date(2026, 9, 4);
  assert.equal(L.registrationStatus({}, today), null);
  assert.deepEqual(L.registrationStatus({ regExpires: '2027-03-31' }, today), { date: '2027-03-31', days: 178, when: 'in 6 months', status: 'ok' });
  assert.equal(L.registrationStatus({ regExpires: '2026-10-20' }, today).status, 'soon');
  assert.equal(L.registrationStatus({ regExpires: '2026-10-20' }, today).when, 'in 16 days');
  assert.equal(L.registrationStatus({ regExpires: '2026-10-04' }, today).when, 'today');
  const late = L.registrationStatus({ regExpires: '2026-09-01' }, today);
  assert.equal(late.status, 'overdue');
  assert.equal(late.when, '33 days ago');
});

test('registration: renewing moves the date a year on (from today if it had long lapsed)', () => {
  const today = new Date(2026, 9, 4);
  assert.equal(L.renewedRegistration({ regExpires: '2026-10-20' }, 1, today), '2027-10-20');
  assert.equal(L.renewedRegistration({ regExpires: '2026-09-01' }, 1, today), '2027-09-01'); // a month late keeps its cycle
  assert.equal(L.renewedRegistration({ regExpires: '2024-01-01' }, 1, today), '2027-10-04');
  assert.equal(L.renewedRegistration({}, 2, today), '2028-10-04');
});

test('license plates are cleaned up', () => {
  assert.equal(L.normalizePlate(' abc-123 '), 'ABC-123');
  assert.equal(L.normalizePlate('7xyz  <b>9'), '7XYZ B9');
  assert.equal(L.normalizePlate('ABCDEFGHIJKLMN'), 'ABCDEFGHIJ');
});

console.log(`\n${passed} passed`);
