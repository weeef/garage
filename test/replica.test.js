const assert = require('node:assert/strict');
global.self = global; // three.js's classic build attaches to self
const THREE = require('../lib/vendor/three.min.js');
const R = require('../lib/replica.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

const UID = (n) => String(n).repeat(32).slice(0, 32);
const camry = { year: 2018, make: 'Toyota', model: 'Camry LE', baseModel: 'Camry' };

test('the search is for the year, make and base model', () => {
  assert.equal(R.queryFor(camry), '2018 Toyota Camry');
  assert.equal(R.queryFor({ make: 'Ford', model: 'F-150' }), 'Ford F-150');
  assert.match(R.searchUrl('2018 Toyota Camry'), /^https:\/\/api\.sketchfab\.com\/v3\/search\?type=models&q=2018\+Toyota\+Camry&downloadable=true/);
  assert.equal(R.downloadInfoUrl(UID('a')), `https://api.sketchfab.com/v3/models/${UID('a')}/download`);
});

test('results: matching names first, age-restricted and malformed ones left out', () => {
  const json = { results: [
    { uid: UID('1'), name: 'Bus Simulator India - Traffic Cars', user: { displayName: 'A' }, license: { label: 'CC Attribution' }, faceCount: 49783 },
    { uid: UID('2'), name: 'Toyota Camry 2018', user: { displayName: 'B', profileUrl: 'https://sketchfab.com/b' }, license: { label: 'CC Attribution' },
      archives: { glb: { faceCount: 1221701, size: 48000000 } },
      thumbnails: { images: [{ url: 'https://media.sketchfab.com/a/100.jpeg', width: 100 }, { url: 'https://media.sketchfab.com/a/256.jpeg', width: 256 }, { url: 'https://media.sketchfab.com/a/1024.jpeg', width: 1024 }] } },
    { uid: UID('3'), name: 'Spicy', isAgeRestricted: true },
    { uid: 'not-a-uid', name: 'Toyota Camry' },
    { uid: UID('4'), name: 'Camry', user: {}, thumbnails: { images: [{ url: 'https://evil.example/x.jpg', width: 300 }] } }
  ] };
  const list = R.results(json, camry);
  assert.deepEqual(list.map((r) => r.uid), [UID('2'), UID('4'), UID('1')]);
  const [best] = list;
  assert.equal(best.thumb, 'https://media.sketchfab.com/a/256.jpeg');
  assert.equal(best.faces, 1221701);
  assert.equal(best.heavy, true);
  assert.equal(best.size, 48000000);
  assert.equal(best.author, 'B');
  assert.equal(list[1].thumb, ''); // only Sketchfab's own image host
  assert.equal(R.credit(best), 'Toyota Camry 2018 by B (CC Attribution)');
});

test('downloads: a single .glb when offered, else the glTF zip', () => {
  assert.deepEqual(R.archiveFrom({ glb: { url: 'https://x/a.glb', size: 5 }, gltf: { url: 'https://x/a.zip' } }), { kind: 'glb', url: 'https://x/a.glb', size: 5 });
  assert.deepEqual(R.archiveFrom({ gltf: { url: 'https://x/a.zip', size: 9 } }), { kind: 'zip', url: 'https://x/a.zip', size: 9 });
  assert.equal(R.archiveFrom({ gltf: { url: 'http://insecure/a.zip' } }), null);
  assert.equal(R.archiveFrom({}), null);
});

// A stand-in "downloaded model": a car body lengthwise along z, wheels, a window, on a big floor disc,
// in centimetres and floating off the origin, like many Sketchfab uploads.
function sampleModel(withFloor = true) {
  const scene = new THREE.Group();
  const mesh = (geo, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()); m.position.set(x, y, z); scene.add(m); return m; };
  mesh(new THREE.BoxGeometry(180, 130, 460, 8, 8, 8), 500, 95, -40); // body
  for (const [x, z] of [[-80, 100], [80, 100], [-80, -180], [80, -180]]) mesh(new THREE.CylinderGeometry(33, 33, 22, 24), 500 + x, 63, z);
  mesh(new THREE.BoxGeometry(150, 40, 100), 500, 175, -40); // window
  if (withFloor) mesh(new THREE.CylinderGeometry(600, 600, 4, 64), 500, 28, -40); // display floor
  return scene;
}

test('fitting: drops the display floor, turns lengthwise, scales to the real length, sits on the floor', () => {
  const scene = sampleModel();
  const { group, size } = R.fit(THREE, scene, 4.88);
  const hidden = [];
  scene.traverse((o) => { if (o.isMesh && !o.visible) hidden.push(o.geometry.type); });
  assert.deepEqual(hidden, ['CylinderGeometry']); // only the floor disc
  assert.ok(Math.abs(size.L - 4.88) < 1e-6, `length ${size.L}`);
  assert.ok(size.W < size.L, 'length runs along x');
  const box = new THREE.Box3();
  group.updateMatrixWorld(true);
  group.traverse((o) => { if (o.isMesh && o.visible) box.union(new THREE.Box3().setFromObject(o)); });
  assert.ok(Math.abs(box.min.y) < 1e-6, 'on the floor');
  assert.ok(Math.abs(box.min.x + box.max.x) < 1e-6 && Math.abs(box.min.z + box.max.z) < 1e-6, 'centred');
});

test('fitting: a car without a floor keeps every part', () => {
  const scene = sampleModel(false);
  R.fit(THREE, scene, 4.5);
  let hidden = 0;
  scene.traverse((o) => { if (o.isMesh && !o.visible) hidden++; });
  assert.equal(hidden, 0);
});

console.log(`\n${passed} replica tests passed`);
