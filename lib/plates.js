// License plates drawn in the style of each US state's standard plate (colors, state name, slogan),
// with the vehicle's own characters. Used for the plate card next to the dashboard car and for the
// plates on the 3D model. Styled after the real plates, not copies of their artwork.
// Attaches to window.GaragePlates in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GaragePlates = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // code: [state name, slogan, background top, background bottom, characters, state name color,
  //        name style ('script' | 'serif' | 'sans'), scenery ('mountains' | 'hills' | 'sun' | 'waves' | '')]
  const STATES = {
    AL: ['Alabama', 'Sweet Home Alabama', '#dfeaf6', '#ffffff', '#1d3b6e', '#1d3b6e', 'script', ''],
    AK: ['Alaska', 'The Last Frontier', '#f5c518', '#f7d548', '#1a3a7a', '#1a3a7a', 'sans', ''],
    AZ: ['Arizona', 'Grand Canyon State', '#f4b183', '#fff7ec', '#7a1f2b', '#7a1f2b', 'sans', 'sun'],
    AR: ['Arkansas', 'The Natural State', '#ffffff', '#eef3f8', '#1f3d7a', '#b22234', 'serif', ''],
    CA: ['California', 'dmv.ca.gov', '#ffffff', '#ffffff', '#1c2f6b', '#c8102e', 'script', ''],
    CO: ['Colorado', '', '#ffffff', '#ffffff', '#1f6b3a', '#1f6b3a', 'sans', 'mountains'],
    CT: ['Connecticut', 'Constitution State', '#cfe2f3', '#ffffff', '#1f3d7a', '#1f3d7a', 'serif', ''],
    DE: ['Delaware', 'The First State', '#1b2f5e', '#1b2f5e', '#f2c230', '#f2c230', 'sans', ''],
    DC: ['Washington, D.C.', 'End Taxation Without Representation', '#ffffff', '#ffffff', '#1c2f6b', '#c8102e', 'sans', ''],
    FL: ['Florida', 'Sunshine State', '#ffffff', '#ffffff', '#0f6b3a', '#0f6b3a', 'sans', 'sun'],
    GA: ['Georgia', 'In God We Trust', '#ffffff', '#fdf3e7', '#111111', '#111111', 'serif', 'sun'],
    HI: ['Hawaii', 'Aloha State', '#ffffff', '#ffffff', '#111111', '#111111', 'sans', 'rainbow'],
    ID: ['Idaho', 'Famous Potatoes', '#cfe0f5', '#ffffff', '#b22234', '#1f3d7a', 'sans', 'mountains'],
    IL: ['Illinois', 'Land of Lincoln', '#ffffff', '#f3f3f3', '#1f2f5e', '#c8102e', 'script', ''],
    IN: ['Indiana', 'Crossroads of America', '#ffffff', '#e8eef7', '#1f2f5e', '#1f2f5e', 'sans', ''],
    IA: ['Iowa', '', '#cfe2f3', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', 'hills'],
    KS: ['Kansas', '', '#dfe9f5', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', 'hills'],
    KY: ['Kentucky', 'Kentucky Unbridled Spirit', '#ffffff', '#e7f0f8', '#1f3d7a', '#1f3d7a', 'script', 'hills'],
    LA: ['Louisiana', "Sportsman's Paradise", '#ffffff', '#f3f3f3', '#1f2f5e', '#c8102e', 'serif', ''],
    ME: ['Maine', 'Vacationland', '#ffffff', '#ffffff', '#1f3d4d', '#1f3d4d', 'serif', ''],
    MD: ['Maryland', '', '#ffffff', '#ffffff', '#111111', '#111111', 'serif', ''],
    MA: ['Massachusetts', 'The Spirit of America', '#ffffff', '#ffffff', '#c8102e', '#1f3d7a', 'sans', ''],
    MI: ['Michigan', 'Pure Michigan', '#ffffff', '#ffffff', '#1f3d7a', '#1f3d7a', 'sans', ''],
    MN: ['Minnesota', 'Explore Minnesota', '#d6e6f5', '#ffffff', '#1f3d7a', '#1f3d7a', 'serif', 'waves'],
    MS: ['Mississippi', '', '#c9daf0', '#f5f8fc', '#1f2f5e', '#1f2f5e', 'serif', ''],
    MO: ['Missouri', 'Show-Me State', '#dbe8f5', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', ''],
    MT: ['Montana', 'Big Sky Country', '#1f3d7a', '#3e5f99', '#ffffff', '#ffffff', 'sans', 'mountains'],
    NE: ['Nebraska', '', '#ffffff', '#dfe9f5', '#1f2f5e', '#1f2f5e', 'sans', 'hills'],
    NV: ['Nevada', 'Home Means Nevada', '#9cc3e6', '#fde9c9', '#1f2f5e', '#1f2f5e', 'sans', 'mountains'],
    NH: ['New Hampshire', 'Live Free or Die', '#ffffff', '#ffffff', '#1d5c3a', '#1d5c3a', 'sans', 'mountains'],
    NJ: ['New Jersey', 'Garden State', '#f6e9b0', '#fff7d6', '#111111', '#111111', 'sans', ''],
    NM: ['New Mexico', 'Land of Enchantment', '#f5d33d', '#f9e27a', '#b31b1b', '#b31b1b', 'sans', 'sun'],
    NY: ['New York', 'Excelsior', '#ffffff', '#f2c230', '#1c2f6b', '#1c2f6b', 'sans', ''],
    NC: ['North Carolina', 'First in Flight', '#ffffff', '#ffffff', '#1f2f5e', '#c8102e', 'serif', ''],
    ND: ['North Dakota', 'Legendary', '#ffffff', '#e9e1d2', '#1f2f5e', '#1f2f5e', 'sans', 'hills'],
    OH: ['Ohio', 'Birthplace of Aviation', '#ffffff', '#ffffff', '#1f2f5e', '#c8102e', 'sans', ''],
    OK: ['Oklahoma', 'Explore Oklahoma', '#ffffff', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', ''],
    OR: ['Oregon', '', '#ffffff', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', 'trees'],
    PA: ['Pennsylvania', 'visitPA.com', '#ffffff', '#ffffff', '#1f3d7a', '#1f3d7a', 'sans', 'bands'],
    RI: ['Rhode Island', 'Ocean State', '#ffffff', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', 'waves'],
    SC: ['South Carolina', 'While I Breathe I Hope', '#ffffff', '#fbe9d7', '#1f2f5e', '#1f2f5e', 'serif', 'sun'],
    SD: ['South Dakota', 'Great Faces. Great Places.', '#ffffff', '#e9eef5', '#1f2f5e', '#1f2f5e', 'sans', 'mountains'],
    TN: ['Tennessee', '', '#1f2f5e', '#24396e', '#ffffff', '#ffffff', 'sans', ''],
    TX: ['Texas', 'The Lone Star State', '#ffffff', '#ffffff', '#111111', '#111111', 'sans', ''],
    UT: ['Utah', 'Life Elevated', '#ffffff', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', 'mountains'],
    VT: ['Vermont', 'Green Mountain State', '#1d5c3a', '#1d5c3a', '#ffffff', '#ffffff', 'sans', ''],
    VA: ['Virginia', '', '#ffffff', '#ffffff', '#1f2f5e', '#1f2f5e', 'script', ''],
    WA: ['Washington', 'Evergreen State', '#ffffff', '#ffffff', '#1c2f6b', '#c8102e', 'script', 'mountains'],
    WV: ['West Virginia', 'Wild, Wonderful', '#ffffff', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', 'hills'],
    WI: ['Wisconsin', "America's Dairyland", '#ffffff', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', ''],
    WY: ['Wyoming', '', '#ffffff', '#ffffff', '#1f2f5e', '#1f2f5e', 'sans', 'mountains']
  };
  const NAMES = Object.fromEntries(Object.entries(STATES).map(([code, s]) => [s[0].toLowerCase().replace(/[^a-z]/g, ''), code]));

  // "wa", "WA", "Washington" -> 'WA'; anything else -> ''
  function stateCode(s) {
    const raw = String(s || '').trim();
    if (STATES[raw.toUpperCase()]) return raw.toUpperCase();
    return NAMES[raw.toLowerCase().replace(/[^a-z]/g, '')] || '';
  }

  // What to draw: a known state's design, or a plain plate with the region name typed.
  function design(state) {
    const code = stateCode(state);
    if (code) {
      const [name, slogan, top, bottom, chars, header, style, scenery] = STATES[code];
      return { code, name, slogan, top, bottom, chars, header, style, scenery };
    }
    const typed = String(state || '').trim().slice(0, 20);
    return { code: '', name: typed, slogan: '', top: '#ffffff', bottom: '#f1f1ee', chars: '#1f2f5e', header: '#1f2f5e', style: 'sans', scenery: '' };
  }

  const FONT = { script: 'italic 700 {s}px "Brush Script MT", "Segoe Script", Georgia, serif', serif: '700 {s}px Georgia, "Times New Roman", serif', sans: '700 {s}px "Arial Narrow", Arial, sans-serif' };

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
    bg.addColorStop(0, d.top);
    bg.addColorStop(1, d.bottom);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    scenery(g, w, h, d);
    g.restore();
    // embossed rim and bolt holes
    round();
    g.lineWidth = h * 0.03;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (const x of [w * 0.2, w * 0.8]) for (const y of [h * 0.13, h * 0.87]) { g.beginPath(); g.ellipse(x, y, h * 0.035, h * 0.022, 0, 0, Math.PI * 2); g.fill(); }
    // state name across the top, slogan along the bottom
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = d.header;
    if (d.name) {
      g.font = FONT[d.style].replace('{s}', Math.round(h * (d.style === 'script' ? 0.2 : 0.16)));
      g.fillText(d.name, w / 2, h * 0.17, w * 0.62);
    }
    if (d.slogan) {
      g.font = FONT.sans.replace('{s}', Math.round(h * 0.085)).replace('700 ', '600 ');
      g.fillText(d.slogan, w / 2, h * 0.88, w * 0.56);
    }
    // the characters: tall, condensed, with a light emboss
    const chars = String(text || '').toUpperCase().slice(0, 10) || '———';
    g.font = `700 ${Math.round(h * 0.5)}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillText(chars, w / 2 + h * 0.008, h * 0.535 + h * 0.008, w * 0.86);
    g.fillStyle = d.chars;
    g.fillText(chars, w / 2, h * 0.535, w * 0.86);
  }

  function scenery(g, w, h, d) {
    const tint = (a) => (d.top === '#ffffff' || d.bottom === '#ffffff' ? `rgba(70,110,170,${a})` : `rgba(255,255,255,${a})`);
    if (d.scenery === 'mountains') {
      g.fillStyle = tint(0.16);
      g.beginPath();
      g.moveTo(0, h * 0.8);
      [[0.12, 0.58], [0.24, 0.7], [0.4, 0.42], [0.52, 0.6], [0.66, 0.5], [0.8, 0.66], [0.9, 0.56], [1, 0.7]].forEach(([x, y]) => g.lineTo(w * x, h * y));
      g.lineTo(w, h * 0.8);
      g.closePath();
      g.fill();
    } else if (d.scenery === 'hills' || d.scenery === 'waves') {
      g.fillStyle = tint(d.scenery === 'waves' ? 0.12 : 0.1);
      g.beginPath();
      g.moveTo(0, h * 0.78);
      for (let i = 0; i <= 20; i++) g.lineTo((w * i) / 20, h * (0.72 + 0.04 * Math.sin(i * (d.scenery === 'waves' ? 1.6 : 0.6))));
      g.lineTo(w, h * 0.8);
      g.lineTo(0, h * 0.8);
      g.fill();
    } else if (d.scenery === 'sun') {
      g.fillStyle = 'rgba(245,150,40,0.22)';
      g.beginPath();
      g.arc(w / 2, h * 0.62, h * 0.32, 0, Math.PI * 2);
      g.fill();
    } else if (d.scenery === 'rainbow') {
      ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'].forEach((c, i) => {
        g.strokeStyle = c;
        g.globalAlpha = 0.28;
        g.lineWidth = h * 0.025;
        g.beginPath();
        g.arc(w / 2, h * 1.05, h * (0.75 - i * 0.03), Math.PI, 0);
        g.stroke();
      });
      g.globalAlpha = 1;
    } else if (d.scenery === 'trees') {
      g.fillStyle = 'rgba(30,110,60,0.25)';
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.3); g.lineTo(w * 0.42, h * 0.75); g.lineTo(w * 0.58, h * 0.75); g.closePath();
      g.fill();
    } else if (d.scenery === 'bands') {
      g.fillStyle = '#1f3d7a';
      g.fillRect(0, 0, w, h * 0.07);
      g.fillStyle = '#f2c230';
      g.fillRect(0, h * 0.93, w, h * 0.07);
    }
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

  return { STATES, stateCode, design, draw, dataUrl };
});
