// Runs before every build/release. Makes package.json's version the single source of truth:
//  - writes mobile/version.json
//  - sets the mobile service-worker cache name to garage-log-<version> (a new name = phones pick up the update)
//  - keeps mobile/logic.js, sync.js, carfax.js, car3d.js and vendor/three.min.js identical to their lib/ originals
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(root, 'mobile', 'version.json'), JSON.stringify({ version }, null, 2) + '\n');

const swPath = path.join(root, 'mobile', 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
const next = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'garage-log-${version}';`);
if (next === sw && !sw.includes(`garage-log-${version}`)) {
  console.error('Could not find the CACHE line in mobile/sw.js');
  process.exit(1);
}
fs.writeFileSync(swPath, next);

fs.mkdirSync(path.join(root, 'mobile', 'vendor'), { recursive: true });
for (const f of ['logic.js', 'sync.js', 'carfax.js', 'workorder.js', 'car3d.js', 'vendor/three.min.js', 'vendor/three.LICENSE.txt',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/pdfjs.LICENSE.txt']) {
  fs.copyFileSync(path.join(root, 'lib', f), path.join(root, 'mobile', f));
}
console.log(`Synced version ${version} (mobile/version.json, mobile/sw.js, shared lib files)`);
