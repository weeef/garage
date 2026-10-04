// Update logic, kept free of Electron imports so it can be unit-tested with a fake autoUpdater.
// States sent to the UI: idle | checking | none | available | downloading | ready | error
function friendlyError(err) {
  const msg = String((err && (err.message || err)) || 'Unknown error');
  if (/404|Cannot find latest|No published versions|HttpError: 404/i.test(msg)) {
    return 'No published release found yet for the update repo.';
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|net::|getaddrinfo|socket hang up/i.test(msg)) {
    return 'Could not reach GitHub. Check your internet connection.';
  }
  if (/rate limit|403/i.test(msg)) return 'GitHub is rate-limiting update checks. Try again later.';
  return msg.split('\n')[0].slice(0, 160);
}

function createUpdater({ autoUpdater, send, enabled, version, disabledReason }) {
  let state = { state: 'idle', version };
  let silent = false;
  let checking = false;

  const set = (s) => { state = { version, ...s }; send(state); return state; };

  if (enabled && autoUpdater) {
    autoUpdater.autoDownload = false;          // ask first; downloads are ~80 MB
    autoUpdater.autoInstallOnAppQuit = true;   // once downloaded, also install when the app is closed
    autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
    autoUpdater.on('update-available', (info) => set({ state: 'available', latest: info && info.version }));
    autoUpdater.on('update-not-available', () => set({ state: 'none' }));
    autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round((p && p.percent) || 0) }));
    autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', latest: info && info.version }));
    autoUpdater.on('error', (err) => {
      // Background checks fail quietly (offline, no release yet). Manual actions show the reason.
      if (silent) set({ state: 'idle' });
      else set({ state: 'error', message: friendlyError(err) });
    });
  }

  return {
    getState: () => state,

    async check({ silent: quiet = false } = {}) {
      if (!enabled || !autoUpdater) {
        if (quiet) return state; // background check while running from source: say nothing
        return set({ state: 'error', message: disabledReason || 'Updates only work in the installed app.' });
      }
      if (checking || state.state === 'downloading' || state.state === 'ready') return state;
      checking = true;
      silent = quiet;
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        // The 'error' event normally handled this already; cover the case where it did not.
        if (state.state === 'checking') {
          if (quiet) set({ state: 'idle' }); else set({ state: 'error', message: friendlyError(err) });
        }
      } finally {
        checking = false;
        silent = false;
      }
      return state;
    },

    async download() {
      if (!enabled || !autoUpdater || state.state !== 'available') return state;
      set({ state: 'downloading', percent: 0, latest: state.latest });
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        if (state.state === 'downloading') set({ state: 'error', message: friendlyError(err) });
      }
      return state;
    },

    install() {
      if (!enabled || !autoUpdater || state.state !== 'ready') return false;
      autoUpdater.quitAndInstall(true, true); // silent install, relaunch afterwards
      return true;
    }
  };
}

module.exports = { createUpdater, friendlyError };
