const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdater, friendlyError } = require('../lib/updater.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }
}

// A fake electron-updater autoUpdater that we can drive by hand.
function fakeAU(behaviour = {}) {
  const au = new EventEmitter();
  au.calls = [];
  au.checkForUpdates = async () => {
    au.calls.push('check');
    au.emit('checking-for-update');
    if (behaviour.check) return behaviour.check(au);
    au.emit('update-not-available', {});
  };
  au.downloadUpdate = async () => {
    au.calls.push('download');
    if (behaviour.download) return behaviour.download(au);
    au.emit('download-progress', { percent: 40.4 });
    au.emit('update-downloaded', { version: '1.2.0' });
  };
  au.quitAndInstall = (...args) => au.calls.push(['install', ...args]);
  return au;
}
function make(au, extra = {}) {
  const sent = [];
  const u = createUpdater({ autoUpdater: au, send: (s) => sent.push(s.state), enabled: true, version: '1.1.0', ...extra });
  return { u, sent };
}

(async () => {
  await test('up to date: checking -> none', async () => {
    const au = fakeAU(); const { u, sent } = make(au);
    const s = await u.check();
    assert.deepEqual(sent, ['checking', 'none']);
    assert.equal(s.state, 'none'); assert.equal(s.version, '1.1.0');
  });

  await test('settings: asks before downloading, installs on quit', () => {
    const au = fakeAU(); make(au);
    assert.equal(au.autoDownload, false);
    assert.equal(au.autoInstallOnAppQuit, true);
  });

  await test('update found -> available with the new version', async () => {
    const au = fakeAU({ check: (a) => a.emit('update-available', { version: '1.2.0' }) });
    const { u } = make(au);
    const s = await u.check();
    assert.equal(s.state, 'available'); assert.equal(s.latest, '1.2.0');
  });

  await test('download -> progress -> ready, then install is silent + relaunches', async () => {
    const au = fakeAU({ check: (a) => a.emit('update-available', { version: '1.2.0' }) });
    const { u, sent } = make(au);
    await u.check(); await u.download();
    assert.deepEqual(sent.slice(-3), ['downloading', 'downloading', 'ready']);
    assert.equal(u.getState().percent, undefined); // ready state carries no percent
    assert.equal(u.install(), true);
    assert.deepEqual(au.calls.at(-1), ['install', true, true]);
  });

  await test('download only starts from "available"; install only from "ready"', async () => {
    const au = fakeAU(); const { u } = make(au);
    await u.download();
    assert.ok(!au.calls.includes('download'));
    assert.equal(u.install(), false);
    assert.ok(!au.calls.some((c) => Array.isArray(c)));
  });

  await test('silent check swallows errors (offline at startup shows nothing)', async () => {
    const au = fakeAU({ check: (a) => { const e = new Error('net::ERR_INTERNET_DISCONNECTED'); a.emit('error', e); throw e; } });
    const { u, sent } = make(au);
    const s = await u.check({ silent: true });
    assert.equal(s.state, 'idle');
    assert.ok(!sent.includes('error'));
  });

  await test('manual check shows a friendly error', async () => {
    const au = fakeAU({ check: (a) => { const e = new Error('getaddrinfo ENOTFOUND github.com'); a.emit('error', e); throw e; } });
    const { u } = make(au);
    const s = await u.check();
    assert.equal(s.state, 'error'); assert.match(s.message, /Could not reach GitHub/);
  });

  await test('rejection with no error event is still reported (manual) / swallowed (silent)', async () => {
    const mk = () => fakeAU({ check: () => { throw new Error('HttpError: 404 Not Found'); } });
    let r = await make(mk()).u.check();
    assert.equal(r.state, 'error'); assert.match(r.message, /No published release/);
    r = await make(mk()).u.check({ silent: true });
    assert.equal(r.state, 'idle');
  });

  await test('a failed download surfaces as an error', async () => {
    const au = fakeAU({
      check: (a) => a.emit('update-available', { version: '1.2.0' }),
      download: () => { throw new Error('ECONNRESET'); }
    });
    const { u } = make(au);
    await u.check(); const s = await u.download();
    assert.equal(s.state, 'error'); assert.match(s.message, /Could not reach GitHub/);
  });

  await test('overlapping checks only run once', async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const au = fakeAU({ check: async () => { await gate; } });
    const { u } = make(au);
    const p1 = u.check(); const p2 = u.check();
    release(); await Promise.all([p1, p2]);
    assert.equal(au.calls.filter((c) => c === 'check').length, 1);
  });

  await test('no re-check while a downloaded update is waiting to install', async () => {
    const au = fakeAU({ check: (a) => a.emit('update-available', { version: '1.2.0' }) });
    const { u } = make(au);
    await u.check(); await u.download();
    const before = au.calls.length;
    const s = await u.check();
    assert.equal(s.state, 'ready'); assert.equal(au.calls.length, before);
  });

  await test('disabled (running from source): manual check explains, background check is silent', async () => {
    const sent = [];
    const u = createUpdater({ autoUpdater: null, enabled: false, version: '1.1.0', send: (s) => sent.push(s.state), disabledReason: 'Updates only work in the installed app.' });
    assert.equal((await u.check({ silent: true })).state, 'idle');
    assert.deepEqual(sent, []);
    const s = await u.check();
    assert.equal(s.state, 'error'); assert.match(s.message, /installed app/);
  });

  await test('friendlyError maps common failures', () => {
    assert.match(friendlyError(new Error('Cannot find latest.yml in the latest release artifacts')), /No published release/);
    assert.match(friendlyError(new Error('net::ERR_NAME_NOT_RESOLVED')), /Could not reach GitHub/);
    assert.match(friendlyError(new Error('API rate limit exceeded')), /rate-limiting/);
    assert.equal(friendlyError(new Error('Something odd\nsecond line')), 'Something odd');
    assert.equal(friendlyError(null), 'Unknown error');
  });

  console.log(`\n${passed} passed`);
})();
