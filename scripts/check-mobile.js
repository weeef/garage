// Usage: node scripts/check-mobile.js (runs in `npm test` and before every release)
// Keeps the phone app (mobile/) level with the Windows app. Fails when:
//  - a shared lib/ file is missing from mobile/, differs from lib/, isn't loaded by mobile/index.html
//    or isn't in the service worker's offline cache (phones would run without it)
//  - mobile/version.json or the service-worker cache name doesn't match package.json
//  - the Windows app has an action (button) the phone app doesn't handle
// Run `npm run sync-version` to fix the first two kinds; the last needs the feature ported.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ELECTRON_ONLY = new Set(['updater.js']); // lib/ files that only make sense in the Windows app
// Windows-app actions with no phone equivalent, and why.
const DESKTOP_ONLY_ACTIONS = {
  updl: 'installer download (the phone updates through its service worker)',
  updismiss: 'installer update bar',
  upinstall: 'installer restart'
};

function sharedFiles() {
  const files = fs.readdirSync(path.join(root, 'lib')).filter((f) => f.endsWith('.js') && !ELECTRON_ONLY.has(f));
  const vendor = fs.readdirSync(path.join(root, 'lib', 'vendor')).map((f) => 'vendor/' + f);
  return [...files, ...vendor];
}

function actionsIn(file) {
  const s = fs.readFileSync(file, 'utf8');
  const start = s.indexOf('const actions = {');
  const body = s.slice(start, s.indexOf('\n  };', start));
  return new Set([...body.matchAll(/^ {4}(\w+)\s*[:,(]/gm)].map((m) => m[1]));
}

function problems() {
  const out = [];
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const html = read('mobile/index.html');
  const sw = read('mobile/sw.js');
  const phoneApp = read('mobile/app.js');
  const shell = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [])[1] || '';
  for (const f of sharedFiles()) {
    const mob = path.join(root, 'mobile', f);
    if (!fs.existsSync(mob)) { out.push(`mobile/${f} is missing`); continue; }
    if (!fs.readFileSync(mob).equals(fs.readFileSync(path.join(root, 'lib', f)))) out.push(`mobile/${f} differs from lib/${f}`);
    if (!f.endsWith('.js') || f.includes('.worker.')) continue; // licenses; pdf.js loads its worker itself
    const lazy = phoneApp.includes(`'${path.basename(f)}'`); // loaded on demand, e.g. pdf.js
    if (!html.includes(`src="${f}"`) && !lazy) out.push(`mobile/index.html doesn't load ${f}`);
    if (!shell.includes(`'${f}'`)) out.push(`mobile/sw.js doesn't cache ${f} for offline use`);
  }
  const { version } = JSON.parse(read('package.json'));
  const mv = JSON.parse(read('mobile/version.json')).version;
  if (mv !== version) out.push(`mobile/version.json is ${mv}, the app is ${version}`);
  if (!sw.includes(`'garage-log-${version}'`)) out.push(`mobile/sw.js cache name isn't garage-log-${version}`);
  const phone = actionsIn(path.join(root, 'mobile', 'app.js'));
  for (const a of actionsIn(path.join(root, 'renderer', 'app.js'))) {
    if (!phone.has(a) && !DESKTOP_ONLY_ACTIONS[a]) out.push(`the phone app has no "${a}" action (a Windows-app feature to port)`);
  }
  return out;
}

if (require.main === module) {
  const p = problems();
  if (p.length) {
    console.error('The phone app is behind the Windows app:\n  - ' + p.join('\n  - '));
    process.exit(1);
  }
  console.log('phone app is level with the Windows app');
}

module.exports = { sharedFiles, problems };
