// Guided tour of Garage Log for screen recordings, injected by scripts/demo/desktop.js.
// Drives the real UI through the DOM only (a fake cursor moves to each control, then clicks it) and
// shows a caption for each feature. SPACE starts it (handled in desktop.js); R resets.
(() => {
  'use strict';
  if (window.__tour) return;

  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p2 = (n) => String(n).padStart(2, '0');

  // Above everything, including an open dialog: re-showing a popover puts it on top of the top layer.
  function layer(cls, html) {
    const el = document.createElement('div');
    el.className = 'tour-layer ' + cls;
    el.popover = 'manual';
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }
  const front = (el) => { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); };

  const cursor = layer('tour-cursor', '<span class="ring"></span><svg viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>');
  const caption = layer('tour-caption', '<div class="t"></div><div class="s"></div>');

  async function say(title, sub = '') {
    if (caption.classList.contains('on')) {
      caption.classList.remove('on');
      await sleep(300);
    }
    caption.querySelector('.t').textContent = title;
    caption.querySelector('.s').textContent = sub;
    front(caption);
    front(cursor);
    caption.classList.add('on');
  }
  async function hush() {
    caption.classList.remove('on');
    await sleep(350);
  }

  // Moves the fake cursor onto `target` (an element or selector), then clicks it.
  async function click(target, { pause = 250 } = {}) {
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    await sleep(250);
    const r = el.getBoundingClientRect();
    front(cursor);
    cursor.style.left = `${Math.round(r.left + r.width / 2)}px`;
    cursor.style.top = `${Math.round(r.top + r.height / 2)}px`;
    await sleep(750);
    cursor.classList.remove('click');
    void cursor.offsetWidth; // restart the ring animation
    cursor.classList.add('click');
    await sleep(120);
    el.click();
    await sleep(pause);
    return el;
  }

  const tab = (view) => click(`#nav button[data-view="${view}"]`, { pause: 500 });
  const scrollMain = async (top, wait = 900) => {
    $('#main').scrollTo({ top, behavior: 'smooth' });
    await sleep(wait);
  };
  const scrollToEl = async (sel, wait = 1000) => {
    const el = $(sel);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    await sleep(wait);
  };

  async function card(html, ms) {
    const el = layer('tour-card', html);
    front(el);
    await sleep(30);
    el.classList.add('on');
    await sleep(ms);
    return el;
  }
  async function dropCard(el) {
    el.classList.remove('on');
    await sleep(650);
    el.remove();
  }

  // A shop receipt for today, covering what the Daily Driver is due for.
  function invoice() {
    const d = new Date();
    return `JIFFY LUBE #2214
4410 Lyndale Ave S, Minneapolis, MN 55419
INVOICE # 77104        DATE ${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}
Vehicle: 2013 FORD FOCUS ST   License: GLG 418
Mileage: 68,612
QTY  DESCRIPTION                                   PRICE     AMOUNT
1    FULL SYNTHETIC OIL CHANGE 5W-30                 79.99     79.99
1    CABIN AIR FILTER                                39.99     39.99
1    TIRE ROTATION                                   24.99     24.99
1    SHOP SUPPLIES FEE                                4.50      4.50
                                          SUBTOTAL           149.47
                                          TAX                 10.28
                                          TOTAL             $159.75`;
  }

  async function type(el, text) {
    el.focus();
    el.value = '';
    for (const line of text.split('\n')) {
      el.value += (el.value ? '\n' : '') + line;
      el.scrollTop = el.scrollHeight;
      await sleep(70);
    }
  }

  async function pickVehicle(id) {
    const sel = $('#vehicleSelect');
    await click(sel, { pause: 150 });
    sel.value = id;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);
  }

  async function theme(id, ms = 1500) {
    await click(`.theme-chip[data-id="${id}"]`, { pause: ms });
  }

  let running = false;
  async function start() {
    if (running) return;
    running = true;
    try {
      await run();
    } finally {
      running = false;
    }
  }

  async function run() {
    if ($('#dlg').open) $('#dlg').close();
    if ($('#nav button.active')?.dataset.view !== 'dashboard') $('#nav button[data-view="dashboard"]').click();
    await scrollMain(0, 100);

    // Intro
    const intro = await card(`<div class="brand"><span class="mark">▞</span> GARAGE<b>LOG</b></div><div class="line"></div>
      <div class="tag">A maintenance log for any vehicle</div>
      <div class="sub">Windows app + phone app · your data stays on your own devices</div>`, 3200);
    await dropCard(intro);

    // Dashboard and the 3D car
    await say('Your car at a glance', $('.model-credit')
      ? 'A real 3D model of this car from Sketchfab, scaled to its real length, with your plate mounted on the bumpers.'
      : 'A 3D model built to the real size of this generation, found on Wikipedia from the year, make and model.');
    await sleep(5000);
    if ($('.car-photo')) {
      await say('Real photo, one click away', 'Flip between the 3D model and a photo of the same generation.');
      await click('.car-photo', { pause: 2800 });
      await click('.car-photo', { pause: 1200 });
    }
    await say("What's due", 'Every schedule is "X miles or Y months", whichever comes first: OK, soon or overdue. Registration tabs too.');
    await scrollToEl('#main .section', 4800);
    await say('Spending, tracked', 'Total spend, the last 12 months and cost per mile, plus recent work.');
    await scrollMain($('#main').scrollHeight, 3200);
    await scrollMain(0, 600);

    // Service log
    await tab('log');
    await say('Full service history', 'Everything done on the same day is one visit with its total. DIY or shop, with PDF receipts attached.');
    await sleep(4200);

    // Import a shop invoice
    await say('Import a shop invoice', 'Open the PDF from the shop or paste the receipt text: Les Schwab, Discount Tire, Jiffy Lube, dealers, CARFAX.');
    await click('[data-action="import"]', { pause: 700 });
    await type($('#f_text'), invoice());
    await sleep(600);
    await click('#dlgOk', { pause: 1100 });
    await say('Read and checked for you', 'Date, mileage and line items mapped onto your schedules. Fees and tax are folded in so the totals match the invoice.');
    await sleep(5200);
    await click('#dlgOk', { pause: 1600 });
    await say('Logged in one click', 'The visit and its total are in the log, and the odometer moved forward.');
    await sleep(3000);

    // Schedules now up to date
    await tab('schedules');
    await say('Schedules reset themselves', 'Logging an oil change restarts the oil change countdown. The overdue cabin filter is now OK.');
    await sleep(4800);

    // Fuel
    await tab('fuel');
    await say('Fuel log', 'Fuel spend, yearly estimate, MPG and cost per mile. Reads gas receipts, including Costco, in bulk.');
    await sleep(3600);
    await scrollMain(420, 2600);
    await scrollMain(0, 500);

    // Themes
    await tab('settings');
    await say('Make it yours', 'Themes for the whole app: racing styles and car brands.');
    await scrollToEl('.theme-grid', 800);
    for (const id of ['racing', 'gulf', 'brg', 'midnight', 'showroom']) await theme(id);
    const brand = $('.theme-chip .mk')?.closest('.theme-chip')?.dataset.id;
    if (brand) await theme(brand, 2000);
    await theme('garage', 900);
    await scrollMain(0, 300);

    // A second vehicle
    await tab('dashboard');
    await say('Every vehicle in the family', 'Add as many as you like. Each one gets its own log, schedules and 3D model.');
    await pickVehicle('demo-tacoma');
    await sleep(5000);
    await say('Syncs with your phone', 'The phone app keeps in step through a private gist on your own GitHub account. Changes merge from both sides.');
    await sleep(4200);
    await pickVehicle('demo-focus');
    await sleep(1200);
    await hush();
    cursor.style.top = '110%';

    // Outro (stays up; R resets everything for another take)
    await card(`<div class="brand"><span class="mark">▞</span> GARAGE<b>LOG</b></div><div class="line"></div>
      <div class="tag">Know what your car needs, before it needs it</div>
      <div class="sub">Electron · three.js · pdf.js · plain JavaScript<br>Built by Jordan Bastian</div>`, 0);
  }

  window.__tour = { start };
})();
