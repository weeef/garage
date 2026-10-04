// "Real model": pick a real 3D model of the vehicle on Sketchfab, download it once and show it in place
// of the generated car (lib/replica.js does the Sketchfab specifics). Shared by the desktop and phone
// apps; each passes in how it talks to Sketchfab and where it keeps downloads.
// Attaches to window.GarageReplicaUI in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageReplicaUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // app: {
  //   data(), vehicle, persist, render, openForm, $, esc, toast, R (GarageReplica)
  //   hasToken() -> Promise<bool>; setToken(token | '') -> Promise
  //   search(query) -> Promise<{ok, json, error}>; download(uid) -> Promise<{ok, size, error, code}>
  //   tryLoad(uid) -> Promise (rejects if the model can't be shown); prune(uidsToKeep) -> Promise
  // }
  function create(app) {
    const { vehicle, persist, render, openForm, $, esc, toast, R } = app;
    const mb = (n) => (n ? `${Math.max(0.1, n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB` : '');

    async function open() {
      const v = vehicle();
      if (!v) return;
      if (!(await app.hasToken())) { connect(); return; }
      openForm({
        title: `Real 3D model · ${v.name}`,
        fields: [{ name: 'q', label: 'Search Sketchfab', placeholder: 'e.g. 2018 Toyota Camry' }],
        initial: { q: R.queryFor(v) },
        okLabel: 'SEARCH',
        onSubmit: (f) => { search(v, f.q); return false; } // stay open to show the results
      });
      $('#dlgFields').insertAdjacentHTML('beforeend', `<p class="hint">Pick a model that matches your car (right generation and body).
        Free models made by Sketchfab's community; the author is credited on the dashboard.</p>
        ${v.replica ? '<div class="rep-current"><button type="button" class="btn ghost small" id="repClear">USE THE GENERATED CAR</button></div>' : ''}
        <div class="rep-status" id="repStatus"></div><div class="rep-grid" id="repGrid"></div>`);
      const clear = $('#repClear');
      if (clear) clear.onclick = () => { delete v.replica; persist(); render(); $('#dlg').close(); app.prune(keepList()); toast('GENERATED CAR'); };
      search(v, R.queryFor(v));
    }

    function connect() {
      openForm({
        title: 'Connect Sketchfab',
        fields: [{ name: 'token', label: 'Sketchfab API token', required: true, placeholder: '32 letters and numbers' }],
        okLabel: 'CONNECT',
        onSubmit: (f) => {
          const t = f.token.replace(/\s/g, '');
          if (!/^[A-Za-z0-9]{20,64}$/.test(t)) return "That doesn't look like a Sketchfab API token.";
          app.setToken(t).then(() => setTimeout(open, 80));
        }
      });
      $('#dlgFields').insertAdjacentHTML('afterbegin', `<p class="hint">Real models of your car come from <b>Sketchfab</b>, which needs a free account to download.
        <br>1. Sign up or log in at <a href="https://sketchfab.com/signup" target="_blank" rel="noopener" class="link">sketchfab.com</a>.
        <br>2. Open <a href="https://sketchfab.com/settings/password" target="_blank" rel="noopener" class="link">Settings → Password &amp; API</a> and copy your <b>API token</b>.
        <br>3. Paste it below. It stays on this device and is only sent to Sketchfab.</p>`);
    }

    async function search(v, q) {
      const status = $('#repStatus');
      const grid = $('#repGrid');
      if (!status || !grid) return;
      status.textContent = 'Searching…';
      grid.innerHTML = '';
      const res = await app.search(String(q || '').trim() || R.queryFor(v));
      if (!$('#repGrid')) return; // dialog closed meanwhile
      if (!res.ok) { status.textContent = res.error || "Couldn't reach Sketchfab. Check your connection."; return; }
      const list = R.results(res.json, v);
      status.textContent = list.length ? '' : 'No downloadable models for that. Try fewer words, e.g. just make and model.';
      grid.innerHTML = list.map((r) => `<div class="rep-card${v.replica && v.replica.uid === r.uid ? ' on' : ''}">
          ${r.thumb ? `<img src="${esc(r.thumb)}" alt="" loading="lazy">` : '<div class="rep-nothumb"></div>'}
          <div class="rep-name">${esc(r.name)}</div>
          <div class="rep-meta">by ${esc(r.author)} · ${esc(r.license)}${r.size ? ' · ' + mb(r.size) : ''}${r.heavy ? ' · <b>very detailed</b>, may be slow on phones' : ''}</div>
          <div class="rep-btns"><button type="button" class="btn small" data-rep-use="${esc(r.uid)}">USE THIS</button>
            <a href="${esc(r.url)}" target="_blank" rel="noopener" class="link">view</a></div></div>`).join('');
      grid.onclick = (e) => {
        const b = e.target.closest('[data-rep-use]');
        if (b) use(v, list.find((r) => r.uid === b.dataset.repUse));
      };
    }

    async function use(v, r) {
      if (!r) return;
      const status = $('#repStatus');
      const buttons = [...document.querySelectorAll('[data-rep-use]')];
      buttons.forEach((b) => { b.disabled = true; });
      status.textContent = `Downloading “${r.name}”${r.size ? ` (${mb(r.size)})` : ''}…`;
      const res = await app.download(r.uid);
      if (res.ok) {
        status.textContent = 'Getting it ready…';
        try { await app.tryLoad(r.uid); } catch (e) { res.ok = false; res.error = "That model couldn't be shown (" + ((e && e.message) || 'unknown format') + '). Try another one.'; }
      }
      buttons.forEach((b) => { b.disabled = false; });
      if (!res.ok) {
        status.textContent = res.error || 'The download failed.';
        if (res.code === 'auth') {
          status.insertAdjacentHTML('beforeend', ' <button type="button" class="btn ghost small" id="repReconnect">ENTER A NEW TOKEN</button>');
          $('#repReconnect').onclick = () => { app.setToken('').then(connect); };
        }
        return;
      }
      v.replica = { uid: r.uid, name: r.name, author: r.author, authorUrl: r.authorUrl, license: r.license, url: r.url };
      persist();
      $('#dlg').close();
      render();
      app.prune(keepList());
      toast('REAL MODEL SET');
    }

    // Downloads still in use by some vehicle (others are deleted to free space).
    const keepList = () => app.data().vehicles.map((x) => x.replica && x.replica.uid).filter(Boolean);

    return { open, connect, keepList };
  }

  return { create };
});
