// The dashboard's car: the 3D model (lib/car3d.js), the real vehicle's photo to flip to, and the
// background lookups that feed them (body style and base model from the VIN, generation, real size and
// photo from Wikipedia via lib/carlook.js). Shared by the desktop and phone apps; each passes in how it
// reaches NHTSA and Wikipedia and its own wording. three.js is only loaded once a car is first shown.
// Attaches to window.GarageCarUI in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageCarUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // app: {
  //   data() -> the app's data; vehicle() -> the current vehicle; persist(); redraw(v): re-render if v is on screen
  //   esc, $, L (GarageLogic), G3 (GarageCar3D), GL (GarageCarLook)
  //   decodeVin(vin) -> {ok, row}; findLook(spec) -> {ok, look}; never throw
  //   vendorBase: folder holding three.min.js, GLTFLoader.js and fflate.min.js
  //   hints: {spin: 'drag to spin', paint: 'paint & body'}
  //   R (GarageReplica); readReplica(uid) -> Promise<{ok, kind, data}>: a downloaded real model, if any
  //   P (GaragePlates): the license plate card, in the style of the vehicle's state
  // }
  function create(app) {
    const { vehicle, persist, redraw, esc, $, L, G3, GL, R, P } = app;
    let viewer; // undefined until three.js is loaded; null when there's no WebGL
    const scripts = new Map(); // vendor scripts, loaded on first use
    const replicas = new Map(); // uid|length -> Promise<{group, size}>
    let showPhoto = false; // the real photo instead of the 3D model
    const bodyTried = new Set();
    const lookTried = new Set();

    function loadScript(name) {
      if (!scripts.has(name)) {
        scripts.set(name, new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = app.vendorBase + name;
          s.onload = () => resolve(true);
          s.onerror = () => { scripts.delete(name); resolve(false); };
          document.head.appendChild(s);
        }));
      }
      return scripts.get(name);
    }

    // A downloaded real model, read, shrunk and fitted to the car's length (cached per vehicle size).
    function loadReplica(uid, length, plate) {
      const key = [uid, length, plate ? plate.text + '|' + plate.state : ''].join('|');
      if (!replicas.has(key)) {
        replicas.set(key, (async () => {
          if (!(await loadScript('three.min.js')) || !(await loadScript('GLTFLoader.js')) || !(await loadScript('fflate.min.js'))) throw new Error('could not load the 3D model reader');
          const file = await app.readReplica(uid);
          if (!file || !file.ok) throw new Error((file && file.error) || 'the model is not downloaded on this device');
          const scene = await R.parse(window.THREE, file.data, file.kind, window.fflate);
          R.shrinkTextures(window.THREE, scene);
          const fitted = R.fit(window.THREE, scene, length);
          if (plate) R.addPlates(window.THREE, fitted.group, G3.plateMaterial(window.THREE, plate));
          return fitted;
        })());
        replicas.get(key).catch(() => replicas.delete(key)); // let a failed load be tried again
      }
      return replicas.get(key);
    }

    const plateOf = (v) => (v.plate ? { text: v.plate, state: v.plateState || '' } : null);
    const carLength = (v) => (v.look && v.look.dims && v.look.dims.L) || (G3.STYLES[v.body] || G3.STYLES.sedan).L;
    const tryLoad = (uid) => { const v = vehicle() || {}; return loadReplica(uid, carLength(v), plateOf(v)); };

    function stageHtml(v) {
      const look = v.look && !v.look.none ? v.look : null;
      const years = look && look.years ? ` · ${look.years[0]}–${Math.min(look.years[1], new Date().getFullYear() + 1)}` : '';
      const rep = v.replica && R.validUid(v.replica.uid) ? v.replica : null;
      const tag = rep ? rep.name : look ? `${look.name || look.title}${years}` : (G3.bodyLabel(v.body) || 'Body style not set');
      const ph = look && look.photo && GL.PHOTO_HOST.test(look.photo.url) ? look.photo : null;
      const credit = ph ? [ph.credit, ph.license].filter(Boolean).join(' · ') : '';
      const flipped = showPhoto && ph;
      const about = look ? ` · <a href="${esc(look.url)}" target="_blank" rel="noopener" class="link">about</a>` : '';
      return `<div class="car-stage${flipped ? ' show-photo' : ''}" id="car3d">
        ${v.plate && !flipped ? `<a href="#" class="plate-card" data-action="renewreg" title="${esc(v.plateState ? P.design(v.plateState).name + ' plate' : 'License plate')}: edit"><img src="${P.dataUrl(v.plate, v.plateState)}" alt="License plate ${esc(v.plate)}"></a>` : ''}
        <span class="car-tag" title="${look ? 'Built to the real size of the ' + esc(look.title) : ''}">${esc(tag)}</span>
        ${ph ? `<div class="car-photo-full"><img src="${esc(ph.url)}" alt="Photo of a ${esc(look.title)}">
          <span class="car-credit">Photo${credit ? ': ' + esc(credit) : ''} · <a href="${esc(ph.page || look.url)}" target="_blank" rel="noopener" class="link">source</a></span></div>
          <button type="button" class="car-photo" data-action="carphoto" title="${flipped ? 'Show the 3D model' : 'Show a real photo'}">${flipped ? '<span>3D</span>' : `<img src="${esc(ph.url)}" alt="">`}</button>` : ''}
        ${rep && !flipped ? `<span class="car-credit model-credit">Model: <a href="${esc(rep.url)}" target="_blank" rel="noopener" class="link">${esc(rep.name)}</a> by ${esc(rep.author)} · ${esc(rep.license)}</span>` : ''}
        <span class="car-hint">${flipped ? '' : esc(app.hints.spin) + ' · '}<a href="#" class="link" data-action="replica">${rep ? 'change model' : 'real model'}</a>${rep ? '' : ` · <a href="#" class="link" data-action="editvehicle">${esc(app.hints.paint)}</a>`}${about}</span></div>`;
    }

    function togglePhoto() {
      showPhoto = !showPhoto;
      const v = vehicle();
      if (v) redraw(v);
    }

    // After each render: put the 3D car into the stage, and fill in anything still unknown.
    function mount(v) {
      const el = $('#car3d');
      if (!el) return;
      if (viewer === undefined && !window.THREE) {
        loadScript('three.min.js').then((ok) => {
          if (!ok) viewer = null;
          const cur = vehicle();
          if (cur) mount(cur);
        });
      } else if (viewer === undefined) {
        try { viewer = G3.createViewer(); } catch { viewer = null; }
      }
      const rep = v.replica && R.validUid(v.replica.uid) ? v.replica : null;
      const plate = plateOf(v);
      const replica = rep ? { key: rep.uid + (plate ? '|' + plate.text + '|' + plate.state : ''), load: () => loadReplica(rep.uid, carLength(v), plate), onError: () => app.replicaFailed(v) } : null;
      if (viewer) viewer.show(el, { body: v.body, color: v.color || G3.DEFAULT_COLOR, dims: v.look && v.look.dims, plate, replica });
      else if (viewer === null) el.classList.add('no-3d'); // no WebGL: the photo can still be shown
      if (v.vin && (!v.body || !v.baseModel) && !bodyTried.has(v.id)) { bodyTried.add(v.id); lookupBody(v); }
      else refreshLook(v);
    }

    // Vehicles added before these features existed: body style and base model from the VIN, once.
    async function lookupBody(v) {
      const res = await app.decodeVin(v.vin);
      if (res && res.ok && app.data().vehicles.includes(v)) {
        const d = L.vehicleFromNhtsa(res.row);
        const body = G3.bodyFromNhtsa(d.bodyClass, d.doors);
        let changed = false;
        if (body && !v.body) { v.body = body; changed = true; }
        for (const k of ['year', 'make', 'model']) if (!v[k] && d[k]) { v[k] = d[k]; changed = true; } // fill in blanks
        if (d.baseModel && !v.baseModel && String(v.make || '').toLowerCase() === String(d.make || '').toLowerCase()) {
          v.baseModel = d.baseModel;
          changed = true;
        }
        if (changed) { persist(); redraw(v); }
      }
      refreshLook(v);
    }

    // The generation's real dimensions and photo. Looked up again when year / make / model change;
    // "nothing found" is remembered too, an unreachable Wikipedia is tried again next time.
    const lookSpec = (v) => ({ year: v.year, make: v.make, model: v.baseModel || v.model, baseModel: v.baseModel, body: v.body });

    async function refreshLook(v) {
      const spec = lookSpec(v);
      const key = GL.lookKey(spec);
      if (!v.make || !spec.model || (v.look && v.look.key === key) || lookTried.has(v.id + key)) return;
      lookTried.add(v.id + key);
      let res = await app.findLook(spec);
      // a model typed with its trim ("Camry LE"): try its first word on its own
      if (res.ok && !res.look && !v.baseModel && /\s/.test(spec.model)) res = await app.findLook({ ...spec, model: spec.model.split(/\s+/)[0] });
      if (!res.ok || !app.data().vehicles.includes(v) || GL.lookKey(lookSpec(v)) !== key) return;
      v.look = res.look ? { ...res.look, key } : { key, none: true };
      persist();
      redraw(v);
    }

    // Body style set back to "From VIN": look it up again on the next render.
    const retryVin = (vehicleId) => { bodyTried.delete(vehicleId); };

    function refresh() {
      if (viewer) viewer.refresh();
      const v = vehicle();
      if (v) redraw(v);
    }

    return { stageHtml, mount, togglePhoto, retryVin, tryLoad, refresh };
  }

  return { create };
});
