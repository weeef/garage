// Reads a shop work order / invoice / receipt (Les Schwab, Discount Tire, Jiffy Lube, a dealer...)
// from its text: pasted from an email, copied from a photo with the phone's text recognition, or
// pulled out of a PDF. Shops lay these out very differently, so this looks for labelled fields
// (date, mileage, total) and priced lines rather than any one format; the app shows a preview.
// Attaches to window.GarageWorkOrder in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageWorkOrder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SHOPS = [
    'Les Schwab', 'Discount Tire', "America's Tire", 'Firestone', 'Goodyear', 'Big O Tires', 'Jiffy Lube', 'Valvoline',
    'Take 5', 'Midas', 'Meineke', 'Pep Boys', 'NTB', 'Tire Kingdom', 'Mavis', 'Costco', 'Walmart Auto Care', 'Sam\'s Club',
    'Grease Monkey', 'Christian Brothers', 'Monro', 'Belle Tire', 'Kal Tire', 'Canadian Tire', 'Tires Plus', 'Point S',
    'Brakes Plus', 'Meineke', 'Precision Tune', 'Quick Lane', 'Caliber', 'Safelite', 'Kwik Kar', 'Express Oil'
  ];
  const MAKES = 'Acura|Audi|BMW|Buick|Cadillac|Chevrolet|Chevy|Chrysler|Dodge|Fiat|Ford|Genesis|GMC|Honda|Hyundai|Infiniti|Jaguar|Jeep|Kia|Land Rover|Lexus|Lincoln|Mazda|Mercedes|Mini|Mitsubishi|Nissan|Porsche|Ram|Subaru|Tesla|Toyota|Volkswagen|VW|Volvo';

  // Order matters: first match wins. Names match the app's schedule presets where one exists.
  const SERVICES = [
    [/\b(lof|lube,? oil|oil (and|&) filter|oil change|synthetic oil|full synthetic|conventional oil|motor oil)\b/i, 'Oil & filter change'],
    [/\brotat/i, 'Tire rotation'],
    [/\b(align)/i, 'Wheel alignment'],
    [/\b\d{3}\/\d{2}\s?Z?R\s?\d{2}\b|\bLT\d{3}|\bP\d{3}\/|\b(new|replace(ment)?|install(ed)?) tires?\b|\btires? \(?x?\d\)?$/i, 'New tires'],
    [/\b(flat|puncture|patch|plug) (repair|fix)|\brepair (flat|tire)\b|\bflat\b/i, 'Flat repair'],
    [/\b(balanc)/i, 'Tire balance'],
    [/\btpms|tire pressure (sensor|monitor)/i, 'TPMS service'],
    [/cabin\s+(air\s+)?filter/i, 'Cabin air filter'],
    [/\b(engine\s+)?air\s+filter/i, 'Engine air filter'],
    [/brake\s+fluid/i, 'Brake fluid flush'],
    [/\b(brake|pads?|rotors?|calipers?|shoes)\b/i, 'Brake service'],
    [/coolant|antifreeze|radiator\s+(flush|service)/i, 'Coolant flush'],
    [/transmission|\batf\b/i, 'Transmission fluid'],
    [/spark\s+plug/i, 'Spark plugs'],
    [/\bbatter(y|ies)\b/i, 'Battery'],
    [/\bwiper/i, 'Wiper blades'],
    [/\b(shocks?|struts?)\b/i, 'Shocks / struts'],
    [/\b(inspect|check|courtesy|multi-?point)/i, 'Inspection']
  ];
  // Lines that are charges but not work in their own right; their cost is folded into the work.
  const FEE_RE = /\b(fee|disposal|recycl|environmental|shop suppl|haz(ard)?(ous)? mat|valve stem|stems?\b|install(ation)?$|mount(ing)?$|warranty|road hazard|certificate|protection|labor$|tax|discount|coupon|rebate|savings|deposit|core charge|epa)\b/i;
  const SKIP_RE = /\b(sub-?total|total|amount due|balance due|paid|payment|visa|mastercard|amex|discover|cash|change due|card|auth|approval|tender|thank you)\b|signature\s*[:_x]|customer signature/i;
  const MONEY = /\$?\s?(-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2})\b/;

  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const DATE_RE = /\b(?:(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})|(\d{4})-(\d{2})-(\d{2})|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}))\b/i;

  function readDate(m) {
    let y, mo, d;
    if (m[1]) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else if (m[4]) { y = +m[4]; mo = +m[5]; d = +m[6]; }
    else { mo = MONTHS[m[7].toLowerCase().slice(0, 3)]; d = +m[8]; y = +m[9]; }
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1980 && y <= 2100)) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  const money = (s) => Number(String(s).replace(/[$,\s]/g, ''));

  function findShop(text) {
    for (const s of SHOPS) {
      const re = new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]?") + '\\b', 'i');
      if (re.test(text)) return s;
    }
    const dealer = new RegExp(`\\b([A-Z][\\w'&]+(?: [A-Z][\\w'&]+){0,3} (?:${MAKES})(?: of [A-Z][\\w]+(?: [A-Z][\\w]+)?)?)\\b`).exec(text);
    if (dealer) return dealer[1];
    return '';
  }

  function mapService(line) {
    for (const [re, name] of SERVICES) if (re.test(line)) return name;
    return null;
  }

  function cleanDesc(s) {
    return s.replace(/\s{2,}/g, ' ').replace(/^[\s\-–•*#\d.]+(?=[A-Za-z])/, '').trim();
  }

  // Returns { shop, date, odometer, invoice, total, lines: [{ text, amount, service, fee }] }
  function parseWorkOrder(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\t/g, '  ').trim()).filter(Boolean);
    const all = lines.join('\n');

    // Date: prefer a labelled one, else the first date in the document.
    let date = null;
    for (const l of lines) {
      if (/\b(invoice|order|service|completed|date|ro|work order|visit)\b/i.test(l) && !/warrant|expir|due|next|promis/i.test(l)) {
        const m = DATE_RE.exec(l);
        if (m && (date = readDate(m))) break;
      }
    }
    if (!date) {
      const m = DATE_RE.exec(all);
      if (m) date = readDate(m);
    }

    // Mileage: a number next to a mileage/odometer label (same line or the next one).
    let odometer = null;
    for (let i = 0; i < lines.length && odometer == null; i++) {
      if (!/\b(mileage|odometer|odo|miles in|mi in|kms?|kilomet)/i.test(lines[i]) || /next|due|recommend/i.test(lines[i])) continue;
      const scope = lines[i].replace(/.*?(mileage|odometer|odo|miles in|mi in|kms?|kilomet)\w*/i, '') + ' ' + (lines[i + 1] || '');
      const m = /(\d{1,3}(?:,\d{3})+|\d{3,7})(?!\.\d)/.exec(scope);
      if (m) odometer = Number(m[1].replace(/,/g, ''));
    }

    const inv = /\b(?:invoice|work order|ro|order|ticket)\s*(?:#|no\.?|number)?\s*:?\s*([A-Z0-9-]{4,})\b/i.exec(all);

    // Total: the last "total" that isn't a subtotal.
    let total = null;
    for (const l of lines) {
      if (/\btotal\b|amount due|balance due/i.test(l) && !/sub-?\s?total|savings|discount|tax\b(?!.*total)/i.test(l)) {
        const m = MONEY.exec(l.replace(/.*?(total|amount due|balance due)/i, ''));
        if (m) total = money(m[1]);
      }
    }

    // Priced lines: description followed by an amount (the last amount on the line is its extended price).
    const priced = [];
    for (const l of lines) {
      if (SKIP_RE.test(l)) continue;
      const amounts = [...l.matchAll(new RegExp(MONEY.source, 'g'))];
      if (!amounts.length) continue;
      const desc = cleanDesc(l.slice(0, amounts[0].index).replace(/\b\d+\s*@\s*$|\bqty\.?\s*\d+/i, ''));
      if (desc.length < 3 || !/[a-z]{3}/i.test(desc)) continue;
      const amount = money(amounts[amounts.length - 1][1]);
      const service = mapService(desc);
      priced.push({ text: desc, amount, service, fee: !service && FEE_RE.test(desc) });
    }
    // No prices at all (e.g. a summary email): keep any line that names recognisable work.
    if (!priced.length) {
      for (const l of lines) {
        const service = mapService(l);
        if (service && !SKIP_RE.test(l) && l.length < 90) priced.push({ text: cleanDesc(l), amount: null, service, fee: false });
      }
    }

    return { shop: findShop(all), date, odometer, invoice: inv ? inv[1] : '', total, lines: priced };
  }

  // One log entry per distinct service. Fees, tax and anything unrecognised are folded into the
  // largest entry so the entries add up to the invoice total.
  function toEntries(order, vehicle, logs) {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const groups = new Map();
    const extras = [];
    for (const l of order.lines) {
      if (l.service) {
        const g = groups.get(l.service) || { service: l.service, cost: 0, items: [] };
        g.cost += l.amount || 0;
        g.items.push(l.text);
        groups.set(l.service, g);
      } else {
        extras.push(l);
      }
    }
    // Nothing recognised but there are priced lines: log it as general service.
    if (!groups.size && extras.some((e) => !e.fee)) {
      const work = extras.filter((e) => !e.fee);
      groups.set('Service', { service: 'Service', cost: work.reduce((s, e) => s + (e.amount || 0), 0), items: work.map((e) => e.text) });
      extras.splice(0, extras.length, ...extras.filter((e) => e.fee));
    }
    const list = [...groups.values()];
    if (!list.length) return [];

    const round = (n) => Math.round(n * 100) / 100;
    const itemsSum = list.reduce((s, g) => s + g.cost, 0);
    const extraSum = extras.reduce((s, e) => s + (e.amount || 0), 0);
    const leftover = order.total != null ? round(order.total - itemsSum) : round(extraSum);
    const biggest = list.reduce((a, b) => (b.cost > a.cost ? b : a), list[0]);
    if (Math.abs(leftover) >= 0.01) {
      biggest.cost += leftover;
      biggest.feeNote = `incl. $${leftover.toFixed(2)} fees/tax${extras.length ? ' (' + extras.map((e) => e.text).slice(0, 4).join(', ') + ')' : ''}`;
    }

    const have = new Set((logs || []).filter((l) => l.vehicleId === vehicle.id).map((l) => l.date + '|' + norm(l.service)));
    return list.map((g) => ({
      vehicleId: vehicle.id,
      service: g.service,
      date: order.date,
      odometer: order.odometer,
      cost: Math.max(0, round(g.cost)),
      by: 'Shop',
      notes: [order.shop, order.invoice ? `#${order.invoice}` : '', g.items.join('; '), g.feeNote || ''].filter(Boolean).join(' · '),
      duplicate: have.has(order.date + '|' + norm(g.service))
    }));
  }

  // Rebuilds readable lines from pdf.js text items (which arrive as positioned fragments).
  function linesFromPdfItems(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < Math.max(2, (it.height || 10) * 0.45));
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let out = '';
      let end = null;
      for (const p of r.parts) {
        if (end != null) out += p.x - end > 12 ? '   ' : p.x - end > 1 ? ' ' : '';
        out += p.s;
        end = p.x + p.w;
      }
      return out.trim();
    }).join('\n');
  }

  const looksLikeCarfax = (text) => /carfax/i.test(text);

  return { parseWorkOrder, toEntries, linesFromPdfItems, looksLikeCarfax, mapService };
});
