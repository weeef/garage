// PDF receipts on service entries: attach (to one entry, or to every entry of a visit), open, remove,
// and keep the stored files in step with the log. Entries hold only the receipt's details
// ({id, name, size, added}); the PDF itself is stored on the device by the app (`store`). That list syncs
// between devices; the files don't, so a receipt added on the other device shows as "not on this device".
// Shared by the desktop and phone apps. Attaches to window.GarageReceiptsUI in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageReceiptsUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_BYTES = 25 * 1048576;
  const validId = (id) => /^[a-z0-9-]{8,64}$/.test(String(id || ''));
  const isPdf = (file) => file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
  const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  // app: {
  //   data(), persist, render, $, esc, toast, confirmDialog, uid
  //   store: { save(id, bytes: Uint8Array) -> Promise<bool>, open(id) -> Promise<bool>,
  //            list() -> Promise<string[]> (ids on this device), remove(id) -> Promise }
  // }
  function create(app) {
    const { persist, render, esc, toast, confirmDialog } = app;
    let local = null; // receipt ids stored on this device, once known

    const entriesById = (ids) => app.data().logs.filter((l) => ids.includes(l.id));
    const receiptsOf = (entries) => {
      const seen = new Map();
      for (const e of entries) for (const r of e.receipts || []) if (validId(r.id) && !seen.has(r.id)) seen.set(r.id, r);
      return [...seen.values()];
    };

    // Stores a PDF once and lists it on each of `entries`. Returns an error message, or nothing.
    async function attach(file, entries) {
      if (!isPdf(file)) return `"${file && file.name}" isn't a PDF.`;
      if (file.size > MAX_BYTES) return `"${file.name}" is over ${kb(MAX_BYTES)}.`;
      const id = app.uid().toLowerCase();
      const ok = await app.store.save(id, new Uint8Array(await file.arrayBuffer()));
      if (!ok) return `Couldn't save "${file.name}" on this device.`;
      const r = { id, name: String(file.name || 'receipt.pdf').slice(0, 120), size: file.size, added: new Date().toISOString().slice(0, 10) };
      for (const e of entries) e.receipts = [...(e.receipts || []), r];
      if (local) local.add(id);
    }

    // Opens a file picker and attaches the chosen PDFs to the given entries.
    function pick(entryIds) {
      const entries = entriesById(entryIds);
      if (!entries.length) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,.pdf';
      input.multiple = true;
      input.onchange = async () => {
        const problems = [];
        for (const f of input.files || []) { const err = await attach(f, entries); if (err) problems.push(err); }
        persist();
        render();
        toast(problems.length ? problems[0] : 'RECEIPT ATTACHED');
      };
      input.click();
    }

    async function open(id) {
      if (!validId(id)) return;
      if (!(await app.store.open(id))) toast('THAT RECEIPT IS ON YOUR OTHER DEVICE');
    }

    // Takes a receipt off the given entries; the file goes once nothing lists it.
    function remove(id, entryIds) {
      const entries = entriesById(entryIds);
      const r = receiptsOf(entries).find((x) => x.id === id);
      if (!r) return;
      confirmDialog('Remove receipt?', `Remove "${r.name}" from ${entries.length === 1 ? 'this entry' : 'this visit'}?`, 'REMOVE', () => {
        for (const e of entries) e.receipts = (e.receipts || []).filter((x) => x.id !== id);
        persist();
        render();
        prune();
      });
    }

    // Deletes stored files that no entry lists any more (after removing receipts or entries).
    async function prune() {
      const wanted = new Set(receiptsOf(app.data().logs).map((r) => r.id));
      for (const id of await app.store.list()) if (!wanted.has(id)) await app.store.remove(id);
      local = null;
    }

    // The receipt chips for some entries, plus an "add" button. ids: the entries they belong to.
    function chipsHtml(entries, { add = true } = {}) {
      const ids = entries.map((e) => e.id).join(',');
      const chips = receiptsOf(entries).map((r) => `<span class="rcpt" data-rcpt="${esc(r.id)}">
          <a href="#" class="link" data-action="rcptopen" data-id="${esc(r.id)}" title="Open ${esc(r.name)} (${kb(r.size || 0)})">PDF · ${esc(r.name.replace(/\.pdf$/i, ''))}</a>
          <a href="#" class="rcpt-x" data-action="rcptdel" data-id="${esc(r.id)}|${esc(ids)}" title="Remove">×</a></span>`).join('');
      return `<span class="rcpts">${chips}${add ? `<button type="button" class="btn ghost small" data-action="rcptadd" data-id="${esc(ids)}">+ RECEIPT</button>` : ''}</span>`;
    }

    // After a render: mark receipts whose file isn't on this device.
    async function markMissing(rootEl) {
      const els = rootEl.querySelectorAll('[data-rcpt]');
      if (!els.length) return;
      if (!local) local = new Set(await app.store.list());
      els.forEach((el) => {
        const here = local.has(el.dataset.rcpt);
        el.classList.toggle('missing', !here);
        if (!here) el.title = 'Added on your other device; the file is kept there';
      });
    }

    // For the add / edit entry dialog: a receipts row under the fields. New entries collect PDFs until
    // they're saved (flush), existing ones attach straight away.
    function formSection(existing) {
      const pending = [];
      function draw() {
        const box = app.$('#rcptForm');
        if (!box) return;
        const names = [...receiptsOf(existing ? [existing] : []).map((r) => esc(r.name)), ...pending.map((f) => esc(f.name) + ' (on save)')];
        box.innerHTML = `<div class="rcpt-form-list">${names.length ? names.join(' · ') : '<span class="dim">No receipt yet</span>'}</div>
          <button type="button" class="btn ghost small" id="rcptPick">ATTACH PDF</button>`;
        app.$('#rcptPick').onclick = () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'application/pdf,.pdf';
          input.multiple = true;
          input.onchange = async () => {
            for (const f of input.files || []) {
              if (!isPdf(f)) { toast(`"${f.name}" ISN'T A PDF`); continue; }
              if (existing) { const err = await attach(f, [existing]); if (err) toast(err); else persist(); } else pending.push(f);
            }
            draw();
          };
          input.click();
        };
      }
      return {
        mount() {
          app.$('#dlgFields').insertAdjacentHTML('beforeend', '<div class="field"><div class="fcell"><label>Receipt (PDF)</label><div id="rcptForm" class="rcpt-form"></div></div></div>');
          draw();
        },
        async flush(entry) {
          for (const f of pending.splice(0)) { const err = await attach(f, [entry]); if (err) toast(err); }
          persist();
          render();
        }
      };
    }

    return { attach, pick, open, remove, prune, chipsHtml, markMissing, formSection, receiptsOf };
  }

  return { MAX_BYTES, validId, isPdf, create };
});
