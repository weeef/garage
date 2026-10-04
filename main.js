const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { createUpdater } = require('./lib/updater');
const { findLook } = require('./lib/carlook');
const R = require('./lib/replica');

const dataFile = () => path.join(app.getPath('userData'), 'garage-log.json');
const EMPTY = { vehicles: [], logs: [], schedules: [] };

function isValidData(d) {
  return d && typeof d === 'object' &&
    Array.isArray(d.vehicles) && Array.isArray(d.logs) && Array.isArray(d.schedules);
}

function readData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    return isValidData(parsed) ? parsed : { ...EMPTY };
  } catch {
    return { vehicles: [], logs: [], schedules: [] };
  }
}

function writeData(data) {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(tmp, file);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0e0c',
    title: 'Garage Log',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  Menu.setApplicationMenu(null);
  // Links (photo credits, Wikipedia) open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault(); // e.g. a PDF dropped on the window
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('data:load', () => readData());

ipcMain.handle('data:save', (_e, data) => {
  if (!isValidData(data)) throw new Error('Invalid data');
  writeData(data);
  return true;
});

ipcMain.handle('file:export', async (e, { defaultName, content, filters }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters });
  if (res.canceled || !res.filePath) return false;
  fs.writeFileSync(res.filePath, content, 'utf8');
  return res.filePath;
});

ipcMain.handle('file:importJson', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Garage Log backup', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const parsed = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
  if (!isValidData(parsed)) throw new Error('That file is not a Garage Log backup.');
  return parsed;
});

// VIN lookup via NHTSA's free vPIC API. Done here (not in the renderer) so the page's
// CSP can stay locked to 'self'. Returns {ok, row} or {ok:false, error} - never throws.
ipcMain.handle('vin:decode', async (_e, vin) => {
  const v = String(vin || '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return { ok: false, error: 'Enter a full 17-character VIN.' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${v}?format=json`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, error: `The lookup service returned an error (${res.status}).` };
    const json = await res.json();
    const row = json && Array.isArray(json.Results) ? json.Results[0] : null;
    return row ? { ok: true, row } : { ok: false, error: 'Unexpected response from the lookup service.' };
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, error: 'The lookup timed out. Fill in the details by hand.' };
    return { ok: false, error: 'Could not reach the lookup service. Check your connection, or fill in the details by hand.' };
  } finally {
    clearTimeout(timer);
  }
});

// What the vehicle really looks like (generation, real dimensions, a photo) from Wikipedia, for the
// 3D car. Fetched here for the same CSP reason as the VIN lookup. Returns {ok, look} - never throws.
ipcMain.handle('look:find', async (_e, spec) => {
  const getJson = async (url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': `GarageLog/${app.getVersion()} (https://github.com/weeef/garage)` } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };
  const s = spec || {};
  try {
    return { ok: true, look: await findLook({ year: s.year, make: s.make, model: s.model, baseModel: s.baseModel, body: s.body }, getJson) };
  } catch {
    return { ok: false }; // offline or Wikipedia unreachable: try again another time
  }
});

// ---------- real 3D models of the car (Sketchfab, lib/replica.js) ----------
// Downloads are kept in userData/models. The user's Sketchfab API token is stored like the sync token
// (encrypted by Windows) and never handed to the page.
const MAX_MODEL = 300 * 1048576;
const modelDir = () => path.join(app.getPath('userData'), 'models');
const sketchfabFile = () => path.join(app.getPath('userData'), 'sketchfab.json');
const SKETCHFAB_OFFLINE = "Couldn't reach Sketchfab. Check your connection.";

function sketchfabToken() {
  try {
    const c = JSON.parse(fs.readFileSync(sketchfabFile(), 'utf8'));
    if (c.tokenEnc && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(c.tokenEnc, 'base64'));
    return c.token || '';
  } catch {
    return '';
  }
}

async function timedFetch(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const modelFile = (uid) => ['glb', 'zip'].map((kind) => ({ kind, file: path.join(modelDir(), `${uid}.${kind}`) })).find((m) => fs.existsSync(m.file));

ipcMain.handle('replica:hasToken', () => Boolean(sketchfabToken()));

ipcMain.handle('replica:setToken', (_e, token) => {
  const t = String(token || '').trim();
  const file = sketchfabFile();
  if (!t) {
    try { fs.unlinkSync(file); } catch { /* not connected */ }
    return true;
  }
  const out = safeStorage.isEncryptionAvailable() ? { tokenEnc: safeStorage.encryptString(t).toString('base64') } : { token: t };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out), 'utf8');
  return true;
});

ipcMain.handle('replica:search', async (_e, query) => {
  try {
    const res = await timedFetch(R.searchUrl(String(query || '').slice(0, 120)));
    if (!res.ok) return { ok: false, error: `Sketchfab returned an error (${res.status}).` };
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, error: SKETCHFAB_OFFLINE };
  }
});

