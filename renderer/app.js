(() => {
  'use strict';
  const L = window.GarageLogic;
  const S = window.GarageSync;
  const C = window.GarageCarfax;
  const G3 = window.GarageCar3D;
  const F = window.GarageFuel;
  const TH = window.GarageThemes;
  const GL = window.GarageCarLook;
  const W = window.GarageWorkOrder;
  const $ = (sel, root = document) => root.querySelector(sel);

  let data = { vehicles: [], logs: [], schedules: [], fuel: [] };
  let vehicleId = null;
  let view = 'dashboard';

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => crypto.randomUUID();
  const today = () => L.formatDate(new Date());
  const fmtInt = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : Math.round(n).toLocaleString('en-US'));
  const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vehicle = () => data.vehicles.find((v) => v.id === vehicleId) || null;
  const unit = (v) => (v && v.unit === 'km' ? 'km' : 'mi');

  // ---------- persistence ----------
  let saveTimer = null;
  let saved = null; // copy of data as last saved, to work out what changed (for sync)
  async function persist() {
    S.stampChanges(saved, data, Date.now());
    saved = structuredClone(data);
    try {
      await window.garage.save(data);
    } catch (err) {
      toast('SAVE FAILED: ' + err.message);
    }
    syncSoon();
  }
  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 150);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ---------- generic form dialog ----------
  function openForm({ title, fields, initial = {}, okLabel = 'SAVE', onSubmit }) {
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
    $('#dlgFields').innerHTML = html.join('');

    const form = $('#dlgForm');
    form.onsubmit = (e) => {
      e.preventDefault();
      const values = {};
      for (const f of fields) {
        const el = form.elements[f.name];
        values[f.name] = el.value.trim();
      }
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
    const first = fields.length ? form.elements[fields[0].name] : null;
    if (first) first.focus();
    else $('#dlgOk').focus();
  }

  function fieldHtml(f, initial) {
    const val = initial[f.name] ?? f.default ?? '';
    const req = f.required ? 'required' : '';
    const label = `<label for="f_${f.name}">${esc(f.label)}${f.required ? ' *' : ''}</label>`;
    if (f.type === 'vin') {
      return `<div class="fcell">${label}<div class="vin-row">
        <input id="f_${f.name}" name="${f.name}" type="text" value="${esc(val)}" maxlength="24" autocapitalize="characters"
          autocomplete="off" spellcheck="false" placeholder="17 characters">
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
      input = `<input id="f_${f.name}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${req} ${list}
        ${f.min != null ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>${dl}`;
    }
    return `<div class="fcell">${label}${input}</div>`;
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
      let res;
      try { res = await window.garage.decodeVin(vin); } catch { res = { ok: false, error: 'Lookup failed.' }; }
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
    openForm({
      title,
      fields: [],
      okLabel,
      onSubmit: () => { onYes(); },
      initial: {}
    });
    $('#dlgFields').innerHTML = `<p class="confirm-msg">${esc(message)}</p>`;
  }

  // ---------- vehicles ----------
  const vehicleFields = [
    { name: 'vin', label: 'VIN (fills in the details below)', type: 'vin' },
    { name: 'name', label: 'Nickname', required: true, placeholder: 'e.g. Daily, Track car' },
    { name: 'year', label: 'Year', type: 'number', min: 1900, pair: true },
    { name: 'make', label: 'Make' },
    { name: 'model', label: 'Model / trim' },
    { name: 'body', label: 'Body style (3D car)', type: 'select', pair: true,
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
        if (!data.schedules.some((s) => s.vehicleId === veh.id)) {
          setTimeout(() => offerPresets(veh), 50);
        }
      }
    });
  }

  // The VIN's base model ("Camry") while the model field still starts with it ("Camry LE").
  const keepBase = (model, base) => (base && String(model || '').toLowerCase().startsWith(base.toLowerCase()) ? base : '');

  function offerPresets(veh) {
    confirmDialog('Add common schedules?',
      'Start with a standard set of reminders (oil, filters, fluids, plugs, tire rotation). Intervals are generic; edit them to match your owner\'s manual.',
      'ADD THEM',
      () => {
        const k = veh.unit === 'km' ? 1.609 : 1;
        for (const p of L.PRESETS) {
          data.schedules.push({
            id: uid(), vehicleId: veh.id, name: p.name,
            intervalMiles: p.intervalMiles ? Math.round((p.intervalMiles * k) / 500) * 500 : 0,
            intervalMonths: p.intervalMonths
          });
        }
        persist(); render(); toast('SCHEDULES ADDED');
      });
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
      `This permanently removes "${v.name}" along with its service history and schedules. Export a backup first if unsure.`,
      'DELETE',
      () => {
        data.logs = data.logs.filter((l) => l.vehicleId !== v.id);
        data.schedules = data.schedules.filter((s) => s.vehicleId !== v.id);
        data.fuel = data.fuel.filter((f) => f.vehicleId !== v.id);
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

  function logForm(existing) {
    const v = vehicle();
    if (!v) return;
    openForm({
      title: existing ? 'Edit service entry' : 'Log a service',
      fields: [
        { name: 'service', label: 'Service', required: true, datalist: serviceNames(v), placeholder: 'Pick or type, e.g. Oil & filter change' },
        { name: 'date', label: 'Date', type: 'date', required: true, pair: true },
        { name: 'odometer', label: `Odometer (${unit(v)})`, type: 'number', min: 0, required: true },
        { name: 'cost', label: 'Cost ($)', type: 'number', min: 0, step: '0.01', pair: true },
        { name: 'by', label: 'Done by', type: 'select', options: [{ value: 'DIY', label: 'DIY' }, { value: 'Shop', label: 'Shop / dealer' }] },
        { name: 'notes', label: 'Notes (parts, brand, shop...)', type: 'textarea' }
      ],
      initial: existing || { date: today(), odometer: v.odometer, by: 'DIY' },
      onSubmit: (f) => {
        const odo = Number(f.odometer);
        if (!Number.isFinite(odo) || odo < 0) return 'Odometer must be a number.';
        const cost = f.cost === '' ? 0 : Number(f.cost);
        if (!Number.isFinite(cost) || cost < 0) return 'Cost must be zero or more.';
        if (!L.parseDate(f.date)) return 'Pick a valid date.';
        const entry = { vehicleId: v.id, service: f.service, date: f.date, odometer: odo, cost, by: f.by, notes: f.notes };
        if (existing) Object.assign(existing, entry);
        else data.logs.push({ id: uid(), ...entry });
        v.odometer = L.highestOdometer(v, [...data.logs, ...data.fuel]);
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
        { name: 'intervalMiles', label: `Every (${unit(v)}), 0 = ignore`, type: 'number', min: 0, pair: true },
        { name: 'intervalMonths', label: 'Every (months), 0 = ignore', type: 'number', min: 0 }
      ],
      initial: existing || { intervalMiles: 5000, intervalMonths: 6 },
      onSubmit: (f) => {
        const mi = Number(f.intervalMiles || 0);
        const mo = Number(f.intervalMonths || 0);
        if (!(mi >= 0) || !(mo >= 0)) return 'Intervals must be zero or more.';
        if (mi === 0 && mo === 0) return 'Set a mileage interval, a time interval, or both.';
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
    if (st.milesLeft != null) {
      parts.push(st.milesLeft < 0 ? `${fmtInt(-st.milesLeft)} ${unit(v)} over` : `${fmtInt(st.milesLeft)} ${unit(v)} left`);
    }
    if (st.daysLeft != null) {
      if (st.daysLeft < 0) parts.push(`${-st.daysLeft} d over`);
      else parts.push(`${st.daysLeft} d left`);
    }
    return parts.join(' · ');
  }

  function dueWhen(st, v) {
    const parts = [];
    if (st.nextMiles != null) parts.push(`@ ${fmtInt(st.nextMiles)} ${unit(v)}`);
    if (st.nextDate) parts.push(`by ${L.formatDate(st.nextDate)}`);
    return parts.join(' / ');
  }

  function viewDashboard(v) {
    const stats = L.vehicleStats(v, data.logs);
    const statuses = L.allStatuses(v, data.schedules, data.logs);
    const recent = data.logs
      .filter((l) => l.vehicleId === v.id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 5);
    const title = [v.year, v.make, v.model].filter(Boolean).join(' ');

    const tiles = `
      <div class="tiles">
        <div class="tile odo"><div class="k">Odometer</div><div class="v">${fmtInt(v.odometer)}</div>
          <div class="s">${unit(v)} · <a href="#" class="link" data-action="odo">update</a></div></div>
        <div class="tile"><div class="k">Total spent</div><div class="v">${money(stats.total)}</div>
          <div class="s">${stats.count} services · ${stats.diyCount} DIY</div></div>
        <div class="tile"><div class="k">Last 12 months</div><div class="v">${money(stats.last12)}</div><div class="s">&nbsp;</div></div>
        <div class="tile"><div class="k">Cost per ${unit(v)}</div>
          <div class="v">${stats.costPerMile == null ? '—' : '$' + stats.costPerMile.toFixed(3)}</div>
          <div class="s">${stats.costPerMile == null ? 'needs 2+ odometer readings' : 'across logged range'}</div></div>
      </div>`;

    const dueHtml = statuses.length
      ? `<div class="due">${statuses.map((st) => `
          <div class="due-item ${st.status}">
            <div class="bar"></div>
            <div><div class="name">${esc(st.schedule.name)}</div>
              <div class="sub">${st.last ? `last: ${esc(st.last.date)} @ ${fmtInt(st.last.odometer)} ${unit(v)}` : 'no matching log entry yet'}</div></div>
            <div class="right"><span class="badge ${st.status}">${st.status === 'unknown' ? 'NO RECORD' : st.status}</span>
              <div class="sub">${st.status === 'unknown' ? '' : esc(dueText(st, v))}</div>
              <div class="sub">${st.status === 'unknown' ? '' : esc(dueWhen(st, v))}</div></div>
          </div>`).join('')}</div>`
      : `<div class="empty">No schedules yet. Schedules tell Garage Log what to remind you about.
          <div><button class="btn" data-action="presets">ADD COMMON SCHEDULES</button></div></div>`;

    const recentHtml = recent.length
      ? `<table><thead><tr><th>Date</th><th>Service</th><th class="num">${unit(v)}</th><th class="num">Cost</th></tr></thead><tbody>${recent
          .map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.service)}</td><td class="num">${fmtInt(l.odometer)}</td><td class="num">${money(l.cost)}</td></tr>`)
          .join('')}</tbody></table>`
      : `<div class="empty">Nothing logged yet.<div><button class="btn" data-action="addlog">LOG YOUR FIRST SERVICE</button></div></div>`;

    return `
      <div class="row"><h1 class="grow"><span class="rule"></span>${esc(v.name)}${title ? ' — ' + esc(title) : ''}</h1>
        <button class="btn ghost small" data-action="editvehicle">EDIT VEHICLE</button>
        <button class="btn" data-action="addlog">+ LOG SERVICE</button></div>
      ${carStageHtml(v)}
      ${fuelCardHtml(v)}
      ${tiles}
      <div class="section"><h1><span class="rule"></span>What's due</h1>${dueHtml}</div>
      <div class="section"><h1><span class="rule"></span>Recent work</h1>${recentHtml}</div>`;
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
        <span class="car-hint">${flipped ? '' : 'drag to spin · '}<a href="#" class="link" data-action="editvehicle">paint &amp; body</a>${look ? ` · <a href="${esc(look.url)}" target="_blank" rel="noopener" class="link">about</a>` : ''}</span></div>`;
  }

  function viewLog(v) {
    const rows = data.logs
      .filter((l) => l.vehicleId === v.id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.odometer || 0) - (a.odometer || 0)));
    const body = rows.length
      ? `<table><thead><tr><th>Date</th><th class="num">${unit(v)}</th><th>Service</th><th>By</th><th class="num">Cost</th><th>Notes</th><th></th></tr></thead><tbody>${rows
          .map((l) => `<tr>
            <td>${esc(l.date)}</td><td class="num">${fmtInt(l.odometer)}</td><td>${esc(l.service)}</td>
            <td>${esc(l.by)}</td><td class="num">${money(l.cost)}</td><td class="notes">${esc(l.notes)}</td>
            <td class="actions"><button class="btn ghost small" data-action="editlog" data-id="${l.id}">EDIT</button>
              <button class="btn danger small" data-action="dellog" data-id="${l.id}">DEL</button></td></tr>`)
          .join('')}</tbody></table>`
      : `<div class="empty">No service history yet.</div>`;
    return `<div class="row"><h1 class="grow"><span class="rule"></span>Service log · ${esc(v.name)}</h1>
      <button class="btn ghost" data-action="import">IMPORT RECORDS</button>
      <button class="btn ghost" data-action="csv">EXPORT CSV</button>
      <button class="btn" data-action="addlog">+ LOG SERVICE</button></div>${body}`;
  }

  function viewFuel(v) {
    const fills = fuelFor(v).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.odometer || 0) - (a.odometer || 0)));
    const st = F.fuelStats(fills, v);
    const tile = (k, val, sub) => `<div class="tile"><div class="k">${k}</div><div class="v">${val}</div><div class="s">${sub || '&nbsp;'}</div></div>`;
    const tiles = fills.length ? `<div class="tiles">
        ${tile(`${new Date().getFullYear()} so far`, money(st.thisYear), `${money(st.last12)} in the last 12 months`)}
        ${tile('Per year', st.perYear != null ? money(st.perYear) : '—', st.perMonth != null ? `≈ ${money(st.perMonth)} a month` : 'needs a few weeks of fill-ups')}
        ${tile('All time', money(st.total), `${fmtVol(st.volume)} ${volAbbr(v)} · ${st.count} fill-ups`)}
        ${tile(st.economyUnit, st.economy != null ? String(st.economy) : '—', st.economy != null ? 'full-tank average' : 'needs 2 full fills with odometer')}
        ${tile(`Avg per ${volAbbr(v)}`, fmtPrice(st.avgPrice), '')}
        ${tile(`Fuel per ${unit(v)}`, st.costPerDistance != null ? '$' + st.costPerDistance.toFixed(3) : '—', st.costPerDistance != null ? 'across logged odometer range' : 'needs odometer on 2+ fill-ups')}
      </div>` : '';
    const years = st.byYear.length > 1 || (st.byYear[0] && st.byYear[0].year !== new Date().getFullYear())
      ? `<div class="section"><h1><span class="rule"></span>By year</h1><table><thead><tr><th>Year</th><th class="num">Fill-ups</th><th class="num">${volAbbr(v)}</th><th class="num">Spent</th></tr></thead><tbody>${st.byYear
          .map((y) => `<tr><td>${y.year}</td><td class="num">${y.fills}</td><td class="num">${fmtVol(y.volume)}</td><td class="num">${money(y.total)}</td></tr>`).join('')}</tbody></table></div>` : '';
    const body = fills.length
      ? `<table><thead><tr><th>Date</th><th class="num">${unit(v)}</th><th class="num">${volAbbr(v)}</th><th class="num">Price</th><th class="num">Total</th><th>Station</th><th>Fuel</th><th></th></tr></thead><tbody>${fills
          .map((f) => `<tr>
            <td>${esc(f.date)}</td><td class="num">${f.odometer ? fmtInt(f.odometer) : '—'}</td><td class="num">${fmtVol(f.volume)}${f.full === false ? ' <span class="dim">partial</span>' : ''}</td>
            <td class="num">${fmtPrice(f.price)}</td><td class="num">${money(f.total)}</td><td>${esc(f.station)}</td><td>${esc(gradeLabel(f.grade))}</td>
            <td class="actions"><button class="btn ghost small" data-action="editfuel" data-id="${f.id}">EDIT</button>
              <button class="btn danger small" data-action="delfuel" data-id="${f.id}">DEL</button></td></tr>`)
          .join('')}</tbody></table>`
      : `<div class="empty">No fill-ups yet. Import gas receipts (PDF, email or a photo's text) or add fill-ups by hand,
          and Garage Log works out what fuel costs you a year, your average price and fuel economy.
          <div><button class="btn" data-action="importfuel">IMPORT RECEIPTS</button> <button class="btn ghost" data-action="addfuel">+ ADD A FILL-UP</button></div></div>`;
    return `<div class="row"><h1 class="grow"><span class="rule"></span>Fuel · ${esc(v.name)}</h1>
      <button class="btn ghost" data-action="importfuel">IMPORT RECEIPTS</button>
      <button class="btn" data-action="addfuel">+ ADD FILL-UP</button></div>${tiles}${years}
      <div class="section"><h1><span class="rule"></span>Fill-ups</h1>${body}</div>`;
  }

  function viewSchedules(v) {
    const statuses = L.allStatuses(v, data.schedules, data.logs);
    const body = statuses.length
      ? `<table><thead><tr><th>Service</th><th class="num">Every (${unit(v)})</th><th class="num">Every (mo)</th><th>Status</th><th>Next due</th><th></th></tr></thead><tbody>${statuses
          .map((st) => `<tr>
            <td>${esc(st.schedule.name)}</td>
            <td class="num">${st.schedule.intervalMiles ? fmtInt(st.schedule.intervalMiles) : '—'}</td>
            <td class="num">${st.schedule.intervalMonths || '—'}</td>
            <td><span class="badge ${st.status}">${st.status === 'unknown' ? 'NO RECORD' : st.status}</span></td>
            <td>${st.status === 'unknown' ? '<span class="dim">log it once to start tracking</span>' : esc(dueWhen(st, v))}</td>
            <td class="actions"><button class="btn ghost small" data-action="editsched" data-id="${st.schedule.id}">EDIT</button>
              <button class="btn danger small" data-action="delsched" data-id="${st.schedule.id}">DEL</button></td></tr>`)
          .join('')}</tbody></table>`
      : `<div class="empty">No schedules yet.<div><button class="btn" data-action="presets">ADD COMMON SCHEDULES</button></div></div>`;
    return `<div class="row"><h1 class="grow"><span class="rule"></span>Schedules · ${esc(v.name)}</h1>
      <button class="btn ghost" data-action="presets">ADD COMMON SET</button>
      <button class="btn" data-action="addsched">+ NEW SCHEDULE</button></div>
      <p class="hint">A schedule is matched to log entries by name. Log "Oil &amp; filter change" and the matching schedule resets automatically.</p>${body}`;
  }

  function viewSettings() {
    return `<div class="row"><h1 class="grow"><span class="rule"></span>Data</h1></div>
      <div class="data-cards">
        <div class="card wide"><h3>Appearance</h3><p>Colors and style for this PC. Pick a theme, then change the accent color if you like.</p>
          ${TH.pickerHtml(TH.load(localStorage), (vehicle() || {}).make)}</div>
        <div class="card"><h3>Backup</h3><p>Save everything (all vehicles, logs and schedules) to a JSON file.</p>
          <button class="btn" data-action="backup">EXPORT BACKUP</button></div>
        <div class="card"><h3>Restore</h3><p>Replace all current data with a backup file. This overwrites what is here now.</p>
          <button class="btn ghost" data-action="restore">IMPORT BACKUP</button></div>
        ${syncCard()}
        <div class="card"><h3>Import records</h3><p>Shop work orders and receipts (Les Schwab, Discount Tire, Jiffy Lube, dealers) or CARFAX history, from a PDF or pasted text. You check everything before it's added.</p>
          <button class="btn ghost" data-action="import">IMPORT RECORDS</button></div>
        <div class="card"><h3>App updates</h3><p>Version ${esc(appVersion || '…')}. Garage Log checks for new versions on its own and asks before installing. Your data is kept.</p>
          <button class="btn ghost" data-action="checkupdate">CHECK FOR UPDATES</button></div>
        <div class="card"><h3>Current vehicle</h3><p>Edit details, or remove the vehicle and all of its history.</p>
          <button class="btn ghost" data-action="editvehicle">EDIT</button>
          <button class="btn danger" data-action="delvehicle">DELETE</button></div>
      </div>
      <p class="hint spaced">${sync.token
        ? 'Data lives in a file on this PC and is copied to a private gist on your GitHub account for phone sync.'
        : 'Data lives in a single file on this PC. Only lookups go online: the VIN to NHTSA, and the year, make and model to Wikipedia for the 3D car.'}</p>`;
  }

  function viewWelcome() {
    return `<div class="empty big"><div class="lead">NO VEHICLES YET</div>
      Add a car, truck, bike, anything with a service history.
      <div><button class="btn" data-action="addvehicle">+ ADD YOUR FIRST VEHICLE</button></div></div>`;
  }

  // ---------- render + events ----------
  function render() {
    const sel = $('#vehicleSelect');
    sel.innerHTML = data.vehicles.length
      ? data.vehicles.map((v) => `<option value="${v.id}" ${v.id === vehicleId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')
      : '<option>— none —</option>';
    sel.disabled = !data.vehicles.length;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));

    const v = vehicle();
    const main = $('#main');
    if (!v) { main.innerHTML = viewWelcome(); return; }
    main.innerHTML =
      view === 'log' ? viewLog(v) :
      view === 'schedules' ? viewSchedules(v) :
      view === 'fuel' ? viewFuel(v) :
      view === 'settings' ? viewSettings() : viewDashboard(v);
    mountCar(v);
    TH.paintSwatches(main);
  }

  // ---------- 3D car ----------
  let viewer; // created on first use; null if this PC has no WebGL
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
    try { res = await window.garage.decodeVin(v.vin); } catch { res = null; }
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
      if (changed) { persist(); if (vehicle() === v) render(); }
    }
    refreshLook(v);
  }

  // What the vehicle really looks like: its generation's real dimensions and a photo (lib/carlook.js).
  // Looked up again whenever year / make / model change; "nothing found" is remembered too.
  const lookTried = new Set();
  const fetchLook = async (s) => { try { return await window.garage.findLook(s); } catch { return { ok: false }; } };
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
    if (vehicle() === v) render();
  }

  // ---------- app updates ----------
  let updateState = { state: 'idle' };
  let updateDismissed = false;
  let appVersion = '';

  function renderUpdateBar() {
    const bar = $('#updateBar');
    const s = updateState;
    let html = '';
    if (s.state === 'available' && !updateDismissed) {
      html = `<span>Version ${esc(s.latest)} is available (you have ${esc(s.version)}).</span><span class="grow"></span>
        <button class="btn small" data-action="updl">DOWNLOAD</button><button class="btn ghost small" data-action="updismiss">LATER</button>`;
    } else if (s.state === 'downloading') {
      html = `<span>Downloading update… ${Number(s.percent) || 0}%</span>`;
    } else if (s.state === 'ready') {
      html = `<span>Version ${esc(s.latest)} is ready to install. Your data is kept.</span><span class="grow"></span>
        <button class="btn small" data-action="upinstall">RESTART &amp; INSTALL</button>`;
    }
    bar.innerHTML = html;
    bar.hidden = !html;
  }

  async function checkUpdates() {
    toast('CHECKING…');
    let s;
    try { s = await window.garage.updateCheck(); } catch { s = { state: 'error', message: 'Update check failed.' }; }
    updateState = s;
    if (s.state === 'available') updateDismissed = false;
    renderUpdateBar();
    if (s.state === 'none') toast('YOU ARE ON THE LATEST VERSION');
    else if (s.state === 'available') toast('UPDATE AVAILABLE');
    else if (s.state === 'error') toast(s.message || 'UPDATE CHECK FAILED');
  }

  async function backup() {
    const name = `garage-log-backup-${today()}.json`;
    const res = await window.garage.exportFile({
      defaultName: name,
      content: JSON.stringify(data, null, 2),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res) toast('BACKUP SAVED');
  }

  async function restore() {
    let incoming;
    try {
      incoming = await window.garage.importJson();
    } catch (err) {
      toast(err.message || 'IMPORT FAILED');
      return;
    }
    if (!incoming) return;
    confirmDialog('Replace all data?',
      `The backup has ${incoming.vehicles.length} vehicle(s) and ${incoming.logs.length} log entries. Importing overwrites everything currently stored.`,
      'REPLACE', () => {
        data = { ...incoming, fuel: incoming.fuel || [] };
        vehicleId = data.vehicles[0]?.id || null;
        persist(); render(); toast('BACKUP RESTORED');
      });
  }

  async function exportCsv() {
    const v = vehicle();
    if (!v) return;
    const safe = v.name.replace(/[^\w\-]+/g, '_');
    const res = await window.garage.exportFile({
      defaultName: `${safe}-service-log.csv`,
      content: L.logsToCsv(v, data.logs),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (res) toast('CSV SAVED');
  }

  const PDF_BASE = '../lib/vendor/';
  const PASTE_HINT = "Or paste: an email receipt, a CARFAX service history page (Ctrl+A, Ctrl+C), or text copied from a photo of a paper receipt.";
  const ROW = (e, v, isOrder) => `<span class="d">${esc(e.date || '')}</span><span class="o">${isOrder ? money(e.cost) : fmtInt(e.odometer) + ' ' + unit(v)}</span>
        <span class="s">${esc(e.service)}${e.duplicate ? ' <em>already logged</em>' : ''}<small>${esc(e.notes.replace(/^Imported from CARFAX( · )?/, ''))}</small></span>`;

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
        v.odometer = L.highestOdometer(v, [...data.logs, ...data.fuel]);
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

  // ---------- phone sync (private GitHub Gist, see lib/sync.js) ----------
  const NO_SYNC = { token: '', gistId: null, lastSync: 0 };
  let sync = { ...NO_SYNC };
  let syncing = false;
  let syncAgain = false;
  let syncTimer = null;
  let syncError = '';

  function syncSoon(delay = 4000) {
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
      const r = await S.syncNow({ token: sync.token, gistId: sync.gistId, local: structuredClone(data) });
      const merged = S.mergeData(data, r.data); // keep anything edited while we were waiting on GitHub
      sync = { ...sync, gistId: r.gistId, lastSync: Date.now() };
      syncError = '';
      await window.garage.setSyncConfig(sync);
      if (!S.sameData(merged, data)) {
        data = merged;
        saved = structuredClone(data);
        await window.garage.save(data);
        if (!data.vehicles.some((v) => v.id === vehicleId)) vehicleId = data.vehicles[0]?.id || null;
        if (!manual) toast('UPDATED FROM YOUR PHONE');
      }
      render();
      if (manual) toast('SYNCED');
    } catch (e) {
      syncError = e.message || 'Sync failed.';
      if (!sync.lastSync && !sync.gistId) sync = { ...NO_SYNC }; // first connect failed: don't keep a bad token
      if (manual) toast(syncError);
      render();
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; syncSoon(500); }
    }
  }

  function connectSync() {
    openForm({
      title: 'Sync with the phone app',
      fields: [{ name: 'token', label: 'GitHub token', type: 'password', required: true, placeholder: 'ghp_…' }],
      okLabel: 'CONNECT',
      onSubmit: (f) => {
        sync = { token: f.token, gistId: null, lastSync: 0 };
        runSync(true);
      }
    });
    $('#dlgFields').insertAdjacentHTML('afterbegin', `<p class="hint">Your data syncs through a private gist on your GitHub account.
      Make a token at <b>github.com/settings/tokens/new</b> with only the <b>gist</b> box ticked, paste it here, and paste the
      same token in the phone app (Data tab). Data already on either device is merged, not replaced.</p>`);
  }

  function disconnectSync() {
    confirmDialog('Stop syncing?', 'This PC stops syncing. Everything stays on this PC and in the gist; you can reconnect any time.', 'DISCONNECT', () => {
      clearTimeout(syncTimer);
      sync = { ...NO_SYNC };
      syncError = '';
      window.garage.setSyncConfig(null);
      render();
    });
  }

  function syncCard() {
    if (!sync.token) {
      return `<div class="card"><h3>Phone sync</h3><p>Keep this PC and the phone app in step. Changes on either one show up on the other.</p>
        <button class="btn" data-action="syncon">CONNECT</button></div>`;
    }
    const when = sync.lastSync ? new Date(sync.lastSync).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'not yet';
    return `<div class="card"><h3>Phone sync</h3><p>On. Changes sync automatically. Last synced: ${esc(when)}.
      ${syncError ? `<br><span class="sync-err">${esc(syncError)}</span>` : ''}</p>
      <button class="btn" data-action="syncnow">SYNC NOW</button>
      <button class="btn ghost" data-action="syncoff">DISCONNECT</button></div>`;
  }

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

  // ---------- fuel ----------
  // Fill-ups (lib/fuel.js): typed in, or read from gas receipts. They feed the Fuel tab and the
  // dashboard's fuel card, and count as odometer readings.
  const fuelFor = (v) => data.fuel.filter((f) => f.vehicleId === v.id);
  const volName = (v) => (F.volumeUnit(v) === 'L' ? 'liter' : 'gallon');
  const volAbbr = (v) => (F.volumeUnit(v) === 'L' ? 'L' : 'gal');
  const fmtVol = (n) => (n == null || n === '' ? '—' : Number(n).toFixed(3).replace(/\.?0+$/, ''));
  const fmtPrice = (n) => (n == null || n === '' ? '—' : '$' + Number(n).toFixed(3));
  const GRADE_OPTIONS = [{ value: '', label: '—' }, { value: 'regular', label: 'Regular' }, { value: 'midgrade', label: 'Midgrade' },
    { value: 'premium', label: 'Premium' }, { value: 'diesel', label: 'Diesel' }, { value: 'e85', label: 'E85' }];
  const gradeLabel = (g) => (GRADE_OPTIONS.find((o) => o.value === g) || {}).label || '';

  function fuelForm(existing, prefill) {
    const v = vehicle();
    if (!v) return;
    const start = existing || prefill || {};
    openForm({
      title: existing ? 'Edit fill-up' : prefill ? 'Check the receipt' : 'Add a fill-up',
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true, pair: true },
        { name: 'odometer', label: `Odometer (${unit(v)}, optional)`, type: 'number', min: 0 },
        { name: 'volume', label: `${volName(v)}s`.replace(/^./, (c) => c.toUpperCase()), type: 'number', min: 0, step: '0.001', pair: true },
        { name: 'price', label: `Price per ${volName(v)} ($)`, type: 'number', min: 0, step: '0.001' },
        { name: 'total', label: 'Total ($)', type: 'number', min: 0, step: '0.01', pair: true },
        { name: 'full', label: 'Tank', type: 'select', options: [{ value: 'yes', label: 'Filled up' }, { value: 'no', label: 'Partial fill' }] },
        { name: 'station', label: 'Station', placeholder: 'e.g. Costco', pair: true },
        { name: 'grade', label: 'Fuel', type: 'select', options: GRADE_OPTIONS },
        { name: 'notes', label: 'Notes', type: 'textarea' }
      ],
      initial: { date: today(), ...start, full: start.full === false ? 'no' : 'yes' },
      onSubmit: (f) => {
        const n = (x) => (x === '' ? null : Number(x));
        const vals = { odometer: n(f.odometer), volume: n(f.volume), price: n(f.price), total: n(f.total) };
        for (const [k, x] of Object.entries(vals)) if (x != null && (!Number.isFinite(x) || x < 0)) return `${k[0].toUpperCase() + k.slice(1)} must be a number.`;
        if (!L.parseDate(f.date)) return 'Pick a valid date.';
        const entry = F.complete({ vehicleId: v.id, date: f.date, ...vals, full: f.full !== 'no', station: f.station, grade: f.grade, notes: f.notes });
        if (!entry.total) return `Enter the total, or the ${volName(v)}s and the price.`;
        if (existing) Object.assign(existing, entry);
        else data.fuel.push({ id: uid(), ...entry });
        if (entry.odometer) v.odometer = L.highestOdometer(v, [...data.logs, ...data.fuel]);
        persist(); render();
        toast(existing ? 'FILL-UP UPDATED' : 'FILL-UP ADDED');
      }
    });
  }

  function deleteFuel(id) {
    const f = data.fuel.find((x) => x.id === id);
    if (!f) return;
    confirmDialog('Delete fill-up?', `Remove the ${money(f.total)} fill-up from ${f.date}?`, 'DELETE', () => {
      data.fuel = data.fuel.filter((x) => x.id !== id);
      persist(); render();
    });
  }

  function importFuel() {
    const v = vehicle();
    if (!v) return;
    openForm({
      title: `Fuel receipts · ${v.name}`,
      fields: [{ name: 'text', label: 'Or paste the receipt text', type: 'textarea' }],
      okLabel: 'READ IT',
      onSubmit: (f) => (f.text ? readFuel(v, f.text) : 'Paste a receipt, or open a PDF.')
    });
    $('#f_text').rows = 7;
    $('#dlgFields').insertAdjacentHTML('afterbegin', `<p class="hint">Gas station receipts: the paper slip, an emailed receipt
      or a PDF. The app reads the date, ${volName(v)}s, price and total, and you check them before anything is saved.
      Paste several receipts at once to add them together.</p>
      <div class="import-pdf"><button type="button" class="btn" id="pdfBtn">OPEN A PDF</button>
        <input type="file" id="pdfFile" accept="application/pdf,.pdf" hidden></div>
      <p class="hint">For a paper receipt, point your phone's camera at it and copy the text with Live Text (iPhone) or Google Lens (Android), then paste it here.</p>`);
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
        $('#f_text').value = text;
        const problem = readFuel(v, text);
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

  // One receipt opens in the fill-up form to check; several are listed, then added together.
  // Returns an error message, or nothing.
  function readFuel(v, text) {
    const fills = F.parseReceipts(text).map((r) => F.toFillUp(r, v, today()));
    if (!fills.length) return `Couldn't find a fuel purchase in that. It needs at least the total, or the ${volName(v)}s and price.`;
    const have = new Set(fuelFor(v).map((f) => f.date + '|' + Number(f.total).toFixed(2)));
    const fresh = fills.filter((f) => !have.has(f.date + '|' + Number(f.total).toFixed(2)));
    if (!fresh.length) return 'Those receipts are already in the fuel log.';
    if (fresh.length === 1) { setTimeout(() => fuelForm(null, fresh[0]), 80); return; }
    const sum = fresh.reduce((s, f) => s + (f.total || 0), 0);
    const list = fresh.map((f) => `${f.date} ${f.station || 'fuel'} ${money(f.total)}${f.volume ? ` (${fmtVol(f.volume)} ${volAbbr(v)})` : ''}`).join(' · ');
    const skipped = fills.length - fresh.length;
    setTimeout(() => confirmDialog(`Add ${fresh.length} fill-ups?`,
      `${money(sum)} in all: ${list}.${skipped ? ` ${skipped} already in the log, skipped.` : ''}`, `ADD ${fresh.length}`, () => {
        for (const f of fresh) data.fuel.push({ id: uid(), ...f });
        v.odometer = L.highestOdometer(v, [...data.logs, ...data.fuel]);
        persist(); render();
        toast(`${fresh.length} FILL-UPS ADDED`);
      }), 80);
  }

  // The dashboard's fuel highlight: the money first, then economy and the last fill-up.
  function fuelCardHtml(v) {
    const fills = fuelFor(v);
    if (!fills.length) {
      return `<div class="fuel-card empty-fuel"><div class="fuel-head"><span class="fuel-k">Fuel</span>
          <span class="fuel-note">Track what you spend on gas: add fill-ups or import receipts, and see your yearly fuel cost here.</span></div>
        <div class="fuel-btns"><button class="btn small" data-action="importfuel">IMPORT RECEIPTS</button>
          <button class="btn ghost small" data-action="addfuel">+ FILL-UP</button></div></div>`;
    }
    const st = F.fuelStats(fills, v);
    const year = new Date().getFullYear();
    const last = st.last;
    const stat = (k, val, sub) => `<div class="fuel-stat"><div class="k">${k}</div><div class="v">${val}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    return `<div class="fuel-card"><div class="fuel-head"><span class="fuel-k">Fuel</span>
        <a href="#" class="link" data-action="gofuel">${st.count} fill-up${st.count === 1 ? '' : 's'} · open fuel log</a></div>
      <div class="fuel-stats">
        ${stat(`${year} so far`, money(st.thisYear), '')}
        ${stat('Per year', st.perYear != null ? money(st.perYear) : '—', st.perMonth != null ? `≈ ${money(st.perMonth)} a month` : 'needs a few weeks of fill-ups')}
        ${stat('All time', money(st.total), '')}
        ${stat(st.economyUnit, st.economy != null ? String(st.economy) : '—', st.economy != null ? 'full-tank average' : 'needs 2 full fills with odometer')}
        ${stat(`Avg per ${volAbbr(v)}`, fmtPrice(st.avgPrice), '')}
      </div>
      <div class="fuel-foot"><span>Last: ${esc(last.date)}${last.station ? ' · ' + esc(last.station) : ''} · ${money(last.total)}</span>
        <span class="fuel-btns"><button class="btn small" data-action="addfuel">+ FILL-UP</button>
          <button class="btn ghost small" data-action="importfuel">IMPORT</button></span></div></div>`;
  }

  const actions = {
    import: importRecords,
    addfuel: () => fuelForm(null),
    editfuel: (id) => fuelForm(data.fuel.find((f) => f.id === id)),
    delfuel: deleteFuel,
    importfuel: importFuel,
    gofuel: () => { view = 'fuel'; render(); },
    theme: (id) => setTheme({ id }),
    accentreset: () => setTheme({ ...TH.load(localStorage), accent: '' }),
    syncon: connectSync,
    syncnow: () => runSync(true),
    syncoff: disconnectSync,
    addvehicle: addVehicle,
    editvehicle: editVehicle,
    delvehicle: deleteVehicle,
    odo: updateOdometer,
    addlog: () => logForm(null),
    editlog: (id) => logForm(data.logs.find((l) => l.id === id)),
    dellog: deleteLog,
    addsched: () => scheduleForm(null),
    editsched: (id) => scheduleForm(data.schedules.find((s) => s.id === id)),
    delsched: deleteSchedule,
    presets: () => {
      const v = vehicle();
      if (!v) return;
      const have = new Set(data.schedules.filter((s) => s.vehicleId === v.id).map((s) => s.name.toLowerCase()));
      const k = v.unit === 'km' ? 1.609 : 1;
      let added = 0;
      for (const p of L.PRESETS) {
        if (have.has(p.name.toLowerCase())) continue;
        data.schedules.push({
          id: uid(), vehicleId: v.id, name: p.name,
          intervalMiles: p.intervalMiles ? Math.round((p.intervalMiles * k) / 500) * 500 : 0,
          intervalMonths: p.intervalMonths
        });
        added++;
      }
      persist(); render();
      toast(added ? `${added} SCHEDULES ADDED` : 'ALREADY HAVE THEM ALL');
    },
    csv: exportCsv,
    backup,
    restore,
    checkupdate: checkUpdates,
    carphoto: () => { carPhoto = !carPhoto; render(); },
    updl: () => window.garage.updateDownload(),
    updismiss: () => { updateDismissed = true; renderUpdateBar(); },
    upinstall: () => window.garage.updateInstall()
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    e.preventDefault();
    const fn = actions[el.dataset.action];
    if (fn) fn(el.dataset.id);
  });

  $('#addVehicleBtn').addEventListener('click', addVehicle);
  $('#vehicleSelect').addEventListener('change', (e) => { vehicleId = e.target.value; render(); });
  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    view = b.dataset.view;
    render();
  });

  (async function init() {
    try {
      data = await window.garage.load();
      data.fuel = data.fuel || []; // data from before fuel tracking
    } catch (err) {
      toast('COULD NOT LOAD DATA: ' + err.message);
    }
    saved = structuredClone(data);
    vehicleId = data.vehicles[0]?.id || null;
    render();
    try {
      sync = { ...NO_SYNC, ...(await window.garage.getSyncConfig()) };
      runSync(false);
    } catch { /* sync settings unavailable */ }
    setInterval(() => runSync(false), 5 * 60 * 1000); // no-op until connected
    // Pick up phone changes when coming back to the window.
    window.addEventListener('focus', () => { if (sync.token && Date.now() - sync.lastSync > 30000) syncSoon(0); });
    try {
      appVersion = await window.garage.getVersion();
      updateState = await window.garage.updateState();
      window.garage.onUpdate((st) => { updateState = st; renderUpdateBar(); });
      renderUpdateBar();
      if (view === 'settings') render();
    } catch { /* updater not available (e.g. tests) */ }
  })();
})();
