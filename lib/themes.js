// Color themes for the whole app. A theme is a set of CSS custom properties (the same names
// styles.css defines on :root) plus an optional decoration (checkered flag, racing stripes) and font.
// There are general styles (Garage, Racing, ...) and brand themes (Ford, Volkswagen, ...).
// The choice is a per-device preference kept in localStorage, applied before the page paints.
// Attaches to window.GarageThemes in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageThemes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'garage-log-theme';
  const RACE_FONT = 'Bahnschrift, "DIN Alternate", "Arial Narrow", "Roboto Condensed", sans-serif';

  // bg/panel/line/text/dim: surfaces and type; accent: highlights and buttons; ok/soon/over/unk:
  // status colors; hover: table row hover; glow: the light under the 3D car; scrim: behind text on photos.
  const STYLES = [
    { id: 'garage', name: 'Garage', note: 'Shop-floor amber (default)',
      vars: { bg: '#0e0e0c', panel: '#161614', line: '#34332e', text: '#e9e6dc', dim: '#8d8a7e', accent: '#ffb000', ok: '#7fd36b', soon: '#ffb000', over: '#ff4b3a', unk: '#6f6c62', hover: '#1b1b18', glow: '#2a2924' } },
    { id: 'racing', name: 'Racing', note: 'Checkered flag, race red', deco: 'checker', font: RACE_FONT,
      vars: { bg: '#0b0b0d', panel: '#141418', line: '#2e2e36', text: '#f2f2f4', dim: '#8e8e9a', accent: '#e10600', ok: '#3ddc84', soon: '#ffcc00', over: '#ff3b30', unk: '#6c6c78', hover: '#1c1c22', glow: '#2b1416' } },
    { id: 'gulf', name: 'Gulf', note: 'Powder blue and orange livery', deco: 'stripes', font: RACE_FONT,
      vars: { bg: '#0d1a24', panel: '#13242f', line: '#2a4352', text: '#eaf3f8', dim: '#8aa7b8', accent: '#ff7a1a', ok: '#7fd8a6', soon: '#ffc24b', over: '#ff5a4a', unk: '#5f7b8b', hover: '#183040', glow: '#1f4257' } },
    { id: 'brg', name: 'British Green', note: 'Racing green, brass and cream', deco: 'stripes',
      vars: { bg: '#0a1410', panel: '#101d17', line: '#26392f', text: '#efe9d6', dim: '#93a596', accent: '#d4af37', ok: '#8fd18a', soon: '#e8c25a', over: '#ef6a52', unk: '#667a6c', hover: '#15261e', glow: '#1d3a2b' } },
    { id: 'rally', name: 'Rally', note: 'World Rally blue and gold', deco: 'stripes', font: RACE_FONT,
      vars: { bg: '#07122b', panel: '#0d1a3a', line: '#22346a', text: '#eef2ff', dim: '#8d9cc8', accent: '#ffd200', ok: '#5fe0a0', soon: '#ffd200', over: '#ff5470', unk: '#5d6b96', hover: '#13234a', glow: '#1b2f66' } },
    { id: 'midnight', name: 'Midnight', note: 'Neon cyan after dark',
      vars: { bg: '#07080f', panel: '#0f111c', line: '#252a40', text: '#e6e9ff', dim: '#8088aa', accent: '#22e4ff', ok: '#5cf2a0', soon: '#ffcf4a', over: '#ff4f8b', unk: '#5c6280', hover: '#151829', glow: '#13254a' } },
    { id: 'showroom', name: 'Showroom', note: 'Light, for bright rooms', light: true,
      vars: { bg: '#eceef1', panel: '#ffffff', line: '#cfd3da', text: '#1b1d22', dim: '#666b76', accent: '#c8102e', ok: '#1f8a3a', soon: '#b77700', over: '#d42020', unk: '#8a8f99', hover: '#f2f4f7', glow: '#dfe3ea' } }
  ];
  STYLES.forEach((t) => { t.group = 'style'; });

  // Brand themes: color schemes inspired by each maker's paint, liveries and badges (no logos). Each
  // is a background, an accent and maybe racing stripes; the rest is derived so contrast stays right.
  // makes: words in Edit vehicle's Make field that make the picker suggest it.
  const BRANDS = [
    brand('ford', 'Ford', ['ford'], 'Oval navy and blue', { bg: '#061233', accent: '#3b8cff' }),
    brand('chevrolet', 'Chevrolet', ['chevrolet', 'chevy'], 'Black with bowtie gold', { bg: '#101010', accent: '#d9a93b' }),
    brand('dodge', 'Dodge / Ram', ['dodge', 'ram'], 'Black, red and twin stripes', { bg: '#0c0c0d', accent: '#e0121f', stripes: ['#e0121f', '#0c0c0d', '#e0121f'], font: RACE_FONT }),
    brand('jeep', 'Jeep', ['jeep'], 'Olive drab and sand', { bg: '#171a12', accent: '#cdb07a' }),
    brand('toyota', 'Toyota', ['toyota'], 'Graphite and Toyota red', { bg: '#121316', accent: '#eb0a1e' }),
    brand('honda', 'Honda', ['honda', 'acura'], 'Championship white, Type R red', { bg: '#efefed', accent: '#cc0000', light: true, font: RACE_FONT }),
    brand('subaru', 'Subaru', ['subaru'], 'World Rally Blue, gold wheels', { bg: '#082256', accent: '#f2c94c', stripes: ['#f2c94c', '#082256', '#eef2ff'], font: RACE_FONT }),
    brand('volkswagen', 'Volkswagen', ['volkswagen', 'vw'], 'VW navy and light blue', { bg: '#001e50', accent: '#2bb6f0' }),
    brand('bmw', 'BMW', ['bmw', 'mini'], 'M stripes on black', { bg: '#0d0f14', accent: '#2f7fe6', stripes: ['#81c4ff', '#16588e', '#e7222e'], font: RACE_FONT }),
    brand('mercedes', 'Mercedes-Benz', ['mercedes', 'benz', 'amg'], 'Silver arrow, AMG teal', { bg: '#0c0d0e', accent: '#00a19c' }),
    brand('audi', 'Audi', ['audi'], 'Ring silver on black', { bg: '#111214', accent: '#c4cad3', stripes: ['#c4cad3', '#111214', '#bb0a30'] }),
    brand('porsche', 'Porsche', ['porsche'], 'Martini stripes on white', { bg: '#f3f3f1', accent: '#c8102e', light: true, stripes: ['#0b2a5b', '#3d8fd1', '#c8102e'], font: RACE_FONT }),
    brand('ferrari', 'Ferrari', ['ferrari'], 'Rosso corsa, Modena yellow', { bg: '#1a0506', accent: '#ffd100', stripes: ['#ff2800', '#1a0506', '#ffd100'], font: RACE_FONT }),
    brand('harley', 'Harley-Davidson', ['harley'], 'Black and orange', { bg: '#0b0b0b', accent: '#f26f21' })
  ];
  BRANDS.forEach((t) => { t.group = 'brand'; });
  const THEMES = [...STYLES, ...BRANDS];

  function brand(id, name, makes, note, o) {
    const light = Boolean(o.light);
    const text = light ? '#1b1d22' : '#eef0f3';
    const toward = light ? '#000000' : '#ffffff';
    return {
      id, name, note, makes, light, font: o.font, stripes: o.stripes, deco: o.stripes ? 'stripes' : undefined,
      vars: {
        bg: o.bg, panel: light ? '#ffffff' : mix(o.bg, toward, 0.05), line: mix(o.bg, toward, light ? 0.16 : 0.17), text,
        dim: mix(text, o.bg, 0.42), accent: o.accent,
        ok: light ? '#1f8a3a' : '#5fd38a', soon: light ? '#b77700' : '#ffc83d', over: light ? '#d42020' : '#ff4d4d',
        unk: mix(text, o.bg, 0.6), hover: mix(o.bg, toward, light ? 0.04 : 0.08), glow: mix(o.bg, o.accent, light ? 0.12 : 0.22)
      }
    };
  }

  // a + (b - a) * t, on #rrggbb colors
  function mix(a, b, t) {
    const c = (h, i) => parseInt(h.slice(i, i + 2), 16);
    return '#' + [1, 3, 5].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * t).toString(16).padStart(2, '0')).join('');
  }

  // The brand theme for a vehicle's make ("Ford", "FORD", "Mercedes-Benz"), if there is one.
  function forMake(make) {
    const words = String(make || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
    return BRANDS.find((t) => t.makes.some((k) => words.includes(k))) || null;
  }

  const byId = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
  const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));

  // Black or white, whichever reads better on `hex` (WCAG relative luminance).
  function onColor(hex) {
    const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? '#111111' : '#ffffff';
  }

  // Everything a theme sets, as CSS custom properties. accent: optional custom accent color.
  function resolve(prefs) {
    const p = prefs || {};
    const t = byId(p.id);
    const vars = { ...t.vars };
    if (isHex(p.accent)) vars.accent = p.accent;
    vars['on-accent'] = onColor(vars.accent);
    vars.scrim = t.light ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.72)';
    return { theme: t, vars };
  }

  function load(storage) {
    try { return JSON.parse(storage.getItem(KEY)) || {}; } catch { return {}; }
  }

  function save(storage, prefs) {
    try { storage.setItem(KEY, JSON.stringify({ id: byId(prefs.id).id, accent: isHex(prefs.accent) ? prefs.accent : '' })); } catch { /* private mode */ }
  }

  function apply(doc, prefs) {
    const { theme, vars } = resolve(prefs);
    const el = doc.documentElement;
    for (const [k, v] of Object.entries(vars)) el.style.setProperty('--' + k, v);
    if (theme.font) el.style.setProperty('--mono', theme.font); else el.style.removeProperty('--mono');
    ['a', 'b', 'c'].forEach((k, i) => {
      if (theme.stripes) el.style.setProperty('--stripe-' + k, theme.stripes[i]); else el.style.removeProperty('--stripe-' + k);
    });
    el.dataset.theme = theme.id;
    if (theme.deco) el.dataset.deco = theme.deco; else delete el.dataset.deco;
    el.style.colorScheme = theme.light ? 'light' : 'dark';
    const meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', vars.bg);
    return theme;
  }

  // The settings card body: style and brand swatches (the vehicle's own make first), then a custom
  // accent color. Clicks go through the apps' data-action handlers ("theme" with the theme id,
  // "accentreset"); #accentPick fires input events.
  function pickerHtml(prefs, make) {
    const p = prefs || {};
    const cur = byId(p.id);
    const mine = forMake(make);
    const chip = (t) => {
      const v = t.vars;
      const tag = mine && t.id === mine.id ? ' <span class="mk">your make</span>' : '';
      return `<button type="button" class="theme-chip${t.id === cur.id ? ' on' : ''}" data-action="theme" data-id="${t.id}" aria-pressed="${t.id === cur.id}">
        <span class="sw">${[v.bg, v.panel, v.accent, v.text].map((c) => `<i data-c="${c}"></i>`).join('')}</span>
        <span class="nm">${t.name}${tag}</span><span class="nt">${t.note}</span></button>`;
    };
    const brands = mine ? [mine, ...BRANDS.filter((t) => t !== mine)] : BRANDS;
    const accent = isHex(p.accent) ? p.accent : cur.vars.accent;
    const reset = isHex(p.accent) ? `<button type="button" class="btn ghost small" data-action="accentreset">USE THE THEME COLOR</button>` : '';
    return `<div class="theme-group">Styles</div><div class="theme-grid">${STYLES.map(chip).join('')}</div>
      <div class="theme-group">Brands</div><div class="theme-grid">${brands.map(chip).join('')}</div>
      <div class="accent-row"><label for="accentPick">ACCENT COLOR</label><input type="color" id="accentPick" value="${accent}">${reset}</div>`;
  }

  // Fill the swatches in (the page's CSP doesn't allow inline style attributes).
  function paintSwatches(rootEl) {
    rootEl.querySelectorAll('.theme-chip i[data-c]').forEach((i) => { i.style.background = i.dataset.c; });
  }

  // In the page: apply the saved theme straight away (this script loads in <head>, so no flash).
  if (typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
    try { apply(document, load(localStorage)); } catch { /* keep the stylesheet's defaults */ }
  }

  return { KEY, THEMES, STYLES, BRANDS, forMake, mix, byId, onColor, resolve, load, save, apply, pickerHtml, paintSwatches };
});
