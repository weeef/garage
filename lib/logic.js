// Pure maintenance logic. No Electron or DOM here, so it can be tested with plain Node
// and loaded in the renderer as a classic script (attaches to window.GarageLogic).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 86400000;

  const PRESETS = [
    { name: 'Oil & filter change', intervalMiles: 5000, intervalMonths: 6 },
    { name: 'Tire rotation', intervalMiles: 7500, intervalMonths: 6 },
    { name: 'Engine air filter', intervalMiles: 15000, intervalMonths: 12 },
    { name: 'Cabin air filter', intervalMiles: 15000, intervalMonths: 12 },
    { name: 'Brake fluid flush', intervalMiles: 30000, intervalMonths: 24 },
    { name: 'Coolant flush', intervalMiles: 30000, intervalMonths: 36 },
    { name: 'Transmission fluid', intervalMiles: 30000, intervalMonths: 36 },
    { name: 'Spark plugs', intervalMiles: 60000, intervalMonths: 60 },
    { name: 'Brake pads & rotors inspection', intervalMiles: 20000, intervalMonths: 12 },
    { name: 'Battery test', intervalMiles: 0, intervalMonths: 12 }
  ];

  const norm = (s) => String(s || '').trim().toLowerCase();

  // Parse 'YYYY-MM-DD' as a local date (avoids the UTC off-by-one-day trap).
  function parseDate(s) {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  function formatDate(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // Add months, clamping to month end (Jan 31 + 1 month = Feb 28/29).
  function addMonths(date, months) {
    const y = date.getFullYear();
    const m = date.getMonth() + months;
    const day = date.getDate();
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, last));
  }

  function daysBetween(a, b) {
    return Math.round((b.getTime() - a.getTime()) / DAY);
  }

  function lastLogFor(schedule, logs, vehicleId) {
    const key = norm(schedule.name);
    const matches = logs.filter((l) => l.vehicleId === vehicleId && norm(l.service) === key);
    if (!matches.length) return null;
    matches.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.odometer || 0) - (a.odometer || 0)));
    return matches[0];
  }

  // status: 'unknown' | 'overdue' | 'soon' | 'ok'
  function computeStatus(schedule, logs, vehicle, now) {
    const today = parseDate(now || new Date());
    const last = lastLogFor(schedule, logs, vehicle.id);
    const result = {
      schedule, last, status: 'unknown',
      nextMiles: null, nextDate: null, milesLeft: null, daysLeft: null, urgency: Infinity
    };
    if (!last) return result;

    const iMiles = Number(schedule.intervalMiles) || 0;
    const iMonths = Number(schedule.intervalMonths) || 0;
    let status = 'ok';
    let urgency = Infinity;

    if (iMiles > 0 && Number.isFinite(last.odometer)) {
      result.nextMiles = last.odometer + iMiles;
      result.milesLeft = result.nextMiles - (Number(vehicle.odometer) || 0);
      const soonBand = Math.max(500, iMiles * 0.1);
      if (result.milesLeft < 0) status = 'overdue';
      else if (result.milesLeft <= soonBand && status !== 'overdue') status = 'soon';
      urgency = Math.min(urgency, result.milesLeft / iMiles);
    }

    const lastDate = parseDate(last.date);
    if (iMonths > 0 && lastDate) {
      result.nextDate = addMonths(lastDate, iMonths);
      result.daysLeft = daysBetween(today, result.nextDate);
      if (result.daysLeft < 0) status = 'overdue';
      else if (result.daysLeft <= 30 && status !== 'overdue') status = 'soon';
      urgency = Math.min(urgency, result.daysLeft / (iMonths * 30.4));
    }

    result.status = status;
    result.urgency = urgency;
    return result;
  }

  const ORDER = { overdue: 0, soon: 1, ok: 2, unknown: 3 };

  function allStatuses(vehicle, schedules, logs, now) {
    return schedules
      .filter((s) => s.vehicleId === vehicle.id)
      .map((s) => computeStatus(s, logs, vehicle, now))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.urgency - b.urgency);
  }

  function vehicleStats(vehicle, logs, now) {
    const today = parseDate(now || new Date());
    const mine = logs.filter((l) => l.vehicleId === vehicle.id);
    const total = mine.reduce((s, l) => s + (Number(l.cost) || 0), 0);
    const cutoff = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const last12 = mine
      .filter((l) => { const d = parseDate(l.date); return d && d >= cutoff && d <= today; })
      .reduce((s, l) => s + (Number(l.cost) || 0), 0);
    const odos = mine.map((l) => l.odometer).filter(Number.isFinite);
    const span = odos.length > 1 ? Math.max(...odos) - Math.min(...odos) : 0;
    return {
      count: mine.length,
      total,
      last12,
      costPerMile: span > 0 ? total / span : null,
      diyCount: mine.filter((l) => norm(l.by) === 'diy').length
    };
  }

  function highestOdometer(vehicle, logs) {
    const odos = logs.filter((l) => l.vehicleId === vehicle.id).map((l) => l.odometer).filter(Number.isFinite);
    return Math.max(Number(vehicle.odometer) || 0, ...odos);
  }

  function csvEscape(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function logsToCsv(vehicle, logs) {
    const rows = logs
      .filter((l) => l.vehicleId === vehicle.id)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const head = ['Date', 'Odometer', 'Service', 'Cost', 'By', 'Notes'];
    const lines = [head.join(',')];
    for (const l of rows) {
      lines.push([l.date, l.odometer ?? '', l.service, l.cost ?? '', l.by || '', l.notes || ''].map(csvEscape).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }

  // ---------- VIN helpers ----------
  const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

  function normalizeVin(s) {
    return String(s || '').toUpperCase().replace(/[\s-]/g, '');
  }

  // null when the VIN has a valid shape, otherwise a short message for the user.
  function vinProblem(vin) {
    const v = normalizeVin(vin);
    if (/[IOQ]/.test(v)) return 'VINs never contain the letters I, O or Q.';
    if (!/^[A-Z0-9]*$/.test(v)) return 'VINs only contain letters and digits.';
    if (v.length !== 17) return `${v.length}/17 characters`;
    return VIN_RE.test(v) ? null : 'That does not look like a valid VIN.';
  }

  // ISO 3779 check digit (position 9). Required in North America; other markets may not
  // follow it, so callers should treat a mismatch as a warning, not an error.
  function vinCheckDigitOk(vin) {
    const v = normalizeVin(vin);
    if (!VIN_RE.test(v)) return false;
    const map = {
      A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
      P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
    };
    const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      const ch = v[i];
      const val = /\d/.test(ch) ? Number(ch) : map[ch];
      sum += val * weights[i];
    }
    const rem = sum % 11;
    return v[8] === (rem === 10 ? 'X' : String(rem));
  }

  // NHTSA returns makes in capitals ("FORD"). Keep short acronyms (BMW, GMC) as they are.
  function titleCaseMake(make) {
    const m = String(make || '').trim();
    if (!m) return '';
    if (m !== m.toUpperCase()) return m; // already mixed case
    if (m.length <= 3) return m;
    return m.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_x, a, b) => a + b.toUpperCase());
  }

  // Maps one row of NHTSA's DecodeVinValues response to our vehicle fields.
  function vehicleFromNhtsa(row) {
    row = row || {};
    const clean = (x) => String(x == null ? '' : x).trim();
    const make = titleCaseMake(row.Make);
    const baseModel = clean(row.Model);
    const trim = clean(row.Trim) || clean(row.Series);
    const model = trim && !baseModel.toLowerCase().includes(trim.toLowerCase())
      ? `${baseModel} ${trim}`.trim() : baseModel;
    const year = Number(clean(row.ModelYear)) || null;

    const parts = [];
    if (clean(row.DisplacementL)) parts.push(`${Number(row.DisplacementL).toFixed(1)}L`);
    if (clean(row.EngineCylinders)) parts.push(`${clean(row.EngineCylinders)}-cyl`);
    if (clean(row.FuelTypePrimary)) parts.push(clean(row.FuelTypePrimary));

    return {
      ok: Boolean(make || baseModel),
      year, make, model, trim,
      engine: parts.join(' '),
      bodyClass: clean(row.BodyClass),
      doors: Number(clean(row.Doors)) || null
    };
  }

  function describeDecoded(d) {
    const name = [d.year, d.make, d.model].filter(Boolean).join(' ');
    return d.engine ? `${name} · ${d.engine}` : name;
  }

  return {
    PRESETS, parseDate, formatDate, addMonths, daysBetween,
    lastLogFor, computeStatus, allStatuses, vehicleStats, highestOdometer, logsToCsv,
    normalizeVin, vinProblem, vinCheckDigitOk, vehicleFromNhtsa, describeDecoded
  };
});
