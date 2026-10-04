const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { createUpdater } = require('./lib/updater');

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
  setTimeout(() => updater.check({ silent: true }), 5000);
  setInterval(() => updater.check({ silent: true }), 6 * 60 * 60 * 1000);
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
