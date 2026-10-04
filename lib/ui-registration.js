// Registration ("tabs") and the license plate: the renew / set-date dialog, and the facts both apps
// show in their due lists. Dates and wording come from lib/logic.js (registrationStatus).
// Attaches to window.GarageRegistrationUI in a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GarageRegistrationUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Vehicle form fields, after the paint color in both apps' vehicle forms.
  const FIELDS = [
    { name: 'plate', label: 'License plate', placeholder: 'e.g. ABC 1234', pair: true },
    { name: 'plateState', label: 'State / region', placeholder: 'e.g. WA' },
    { name: 'regExpires', label: 'Registration (tabs) expire', type: 'date' }
  ];

  // Form values -> the vehicle's plate and registration fields, cleaned up.
  function fromForm(f, L) {
    return {
      plate: L.normalizePlate(f.plate),
      plateState: String(f.plateState || '').toUpperCase().replace(/[^A-Z0-9 .-]/g, '').trim().slice(0, 20),
      regExpires: L.parseDate(f.regExpires) ? f.regExpires : ''
    };
  }

  // app: { vehicle, persist, render, openForm, toast, L (GarageLogic) }
  function create(app) {
    const { vehicle, persist, render, openForm, toast, L } = app;

    // "Renewed": the new expiry (a year on, editable), or the first date when none is set.
    function renew() {
      const v = vehicle();
      if (!v) return;
      const st = L.registrationStatus(v);
      openForm({
        title: st ? 'Registration renewed' : 'Registration (tabs)',
        fields: [
          { name: 'regExpires', label: 'Expires (the date on your new sticker)', type: 'date', required: true },
          ...FIELDS.slice(0, 2)
        ],
        initial: { regExpires: st ? L.renewedRegistration(v) : '', plate: v.plate || '', plateState: v.plateState || '' },
        okLabel: 'SAVE',
        onSubmit: (f) => {
          if (!L.parseDate(f.regExpires)) return 'Pick the date your registration expires.';
          Object.assign(v, fromForm(f, L));
          persist();
          render();
          toast('REGISTRATION SAVED');
        }
      });
    }

    // What the due lists show: {status, label, sub, when, action}
    function item(v) {
      const st = L.registrationStatus(v);
      const plate = v.plate ? `plate ${v.plate}${v.plateState ? ' · ' + v.plateState : ''}` : '';
      return {
        status: st ? st.status : 'unknown',
        label: st ? st.status : 'no date',
        sub: plate || (st ? 'add your plate in Edit vehicle' : 'add the date your tabs expire'),
        when: st ? `expires ${st.date} · ${st.when}` : '',
        action: st ? 'renewed' : 'set date'
      };
    }

    return { renew, item };
  }

  return { FIELDS, fromForm, create };
});
