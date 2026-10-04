// 3D car for the dashboard: a smooth body lofted from side-profile curves and cross-sections, shaped by
// body style (from the VIN decode), sized to the real vehicle's length / width / height / wheelbase when
// they are known (lib/carlook.js finds them) and painted the vehicle's color. Uses three.js
// (lib/vendor/three.min.js, loaded first as a classic script). The body-type mapping is plain JS so it
// can be tested in Node; attaches to window.GarageCar3D.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(() => require('./vendor/three.min.js'));
  else root.GarageCar3D = factory(() => root.THREE);
})(typeof self !== 'undefined' ? self : this, function (getTHREE) {
  const BODY_TYPES = [
    { value: 'sedan', label: 'Sedan' },
    { value: 'coupe', label: 'Coupe' },
    { value: 'hatchback', label: 'Hatchback' },
    { value: 'wagon', label: 'Wagon' },
    { value: 'suv', label: 'SUV / crossover' },
    { value: 'pickup', label: 'Pickup' },
    { value: 'van', label: 'Van / minivan' },
    { value: 'convertible', label: 'Convertible' },
    { value: 'motorcycle', label: 'Motorcycle' }
  ];
  const DEFAULT_COLOR = '#b8bcc2';

  // NHTSA BodyClass strings, e.g. "Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)".
  function bodyFromNhtsa(bodyClass, doors) {
    const b = String(bodyClass || '').toLowerCase();
    if (!b) return '';
    if (/motorcycle|scooter|moped|trike/.test(b)) return 'motorcycle';
    if (/pickup/.test(b)) return 'pickup';
    if (/convertible|cabriolet|roadster/.test(b)) return 'convertible';
    if (/van|bus/.test(b)) return 'van';
    if (/sport utility|suv|crossover|cuv|mpv/.test(b)) return 'suv';
    if (/wagon/.test(b)) return 'wagon';
    if (/hatchback|liftback/.test(b)) return 'hatchback';
    if (/coupe/.test(b)) return 'coupe';
    if (/sedan|saloon|notchback/.test(b)) return Number(doors) === 2 ? 'coupe' : 'sedan';
    if (/truck/.test(b)) return 'pickup';
    return '';
  }

  const bodyLabel = (body) => (BODY_TYPES.find((t) => t.value === body) || {}).label || '';

  // Body styles. L/W/H/wb are typical dimensions in metres, replaced by the real ones when known.
  // Profiles are [x, y] with x the fraction of length from the rear (0) to the nose (1) and y the
  // fraction of height: top = roofline / hood / deck, belt = shoulder line, bottom = underside.
  //  fo: share of the total overhang that is in front of the front axle; r: wheel radius (m)
  //  ws / rw: windshield and sloped rear-window spans; side: side-glass span; pillars: door pillars
  //  rearGlass: 'tail' for an upright tailgate window, a number for a pickup's cab back
  //  tumble: how much the greenhouse leans in; rake: how far the tailgate leans forward
  //  recess: an open pickup bed or convertible cockpit (span, depth and rail width in m); open: no roof
  //  cladding: unpainted plastic along the bottom
  const STYLES = {
    sedan: {
      L: 4.85, W: 1.84, H: 1.44, wb: 2.80, r: 0.335, fo: 0.46, tumble: 0.2,
      top: [[0, 0.6], [0.012, 0.67], [0.04, 0.695], [0.12, 0.705], [0.18, 0.72], [0.24, 0.84], [0.3, 0.955], [0.36, 0.995], [0.47, 1], [0.53, 0.965], [0.61, 0.84], [0.69, 0.705], [0.74, 0.67], [0.87, 0.635], [0.955, 0.595], [0.988, 0.54], [1, 0.42]],
      belt: [[0, 0.58], [0.04, 0.66], [0.22, 0.69], [0.69, 0.67], [0.95, 0.585], [1, 0.42]],
      bottom: [[0, 0.24], [0.02, 0.17], [0.085, 0.115], [0.92, 0.11], [0.975, 0.15], [1, 0.25]],
      ws: [0.53, 0.68], rw: [0.19, 0.33], side: [0.225, 0.675], pillars: [0.45]
    },
    coupe: {
      L: 4.65, W: 1.86, H: 1.36, wb: 2.70, r: 0.34, fo: 0.47, tumble: 0.24,
      top: [[0, 0.6], [0.012, 0.66], [0.04, 0.695], [0.14, 0.71], [0.2, 0.735], [0.3, 0.86], [0.4, 0.985], [0.47, 1], [0.54, 0.985], [0.62, 0.86], [0.705, 0.69], [0.75, 0.655], [0.87, 0.615], [0.955, 0.575], [0.988, 0.515], [1, 0.4]],
      belt: [[0, 0.5], [0.04, 0.66], [0.22, 0.7], [0.7, 0.655], [0.95, 0.565], [1, 0.41]],
      bottom: [[0, 0.33], [0.025, 0.2], [0.085, 0.105], [0.92, 0.1], [0.975, 0.15], [1, 0.26]],
      ws: [0.555, 0.695], rw: [0.2, 0.43], side: [0.26, 0.69], pillars: []
    },
    hatchback: {
      L: 4.3, W: 1.79, H: 1.46, wb: 2.64, r: 0.32, fo: 0.58, tumble: 0.2,
      top: [[0, 0.6], [0.012, 0.66], [0.03, 0.7], [0.06, 0.8], [0.13, 0.95], [0.2, 0.995], [0.5, 1], [0.58, 0.94], [0.68, 0.72], [0.73, 0.675], [0.86, 0.635], [0.955, 0.595], [0.988, 0.535], [1, 0.42]],
      belt: [[0, 0.52], [0.04, 0.665], [0.2, 0.69], [0.68, 0.67], [0.95, 0.59], [1, 0.43]],
      bottom: [[0, 0.33], [0.025, 0.2], [0.085, 0.115], [0.92, 0.11], [0.975, 0.16], [1, 0.27]],
      ws: [0.55, 0.675], rw: [0.035, 0.16], side: [0.13, 0.67], pillars: [0.44]
    },
    wagon: {
      L: 4.85, W: 1.84, H: 1.5, wb: 2.80, r: 0.335, fo: 0.48, tumble: 0.2,
      top: [[0, 0.93], [0.03, 0.975], [0.08, 0.99], [0.55, 1], [0.62, 0.93], [0.705, 0.69], [0.75, 0.655], [0.87, 0.62], [0.955, 0.585], [0.988, 0.525], [1, 0.4]],
      belt: [[0, 0.64], [0.03, 0.655], [0.2, 0.675], [0.7, 0.655], [0.95, 0.575], [1, 0.41]],
      bottom: [[0, 0.24], [0.02, 0.2], [0.08, 0.115], [0.92, 0.11], [0.975, 0.16], [1, 0.27]],
      ws: [0.575, 0.695], side: [0.05, 0.69], pillars: [0.21, 0.47], rearGlass: 'tail', rake: 0.3
    },
    suv: {
      L: 4.75, W: 1.92, H: 1.73, wb: 2.80, r: 0.37, fo: 0.47, tumble: 0.16, dome: 7,
      top: [[0, 0.9], [0.04, 0.945], [0.13, 0.985], [0.5, 1], [0.6, 0.995], [0.66, 0.93], [0.74, 0.71], [0.78, 0.69], [0.9, 0.665], [0.965, 0.63], [0.99, 0.57], [1, 0.44]],
      belt: [[0, 0.64], [0.03, 0.66], [0.2, 0.685], [0.73, 0.655], [0.96, 0.6], [1, 0.45]],
      bottom: [[0, 0.26], [0.02, 0.22], [0.07, 0.14], [0.93, 0.135], [0.98, 0.19], [1, 0.3]],
      ws: [0.615, 0.73], side: [0.1, 0.725], pillars: [0.26, 0.5], rearGlass: 'tail', rake: 0.25, cladding: true
    },
    van: {
      L: 5.15, W: 2.0, H: 1.78, wb: 3.03, r: 0.36, fo: 0.47, tumble: 0.12, dome: 7,
      top: [[0, 0.95], [0.04, 0.985], [0.1, 1], [0.66, 0.995], [0.72, 0.9], [0.8, 0.66], [0.85, 0.615], [0.95, 0.58], [0.988, 0.52], [1, 0.4]],
      belt: [[0, 0.59], [0.03, 0.6], [0.2, 0.615], [0.8, 0.615], [0.95, 0.56], [1, 0.41]],
      bottom: [[0, 0.24], [0.02, 0.2], [0.07, 0.11], [0.93, 0.105], [0.98, 0.15], [1, 0.26]],
      ws: [0.68, 0.79], side: [0.05, 0.79], pillars: [0.27, 0.55, 0.69], rearGlass: 'tail', rake: 0.15
    },
    pickup: {
      L: 5.85, W: 2.03, H: 1.93, wb: 3.6, r: 0.4, fo: 0.43, tumble: 0.1, dome: 8,
      top: [[0, 0.62], [0.006, 0.64], [0.02, 0.645], [0.368, 0.645], [0.372, 0.955], [0.39, 0.995], [0.6, 1], [0.64, 0.95], [0.705, 0.73], [0.735, 0.705], [0.9, 0.69], [0.975, 0.66], [0.993, 0.6], [1, 0.46]],
      belt: [[0, 0.6], [0.02, 0.635], [0.6, 0.64], [0.73, 0.69], [0.97, 0.655], [1, 0.47]],
      bottom: [[0, 0.26], [0.015, 0.17], [0.05, 0.135], [0.95, 0.13], [0.985, 0.18], [1, 0.3]],
      ws: [0.6, 0.72], side: [0.388, 0.72], pillars: [0.53], rearGlass: 0.368, bigGrille: true, uprightTail: true, recess: { span: [0.02, 0.366], depth: 0.52, rail: 0.06 }
    },
    convertible: {
      L: 4.4, W: 1.8, H: 1.25, wb: 2.5, r: 0.32, fo: 0.52, tumble: 0.2, open: true,
      top: [[0, 0.62], [0.012, 0.69], [0.04, 0.73], [0.6, 0.745], [0.64, 0.76], [0.68, 0.74], [0.73, 0.71], [0.86, 0.67], [0.955, 0.62], [0.988, 0.56], [1, 0.44]],
      belt: [[0, 0.52], [0.04, 0.71], [0.6, 0.73], [0.95, 0.6], [1, 0.44]],
      bottom: [[0, 0.34], [0.025, 0.21], [0.085, 0.11], [0.92, 0.105], [0.975, 0.16], [1, 0.28]],
      side: null, pillars: [], recess: { span: [0.3, 0.62], depth: 0.36, rail: 0.1 }
    }
  };

  // Monotone cubic through [x, y] points: smooth, but never overshoots (so a roof never bulges).
  function curve(pts) {
    const n = pts.length;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    const m = [d[0]];
    for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
    m.push(d[n - 2]);
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const h = Math.hypot(a, b);
      if (h > 3) { m[i] = (3 * a * d[i]) / h; m[i + 1] = (3 * b * d[i]) / h; }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i];
      const t = (x - xs[i]) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

  // The real dimensions when they look plausible for the style, else the style's own.
  function sizeFor(st, dims) {
    const d = dims || {};
    const ok = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
    const L = ok(d.L, 2.5, 7.5) ? d.L : st.L;
    const W = ok(d.W, 1.3, 2.7) ? d.W : st.W * (L / st.L) ** 0.3;
    const H = ok(d.H, 0.95, 3.2) ? d.H : st.H;
    let wb = ok(d.wb, L * 0.48, L * 0.75) ? d.wb : st.wb * (L / st.L);
    wb = clamp(wb, L * 0.48, L * 0.75);
    const r = st.r * clamp((H / st.H) ** 0.5 * (W / st.W) ** 0.5, 0.85, 1.2);
    return { L, W, H, wb, r };
  }

  // The body's shape as functions of position along the car.
  function bodyModel(st, size) {
    const { L, W, H, wb, r } = size;
    const top = curve(st.top);
    const belt = curve(st.belt);
    const bottom = curve(st.bottom);
    const xf = L - (L - wb) * st.fo; // front axle
    const wheels = [xf - wb, xf];
    const arch = r + 0.055;
    const well = Math.min(0.3, W * 0.17);

    // Plan view: full width through the middle, rounding in to the bumpers.
    const halfW = (x) => {
      const t = (x - L / 2) / (L / 2);
      const p = t > 0 ? 6 : 7;
      return (W / 2) * Math.pow(Math.max(0, 1 - Math.abs(t) ** p), 1 / p);
    };
    const archTop = (x) => {
      let y = -1;
      for (const wx of wheels) {
        const dx = x - wx;
        if (Math.abs(dx) < arch) y = Math.max(y, r + Math.sqrt(arch * arch - dx * dx));
      }
      return y;
    };

    function station(x) {
      const u = x / L;
      const yt = top(u) * H;
      const ys = Math.min(belt(u) * H, yt - 0.025 * H);
      const yb = Math.min(bottom(u) * H, ys - 0.05);
      const hw = halfW(x);
      const hs = hw * 0.965;
      const cabin = clamp((yt - ys) / (0.25 * H), 0, 1);
      const sn = { x, yt, ys, yb, ym: yb + (ys - yb) * 0.5, hw, hs, tumble: st.tumble * cabin, arch: Math.min(archTop(x), ys - 0.05) };
      // an open pickup bed or convertible cockpit: rail, inner wall, floor
      const rc = st.recess;
      if (rc && u >= rc.span[0] && u <= rc.span[1]) sn.recess = { floor: Math.max(yb + 0.1, yt - rc.depth * (H / st.H)), rail: Math.min(rc.rail, hs * 0.3) };
      return sn;
    }

    // Upper part of a cross-section: s runs 0 (shoulder) to 1 (top centre). Normally a domed
    // greenhouse (or hood crown); in a recess it is rail, inner wall and floor.
    function upper(sn, s) {
      const rc = sn.recess;
      if (rc) {
        if (s <= 0.25) return [sn.hs, sn.ys + (sn.yt - sn.ys) * (s / 0.25), false];
        if (s <= 0.375) return [sn.hs - rc.rail * ((s - 0.25) / 0.125), sn.yt, false];
        if (s <= 0.5) return [sn.hs - rc.rail, sn.yt + (rc.floor - sn.yt) * ((s - 0.375) / 0.125), true];
        return [(sn.hs - rc.rail) * (1 - (s - 0.5) / 0.5), rc.floor, true];
      }
      // a superellipse: the first half of s climbs the side wall evenly in height (so window bands
      // are real heights), the second half rounds over the roof edge to the centre
      const n = st.dome || 6;
      let yf;
      let zf;
      if (s <= 0.5) {
        yf = (s / 0.5) * ROOF_EDGE;
        zf = Math.pow(1 - yf ** n, 1 / n);
      } else {
        const th = TH0[n] + ((s - 0.5) / 0.5) * (Math.PI / 2 - TH0[n]);
        yf = Math.pow(Math.sin(th), 2 / n);
        zf = Math.pow(Math.cos(th), 2 / n);
      }
      return [sn.hs * zf * (1 - sn.tumble * yf * yf), sn.ys + (sn.yt - sn.ys) * yf, false];
    }

    // One side of a cross-section, bottom centre to top centre: {z, y, part, s, dark}.
    const UP = 16;
    function half(sn) {
      const pts = [];
      const zw = sn.hw - Math.min(well, sn.hw * 0.5);
      // underside and rocker: a squarish superellipse quarter
      const low = [];
      for (let i = 0; i <= 10; i++) {
        const th = -Math.PI / 2 + (i / 10) * Math.PI / 2;
        low.push([sn.hw * spow(Math.cos(th), 0.38), sn.ym + (sn.ym - sn.yb) * spow(Math.sin(th), 0.38)]);
      }
      // two extra points either side of the wheel well's inner wall
      for (const zz of [Math.min(zw - 0.004, sn.hw * 0.98), Math.min(zw + 0.004, sn.hw * 0.99)]) {
        let k = low.findIndex((p) => p[0] > zz);
        if (k < 1) k = k < 0 ? low.length - 1 : 1;
        const a = low[k - 1];
        const b = low[k];
        const t = (zz - a[0]) / (b[0] - a[0] || 1);
        low.splice(k, 0, [zz, a[1] + (b[1] - a[1]) * t]);
      }
      low.forEach(([z, y], i) => {
        const inWell = sn.arch > y && z >= zw;
        const innerWall = sn.arch > y && z > zw - 0.006;
        pts.push({ z, y: inWell ? sn.arch : y, part: 'low', q: Math.asin(clamp((y - sn.yb) / (sn.ym - sn.yb || 1), 0, 1)) / (Math.PI / 2), dark: inWell || innerWall || (i === 0 && z < 0.001) });
      });
      // body side up to the shoulder, evenly spaced in height so light and trim bands come out crisp
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const y = sn.ym + (sn.ys - sn.ym) * t;
        pts.push({ z: sn.hs + (sn.hw - sn.hs) * Math.cos(t * Math.PI / 2), y: Math.max(y, sn.arch), part: 'side', t, dark: sn.arch > y });
      }
      for (let i = 1; i <= UP; i++) {
        const [z, y, dark] = upper(sn, i / UP);
        pts.push({ z, y, part: 'up', s: i / UP, dark });
      }
      return pts;
    }

    return { L, W, H, wb, r, wheels, arch, station, upper, half, halfW };
  }

  // Station positions along the car: dense at the ends, wheel arches, sharp profile changes and the
  // edges of glass, pillars and lights (so those edges run straight).
  function stationsFor(m, st) {
    const L = m.L;
    const xs = [];
    for (let i = 0; i <= 120; i++) xs.push(L * (0.5 - 0.5 * Math.cos((Math.PI * i) / 120)));
    for (const wx of m.wheels) for (let i = -12; i <= 12; i++) xs.push(wx + (m.arch * 1.02 * i) / 12);
    for (const [u] of st.top) for (const e of [-0.004, 0, 0.004]) xs.push((u + e) * L);
    const edges = [...(st.ws || []), ...(st.rw || []), ...(st.side || []), ...(st.recess ? st.recess.span : [])];
    for (const p of st.pillars || []) edges.push(p - PILLAR / L / 2, p + PILLAR / L / 2);
    for (const u of edges) xs.push(u * L, u * L - 0.003, u * L + 0.003);
    const out = [...new Set(xs.map((x) => Math.round(clamp(x, 0, L) * 1e4) / 1e4))].sort((a, b) => a - b);
    return out.filter((x, i) => i === 0 || x - out[i - 1] > 0.0015);
  }

  const PILLAR = 0.075; // door pillar width (m)
  const ROOF_EDGE = 0.8; // fraction of the greenhouse height where the roof starts to round over
  const TH0 = new Proxy({}, { get: (c, n) => (n in c ? c[n] : (c[n] = Math.asin(ROOF_EDGE ** (Number(n) / 2)))) });
  const MAT = { paint: 0, dark: 1, glass: 2, head: 3, tail: 4 };

  // Which material a face of the body gets: glass, lights, grille and trim are regions of the one
  // smooth surface, so nothing floats. Regions follow the mesh's own rows (t: side panel, s: greenhouse,
  // q: underside) and stations, so their edges come out as clean curves instead of stair steps.
  function faceMaterial(st, m, f) {
    if (f.dark) return MAT.dark;
    const { L, W } = m;
    const sn = f.sn;
    const u = f.x / L;
    const hw = sn.hw / (W / 2); // 1 along the flanks, falling to 0 at the bumpers
    const k = clamp(m.H / 1.45, 0.85, 1.4);
    const within = (r) => r && u >= r[0] && u <= r[1];
    const t = f.part === 'side' ? f.t : -1;
    const s = f.part === 'up' && !sn.recess ? f.s : -1;
    if (s > 0) {
      if (s > 9 / 16 && (within(st.ws) || within(st.rw))) return MAT.glass;
      if (st.side && s > 1 / 16 && s < 7.5 / 16 && within(st.side) &&
        !(st.pillars || []).some((p) => Math.abs(f.x - p * L) < PILLAR / 2)) return MAT.glass;
      if (st.rearGlass === 'tail' && u < 0.02 && hw < 0.8 && s > 1 / 16 && s < 8.5 / 16) return MAT.glass;
    }
    const nose = f.x > L - 0.12;
    const tail = f.x < 0.1;
    // headlights wrap round the front corners; the grille and lower intake sit between them
    if (t > 0.5 && t <= 0.92 && f.x > L - 0.3 * k && hw > 0.42) return MAT.head;
    if (nose && hw <= 0.42 && t > 0.05 && t <= (st.bigGrille ? 0.92 : 0.45)) return MAT.dark;
    if (nose && hw < 0.55 && f.part === 'low' && f.q >= 0.5 && f.q < 0.9) return MAT.dark;
    // tail lights: across the corners, or upright beside the tailgate glass
    if (st.rearGlass === 'tail' || st.uprightTail) {
      if (f.x < 0.16 && hw > 0.66 && (t > 0.45 || (s >= 0 && s < 0.3))) return MAT.tail;
    } else if (t > 0.55 && t <= 0.95 && f.x < 0.26 * k && hw > 0.4) return MAT.tail;
    if (tail && hw < 0.7 && f.part === 'low' && f.q >= 0.5 && f.q < 0.9) return MAT.dark; // rear diffuser
    if (st.cladding && f.part === 'low' && f.q > 0.45 && f.y < sn.yb + 0.13 * k) return MAT.dark;
    return MAT.paint;
  }

  function bodyGeometry(THREE, m, st) {
    const xs = stationsFor(m, st);
    const pos = [];
    const meta = [];
    const sns = [];
    let ring = 0;
    for (const x of xs) {
      const sn = m.station(x);
      sns.push(sn);
      const h = m.half(sn);
      // closed ring: right side bottom-centre -> top, then the left side back down
      const pts = h.concat(h.slice(1, -1).reverse().map((p) => ({ ...p, z: -p.z })));
      ring = pts.length;
      for (const p of pts) { pos.push(x, p.y, p.z); meta.push(p); }
    }
    const byMat = [[], [], [], [], []];
    const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < ring; j++) {
        const a = i * ring + j;
        const b = i * ring + ((j + 1) % ring);
        const c = (i + 1) * ring + j;
        const d = (i + 1) * ring + ((j + 1) % ring);
        const pa = P(a); const pb = P(b); const pc = P(c); const pd = P(d);
        // face normal from the quad's diagonals (only its x part is needed)
        const e1 = [pd[0] - pa[0], pd[1] - pa[1], pd[2] - pa[2]];
        const e2 = [pb[0] - pc[0], pb[1] - pc[1], pb[2] - pc[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const nl = Math.hypot(...n) || 1;
        const ma = meta[a];
        const mb = meta[b];
        const f = {
          x: (pa[0] + pd[0]) / 2, y: (pa[1] + pb[1] + pc[1] + pd[1]) / 4, z: Math.abs(pa[2] + pb[2] + pc[2] + pd[2]) / 4,
          nx: n[0] / nl, part: ma.part === mb.part ? ma.part : 'side',
          s: ((ma.s || 0) + (mb.s || 0)) / 2, t: ((ma.t || 0) + (mb.t || 0)) / 2, q: ((ma.q || 0) + (mb.q || 0)) / 2,
          dark: [ma, mb, meta[c], meta[d]].filter((q) => q.dark).length >= 3,
          sn: m.station((pa[0] + pd[0]) / 2)
        };
        byMat[faceMaterial(st, m, f)].push(a, c, b, b, c, d);
      }
    }
    // Lean the tailgate forward (SUVs, wagons, vans): shear the upper rear of the body.
    if (st.rake) {
      const ys = m.station(m.L * 0.05).ys;
      const reach = m.L * 0.35;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i];
        if (x < reach) pos[i] = x + st.rake * Math.max(0, pos[i + 1] - ys) * (1 - x / reach) ** 2;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const idx = [];
    byMat.forEach((list, mi) => { if (list.length) { g.addGroup(idx.length, list.length, mi); idx.push(...list); } });
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // A flat rounded rectangle, w x h, facing +z.
  function roundRect(THREE, w, h, rad) {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + rad, y);
    s.lineTo(x + w - rad, y); s.quadraticCurveTo(x + w, y, x + w, y + rad);
    s.lineTo(x + w, y + h - rad); s.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    s.lineTo(x + rad, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rad);
    s.lineTo(x, y + rad); s.quadraticCurveTo(x, y, x + rad, y);
    return new THREE.ShapeGeometry(s, 6);
  }

  function materials(THREE, color) {
    return {
      paint: new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 }),
      trimPaint: new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x070a0d, metalness: 0.1, roughness: 0.05, clearcoat: 1, envMapIntensity: 0.9, side: THREE.DoubleSide }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.88 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 0.9, roughness: 0.26 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6, side: THREE.DoubleSide }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.12 }),
      brake: new THREE.MeshStandardMaterial({ color: 0x5a5a5a, metalness: 0.7, roughness: 0.5 }),
      headlight: new THREE.MeshPhysicalMaterial({ color: 0xc9d0d6, emissive: 0xfff3d6, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.08, clearcoat: 1 }),
      taillight: new THREE.MeshPhysicalMaterial({ color: 0x6a0808, emissive: 0xa00e0e, emissiveIntensity: 0.5, roughness: 0.12, clearcoat: 1 }),
      plate: new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5 })
    };
  }

  // Tire (rounded sidewalls), five-spoke rim, brake disc. Axis along z; `side` faces the rim outwards.
  function wheel(THREE, mats, r, width, side) {
    const g = new THREE.Group();
    const prof = [];
    const ri = r * 0.66;
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * Math.PI;
      prof.push(new THREE.Vector2(r - 0.045 + Math.cos(a) * 0.045, Math.sin(a) * (width / 2)));
    }
    const tire = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(ri, -width / 2 + 0.01), ...prof, new THREE.Vector2(ri, width / 2 - 0.01)].map((v) => v), 40), mats.rubber);
    tire.rotation.x = Math.PI / 2;
    g.add(tire);
    const face = side * (width / 2 - 0.02);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, width - 0.03, 32, 1, true), mats.dark);
    barrel.rotation.x = Math.PI / 2;
    g.add(barrel);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(ri - 0.008, 0.012, 8, 40), mats.rim);
    lip.position.z = face;
    g.add(lip);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(ri * 0.72, ri * 0.72, 0.025, 28), mats.brake);
    disc.rotation.x = Math.PI / 2;
    disc.position.z = face - side * 0.07;
    g.add(disc);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(ri * 0.88, ri * 0.2, 0.035), mats.rim);
      spoke.position.set(Math.cos(a) * ri * 0.48, Math.sin(a) * ri * 0.48, face - side * 0.015);
      spoke.rotation.z = a;
      g.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(ri * 0.24, ri * 0.24, 0.05, 20), mats.rim);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = face - side * 0.01;
    g.add(hub);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(ri * 0.1, ri * 0.1, 0.055, 16), mats.dark);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = face;
    g.add(cap);
    return g;
  }

  function buildBike(THREE, group, mats) {
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); group.add(m); return m; };
    const r = 0.32;
    for (const [x, w] of [[0.35, 0.16], [1.75, 0.12]]) {
      const wh = wheel(THREE, mats, r, w, 1);
      wh.position.set(x, r, 0);
      group.add(wh);
    }
    const tank = add(new THREE.SphereGeometry(0.3, 24, 16), mats.trimPaint, 1.15, 0.92, 0);
    tank.scale.set(1.3, 0.55, 0.6);
    const seat = add(new THREE.CapsuleGeometry(0.12, 0.45, 6, 16), mats.dark, 0.62, 0.9, 0);
    seat.rotation.z = Math.PI / 2 - 0.08;
    seat.scale.set(0.6, 1, 1.2);
    add(new THREE.BoxGeometry(0.62, 0.32, 0.3), mats.brake, 1.0, 0.56, 0); // engine
    const exhaust = add(new THREE.CylinderGeometry(0.045, 0.05, 0.9, 12), mats.chrome, 0.55, 0.42, 0.17);
    exhaust.rotation.z = Math.PI / 2 - 0.12;
    const fork = add(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 10), mats.chrome, 1.62, 0.7, 0);
    fork.rotation.z = 0.45;
    const bar = add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), mats.dark, 1.45, 1.12, 0);
    bar.rotation.x = Math.PI / 2;
    const fender = add(new THREE.SphereGeometry(0.34, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.trimPaint, 0.35, r + 0.02, 0);
    fender.scale.set(1, 0.6, 0.35);
    add(new THREE.SphereGeometry(0.08, 16, 12), mats.headlight, 1.62, 1.05, 0);
    add(new THREE.BoxGeometry(0.04, 0.05, 0.12), mats.taillight, 0.12, 0.8, 0);
    group.userData.size = { L: 2.1, W: 0.7, H: 1.2 };
  }

  // spec: {body, color, dims?: {L, W, H, wb}} -> THREE.Group centred on the origin, sitting on y = 0.
  function buildCar(spec) {
    const THREE = getTHREE();
    const mats = materials(THREE, spec.color || DEFAULT_COLOR);
    const group = new THREE.Group();
    if (spec.body === 'motorcycle') {
      buildBike(THREE, group, mats);
    } else {
      const st = STYLES[spec.body] || STYLES.sedan;
      const m = bodyModel(st, sizeFor(st, spec.dims));
      buildBody(THREE, group, mats, st, m);
      group.userData.size = { L: m.L, W: m.W, H: m.H };
    }
    const { L } = group.userData.size;
    group.children.forEach((c) => { c.position.x -= L / 2; });
    return group;
  }

  function buildBody(THREE, group, mats, st, m) {
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); group.add(o); return o; };
    const { L, W } = m;
    const u = (f) => f * L;
    const both = [1, -1];
    add(bodyGeometry(THREE, m, st), [mats.paint, mats.dark, mats.glass, mats.headlight, mats.taillight]);

    // underbody filler so the gap between the wheel wells is never see-through
    const sMid = m.station(L / 2);
    add(new THREE.BoxGeometry(L * 0.86, 0.08, W * 0.5), mats.dark, L / 2, sMid.yb + 0.05, 0);

    // pickup cab-back window
    if (typeof st.rearGlass === 'number') {
      const sc = m.station(u(st.rearGlass) + 0.15);
      const win = add(roundRect(THREE, W * 0.52, (sc.yt - sc.ys) * 0.45, 0.05), mats.glass, u(st.rearGlass) - 0.004, sc.ys + (sc.yt - sc.ys) * 0.55, 0);
      win.rotation.y = -Math.PI / 2;
    }

    // number plates
    const sNose = m.station(u(0.99));
    const sTail = m.station(u(0.01));
    const rp = add(roundRect(THREE, 0.31, 0.155, 0.015), mats.plate, -0.003, sTail.yb + 0.17, 0);
    rp.rotation.y = -Math.PI / 2;
    const fp = add(roundRect(THREE, 0.31, 0.155, 0.015), mats.plate, L + 0.003, sNose.yb + 0.11, 0);
    fp.rotation.y = Math.PI / 2;

    // side mirrors at the front of the side glass
    if (st.side || st.open) {
      const xm = u(st.side ? st.side[1] : st.recess.span[1]) - 0.2;
      const sm = m.station(xm);
      for (const side of both) {
        const mir = add(new THREE.SphereGeometry(1, 20, 12), mats.trimPaint, xm, sm.ys + 0.09, side * (sm.hs + 0.075));
        mir.scale.set(0.07, 0.055, 0.095);
        add(new THREE.BoxGeometry(0.06, 0.03, 0.09), mats.dark, xm + 0.01, sm.ys + 0.06, side * (sm.hs + 0.015)); // stalk
      }
    }

    // convertible: seats, steering wheel and a raked windshield in its frame
    if (st.open) {
      const [c0, c1] = st.recess.span;
      const sc = m.station(u((c0 + c1) / 2));
      const floor = sc.recess.floor;
      const seatX = u(c0) + u(c1 - c0) * 0.36;
      for (const side of both) {
        const z = side * sc.hs * 0.42;
        add(new THREE.BoxGeometry(0.46, 0.1, 0.44), mats.dark, seatX + 0.12, floor + 0.12, z); // cushion
        const back = add(new THREE.CapsuleGeometry(0.16, 0.3, 6, 16), mats.dark, seatX - 0.12, floor + 0.42, z);
        back.scale.set(0.45, 1, 1.15);
        back.rotation.z = 0.28;
      }
      const sw = add(new THREE.TorusGeometry(0.17, 0.018, 10, 32), mats.dark, u(c1) - 0.32, sc.yt + 0.06, sc.hs * 0.42);
      sw.rotation.y = Math.PI / 2;
      sw.rotation.x = 0.4;
      const sf = m.station(u(c1));
      const frame = new THREE.Group();
      frame.position.set(u(c1) + 0.02, sf.yt - 0.01, 0);
      frame.rotation.z = 0.95; // leans back
      group.add(frame);
      const fw = sf.hs * 1.86;
      for (const [w, h, mat, dx] of [[fw, 0.42, mats.dark, 0], [fw - 0.07, 0.36, mats.glass, 0.004]]) {
        const pane = new THREE.Mesh(roundRect(THREE, w, h, 0.07), mat);
        pane.rotation.y = Math.PI / 2; // width across the car, facing forward
        pane.position.set(dx, 0.21, 0);
        frame.add(pane);
      }
    }

    // ---- wheels ----
    const tw = clamp(W * 0.13, 0.2, 0.3);
    for (const x of m.wheels) {
      for (const side of both) {
        const zc = side * (m.halfW(x) - tw / 2 - 0.012);
        const wh = wheel(THREE, mats, m.r, tw, side);
        wh.position.set(x, m.r, zc);
        group.add(wh);
      }
    }
  }

  // Studio lighting baked into an environment map, so the paint and glass have something to reflect.
  function studioEnvironment(THREE, renderer) {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
    const cols = [];
    const p = room.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = clamp(p.getY(i) / 20, -1, 1);
      const c = t > 0 ? 0.35 + 0.35 * t : 0.08 + 0.2 * (1 + t);
      cols.push(c, c * 0.97, c * 0.92);
    }
    room.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(room);
    const panel = (w, h, x, y, z, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.95), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(14, 3, 0, 12, 0, 4);   // overhead softbox: the long highlight along the roof and hood
    panel(6, 6, 12, 5, 8, 2.2);
    panel(6, 6, -12, 4, -6, 1.4);
    panel(20, 1.2, 0, 2.5, -15, 1.6); // horizon strip: the classic line along the doors
    panel(20, 1.2, 0, 2.5, 15, 1.6);
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(env, 0.02);
    pm.dispose();
    return rt.texture;
  }

  // Interactive viewer: drag to spin, slow turntable otherwise. One canvas, moved between renders.
  function createViewer() {
    const THREE = getTHREE();
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return null; // no WebGL
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); // sharp enough, far less GPU work than 2-3x
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.className = 'car3d-canvas';

    const scene = new THREE.Scene();
    try { scene.environment = studioEnvironment(THREE, renderer); } catch { /* lights alone still work */ }
    const camera = new THREE.PerspectiveCamera(26, 2, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xfff6e5, 0x2a2824, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(4, 7, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc266, 1.0);
    rim.position.set(-6, 3, -4);
    scene.add(rim);

    // soft shadow under the car
    const sh = document.createElement('canvas');
    sh.width = sh.height = 128;
    const g = sh.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.7)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.003;
    scene.add(shadow);

    const pivot = new THREE.Group();
    scene.add(pivot);
    let car = null;
    let key3d = '';
    let yaw = -0.6;
    let pitch = 0.2;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let idleAt = 0;
    // Drawing is the expensive part, so frames are only drawn when something moves: every frame while
    // dragging, ~30 a second for the slow turntable, and none while the car is off-screen or the window
    // is hidden.
    const SPIN = 0.21; // turntable speed, radians per second
    const IDLE_FRAME = 1000 / 30;
    let scheduled = false;
    let onScreen = true;
    let dirty = true; // something changed that the next frame must show
    let lastDraw = 0;

    function dispose(obj) {
      obj.traverse((m) => { if (m.geometry) m.geometry.dispose(); [].concat(m.material || []).forEach((x) => x.dispose()); });
    }

    function setCar(spec) {
      const k = JSON.stringify([spec.body || '', spec.color || '', spec.dims || null]);
      if (k === key3d) return;
      key3d = k;
      if (car) { pivot.remove(car); dispose(car); }
      car = buildCar(spec);
      pivot.add(car);
      const { L, W, H } = car.userData.size;
      shadow.scale.set(L * 1.25, W * 1.6, 1);
      const dist = Math.max(L * 1.05, H * 2.4) * 1.5;
      camera.userData = { dist, target: new THREE.Vector3(0, H * 0.4, 0) };
    }

    function frame(now) {
      scheduled = false;
      if (!canvas.isConnected || !onScreen || document.hidden) { lastDraw = 0; return; } // wake() restarts
      const spinning = !dragging && now > idleAt;
      const elapsed = lastDraw ? now - lastDraw : IDLE_FRAME;
      if (dirty || dragging || (spinning && elapsed >= IDLE_FRAME)) {
        if (spinning) yaw += (SPIN * Math.min(elapsed, 100)) / 1000;
        draw();
        lastDraw = now;
        dirty = false;
      }
      wake();
    }

    function wake() {
      if (!scheduled) { scheduled = true; requestAnimationFrame(frame); }
    }
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver((entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (onScreen) { dirty = true; wake(); }
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { dirty = true; wake(); } });

    function draw() {
      const { dist, target } = camera.userData;
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
      camera.lookAt(target);
      renderer.render(scene, camera);
    }

    function resize() {
      const p = canvas.parentElement;
      if (!p) return;
      const w = p.clientWidth;
      const h = p.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * 0.01;
      pitch = Math.min(0.9, Math.max(0.02, pitch + (e.clientY - lastY) * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
      dirty = true;
    });
    const stop = () => { dragging = false; idleAt = performance.now() + 2500; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    return {
      // Put the canvas into `container` (re-created on every app render) and show `spec`.
      show(container, spec) {
        setCar(spec);
        if (canvas.parentElement !== container) {
          if (ro) ro.disconnect();
          container.appendChild(canvas);
          if (ro) ro.observe(container);
        }
        resize();
        dirty = true;
        wake();
      },
      // Hold a fixed angle (used for snapshots); dragging resumes the turntable.
      pose(y, p) { yaw = y; pitch = p; idleAt = Infinity; draw(); }
    };
  }

  return { BODY_TYPES, DEFAULT_COLOR, STYLES, bodyFromNhtsa, bodyLabel, sizeFor, buildCar, createViewer };
});
