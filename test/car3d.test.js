const assert = require('node:assert/strict');
global.self = global; // three.js's classic build attaches to self
const G = require('../lib/car3d.js');
const L = require('../lib/logic.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

test('NHTSA body classes map to 3D body styles', () => {
  const cases = {
    'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)': 'suv',
    'Crossover Utility Vehicle (CUV)': 'suv',
    Pickup: 'pickup',
    'Sedan/Saloon': 'sedan',
    'Coupe': 'coupe',
    'Hatchback/Liftback/Notchback': 'hatchback',
    'Wagon': 'wagon',
    'Minivan': 'van',
    'Cargo Van': 'van',
    'Convertible/Cabriolet': 'convertible',
    'Motorcycle - Sport': 'motorcycle',
    '': '',
    'Incomplete - Chassis Cab': ''
  };
  for (const [cls, want] of Object.entries(cases)) assert.equal(G.bodyFromNhtsa(cls), want, cls);
  assert.equal(G.bodyFromNhtsa('Sedan/Saloon', 2), 'coupe');
});

test('VIN decode passes doors and body class through', () => {
  const d = L.vehicleFromNhtsa({ Make: 'FORD', Model: 'F-150', ModelYear: '2019', BodyClass: 'Pickup', Doors: '4' });
  assert.equal(d.doors, 4);
  assert.equal(d.baseModel, 'F-150');
  assert.equal(G.bodyFromNhtsa(d.bodyClass, d.doors), 'pickup');
});

test('every body style builds a sensible, centred model', () => {
  const THREE = require('../lib/vendor/three.min.js');
  for (const t of [...G.BODY_TYPES, { value: '' }]) {
    const car = G.buildCar({ body: t.value, color: '#336699' });
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(box.min.y) < 0.01, `${t.value || 'default'} sits on the ground`);
    assert.ok(Math.abs(box.min.x + box.max.x) < 0.1, `${t.value || 'default'} is centred`);
    assert.ok(size.x > 1.5 && size.x < 6.5 && size.y > 0.9 && size.y < 2.3, `${t.value || 'default'} size ${size.x.toFixed(2)}x${size.y.toFixed(2)}`);
  }
});

test('a car is built to the real dimensions when they are known', () => {
  const THREE = require('../lib/vendor/three.min.js');
  const camry = { L: 4.879, W: 1.839, H: 1.445, wb: 2.824 };
  const car = G.buildCar({ body: 'sedan', color: '#336699', dims: camry });
  const size = new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - camry.L) < 0.08, `length ${size.x.toFixed(3)}`);
  assert.ok(Math.abs(size.y - camry.H) < 0.05, `height ${size.y.toFixed(3)}`);
  assert.ok(size.z > camry.W - 0.02 && size.z < camry.W + 0.3, `width ${size.z.toFixed(3)} (mirrors stick out)`);
  // wheels a wheelbase apart
  const s = G.sizeFor(G.STYLES.sedan, camry);
  assert.equal(s.wb, camry.wb);
  // nonsense from a bad parse falls back to the style's own proportions
  const odd = G.sizeFor(G.STYLES.sedan, { L: 40, W: 0.1, H: null, wb: 9 });
  assert.equal(odd.L, G.STYLES.sedan.L);
  assert.equal(odd.H, G.STYLES.sedan.H);
  assert.ok(odd.wb / odd.L > 0.48 && odd.wb / odd.L < 0.75);
});

test('glass, lights and trim are their own materials on the body', () => {
  const car = G.buildCar({ body: 'suv', color: '#336699' });
  const body = car.children.find((m) => Array.isArray(m.material));
  const used = new Set(body.geometry.groups.map((g) => g.materialIndex));
  for (const i of [0, 1, 2, 3, 4]) assert.ok(used.has(i), `material ${i} used`);
});

console.log(`\n${passed} car3d tests passed`);
