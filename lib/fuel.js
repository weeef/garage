// Fuel: reads gas-station receipts (pasted text, an email, a PDF, or a phone-camera copy of a paper
// receipt) into fill-ups, and works out what fuel costs: all time, per year, last 12 months, a yearly
// estimate, average price, cost per mile and fuel economy (full-tank method).
// No DOM here; shared with the phone app. Attaches to window.GarageFuel in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageFuel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const L_PER_GAL = 3.785411784;
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const pad = (n) => String(n).padStart(2, '0');
  const num = (s) => Number(String(s).replace(/[,$\s]/g, ''));
  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

  // Station names seen at the top of receipts (longest first so "Sam's Club" beats "Sam").
  const STATIONS = ['Costco', "Sam's Club", 'Shell', 'Chevron', 'ExxonMobil', 'Exxon', 'Mobil', 'BP', 'Arco', 'ARCO', 'Circle K', '7-Eleven',
    'Speedway', 'Marathon', 'Sunoco', 'Valero', 'Texaco', 'QuikTrip', 'Wawa', 'Sheetz', "Casey's", 'Kroger', 'Fred Meyer', 'Safeway',
    'Pilot', "Love's", 'Flying J', 'Murphy USA', 'Phillips 66', 'Conoco', 'Citgo', 'Gulf', 'Kwik Trip', "Buc-ee's", 'Holiday',
    'Maverik', 'RaceTrac', 'Cenex', 'Sinclair', 'Esso', 'Petro-Canada', 'Pioneer', 'Ultramar', 'Irving', 'Thorntons', 'GetGo',
    "Smith's", 'Walmart', 'Meijer', 'H-E-B', 'Hy-Vee', 'Giant Eagle', 'Stewart\'s', 'Cumberland Farms', 'Kum & Go', 'Rutter\'s', 'Royal Farms', 'Sheetz', '76']
    .sort((a, b) => b.length - a.length);
  const GRADES = [['diesel', /\bdiesel\b|\bdsl\b/i], ['premium', /\bprem(ium)?\b|\bsuper\b|\bsupreme\b|\b9[13]\b oct/i],
    ['midgrade', /\bmid(-?grade)?\b|\bplus\b|\b89\b/i], ['e85', /\be-?85\b|flex ?fuel/i], ['regular', /\breg(ular)?\b|\bunl(eaded)?\b|\bunld\b|\b87\b/i]];

  // ---------- dates ----------
  function findDate(text) {
    let m = text.match(/\b(20\d\d|19\d\d)-(\d\d?)-(\d\d?)\b/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = text.match(/\b(\d\d?)[/.-](\d\d?)[/.-](\d{4}|\d\d)\b/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      let [mo, d] = [+m[1], +m[2]];
      if (mo > 12 && d <= 12) [mo, d] = [d, mo]; // 25/03/2025
      return iso(y, mo, d);
    }
    const month = (w) => MONTHS[w.slice(0, 3).toLowerCase()];
    m = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d\d?),?\s+(\d{4})\b/); // Mar 3, 2025
    if (m && month(m[1])) return iso(+m[3], month(m[1]), +m[2]);
    m = text.match(/\b(\d\d?)\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/); // 3 March 2025
    if (m && month(m[2])) return iso(+m[3], month(m[2]), +m[1]);
    return '';
  }
  function iso(y, mo, d) {
    if (!(y > 1990 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return '';
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  // ---------- one receipt ----------
  const N = '(\\d{1,3}(?:[.,]\\d{1,4}))';
  const VOL_UNIT = '(gallons?|gals?|g|liters?|litres?|ltrs?|l)';

  function findVolume(t) {
    const pats = [
      new RegExp(`\\b(?:gallons?|gals?|volume|qty|quantity|liters?|litres?|ltrs?|vol)\\b\\s*[:#]?\\s*${N}\\s*${VOL_UNIT}?\\b`, 'i'),
      new RegExp(`(?<![$\\d.,])${N}\\s*${VOL_UNIT}\\b`, 'i') // "12.345 GAL", never "$3.199/G"
    ];
    for (const re of pats) {
      const m = t.match(re);
      if (!m) continue;
      const v = Number(m[1].replace(',', '.'));
      if (!(v > 0.5 && v < 400)) continue;
      const label = (m[0].match(/liters?|litres?|ltrs?|\bl\b/i) ? 'L' : 'gal');
      return { volume: v, unit: label };
    }
    return null;
  }

  function findPrice(t) {
    const pats = [
      /\b(?:price|ppg|ppl|unit price|price\/gal(?:lon)?|price\/g|price\/l|\$\/gal|\$\/g|\$\/l|per gal(?:lon)?|per l(?:iter|itre)?)\b\s*[:#]?\s*\$?\s*(\d{1,2}[.,]\d{2,3}9?)/i,
      /@\s*\$?\s*(\d{1,2}[.,]\d{2,3}9?)/,
      /\$?\s*(\d{1,2}[.,]\d{3})\s*\/\s*(?:gal(?:lon)?|g|l|ltr|liter|litre)\b/i
    ];
    for (const re of pats) {
      const m = t.match(re);
      if (m) { const p = Number(m[1].replace(',', '.')); if (p > 0.2 && p < 15) return p; }
    }
    return null;
  }

  function findAmount(t, labels) {
    const re = new RegExp(`\\b(?:${labels})\\b[^\\d$\\n]{0,20}\\$?\\s*(\\d{1,4}(?:,\\d{3})*[.]\\d{2})\\b`, 'ig');
    let m;
    let last = null;
    while ((m = re.exec(t))) last = num(m[1]);
    return last;
  }

  function findStation(t) {
    const lower = t.toLowerCase();
    for (const s of STATIONS) {
      const re = new RegExp(`(^|[^a-z])${s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
      if (re.test(lower)) return s === '76' ? '76' : s;
    }
    const first = t.split('\n').map((l) => l.trim()).find((l) => /[a-z]{3}/i.test(l) && !/receipt|welcome|thank|date|time|store|#\s*\d/i.test(l));
    return first ? first.replace(/\s{2,}.*/, '').slice(0, 40) : '';
  }

  function parseOne(text) {
    const t = String(text || '');
    const vol = findVolume(t);
    let price = findPrice(t);
    const fuelSale = findAmount(t, 'fuel sale|fuel total|fuel amount|fuel|pump sale|gas sale|sale amount');
    const total = findAmount(t, 'total sale|total|amount due|amount|grand total|purchase|charged|debit|credit|visa|mastercard|paid');
    let amount = fuelSale || null;
    if (vol && price) {
      const computed = round(vol.volume * price, 2);
      // a total including snacks: trust gallons x price; a total within a few cents: use the receipt's
      if (!amount) amount = total && Math.abs(total - computed) <= 0.1 ? total : computed;
    }
    if (!amount) amount = total;
    if (vol && !price && amount) price = round(amount / vol.volume, 3);
    if (!vol && !amount) return null;
    const grade = (GRADES.find(([, re]) => re.test(t)) || [''])[0];
    const odo = t.match(/\b(?:odometer|odo|mileage|miles)\b\s*[:#]?\s*(\d{1,3}(?:,\d{3})+|\d{3,7})\b/i);
    return {
      date: findDate(t),
      station: findStation(t),
      grade,
      volume: vol ? vol.volume : null,
      volumeUnit: vol ? vol.unit : null,
      price,
      total: amount != null ? round(amount, 2) : null,
      odometer: odo ? num(odo[1]) : null
    };
  }

  // Text with one or more receipts -> fill-ups. A new receipt starts at a block (paragraph) that has
  // a date or volume once the current one already has its volume.
  function parseReceipts(text) {
    const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/);
    const chunks = [];
    let cur = '';
    for (const b of blocks) {
      const curHas = findVolume(cur) && (findAmount(cur, 'total|fuel|sale|amount') || findPrice(cur));
      if (cur && curHas && (findVolume(b) || findDate(b))) { chunks.push(cur); cur = ''; }
      cur += (cur ? '\n\n' : '') + b;
    }
    if (cur.trim()) chunks.push(cur);
    return chunks.map(parseOne).filter(Boolean);
  }

  // A parsed receipt -> a fill-up for `vehicle` (volume converted to the vehicle's gallons or liters).
  function toFillUp(r, vehicle, today) {
    const want = volumeUnit(vehicle);
    let volume = r.volume;
    let price = r.price;
    if (volume && r.volumeUnit && r.volumeUnit !== want) {
      const k = want === 'L' ? L_PER_GAL : 1 / L_PER_GAL;
      volume = round(volume * k, 3);
      if (price) price = round(price / k, 3);
    }
    return {
      vehicleId: vehicle.id,
      date: r.date || today,
      odometer: r.odometer || null,
      volume: volume || null,
      price: price || null,
      total: r.total || (volume && price ? round(volume * price, 2) : null),
      station: r.station || '',
      grade: r.grade || '',
      full: true,
      notes: ''
    };
  }

  // Fills in whichever of volume / price / total is missing from the other two.
  function complete(f) {
    const out = { ...f };
    const v = Number(out.volume) || 0;
    const p = Number(out.price) || 0;
    const t = Number(out.total) || 0;
    if (!t && v && p) out.total = round(v * p, 2);
    if (!p && v && t) out.price = round(t / v, 3);
    if (!v && p && t) out.volume = round(t / p, 3);
    return out;
  }

  const volumeUnit = (vehicle) => (vehicle && vehicle.unit === 'km' ? 'L' : 'gal');

  // ---------- stats ----------
  const DAY = 86400000;
  const toDate = (s) => new Date(String(s) + 'T12:00:00');

  function fuelStats(fills, vehicle, now = new Date()) {
    const list = [...(fills || [])].filter((f) => f && f.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.odometer || 0) - (b.odometer || 0)));
    const metric = vehicle && vehicle.unit === 'km';
    const sum = (arr, k) => arr.reduce((s, f) => s + (Number(f[k]) || 0), 0);
    const yearAgo = new Date(now.getTime() - 365 * DAY);
    const thisYear = now.getFullYear();
    const last12List = list.filter((f) => toDate(f.date) >= yearAgo);
    const total = round(sum(list, 'total'), 2);

    const byYear = [];
    for (const f of list) {
      const y = Number(f.date.slice(0, 4));
      let row = byYear.find((r) => r.year === y);
      if (!row) { row = { year: y, total: 0, volume: 0, fills: 0 }; byYear.push(row); }
      row.total = round(row.total + (Number(f.total) || 0), 2);
      row.volume = round(row.volume + (Number(f.volume) || 0), 3);
      row.fills++;
    }
    byYear.sort((a, b) => b.year - a.year);

    const priced = list.filter((f) => f.volume > 0 && f.total > 0);
    const avgPrice = priced.length ? round(sum(priced, 'total') / sum(priced, 'volume'), 3) : null;

    // Fuel economy, full-tank method: from one full fill to the next, distance over everything pumped.
    const withOdo = list.filter((f) => Number.isFinite(Number(f.odometer)) && f.odometer > 0 && f.volume > 0)
      .sort((a, b) => a.odometer - b.odometer);
    let dist = 0;
    let vol = 0;
    let lastFull = null;
    let pending = 0;
    for (const f of withOdo) {
      if (lastFull) pending += Number(f.volume);
      if (f.full !== false) {
        if (lastFull && f.odometer > lastFull.odometer) { dist += f.odometer - lastFull.odometer; vol += pending; }
        lastFull = f;
        pending = 0;
      }
    }
    let economy = null;
    if (dist > 0 && vol > 0) economy = metric ? round((vol / dist) * 100, 1) : round(dist / vol, 1);

    // Fuel cost per mile/km over the odometer range (the first fill-up fuels driving before the range).
    let costPerDistance = null;
    if (withOdo.length >= 2) {
      const span = withOdo[withOdo.length - 1].odometer - withOdo[0].odometer;
      if (span > 0) costPerDistance = round(sum(withOdo.slice(1), 'total') / span, 3);
    }

    // What a year of fuel costs: the last 12 months when there is a year of records still being kept up,
    // else the spending rate across the records (up to today if they're current, or to about one more
    // fill-up past the last one if logging stopped, so old receipts don't read as $0 a year).
    let perYear = null;
    if (list.length) {
      const first = toDate(list[0].date);
      const last = toDate(list[list.length - 1].date);
      const current = (now - last) / DAY <= 60;
      if (current && (now - first) / DAY >= 365) perYear = round(sum(last12List, 'total'), 2);
      else if (list.length >= 2) {
        const gap = (last - first) / (list.length - 1);
        const days = ((current ? now : new Date(last.getTime() + gap)) - first) / DAY;
        if (days >= 28) perYear = round((total / days) * 365, 0);
      }
    }

    return {
      count: list.length,
      total,
      volume: round(sum(list, 'volume'), 3),
      last12: round(sum(last12List, 'total'), 2),
      thisYear: round(sum(list.filter((f) => Number(f.date.slice(0, 4)) === thisYear), 'total'), 2),
      byYear,
      avgPrice,
      economy,
      economyUnit: metric ? 'L/100 km' : 'mpg',
      volumeUnit: volumeUnit(vehicle),
      costPerDistance,
      perYear,
      perMonth: perYear != null ? round(perYear / 12, 0) : null,
      last: list.length ? list[list.length - 1] : null
    };
  }

  return { L_PER_GAL, parseReceipts, parseOne, toFillUp, complete, fuelStats, volumeUnit, findDate };
});
