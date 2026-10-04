const assert = require('node:assert/strict');
const C = require('../lib/carlook.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

// Trimmed-down wikitext in the shapes Wikipedia really uses.
const MAIN = `{{Short description|Mid-size car}}
{{Infobox automobile
| name = Toyota Camry
| image = 2018 Toyota Camry front.jpg
| production = 1982–present
}}
== Seventh generation ==
{{Main|Toyota Camry (XV50)}}
== Eighth generation ==
{{Main|Toyota Camry (XV70)}}
See also [[Toyota Camry Solara]] and [[Dodge Ramcharger]].`;

const XV50 = `{{Infobox automobile
| name = Toyota Camry (XV50)
| image = [[File:2012 Toyota Camry.jpg|280px]]
| production = August 2011 – 2017
| model_years = 2012–2017
| wheelbase = {{convert|2775|mm|in|1|abbr=on}}
| length = {{convert|4805|mm|in|1|abbr=on}}
| width = {{convert|1820|mm|in|1|abbr=on}}
| height = {{convert|1470|mm|in|1|abbr=on}}
}}`;

const XV70 = `{{Infobox automobile
| name = Toyota Camry (XV70)
| image = 2018 Toyota Camry (ASV70R) Ascent sedan (2018-08-27) 01.jpg
| production = {{ubl
  | June 2017 – December 2023 (Japan)<ref>{{cite news |url=x |title=y}}</ref>
  | June 2017 – April 2024 (US)
  }}
| model_years = 2018–2024 <!-- US -->
| wheelbase = {{convert|2825|mm|in|1|abbr=on}}
| length = {{ubl|{{convert|4880|mm|in|1|abbr=on}} (L/LE)|{{convert|4905|mm|in|1|abbr=on}} (SE)}}
| width = {{cvt|72.4|in|mm}}
| height = {{convert|1,445|mm|in|1|abbr=on}}
}}`;

function fakeWiki(pages, files = {}) {
  const calls = [];
  const getJson = async (url) => {
    const q = Object.fromEntries(new URL(url).searchParams);
    calls.push(q);
    if (q.list === 'search') return { query: { search: [] } };
    if (q.prop === 'imageinfo') {
      const f = files[q.titles];
      return { query: { pages: [f ? { title: q.titles, imageinfo: [f] } : { title: q.titles, missing: true }] } };
    }
    const title = q.titles;
    const text = pages[title];
    if (text == null) return { query: { pages: [{ title, missing: true }] } };
    return { query: { pages: [{ title, revisions: [{ slots: { main: { content: text } } }] }] } };
  };
  return { getJson, calls };
}

(async () => {
  await test('infobox values: dimensions in mm, inches, ranges and per-variant lists', () => {
    const [ib] = C.findInfoboxes(XV70);
    assert.deepEqual(C.dimsOf(ib.params, 'sedan'), { L: 4.88, W: 1.839, H: 1.445, wb: 2.825 });
    assert.deepEqual(C.yearRange(ib.params, 2026), [2018, 2024]);
    assert.equal(C.imageOf(ib.params), '2018 Toyota Camry (ASV70R) Ascent sedan (2018-08-27) 01.jpg');
    const [ib2] = C.findInfoboxes(XV50);
    assert.equal(C.imageOf(ib2.params), '2012 Toyota Camry.jpg');
    assert.equal(C.lengths('{{convert|4500-4510|mm|in|1|abbr=on}}')[0].m, 4.5);
    assert.equal(C.lengths('{{cvt|204.1|-|244.1|in|mm}}')[0].m.toFixed(3), '5.184');
  });

  await test('production dates count as a year later for model years; "present" is open', () => {
    assert.deepEqual(C.yearRange({ production: '1982–present' }, 2026), [1982, 2028]);
    assert.deepEqual(C.yearRange({ production: 'March 1964 – June 1973' }, 2026), [1964, 1974]);
  });

  await test('body-specific dimensions win when the infobox lists variants', () => {
    const p = { length: "'''Sedan:''' {{convert|4600|mm}}<br>'''Wagon:''' {{convert|4750|mm}}" };
    assert.equal(C.dimsOf(p, 'wagon').L, 4.75);
    assert.equal(C.dimsOf(p, 'sedan').L, 4.6);
    assert.equal(C.dimsOf(p, '').L, 4.6);
  });

  await test('generation links: same-model articles only', () => {
    const links = C.generationLinks(MAIN, 'Toyota Camry', 'Camry');
    assert.deepEqual(links.sort(), ['Toyota Camry (XV50)', 'Toyota Camry (XV70)', 'Toyota Camry Solara']);
  });

  await test('finds the generation for the model year, with its real size and photo', async () => {
    const { getJson } = fakeWiki(
      { 'Toyota Camry': MAIN, 'Toyota Camry (XV50)': XV50, 'Toyota Camry (XV70)': XV70 },
      { 'File:2018 Toyota Camry (ASV70R) Ascent sedan (2018-08-27) 01.jpg': {
        thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ac/x.jpg/960px-x.jpg?utm_source=en.wikipedia.org',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:x.jpg',
        extmetadata: { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:OSX">OSX</a>' }, LicenseShortName: { value: 'Public domain' } }
      } }
    );
    const look = await C.findLook({ year: 2019, make: 'Toyota', model: 'Camry', body: 'sedan' }, getJson);
    assert.equal(look.title, 'Toyota Camry (XV70)');
    assert.deepEqual(look.years, [2018, 2024]);
    assert.deepEqual(look.dims, { L: 4.88, W: 1.839, H: 1.445, wb: 2.825 });
    assert.equal(look.photo.url, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ac/x.jpg/960px-x.jpg');
    assert.equal(look.photo.credit, 'OSX');
    assert.equal(look.photo.license, 'Public domain');
    assert.equal(look.url, 'https://en.wikipedia.org/wiki/Toyota_Camry_(XV70)');

    const older = await C.findLook({ year: 2014, make: 'Toyota', model: 'Camry' }, getJson);
    assert.equal(older.title, 'Toyota Camry (XV50)');
    assert.equal(older.dims.L, 4.805);
    assert.equal(older.photo, null); // no file info for that image
  });

  await test('a generation found inside the main article is named after the model', async () => {
    const outback = `{{Infobox automobile
| name = Subaru Outback
| production = 1994–present
}}
== Fourth generation (BR; 2009) ==
{{Infobox automobile
| name = Fourth generation
| model_years = 2010–2014
| length = {{convert|4780|mm|in|abbr=on}}
}}`;
    const { getJson } = fakeWiki({ 'Subaru Outback': outback });
    const look = await C.findLook({ year: 2012, make: 'Subaru', model: 'Outback' }, getJson);
    assert.equal(look.name, 'Subaru Outback · Fourth generation');
    assert.equal(look.dims.L, 4.78);
  });

  await test('nothing that fits resolves to null; an unreachable Wikipedia rejects', async () => {
    const { getJson } = fakeWiki({});
    assert.equal(await C.findLook({ year: 2013, make: 'Harley-Davidson', model: 'FLHX' }, getJson), null);
    assert.equal(await C.findLook({ year: 2013, make: '', model: 'X' }, getJson), null);
    await assert.rejects(C.findLook({ year: 2018, make: 'Toyota', model: 'Camry' }, async () => { throw new Error('offline'); }));
  });

  await test('photos are only taken from Wikimedia', () => {
    assert.ok(C.PHOTO_HOST.test('https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg'));
    assert.ok(!C.PHOTO_HOST.test('https://evil.example/x.jpg'));
    assert.ok(!C.PHOTO_HOST.test('javascript:alert(1)'));
  });

  await test('look key follows year, make and base model', () => {
    assert.equal(C.lookKey({ year: 2018, make: 'Toyota', model: 'Camry LE', baseModel: 'Camry' }), '2018|toyota|camry');
    assert.equal(C.lookKey({ year: 2018, make: 'Toyota', model: 'Camry LE' }), '2018|toyota|camry le');
  });

  console.log(`\n${passed} carlook tests passed`);
})();
