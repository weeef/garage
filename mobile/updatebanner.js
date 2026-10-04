// The "new version" prompt. Both apps show it at the top of the dashboard as soon as an update is
// found (and as a slim bar on the other tabs), so nobody has to go looking in the Data tab.
// Update states (desktop, from lib/updater.js): available -> downloading -> ready, or error.
// The phone has one: ready (the new version is already downloaded; reloading switches to it).
// No DOM here; attaches to window.GarageUpdateBanner in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageUpdateBanner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LATER_KEY = 'garage-log-update-later';
  const REMIND_AFTER = 6 * 60 * 60 * 1000; // "Later" hides it for 6 hours

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Whether to prompt now. later: {version, at} from the last "Later", or null.
  function shouldShow(s, later, now = Date.now()) {
    if (!s) return false;
    if (s.state === 'downloading') return true;
    if (s.state === 'error') return Boolean(s.latest); // a failed download can be retried
    if (s.state !== 'available' && s.state !== 'ready') return false;
    return !(later && later.version === s.latest && now - later.at < REMIND_AFTER);
  }

  function bannerHtml(s) {
    const v = esc(s.latest || 'A new version');
    const name = s.latest ? `Garage Log ${v}` : 'A new version of Garage Log';
    const later = '<button type="button" class="btn ghost small" data-action="updismiss">LATER</button>';
    let text = '';
    let btns = '';
    if (s.state === 'available') {
      text = `<b>Update available.</b> ${name} is out${s.version ? ` (you have ${esc(s.version)})` : ''}. It takes about a minute and keeps all your data.`;
      btns = `<button type="button" class="btn small" data-action="updl">UPDATE NOW</button>${later}`;
    } else if (s.state === 'downloading') {
      const pct = Math.max(0, Math.min(100, Number(s.percent) || 0));
      text = `<b>Updating…</b> downloading ${name}: ${pct}%<span class="upd-progress"><i data-pct="${pct}"></i></span>`;
    } else if (s.state === 'ready' && s.phone) {
      text = `<b>Update ready.</b> ${name} has downloaded. Tap Update now to switch to it; your data stays.`;
      btns = `<button type="button" class="btn small" data-action="reload">UPDATE NOW</button>${later}`;
    } else if (s.state === 'ready') {
      text = `<b>Update ready.</b> ${name} has downloaded. Restart Garage Log to finish; your data is kept.`;
      btns = `<button type="button" class="btn small" data-action="upinstall">RESTART &amp; UPDATE</button>${later}`;
    } else if (s.state === 'error') {
      text = `<b>The update didn't finish.</b> ${esc(s.message || 'Something went wrong downloading it.')}`;
      btns = `<button type="button" class="btn small" data-action="updl">TRY AGAIN</button>${later}`;
    }
    return `<div class="upd-banner upd-${esc(s.state)}" role="status"><div class="upd-text">${text}</div>${btns ? `<div class="upd-btns">${btns}</div>` : ''}</div>`;
  }

  function loadLater(storage) {
    try { return JSON.parse(storage.getItem(LATER_KEY)) || null; } catch { return null; }
  }
  function saveLater(storage, version, now = Date.now()) {
    try {
      if (version) storage.setItem(LATER_KEY, JSON.stringify({ version, at: now }));
      else storage.removeItem(LATER_KEY);
    } catch { /* private mode */ }
  }

  // Draws the prompt into the dashboard's slot when it's on screen, else into the slim bar above the
  // page. barEl: the global bar; root: where to look for #dashUpdate. Returns whether it's showing.
  function render(s, storage, barEl, root) {
    const show = shouldShow(s, loadLater(storage));
    const html = show ? bannerHtml(s) : '';
    const dash = root.querySelector('#dashUpdate');
    if (dash) dash.innerHTML = html;
    if (barEl) {
      barEl.innerHTML = dash ? '' : html;
      barEl.hidden = !html || Boolean(dash);
    }
    for (const el of root.querySelectorAll('.upd-progress i[data-pct]')) el.style.width = el.dataset.pct + '%';
    return show;
  }

  return { LATER_KEY, REMIND_AFTER, shouldShow, bannerHtml, loadLater, saveLater, render };
});
