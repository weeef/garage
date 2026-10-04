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
  //  cladding: unpainted plastic along the bottom; doors: where the door shut lines are
  //  darkRims / sporty: gunmetal wheels / red brake calipers
  const STYLES = {
    sedan: {
      L: 4.85, W: 1.84, H: 1.44, wb: 2.80, r: 0.335, fo: 0.46, tumble: 0.2,
      top: [[0, 0.6], [0.012, 0.67], [0.04, 0.695], [0.12, 0.705], [0.18, 0.72], [0.24, 0.84], [0.3, 0.955], [0.36, 0.995], [0.47, 1], [0.53, 0.965], [0.61, 0.84], [0.69, 0.705], [0.74, 0.67], [0.87, 0.635], [0.955, 0.595], [0.988, 0.54], [1, 0.42]],
      belt: [[0, 0.58], [0.04, 0.66], [0.22, 0.69], [0.69, 0.67], [0.95, 0.585], [1, 0.42]],
      bottom: [[0, 0.24], [0.02, 0.17], [0.085, 0.115], [0.92, 0.11], [0.975, 0.15], [1, 0.25]],
      ws: [0.53, 0.68], rw: [0.19, 0.33], side: [0.225, 0.675], pillars: [0.45], doors: [0.665, 0.45, 0.305]
    },
    coupe: {
      L: 4.65, W: 1.86, H: 1.36, wb: 2.70, r: 0.34, fo: 0.47, tumble: 0.24,
      top: [[0, 0.6], [0.012, 0.66], [0.04, 0.695], [0.14, 0.71], [0.2, 0.735], [0.3, 0.86], [0.4, 0.985], [0.47, 1], [0.54, 0.985], [0.62, 0.86], [0.705, 0.69], [0.75, 0.655], [0.87, 0.615], [0.955, 0.575], [0.988, 0.515], [1, 0.4]],
      belt: [[0, 0.5], [0.04, 0.66], [0.22, 0.7], [0.7, 0.655], [0.95, 0.565], [1, 0.41]],
      bottom: [[0, 0.33], [0.025, 0.2], [0.085, 0.105], [0.92, 0.1], [0.975, 0.15], [1, 0.26]],
      ws: [0.555, 0.695], rw: [0.2, 0.43], side: [0.26, 0.69], pillars: [], doors: [0.665, 0.37], sporty: true
    },
    hatchback: {
      L: 4.3, W: 1.79, H: 1.46, wb: 2.64, r: 0.32, fo: 0.58, tumble: 0.2,
      top: [[0, 0.6], [0.012, 0.66], [0.03, 0.7], [0.06, 0.8], [0.13, 0.95], [0.2, 0.995], [0.5, 1], [0.58, 0.94], [0.68, 0.72], [0.73, 0.675], [0.86, 0.635], [0.955, 0.595], [0.988, 0.535], [1, 0.42]],
      belt: [[0, 0.52], [0.04, 0.665], [0.2, 0.69], [0.68, 0.67], [0.95, 0.59], [1, 0.43]],
      bottom: [[0, 0.33], [0.025, 0.2], [0.085, 0.115], [0.92, 0.11], [0.975, 0.16], [1, 0.27]],
      ws: [0.55, 0.675], rw: [0.035, 0.16], side: [0.13, 0.67], pillars: [0.44], doors: [0.655, 0.44, 0.27]
    },
    wagon: {
      L: 4.85, W: 1.84, H: 1.5, wb: 2.80, r: 0.335, fo: 0.48, tumble: 0.2,
      top: [[0, 0.93], [0.03, 0.975], [0.08, 0.99], [0.55, 1], [0.62, 0.93], [0.705, 0.69], [0.75, 0.655], [0.87, 0.62], [0.955, 0.585], [0.988, 0.525], [1, 0.4]],
      belt: [[0, 0.64], [0.03, 0.655], [0.2, 0.675], [0.7, 0.655], [0.95, 0.575], [1, 0.41]],
      bottom: [[0, 0.24], [0.02, 0.2], [0.08, 0.115], [0.92, 0.11], [0.975, 0.16], [1, 0.27]],
      ws: [0.575, 0.695], side: [0.05, 0.69], pillars: [0.21, 0.47], doors: [0.67, 0.47, 0.29], rearGlass: 'tail', rake: 0.3
    },
    suv: {
      L: 4.75, W: 1.92, H: 1.73, wb: 2.80, r: 0.37, fo: 0.47, tumble: 0.16, dome: 7,
      top: [[0, 0.9], [0.04, 0.945], [0.13, 0.985], [0.5, 1], [0.6, 0.995], [0.66, 0.93], [0.74, 0.71], [0.78, 0.69], [0.9, 0.665], [0.965, 0.63], [0.99, 0.57], [1, 0.44]],
      belt: [[0, 0.64], [0.03, 0.66], [0.2, 0.685], [0.73, 0.655], [0.96, 0.6], [1, 0.45]],
      bottom: [[0, 0.26], [0.02, 0.22], [0.07, 0.14], [0.93, 0.135], [0.98, 0.19], [1, 0.3]],
      ws: [0.615, 0.73], side: [0.1, 0.725], pillars: [0.26, 0.5], doors: [0.7, 0.5, 0.3], rearGlass: 'tail', rake: 0.25, cladding: true, darkRims: true
    },
    van: {
      L: 5.15, W: 2.0, H: 1.78, wb: 3.03, r: 0.36, fo: 0.47, tumble: 0.12, dome: 7,
      top: [[0, 0.95], [0.04, 0.985], [0.1, 1], [0.66, 0.995], [0.72, 0.9], [0.8, 0.66], [0.85, 0.615], [0.95, 0.58], [0.988, 0.52], [1, 0.4]],
      belt: [[0, 0.59], [0.03, 0.6], [0.2, 0.615], [0.8, 0.615], [0.95, 0.56], [1, 0.41]],
      bottom: [[0, 0.24], [0.02, 0.2], [0.07, 0.11], [0.93, 0.105], [0.98, 0.15], [1, 0.26]],
      ws: [0.68, 0.79], side: [0.05, 0.79], pillars: [0.27, 0.55, 0.69], doors: [0.765, 0.69, 0.3], rearGlass: 'tail', rake: 0.15
    },
    pickup: {
      L: 5.85, W: 2.03, H: 1.93, wb: 3.6, r: 0.4, fo: 0.43, tumble: 0.1, dome: 8,
      top: [[0, 0.62], [0.006, 0.64], [0.02, 0.645], [0.368, 0.645], [0.372, 0.955], [0.39, 0.995], [0.6, 1], [0.64, 0.95], [0.705, 0.73], [0.735, 0.705], [0.9, 0.69], [0.975, 0.66], [0.993, 0.6], [1, 0.46]],
      belt: [[0, 0.6], [0.02, 0.635], [0.6, 0.64], [0.73, 0.69], [0.97, 0.655], [1, 0.47]],
      bottom: [[0, 0.26], [0.015, 0.17], [0.05, 0.135], [0.95, 0.13], [0.985, 0.18], [1, 0.3]],
      ws: [0.6, 0.72], side: [0.388, 0.72], pillars: [0.53], doors: [0.715, 0.53, 0.385, 0.37], rearGlass: 0.368, bigGrille: true, uprightTail: true, darkRims: true, recess: { span: [0.02, 0.366], depth: 0.52, rail: 0.06 }
    },
    convertible: {
      L: 4.4, W: 1.8, H: 1.25, wb: 2.5, r: 0.32, fo: 0.52, tumble: 0.2, open: true,
      top: [[0, 0.62], [0.012, 0.69], [0.04, 0.73], [0.6, 0.745], [0.64, 0.76], [0.68, 0.74], [0.73, 0.71], [0.86, 0.67], [0.955, 0.62], [0.988, 0.56], [1, 0.44]],
      belt: [[0, 0.52], [0.04, 0.71], [0.6, 0.73], [0.95, 0.6], [1, 0.44]],
      bottom: [[0, 0.34], [0.025, 0.21], [0.085, 0.11], [0.92, 0.105], [0.975, 0.16], [1, 0.28]],
      side: null, pillars: [], doors: [0.62, 0.36], sporty: true, recess: { span: [0.3, 0.62], depth: 0.36, rail: 0.1 }
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

  // ---------- body ----------
  // The cross-section below the shoulder line, as [z, h]: z the fraction of the half width, h from the
  // underside (0) to the shoulder (1). Flat underside, tucked-in rocker, near-vertical flanks with a faint
  // character line, then a tight shoulder. Rows at h = 0.1, 0.34, 0.48, 0.74, 0.9 and 0.95 are where
  // lights, grille and trim start and stop, so their edges follow the mesh.
  const LOWER = [[0, 0], [0.6, 0], [0.84, 0.008], [0.92, 0.04], [0.958, 0.1], [0.982, 0.2], [0.996, 0.34], [1, 0.48],
    [0.998, 0.62], [0.993, 0.74], [0.988, 0.8], [0.982, 0.85], [0.978, 0.9], [0.972, 0.95], [0.963, 0.985], [0.955, 1]];
  const SHOULDER = 0.955; // half width at the shoulder, as a fraction of the full half width
  const CAP_SCALES = [1, 0.86, 0.68, 0.44, 0.2, 0.001]; // rings that close the bumper faces
  const BOW = { front: 0.07, rear: 0.05 }; // how far the middle of each bumper bows out (m)

  // The body's shape as functions of position along the car.
  function bodyModel(st, size) {
    const { L, W, H, wb, r } = size;
    const top = curve(st.top);
    const belt = curve(st.belt);
    const bottom = curve(st.bottom);
    const xf = L - (L - wb) * st.fo; // front axle
    const wheels = [xf - wb, xf];
    const arch = r + 0.045;
    const well = Math.min(0.3, W * 0.17);
    const ends = [BOW.rear, L - BOW.front]; // where the flanks end and the bumper faces begin
    const radius = { front: Math.min(0.5, W * 0.24), rear: Math.min(0.42, W * 0.2) }; // plan-view corners

    // Plan view: a slight taper to the ends, and rounded corners into flat (gently bowed) bumper faces.
    const halfW = (x) => {
      let w = (W / 2) * (1 - 0.025 * ((x - L / 2) / (L / 2)) ** 2);
      const front = ends[1] - x < x - ends[0];
      const d = Math.max(0, front ? ends[1] - x : x - ends[0]);
      const R = front ? radius.front : radius.rear;
      if (d < R) w -= R - Math.sqrt(Math.max(0, R * R - (R - d) ** 2));
      return w;
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
      const xc = clamp(x, ends[0], ends[1]);
      const u = xc / L;
      const yt = top(u) * H;
      const ys = Math.min(belt(u) * H, yt - 0.025 * H);
      const yb = Math.min(bottom(u) * H, ys - 0.05);
      const hw = halfW(xc);
      const hs = hw * SHOULDER;
      const cabin = clamp((yt - ys) / (0.25 * H), 0, 1);
      const sn = { x: xc, yt, ys, yb, hw, hs, tumble: st.tumble * cabin, arch: Math.min(archTop(xc), ys - 0.05) };
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

    // One side of a cross-section, bottom centre to top centre: {z, y, part, h | s, dark}.
    const UP = 16;
    function half(sn) {
      const zw = sn.hw - Math.min(well, sn.hw * 0.5);
      const low = LOWER.map(([zf, h]) => [sn.hw * zf, h]);
      // two extra points either side of the wheel well's inner wall
      for (const zz of [Math.max(0.001, zw - 0.004), Math.min(sn.hw * 0.999, zw + 0.004)]) {
        let k = low.findIndex((p) => p[0] > zz);
        if (k < 1) k = k < 0 ? low.length - 1 : 1;
        const [a, b] = [low[k - 1], low[k]];
        const t = (zz - a[0]) / (b[0] - a[0] || 1);
        low.splice(k, 0, [zz, a[1] + (b[1] - a[1]) * t]);
      }
      const pts = low.map(([z, h]) => {
        const y = sn.yb + (sn.ys - sn.yb) * h;
        const inWell = sn.arch > y && z >= zw;
        const innerWall = sn.arch > y && z > zw - 0.006;
        return { z, y: inWell ? sn.arch : y, part: 'low', h, dark: inWell || innerWall || h < 0.005 };
      });
      for (let i = 1; i <= UP; i++) {
        const [z, y, dark] = upper(sn, i / UP);
        pts.push({ z, y, part: 'up', s: i / UP, dark });
      }
      return pts;
    }

    // Where a point on the flank is, for parts that sit on it (door handles, mirrors).
    function flankAt(x, h) {
      const sn = station(x);
      let k = LOWER.findIndex((p) => p[1] >= h);
      if (k < 1) k = 1;
      const [a, b] = [LOWER[k - 1], LOWER[k]];
      const zf = a[0] + (b[0] - a[0]) * ((h - a[1]) / (b[1] - a[1] || 1));
      return { z: sn.hw * zf, y: sn.yb + (sn.ys - sn.yb) * h, sn };
    }

    return { L, W, H, wb, r, wheels, arch, ends, station, upper, half, halfW, flankAt };
  }

  // Station positions between the bumper faces: dense at the corners, wheel arches, sharp profile
  // changes and the edges of glass, pillars, lights and door seams (so those edges run straight).
  function stationsFor(m, st) {
    const L = m.L;
    const [x0, x1] = m.ends;
    const xs = [];
    for (let i = 0; i <= 200; i++) xs.push(x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos((Math.PI * i) / 200)));
    for (let d = 0; d <= 0.5; d += 0.02) xs.push(x0 + d, x1 - d); // rounded corners
    for (const wx of m.wheels) for (let i = -12; i <= 12; i++) xs.push(wx + (m.arch * 1.02 * i) / 12);
    for (const [u] of st.top) for (const e of [-0.004, 0, 0.004]) xs.push((u + e) * L);
    const edges = [...(st.ws || []), ...(st.rw || []), ...(st.side || []), ...(st.recess ? st.recess.span : [])];
    for (const p of st.pillars || []) edges.push(p - PILLAR / L / 2, p + PILLAR / L / 2);
    for (const u of edges) xs.push(u * L, u * L - 0.003, u * L + 0.003);
    for (const u of st.doors || []) xs.push(u * L - SEAM, u * L + SEAM);
    xs.push(L - 0.3 * lightScale(m), 0.26 * lightScale(m), 0.16);
    const out = [...new Set(xs.map((x) => Math.round(clamp(x, x0, x1) * 1e4) / 1e4))].sort((a, b) => a - b);
    return out.filter((x, i) => i === 0 || x - out[i - 1] > 0.0015);
  }

  const PILLAR = 0.075; // door pillar width (m)
  const SEAM = 0.0035; // half the width of a door shut line (m)
  const ROOF_EDGE = 0.8; // fraction of the greenhouse height where the roof starts to round over
  const TH0 = new Proxy({}, { get: (c, n) => (n in c ? c[n] : (c[n] = Math.asin(ROOF_EDGE ** (Number(n) / 2)))) });
  const MAT = { paint: 0, dark: 1, glass: 2, lens: 3, drl: 4, tailLens: 5, tailBar: 6, trim: 7, grille: 8 };
  const lightScale = (m) => clamp(m.H / 1.45, 0.85, 1.4);

  // Which material a face of the body gets: glass, lights, grille, trim and door seams are regions of
  // the one surface, so nothing floats. Regions follow the mesh's own rows (h: below the shoulder,
  // s: greenhouse) and stations, so their edges come out as clean curves.
  function faceMaterial(st, m, f) {
    if (f.dark) return MAT.dark;
    const { L } = m;
    const u = f.x / L;
    const hw = f.hw; // 1 along the flanks, falling towards 0 across the bumper faces
    const k = lightScale(m);
    const within = (r) => r && u >= r[0] && u <= r[1];
    const h = f.part === 'low' ? f.h : -1;
    const s = f.part === 'up' && !f.sn.recess ? f.s : -1;
    const pillar = (st.pillars || []).some((p) => Math.abs(f.x - p * L) < PILLAR / 2);
    if (s > 0) {
      if (s > 9 / 16 && (within(st.ws) || within(st.rw))) return MAT.glass;
      if (st.side && within(st.side)) {
        if (s < 1 / 16 || (s > 7 / 16 && s < 8 / 16)) return MAT.trim; // window surround
        if (s < 7.5 / 16) return pillar ? MAT.trim : MAT.glass; // blacked-out door pillars
      }
      if (st.rearGlass === 'tail' && f.cap === 'rear' && hw < 0.8 && s > 1 / 16 && s < 8.5 / 16) return MAT.glass;
    }
    const nose = f.cap === 'front' || f.x > L - 0.12;
    const tail = f.cap === 'rear' || f.x < 0.1;
    // headlights wrap round the front corners: a smoked lens under an LED running-light strip
    if (h > 0.74 && h <= 0.95 && f.x > L - 0.3 * k && hw > 0.42) return h > 0.9 ? MAT.drl : MAT.lens;
    // grille between them, and a lower intake
    if (nose && hw <= 0.4 && h > (st.bigGrille ? 0.34 : 0.48) && h <= (st.bigGrille ? 0.95 : 0.74)) return MAT.grille;
    if (nose && hw < 0.55 && h > 0.1 && h <= 0.34) return MAT.grille;
    // tail lights: upright beside the tailgate, or across the corners with a light bar
    if (st.rearGlass === 'tail' || st.uprightTail) {
      if (f.x < 0.16 && hw > 0.62 && ((h > 0.62) || (s >= 0 && s < 0.3))) return h > 0.8 && h <= 0.85 ? MAT.tailBar : MAT.tailLens;
    } else if (h > 0.74 && h <= 0.95) {
      if (f.x < 0.26 * k && hw > 0.4) return h > 0.9 ? MAT.tailBar : MAT.tailLens;
      if (f.cap === 'rear' && h > 0.9) return MAT.tailBar; // full-width light bar
    }
    if (tail && hw < 0.7 && h > 0.04 && h <= 0.2) return MAT.dark; // rear diffuser
    if (st.cladding && h >= 0 && h <= 0.2) return MAT.dark;
    // door shut lines, from the rocker to the shoulder
    if (h > 0.1 && h < 0.99 && (st.doors || []).some((d) => Math.abs(f.x - d * L) < SEAM)) return MAT.dark;
    return MAT.paint;
  }

  // Normals that stay smooth across gentle curves but break at edges sharper than `angle`, so shoulder
  // lines, bumper corners and window edges catch the light like real panels. Returns a non-indexed
  // geometry with one group per material.
  function creasedGeometry(THREE, pos, uv, byMat, angle) {
    const cos = Math.cos((angle * Math.PI) / 180);
    const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const tris = [];
    byMat.forEach((list, mi) => { for (let i = 0; i < list.length; i += 3) tris.push([list[i], list[i + 1], list[i + 2], mi]); });
    // area-weighted face normals, and the faces around each vertex
    const fn = tris.map(([a, b, c]) => {
      const [pa, pb, pc] = [P(a), P(b), P(c)];
      const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    });
    const unit = fn.map((n) => { const l = Math.hypot(...n) || 1; return [n[0] / l, n[1] / l, n[2] / l]; });
    const around = new Map();
    tris.forEach((t, fi) => { for (let k = 0; k < 3; k++) { const v = t[k]; if (!around.has(v)) around.set(v, []); around.get(v).push(fi); } });
    // The faces round a vertex fall into smoothing groups (faces within `angle` of the group's first
    // face); every face in a group gets the same normal there, so smooth areas stay seamless.
    const groupsAt = new Map();
    function cornerNormal(v, fi) {
      if (!groupsAt.has(v)) {
        const groups = [];
        for (const fj of around.get(v)) {
          const uj = unit[fj];
          let gr = groups.find((q) => q.seed[0] * uj[0] + q.seed[1] * uj[1] + q.seed[2] * uj[2] >= cos);
          if (!gr) { gr = { seed: uj, n: [0, 0, 0], faces: new Set() }; groups.push(gr); }
          gr.n[0] += fn[fj][0]; gr.n[1] += fn[fj][1]; gr.n[2] += fn[fj][2];
          gr.faces.add(fj);
        }
        groupsAt.set(v, groups);
      }
      return groupsAt.get(v).find((q) => q.faces.has(fi)).n;
    }
    const outPos = [];
    const outNorm = [];
    const outUv = [];
    const g = new THREE.BufferGeometry();
    let start = 0;
    let count = 0;
    let curMat = tris.length ? tris[0][3] : 0;
    tris.forEach((t, fi) => {
      if (t[3] !== curMat) { g.addGroup(start, count, curMat); start += count; count = 0; curMat = t[3]; }
      for (let k = 0; k < 3; k++) {
        const v = t[k];
        const n = cornerNormal(v, fi);
        const l = Math.hypot(...n) || 1;
        outPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        outNorm.push(n[0] / l, n[1] / l, n[2] / l);
        outUv.push(uv[v * 2], uv[v * 2 + 1]);
      }
      count += 3;
    });
    if (count) g.addGroup(start, count, curMat);
    g.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(outNorm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
    return g;
  }

  function bodyGeometry(THREE, m, st) {
    // rings along the car: the rear bumper face (outside in), the stations, then the front bumper face
    const rings = [];
    const [x0, x1] = m.ends;
    const capRing = (x, end, scale, bow) => ({ x: x + bow * (1 - scale * scale), sn: m.station(x), scale, cap: end });
    for (const sc of [...CAP_SCALES].reverse()) rings.push(capRing(x0, 'rear', sc, -BOW.rear));
    for (const x of stationsFor(m, st)) if (x > x0 && x < x1) rings.push({ x, sn: m.station(x), scale: 1 });
    for (const sc of CAP_SCALES) rings.push(capRing(x1, 'front', sc, BOW.front));

    const pos = [];
    const uv = [];
    const meta = [];
    let ring = 0;
    for (const rg of rings) {
      const h = m.half(rg.sn);
      // closed ring: right side bottom-centre -> top, then the left side back down
      const pts = h.concat(h.slice(1, -1).reverse().map((p) => ({ ...p, z: -p.z })));
      ring = pts.length;
      for (const p of pts) {
        const z = p.z * rg.scale;
        pos.push(rg.x, p.y, z);
        uv.push(z / 0.12, p.y / 0.12); // grille pattern, mapped across the bumper face
        meta.push({ ...p, hw: (rg.sn.hw * rg.scale) / (m.W / 2), cap: rg.cap });
      }
    }
    const byMat = Object.values(MAT).map(() => []);
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < ring; j++) {
        const a = i * ring + j;
        const b = i * ring + ((j + 1) % ring);
        const c = (i + 1) * ring + j;
        const d = (i + 1) * ring + ((j + 1) % ring);
        const [ma, mb, mc, md] = [meta[a], meta[b], meta[c], meta[d]];
        const x = (pos[a * 3] + pos[d * 3]) / 2;
        const f = {
          x, part: ma.part === mb.part ? ma.part : 'low',
          h: ((ma.h || 0) + (mb.h || 0)) / 2, s: ((ma.s || 0) + (mb.s || 0)) / 2,
          hw: (ma.hw + mc.hw) / 2, cap: ma.cap && ma.cap === mc.cap ? ma.cap : undefined, // on a bumper face
          dark: [ma, mb, mc, md].filter((q) => q.dark).length >= 3,
          sn: rings[i].sn
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
        if (x < reach) pos[i] = x + st.rake * Math.max(0, pos[i + 1] - ys) * Math.max(0, 1 - x / reach) ** 2;
      }
    }
    return creasedGeometry(THREE, pos, uv, byMat, 32);
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
    const g = new THREE.ShapeGeometry(s, 6);
    // UVs across the rectangle, for printed textures (number plates)
    const p = g.attributes.position;
    const uvs = [];
    for (let i = 0; i < p.count; i++) uvs.push((p.getX(i) - x) / w, (p.getY(i) - y) / h);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return g;
  }

  // Small canvas textures: the grille mesh and the number plate.
  function canvasTexture(THREE, w, h, draw) {
    if (typeof document === 'undefined') return null; // tests in Node
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function materials(THREE, color) {
    const grilleMap = canvasTexture(THREE, 64, 64, (g, w, h) => {
      g.fillStyle = '#121314';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2b2d30';
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * 16 + (y % 2 ? 8 : 0) + 4;
        g.beginPath();
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.lineTo(cx + Math.cos(a) * 5.5, y * 16 + 8 + Math.sin(a) * 5.5); }
        g.fill();
      }
    });
    if (grilleMap) { grilleMap.wrapS = grilleMap.wrapT = THREE.RepeatWrapping; }
    const plateMap = canvasTexture(THREE, 256, 128, (g, w, h) => {
      g.fillStyle = '#f2f1ec';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#30343a';
      g.lineWidth = 6;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#1f3c78';
      g.font = 'bold 52px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('GRG·LOG', w / 2, h / 2 + 4);
    });
    const paint = { color, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 };
    return {
      paint: new THREE.MeshPhysicalMaterial(paint),
      trimPaint: new THREE.MeshPhysicalMaterial(paint),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x070a0e, metalness: 0, roughness: 0.03, clearcoat: 1, envMapIntensity: 0.7, side: THREE.DoubleSide }),
      trim: new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92 }),
      sidewall: new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.7 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.95, roughness: 0.22 }),
      rimDark: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.85, roughness: 0.3 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.65, side: THREE.DoubleSide }),
      grille: new THREE.MeshStandardMaterial({ color: 0xffffff, map: grilleMap, metalness: 0.3, roughness: 0.45 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 1, roughness: 0.08 }),
      brake: new THREE.MeshStandardMaterial({ color: 0x6b6d70, metalness: 0.8, roughness: 0.38 }),
      caliper: new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.3, roughness: 0.4 }),
      caliperRed: new THREE.MeshStandardMaterial({ color: 0xb3121a, metalness: 0.2, roughness: 0.35 }),
      lens: new THREE.MeshPhysicalMaterial({ color: 0x23272d, metalness: 0.85, roughness: 0.12, clearcoat: 1, envMapIntensity: 1.6 }),
      drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2 }),
      tailLens: new THREE.MeshPhysicalMaterial({ color: 0x4a0507, emissive: 0x3a0002, emissiveIntensity: 0.6, roughness: 0.1, clearcoat: 1 }),
      tailBar: new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 1.8 }),
      headlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 1.2 }),
      taillight: new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 1.2 }),
      plate: new THREE.MeshStandardMaterial({ color: 0xffffff, map: plateMap, roughness: 0.5 })
    };
  }

  // Tire with rounded sidewalls, a five-double-spoke rim with lug nuts, brake disc and caliper.
  // Axis along z; `side` faces the rim outwards. opts: {dark: dark rims, sporty: red calipers}.
  function wheel(THREE, mats, r, width, side, opts = {}) {
    const g = new THREE.Group();
    const ri = r * 0.68; // rim radius
    const add = (geo, mat, z, rotX = Math.PI / 2) => { const o = new THREE.Mesh(geo, mat); o.rotation.x = rotX; o.position.z = z; g.add(o); return o; };
    // tire: bead, bulging sidewall, rounded shoulder, flat tread (lathe profile, radius vs axial offset)
    const hw = width / 2;
    const prof = [[ri - 0.005, -hw * 0.86], [ri + 0.03, -hw * 0.98], [r - 0.06, -hw], [r - 0.02, -hw * 0.94], [r - 0.004, -hw * 0.8], [r, -hw * 0.6],
      [r, hw * 0.6], [r - 0.004, hw * 0.8], [r - 0.02, hw * 0.94], [r - 0.06, hw], [ri + 0.03, hw * 0.98], [ri - 0.005, hw * 0.86]];
    add(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 48), mats.rubber, 0);
    const face = side * (hw - 0.03);
    const rimMat = opts.dark ? mats.rimDark : mats.rim;
    add(new THREE.CylinderGeometry(ri, ri, width - 0.05, 40, 1, true), mats.dark, 0); // barrel
    const lip = add(new THREE.TorusGeometry(ri - 0.006, 0.011, 8, 48), rimMat, face, 0);
    lip.scale.z = 1.4;
    // brake disc and caliper, visible through the spokes
    add(new THREE.CylinderGeometry(ri * 0.82, ri * 0.82, 0.026, 36), mats.brake, face - side * 0.075);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.075, ri * 0.42, 0.06), opts.sporty ? mats.caliperRed : mats.caliper);
    cal.position.set(-ri * 0.58, ri * 0.42, face - side * 0.06);
    cal.rotation.z = -0.6;
    g.add(cal);
    // five double spokes, dished towards the hub
    for (let k = 0; k < 5; k++) {
      for (const off of [-0.11, 0.11]) {
        const a = (k / 5) * Math.PI * 2 + off;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(ri * 0.8, ri * 0.085, 0.028), rimMat);
        spoke.position.set(Math.cos(a) * ri * 0.52, Math.sin(a) * ri * 0.52, face - side * 0.022);
        spoke.rotation.order = 'ZYX'; // point it outwards, then dish it so the hub sits deeper
        spoke.rotation.set(0, -side * 0.14, a);
        g.add(spoke);
      }
    }
    add(new THREE.CylinderGeometry(ri * 0.26, ri * 0.28, 0.045, 28), rimMat, face - side * 0.035); // hub
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
      const nut = add(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10), mats.chrome, face - side * 0.01);
      nut.position.x = Math.cos(a) * ri * 0.17;
      nut.position.y = Math.sin(a) * ri * 0.17;
    }
    add(new THREE.CylinderGeometry(ri * 0.09, ri * 0.09, 0.02, 20), mats.trim, face - side * 0.005); // centre cap
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
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return group;
  }

  function buildBody(THREE, group, mats, st, m) {
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); group.add(o); return o; };
    const { L, W } = m;
    const u = (f) => f * L;
    const both = [1, -1];
    const byIndex = [];
    byIndex[MAT.paint] = mats.paint; byIndex[MAT.dark] = mats.dark; byIndex[MAT.glass] = mats.glass; byIndex[MAT.lens] = mats.lens;
    byIndex[MAT.drl] = mats.drl; byIndex[MAT.tailLens] = mats.tailLens; byIndex[MAT.tailBar] = mats.tailBar; byIndex[MAT.trim] = mats.trim;
    byIndex[MAT.grille] = mats.grille;
    add(bodyGeometry(THREE, m, st), byIndex);

    // underbody filler so the gap between the wheel wells is never see-through
    const sMid = m.station(L / 2);
    add(new THREE.BoxGeometry(L * 0.86, 0.08, W * 0.5), mats.dark, L / 2, sMid.yb + 0.05, 0);

    // pickup cab-back window
    if (typeof st.rearGlass === 'number') {
      const sc = m.station(u(st.rearGlass) + 0.15);
      const win = add(roundRect(THREE, W * 0.52, (sc.yt - sc.ys) * 0.45, 0.05), mats.glass, u(st.rearGlass) - 0.004, sc.ys + (sc.yt - sc.ys) * 0.55, 0);
      win.rotation.y = -Math.PI / 2;
    }

    // number plates, on the bumper faces
    const [x0, x1] = m.ends;
    const sF = m.station(x1);
    const sR = m.station(x0);
    const fp = add(roundRect(THREE, 0.31, 0.155, 0.015), mats.plate, x1 + BOW.front + 0.004, sF.yb + (sF.ys - sF.yb) * 0.24, 0);
    fp.rotation.y = Math.PI / 2;
    const rp = add(roundRect(THREE, 0.31, 0.155, 0.015), mats.plate, x0 - BOW.rear - 0.004, sR.yb + (sR.ys - sR.yb) * 0.5, 0);
    rp.rotation.y = -Math.PI / 2;

    // door handles, a little ahead of each door's rear edge
    const doors = [...(st.doors || [])].sort((a, b) => b - a);
    for (let i = 0; i + 1 < doors.length; i++) {
      if (st.recess && doors[i + 1] * L <= st.recess.span[1] * L + 0.02) break; // not on the bed
      const x = doors[i + 1] * L + 0.16;
      const p = m.flankAt(x, 0.87);
      for (const side of both) {
        const hd = add(new THREE.CapsuleGeometry(0.014, 0.13, 4, 10), mats.chrome, x, p.y, side * (p.z + 0.008));
        hd.rotation.z = Math.PI / 2;
        hd.scale.set(1, 1, 0.55);
      }
    }

    // side mirrors at the front of the side glass: a body-colored housing on a black base
    if (st.side || st.open) {
      const xm = u(st.side ? st.side[1] : st.recess.span[1]) - 0.2;
      const sm = m.station(xm);
      for (const side of both) {
        const z = side * (sm.hs + 0.075);
        const housing = add(new THREE.SphereGeometry(1, 24, 14), mats.trimPaint, xm, sm.ys + 0.1, z);
        housing.scale.set(0.075, 0.06, 0.09);
        const glassFace = add(new THREE.CircleGeometry(1, 20), mats.glass, xm - 0.072, sm.ys + 0.1, z);
        glassFace.scale.set(0.05, 0.042, 1);
        glassFace.rotation.y = -Math.PI / 2;
        add(new THREE.BoxGeometry(0.09, 0.035, 0.1), mats.trim, xm + 0.01, sm.ys + 0.05, side * (sm.hs + 0.03)); // base
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
      for (const [w, h, mat, dx] of [[fw, 0.42, mats.trim, 0], [fw - 0.07, 0.36, mats.glass, 0.004]]) {
        const pane = new THREE.Mesh(roundRect(THREE, w, h, 0.07), mat);
        pane.rotation.y = Math.PI / 2; // width across the car, facing forward
        pane.position.set(dx, 0.21, 0);
        frame.add(pane);
      }
    }

    // ---- wheels: flush with the body ----
    const tw = clamp(W * 0.13, 0.215, 0.29);
    for (const x of m.wheels) {
      for (const side of both) {
        const zc = side * (m.halfW(x) - tw / 2 - 0.006);
        const wh = wheel(THREE, mats, m.r, tw, side, { dark: st.darkRims, sporty: st.sporty });
        wh.position.set(x, m.r, zc);
        group.add(wh);
      }
    }
  }

  // Studio lighting baked into an environment map: a dark room with a big overhead softbox, long
  // horizon strips and a key softbox, so clearcoat and glass pick up crisp, realistic reflections.
  function studioEnvironment(THREE, renderer) {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
    const cols = [];
    const p = room.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = clamp(p.getY(i) / 20, -1, 1);
      const c = t > 0 ? 0.1 + 0.12 * t : 0.025 + 0.05 * (1 + t); // dim walls, dark floor
      cols.push(c, c * 0.98, c * 0.95);
    }
    room.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(room);
    const panel = (w, h, x, y, z, k, warm = 1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * (0.97 + 0.03 * warm), k * (0.9 + 0.1 * warm)), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(16, 5, 0, 13, 0, 6);            // overhead softbox: the long highlight along roof and hood
    panel(26, 0.9, 0, 2.2, -16, 3.2);      // horizon strips: the classic reflection line along the doors
    panel(26, 0.9, 0, 2.2, 16, 3.2);
    panel(7, 9, 13, 6, 9, 3.5);            // key softbox, front right
    panel(5, 7, -13, 5, -8, 1.6, 0.5);     // warm fill, back left
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(env, 0.015);
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
    renderer.toneMappingExposure = 1.0;
    const canvas = renderer.domElement;
    canvas.className = 'car3d-canvas';

    const scene = new THREE.Scene();
    try { scene.environment = studioEnvironment(THREE, renderer); } catch { /* lights alone still work */ }
    const camera = new THREE.PerspectiveCamera(26, 2, 0.1, 100);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // the car and lights don't move, only the camera
    scene.add(new THREE.HemisphereLight(0xfff6e5, 0x2a2824, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 9, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 6;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc266, 0.8);
    rim.position.set(-6, 3, -4);
    scene.add(rim);

    // the cast shadow on an invisible floor, plus a dark contact shadow right under the car
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.42 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const sh = document.createElement('canvas');
    sh.width = sh.height = 128;
    const g = sh.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
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
      shadow.scale.set(L * 1.08, W * 1.3, 1);
      renderer.shadowMap.needsUpdate = true;
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
