// Real 3D models of the actual car, from Sketchfab (sketchfab.com): searching for the vehicle, the
// download links (which need the user's own Sketchfab API token), and turning a downloaded model into
// a car that sits on the floor at the vehicle's real length. Each app does its own networking and
// storage; this file only knows Sketchfab's formats. Attaches to window.GarageReplica in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageReplica = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const API = 'https://api.sketchfab.com/v3';
  const HEAVY_FACES = 600000; // above this, a model may be slow on phones

  const searchUrl = (q) => `${API}/search?` + new URLSearchParams({ type: 'models', q, downloadable: 'true', count: '24' });
  const downloadInfoUrl = (uid) => `${API}/models/${encodeURIComponent(uid)}/download`;
  const validUid = (uid) => /^[a-f0-9]{32}$/i.test(String(uid || ''));

  // "2018 Toyota Camry"
  const queryFor = (v) => [v.year, v.make, v.baseModel || v.model].filter(Boolean).join(' ').trim();

  const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

  // Search results -> what the picker shows, best matches for the vehicle first. Age-restricted models
  // are left out.
  function results(json, v) {
    const want = new Set(words(queryFor(v || {})));
    const list = ((json && json.results) || []).filter((r) => r && validUid(r.uid) && !r.isAgeRestricted).map((r, i) => {
      const thumbs = (r.thumbnails && r.thumbnails.images) || [];
      const thumb = thumbs.filter((t) => t.width >= 200).sort((a, b) => a.width - b.width)[0] || thumbs[0] || {};
      const archives = r.archives || {};
      const arc = archives.glb || archives.gltf || {};
      const name = String(r.name || 'Untitled').slice(0, 120);
      return {
        uid: r.uid,
        name,
        author: String((r.user && (r.user.displayName || r.user.username)) || 'unknown').slice(0, 80),
        authorUrl: (r.user && r.user.profileUrl) || '',
        license: String((r.license && r.license.label) || 'Sketchfab license').slice(0, 60),
        url: r.viewerUrl || `https://sketchfab.com/3d-models/${r.uid}`,
        thumb: /^https:\/\/media\.sketchfab\.com\//.test(thumb.url || '') ? thumb.url : '',
        faces: Number(arc.faceCount || r.faceCount) || null,
        size: Number(arc.size) || null,
        heavy: Number(arc.faceCount || r.faceCount) > HEAVY_FACES,
        score: words(name).filter((w) => want.has(w)).length * 10 - i * 0.1 // matching words, then Sketchfab's order
      };
    });
    return list.sort((a, b) => b.score - a.score);
  }

  // The download response -> the file to fetch: a single .glb when offered, else the glTF zip.
  function archiveFrom(json) {
    const ok = (a) => a && /^https:\/\//.test(a.url || '');
    if (ok(json && json.glb)) return { kind: 'glb', url: json.glb.url, size: json.glb.size || null };
    if (ok(json && json.gltf)) return { kind: 'zip', url: json.gltf.url, size: json.gltf.size || null };
    return null;
  }

  // A downloaded file -> a THREE.Group. kind: 'glb' or 'zip' (a glTF with its files). Needs THREE with
  // THREE.GLTFLoader, and fflate for zips.
  function parse(THREE, data, kind, fflate) {
    if (ArrayBuffer.isView(data)) data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return new Promise((resolve, reject) => {
      const loader = new THREE.GLTFLoader();
      const done = (gltf) => resolve(gltf.scene || gltf.scenes[0]);
      const fail = (e) => reject(e instanceof Error ? e : new Error(String((e && e.message) || e)));
      if (kind === 'glb') { loader.parse(data, '', done, fail); return; }
      let files;
      try { files = fflate.unzipSync(new Uint8Array(data)); } catch (e) { fail(e); return; }
      const names = Object.keys(files);
      const main = names.find((n) => /\.gltf$/i.test(n)) || names.find((n) => /\.glb$/i.test(n));
      if (!main) { fail(new Error('No model inside the download.')); return; }
      const dir = main.includes('/') ? main.slice(0, main.lastIndexOf('/') + 1) : '';
      const urls = new Map();
      for (const n of names) if (n !== main && n.startsWith(dir) && files[n].length) urls.set(decodeURIComponent(n.slice(dir.length)), URL.createObjectURL(new Blob([files[n]])));
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((u) => urls.get(decodeURIComponent(String(u).replace(/^\.\//, ''))) || u);
      const free = () => urls.forEach((u) => URL.revokeObjectURL(u));
      new THREE.GLTFLoader(manager).parse(/\.glb$/i.test(main) ? files[main].buffer : new TextDecoder().decode(files[main]), '',
        (g) => { setTimeout(free, 30000); done(g); }, (e) => { free(); fail(e); });
    });
  }

  // Fits a model to the car: drops display stands and floors, turns it lengthwise along x, scales it
  // to `length` metres, centres it and sets it on the floor. Returns {group, size: {L, W, H}}.
  function fit(THREE, scene, length) {
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const boxOf = (list) => list.reduce((b, m) => b.union(new THREE.Box3().setFromObject(m)), new THREE.Box3());
    // A floor, turntable or fabric base reaches far past the car in both length and width; no car part
    // does. Only the widest-spread part can be one, and only if the rest is a real share of the model
    // (so a car body is never mistaken for a stand under its own windows).
    const verts = (list) => list.reduce((n, m) => n + ((m.geometry.attributes.position || {}).count || 0), 0);
    for (let pass = 0; pass < 3; pass++) {
      const vis = meshes.filter((x) => x.visible);
      if (vis.length < 2) break;
      const area = (m) => { const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()); return s.x * s.z; };
      const widest = vis.reduce((a, b) => (area(b) > area(a) ? b : a));
      const rest = vis.filter((x) => x !== widest);
      const a = new THREE.Box3().setFromObject(widest).getSize(new THREE.Vector3());
      const b = boxOf(rest).getSize(new THREE.Vector3());
      if (!(a.x > b.x * 1.3 && a.z > b.z * 1.3 && verts(rest) >= verts(vis) * 0.25)) break;
      widest.visible = false;
    }
    const shown = meshes.filter((m) => m.visible);
    if (!shown.length) throw new Error('The model has nothing to show.');
    const group = new THREE.Group();
    group.add(scene);
    let size = boxOf(shown).getSize(new THREE.Vector3());
    if (size.z > size.x) { scene.rotation.y = Math.PI / 2; group.updateMatrixWorld(true); }
    size = boxOf(shown).getSize(new THREE.Vector3());
    const k = length > 0 && size.x > 0 ? length / size.x : 1;
    scene.scale.multiplyScalar(k);
    group.updateMatrixWorld(true);
    const box = boxOf(shown);
    const c = box.getCenter(new THREE.Vector3());
    scene.position.x -= c.x;
    scene.position.z -= c.z;
    scene.position.y -= box.min.y;
    group.updateMatrixWorld(true);
    for (const m of shown) {
      m.castShadow = true;
      for (const mat of [].concat(m.material || [])) if ('envMapIntensity' in mat) mat.envMapIntensity = 1.2;
    }
    const s = boxOf(shown).getSize(new THREE.Vector3());
    return { group, size: { L: s.x, W: s.z, H: s.y } };
  }

  // Textures over `max` pixels are redrawn smaller: big models ship 4-8K textures that would use
  // hundreds of MB of GPU memory for a car shown a few hundred pixels wide.
  function shrinkTextures(THREE, scene, max = 1024) {
    if (typeof document === 'undefined') return;
    const seen = new Set();
    scene.traverse((o) => {
      for (const mat of [].concat((o.isMesh && o.material) || [])) {
        for (const key of Object.keys(mat)) {
          const tex = mat[key];
          if (!tex || !tex.isTexture || seen.has(tex)) continue;
          seen.add(tex);
          const img = tex.image;
          const w = img && (img.width || img.videoWidth);
          const h = img && (img.height || img.videoHeight);
          if (!w || !h || Math.max(w, h) <= max) continue;
          const k = max / Math.max(w, h);
          const c = document.createElement('canvas');
          c.width = Math.round(w * k);
          c.height = Math.round(h * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          tex.image = c;
          tex.needsUpdate = true;
        }
      }
    });
  }

  // Mounts the vehicle's plate at each end of a fitted model, on the flattest upright spot across the
  // middle (the plate recess, or the bumper). An end with no flat spot is left alone. Ray tests are done
  // against just the triangles near each end, so even million-face models take a moment.
  const PLATE = { w: 0.305, h: 0.152, proud: 0.006 }; // a US plate, standing just off the surface
  function addPlates(THREE, group, material) {
    group.updateMatrixWorld(true);
    const meshes = [];
    group.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
    const box = meshes.reduce((b, m) => b.union(new THREE.Box3().setFromObject(m)), new THREE.Box3());
    const added = [];
    for (const end of [1, -1]) {
      const edge = end > 0 ? box.max.x : box.min.x;
      const tris = trianglesNear(THREE, meshes, edge, end);
      const spot = flattestSpot(tris, edge, end);
      if (!spot) continue;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(PLATE.w, PLATE.h), material);
      plate.rotation.y = end * Math.PI / 2; // facing out of that end
      plate.position.set(spot.x + end * PLATE.proud, spot.y, 0);
      plate.castShadow = true;
      group.add(plate);
      added.push(end > 0 ? 'front' : 'rear');
    }
    return added;
  }

  // World-space triangles within reach of one end, across the middle, at plate heights: [[x,y,z] x 3].
  function trianglesNear(THREE, meshes, edge, end) {
    const out = [];
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const near = (p) => end * (p.x - edge) > -0.7 && Math.abs(p.z) < 0.45 && p.y > 0.1 && p.y < 1.2;
    for (const m of meshes) {
      const mb = new THREE.Box3().setFromObject(m);
      if (end * ((end > 0 ? mb.max.x : mb.min.x) - edge) < -0.7) continue; // nowhere near this end
      const pos = m.geometry.attributes.position;
      const idx = m.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < n; i += 3) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld);
        if (near(v[0]) || near(v[1]) || near(v[2])) out.push(v.map((p) => [p.x, p.y, p.z]));
      }
    }
    return out;
  }

  // The outermost surface along x at (y, z), or null: a ray from outside the end, pointing in.
  function surfaceAt(tris, y, z, end) {
    let best = null;
    for (const [a, b, c] of tris) {
      const d = (b[1] - c[1]) * (a[2] - c[2]) + (c[2] - b[2]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b[1] - c[1]) * (z - c[2]) + (c[2] - b[2]) * (y - c[1])) / d;
      const l2 = ((c[1] - a[1]) * (z - c[2]) + (a[2] - c[2]) * (y - c[1])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const x = l1 * a[0] + l2 * b[0] + l3 * c[0];
      if (best === null || end * x > end * best) best = x;
    }
    return best;
  }

  // The plate-sized patch across the middle that is flattest and upright: {x, y} of its outer face.
  function flattestSpot(tris, edge, end) {
    if (!tris.length) return null;
    let best = null;
    for (let y = 0.3; y <= 0.95; y += 0.025) {
      const xs = [];
      for (const dz of [-PLATE.w * 0.45, 0, PLATE.w * 0.45]) {
        for (const dy of [-PLATE.h * 0.4, 0, PLATE.h * 0.4]) {
          const x = surfaceAt(tris, y + dy, dz, end);
          if (x === null) break;
          xs.push(x);
        }
      }
      if (xs.length < 9) continue;
      const spread = Math.max(...xs) - Math.min(...xs);
      const outer = end > 0 ? Math.max(...xs) : Math.min(...xs);
      if (end * (outer - edge) < -0.45) continue; // deep inside (an open grille), not a face
      const score = spread + Math.abs(y - 0.55) * 0.02; // flattest first, then near a usual plate height
      if (!best || score < best.score) best = { x: outer, y, spread, score };
    }
    return best && best.spread < 0.035 ? best : null;
  }

  const credit = (r) => `${r.name} by ${r.author} (${r.license})`;

  return { API, HEAVY_FACES, PLATE, searchUrl, downloadInfoUrl, validUid, queryFor, results, archiveFrom, parse, fit, shrinkTextures, addPlates, credit };
});