ipcMain.handle('replica:download', async (_e, uid) => {
  if (!R.validUid(uid)) return { ok: false, error: 'Bad model id.' };
  if (modelFile(uid)) return { ok: true };
  const token = sketchfabToken();
  if (!token) return { ok: false, code: 'auth', error: 'Connect Sketchfab first.' };
  try {
    const info = await timedFetch(R.downloadInfoUrl(uid), { headers: { Authorization: `Token ${token}` } });
    if (info.status === 401 || info.status === 403) return { ok: false, code: 'auth', error: "Sketchfab didn't accept the API token." };
    if (!info.ok) return { ok: false, error: `Sketchfab returned an error (${info.status}).` };
    const arc = R.archiveFrom(await info.json());
    if (!arc) return { ok: false, error: 'Sketchfab has no download for that model.' };
    if (arc.size > MAX_MODEL) return { ok: false, error: `That model is too big to use (${Math.round(arc.size / 1048576)} MB).` };
    const res = await timedFetch(arc.url, {}, 10 * 60 * 1000);
    if (!res.ok) return { ok: false, error: `The download failed (${res.status}).` };
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(modelDir(), { recursive: true });
    fs.writeFileSync(path.join(modelDir(), `${uid}.${arc.kind}`), buf);
    return { ok: true, size: buf.length };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'The download timed out.' : SKETCHFAB_OFFLINE };
  }
});

ipcMain.handle('replica:read', (_e, uid) => {
  const m = R.validUid(uid) && modelFile(uid);
  return m ? { ok: true, kind: m.kind, data: fs.readFileSync(m.file) } : { ok: false };
});

ipcMain.handle('replica:prune', (_e, keep) => {
  const wanted = new Set((Array.isArray(keep) ? keep : []).filter(R.validUid));
  try {
    for (const f of fs.readdirSync(modelDir())) if (!wanted.has(f.replace(/\.(glb|zip)$/, ''))) fs.unlinkSync(path.join(modelDir(), f));
  } catch { /* no downloads yet */ }
  return true;
});

// ---------- phone sync settings ----------
// The sync itself runs in the renderer (lib/sync.js, shared with the phone app). Only the settings live
// here, with the GitHub token encrypted by Windows (DPAPI) when available.
const syncFile = () => path.join(app.getPath('userData'), 'sync.json');

ipcMain.handle('sync:getConfig', () => {
  try {
    const cfg = JSON.parse(fs.readFileSync(syncFile(), 'utf8'));
    let token = cfg.token || '';
    if (cfg.tokenEnc && safeStorage.isEncryptionAvailable()) {
      token = safeStorage.decryptString(Buffer.from(cfg.tokenEnc, 'base64'));
    }
    return { token, gistId: cfg.gistId || null, lastSync: cfg.lastSync || 0 };
  } catch {
    return { token: '', gistId: null, lastSync: 0 };
  }
});

ipcMain.handle('sync:setConfig', (_e, cfg) => {
  const file = syncFile();
  if (!cfg || !cfg.token) {
    try { fs.unlinkSync(file); } catch { /* not connected */ }
    return true;
  }
  const out = { gistId: cfg.gistId || null, lastSync: cfg.lastSync || 0 };
  if (safeStorage.isEncryptionAvailable()) out.tokenEnc = safeStorage.encryptString(String(cfg.token)).toString('base64');
  else out.token = String(cfg.token);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
  return true;
});

// ---------- auto-update (GitHub Releases via electron-updater) ----------
let updater = null;

function initUpdater() {
  let autoUpdater = null;
  if (app.isPackaged) {
    try { autoUpdater = require('electron-updater').autoUpdater; } catch { autoUpdater = null; }
  }
  updater = createUpdater({
    autoUpdater,
    enabled: Boolean(autoUpdater),
    version: app.getVersion(),
    disabledReason: app.isPackaged
      ? 'The updater is not available in this build.'
      : 'Updates only work in the installed app (not when run with npm start).',
    send: (s) => BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.webContents.send('update:state', s); })
  });
  // Look for updates on start, every 6 hours, and when the user comes back to the window (at most
  // hourly), so the dashboard can prompt without anyone opening the Data tab.
  let lastCheck = 0;
  const background = () => { lastCheck = Date.now(); updater.check({ silent: true }); };
  setTimeout(background, 5000);
  setInterval(background, 6 * 60 * 60 * 1000);
  app.on('browser-window-focus', () => { if (Date.now() - lastCheck > 60 * 60 * 1000) background(); });
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:state', () => (updater ? updater.getState() : { state: 'idle', version: app.getVersion() }));
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:download', () => updater.download());
ipcMain.handle('update:install', () => updater.install());

app.whenReady().then(() => {
  createWindow();
  initUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
