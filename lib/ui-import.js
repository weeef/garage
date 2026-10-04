// Reading PDFs (pdf.js, loaded on first use) and the "Import records" dialog for service history:
// shop work orders and receipts (lib/workorder.js) or CARFAX (lib/carfax.js). Shared by the desktop
// and phone apps; each shows the preview its own way. Attaches to window.GarageImportUI in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageImportUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // app: {
  //   data() -> the app's data; vehicle() -> the current vehicle; openForm; $
  //   W (GarageWorkOrder), C (GarageCarfax)
  //   pdfBase: folder holding pdf.min.js and pdf.worker.min.js; pasteHint: how to paste on this device
  //   previewImport(v, entries, order, file?): shows what was found (file: the PDF it came from, if any)
  // }
  function create(app) {
    const { vehicle, openForm, $, W, C } = app;
    let pdfReady = null;

    function loadPdfJs() {
      if (!pdfReady) {
        pdfReady = new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = app.pdfBase + 'pdf.min.js';
          s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = app.pdfBase + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
          s.onerror = () => { pdfReady = null; reject(new Error('Could not load the PDF reader.')); };
          document.head.appendChild(s);
        });
      }
      return pdfReady;
    }

    // The text of a PDF, line by line (first 20 pages).
    async function pdfText(file) {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      const pages = [];
      for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
        const page = await doc.getPage(i);
        pages.push(W.linesFromPdfItems((await page.getTextContent()).items));
      }
      return pages.join('\n');
    }

    function importRecords() {
      const v = vehicle();
      if (!v) return;
      openForm({
        title: `Import records · ${v.name}`,
        fields: [{ name: 'text', label: 'Or paste the text', type: 'textarea' }],
        okLabel: 'READ IT',
        onSubmit: (f) => (f.text ? readRecords(v, f.text) : 'Paste some text, or open a PDF.')
      });
      $('#f_text').rows = 7;
      $('#dlgFields').insertAdjacentHTML('afterbegin', `<p class="hint">Works with <b>shop work orders and receipts</b>
        (Les Schwab, Discount Tire, Jiffy Lube, dealers and others) and <b>CARFAX</b> service history.</p>
        <div class="import-pdf"><button type="button" class="btn" id="pdfBtn">OPEN A PDF</button>
          <span class="dim">the invoice PDF from the shop's email or website</span>
          <input type="file" id="pdfFile" accept="application/pdf,.pdf" hidden></div>
        <p class="hint">${app.pasteHint}</p>`);
      const btn = $('#pdfBtn');
      const input = $('#pdfFile');
      btn.onclick = () => { input.value = ''; input.click(); };
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const err = $('#dlgError');
        btn.disabled = true;
        btn.textContent = 'READING…';
        err.textContent = '';
        try {
          const text = await pdfText(file);
          if (text.replace(/\s/g, '').length < 20) {
            err.textContent = "That PDF has no text in it (it's a scanned picture). Copy the text with your phone's camera (Live Text / Google Lens) and paste it instead.";
            return;
          }
          $('#f_text').value = text;
          const problem = readRecords(v, text, file);
          if (problem) err.textContent = problem;
          else $('#dlg').close();
        } catch (e) {
          err.textContent = 'Could not read that PDF' + (e && e.message ? ': ' + e.message : '.');
        } finally {
          btn.disabled = false;
          btn.textContent = 'OPEN A PDF';
        }
      };
    }

    // Works out what the text is and opens the preview. Returns an error message, or nothing.
    function readRecords(v, text, file) {
      const logs = app.data().logs;
      if (!W.looksLikeCarfax(text)) {
        const order = W.parseWorkOrder(text);
        const entries = W.toEntries(order, v, logs);
        if (entries.length) { setTimeout(() => app.previewImport(v, entries, order, file), 80); return; }
      }
      const entries = C.toEntries(C.parseCarfax(text), v, logs);
      if (entries.length) { setTimeout(() => app.previewImport(v, entries, null, file), 80); return; }
      return "Couldn't find any service work in that. Make sure it includes the lines describing the work (e.g. \"Rotate & balance\", \"Oil change\").";
    }

    return { pdfText, importRecords };
  }

  return { create };
});
