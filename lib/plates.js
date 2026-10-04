// License plates drawn after each US state's current standard plate: its colors, wording (state name,
// slogan) and main graphic, with the vehicle's own characters. Used for the plate card next to the
// dashboard car and for the plates on the 3D model. Designs follow the descriptions of the current
// standard passenger plates in Wikipedia's "Vehicle registration plates of <state>" articles; they are
// drawn in the style of the real plates, not copies of their artwork. Attaches to window.GaragePlates.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GaragePlates = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // name: the state name as printed; top / bottom: what's printed above and below the characters
  // bg: [top, bottom] gradient (or [top, middle, bottom]); chars: character color; ink: color of the
  // printed words; style: 'script' | 'serif' | 'sans'; art: graphics, drawn in order (see ART below);
  // band: a colored bar at the top or bottom that a line of text sits in.
  const STATES = {
    AL: { name: 'Alabama', top: 'ALABAMA', bottom: 'www.alabama.travel', bg: ['#9fd0ef', '#fbd9a8', '#f6e7c8'], chars: '#111111', ink: '#1f4f8f', bottomInk: '#ffffff', art: ['sun:#f7a541:0.5:0.62', 'sea'] },
    AK: { name: 'Alaska', top: 'ALASKA', bottom: '', bg: ['#f5c518', '#f7d548'], chars: '#1a3a7a', ink: '#1a3a7a', art: ['flagAK'] },
    AZ: { name: 'Arizona', top: 'ARIZONA', bottom: 'GRAND CANYON STATE', bg: ['#4fb3b0', '#f6d2a2', '#fff5e6'], chars: '#7a1f2b', ink: '#7a1f2b', art: ['sun:#ffffff:0.5:0.55', 'mesas', 'saguaro'] },
    AR: { name: 'Arkansas', top: 'Arkansas', bottom: 'The Natural State', bg: ['#b9d9f2', '#ffffff'], chars: '#111111', ink: '#8b1a1a', style: 'serif', art: ['diamond'] },
    CA: { name: 'California', top: 'California', bottom: 'dmv.ca.gov', bg: ['#ffffff', '#ffffff'], chars: '#1c2f6b', ink: '#c8102e', style: 'script', art: [] },
    CO: { name: 'Colorado', top: 'COLORADO', bottom: '', bg: ['#ffffff', '#ffffff'], chars: '#1f5c34', ink: '#ffffff', art: ['coBand'] },
    CT: { name: 'Connecticut', top: 'Connecticut', bottom: 'Constitution State', bg: ['#a9cdea', '#ffffff'], chars: '#1f3d7a', ink: '#1f3d7a', style: 'serif', art: ['border:#1f3d7a'] },
    DE: { name: 'Delaware', top: 'THE FIRST STATE', bottom: 'DELAWARE', bg: ['#1b2f5e', '#1b2f5e'], chars: '#f2c230', ink: '#f2c230', art: ['border:#f2c230'] },
    DC: { name: 'Washington, D.C.', top: 'WASHINGTON, DC', bottom: 'END TAXATION WITHOUT REPRESENTATION', bg: ['#ffffff', '#ffffff'], chars: '#c8102e', ink: '#1f3d7a', art: ['stripes:#c8102e:#1f3d7a'] },
    FL: { name: 'Florida', top: 'MYFLORIDA.COM', bottom: 'SUNSHINE STATE', bg: ['#ffffff', '#ffffff'], chars: '#0f6b3a', ink: '#0f6b3a', art: ['orange'] },
    GA: { name: 'Georgia', top: 'GEORGIA', bottom: '', bg: ['#ffffff', '#ffffff'], chars: '#111111', ink: '#111111', art: ['peach'] },
    HI: { name: 'Hawaii', top: 'HAWAII', bottom: 'ALOHA STATE', bg: ['#ffffff', '#ffffff'], chars: '#111111', ink: '#111111', art: ['rainbow'] },
    ID: { name: 'Idaho', top: 'IDAHO', bottom: 'FAMOUS POTATOES', bg: ['#6f9fd8', '#ffffff', '#ffffff'], chars: '#111111', ink: '#b22234', art: ['mountains:rgba(40,80,150,0.25)', 'border:#ffffff'] },
    IL: { name: 'Illinois', top: 'Illinois', bottom: 'Land of Lincoln', bg: ['#ffffff', '#ffffff'], chars: '#1f2f5e', ink: '#c8102e', style: 'script', art: ['skyline:rgba(120,140,170,0.25)', 'lincoln'] },
    IN: { name: 'Indiana', top: 'INDIANA', bottom: '', bg: ['#cfe3f5', '#eef5e6', '#a7cf8a'], chars: '#1f2f5e', ink: '#1f2f5e', art: ['hills:#7fb35f', 'bridge'] },
    IA: { name: 'Iowa', top: 'IOWA', bottom: 'COUNTY', bg: ['#4a8fd1', '#ffffff', '#8cc46a'], chars: '#111111', ink: '#ffffff', bottomInk: '#111111', art: ['skyline:rgba(255,255,255,0.85)', 'turbine', 'grass'] },
    KS: { name: 'Kansas', top: 'KANSAS', bottom: 'TO THE STARS', bg: ['#a9d2f0', '#ffffff', '#f2d27a'], chars: '#111111', ink: '#3c3f44', art: ['capitol', 'border:#3c3f44'] },
    KY: { name: 'Kentucky', top: 'KENTUCKY', bottom: 'IN GOD WE TRUST', bg: ['#ffffff', '#cfe3f5'], chars: '#1f3d7a', ink: '#1f3d7a', above: 'BLUEGRASS STATE', art: ['hills:rgba(60,110,190,0.18)'] },
    LA: { name: 'Louisiana', top: 'LOUISIANA', bottom: "SPORTSMAN'S PARADISE", bg: ['#ffffff', '#ffffff'], chars: '#1f2f5e', ink: '#c8102e', art: ['border:#1f2f5e', 'pelican'] },
    ME: { name: 'Maine', top: 'MAINE', bottom: 'VACATIONLAND', bg: ['#ffffff', '#ffffff'], chars: '#1f2f5e', ink: '#1d5c3a', art: ['border:#1f2f5e', 'pine:0.13'] },
    MD: { name: 'Maryland', top: 'Maryland', bottom: '', bg: ['#ffffff', '#ffffff'], chars: '#111111', ink: '#c8102e', style: 'script', art: ['mdFlag'] },
    MA: { name: 'Massachusetts', top: 'Massachusetts', bottom: 'The Spirit of America', bg: ['#ffffff', '#ffffff'], chars: '#c8102e', ink: '#1f3d7a', art: [] },
    MI: { name: 'Michigan', top: 'Pure Michigan', bottom: 'michigan.org', bg: ['#ffffff', '#ffffff'], chars: '#1f3d7a', ink: '#1f3d7a', bottomInk: '#ffffff', style: 'script', art: ['wave:#1f5fae'] },
    MN: { name: 'Minnesota', top: 'Minnesota', bottom: '10,000 lakes', bg: ['#cfe3f5', '#ffffff'], chars: '#111111', ink: '#1f3d7a', style: 'serif', art: ['lakes'] },
    MS: { name: 'Mississippi', top: 'MISSISSIPPI', bottom: 'COUNTY', bg: ['#ffffff', '#ffffff'], chars: '#1f2f5e', ink: '#1f2f5e', art: ['magnolia'] },
    MO: { name: 'Missouri', top: 'MISSOURI', bottom: 'SHOW-ME STATE', bg: ['#ffffff', '#ffffff'], chars: '#1f2f5e', ink: '#1f2f5e', art: ['moWaves'] },
    MT: { name: 'Montana', top: 'MONTANA', bottom: 'BIG SKY', bg: ['#1f3d7a', '#4f6fa8', '#cfd9e8'], chars: '#111111', ink: '#ffffff', bottomInk: '#1f3d7a', art: ['mountains:rgba(255,255,255,0.8)'] },
    NE: { name: 'Nebraska', top: 'NEBRASKA', bottom: '', bg: ['#fff7e6', '#fde7c2'], chars: '#1f2f5e', ink: '#1f2f5e', art: ['mosaic'] },
    NV: { name: 'Nevada', top: 'NEVADA', bottom: 'HOME MEANS NEVADA', bg: ['#8ec5ea', '#d7ecf8'], chars: '#111111', ink: '#111111', art: ['nvMountains'] },
    NH: { name: 'New Hampshire', top: 'LIVE FREE OR DIE', bottom: 'NEW HAMPSHIRE', bg: ['#ffffff', '#ffffff'], chars: '#1d5c3a', ink: '#1d5c3a', art: ['oldMan'] },
    NJ: { name: 'New Jersey', top: 'New Jersey', bottom: 'Garden State', bg: ['#f3e3a0', '#fff6d2'], chars: '#111111', ink: '#111111', art: [] },
    NM: { name: 'New Mexico', top: 'CHILE CAPITAL OF THE WORLD', bottom: 'Land of Enchantment', bg: ['#111111', '#111111'], chars: '#f5d33d', ink: '#f5d33d', bottomInk: '#3fa34d', under: 'New Mexico USA', art: ['border:#f5d33d', 'chile'] },
    NY: { name: 'New York', top: 'NEW YORK', bottom: 'EXCELSIOR', bg: ['#ffffff', '#ffffff'], chars: '#1c2f6b', ink: '#1c2f6b', bottomInk: '#e0a91b', art: ['nyStripes', 'skyline:rgba(28,47,107,0.2)', 'falls'] },
    NC: { name: 'North Carolina', top: 'IN GOD WE TRUST', bottom: 'NORTH CAROLINA', bg: ['#ffffff', '#ffffff'], chars: '#1f3d7a', ink: '#1f3d7a', under: 'To Be Rather Than to Seem', art: ['ncFlag'] },
    ND: { name: 'North Dakota', top: 'NORTH DAKOTA', bottom: 'LEGENDARY', bg: ['#a8d4f0', '#f4b36b', '#f8d76a'], chars: '#111111', ink: '#d2691e', bottomInk: '#111111', art: ['sun:#ffe066:0.5:0.66', 'canyon', 'bison'] },
    OH: { name: 'Ohio', top: 'BIRTHPLACE OF AVIATION', bottom: 'OHIO', bg: ['#fbd38a', '#fde9c6', '#cfe6b8'], chars: '#1f2f5e', ink: '#ffffff', bottomInk: '#1f2f5e', art: ['band:top:#c8102e', 'skyline:rgba(31,47,94,0.18)', 'hills:#9fca7a'] },
    OK: { name: 'Oklahoma', top: 'OKLAHOMA', bottom: 'IMAGINE THAT', bg: ['#c8102e', '#b00d26'], chars: '#ffffff', ink: '#ffffff', art: ['okIcons'] },
    OR: { name: 'Oregon', top: 'Oregon', bottom: '', bg: ['#cfe3f5', '#ffffff'], chars: '#1f2f5e', ink: '#1f2f5e', style: 'serif', art: ['mountains:rgba(150,130,200,0.45)', 'fir'] },
    PA: { name: 'Pennsylvania', top: 'PENNSYLVANIA', bottom: 'visitPA.com', bg: ['#ffffff', '#ffffff'], chars: '#1f3d7a', ink: '#ffffff', bottomInk: '#1f3d7a', art: ['band:top:#1f3d7a', 'band:bottom:#f2c230'] },
    RI: { name: 'Rhode Island', top: 'Rhode Island', bottom: 'Ocean State', bg: ['#cfe6f6', '#a9d3f0'], chars: '#1f2f5e', ink: '#1f2f5e', style: 'serif', bottomStyle: 'script', art: ['riWaves', 'anchor'] },
    SC: { name: 'South Carolina', top: 'SOUTH CAROLINA', bottom: 'WHILE I BREATHE, I HOPE', bg: ['#ffffff', '#cfe0f2'], chars: '#111111', ink: '#1f2f5e', art: ['palmetto'] },
    SD: { name: 'South Dakota', top: 'SOUTH DAKOTA', bottom: 'GREAT FACES. GREAT PLACES.', bg: ['#7fb6e6', '#d6e9f7'], chars: '#111111', ink: '#1f2f5e', art: ['rushmore'] },
    TN: { name: 'Tennessee', top: 'TENNESSEE', bottom: 'IN GOD WE TRUST', bg: ['#1f3d7a', '#2b4f94'], chars: '#ffffff', ink: '#ffffff', art: ['tnMap'] },
    TX: { name: 'Texas', top: 'TEXAS', bottom: 'THE LONE STAR STATE', bg: ['#ffffff', '#ffffff'], chars: '#111111', ink: '#111111', art: ['txMap'] },
    UT: { name: 'Utah', top: 'UTAH', bottom: 'LIFE ELEVATED', bg: ['#9fc9ea', '#fbe3c4'], chars: '#1f2f5e', ink: '#1f2f5e', art: ['arch'] },
    VT: { name: 'Vermont', top: 'VERMONT', bottom: 'GREEN MOUNTAIN STATE', bg: ['#1d5c3a', '#1d5c3a'], chars: '#ffffff', ink: '#ffffff', art: ['charBox:#ffffff', 'maple'] },
    VA: { name: 'Virginia', top: 'VIRGINIA', bottom: '', bg: ['#ffffff', '#ffffff'], chars: '#1f2f5e', ink: '#1f3d7a', art: [] },
    WA: { name: 'Washington', top: 'Washington', bottom: 'EVERGREEN STATE', bg: ['#ffffff', '#ffffff'], chars: '#1c2f6b', ink: '#c8102e', style: 'script', art: ['rainier'] },
    WV: { name: 'West Virginia', top: 'West Virginia', bottom: '', bg: ['#ffffff', '#ffffff'], chars: '#1f2f5e', ink: '#f2c230', art: ['band:top:#1f2f5e', 'goldLine'] },
    WI: { name: 'Wisconsin', top: 'Wisconsin', bottom: "America's Dairyland", bg: ['#cfe3f5', '#ffffff'], chars: '#111111', ink: '#c8102e', style: 'serif', art: ['farm'] },
    WY: { name: 'Wyoming', top: 'WYOMING', bottom: 'travelwyoming.com', bg: ['#1f2f5e', '#5b6577'], chars: '#ffffff', ink: '#ffffff', art: ['wyFlag', 'border:#c8102e'] }
  };
  const NAMES = Object.fromEntries(Object.entries(STATES).map(([code, s]) => [s.name.toLowerCase().replace(/[^a-z]/g, ''), code]));

  // "wa", "WA", "Washington" -> 'WA'; anything else -> ''
  function stateCode(s) {
    const raw = String(s || '').trim();
    if (STATES[raw.toUpperCase()]) return raw.toUpperCase();
    return NAMES[raw.toLowerCase().replace(/[^a-z]/g, '')] || '';
  }

  // A state's design, or a plain plate with whatever region name was typed.
  function design(state) {
    const code = stateCode(state);
    if (code) return { code, style: 'sans', ...STATES[code] };
    const typed = String(state || '').trim().slice(0, 20);
    return { code: '', name: typed, top: typed, bottom: '', bg: ['#ffffff', '#f1f1ee'], chars: '#1f2f5e', ink: '#1f2f5e', style: 'sans', art: [] };
  }

  const FONT = {
    script: (s) => `italic 700 ${s}px "Brush Script MT", "Segoe Script", Georgia, serif`,
    serif: (s) => `700 ${s}px Georgia, "Times New Roman", serif`,
    sans: (s) => `700 ${s}px "Arial Narrow", Arial, sans-serif`
  };

  // ---------- the graphics, each drawn on a w x h plate ----------
  const poly = (g, pts, w, h) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h))); g.closePath(); g.fill(); };
  const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const ART = {
    // Mount Rainier: one broad snow-capped volcano behind the characters, in light blue
    rainier(g, w, h) {
      g.fillStyle = 'rgba(120,165,215,0.32)';
      poly(g, [[0.02, 0.86], [0.2, 0.74], [0.36, 0.52], [0.45, 0.33], [0.5, 0.29], [0.56, 0.32], [0.66, 0.5], [0.8, 0.72], [0.98, 0.86]], w, h);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      poly(g, [[0.4, 0.43], [0.45, 0.33], [0.5, 0.29], [0.56, 0.32], [0.61, 0.42], [0.57, 0.39], [0.53, 0.44], [0.49, 0.38], [0.45, 0.45]], w, h);
    },
    mountains(g, w, h, color = 'rgba(70,110,170,0.18)') {
      g.fillStyle = color;
      poly(g, [[0, 0.82], [0.12, 0.6], [0.24, 0.7], [0.4, 0.44], [0.52, 0.6], [0.66, 0.5], [0.8, 0.66], [0.9, 0.56], [1, 0.7], [1, 0.82]], w, h);
    },
    sun(g, w, h, color, x = 0.5, y = 0.6) { g.fillStyle = color; g.globalAlpha = 0.55; circle(g, w * x, h * y, h * 0.3); g.globalAlpha = 1; },
    sea(g, w, h) { g.fillStyle = 'rgba(40,140,200,0.55)'; g.fillRect(0, h * 0.78, w, h * 0.22); },
    mesas(g, w, h) { g.fillStyle = 'rgba(110,70,140,0.45)'; poly(g, [[0, 0.8], [0.1, 0.62], [0.28, 0.62], [0.33, 0.72], [0.62, 0.72], [0.68, 0.58], [0.86, 0.58], [0.92, 0.7], [1, 0.7], [1, 0.82], [0, 0.82]], w, h); },
    saguaro(g, w, h) {
      g.fillStyle = '#2f7d3a';
      g.fillRect(w * 0.085, h * 0.3, w * 0.03, h * 0.5);
      g.fillRect(w * 0.06, h * 0.42, w * 0.022, h * 0.17); g.fillRect(w * 0.06, h * 0.56, w * 0.035, h * 0.03);
      g.fillRect(w * 0.118, h * 0.36, w * 0.022, h * 0.16); g.fillRect(w * 0.105, h * 0.49, w * 0.035, h * 0.03);
    },
    flagAK(g, w, h) { g.fillStyle = '#1a3a7a'; g.fillRect(w * 0.05, h * 0.36, w * 0.09, h * 0.3); g.fillStyle = '#f5c518'; for (const [x, y] of [[0.07, 0.5], [0.085, 0.47], [0.1, 0.46], [0.115, 0.48], [0.12, 0.52], [0.1, 0.55], [0.125, 0.4]]) circle(g, w * x, h * y, h * 0.012); },
    diamond(g, w, h) { g.fillStyle = 'rgba(70,110,170,0.28)'; poly(g, [[0.5, 0.3], [0.62, 0.55], [0.5, 0.8], [0.38, 0.55]], w, h); },
    coBand(g, w, h) {
      g.fillStyle = '#1f5c34';
      g.fillRect(0, 0, w, h * 0.3);
      g.fillStyle = '#ffffff';
      poly(g, [[0, 0.3], [0.08, 0.18], [0.16, 0.24], [0.27, 0.1], [0.38, 0.22], [0.5, 0.12], [0.6, 0.2], [0.72, 0.08], [0.84, 0.2], [0.93, 0.14], [1, 0.22], [1, 0.3]], w, h);
    },
    border(g, w, h, color) { g.strokeStyle = color; g.lineWidth = h * 0.025; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); },
    stripes(g, w, h, a, b) { g.fillStyle = a; g.fillRect(0, h * 0.04, w, h * 0.03); g.fillStyle = b; g.fillRect(0, h * 0.93, w, h * 0.03); },
    orange(g, w, h) {
      g.fillStyle = 'rgba(60,140,80,0.25)';
      poly(g, [[0.36, 0.34], [0.6, 0.34], [0.6, 0.42], [0.66, 0.5], [0.7, 0.7], [0.64, 0.78], [0.56, 0.6], [0.46, 0.42], [0.36, 0.42]], w, h);
      g.fillStyle = 'rgba(245,140,30,0.75)';
      circle(g, w * 0.5, h * 0.55, h * 0.13);
      g.fillStyle = 'rgba(60,140,80,0.8)';
      poly(g, [[0.5, 0.42], [0.56, 0.36], [0.6, 0.4], [0.54, 0.44]], w, h);
    },
    peach(g, w, h) {
      g.fillStyle = 'rgba(247,151,90,0.85)';
      circle(g, w * 0.5, h * 0.56, h * 0.14);
      g.fillStyle = 'rgba(232,90,79,0.5)';
      circle(g, w * 0.53, h * 0.58, h * 0.09);
      g.fillStyle = 'rgba(60,140,80,0.9)';
      poly(g, [[0.5, 0.42], [0.55, 0.34], [0.6, 0.38], [0.54, 0.44]], w, h);
    },
    rainbow(g, w, h) {
      ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'].forEach((c, i) => {
        g.strokeStyle = c; g.globalAlpha = 0.35; g.lineWidth = h * 0.03;
        g.beginPath(); g.arc(w / 2, h * 1.05, h * (0.78 - i * 0.035), Math.PI, 0); g.stroke();
      });
      g.globalAlpha = 1;
    },
    skyline(g, w, h, color = 'rgba(120,140,170,0.25)') {
      g.fillStyle = color;
      const blocks = [[0.08, 0.66], [0.13, 0.56], [0.17, 0.62], [0.22, 0.48], [0.26, 0.6], [0.31, 0.52], [0.36, 0.64], [0.66, 0.6], [0.7, 0.46], [0.74, 0.56], [0.78, 0.5], [0.83, 0.62], [0.88, 0.54], [0.93, 0.66]];
      for (const [x, y] of blocks) g.fillRect(w * x, h * y, w * 0.04, h * (0.84 - y));
    },
    lincoln(g, w, h) { g.fillStyle = 'rgba(120,120,130,0.22)'; circle(g, w * 0.13, h * 0.42, h * 0.1); g.fillRect(w * 0.08, h * 0.5, w * 0.1, h * 0.32); },
    hills(g, w, h, color = '#7fb35f') {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, h);
      for (let i = 0; i <= 20; i++) g.lineTo((w * i) / 20, h * (0.76 - 0.05 * Math.sin(i * 0.55)));
      g.lineTo(w, h); g.closePath(); g.fill();
    },
    bridge(g, w, h) { g.fillStyle = 'rgba(178,34,34,0.7)'; g.fillRect(w * 0.08, h * 0.6, w * 0.13, h * 0.12); g.fillStyle = 'rgba(90,40,30,0.8)'; poly(g, [[0.07, 0.6], [0.145, 0.5], [0.22, 0.6]], w, h); },
    turbine(g, w, h) { g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = h * 0.012; g.beginPath(); g.moveTo(w * 0.88, h * 0.8); g.lineTo(w * 0.88, h * 0.42); g.moveTo(w * 0.88, h * 0.42); g.lineTo(w * 0.84, h * 0.33); g.moveTo(w * 0.88, h * 0.42); g.lineTo(w * 0.94, h * 0.44); g.moveTo(w * 0.88, h * 0.42); g.lineTo(w * 0.87, h * 0.52); g.stroke(); },
    grass(g, w, h) { g.fillStyle = '#5c9e3f'; g.fillRect(0, h * 0.82, w, h * 0.18); },
    capitol(g, w, h) { g.fillStyle = '#3c3f44'; g.fillRect(w * 0.06, h * 0.64, w * 0.12, h * 0.16); g.beginPath(); g.arc(w * 0.12, h * 0.64, h * 0.07, Math.PI, 0); g.fill(); g.fillRect(w * 0.117, h * 0.48, w * 0.006, h * 0.1); },
    pelican(g, w, h) { g.fillStyle = 'rgba(31,47,94,0.25)'; circle(g, w * 0.5, h * 0.55, h * 0.18); },
    pine(g, w, h, x = 0.13) { g.fillStyle = '#1d5c3a'; poly(g, [[x, 0.3], [x - 0.05, 0.72], [x + 0.05, 0.72]], w, h); g.fillStyle = '#6b4226'; g.fillRect(w * (x - 0.008), h * 0.72, w * 0.016, h * 0.08); },
    fir(g, w, h) { g.fillStyle = 'rgba(29,92,58,0.9)'; poly(g, [[0.5, 0.18], [0.44, 0.38], [0.47, 0.38], [0.41, 0.58], [0.45, 0.58], [0.38, 0.8], [0.62, 0.8], [0.55, 0.58], [0.59, 0.58], [0.53, 0.38], [0.56, 0.38]], w, h); },
    mdFlag(g, w, h) {
      const y = h * 0.62;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#111111' : '#f2c230';
        g.fillRect((w * i) / 8, y, w / 8, (h - y) / 2);
        g.fillStyle = i % 2 ? '#c8102e' : '#ffffff';
        g.fillRect((w * i) / 8, y + (h - y) / 2, w / 8, (h - y) / 2);
      }
      g.globalAlpha = 0.75; g.fillStyle = '#ffffff'; g.fillRect(0, y, w, h - y); g.globalAlpha = 1;
    },
    wave(g, w, h, color) {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, h);
      for (let i = 0; i <= 20; i++) g.lineTo((w * i) / 20, h * (0.8 - 0.035 * Math.sin(i * 0.7)));
      g.lineTo(w, h); g.closePath(); g.fill();
    },
    lakes(g, w, h) { g.fillStyle = 'rgba(60,120,190,0.25)'; g.fillRect(0, h * 0.72, w, h * 0.06); g.fillStyle = 'rgba(29,92,58,0.3)'; for (let i = 0; i < 16; i++) poly(g, [[i / 16, 0.72], [i / 16 + 0.03, 0.6], [i / 16 + 0.06, 0.72]], w, h); },
    magnolia(g, w, h) {
      g.fillStyle = 'rgba(31,61,122,0.85)'; circle(g, w * 0.5, h * 0.55, h * 0.1);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; circle(g, w * 0.5 + Math.cos(a) * h * 0.05, h * 0.55 + Math.sin(a) * h * 0.05, h * 0.03); }
    },
    moWaves(g, w, h) {
      for (const [y, color] of [[0.12, 'rgba(200,16,46,0.6)'], [0.88, 'rgba(31,61,122,0.6)']]) {
        g.strokeStyle = color; g.lineWidth = h * 0.025;
        g.beginPath(); for (let i = 0; i <= 30; i++) g.lineTo((w * i) / 30, h * (y + 0.025 * Math.sin(i))); g.stroke();
      }
    },
    mosaic(g, w, h) { g.strokeStyle = 'rgba(214,140,40,0.25)'; g.lineWidth = h * 0.02; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(w / 2, h * 1.1); g.lineTo((w * i) / 8, 0); g.stroke(); } },
    nvMountains(g, w, h) {
      [['#8e5aa8', 0.7], ['#e07b39', 0.76], ['#3e8e7e', 0.82]].forEach(([c, y], k) => {
        g.fillStyle = c;
        g.beginPath(); g.moveTo(0, h);
        for (let i = 0; i <= 12; i++) g.lineTo((w * i) / 12, h * (y - 0.06 * Math.abs(Math.sin(i * 1.3 + k))));
        g.lineTo(w, h); g.closePath(); g.fill();
      });
    },
    oldMan(g, w, h) { g.fillStyle = 'rgba(120,90,140,0.45)'; poly(g, [[0.04, 0.8], [0.06, 0.5], [0.1, 0.42], [0.12, 0.5], [0.15, 0.46], [0.17, 0.62], [0.2, 0.8]], w, h); },
    chile(g, w, h) {
      for (const [c, dx] of [['#3fa34d', 0], ['#d62828', 0.035]]) {
        g.fillStyle = c;
        g.beginPath(); g.ellipse(w * (0.1 + dx), h * 0.55, w * 0.015, h * 0.17, 0.25, 0, Math.PI * 2); g.fill();
      }
    },
    nyStripes(g, w, h) { for (const x of [0.05, 0.75]) { g.fillStyle = '#e0a91b'; g.fillRect(w * x, h * 0.11, w * 0.2, h * 0.025); g.fillStyle = '#1c2f6b'; g.fillRect(w * x, h * 0.15, w * 0.2, h * 0.025); } }, // either side of the name
    falls(g, w, h) { g.fillStyle = 'rgba(80,150,210,0.25)'; g.fillRect(w * 0.42, h * 0.7, w * 0.16, h * 0.14); },
    ncFlag(g, w, h) {
      g.fillStyle = 'rgba(31,61,122,0.85)'; g.fillRect(0, 0, w * 0.18, h * 0.24);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#ffffff' : 'rgba(200,16,46,0.8)'; g.fillRect(w * 0.18, (h * 0.24 * i) / 4, w * 0.82, (h * 0.24) / 4); }
      g.globalAlpha = 0.55; g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h * 0.24); g.globalAlpha = 1;
    },
    canyon(g, w, h) { g.fillStyle = 'rgba(140,80,40,0.65)'; poly(g, [[0, 0.74], [0.15, 0.68], [0.3, 0.74], [0.45, 0.7], [0.6, 0.76], [0.8, 0.68], [1, 0.74], [1, 1], [0, 1]], w, h); },
    bison(g, w, h) { g.fillStyle = 'rgba(60,40,25,0.85)'; g.beginPath(); g.ellipse(w * 0.88, h * 0.82, w * 0.05, h * 0.06, 0, 0, Math.PI * 2); g.fill(); circle(g, w * 0.84, h * 0.8, h * 0.05); },
    band(g, w, h, where, color) { g.fillStyle = color; g.fillRect(0, where === 'top' ? 0 : h * 0.79, w, h * 0.21); },
    okIcons(g, w, h) { g.fillStyle = 'rgba(31,61,122,0.65)'; for (let i = 0; i < 7; i++) circle(g, w * (0.2 + i * 0.1), h * 0.79, h * 0.03); },
    riWaves(g, w, h) {
      for (let k = 0; k < 5; k++) {
        g.strokeStyle = 'rgba(31,47,94,0.22)'; g.lineWidth = h * 0.02;
        g.beginPath(); for (let i = 0; i <= 24; i++) g.lineTo((w * i) / 24, h * (0.62 + k * 0.05 + 0.02 * Math.sin(i * 0.9))); g.stroke();
      }
    },
    anchor(g, w, h) { g.strokeStyle = '#1f2f5e'; g.lineWidth = h * 0.02; g.beginPath(); g.moveTo(w * 0.09, h * 0.08); g.lineTo(w * 0.09, h * 0.3); g.moveTo(w * 0.065, h * 0.13); g.lineTo(w * 0.115, h * 0.13); g.moveTo(w * 0.06, h * 0.24); g.quadraticCurveTo(w * 0.09, h * 0.34, w * 0.12, h * 0.24); g.stroke(); },
    palmetto(g, w, h) {
      g.fillStyle = 'rgba(31,47,94,0.3)'; g.fillRect(w * 0.495, h * 0.42, w * 0.012, h * 0.4);
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.ellipse(w * (0.5 + i * 0.012), h * 0.4, w * 0.035, h * 0.02, i * 0.4, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.arc(w * 0.12, h * 0.3, h * 0.06, 0.4, Math.PI + 0.9); g.fill();
    },
    rushmore(g, w, h) { g.fillStyle = 'rgba(150,140,130,0.75)'; poly(g, [[0, 0.62], [0.12, 0.5], [0.25, 0.56], [0.3, 0.46], [0.45, 0.5], [0.55, 0.44], [0.7, 0.5], [0.85, 0.46], [1, 0.58], [1, 1], [0, 1]], w, h); },
    tnMap(g, w, h) { g.fillStyle = 'rgba(255,255,255,0.18)'; poly(g, [[0.2, 0.3], [0.8, 0.28], [0.82, 0.36], [0.78, 0.42], [0.2, 0.44]], w, h); },
    txMap(g, w, h) { g.fillStyle = 'rgba(17,17,17,0.12)'; poly(g, [[0.44, 0.34], [0.5, 0.34], [0.5, 0.48], [0.58, 0.5], [0.58, 0.62], [0.53, 0.78], [0.48, 0.66], [0.42, 0.6], [0.44, 0.48]], w, h); },
    arch(g, w, h) {
      g.fillStyle = 'rgba(196,92,46,0.75)';
      g.beginPath(); g.moveTo(w * 0.04, h * 0.84); g.lineTo(w * 0.06, h * 0.42); g.quadraticCurveTo(w * 0.13, h * 0.24, w * 0.2, h * 0.42); g.lineTo(w * 0.22, h * 0.84);
      g.lineTo(w * 0.18, h * 0.84); g.lineTo(w * 0.17, h * 0.5); g.quadraticCurveTo(w * 0.13, h * 0.38, w * 0.09, h * 0.5); g.lineTo(w * 0.08, h * 0.84); g.closePath(); g.fill();
    },
    charBox(g, w, h, color) { g.strokeStyle = color; g.lineWidth = h * 0.02; g.strokeRect(w * 0.08, h * 0.27, w * 0.84, h * 0.5); },
    maple(g, w, h) { g.fillStyle = '#ffffff'; poly(g, [[0.1, 0.06], [0.115, 0.13], [0.15, 0.11], [0.135, 0.17], [0.155, 0.2], [0.11, 0.21], [0.105, 0.27], [0.095, 0.21], [0.05, 0.2], [0.07, 0.17], [0.055, 0.11], [0.09, 0.13]], w, h); },
    goldLine(g, w, h) { g.fillStyle = '#f2c230'; g.fillRect(0, h * 0.23, w, h * 0.025); },
    farm(g, w, h) { g.fillStyle = 'rgba(178,34,34,0.55)'; g.fillRect(w * 0.06, h * 0.6, w * 0.08, h * 0.14); poly(g, [[0.055, 0.6], [0.1, 0.5], [0.145, 0.6]], w, h); g.fillStyle = 'rgba(80,140,60,0.35)'; g.fillRect(0, h * 0.74, w, h * 0.04); },
    wyFlag(g, w, h) { g.fillStyle = 'rgba(200,210,225,0.25)'; g.fillRect(w * 0.18, h * 0.28, w * 0.64, h * 0.5); }
  };

  function drawArt(g, w, h, item) {
    const [name, ...args] = String(item).split(':');
    const fn = ART[name];
    if (!fn) return;
    // numbers come in as strings: x / y positions and the pine's place
    fn(g, w, h, ...args.map((a) => (/^-?\d*\.?\d+$/.test(a) ? Number(a) : a)));
  }

  // Draws the plate onto a 2D canvas context, w x h pixels (2:1 like a US plate).
  function draw(g, w, h, text, state) {
    const d = design(state);
    const r = h * 0.09;
    const round = () => {
      g.beginPath();
      g.moveTo(r, 0); g.lineTo(w - r, 0); g.quadraticCurveTo(w, 0, w, r); g.lineTo(w, h - r); g.quadraticCurveTo(w, h, w - r, h);
      g.lineTo(r, h); g.quadraticCurveTo(0, h, 0, h - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.closePath();
    };
    g.save();
    round();
    g.clip();
    const bg = g.createLinearGradient(0, 0, 0, h);
    d.bg.forEach((c, i) => bg.addColorStop(i / (d.bg.length - 1), c));
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    for (const item of d.art || []) drawArt(g, w, h, item);
    g.restore();
    // rim and bolt holes
    round();
    g.lineWidth = h * 0.03;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (const x of [w * 0.2, w * 0.8]) for (const y of [h * 0.13, h * 0.87]) { g.beginPath(); g.ellipse(x, y, h * 0.035, h * 0.022, 0, 0, Math.PI * 2); g.fill(); }
    // the printed words: top line, a small line above it (Kentucky), one under the characters, bottom line
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const words = (str, y, size, style, color) => {
      if (!str) return;
      g.font = FONT[style](Math.round(h * size));
      g.fillStyle = color;
      g.fillText(str, w / 2, h * y, w * 0.66);
    };
    const longTop = d.top && d.top.length > 16;
    words(d.above, 0.08, 0.06, 'sans', d.ink);
    words(d.top, d.above ? 0.17 : 0.13, d.style === 'script' ? 0.2 : longTop ? 0.09 : 0.15, d.style, d.ink);
    words(d.under, 0.79, 0.07, 'sans', d.underInk || d.ink);
    const longBottom = d.bottom && d.bottom.length > 22;
    words(d.bottom, 0.9, longBottom ? 0.065 : 0.085, d.bottomStyle || 'sans', d.bottomInk || d.ink);
    // the characters: tall and condensed, with a light emboss
    const chars = String(text || '').toUpperCase().slice(0, 10) || '———';
    const cy = d.under ? 0.5 : 0.53;
    g.font = `700 ${Math.round(h * (d.under ? 0.44 : 0.5))}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillText(chars, w / 2 + h * 0.008, h * cy + h * 0.008, w * 0.82);
    g.fillStyle = d.chars;
    g.fillText(chars, w / 2, h * cy, w * 0.82);
  }

  // The plate as an image URL (for the card), cached.
  const urls = new Map();
  function dataUrl(text, state, w = 360) {
    const key = [text, state, w].join('|');
    if (!urls.has(key)) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = Math.round(w / 2);
      draw(c.getContext('2d'), c.width, c.height, text, state);
      urls.set(key, c.toDataURL('image/png'));
    }
    return urls.get(key);
  }

  return { STATES, ART, stateCode, design, draw, dataUrl };
});
