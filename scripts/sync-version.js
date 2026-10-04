// Runs before every build/release. Makes package.json's version the single source of truth:
//  - writes mobile/version.json
//  - sets the mobile service-worker cache name to garage-log-<version> (a new name = phones pick up the update)
//  - copies every shared lib/ file (all but the Electron-only ones) into mobile/lib/, so the phone app matches
//  - lists them in the service worker's offline cache
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

// The phone app gets every shared lib/ file (all but the Electron-only ones) in mobile/lib/, rebuilt
// from scratch so nothing stale is left behind. mobile/lib/ is generated (and git-ignored).
const { sharedFiles } = require('./check-mobile');
const libOut = path.join(root, 'mobile', 'lib');
fs.rmSync(libOut, { recursive: true, force: true });
fs.mkdirSync(path.join(libOut, 'vendor'), { recursive: true });
for (const f of sharedFiles()) fs.copyFileSync(path.join(root, 'lib', f), path.join(libOut, f));

// The service worker's offline file list: the app shell plus every shared file.
const shell = ['./', 'index.html', 'styles.css', 'app.js', 'version.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  ...sharedFiles().filter((f) => !f.endsWith('.txt')).map((f) => 'lib/' + f)];
const sw2 = fs.readFileSync(swPath, 'utf8');
const list = 'const SHELL = [\n' + shell.map((f) => `  '${f}'`).join(',\n') + '\n];';
const sw3 = sw2.replace(/const SHELL = \[[\s\S]*?\];/, list);
if (sw3 === sw2 && !sw2.includes(list)) {
  console.error('Could not find the SHELL list in mobile/sw.js');
  process.exit(1);
}
fs.writeFileSync(swPath, sw3);
console.log(`Synced version ${version} (mobile/version.json, mobile/sw.js, mobile/lib/)`);
