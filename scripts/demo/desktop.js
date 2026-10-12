// Desktop demo for screen recordings: `demo.bat` (or `npx electron scripts/demo/desktop.js`).
// Runs the real Windows app (main.js, unchanged) on the browser demo's sample data, in its own data
// folder under %TEMP% so the real garage-log.json is never touched, and adds a guided tour (tour.js):
//   SPACE  start the tour        R  reset the sample data and reload        F11  full screen
const { app, screen, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dataDir = path.join(os.tmpdir(), 'Garage Log demo');
const realModels = path.join(process.env.APPDATA || '', 'Garage Log', 'models');

app.setName('Garage Log');
app.setVersion(version);
app.setPath('userData', dataDir);

// The sample data lives in demo.js (the browser demo's stand-in for preload.js). Run it against a fake
// window and localStorage, and ask its bridge for the data like the page would.
async function sampleData() {
  const store = new Map();
  const sandbox = {
    window: {},
    document: { addEventListener() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(await sandbox.window.garage.load()));
}

// Models downloaded inside the demo ("real model" under the car) are copied to where the installed
// app keeps its downloads, so they survive the demo's fresh start and build-demo.js can use them too.
function keepModels() {
  const dir = path.join(dataDir, 'models');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(glb|zip)$/.test(f) || fs.existsSync(path.join(realModels, f))) continue;
    fs.mkdirSync(realModels, { recursive: true });
    fs.copyFileSync(path.join(dir, f), path.join(realModels, f));
  }
}

// A fresh copy of the sample data. The Daily Driver keeps its real Sketchfab model only if it has
// been downloaded on this PC (in the installed app, or once in the demo); otherwise it shows the
// generated car.
async function seed() {
  const data = await sampleData();
  keepModels();
  fs.rmSync(path.join(dataDir, 'models'), { recursive: true, force: true });
  for (const v of data.vehicles) {
    if (!v.replica) continue;
    const file = ['glb', 'zip'].map((kind) => path.join(realModels, `${v.replica.uid}.${kind}`)).find((f) => fs.existsSync(f));
    if (file) {
      fs.mkdirSync(path.join(dataDir, 'models'), { recursive: true });
      fs.copyFileSync(file, path.join(dataDir, 'models', path.basename(file)));
    } else {
      delete v.replica;
    }
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'garage-log.json'), JSON.stringify(data, null, 2));
}

const tourJs = fs.readFileSync(path.join(__dirname, 'tour.js'), 'utf8');
const tourCss = fs.readFileSync(path.join(__dirname, 'tour.css'), 'utf8');

app.on('browser-window-created', (_e, win) => {
  // 16:9, as big as fits, for a clean recording.
  const area = screen.getPrimaryDisplay().workArea;
  const w = Math.min(1600, Math.floor(area.width * 0.94), Math.floor(((area.height * 0.94) * 16) / 9));
  win.setContentSize(w, Math.round((w * 9) / 16));
  win.center();
  win.setIcon(path.join(root, 'build', 'icon.png'));

  const wc = win.webContents;
  wc.on('did-finish-load', () => {
    wc.insertCSS(tourCss);
    wc.executeJavaScript(tourJs);
  });
  wc.on('before-input-event', async (e, input) => {
    if (input.type !== 'keyDown' || input.control || input.alt || input.meta) return;
    if (input.code === 'Space') {
      e.preventDefault();
      wc.executeJavaScript('window.__tour && window.__tour.start()');
    } else if (input.code === 'KeyR' && !input.isAutoRepeat) {
      e.preventDefault();
      await seed();
      await session.defaultSession.clearStorageData({ storages: ['localstorage'] }); // theme back to Garage
      wc.reload();
    } else if (input.code === 'F11') {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
});

// Start clean (data, theme, cached look-ups), then hand over to the app.
app.on('will-quit', keepModels);
keepModels();
fs.rmSync(dataDir, { recursive: true, force: true });
seed().then(() => require(path.join(root, 'main.js')));
