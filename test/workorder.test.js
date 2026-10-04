const assert = require('node:assert/strict');
const W = require('../lib/workorder.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}
const car = { id: 'v1', unit: 'mi' };

const SCHWAB = `LES SCHWAB TIRE CENTERS
1234 NE Main St, Bend, OR 97701   (541) 555-0100
INVOICE # 0123456789          DATE 03/02/2024
Customer: JORDAN B
Vehicle: 2013 FORD F-150   License: ABC123
Mileage: 98,412
QTY  DESCRIPTION                                   PRICE     AMOUNT
4    LT275/65R18 OPEN COUNTRY A/T III              219.99    879.96
4    VALVE STEM                                      4.00     16.00
4    TIRE DISPOSAL FEE                               3.50     14.00
1    ROTATE & BALANCE (FREE)                         0.00      0.00
1    ALIGNMENT 4 WHEEL                             119.99    119.99
1    FLAT REPAIR - NO CHARGE                         0.00      0.00
                                          SUBTOTAL          1029.95
                                          TAX                  0.00
                                          TOTAL            $1,029.95
VISA ****1234                                               1,029.95
Thank you for choosing Les Schwab!`;

test('Les Schwab invoice: header fields', () => {
  const o = W.parseWorkOrder(SCHWAB);
  assert.equal(o.shop, 'Les Schwab');
  assert.equal(o.date, '2024-03-02');
  assert.equal(o.odometer, 98412);
  assert.equal(o.invoice, '0123456789');
  assert.equal(o.total, 1029.95);
});

test('Les Schwab invoice: services, with fees folded in so costs add up', () => {
  const e = W.toEntries(W.parseWorkOrder(SCHWAB), car, []);
  const by = Object.fromEntries(e.map((x) => [x.service, x]));
  assert.deepEqual(Object.keys(by).sort(), ['Flat repair', 'New tires', 'Tire rotation', 'Wheel alignment']);
  assert.equal(by['New tires'].cost, 909.96, 'tires + valve stems + disposal');
  assert.match(by['New tires'].notes, /fees\/tax/);
  assert.equal(by['Wheel alignment'].cost, 119.99);
  assert.equal(by['Tire rotation'].cost, 0);
  const sum = e.reduce((s, x) => s + x.cost, 0);
  assert.equal(Math.round(sum * 100) / 100, 1029.95);
  assert.ok(e.every((x) => x.date === '2024-03-02' && x.odometer === 98412 && x.by === 'Shop'));
  assert.match(by['New tires'].notes, /^Les Schwab · #0123456789/);
});

const JIFFY = `Your Jiffy Lube receipt
Service Date: Jan 15, 2025
Odometer In
45,880
Signature Service Oil Change - Full Synthetic 5W-30     $89.99
Engine Air Filter                                        $34.99
Cabin Air Filter                                         $44.99
Environmental Fee                                         $3.50
Subtotal                                                $173.47
Sales Tax                                                $11.10
Total                                                   $184.57
Next service due at 50,880 miles or 07/15/2025`;

test('Jiffy Lube email: mileage on next line, next-due date ignored', () => {
  const o = W.parseWorkOrder(JIFFY);
  assert.equal(o.shop, 'Jiffy Lube');
  assert.equal(o.date, '2025-01-15');
  assert.equal(o.odometer, 45880);
  assert.equal(o.total, 184.57);
  const e = W.toEntries(o, car, []);
  assert.deepEqual(e.map((x) => x.service), ['Oil & filter change', 'Engine air filter', 'Cabin air filter']);
  assert.equal(e[0].cost, 104.59, 'oil + fee + tax');
});

const DEALER = `Smith Toyota of Spokane
REPAIR ORDER: RO-558812   Date: 2023-11-04
Mileage In: 61,200   Mileage Out: 61,203
Replace front brake pads and resurface rotors   289.50
Brake fluid exchange                            129.00
Multi-point inspection                            0.00
Shop supplies                                    18.40
Total Due   $436.90`;

test('dealer repair order', () => {
  const o = W.parseWorkOrder(DEALER);
  assert.equal(o.shop, 'Smith Toyota of Spokane');
  assert.equal(o.date, '2023-11-04');
  assert.equal(o.odometer, 61200);
  const e = W.toEntries(o, car, []);
  assert.deepEqual(e.map((x) => x.service).sort(), ['Brake fluid flush', 'Brake service', 'Inspection']);
  assert.equal(Math.round(e.reduce((s, x) => s + x.cost, 0) * 100), 43690);
});

test('summary without prices still finds the work', () => {
  const o = W.parseWorkOrder('Thanks for visiting Discount Tire on 6/1/2024!\nWe rotated and balanced your tires.\nMileage: 30100');
  const e = W.toEntries(o, car, []);
  assert.equal(o.shop, 'Discount Tire');
  assert.deepEqual(e.map((x) => x.service), ['Tire rotation']);
  assert.equal(e[0].odometer, 30100);
});

test('already-logged work is flagged', () => {
  const e = W.toEntries(W.parseWorkOrder(SCHWAB), car, [{ vehicleId: 'v1', date: '2024-03-02', service: 'wheel alignment' }]);
  assert.equal(e.find((x) => x.service === 'Wheel alignment').duplicate, true);
  assert.equal(e.find((x) => x.service === 'New tires').duplicate, false);
});

test('PDF text fragments are rebuilt into rows', () => {
  const it = (s, x, y, w) => ({ str: s, transform: [1, 0, 0, 1, x, y], width: w, height: 10 });
  const text = W.linesFromPdfItems([
    it('ALIGNMENT 4 WHEEL', 40, 500, 110), it('119.99', 400, 500.5, 30),
    it('Mileage:', 40, 600, 40), it('98,412', 85, 600, 30)
  ]);
  assert.equal(text, 'Mileage: 98,412\nALIGNMENT 4 WHEEL   119.99');
});

test('CARFAX text is recognised', () => {
  assert.ok(W.looksLikeCarfax('CARFAX Vehicle History Report'));
  assert.ok(!W.looksLikeCarfax(SCHWAB));
});

console.log(`\n${passed} work order tests passed`);
