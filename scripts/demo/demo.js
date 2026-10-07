// Demo mode: the Windows app's page running in a plain browser (built by scripts/build-demo.js).
// Stands in for the Electron bridge (preload.js -> window.garage): data in localStorage, lookups fetched
// straight from the page, files saved as downloads. Sample data on the first visit, dated relative to
// today so the due list always shows a mix of ok / soon / overdue. Visitors' edits stay in their own
// browser; RESET DEMO puts the sample data back.
(() => {
  'use strict';
  const DATA_KEY = 'garage-log-demo-v2'; // a new name when the sample data changes, so old visits re-seed
  const SEEDED_KEY = 'garage-log-demo-seeded-v2';
  const VERSION = '__VERSION__'; // filled in by build-demo.js

  const p = (n) => String(n).padStart(2, '0');
  const ago = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const ahead = (days) => ago(-days);
  let n = 0;
  const id = (prefix) => `demo-${prefix}-${++n}`;

  // The Sketchfab model the Daily Driver shows, served from the demo's models/ folder.
  const MODEL = {
    uid: '3b804d736e4641388e86115fe3c439d8', name: '2013 Ford Focus ST', author: 'Ddiaz Design',
    authorUrl: 'https://sketchfab.com/ddiaz-design', license: 'CC Attribution-NonCommercial-ShareAlike',
    url: 'https://sketchfab.com/3d-models/none-3b804d736e4641388e86115fe3c439d8'
  };

  function sample() {
    const focus = {
      id: 'demo-focus', name: 'Daily Driver', year: 2013, make: 'Ford', model: 'Focus ST', baseModel: 'Focus',
      odometer: 68420, unit: 'mi', vin: '', notes: 'Bought used at 31,000 mi.', body: 'hatchback', color: '#e1ff00',
      plate: 'GLG 418', plateState: 'MN', regExpires: ahead(19),
      replica: MODEL // a real model, shipped with the demo (build-demo.js copies the file in)
    };
    const tacoma = {
      id: 'demo-tacoma', name: 'Weekend Truck', year: 2012, make: 'Toyota', model: 'Tacoma', baseModel: 'Tacoma',
      odometer: 142310, unit: 'mi', vin: '', notes: '', body: 'pickup', color: '#3b4a3a',
      plate: 'TRK 2012', plateState: 'MN', regExpires: ahead(160)
    };

    const sched = (v, name, intervalMiles, intervalMonths) => ({ id: id('s'), vehicleId: v.id, name, intervalMiles, intervalMonths });
    const schedules = [
      sched(focus, 'Oil & filter change', 5000, 6),
      sched(focus, 'Tire rotation', 7500, 6),
      sched(focus, 'Engine air filter', 15000, 12),
      sched(focus, 'Cabin air filter', 15000, 12),
      sched(focus, 'Brake fluid flush', 30000, 24),
      sched(focus, 'Coolant flush', 30000, 36),
      sched(focus, 'Spark plugs', 60000, 60),
      sched(focus, 'Battery test', 0, 12),
      sched(tacoma, 'Oil & filter change', 5000, 6),
      sched(tacoma, 'Tire rotation', 7500, 6),
      sched(tacoma, 'Transmission fluid', 30000, 36)
    ];

    const log = (v, days, odometer, service, cost, by, notes = '') =>
      ({ id: id('l'), vehicleId: v.id, service, date: ago(days), odometer, cost, by, notes });
    const logs = [
      // Daily Driver: oil change due soon, cabin filter overdue, the rest fine
      log(focus, 1030, 41200, 'Oil & filter change', 64.99, 'Shop', 'Jiffy Lube'),
      log(focus, 1030, 41200, 'Tire rotation', 0, 'Shop', 'Free with oil change'),
      log(focus, 860, 45900, 'Oil & filter change', 42.5, 'DIY', '5W-30 full synthetic'),
      log(focus, 700, 50300, 'Oil & filter change', 69.99, 'Shop', 'Jiffy Lube'),
      log(focus, 700, 50300, 'Tire rotation', 0, 'Shop'),
      log(focus, 700, 50300, 'Cabin air filter', 34.99, 'Shop'),
      log(focus, 610, 52800, 'New tires', 812.4, 'Shop', 'Discount Tire: 4x Michelin Pilot Sport 4S, mount & balance'),
      log(focus, 530, 54900, 'Oil & filter change', 44.1, 'DIY'),
      log(focus, 530, 54900, 'Engine air filter', 18.97, 'DIY'),
      log(focus, 420, 57600, 'Brake fluid flush', 129.95, 'Shop', 'Dealer'),
      log(focus, 420, 57600, 'Front brake pads & rotors', 486.3, 'Shop', 'Dealer: pads were at 3 mm'),
      log(focus, 340, 59700, 'Oil & filter change', 71.49, 'Shop'),
      log(focus, 340, 59700, 'Tire rotation', 0, 'Shop'),
      log(focus, 300, 60400, 'Spark plugs', 96.0, 'DIY', 'Motorcraft, 4x'),
      log(focus, 300, 60400, 'Coolant flush', 38.5, 'DIY'),
      log(focus, 190, 63300, 'Oil & filter change', 46.25, 'DIY'),
      log(focus, 190, 63300, 'Engine air filter', 21.49, 'DIY'),
      log(focus, 95, 65900, 'Battery replaced', 219.99, 'Shop', 'Old battery failed load test'),
      log(focus, 95, 65900, 'Battery test', 0, 'Shop'),
      log(focus, 95, 65900, 'Tire rotation', 0, 'Shop'),
      log(focus, 150, 64400, 'Wiper blades', 32.98, 'DIY'),
      // Weekend Truck
      log(tacoma, 640, 134800, 'Transmission fluid', 189.0, 'Shop'),
      log(tacoma, 400, 137900, 'Oil & filter change', 58.75, 'DIY', '5W-30'),
      log(tacoma, 400, 137900, 'Tire rotation', 0, 'DIY'),
      log(tacoma, 210, 140200, 'Rear leaf spring bushings', 340.0, 'Shop'),
      log(tacoma, 120, 141500, 'Oil & filter change', 61.2, 'DIY'),
      log(tacoma, 120, 141500, 'Tire rotation', 0, 'DIY')
    ];

    // Fill-ups every ~2 weeks on the Daily Driver, ~26 mpg with a little noise
    const fuel = [];
    const stations = ['Holiday', 'Kwik Trip', 'Costco', 'Holiday', 'Speedway'];
    let odo = 68420;
    for (let i = 0; i < 14; i++) {
      const volume = Math.round((10.4 + ((i * 7) % 5) * 0.55) * 1000) / 1000;
      const price = Math.round((3.09 + ((i * 3) % 7) * 0.06) * 1000) / 1000;
      fuel.push({
        id: id('f'), vehicleId: focus.id, date: ago(3 + i * 14), time: '', ref: '', odometer: odo,
        volume, price, total: Math.round(volume * price * 100) / 100,
        station: stations[i % stations.length], grade: 'regular', full: true, notes: ''
      });
      odo -= Math.round(volume * (25 + ((i * 5) % 4)));
    }

    return { vehicles: [focus, tacoma], logs, schedules, fuel };
  }

  // ---------- storage (falls back to memory when the browser blocks localStorage) ----------
  let memory = null;
  function seed() {
    memory = sample();
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(memory));
      localStorage.setItem(SEEDED_KEY, '1');
    } catch { /* memory only */ }
  }
  function readData() {
    try {
      if (!localStorage.getItem(SEEDED_KEY)) seed();
      const parsed = JSON.parse(localStorage.getItem(DATA_KEY));
      if (isValid(parsed)) return parsed;
    } catch { /* blocked or corrupt */ }
    if (!memory) seed();
    return JSON.parse(JSON.stringify(memory));
  }
  const isValid = (d) => d && typeof d === 'object' && Array.isArray(d.vehicles) && Array.isArray(d.logs) && Array.isArray(d.schedules);

  async function getJson(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function pickJson() {
    return new Promise((resolve, reject) => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
      input.oncancel = () => resolve(null);
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) { resolve(null); return; }
        try {
          const parsed = JSON.parse(await file.text());
          if (!isValid(parsed)) throw new Error();
          resolve(parsed);
        } catch {
          reject(new Error('That file is not a Garage Log backup.'));
        }
      };
      input.click();
    });
  }

  // Receipts live in memory for the visit (object URLs), like files on the PC would.
  const receipts = new Map();
  let syncConfig = {};
  const OFF = 'Downloading real models is turned off in this demo. The Windows app downloads them with your Sketchfab account.';

  // The same calls preload.js exposes in the Windows app.
  window.garage = {
    load: async () => readData(),
    save: async (data) => {
      if (!isValid(data)) throw new Error('Invalid data');
      memory = data;
      try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch { /* memory only */ }
      return true;
    },
    exportFile: async ({ defaultName, content }) => {
      download(defaultName, content, /\.csv$/i.test(defaultName) ? 'text/csv' : 'application/json');
      return defaultName;
    },
    importJson: pickJson,
    decodeVin: async (vin) => {
      const v = String(vin || '').toUpperCase().replace(/[\s-]/g, '');
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return { ok: false, error: 'Enter a full 17-character VIN.' };
      try {
        const json = await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${v}?format=json`);
        const row = json && Array.isArray(json.Results) ? json.Results[0] : null;
        return row ? { ok: true, row } : { ok: false, error: 'Unexpected response from the lookup service.' };
      } catch {
        return { ok: false, error: 'Could not reach the lookup service. Fill in the details by hand.' };
      }
    },
    findLook: async (spec) => {
      try { return { ok: true, look: await window.GarageCarLook.findLook(spec || {}, getJson) }; } catch { return { ok: false }; }
    },
    replicaHasToken: async () => true, // straight to the search; downloads say why they're off
    replicaSetToken: async () => true,
    replicaSearch: async (query) => {
      try { return { ok: true, json: await getJson(window.GarageReplica.searchUrl(String(query || '').slice(0, 120))) }; } catch { return { ok: false, error: "Couldn't reach Sketchfab." }; }
    },
    replicaDownload: async (uid) => (uid === MODEL.uid ? { ok: true } : { ok: false, error: OFF }),
    replicaRead: async (uid) => {
      if (uid !== MODEL.uid) return { ok: false };
      try {
        const res = await fetch(`models/${uid}.glb`);
        return res.ok ? { ok: true, kind: 'glb', data: await res.arrayBuffer() } : { ok: false };
      } catch {
        return { ok: false };
      }
    },
    replicaPrune: async () => true,
    receiptSave: async (id, bytes) => {
      receipts.set(id, URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
      return true;
    },
    receiptOpen: async (id) => {
      if (!receipts.has(id)) return false;
      window.open(receipts.get(id), '_blank', 'noopener');
      return true;
    },
    receiptList: async () => [...receipts.keys()],
    receiptRemove: async (id) => {
      if (receipts.has(id)) URL.revokeObjectURL(receipts.get(id));
      receipts.delete(id);
      return true;
    },
    getVersion: async () => VERSION,
    getSyncConfig: async () => syncConfig,
    setSyncConfig: async (cfg) => { syncConfig = cfg || {}; return true; },
    updateState: async () => ({ state: 'idle', version: VERSION }),
    updateCheck: async () => ({ state: 'none', version: VERSION }),
    updateDownload: async () => ({ state: 'none', version: VERSION }),
    updateInstall: async () => true,
    onUpdate: () => () => {}
  };

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.innerHTML = '<span><b>DEMO</b> Garage Log for Windows, running in your browser with sample data. Your changes stay in this browser.</span>';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn ghost small';
    reset.textContent = 'RESET DEMO';
    reset.onclick = () => {
      try { seed(); } catch { /* ignore */ }
      location.reload();
    };
    bar.appendChild(reset);
    const header = document.querySelector('header.top');
    if (header) header.after(bar);
  });
})();
