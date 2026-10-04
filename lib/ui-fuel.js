// Fuel: the fill-up form, importing gas receipts (pasted text, or many PDFs at once), deleting one or
// several fill-ups, and the dashboard's fuel card. Shared by the desktop and phone apps; the Fuel tab's
// own layout stays in each app. Fill-ups are read and costed by lib/fuel.js.
// Attaches to window.GarageFuelUI in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageFuelUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // app: { data() -> the app's data; vehicle, persist, render, openForm, confirmDialog, toast, uid, today,
  //        money, esc, unit, pdfText, $, L (GarageLogic), F (GarageFuel) }
  function create(app) {
    const { vehicle, persist, render, openForm, confirmDialog, toast, uid, today, money, esc, unit, pdfText, $, L, F } = app;

    const fuelFor = (v) => app.data().fuel.filter((f) => f.vehicleId === v.id);
    const volName = (v) => (F.volumeUnit(v) === 'L' ? 'liter' : 'gallon');
    const volAbbr = (v) => (F.volumeUnit(v) === 'L' ? 'L' : 'gal');
    const fmtVol = (n) => (n == null || n === '' ? '—' : Number(n).toFixed(3).replace(/\.?0+$/, ''));
    const fmtPrice = (n) => (n == null || n === '' ? '—' : '$' + Number(n).toFixed(3));
    const GRADE_OPTIONS = [{ value: '', label: '—' }, { value: 'regular', label: 'Regular' }, { value: 'midgrade', label: 'Midgrade' },
      { value: 'premium', label: 'Premium' }, { value: 'diesel', label: 'Diesel' }, { value: 'e85', label: 'E85' }];
    const gradeLabel = (g) => (GRADE_OPTIONS.find((o) => o.value === g) || {}).label || '';

    function fuelForm(existing, prefill) {
      const v = vehicle();
      if (!v) return;
      const start = existing || prefill || {};
      openForm({
        title: existing ? 'Edit fill-up' : prefill ? 'Check the receipt' : 'Add a fill-up',
        fields: [
          { name: 'date', label: 'Date', type: 'date', required: true, pair: true },
          { name: 'odometer', label: `Odometer (${unit(v)}, optional)`, type: 'number', min: 0 },
          { name: 'volume', label: `${volName(v)}s`.replace(/^./, (c) => c.toUpperCase()), type: 'number', min: 0, step: '0.001', pair: true },
          { name: 'price', label: `Price per ${volName(v)} ($)`, type: 'number', min: 0, step: '0.001' },
          { name: 'total', label: 'Total ($)', type: 'number', min: 0, step: '0.01', pair: true },
          { name: 'full', label: 'Tank', type: 'select', options: [{ value: 'yes', label: 'Filled up' }, { value: 'no', label: 'Partial fill' }] },
          { name: 'station', label: 'Station', placeholder: 'e.g. Costco', pair: true },
          { name: 'grade', label: 'Fuel', type: 'select', options: GRADE_OPTIONS },
          { name: 'notes', label: 'Notes', type: 'textarea' }
        ],
        initial: { date: today(), ...start, full: start.full === false ? 'no' : 'yes' },
        onSubmit: (f) => {
          const n = (x) => (x === '' ? null : Number(x));
          const vals = { odometer: n(f.odometer), volume: n(f.volume), price: n(f.price), total: n(f.total) };
          for (const [k, x] of Object.entries(vals)) if (x != null && (!Number.isFinite(x) || x < 0)) return `${k[0].toUpperCase() + k.slice(1)} must be a number.`;
          if (!L.parseDate(f.date)) return 'Pick a valid date.';
          const entry = F.complete({ vehicleId: v.id, date: f.date, ...vals, full: f.full !== 'no', station: f.station, grade: f.grade, notes: f.notes,
            time: start.time || '', ref: start.ref || '' }); // from the receipt, kept to spot it if imported again
          if (!entry.total) return `Enter the total, or the ${volName(v)}s and the price.`;
          if (existing) Object.assign(existing, entry);
          else app.data().fuel.push({ id: uid(), ...entry });
          if (entry.odometer) v.odometer = L.highestOdometer(v, [...app.data().logs, ...app.data().fuel]);
          persist(); render();
          toast(existing ? 'FILL-UP UPDATED' : 'FILL-UP ADDED');
        }
      });
    }

    function deleteFuel(id) {
      const f = app.data().fuel.find((x) => x.id === id);
      if (!f) return;
      confirmDialog('Delete fill-up?', `Remove the ${money(f.total)} fill-up from ${f.date}?`, 'DELETE', () => {
        app.data().fuel = app.data().fuel.filter((x) => x.id !== id);
        fuelPicked.delete(id);
        persist(); render();
        toast('FILL-UP DELETED');
      });
    }

    // Picking fill-ups to delete together: checkboxes on the Fuel tab, select all, delete selected.
    const fuelPicked = new Set();

    function fuelPickBar(fills) {
      const n = fills.filter((f) => fuelPicked.has(f.id)).length;
      const all = n === fills.length;
      return `<div class="fuel-pickbar"><label><input type="checkbox" class="fuel-pick-all"${all ? ' checked' : ''}> Select all ${fills.length}</label>
        <button type="button" class="btn danger small" data-action="delfuelsel"${n ? '' : ' disabled'}>DELETE SELECTED${n ? ` (${n})` : ''}</button></div>`;
    }

    document.addEventListener('change', (e) => {
      const el = e.target;
      const v = vehicle();
      if (!v || !el.classList) return;
      if (el.classList.contains('fuel-pick')) {
        if (el.checked) fuelPicked.add(el.dataset.id); else fuelPicked.delete(el.dataset.id);
        render();
      } else if (el.classList.contains('fuel-pick-all')) {
        for (const f of fuelFor(v)) if (el.checked) fuelPicked.add(f.id); else fuelPicked.delete(f.id);
        render();
      }
    });

    function deleteSelectedFuel() {
      const v = vehicle();
      if (!v) return;
      const picked = fuelFor(v).filter((f) => fuelPicked.has(f.id));
      if (!picked.length) return;
      const sum = picked.reduce((s, f) => s + (Number(f.total) || 0), 0);
      confirmDialog(`Delete ${picked.length} fill-up${picked.length === 1 ? '' : 's'}?`,
        `${money(sum)} in all${picked.length === fuelFor(v).length ? ' (every fill-up for this vehicle)' : ''}. This can't be undone, so export a backup first if unsure.`,
        `DELETE ${picked.length}`, () => {
          const ids = new Set(picked.map((f) => f.id));
          app.data().fuel = app.data().fuel.filter((f) => !ids.has(f.id));
          ids.forEach((id) => fuelPicked.delete(id));
          persist(); render();
          toast(`${ids.size} FILL-UP${ids.size === 1 ? '' : 'S'} DELETED`);
        });
    }

    function importFuel() {
      const v = vehicle();
      if (!v) return;
      openForm({
        title: `Fuel receipts · ${v.name}`,
        fields: [{ name: 'text', label: 'Or paste the receipt text', type: 'textarea' }],
        okLabel: 'READ IT',
        onSubmit: (f) => (f.text ? readFuel(v, F.parseReceipts(f.text)) : 'Paste a receipt, or open PDFs.')
      });
      $('#f_text').rows = 6;
      $('#dlgFields').insertAdjacentHTML('afterbegin', `<p class="hint">Gas station receipts: PDFs (pick as many as you like at once${'ontouchstart' in window ? '' : ', or drag them onto this window'}),
        an emailed receipt, or the paper slip. The app reads the date, ${volName(v)}s, price and total, and you check them before anything is saved.</p>
        <div class="import-pdf"><button type="button" class="btn" id="pdfBtn">OPEN PDFs</button>
          <span class="dim" id="pdfStatus"></span>
          <input type="file" id="pdfFile" accept="application/pdf,.pdf" multiple hidden></div>
        <p class="hint">For a paper receipt, point your phone's camera at it and copy the text with Live Text (iPhone) or Google Lens (Android), then paste it here.</p>`);
      const btn = $('#pdfBtn');
      const input = $('#pdfFile');
      btn.onclick = () => { input.value = ''; input.click(); };
      input.onchange = () => readFuelPdfs(v, [...(input.files || [])]);
      // drop PDFs anywhere on the dialog
      const form = $('#dlgForm');
      form.ondragover = (e) => { e.preventDefault(); form.classList.add('drop'); };
      form.ondragleave = () => form.classList.remove('drop');
      form.ondrop = (e) => {
        e.preventDefault();
        form.classList.remove('drop');
        readFuelPdfs(v, [...(e.dataTransfer.files || [])]);
      };
    }

    // Many receipt PDFs at once: read each, then one review of everything found.
    async function readFuelPdfs(v, files) {
      const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
      if (!pdfs.length) return;
      const btn = $('#pdfBtn');
      const status = $('#pdfStatus');
      const err = $('#dlgError');
      btn.disabled = true;
      err.textContent = '';
      const fills = [];
      const unreadable = [];
      for (let i = 0; i < pdfs.length; i++) {
        status.textContent = `reading ${i + 1} of ${pdfs.length}…`;
        try {
          const found = F.parseReceipts(await pdfText(pdfs[i]));
          if (found.length) fills.push(...found.map((r) => ({ ...r, file: pdfs[i].name })));
          else unreadable.push(pdfs[i].name);
        } catch {
          unreadable.push(pdfs[i].name);
        }
      }
      btn.disabled = false;
      status.textContent = '';
      const note = unreadable.length
        ? `${unreadable.length} file${unreadable.length === 1 ? '' : 's'} had no receipt text (a scanned picture, or not a fuel receipt): ${unreadable.join(', ')}.`
        : '';
      if (!fills.length) { err.textContent = note || "Couldn't find a fuel purchase in those PDFs."; return; }
      const problem = readFuel(v, fills, note);
      if (problem) err.textContent = problem + (note ? ' ' + note : '');
      else $('#dlg').close();
    }

    // One receipt opens in the fill-up form to check; several are listed, then added together.
    // receipts: from F.parseReceipts. note: anything to mention about files that couldn't be read.
    // Returns an error message, or nothing.
    function readFuel(v, receipts, note) {
      const fills = receipts.map((r) => F.toFillUp(r, v, today()));
      if (!fills.length) return `Couldn't find a fuel purchase in that. It needs at least the total, or the ${volName(v)}s and price.`;
      // the same receipt twice: its own transaction number, or the same date and total
      const keys = (f) => [f.date + '|' + Number(f.total).toFixed(2), ...(f.ref ? ['ref|' + f.ref] : [])];
      const have = new Set(fuelFor(v).flatMap(keys));
      const fresh = [];
      for (const f of fills) {
        if (keys(f).some((k) => have.has(k))) continue;
        keys(f).forEach((k) => have.add(k)); // also drops the same PDF picked twice
        fresh.push(f);
      }
      if (!fresh.length) return 'Those receipts are already in the fuel log.';
      if (fresh.length === 1 && !note) { setTimeout(() => fuelForm(null, fresh[0]), 80); return; }
      fresh.sort((a, b) => (a.date < b.date ? -1 : 1));
      const sum = fresh.reduce((s, f) => s + (f.total || 0), 0);
      const shown = fresh.slice(0, 12).map((f) => `${f.date} ${f.station || 'fuel'} ${money(f.total)}`).join(' · ');
      const more = fresh.length > 12 ? ` · and ${fresh.length - 12} more` : '';
      const skipped = fills.length - fresh.length;
      setTimeout(() => confirmDialog(`Add ${fresh.length} fill-up${fresh.length === 1 ? '' : 's'}?`,
        `${money(sum)} in all, ${fresh[0].date} to ${fresh[fresh.length - 1].date}: ${shown}${more}.` +
        `${skipped ? ` ${skipped} already in the log, skipped.` : ''}${note ? ' ' + note : ''} You can edit any of them afterwards on the Fuel tab.`,
        `ADD ${fresh.length}`, () => {
          for (const f of fresh) app.data().fuel.push({ id: uid(), ...f });
          v.odometer = L.highestOdometer(v, [...app.data().logs, ...app.data().fuel]);
          persist(); render();
          toast(`${fresh.length} FILL-UP${fresh.length === 1 ? '' : 'S'} ADDED`);
        }), 80);
    }

    // The dashboard's fuel highlight: the money first, then economy and the last fill-up.
    function fuelCardHtml(v) {
      const fills = fuelFor(v);
      if (!fills.length) {
        return `<div class="fuel-card empty-fuel"><div class="fuel-head"><span class="fuel-k">Fuel</span>
            <span class="fuel-note">Track what you spend on gas: add fill-ups or import receipts, and see your yearly fuel cost here.</span></div>
          <div class="fuel-btns"><button class="btn small" data-action="importfuel">IMPORT RECEIPTS</button>
            <button class="btn ghost small" data-action="addfuel">+ FILL-UP</button></div></div>`;
      }
      const st = F.fuelStats(fills, v);
      const year = new Date().getFullYear();
      const last = st.last;
      const stat = (k, val, sub) => `<div class="fuel-stat"><div class="k">${k}</div><div class="v">${val}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
      return `<div class="fuel-card"><div class="fuel-head"><span class="fuel-k">Fuel</span>
          <a href="#" class="link" data-action="gofuel">${st.count} fill-up${st.count === 1 ? '' : 's'} · open fuel log</a></div>
        <div class="fuel-stats">
          ${stat(`${year} so far`, money(st.thisYear), '')}
          ${stat('Per year', st.perYear != null ? money(st.perYear) : '—', st.perMonth != null ? `≈ ${money(st.perMonth)} a month` : 'needs a few weeks of fill-ups')}
          ${stat('All time', money(st.total), '')}
          ${stat(st.economyUnit, st.economy != null ? String(st.economy) : '—', st.economy != null ? 'full-tank average' : 'needs 2 full fills with odometer')}
          ${stat(`Avg per ${volAbbr(v)}`, fmtPrice(st.avgPrice), '')}
        </div>
        <div class="fuel-foot"><span>Last: ${esc(last.date)}${last.station ? ' · ' + esc(last.station) : ''} · ${money(last.total)}</span>
          <span class="fuel-btns"><button class="btn small" data-action="addfuel">+ FILL-UP</button>
            <button class="btn ghost small" data-action="importfuel">IMPORT</button></span></div></div>`;
    }

    return { fuelFor, volAbbr, fmtVol, fmtPrice, gradeLabel, fuelPicked, fuelPickBar, fuelForm, deleteFuel, deleteSelectedFuel, importFuel, fuelCardHtml };
  }

  return { create };
});
