// Reads service records out of text copied from a CARFAX report or CARFAX Car Care service history
// (select all + copy in the browser, then paste). CARFAX has no public API and its layout varies, so
// this is deliberately forgiving: every record starts at a date, and within a record we pick out the
// mileage, the shop and the lines that describe work. The app shows a preview before anything is saved.
// Attaches to window.GarageCarfax in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageCarfax = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const pad = (n) => String(n).padStart(2, '0');

  // 05/14/2021, 5/14/21, 2021-05-14, May 14, 2021
  const DATE_RE = /\b(?:(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})|(\d{4})-(\d{2})-(\d{2})|(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}))\b/i;

  function readDate(m) {
    let y, mo, d;
    if (m[1]) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += y > 50 ? 1900 : 2000; }
    else if (m[4]) { y = +m[4]; mo = +m[5]; d = +m[6]; }
    else { mo = MONTHS[m[7].toLowerCase().slice(0, 4)] || MONTHS[m[7].toLowerCase().slice(0, 3)]; d = +m[8]; y = +m[9]; }
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1950 && y <= 2100)) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  // Map common CARFAX wording onto the app's schedule names, so imports reset the right reminders.
  const SERVICE_MAP = [
    [/\boil\b.*\b(change|changed|filter|service)|\blube\b|oil and filter/i, 'Oil & filter change'],
    [/\brotat/i, 'Tire rotation'],
    [/cabin\s+(air\s+)?filter/i, 'Cabin air filter'],
    [/\b(engine\s+)?air\s+filter/i, 'Engine air filter'],
    [/brake\s+fluid/i, 'Brake fluid flush'],
    [/coolant|antifreeze|radiator\s+(flush|fluid)/i, 'Coolant flush'],
    [/transmission\s+(fluid|service|flush|serviced)|\batf\b/i, 'Transmission fluid'],
    [/spark\s+plug/i, 'Spark plugs'],
    [/brake.*(pad|rotor|inspect|check)|(pad|rotor).*brake/i, 'Brake pads & rotors inspection'],
    [/\bbattery\b/i, 'Battery test']
  ];

  const WORK_RE = /\b(oil|lube|filter|fluid|flush|tire|tyre|wheel|align|balanc|rotat|brake|pad|rotor|battery|wiper|belt|hose|spark|coolant|antifreeze|transmission|differential|inspect|check|replac|install|servic|maintenance|repair|diagnos|recall|tune|bulb|lamp|light|exhaust|muffler|suspension|strut|shock|steering|a\/c|air condition|emission|safety|alternator|starter|radiator|thermostat|pump|sensor|gasket|axle|cv |clutch|engine|key|glass|windshield|detail|wash)/i;
  const EVENT_RE = /\b(title|registration|registered|renewed|sold|for sale|listed|auction|ownership|owner|lease|accident|damage|airbag|odometer reading|reported|lien|loan|fleet|purchased|manufacturer|warranty|recall issued|first reported|repossess)/i;
  const ACTION_RE = /\b(chang|replac|rotat|perform|inspect|check|servic|install|flush|balanc|align|repair|test|topped|top off|complet|clean|adjust|recommend|reset|updat|mount|lubricat|drain|refill|fill|diagnos|tun)/i;
  const PHONE_RE = /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
  const ADDRESS_RE = /^[A-Za-z .'-]+,\s*[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/;
  const URL_RE = /(https?:\/\/|www\.|\.(com|net|org|biz|us)\b|@)/i;
  const HEADER_RE = /^(date|mileage|source|comments|service history|vehicle history|details?|print|share|carfax|odometer|location|services? performed|show more|show less|see details|view (more|details)|\d+ records?)$/i;
  const MILES_RE = /\b(\d{1,3}(?:,\d{3})+|\d{1,7})\s*(mi|miles|km|kilometers)\b\.?/i;
  const BARE_NUM_RE = /^(\d{1,3}(?:,\d{3})+|\d{1,7})$/;

  function cleanItem(s) {
    s = s.replace(/^[\s\-–—•*·>]+/, '').replace(/\s+/g, ' ').trim().replace(/[.;,]$/, '');
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  }

  function mapService(line) {
    for (const [re, name] of SERVICE_MAP) if (re.test(line)) return name;
    return cleanItem(line);
  }

  // Returns [{ date, odometer, unit, shop, items: [original lines], isService }]
  function parseCarfax(text) {
    const lines = String(text || '')
      .replace(/\r/g, '')
      .split(/\n|\t/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const records = [];
    let cur = null;
    for (let raw of lines) {
      const dm = DATE_RE.exec(raw);
      if (dm) {
        const date = readDate(dm);
        if (date) {
          cur = { date, odometer: null, unit: 'mi', shop: '', items: [], other: [] };
          records.push(cur);
          raw = (raw.slice(0, dm.index) + ' ' + raw.slice(dm.index + dm[0].length)).trim();
          if (!raw) continue;
        }
      }
      if (!cur) continue;

      if (cur.odometer == null) {
        const mm = MILES_RE.exec(raw) || (BARE_NUM_RE.test(raw) && !cur.items.length && !cur.shop ? [raw, raw, 'mi'] : null);
        if (mm) {
          cur.odometer = Number(mm[1].replace(/,/g, ''));
          cur.unit = /^k/i.test(mm[2]) ? 'km' : 'mi';
          raw = raw.replace(mm[0], '').trim();
          if (!raw) continue;
        }
      }

      if (HEADER_RE.test(raw) || PHONE_RE.test(raw) && raw.replace(PHONE_RE, '').trim().length < 4 || URL_RE.test(raw) || ADDRESS_RE.test(raw)) continue;
      const bullet = /^[-–—•*·>]/.test(raw);
      if (!bullet && !cur.shop && !cur.items.length && !ACTION_RE.test(raw) && !EVENT_RE.test(raw) && raw.length <= 60) {
        cur.shop = raw.replace(PHONE_RE, '').trim(); // first plain line is the source, e.g. "Jiffy Lube"
      } else if (bullet || (WORK_RE.test(raw) && !EVENT_RE.test(raw))) {
        // "Vehicle serviced" is CARFAX's umbrella heading; keep it only if nothing more specific follows.
        cur.items.push(raw.replace(PHONE_RE, '').trim());
      } else if (!cur.shop && !EVENT_RE.test(raw) && raw.length <= 60) {
        cur.shop = raw.replace(PHONE_RE, '').trim();
      } else {
        cur.other.push(raw);
      }
    }

    return records.map((r) => {
      let items = r.items.map(cleanItem).filter(Boolean);
      const specific = items.filter((i) => !/^vehicle serviced$|^maintenance (inspection )?(completed|performed)$/i.test(i));
      if (specific.length) items = specific;
      return {
        date: r.date, odometer: r.odometer, unit: r.unit, shop: r.shop,
        items, isService: items.length > 0,
        events: r.other
      };
    });
  }

  // Turns parsed records into log entries for one vehicle, one entry per distinct service,
  // flagging ones that are already in the log so the preview can leave them unticked.
  function toEntries(records, vehicle, logs) {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const have = new Set((logs || []).filter((l) => l.vehicleId === vehicle.id).map((l) => l.date + '|' + norm(l.service)));
    const out = [];
    for (const r of records) {
      if (!r.isService) continue;
      let odo = r.odometer;
      if (odo != null && r.unit !== (vehicle.unit === 'km' ? 'km' : 'mi')) odo = Math.round(r.unit === 'km' ? odo / 1.609 : odo * 1.609);
      const seen = new Set();
      for (const item of r.items) {
        const service = mapService(item);
        if (seen.has(norm(service))) continue;
        seen.add(norm(service));
        const notes = ['Imported from CARFAX', r.shop, service !== item ? item : ''].filter(Boolean).join(' · ');
        out.push({
          vehicleId: vehicle.id, service, date: r.date, odometer: odo, cost: 0, by: 'Shop', notes,
          duplicate: have.has(r.date + '|' + norm(service))
        });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  return { parseCarfax, toEntries, mapService };
});
