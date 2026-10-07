// Builds a browser demo of the Windows app for a portfolio site: `npm run demo -- <output folder>`.
// Copies the desktop page (renderer/) and the shared lib/ next to each other, and loads
// scripts/demo/demo.js first: it stands in for the Electron bridge (preload.js) and seeds sample data.
// The app itself is unchanged; rerun this after a release.
const fs = require('fs');
const path = require('path');
const { sharedFiles } = require('./check-mobile');
const root = path.join(__dirname, '..');

const out = process.argv[2];
if (!out) {
  console.error('Usage: npm run demo -- <output folder>');
  process.exit(1);
}
const dest = path.resolve(out);
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, 'lib', 'vendor'), { recursive: true });
for (const f of sharedFiles()) fs.copyFileSync(path.join(root, 'lib', f), path.join(dest, 'lib', f));
fs.copyFileSync(path.join(root, 'renderer', 'styles.css'), path.join(dest, 'styles.css'));
fs.copyFileSync(path.join(__dirname, 'demo', 'demo.css'), path.join(dest, 'demo.css'));
const demoJs = fs.readFileSync(path.join(__dirname, 'demo', 'demo.js'), 'utf8');
fs.writeFileSync(path.join(dest, 'demo.js'), demoJs.replace('__VERSION__', version));

// The real Sketchfab model the sample car shows (MODEL in demo.js), taken from where the Windows app
// keeps its downloads. Pick it once in the app (Dashboard > real model) on this PC.
const uid = (/const MODEL = \{\s*uid: '([0-9a-f]{32})'/.exec(demoJs) || [])[1];
const modelSrc = path.join(process.env.APPDATA || '', 'Garage Log', 'models', `${uid}.glb`);
if (!uid || !fs.existsSync(modelSrc)) {
  console.error(`The demo's 3D model isn't downloaded on this PC (${modelSrc}). Pick it in Garage Log first.`);
  process.exit(1);
}
fs.mkdirSync(path.join(dest, 'models'));
fs.copyFileSync(modelSrc, path.join(dest, 'models', `${uid}.glb`));

// Rewrites `file` with each [pattern, replacement]; stops the build if a pattern isn't there any more.
function copyEdited(from, to, edits) {
  let s = fs.readFileSync(from, 'utf8');
  for (const [re, rep] of edits) {
    if (!re.test(s)) {
      console.error(`Could not find ${re} in ${path.relative(root, from)}`);
      process.exit(1);
    }
    s = s.replace(re, rep);
  }
  fs.writeFileSync(to, s);
}

// In Electron the main process makes the web requests; here the page does, so the CSP allows them.
const connect = 'connect-src \'self\' blob: https://vpic.nhtsa.dot.gov https://en.wikipedia.org https://api.sketchfab.com https://api.github.com https://gist.githubusercontent.com';
copyEdited(path.join(root, 'renderer', 'index.html'), path.join(dest, 'index.html'), [
  [/connect-src [^"]*/, connect],
  [/\.\.\/lib\//g, 'lib/'],
  [/<title>Garage Log<\/title>/, '<title>Garage Log (demo)</title>\n  <meta name="robots" content="noindex">'],
  [/(<link rel="stylesheet" href="styles.css">)/, '$1\n  <link rel="stylesheet" href="demo.css">\n  <script src="demo.js"></script>']
]);
copyEdited(path.join(root, 'renderer', 'app.js'), path.join(dest, 'app.js'), [[/'\.\.\/lib\/vendor\/'/g, "'lib/vendor/'"]]);

console.log(`Demo of Garage Log ${version} written to ${dest}`);
