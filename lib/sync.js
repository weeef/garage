// Phone <-> PC sync through a private GitHub Gist. No Electron or DOM here: it runs in the desktop
// renderer, the mobile web app and plain Node (tests), and attaches to window.GarageSync in a browser.
//
// How merging works: every vehicle/log/schedule carries `updatedAt` (ms), stamped when the app saves
// a change, and deletions are remembered in `data.deleted` ({ id: ms }). Merging two copies keeps the
// newer version of each item and drops anything deleted after its last edit, so edits made on both
// devices while apart all survive.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KINDS = ['vehicles', 'logs', 'schedules'];
  const FILE = 'garage-log-sync.json';
  const API = 'https://api.github.com';

  const strip = (item) => { const { updatedAt, ...rest } = item; return JSON.stringify(rest); };

  // Compares `next` (about to be saved) with `prev` (last saved) and stamps what changed. Mutates next.
  function stampChanges(prev, next, now) {
    now = now || Date.now();
    next.deleted = { ...(next.deleted || {}) };
    for (const kind of KINDS) {
      const before = new Map(((prev && prev[kind]) || []).map((x) => [x.id, x]));
      const ids = new Set();
      for (const item of next[kind]) {
        ids.add(item.id);
        const old = before.get(item.id);
        if (!old || strip(old) !== strip(item)) {
          item.updatedAt = now;
          delete next.deleted[item.id]; // re-added (e.g. restored from a backup)
        } else if (old.updatedAt) {
          item.updatedAt = old.updatedAt; // unchanged; items from before sync existed stay unstamped (= oldest)
        }
      }
      for (const id of before.keys()) if (!ids.has(id)) next.deleted[id] = now;
    }
    return next;
  }

  // Combines two copies of the data. Order: a's items first, then anything only b has.
  function mergeData(a, b) {
    a = a || {}; b = b || {};
    const deleted = { ...(a.deleted || {}) };
    for (const [id, t] of Object.entries(b.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);
    const out = { deleted };
    for (const kind of KINDS) {
      const map = new Map();
      for (const item of a[kind] || []) map.set(item.id, item);
      for (const item of b[kind] || []) {
        const cur = map.get(item.id);
        if (!cur || (item.updatedAt || 0) > (cur.updatedAt || 0)) map.set(item.id, item);
      }
      out[kind] = [...map.values()].filter((x) => !(deleted[x.id] >= (x.updatedAt || 0)));
    }
    // Drop orphans (a vehicle deleted on one device while the other logged a service for it).
    const vids = new Set(out.vehicles.map((v) => v.id));
    out.logs = out.logs.filter((l) => vids.has(l.vehicleId));
    out.schedules = out.schedules.filter((s) => vids.has(s.vehicleId));
    for (const v of out.vehicles) {
      const odos = out.logs.filter((l) => l.vehicleId === v.id).map((l) => l.odometer).filter(Number.isFinite);
      const hi = Math.max(Number(v.odometer) || 0, ...odos);
      if (hi !== v.odometer) out.vehicles[out.vehicles.indexOf(v)] = { ...v, odometer: hi };
    }
    return out;
  }

  // Order-insensitive comparison, so a no-op sync doesn't rewrite the gist or re-render.
  function sameData(a, b) {
    const canon = (d) => JSON.stringify({
      deleted: Object.keys((d && d.deleted) || {}).sort().map((k) => [k, d.deleted[k]]),
      ...Object.fromEntries(KINDS.map((k) => [k, [...((d && d[k]) || [])].sort((x, y) => (x.id < y.id ? -1 : 1))]))
    });
    return canon(a) === canon(b);
  }

  // ---------- GitHub Gist ----------
  class SyncError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  }

  async function gh(fetchImpl, token, method, url, body) {
    let res;
    try {
      res = await fetchImpl(url.startsWith('http') ? url : API + url, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store'
      });
    } catch {
      throw new SyncError('Could not reach GitHub. Check your internet connection.', 'offline');
    }
    if (res.status === 401) throw new SyncError('GitHub rejected the sync token. It may have expired; connect again with a new one.', 'auth');
    if (res.status === 403 || res.status === 429) throw new SyncError('GitHub refused the request. Make sure the token has the "gist" permission, or try again later.', 'forbidden');
    if (res.status === 404) throw new SyncError('Sync gist not found.', 'notfound');
    if (!res.ok) throw new SyncError(`GitHub returned an error (${res.status}).`, 'http');
    return res.json();
  }

  const emptyData = () => ({ vehicles: [], logs: [], schedules: [], deleted: {} });
  const isData = (d) => d && Array.isArray(d.vehicles) && Array.isArray(d.logs) && Array.isArray(d.schedules);

  async function findGist(fetchImpl, token) {
    for (let page = 1; page <= 10; page++) {
      const list = await gh(fetchImpl, token, 'GET', `/gists?per_page=100&page=${page}`);
      const hit = list.find((g) => g.files && g.files[FILE]);
      if (hit) return hit.id;
      if (list.length < 100) return null;
    }
    return null;
  }

  async function readGist(fetchImpl, token, id) {
    const g = await gh(fetchImpl, token, 'GET', `/gists/${id}`);
    const f = g.files && g.files[FILE];
    if (!f) throw new SyncError('Sync gist not found.', 'notfound');
    let text = f.content;
    if (f.truncated && f.raw_url) {
      const res = await fetchImpl(f.raw_url, { cache: 'no-store' });
      text = await res.text();
    }
    try {
      const parsed = JSON.parse(text || '{}');
      return isData(parsed) ? parsed : emptyData();
    } catch {
      return emptyData();
    }
  }

  const fileBody = (d) => ({ files: { [FILE]: { content: JSON.stringify(d) } } });

  // One full round: pull, merge, push if anything is new. Returns the merged data and the gist id
  // (found or created on first use, so a second device just needs the same token).
  async function syncNow({ token, gistId, local, fetchImpl }) {
    fetchImpl = fetchImpl || ((...a) => fetch(...a));
    if (!token) throw new SyncError('Not connected.', 'auth');
    local = local || emptyData();
    let id = gistId || await findGist(fetchImpl, token);
    if (!id) {
      const created = await gh(fetchImpl, token, 'POST', '/gists', {
        description: 'Garage Log sync data (used by the Garage Log app; do not edit)',
        public: false,
        ...fileBody(local)
      });
      return { data: local, gistId: created.id, pushed: true };
    }
    let remote;
    try {
      remote = await readGist(fetchImpl, token, id);
    } catch (e) {
      if (e.code !== 'notfound' || !gistId) throw e;
      return syncNow({ token, gistId: null, local, fetchImpl }); // gist was deleted: find or recreate
    }
    const merged = mergeData(local, remote);
    let pushed = false;
    if (!sameData(merged, remote)) {
      await gh(fetchImpl, token, 'PATCH', `/gists/${id}`, fileBody(merged));
      pushed = true;
    }
    return { data: merged, gistId: id, pushed };
  }

  return { stampChanges, mergeData, sameData, syncNow, SyncError, FILE };
});
