(() => {
  'use strict';
  const L = window.GarageLogic;
  const S = window.GarageSync;
  const C = window.GarageCarfax;
  const G3 = window.GarageCar3D;
  const TH = window.GarageThemes;
  const GL = window.GarageCarLook;
  const W = window.GarageWorkOrder;
  const $ = (sel, root = document) => root.querySelector(sel);

  const DATA_KEY = 'garage-log-v1';
  const UI_KEY = 'garage-log-ui';
  const SYNC_KEY = 'garage-log-sync';
  const clone = (x) => JSON.parse(JSON.stringify(x));

  let data = { vehicles: [], logs: [], schedules: [] };
  let vehicleId = null;
  let view = 'home';
  let storageOk = true;
  let appVersion = '';
  let lastUpdateCheck = 0;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // randomUUID only exists in secure contexts (https/localhost); fall back for plain http on a LAN.
  const uid = () =>
    (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const today = () => L.formatDate(new Date());
  const fmtInt = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : Math.round(n).toLocaleString('en-US'));
  const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vehicle = () => data.vehicles.find((v) => v.id === vehicleId) || null;
  const unit = (v) => (v && v.unit === 'km' ? 'km' : 'mi');
  const isValid = (d) => d && typeof d === 'object' && Array.isArray(d.vehicles) && Array.isArray(d.logs) && Array.isArray(d.schedules);

  // ---------- persistence (localStorage; same JSON shape as the desktop app's backup) ----------
  function loadData() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (!raw) return { vehicles: [], logs: [], schedules: [] };
      const parsed = JSON.parse(raw);
      return isValid(parsed) ? parsed : { vehicles: [], logs: [], schedules: [] };
    } catch {
      return { vehicles: [], logs: [], schedules: [] };
    }
  }

  let saved = null; // copy of data as last saved, to work out what changed (for sync)
  function writeData() {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
      return true;
    } catch {
      toast('COULD NOT SAVE: storage full or blocked');
      return false;
    }
  }

  function persist() {
    S.stampChanges(saved, data, Date.now());
    saved = clone(data);
    const ok = writeData();
    savePrefs();
    syncSoon();
    return ok;
  }

  function savePrefs() {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ vehicleId, view })); } catch { /* ignore */ }
  }
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; }
  }

  function checkStorage() {
    try {
      localStorage.setItem('__t', '1');
      localStorage.removeItem('__t');
      storageOk = true;
    } catch {
      storageOk = false;
    }
    const b = $('#banner');
    b.hidden = storageOk;
    if (!storageOk) b.textContent = 'Storage is blocked in this browser (private mode?). Nothing you enter will be saved.';
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ---------- dialog (bottom sheet) ----------
  function openForm({ title, fields, initial = {}, okLabel = 'SAVE', onSubmit, message }) {
    const dlg = $('#dlg');
    $('#dlgTitle').textContent = title;
    $('#dlgOk').textContent = okLabel;
    $('#dlgError').textContent = '';

    const html = [];
    let i = 0;
    while (i < fields.length) {
      const f = fields[i];
      if (f.pair && fields[i + 1]) {
        html.push(`<div class="field two">${fieldHtml(f, initial)}${fieldHtml(fields[i + 1], initial)}</div>`);
        i += 2;
      } else {
        html.push(`<div class="field">${fieldHtml(f, initial)}</div>`);
        i += 1;
      }
    }
    if (message) html.push(`<p class="confirm-msg">${esc(message)}</p>`);
    $('#dlgFields').innerHTML = html.join('');

    const form = $('#dlgForm');
    form.onsubmit = (e) => {
      e.preventDefault();
      const values = {};
      for (const f of fields) values[f.name] = form.elements[f.name].value.trim();
      try {
        const err = onSubmit(values);
        if (err) { $('#dlgError').textContent = err; return; }
        dlg.close();
      } catch (ex) {
        $('#dlgError').textContent = ex.message;
      }
    };
    $('#dlgCancel').onclick = () => dlg.close();
    dlg.showModal();
    wireVin(form);
    if (fields.length) {
      const first = form.elements[fields[0].name];
      // Don't auto-focus on touch devices: it pops the keyboard over the sheet.
      if (first && !window.matchMedia('(pointer: coarse)').matches) first.focus();
    } else {
      $('#dlgOk').focus();
    }
  }

  function fieldHtml(f, initial) {
    const val = initial[f.name] ?? f.default ?? '';
    const req = f.required ? 'required' : '';
    const label = `<label for="f_${f.name}">${esc(f.label)}${f.required ? ' *' : ''}</label>`;
    if (f.type === 'vin') {
      return `<div class="fcell">${label}<div class="vin-row">
        <input id="f_${f.name}" name="${f.name}" type="text" value="${esc(val)}" maxlength="24" autocapitalize="characters"
          autocomplete="off" autocorrect="off" spellcheck="false" placeholder="17 characters">
        <button type="button" class="btn ghost" data-vin-decode>DECODE</button></div>
        <div class="vin-status" id="vinStatus"></div></div>`;
    }
    let input;
    if (f.type === 'select') {
      input = `<select id="f_${f.name}" name="${f.name}" ${req}>${f.options
        .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`)
        .join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="f_${f.name}" name="${f.name}" ${req}>${esc(val)}</textarea>`;
    } else {
      const list = f.datalist ? `list="dl_${f.name}"` : '';
      const dl = f.datalist
        ? `<datalist id="dl_${f.name}">${f.datalist.map((o) => `<option value="${esc(o)}"></option>`).join('')}</datalist>`
        : '';
      const mode = f.type === 'number' ? (f.step ? 'decimal' : 'numeric') : '';
      input = `<input id="f_${f.name}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${req} ${list}
        ${mode ? `inputmode="${mode}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''}
        ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>${dl}`;
    }
    return `<div class="fcell">${label}${input}</div>`;
  }

  // Free NHTSA vPIC lookup. Always resolves to {ok, row} or {ok:false, error}.
  async function fetchVin(vin) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, { signal: ctrl.signal });
      if (!res.ok) return { ok: false, error: `The lookup service returned an error (${res.status}).` };
      const json = await res.json();
      const row = json && Array.isArray(json.Results) ? json.Results[0] : null;
      return row ? { ok: true, row } : { ok: false, error: 'Unexpected response from the lookup service.' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'The lookup timed out. Fill in the details by hand.' };
      if (navigator.onLine === false) return { ok: false, error: 'You are offline. Fill in the details by hand.' };
      return { ok: false, error: 'Could not reach the lookup service. Fill in the details by hand.' };
    } finally {
      clearTimeout(timer);
    }
  }

  // VIN auto-fill: decode on button press, or automatically once 17 valid characters are entered.
  function wireVin(form) {
    const input = form.elements.vin;
    const btn = $('[data-vin-decode]');
    const status = $('#vinStatus');
    if (!input || !btn || !status) return;
    let seq = 0;
    form.dataset.baseModel = '';
    const setStatus = (msg, kind = '') => { status.textContent = msg; status.className = 'vin-status ' + kind; };

    const run = async () => {
      const vin = L.normalizeVin(input.value);
      const problem = L.vinProblem(vin);
      if (problem) { setStatus(problem, 'err'); return; }
      const mine = ++seq;
      setStatus('Looking up…');
      btn.disabled = true;
      const res = await fetchVin(vin);
      if (mine !== seq) return; // the VIN changed while we were waiting
      btn.disabled = false;
      if (!res.ok) { setStatus(res.error || 'Lookup failed.', 'err'); return; }
      const d = L.vehicleFromNhtsa(res.row);
      if (!d.ok) { setStatus('No match for that VIN. Check for typos, or fill in the details by hand.', 'err'); return; }
      const set = (name, v) => { const el = form.elements[name]; if (el && v != null && v !== '') el.value = v; };
      set('year', d.year); set('make', d.make); set('model', d.model);
      set('body', G3.bodyFromNhtsa(d.bodyClass, d.doors));
      form.dataset.baseModel = d.baseModel || '';
      if (form.elements.name && !form.elements.name.value.trim()) {
        set('name', [d.year, d.make, d.model].filter(Boolean).join(' '));
      }
      const checkOk = L.vinCheckDigitOk(vin);
      setStatus('✓ ' + L.describeDecoded(d) + (checkOk ? '' : ' · check digit mismatch, double-check the VIN'), checkOk ? 'ok' : 'warn');
    };

    btn.addEventListener('click', run);
    input.addEventListener('input', () => {
      const v = L.normalizeVin(input.value);
      if (input.value !== v) input.value = v;
      seq++; // cancel any lookup still in flight
      btn.disabled = false;
      if (v.length === 17 && !L.vinProblem(v)) run();
      else setStatus(v ? (L.vinProblem(v) || '') : '', v && /[IOQ]/.test(v) ? 'err' : '');
    });
  }

  function confirmDialog(title, message, okLabel, onYes) {
    openForm({ title, fields: [], okLabel, message, onSubmit: () => { onYes(); } });
  }

  // ---------- vehicles ----------
  const vehicleFields = [
    { name: 'vin', label: 'VIN (fills in the details below)', type: 'vin' },
    { name: 'name', label: 'Nickname', required: true, placeholder: 'e.g. Daily, Track car' },
    { name: 'year', label: 'Year', type: 'number', min: 1900, pair: true },
    { name: 'make', label: 'Make' },
    { name: 'model', label: 'Model / trim' },
    { name: 'body', label: 'Body style', type: 'select', pair: true,
      options: [{ value: '', label: 'From VIN' }, ...G3.BODY_TYPES] },
    { name: 'color', label: 'Paint color', type: 'color', default: G3.DEFAULT_COLOR },
    { name: 'odometer', label: 'Odometer', type: 'number', min: 0, required: true, pair: true },
    { name: 'unit', label: 'Unit', type: 'select', options: [{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometers' }] },
    { name: 'notes', label: 'Notes', type: 'textarea' }
  ];

  function addVehicle() {
    openForm({
      title: 'New vehicle',
      fields: vehicleFields,
      initial: { unit: 'mi' },
      onSubmit: (v) => {
        const odo = Number(v.odometer);
        if (!Number.isFinite(odo) || odo < 0) return 'Odometer must be a number.';
        const veh = {
          id: uid(), name: v.name, year: v.year ? Number(v.year) : null, make: v.make, model: v.model,
          odometer: odo, unit: v.unit === 'km' ? 'km' : 'mi', vin: L.normalizeVin(v.vin), notes: v.notes,
          body: v.body, color: v.color, baseModel: keepBase(v.model, $('#dlgForm').dataset.baseModel)
        };
        data.vehicles.push(veh);
        vehicleId = veh.id;
        persist();
        render();
        setTimeout(() => offerPresets(veh), 60);
      }
    });
  }

  function presetSchedules(veh) {
    const have = new Set(data.schedules.filter((s) => s.vehicleId === veh.id).map((s) => s.name.toLowerCase()));
    const k = veh.unit === 'km' ? 1.609 : 1;
    let added = 0;
    for (const p of L.PRESETS) {
      if (have.has(p.name.toLowerCase())) continue;
      data.schedules.push({
        id: uid(), vehicleId: veh.id, name: p.name,
        intervalMiles: p.intervalMiles ? Math.round((p.intervalMiles * k) / 500) * 500 : 0,
        intervalMonths: p.intervalMonths
      });
      added++;
    }
    return added;
  }

  // The VIN's base model ("Camry") while the model field still starts with it ("Camry LE").
  const keepBase = (model, base) => (base && String(model || '').toLowerCase().startsWith(base.toLowerCase()) ? base : '');

  function offerPresets(veh) {
    confirmDialog('Add common schedules?',
      "Start with a standard set of reminders (oil, filters, fluids, plugs, tire rotation). Intervals are generic; edit them to match your owner's manual.",
      'ADD THEM',
      () => { const n = presetSchedules(veh); persist(); render(); toast(`${n} SCHEDULES ADDED`); });
  }

  function editVehicle() {
    const v = vehicle();
    if (!v) return;
    openForm({
      title: 'Edit vehicle',
      fields: vehicleFields,
      initial: v,
      onSubmit: (f) => {
        const odo = Number(f.odometer);
        if (!Number.isFinite(odo) || odo < 0) return 'Odometer must be a number.';
        Object.assign(v, {
          name: f.name, year: f.year ? Number(f.year) : null, make: f.make, model: f.model,
          odometer: odo, unit: f.unit === 'km' ? 'km' : 'mi', vin: L.normalizeVin(f.vin), notes: f.notes,
          body: f.body, color: f.color, baseModel: keepBase(f.model, $('#dlgForm').dataset.baseModel || v.baseModel)
        });
        if (!f.body) bodyTried.delete(v.id); // "From VIN": look it up again
        persist(); render();
      }
    });
  }

  function deleteVehicle() {
    const v = vehicle();
    if (!v) return;
    confirmDialog('Delete vehicle?',
      `This permanently removes "${v.name}" with its service history and schedules. Export a backup first if unsure.`,
      'DELETE',
      () => {
        data.logs = data.logs.filter((l) => l.vehicleId !== v.id);
        data.schedules = data.schedules.filter((s) => s.vehicleId !== v.id);
        data.vehicles = data.vehicles.filter((x) => x.id !== v.id);
        vehicleId = data.vehicles[0]?.id || null;
        persist(); render();
      });
  }

  function updateOdometer() {
    const v = vehicle();
    if (!v) return;
    openForm({
      title: 'Update odometer',
      fields: [{ name: 'odometer', label: `Current reading (${unit(v)})`, type: 'number', min: 0, required: true }],
      initial: { odometer: v.odometer },
      onSubmit: (f) => {
        const n = Number(f.odometer);
        if (!Number.isFinite(n) || n < 0) return 'Enter a valid number.';
        v.odometer = n;
        persist(); render();
      }
    });
  }

  // ---------- service log ----------
  function serviceNames(v) {
    const set = new Set(data.schedules.filter((s) => s.vehicleId === v.id).map((s) => s.name));
    L.PRESETS.forEach((p) => set.add(p.name));
    data.logs.filter((l) => l.vehicleId === v.id).forEach((l) => set.add(l.service));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function logForm(existing, preset) {
    const v = vehicle();
    if (!v) return;
    openForm({
      title: existing ? 'Edit service entry' : 'Log a service',
      fields: [
        { name: 'service', label: 'Service', required: true, datalist: serviceNames(v), placeholder: 'Pick or type' },
        { name: 'date', label: 'Date', type: 'date', required: true, pair: true },
        { name: 'odometer', label: `Odometer (${unit(v)})`, type: 'number', min: 0, required: true },
        { name: 'cost', label: 'Cost ($)', type: 'number', min: 0, step: '0.01', pair: true },
        { name: 'by', label: 'Done by', type: 'select', options: [{ value: 'DIY', label: 'DIY' }, { value: 'Shop', label: 'Shop / dealer' }] },
        { name: 'notes', label: 'Notes (parts, brand, shop...)', type: 'textarea' }
      ],
      initial: existing || { date: today(), odometer: v.odometer, by: 'DIY', ...(preset || {}) },
      onSubmit: (f) => {
        const odo = Number(f.odometer);
        if (!Number.isFinite(odo) || odo < 0) return 'Odometer must be a number.';
        const cost = f.cost === '' ? 0 : Number(f.cost);
        if (!Number.isFinite(cost) || cost < 0) return 'Cost must be zero or more.';
        if (!L.parseDate(f.date)) return 'Pick a valid date.';
        const entry = { vehicleId: v.id, service: f.service, date: f.date, odometer: odo, cost, by: f.by, notes: f.notes };
        if (existing) Object.assign(existing, entry);
        else data.logs.push({ id: uid(), ...entry });
        v.odometer = L.highestOdometer(v, data.logs);
        persist(); render();
        toast(existing ? 'ENTRY UPDATED' : 'SERVICE LOGGED');
      }
    });
  }

  function deleteLog(id) {
    const l = data.logs.find((x) => x.id === id);
    if (!l) return;
    confirmDialog('Delete entry?', `Remove "${l.service}" from ${l.date}?`, 'DELETE', () => {
      data.logs = data.logs.filter((x) => x.id !== id);
      persist(); render();
    });
  }

  // ---------- schedules ----------
  function scheduleForm(existing) {
    const v = vehicle();
    if (!v) return;
    openForm({
      title: existing ? 'Edit schedule' : 'New schedule',
      fields: [
        { name: 'name', label: 'Service name (matches log entries)', required: true, datalist: serviceNames(v) },
        { name: 'intervalMiles', label: `Every (${unit(v)})`, type: 'number', min: 0, pair: true },
        { name: 'intervalMonths', label: 'Every (months)', type: 'number', min: 0 }
      ],
      initial: existing || { intervalMiles: 5000, intervalMonths: 6 },
      onSubmit: (f) => {
        const mi = Number(f.intervalMiles || 0);
        const mo = Number(f.intervalMonths || 0);
        if (!(mi >= 0) || !(mo >= 0)) return 'Intervals must be zero or more.';
        if (mi === 0 && mo === 0) return 'Set a distance interval, a time interval, or both.';
        const dupe = data.schedules.find(
          (s) => s.vehicleId === v.id && s !== existing && s.name.trim().toLowerCase() === f.name.trim().toLowerCase()
        );
        if (dupe) return 'A schedule with that name already exists.';
        const entry = { vehicleId: v.id, name: f.name, intervalMiles: mi, intervalMonths: mo };
        if (existing) Object.assign(existing, entry);
        else data.schedules.push({ id: uid(), ...entry });
        persist(); render();
      }
    });
  }

  function deleteSchedule(id) {
    const s = data.schedules.find((x) => x.id === id);
    if (!s) return;
    confirmDialog('Delete schedule?', `Stop tracking "${s.name}"? Past log entries are kept.`, 'DELETE', () => {
      data.schedules = data.schedules.filter((x) => x.id !== id);
      persist(); render();
    });
  }

  // ---------- views ----------
  function dueText(st, v) {
    const parts = [];
    if (st.milesLeft != null) parts.push(st.milesLeft < 0 ? `${fmtInt(-st.milesLeft)} ${unit(v)} over` : `${fmtInt(st.milesLeft)} ${unit(v)} left`);
    if (st.daysLeft != null) parts.push(st.daysLeft < 0 ? `${-st.daysLeft} d over` : `${st.daysLeft} d left`);
    return parts.join(' · ');
  }
  function dueWhen(st, v) {
    const parts = [];
    if (st.nextMiles != null) parts.push(`@ ${fmtInt(st.nextMiles)} ${unit(v)}`);
    if (st.nextDate) parts.push(`by ${L.formatDate(st.nextDate)}`);
    return parts.join(' / ');
  }
  const badgeLabel = (st) => (st.status === 'unknown' ? 'NO RECORD' : st.status);

  function dueItemHtml(st, v) {
    return `<button class="due-item ${st.status}" data-action="logfor" data-name="${esc(st.schedule.name)}">
      <span class="bar"></span>
      <span class="mid"><span class="name">${esc(st.schedule.name)}</span>
        <span class="sub">${st.last ? `last ${esc(st.last.date)} @ ${fmtInt(st.last.odometer)}` : 'tap to log the first one'}</span></span>
      <span class="right"><span class="badge ${st.status}">${badgeLabel(st)}</span>
        <span class="sub">${st.status === 'unknown' ? '' : esc(dueText(st, v))}</span></span>
    </button>`;
  }

  function viewHome(v) {
    const stats = L.vehicleStats(v, data.logs);
    const statuses = L.allStatuses(v, data.schedules, data.logs);
    const over = statuses.filter((s) => s.status === 'overdue').length;
    const soon = statuses.filter((s) => s.status === 'soon').length;
    const recent = data.logs
      .filter((l) => l.vehicleId === v.id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 4);
    const sub = [v.year, v.make, v.model].filter(Boolean).join(' ');

    const summary = !statuses.length ? '' :
      `<div class="summary ${over ? 'overdue' : soon ? 'soon' : ''}"><span class="dot"></span>
        <span>${over ? `${over} overdue` : ''}${over && soon ? ' · ' : ''}${soon ? `${soon} due soon` : ''}${!over && !soon ? 'Nothing due. All good.' : ''}</span></div>`;

    const shown = statuses.slice(0, 5);
    const dueHtml = statuses.length
      ? `<div class="cards">${shown.map((st) => dueItemHtml(st, v)).join('')}</div>${
          statuses.length > shown.length ? `<p class="hint">${statuses.length - shown.length} more on the DUE tab.</p>` : ''}`
      : `<div class="empty">No schedules yet.<div><button class="btn" data-action="presets">ADD COMMON SCHEDULES</button></div></div>`;

    const recentHtml = recent.length
      ? `<div class="cards">${recent.map(logCardHtml.bind(null, v, false)).join('')}</div>`
      : `<div class="empty">Nothing logged yet.<div><button class="btn" data-action="addlog">LOG YOUR FIRST SERVICE</button></div></div>`;

    return `
      <h2 class="title">${esc(v.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</h2>
      ${carStageHtml(v)}
      ${summary}
      <div class="tiles">
        <button class="tile odo" data-action="odo"><div class="k">Odometer · tap to update</div><div class="v">${fmtInt(v.odometer)} ${unit(v)}</div></button>
        <div class="tile"><div class="k">Total spent</div><div class="v">${money(stats.total)}</div><div class="s">${stats.count} services · ${stats.diyCount} DIY</div></div>
        <div class="tile"><div class="k">Last 12 mo</div><div class="v">${money(stats.last12)}</div>
          <div class="s">${stats.costPerMile == null ? 'all-time per ' + unit(v) + ': needs 2+ readings' : 'all-time $' + stats.costPerMile.toFixed(3) + '/' + unit(v)}</div></div>
      </div>
      <div class="section"><h1><span class="rule"></span>What's due</h1>${dueHtml}</div>
      <div class="section"><h1><span class="rule"></span>Recent work</h1>${recentHtml}</div>`;
  }

  function logCardHtml(v, withActions, l) {
    return `<div class="card">
      <div class="head"><span class="name">${esc(l.service)}</span><span class="amt">${money(l.cost)}</span></div>
      <div class="meta">${esc(l.date)} · ${fmtInt(l.odometer)} ${unit(v)}${l.by ? ' · ' + esc(l.by) : ''}</div>
      ${l.notes ? `<div class="notes">${esc(l.notes)}</div>` : ''}
      ${withActions ? `<div class="btns"><button class="btn ghost small" data-action="editlog" data-id="${l.id}">EDIT</button>
        <button class="btn danger small" data-action="dellog" data-id="${l.id}">DELETE</button></div>` : ''}
    </div>`;
  }

  // The 3D car, plus the real vehicle's photo (from its Wikipedia article) to flip to.
  function carStageHtml(v) {
    const look = v.look && !v.look.none ? v.look : null;
    const years = look && look.years ? ` · ${look.years[0]}–${Math.min(look.years[1], new Date().getFullYear() + 1)}` : '';
    const tag = look ? `${look.name || look.title}${years}` : (G3.bodyLabel(v.body) || 'Body style not set');
    const ph = look && look.photo && GL.PHOTO_HOST.test(look.photo.url) ? look.photo : null;
    const credit = ph ? [ph.credit, ph.license].filter(Boolean).join(' · ') : '';
    const flipped = carPhoto && ph;
    return `<div class="car-stage${flipped ? ' show-photo' : ''}" id="car3d">
        <span class="car-tag" title="${look ? 'Built to the real size of the ' + esc(look.title) : ''}">${esc(tag)}</span>
        ${ph ? `<div class="car-photo-full"><img src="${esc(ph.url)}" alt="Photo of a ${esc(look.title)}">
          <span class="car-credit">Photo${credit ? ': ' + esc(credit) : ''} · <a href="${esc(ph.page || look.url)}" target="_blank" rel="noopener" class="link">source</a></span></div>
          <button type="button" class="car-photo" data-action="carphoto" title="${flipped ? 'Show the 3D model' : 'Show a real photo'}">${flipped ? '<span>3D</span>' : `<img src="${esc(ph.url)}" alt="">`}</button>` : ''}
        <span class="car-hint">${flipped ? '' : 'swipe to spin · '}<a href="#" class="link" data-action="editvehicle">paint</a>${look ? ` · <a href="${esc(look.url)}" target="_blank" rel="noopener" class="link">about</a>` : ''}</span></div>`;
  }

  function viewLog(v) {
    const rows = data.logs
      .filter((l) => l.vehicleId === v.id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.odometer || 0) - (a.odometer || 0)));
    const body = rows.length
      ? `<div class="cards">${rows.map(logCardHtml.bind(null, v, true)).join('')}</div>`
      : `<div class="empty">No service history yet.</div>`;
    return `<div class="row"><h1><span class="rule"></span>Service log · ${rows.length}</h1>
      <button class="btn ghost small" data-action="import">IMPORT</button>
      <button class="btn ghost small" data-action="csv">CSV</button></div>${body}`;
  }

  function viewDue(v) {
    const statuses = L.allStatuses(v, data.schedules, data.logs);
    const body = statuses.length
      ? `<div class="cards">${statuses.map((st) => `<div class="card">
          <div class="head"><span class="name">${esc(st.schedule.name)}</span><span class="badge ${st.status}">${badgeLabel(st)}</span></div>
          <div class="meta">every ${[st.schedule.intervalMiles ? fmtInt(st.schedule.intervalMiles) + ' ' + unit(v) : '', st.schedule.intervalMonths ? st.schedule.intervalMonths + ' mo' : ''].filter(Boolean).join(' or ')}</div>
          <div class="meta">${st.status === 'unknown' ? 'No matching log entry yet' : esc(dueText(st, v)) + ' · ' + esc(dueWhen(st, v))}</div>
          <div class="btns"><button class="btn small" data-action="logfor" data-name="${esc(st.schedule.name)}">LOG NOW</button>
            <button class="btn ghost small" data-action="editsched" data-id="${st.schedule.id}">EDIT</button>
            <button class="btn danger small" data-action="delsched" data-id="${st.schedule.id}">DELETE</button></div>
        </div>`).join('')}</div>`
      : `<div class="empty">No schedules yet.<div><button class="btn" data-action="presets">ADD COMMON SCHEDULES</button></div></div>`;
    return `<div class="row"><h1><span class="rule"></span>Schedules</h1>
      <button class="btn ghost small" data-action="presets">ADD COMMON SET</button></div>
      <p class="hint">Matched to log entries by name. Logging "Oil &amp; filter change" resets that schedule.</p>${body}`;
  }

  function installCard() {
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (standalone) return `<div class="card"><h3>Installed</h3><p>Running as an app. Works offline.</p></div>`;
    return `<div class="card"><h3>Install on your phone</h3>
      <p><b>iPhone / iPad:</b> open in Safari, tap Share, then "Add to Home Screen".<br>
      <b>Android:</b> open in Chrome, tap the menu, then "Install app" or "Add to Home screen".</p></div>`;
  }

  function viewData() {
    return `<div class="row"><h1><span class="rule"></span>Data</h1></div>
      <div class="cardlist">
        <div class="card wide"><h3>Appearance</h3><p>Colors and style for this phone. Pick a theme, then change the accent color if you like.</p>
          ${TH.pickerHtml(TH.load(localStorage), (vehicle() || {}).make)}</div>
        <div class="card"><h3>Backup</h3><p>Save everything to a JSON file. Same format as the desktop app, so you can import it there.</p>
          <div class="btns left"><button class="btn" data-action="backup">EXPORT BACKUP</button></div></div>
        <div class="card"><h3>Restore</h3><p>Replace all data here with a backup file (from this app or the desktop app).</p>
          <div class="btns left"><button class="btn ghost" data-action="restore">IMPORT BACKUP</button></div></div>
        ${syncCard()}
        <div class="card"><h3>Import records</h3><p>Shop work orders and receipts (Les Schwab, Discount Tire, Jiffy Lube, dealers) or CARFAX history, from a PDF, an email, or a photo of a paper receipt.</p>
          <div class="btns left"><button class="btn ghost" data-action="import">IMPORT RECORDS</button></div></div>
        <div class="card"><h3>App updates</h3><p>Version ${esc(appVersion || '…')}. The app updates itself when a new version is published; you'll be asked to reload.</p>
          <div class="btns left"><button class="btn ghost" data-action="checkupdate">CHECK FOR UPDATES</button></div></div>
        <div class="card"><h3>Current vehicle</h3><p>Edit details, or delete it with all of its history.</p>
          <div class="btns left"><button class="btn ghost" data-action="editvehicle">EDIT</button>
            <button class="btn danger" data-action="delvehicle">DELETE</button></div></div>
        ${installCard()}
      </div>
      <p class="hint">${sync.token
        ? 'Your data is stored on this device and synced to a private gist on your GitHub account, so the PC app has a copy too.'
        : 'Your data lives only in this browser on this device. Clearing site data deletes it, so turn on sync or export a backup now and then.'}</p>`;
  }

  function viewWelcome() {
    return `<div class="empty big"><div class="lead">NO VEHICLES YET</div>
      Add a car, truck, bike, anything with a service history.
      <div><button class="btn" data-action="addvehicle">+ ADD YOUR FIRST VEHICLE</button></div>
      <div><button class="btn ghost" data-action="restore">OR IMPORT A BACKUP</button></div></div>`;
  }

  // ---------- render ----------
  function render() {
    const sel = $('#vehicleSelect');
    sel.innerHTML = data.vehicles.length
      ? data.vehicles.map((v) => `<option value="${v.id}" ${v.id === vehicleId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')
      : '<option>No vehicles</option>';
    sel.disabled = !data.vehicles.length;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));

    const v = vehicle();
    const main = $('#main');
    const fab = $('#fab');
    if (!v) {
      main.innerHTML = viewWelcome();
      fab.hidden = true;
      return;
    }
    main.innerHTML =
      view === 'log' ? viewLog(v) :
      view === 'due' ? viewDue(v) :
      view === 'data' ? viewData() : viewHome(v);

    fab.hidden = view === 'data';
    fab.dataset.action = view === 'due' ? 'addsched' : 'addlog';
    fab.textContent = view === 'due' ? '+ SCHEDULE' : '+ LOG';
    mountCar(v);
    TH.paintSwatches(main);
    savePrefs();
  }

  // ---------- 3D car ----------
  let viewer; // created on first use; null if the browser has no WebGL
  let carPhoto = false; // showing the real photo instead of the 3D model
  const bodyTried = new Set();

  function mountCar(v) {
    const el = $('#car3d');
    if (!el) return;
    if (viewer === undefined) { try { viewer = G3.createViewer(); } catch { viewer = null; } }
    if (viewer) viewer.show(el, { body: v.body, color: v.color || G3.DEFAULT_COLOR, dims: v.look && v.look.dims });
    else el.classList.add('no-3d'); // no WebGL: the photo can still be shown
    if (v.vin && (!v.body || !v.baseModel) && !bodyTried.has(v.id)) { bodyTried.add(v.id); lookupBody(v); }
    else refreshLook(v);
  }

  // Vehicles added before these features existed: get the body style and base model from the VIN once.
  async function lookupBody(v) {
    let res;
    try { res = await fetchVin(v.vin); } catch { res = null; }
    if (res && res.ok && data.vehicles.includes(v)) {
      const d = L.vehicleFromNhtsa(res.row);
      const body = G3.bodyFromNhtsa(d.bodyClass, d.doors);
      let changed = false;
      if (body && !v.body) { v.body = body; changed = true; }
      // fill in whatever was left blank
      for (const k of ['year', 'make', 'model']) if (!v[k] && d[k]) { v[k] = d[k]; changed = true; }
      if (d.baseModel && !v.baseModel && String(v.make || '').toLowerCase() === String(d.make || '').toLowerCase()) {
        v.baseModel = d.baseModel;
        changed = true;
      }
      if (changed) { persist(); if (vehicle() === v && !$('#dlg').open) render(); }
    }
    refreshLook(v);
  }

  // What the vehicle really looks like: its generation's real dimensions and a photo (lib/carlook.js).
  // Looked up again whenever year / make / model change; "nothing found" is remembered too.
  const lookTried = new Set();
  const fetchLook = async (s) => {
    const getJson = async (url) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    };
    try { return { ok: true, look: await GL.findLook(s, getJson) }; } catch { return { ok: false }; }
  };
  const lookSpec = (v) => ({ year: v.year, make: v.make, model: v.baseModel || v.model, baseModel: v.baseModel, body: v.body });

  async function refreshLook(v) {
    const spec = lookSpec(v);
    const key = GL.lookKey(spec);
    if (!v.make || !spec.model || (v.look && v.look.key === key) || lookTried.has(v.id + key)) return;
    lookTried.add(v.id + key);
    let res = await fetchLook(spec);
    // a model typed with its trim ("Camry LE"): try its first word on its own
    if (res.ok && !res.look && !v.baseModel && /\s/.test(spec.model)) res = await fetchLook({ ...spec, model: spec.model.split(/\s+/)[0] });
    if (!res.ok || !data.vehicles.includes(v) || GL.lookKey(lookSpec(v)) !== key) return; // offline: try next time
    v.look = res.look ? { ...res.look, key } : { key, none: true };
    persist();
    if (vehicle() === v && !$('#dlg').open) render();
  }

  // ---------- files ----------
  async function saveFile(name, text, type) {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
        // fall through to a plain download
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  }

  async function backup() {
    const ok = await saveFile(`garage-log-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    if (ok) toast('BACKUP READY');
  }

  async function exportCsv() {
    const v = vehicle();
    if (!v) return;
    const safe = v.name.replace(/[^\w-]+/g, '_');
    const ok = await saveFile(`${safe}-service-log.csv`, L.logsToCsv(v, data.logs), 'text/csv');
    if (ok) toast('CSV READY');
  }

  function restore() { const input = $('#importFile'); input.value = ''; input.click(); }

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    let incoming;
    try {
      incoming = JSON.parse(await file.text());
    } catch {
      toast('NOT A VALID BACKUP FILE');
      return;
    }
    if (!isValid(incoming)) { toast('NOT A GARAGE LOG BACKUP'); return; }
    confirmDialog('Replace all data?',
      `The backup has ${incoming.vehicles.length} vehicle(s) and ${incoming.logs.length} log entries. Importing overwrites everything stored here now.`,
      'REPLACE', () => {
        data = incoming;
        vehicleId = data.vehicles[0]?.id || null;
        persist(); render(); toast('BACKUP RESTORED');
      });
  });

  const PDF_BASE = 'vendor/';
  const PASTE_HINT = "Or paste: an email receipt, a CARFAX service history page, or a paper receipt (point your camera at it and use Live Text on iPhone or Google Lens on Android to copy the text).";
  const ROW = (e, v, isOrder) => `<span class="s">${esc(e.service)}${isOrder ? ' · ' + money(e.cost) : ''}${e.duplicate ? ' <em>already logged</em>' : ''}</span>
        <span class="meta">${isOrder ? '' : esc(e.date) + ' · ' + fmtInt(e.odometer) + ' ' + unit(v)}<small>${esc(e.notes.replace(/^Imported from CARFAX( · )?/, ''))}</small></span>`;

  // ---------- importing records: shop work orders / receipts, or CARFAX history ----------
  let pdfReady = null;
  function loadPdfJs() {
    // Loaded on first use only (it's large).
    if (!pdfReady) {
      pdfReady = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PDF_BASE + 'pdf.min.js';
        s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_BASE + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
        s.onerror = () => { pdfReady = null; reject(new Error('Could not load the PDF reader.')); };
        document.head.appendChild(s);
      });
    }
    return pdfReady;
  }

  async function pdfText(file) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const page = await doc.getPage(i);
      pages.push(W.linesFromPdfItems((await page.getTextContent()).items));
    }
    return pages.join('\n');
  }

  function importRecords() {
    const v = vehicle();
    if (!v) return;
    openForm({
      title: `Import records · ${v.name}`,
      fields: [{ name: 'text', label: 'Or paste the text', type: 'textarea' }],
      okLabel: 'READ IT',
      onSubmit: (f) => (f.text ? readRecords(v, f.text) : 'Paste some text, or open a PDF.')
    });
    $('#f_text').rows = 7;
    $('#dlgFields').insertAdjacentHTML('afterbegin', `<p class="hint">Works with <b>shop work orders and receipts</b>
      (Les Schwab, Discount Tire, Jiffy Lube, dealers and others) and <b>CARFAX</b> service history.</p>
      <div class="import-pdf"><button type="button" class="btn" id="pdfBtn">OPEN A PDF</button>
        <span class="dim">the invoice PDF from the shop's email or website</span>
        <input type="file" id="pdfFile" accept="application/pdf,.pdf" hidden></div>
      <p class="hint">${PASTE_HINT}</p>`);
    const btn = $('#pdfBtn');
    const input = $('#pdfFile');
    btn.onclick = () => { input.value = ''; input.click(); };
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const err = $('#dlgError');
      btn.disabled = true;
      btn.textContent = 'READING…';
      err.textContent = '';
      try {
        const text = await pdfText(file);
        if (text.replace(/\s/g, '').length < 20) {
          err.textContent = "That PDF has no text in it (it's a scanned picture). Copy the text with your phone's camera (Live Text / Google Lens) and paste it instead.";
          return;
        }
        $('#f_text').value = text;
        const problem = readRecords(v, text);
        if (problem) err.textContent = problem;
        else $('#dlg').close();
      } catch (e) {
        err.textContent = 'Could not read that PDF' + (e && e.message ? ': ' + e.message : '.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'OPEN A PDF';
      }
    };
  }

  // Works out what the text is and opens the preview. Returns an error message, or nothing.
  function readRecords(v, text) {
    if (!W.looksLikeCarfax(text)) {
      const order = W.parseWorkOrder(text);
      const entries = W.toEntries(order, v, data.logs);
      if (entries.length) { setTimeout(() => previewImport(v, entries, order), 80); return; }
    }
    const entries = C.toEntries(C.parseCarfax(text), v, data.logs);
    if (entries.length) { setTimeout(() => previewImport(v, entries, null), 80); return; }
    return "Couldn't find any service work in that. Make sure it includes the lines describing the work (e.g. \"Rotate & balance\", \"Oil change\").";
  }

  // order: the parsed work order (one visit, date/mileage editable), or null for CARFAX (many visits).
  function previewImport(v, entries, order) {
    const dupes = entries.filter((e) => e.duplicate).length;
    const total = entries.reduce((s, e) => s + (e.cost || 0), 0);
    openForm({
      title: order ? `${order.shop || 'Work order'} · check and import` : 'CARFAX · pick what to import',
      fields: order ? [
        { name: 'date', label: 'Date', type: 'date', required: true, pair: true },
        { name: 'odometer', label: `Odometer (${unit(v)})`, type: 'number', min: 0 }
      ] : [],
      initial: order ? { date: order.date || '', odometer: order.odometer ?? '' } : {},
      okLabel: 'IMPORT',
      onSubmit: (f) => {
        const picked = [...document.querySelectorAll('#dlgFields input[data-i]:checked')].map((el) => entries[Number(el.dataset.i)]);
        if (!picked.length) return 'Tick at least one entry.';
        let date = null;
        let odo = null;
        if (order) {
          if (!L.parseDate(f.date)) return 'Pick the date of the visit.';
          date = f.date;
          odo = f.odometer === '' ? null : Number(f.odometer);
          if (odo != null && !(odo >= 0)) return 'Odometer must be a number.';
        }
        for (const { duplicate, ...entry } of picked) {
          data.logs.push({ id: uid(), ...entry, ...(order ? { date, odometer: odo } : {}) });
        }
        v.odometer = L.highestOdometer(v, data.logs);
        persist(); render();
        toast(`${picked.length} ${picked.length === 1 ? 'ENTRY' : 'ENTRIES'} IMPORTED`);
      }
    });
    const summary = order
      ? `Found ${entries.length} service ${entries.length === 1 ? 'item' : 'items'}${order.total != null ? `, invoice total ${money(order.total)}` : ''}.
         Fees and tax are added to the biggest item so your spending matches the invoice.${order.date ? '' : ' <b>No date found; set it above.</b>'}`
      : `Found ${entries.length} service ${entries.length === 1 ? 'entry' : 'entries'}. Costs aren't in CARFAX, so they import as $0.`;
    $('#dlgFields').insertAdjacentHTML('beforeend', `<p class="hint">${summary}${dupes ? ` ${dupes} already in your log (unticked).` : ''}</p>
      <div class="cfx-list">${entries.map((e, i) => `<label class="cfx-row${e.duplicate ? ' dup' : ''}">
        <input type="checkbox" data-i="${i}" ${e.duplicate ? '' : 'checked'}>
        ${ROW(e, v, Boolean(order))}</label>`).join('')}</div>${order && entries.length > 1 ? `<p class="hint">Items total: ${money(total)}</p>` : ''}`);
  }

  // ---------- PC sync (private GitHub Gist, see sync.js) ----------
  const NO_SYNC = { token: '', gistId: null, lastSync: 0 };
  let sync = { ...NO_SYNC };
  let syncing = false;
  let syncAgain = false;
  let syncTimer = null;
  let syncError = '';

  function loadSync() {
    try { return { ...NO_SYNC, ...(JSON.parse(localStorage.getItem(SYNC_KEY)) || {}) }; } catch { return { ...NO_SYNC }; }
  }
  function saveSync() {
    try {
      if (sync.token) localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
      else localStorage.removeItem(SYNC_KEY);
    } catch { /* storage blocked */ }
  }

  function syncSoon(delay = 3000) {
    if (!sync.token) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => runSync(false), delay);
  }

  async function runSync(manual) {
    if (!sync.token) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    if (manual) toast('SYNCING…');
    try {
      const r = await S.syncNow({ token: sync.token, gistId: sync.gistId, local: clone(data) });
      const merged = S.mergeData(data, r.data); // keep anything edited while we were waiting on GitHub
      sync = { ...sync, gistId: r.gistId, lastSync: Date.now() };
      syncError = '';
      saveSync();
      if (!S.sameData(merged, data)) {
        data = merged;
        saved = clone(data);
        writeData();
        if (!data.vehicles.some((v) => v.id === vehicleId)) vehicleId = data.vehicles[0]?.id || null;
        if (!manual) toast('UPDATED FROM YOUR PC');
      }
      if (!$('#dlg').open) render();
      if (manual) toast('SYNCED');
    } catch (e) {
      syncError = e.message || 'Sync failed.';
      if (!sync.lastSync && !sync.gistId) sync = { ...NO_SYNC }; // first connect failed: don't keep a bad token
      if (manual) toast(syncError);
      if (!$('#dlg').open) render();
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; syncSoon(500); }
    }
  }

  function connectSync() {
    openForm({
      title: 'Sync with the PC app',
      fields: [{ name: 'token', label: 'GitHub token', type: 'password', required: true, placeholder: 'ghp_…' }],
      okLabel: 'CONNECT',
      onSubmit: (f) => {
        sync = { token: f.token, gistId: null, lastSync: 0 };
        runSync(true);
      }
    });
    $('#dlgFields').insertAdjacentHTML('afterbegin', `<p class="hint">Paste the same GitHub token you used in the PC app
      (a token with only the <b>gist</b> box ticked, from github.com/settings/tokens/new). Data already on this phone and on
      the PC is merged, not replaced.</p>`);
  }

  function disconnectSync() {
    confirmDialog('Stop syncing?', 'This phone stops syncing. Everything stays here and on the PC; you can reconnect any time.', 'DISCONNECT', () => {
      clearTimeout(syncTimer);
      sync = { ...NO_SYNC };
      syncError = '';
      saveSync();
      render();
    });
  }

  function syncCard() {
    if (!sync.token) {
      return `<div class="card"><h3>PC sync</h3><p>Keep this phone and the PC app in step. Changes on either one show up on the other.</p>
        <div class="btns left"><button class="btn" data-action="syncon">CONNECT</button></div></div>`;
    }
    const when = sync.lastSync ? new Date(sync.lastSync).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'not yet';
    return `<div class="card"><h3>PC sync</h3><p>On. Changes sync automatically. Last synced: ${esc(when)}.
      ${syncError ? `<br><span class="sync-err">${esc(syncError)}</span>` : ''}</p>
      <div class="btns left"><button class="btn" data-action="syncnow">SYNC NOW</button>
        <button class="btn ghost" data-action="syncoff">DISCONNECT</button></div></div>`;
  }

  // ---------- app updates ----------
  // New versions arrive as a new service worker. It installs and activates by itself; since this page is
  // still running the old code, we show a bar asking the user to reload when it takes over.
  function showUpdateBar() { $('#updateBar').hidden = false; }

  async function checkForUpdate(manual) {
    if (!('serviceWorker' in navigator)) { if (manual) toast('UPDATES NEED THE INSTALLED APP'); return; }
    let reg;
    try { reg = await navigator.serviceWorker.getRegistration(); } catch { reg = null; }
    if (!reg) { if (manual) toast('UPDATES WORK ONCE INSTALLED OVER HTTPS'); return; }
    let found = false;
    const onFound = () => { found = true; };
    reg.addEventListener('updatefound', onFound);
    try {
      await reg.update();
    } catch {
      reg.removeEventListener('updatefound', onFound);
      if (manual) toast('COULD NOT CHECK. ARE YOU OFFLINE?');
      return;
    }
    lastUpdateCheck = Date.now();
    if (manual) {
      await new Promise((r) => setTimeout(r, 1500)); // let a found update install and take over
      if (!found) toast('YOU ARE ON THE LATEST VERSION');
    }
    reg.removeEventListener('updatefound', onFound);
  }

  function setupUpdates() {
    fetch('version.json').then((r) => r.json()).then((j) => {
      appVersion = j && j.version ? String(j.version) : '';
      if (view === 'data') render();
    }).catch(() => {});
    if (!('serviceWorker' in navigator)) return;
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) showUpdateBar(); // an update took over (not the very first install)
      hadController = true;
    });
    // Look for updates whenever the app comes back to the foreground (at most once an hour).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastUpdateCheck > 60 * 60 * 1000) checkForUpdate(false);
    });
  }

  // ---------- events ----------
  // ---------- appearance ----------
  // Themes are a per-device preference (lib/themes.js), applied live; the settings card is re-drawn
  // so the selected swatch moves.
  function setTheme(prefs) {
    TH.save(localStorage, prefs);
    TH.apply(document, TH.load(localStorage));
    render();
  }

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'accentPick') return;
    const prefs = { ...TH.load(localStorage), accent: e.target.value };
    TH.save(localStorage, prefs);
    TH.apply(document, prefs); // live while dragging; the card is re-drawn on 'change'
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'accentPick') render(); });

  const actions = {
    import: importRecords,
    theme: (id) => setTheme({ id }),
    accentreset: () => setTheme({ ...TH.load(localStorage), accent: '' }),
    carphoto: () => { carPhoto = !carPhoto; render(); },
    syncon: connectSync,
    syncnow: () => runSync(true),
    syncoff: disconnectSync,
    addvehicle: addVehicle,
    editvehicle: editVehicle,
    delvehicle: deleteVehicle,
    odo: updateOdometer,
    addlog: () => logForm(null),
    logfor: (_id, name) => logForm(null, { service: name }),
    editlog: (id) => logForm(data.logs.find((l) => l.id === id)),
    dellog: deleteLog,
    addsched: () => scheduleForm(null),
    editsched: (id) => scheduleForm(data.schedules.find((s) => s.id === id)),
    delsched: deleteSchedule,
    presets: () => {
      const v = vehicle();
      if (!v) return;
      const n = presetSchedules(v);
      persist(); render();
      toast(n ? `${n} SCHEDULES ADDED` : 'ALREADY HAVE THEM ALL');
    },
    csv: exportCsv,
    backup,
    restore,
    reload: () => location.reload(),
    checkupdate: () => checkForUpdate(true)
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    e.preventDefault();
    const fn = actions[el.dataset.action];
    if (fn) fn(el.dataset.id, el.dataset.name);
  });

  $('#addVehicleBtn').addEventListener('click', addVehicle);
  $('#vehicleSelect').addEventListener('change', (e) => { vehicleId = e.target.value; render(); });
  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    view = b.dataset.view;
    $('#main').scrollTop = 0;
    render();
  });
  // Tap outside the sheet to dismiss.
  $('#dlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  // ---------- init ----------
  checkStorage();
  data = loadData();
  saved = clone(data);
  sync = loadSync();
  const prefs = loadPrefs();
  vehicleId = data.vehicles.find((v) => v.id === prefs.vehicleId)?.id || data.vehicles[0]?.id || null;
  if (['home', 'log', 'due', 'data'].includes(prefs.view)) view = prefs.view;
  render();

  // Ask the browser not to evict our data under storage pressure.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* ignore */ }

  setupUpdates();

  // Sync on open, when coming back to the app, and every few minutes while it's open.
  runSync(false);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - sync.lastSync > 30000) syncSoon(0);
  });
  setInterval(() => { if (document.visibilityState === 'visible') runSync(false); }, 5 * 60 * 1000);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(() => checkForUpdate(false)).catch(() => {});
    });
  }
})();
