// Finds what a specific vehicle really looks like: the Wikipedia article for its generation (e.g. a 2018
// Camry is "Toyota Camry (XV70)"), that generation's real length / width / height / wheelbase, and a
// photo from its infobox. The 3D car is built to those dimensions and the photo is shown next to it.
// Network access is injected (getJson) so the desktop app can fetch from the main process and the phone
// app straight from the page. Attaches to window.GarageCarLook in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageCarLook = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const API = 'https://en.wikipedia.org/w/api.php';
  const apiUrl = (params) => API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });

  // ---------- wikitext parsing ----------

  // Every {{Infobox automobile ...}} (or motorcycle) block, with the index it starts at.
  function findInfoboxes(text) {
    const out = [];
    const re = /\{\{\s*Infobox[ _](automobile|motorcycle|electric vehicle|vehicle)\b/gi;
    let m;
    while ((m = re.exec(text))) {
      let depth = 0;
      let i = m.index;
      for (; i < text.length - 1; i++) {
        if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; } else if (text[i] === '}' && text[i + 1] === '}') { depth--; i++; if (!depth) break; }
      }
      out.push({ at: m.index, kind: m[1].toLowerCase(), params: splitParams(text.slice(m.index + 2, i - 1)) });
      re.lastIndex = i;
    }
    return out;
  }

  // "name | a = 1 | b = {{x|y}}" -> {a: '1', b: '{{x|y}}'}, splitting only on top-level pipes.
  function splitParams(body) {
    const parts = [];
    let depth = 0;
    let cur = '';
    for (let i = 0; i < body.length; i++) {
      const two = body.slice(i, i + 2);
      if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
      if ((two === '}}' || two === ']]') && depth > 0) { depth--; cur += two; i++; continue; }
      if (body[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += body[i];
    }
    parts.push(cur);
    const params = {};
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).trim().toLowerCase()] = stripNoise(p.slice(eq + 1)).trim();
    }
    return params;
  }

  const stripNoise = (s) => String(s)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{\s*(?:efn|sfn|citation needed|cn|r)\b[^{}]*\}\}/gi, '');

  // Model-year span from an infobox: model_years when given (US model years), else production dates
  // (calendar years, which can run a year behind the model year).
  function yearRange(p, nowYear) {
    const pick = (s, slack) => {
      if (!s) return null;
      const t = s.replace(/present|current|ongoing/gi, String(nowYear + 1));
      const ys = (t.match(/\b(18[89]\d|19\d\d|20\d\d)\b/g) || []).map(Number);
      return ys.length ? [Math.min(...ys), Math.max(...ys) + slack] : null;
    };
    return pick(p.model_years || p['model years'], 0) || pick(p.production, 1);
  }

  const UNIT = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };
  const SANE = { L: [2.0, 7.5], W: [0.5, 2.7], H: [0.9, 3.4], wb: [1.1, 4.8] };

  // All lengths mentioned in an infobox value, in metres, each with the text that labels it
  // ("Sedan:", "(crew cab)") so the right body variant can be preferred.
  function lengths(s) {
    const out = [];
    const re = /\{\{\s*(?:convert|cvt)\s*\|\s*([\d.,]+)(?:\s*[-–]\s*[\d.,]+)?\s*\|(?:\s*(?:–|-|to|and|x)\s*\|\s*[\d.,]+\s*\|)?\s*(mm|cm|m|in|ft)\b[^{}]*\}\}|([\d][\d.,]*)\s*(mm|cm|in)\b/gi;
    let m;
    let last = 0;
    while ((m = re.exec(s))) {
      const num = parseFloat((m[1] || m[3]).replace(/,/g, ''));
      const unit = (m[2] || m[4]).toLowerCase();
      if (Number.isFinite(num)) out.push({ m: num * UNIT[unit], label: s.slice(last, m.index).toLowerCase() });
      last = m.index + m[0].length;
    }
    return out;
  }

  const BODY_WORDS = {
    sedan: /sedan|saloon/, coupe: /coupe|coupé/, hatchback: /hatch|liftback/, wagon: /wagon|estate|touring/,
    convertible: /convertible|cabrio|roadster/, pickup: /crew|cab|pickup/, van: /van|passenger/, suv: /suv|5-door|4-door/
  };

  function dimension(p, keys, sane, body) {
    for (const k of keys) {
      const all = lengths(p[k] || '').filter((x) => x.m >= sane[0] && x.m <= sane[1]);
      if (!all.length) continue;
      const want = BODY_WORDS[body];
      const hit = want && all.find((x) => want.test(x.label));
      return Math.round((hit || all[0]).m * 1000) / 1000;
    }
    return null;
  }

  function dimsOf(p, body) {
    const d = {
      L: dimension(p, ['length'], SANE.L, body),
      W: dimension(p, ['width'], SANE.W, body),
      H: dimension(p, ['height'], SANE.H, body),
      wb: dimension(p, ['wheelbase'], SANE.wb, body)
    };
    if (d.wb && d.L && d.wb > d.L * 0.8) d.wb = null; // misparsed
    return d;
  }

  function imageOf(p) {
    const s = p.image || p.photo || '';
    const m = s.match(/(?:File:|Image:)?\s*([^|\][{}=\n]+?\.(?:jpe?g|png|webp|tiff?))/i);
    return m ? m[1].trim() : '';
  }

  const tokens = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

  // Linked articles about the same model's generations: [[Toyota Camry (XV70)]], [[Volkswagen Golf Mk7]],
  // {{Main|Ram 1500 (DT)|Ram Heavy Duty (fifth generation)}}. {{Main}} targets must share a word with the
  // title ("Ram 1500 (DS)" from "Ram pickup") so unrelated models it points at ("Dodge Ramcharger") are skipped.
  function generationLinks(text, title, model) {
    const base = title.toLowerCase();
    const words = new Set([...tokens(title), ...tokens(model || '')].filter((w) => w.length > 1));
    const found = new Set();
    const re = /\{\{\s*(?:main|further)\s*\|([^{}]+)\}\}|\[\[([^\]|#]+)/gi;
    let m;
    while ((m = re.exec(text))) {
      const names = m[1] ? m[1].split('|').filter((x) => !x.includes('=')) : [m[2]];
      for (const n of names) {
        const t = n.trim().replace(/_/g, ' ');
        const lt = t.toLowerCase();
        if (lt === base || /\b(list|history)\b/.test(lt)) continue;
        const ok = m[1] ? tokens(t).some((w) => words.has(w)) : lt.startsWith(base + ' ');
        if (ok) found.add(t);
      }
    }
    return [...found].slice(0, 24);
  }

  // The best infobox for the vehicle's model year: the narrowest year span that contains it, preferring
  // ones with dimensions and dedicated generation articles.
  function chooseCandidate(cands, year) {
    const scored = cands.map((c) => {
      let s = 0;
      const dims = Object.values(c.dims).filter(Boolean).length;
      if (year && c.years) {
        if (year >= c.years[0] && year <= c.years[1]) s += 100 - Math.min(40, c.years[1] - c.years[0]);
        else s -= 50 + Math.min(year < c.years[0] ? c.years[0] - year : year - c.years[1], 40);
      } else if (!year && c.years) s += c.years[1] / 100; // no year: latest generation
      s += dims * 6 + (c.image ? 3 : 0) + (c.generation ? 4 : 0);
      return { c, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored.length && scored[0].s > 0 ? scored[0].c : null;
  }

  function candidatesFrom(title, text, body, nowYear, generation) {
    const titleWords = tokens(title.replace(/\(.*\)/, '')).slice(1); // the model, without the make
    return findInfoboxes(text).map((ib) => ({
      title, generation,
      name: fullName(ib.params.name, title, titleWords),
      years: yearRange(ib.params, nowYear),
      dims: dimsOf(ib.params, body),
      image: imageOf(ib.params)
    }));
  }

  const PHOTO_HOST = /^https:\/\/(upload|thumb)\.wikimedia\.org\//;
  // An infobox inside a section is often just named "Fourth generation": say whose.
  function fullName(name, title, titleWords) {
    const n = String(name || '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{[^{}]*\}\}/g, '').trim();
    if (!n) return title;
    const w = tokens(n);
    return titleWords.some((t) => w.includes(t)) ? n : `${title.replace(/\s*\(.*\)/, '')} · ${n}`;
  }

  const plainHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

  // ---------- lookup ----------

  // spec: {year, make, model, body}. getJson(url) resolves to parsed JSON. Resolves to a "look" record
  // ({key, title, url, name, years, dims, photo}), or null when Wikipedia has nothing that fits.
  // Rejects only when Wikipedia can't be reached, so the caller can try again later.
  async function findLook(spec, getJson, nowYear = new Date().getFullYear()) {
    const make = String(spec.make || '').trim();
    const model = String(spec.model || '').trim();
    if (!make || !model) return null;
    const year = Number(spec.year) || null;
    const body = spec.body || '';

    const pageText = async (titles, section) => {
      const q = { action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles };
      if (section != null) q.rvsection = String(section);
      const j = await getJson(apiUrl(q));
      const pg = j && j.query && j.query.pages && j.query.pages[0];
      if (!pg || pg.missing || !pg.revisions) return null;
      return { title: pg.title, text: pg.revisions[0].slots.main.content };
    };

    // 1. The model's main article: "Make Model" (following redirects), else the top search hit.
    let main = await pageText(`${make} ${model}`);
    if (main && /\{\{\s*(?:disambiguation|dab|set index)/i.test(main.text)) main = null;
    if (!main) {
      const j = await getJson(apiUrl({ action: 'query', list: 'search', srsearch: `${make} ${model} automobile`, srlimit: '5' }));
      const hits = ((j && j.query && j.query.search) || []).map((h) => h.title);
      // a hit must name both the make and the model, so "Harley-Davidson FLHX" can't land on another bike
      const mk = tokens(make)[0];
      const mw = tokens(model).filter((w) => w.length > 1);
      const t = hits.find((h) => { const w = tokens(h); return w.includes(mk) && mw.some((x) => w.includes(x)); });
      if (t) main = await pageText(t);
    }
    if (!main) return null;

    // 2. Its own infoboxes plus the lead infobox of every generation article it links to.
    let cands = candidatesFrom(main.title, main.text, body, nowYear, false);
    const gens = await Promise.all(generationLinks(main.text, main.title, model).map((t) => pageText(t, 0).catch(() => null)));
    for (const g of gens) if (g) cands = cands.concat(candidatesFrom(g.title, g.text, body, nowYear, g.title !== main.title));
    const best = chooseCandidate(cands, year);
    if (!best) return null;
    const dims = { ...best.dims };

    // Generation articles often give dimensions per body style further down; fill the gaps from those.
    if (best.generation && Object.values(dims).some((d) => !d)) {
      const full = await pageText(best.title).catch(() => null);
      for (const c of full ? candidatesFrom(best.title, full.text, body, nowYear, true) : []) {
        const fits = !year || !c.years || (year >= c.years[0] && year <= c.years[1]);
        if (fits) for (const k of Object.keys(dims)) if (!dims[k] && c.dims[k]) dims[k] = c.dims[k];
      }
    }

    // 3. The photo's URL and credit.
    let photo = null;
    if (best.image) {
      const j = await getJson(apiUrl({ action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960', titles: 'File:' + best.image })).catch(() => null);
      const ii = j && j.query && j.query.pages && j.query.pages[0] && (j.query.pages[0].imageinfo || [])[0];
      const src = String((ii && (ii.thumburl || ii.url)) || '').replace(/\?.*$/, '');
      if (PHOTO_HOST.test(src)) {
        const meta = ii.extmetadata || {};
        photo = {
          url: src,
          page: ii.descriptionurl || '',
          credit: plainHtml(meta.Artist && meta.Artist.value).slice(0, 80),
          license: plainHtml(meta.LicenseShortName && meta.LicenseShortName.value).slice(0, 40)
        };
      }
    }
    return {
      key: lookKey(spec),
      title: best.title,
      url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(best.title.replace(/ /g, '_')),
      name: best.name,
      years: best.years,
      dims,
      photo
    };
  }

  // What a look was found for; a vehicle is looked up again when this changes.
  const lookKey = (spec) => [spec.year || '', spec.make || '', spec.baseModel || spec.model || '']
    .map((x) => String(x).trim().toLowerCase()).join('|');

  return { PHOTO_HOST, findLook, lookKey, findInfoboxes, yearRange, dimsOf, imageOf, generationLinks, chooseCandidate, lengths };
});
