// Stylized 3D car for the dashboard, shaped by body type (from the VIN decode) and painted the
// vehicle's color. Uses three.js (lib/vendor/three.min.js, loaded first as a classic script).
// The body-type mapping is plain JS so it can be tested in Node; attaches to window.GarageCar3D.
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

  // Side-profile measurements in metres. x runs rear (0) to front (L).
  //  bottom/belt/roof: heights of the sill, beltline and roof; front/rear: bumper-top heights
  //  ws: windshield base and top x; rw: rear window base and top x; wx: wheel centre x; r: wheel radius
  const SHAPES = {
    sedan:       { L: 4.8, W: 1.84, bottom: 0.30, belt: 0.95, roof: 1.44, front: 0.74, rear: 0.92, ws: [3.30, 2.55], rw: [1.05, 1.70], wx: [0.95, 3.75], r: 0.33 },
    coupe:       { L: 4.6, W: 1.86, bottom: 0.28, belt: 0.90, roof: 1.32, front: 0.68, rear: 0.86, ws: [3.20, 2.35], rw: [0.70, 1.75], wx: [0.90, 3.60], r: 0.34 },
    hatchback:   { L: 4.2, W: 1.78, bottom: 0.30, belt: 0.96, roof: 1.47, front: 0.74, rear: 0.94, ws: [3.00, 2.30], rw: [0.12, 0.55], wx: [0.75, 3.30], r: 0.32 },
    wagon:       { L: 4.85, W: 1.84, bottom: 0.30, belt: 0.96, roof: 1.48, front: 0.74, rear: 0.95, ws: [3.35, 2.60], rw: [0.10, 0.30], wx: [0.95, 3.80], r: 0.33 },
    suv:         { L: 4.8, W: 1.95, bottom: 0.45, belt: 1.18, roof: 1.76, front: 1.00, rear: 1.12, ws: [3.30, 2.60], rw: [0.10, 0.28], wx: [0.95, 3.80], r: 0.39 },
    van:         { L: 5.1, W: 2.00, bottom: 0.40, belt: 1.12, roof: 1.98, front: 0.95, rear: 1.10, ws: [4.15, 3.45], rw: [0.04, 0.08], wx: [1.00, 4.05], r: 0.36 },
    pickup:      { L: 5.6, W: 2.00, bottom: 0.52, belt: 1.25, roof: 1.92, front: 1.12, rear: 1.22, ws: [3.90, 3.20], rw: [1.95, 2.02], wx: [1.05, 4.45], r: 0.42, bed: [0.12, 1.88] },
    convertible: { L: 4.5, W: 1.84, bottom: 0.28, belt: 0.88, roof: 1.22, front: 0.68, rear: 0.86, ws: [3.10, 2.55], rw: [1.10, 1.10], wx: [0.88, 3.55], r: 0.33, open: true }
  };

  function carGeometry(THREE, s) {
    // Lower body outline, counter-clockwise, with arches cut around both wheels.
    const pts = [[0.10, s.bottom]];
    const R = s.r + 0.07;
    for (const wx of s.wx) {
      pts.push([wx - R, s.bottom]);
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI - (Math.PI * i) / 12;
        pts.push([wx + R * Math.cos(a), Math.max(s.bottom, s.r + R * Math.sin(a) * 0.95)]);
      }
      pts.push([wx + R, s.bottom]);
    }
    pts.push(
      [s.L - 0.10, s.bottom], [s.L, s.bottom + 0.18], [s.L + 0.02, s.front - 0.08], [s.L - 0.15, s.front],
      [s.ws[0] + 0.45, s.belt - 0.05], [s.ws[0], s.belt], [s.rw[0], s.belt + 0.02],
      [0.12, s.rear], [0.0, s.rear - 0.12], [0.0, s.bottom + 0.16]
    );
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const bevel = { bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 4, curveSegments: 6 };
    const body = new THREE.ExtrudeGeometry(shape, { depth: s.W - 0.14, ...bevel });
    body.translate(0, 0, -(s.W - 0.14) / 2);

    // Greenhouse: windshield up to the roof, back down the rear window.
    let cabin = null;
    if (!s.open) {
      const c = new THREE.Shape([
        new THREE.Vector2(s.rw[0], s.belt - 0.04), new THREE.Vector2(s.ws[0], s.belt - 0.04),
        new THREE.Vector2(s.ws[1], s.roof), new THREE.Vector2(s.rw[1], s.roof)
      ]);
      const cw = s.W * 0.82;
      cabin = new THREE.ExtrudeGeometry(c, { depth: cw, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 });
      cabin.translate(0, 0, -cw / 2);
    }
    return { body, cabin };
  }

  function buildCar(spec) {
    const THREE = getTHREE();
    const body = SHAPES[spec.body] ? spec.body : spec.body === 'motorcycle' ? 'motorcycle' : 'sedan';
    const paint = new THREE.MeshPhysicalMaterial({ color: spec.color || DEFAULT_COLOR, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x1b2833, metalness: 0.6, roughness: 0.08, clearcoat: 1 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.85, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 });
    const headlight = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff1c9, emissiveIntensity: 0.6 });
    const taillight = new THREE.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0xc01818, emissiveIntensity: 0.5 });
    const group = new THREE.Group();
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); group.add(m); return m; };

    function wheel(x, z, r, width) {
      const tire = add(new THREE.CylinderGeometry(r, r, width, 28), rubber, x, r, z);
      tire.rotation.x = Math.PI / 2;
      const rim = add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.02, 20), rimMat, x, r, z);
      rim.rotation.x = Math.PI / 2;
      const hub = add(new THREE.CylinderGeometry(r * 0.16, r * 0.16, width + 0.05, 10), dark, x, r, z);
      hub.rotation.x = Math.PI / 2;
    }

    if (body === 'motorcycle') {
      const r = 0.32;
      wheel(0.35, 0, r, 0.14);
      wheel(1.75, 0, r, 0.12);
      add(new THREE.BoxGeometry(0.75, 0.28, 0.32), paint, 1.15, 0.86, 0); // tank
      add(new THREE.BoxGeometry(0.7, 0.12, 0.3), dark, 0.62, 0.86, 0); // seat
      add(new THREE.BoxGeometry(0.8, 0.22, 0.24), dark, 0.95, 0.56, 0); // engine
      const fork = add(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8), rimMat, 1.62, 0.7, 0);
      fork.rotation.z = 0.45;
      const bar = add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), dark, 1.45, 1.1, 0);
      bar.rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.3, 0.06, 0.2), paint, 0.25, 0.68, 0); // rear fender
      add(new THREE.SphereGeometry(0.08, 12, 8), headlight, 1.62, 1.05, 0);
      add(new THREE.BoxGeometry(0.04, 0.05, 0.12), taillight, 0.12, 0.74, 0);
      group.userData.size = { L: 2.1, W: 0.7, H: 1.2 };
    } else {
      const s = SHAPES[body];
      const geo = carGeometry(THREE, s);
      add(geo.body, paint);
      if (geo.cabin) {
        add(geo.cabin, paint);
        const cw = s.W * 0.82;
        const yb = s.belt - 0.04;
        // Windshield and rear window: thin glass slabs lying on the cabin's slanted faces.
        const slab = (x0, x1, front) => {
          const dx = x1 - x0;
          const dy = s.roof - yb;
          const len = Math.hypot(dx, dy);
          const n = front ? [dy / len, -dx / len] : [-dy / len, dx / len];
          const m = add(new THREE.BoxGeometry(len - 0.12, 0.012, cw * 0.9), glass,
            (x0 + x1) / 2 + n[0] * 0.055, (yb + s.roof) / 2 + n[1] * 0.055, 0);
          m.rotation.z = Math.atan2(dy, dx);
        };
        slab(s.ws[0], s.ws[1], true);
        if (s.rw[1] - s.rw[0] > 0.02) slab(s.rw[0], s.rw[1], false);
        else add(new THREE.BoxGeometry(0.012, (s.roof - yb) * 0.7, cw * 0.8), glass, s.rw[0] - 0.055, yb + (s.roof - yb) * 0.55, 0);
        // Side windows, inset from the cabin outline, with a door pillar on four-door bodies.
        const t = (x0, x1, y) => x0 + (x1 - x0) * (y - yb) / (s.roof - yb);
        const y0 = s.belt + 0.05;
        const y1 = s.roof - 0.07;
        const win = new THREE.Shape([
          new THREE.Vector2(t(s.rw[0], s.rw[1], y0) + 0.1, y0), new THREE.Vector2(t(s.ws[0], s.ws[1], y0) - 0.1, y0),
          new THREE.Vector2(t(s.ws[0], s.ws[1], y1) - 0.1, y1), new THREE.Vector2(t(s.rw[0], s.rw[1], y1) + 0.1, y1)
        ]);
        const glassSide = glass.clone();
        glassSide.side = THREE.DoubleSide;
        const midX = (t(s.rw[0], s.rw[1], y0) + t(s.ws[0], s.ws[1], y0)) / 2 + 0.1;
        for (const side of [1, -1]) {
          add(new THREE.ShapeGeometry(win), glassSide, 0, 0, side * (cw / 2 + 0.056));
          if (body !== 'coupe') add(new THREE.BoxGeometry(0.08, y1 - y0 + 0.02, 0.01), paint, midX, (y0 + y1) / 2, side * (cw / 2 + 0.062));
        }
      } else {
        const frame = add(new THREE.BoxGeometry(0.06, s.roof - s.belt, s.W * 0.8), glass, s.ws[1] + 0.2, (s.roof + s.belt) / 2, 0);
        frame.rotation.z = 0.5;
        add(new THREE.BoxGeometry(1.3, 0.05, s.W * 0.72), dark, (s.rw[0] + s.ws[0]) / 2 - 0.3, s.belt + 0.02, 0); // interior
      }
      if (s.bed) {
        // open bed: dark liner sunk into the body behind the cab
        add(new THREE.BoxGeometry(s.bed[1] - s.bed[0], 0.06, s.W * 0.78), dark, (s.bed[0] + s.bed[1]) / 2, s.belt + 0.04, 0);
      }
      const tw = 0.27;
      for (const x of s.wx) for (const side of [1, -1]) wheel(x, side * (s.W / 2 - tw / 2 + 0.02), s.r, tw);
      for (const side of [1, -1]) {
        add(new THREE.BoxGeometry(0.06, 0.1, 0.36), headlight, s.L + 0.03, s.front - 0.14, side * (s.W / 2 - 0.3));
        add(new THREE.BoxGeometry(0.06, 0.1, 0.32), taillight, -0.04, s.rear - 0.18, side * (s.W / 2 - 0.28));
      }
      add(new THREE.BoxGeometry(0.05, 0.16, s.W * 0.42), dark, s.L + 0.04, s.front - 0.3, 0); // grille
      group.userData.size = { L: s.L, W: s.W, H: s.roof };
    }
    // centre the car on the origin
    const { L } = group.userData.size;
    group.children.forEach((m) => { m.position.x -= L / 2; });
    return group;
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const canvas = renderer.domElement;
    canvas.className = 'car3d-canvas';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 2, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xfff6e5, 0x2a2824, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 7, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc266, 1.2);
    rim.position.set(-6, 3, -4);
    scene.add(rim);

    // soft shadow disc under the car
    const sh = document.createElement('canvas');
    sh.width = sh.height = 128;
    const g = sh.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    scene.add(shadow);

    const pivot = new THREE.Group();
    scene.add(pivot);
    let car = null;
    let key3d = '';
    let yaw = -0.6;
    let pitch = 0.22;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let idleAt = 0;
    let running = false;

    function dispose(obj) {
      obj.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    }

    function setCar(spec) {
      const k = (spec.body || '') + '|' + (spec.color || '');
      if (k === key3d) return;
      key3d = k;
      if (car) { pivot.remove(car); dispose(car); }
      car = buildCar(spec);
      pivot.add(car);
      const { L, W, H } = car.userData.size;
      shadow.scale.set(L * 1.35, W * 1.9, 1);
      const dist = Math.max(L, H * 2.2) * 1.8;
      camera.userData = { dist, target: new THREE.Vector3(0, H * 0.42, 0) };
    }

    function frame() {
      if (!running) return;
      if (!canvas.isConnected) { running = false; return; }
      if (!dragging && performance.now() > idleAt) yaw += 0.0035;
      const { dist, target } = camera.userData;
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
      camera.lookAt(target);
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
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
        if (!running) { running = true; requestAnimationFrame(frame); }
      }
    };
  }

  return { BODY_TYPES, DEFAULT_COLOR, bodyFromNhtsa, bodyLabel, buildCar, createViewer };
});
