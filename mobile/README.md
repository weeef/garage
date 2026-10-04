# Garage Log (mobile)

The phone version of Garage Log. It is an installable web app (PWA): one codebase for iPhone and Android, no app store, works offline once loaded. It has the same features as the desktop app: vehicles, service log, schedules with due status, cost stats, CSV export and JSON backup.

## Put it on your phone

An installable web app has to be served over **HTTPS**. Copy this whole `mobile` folder to any static host, for example a `/garage/` folder on jordanbastian.com, GitHub Pages, Netlify or Cloudflare Pages. Then:

- **iPhone / iPad:** open the URL in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the URL in Chrome, tap the menu, then **Install app**.

After the first load it works offline.

## Try it on this PC first

```
cd mobile
npx serve .          (or: python -m http.server 8080)
```

Open `http://localhost:8080` in a desktop browser (device toolbar at phone size). To test on a phone on the same Wi-Fi, use `http://<your-pc-ip>:8080`. That works as a normal web page, but "install" and offline caching need HTTPS.

## VIN lookup

Typing or pasting a VIN when adding a vehicle fills in the year, make and model using the free NHTSA vPIC database. It needs a connection and calls `vpic.nhtsa.dot.gov` directly from the page, so if your host sets its own Content-Security-Policy header, allow that address under `connect-src`. Offline or if the service is down, you just fill the details in by hand.

## Syncing with the desktop app

**Data > PC sync > Connect** in the phone app and **Data > Phone sync > Connect** in the desktop app, using the same GitHub token (create one at github.com/settings/tokens/new with only the **gist** box ticked). The apps keep a copy in a private gist on that GitHub account and merge changes item by item, so edits made on both devices while apart all survive. Sync runs when the app opens, a few seconds after each change, and every few minutes. The logic lives in `sync.js` (a copy of `../lib/sync.js`).

Backups still work too: both apps use the same JSON format. **Export backup** in one, **Import backup** in the other (this replaces everything in the app you import into).

## Importing from CARFAX

**Service log > CARFAX** (or **Data > Import from CARFAX**). Open the vehicle's service history on carfax.com or a CARFAX report, select all the text, copy it and paste it in. The app finds the dated records and maps the work onto your schedule names (e.g. "Oil and filter changed" becomes "Oil & filter change"), then shows a preview so you can choose what to import. Entries already in the log are left unticked. The parser is `carfax.js` (a copy of `../lib/carfax.js`).

## Hosting

`npm run publish-mobile` (also part of `npm run release`) pushes this folder to the repo's `gh-pages` branch, which GitHub Pages serves at https://weeef.github.io/garage/.

## Things to know

- Data is stored in the browser on that device (localStorage). Clearing site data or uninstalling the web app deletes it. Export a backup now and then.
- On iOS, export uses the share sheet ("Save to Files" works well).
- Updating: bump the version in the parent `package.json`, run `npm run sync-version` (it also runs on every build), and upload the folder again. Installed phones check for a new version when opened and show a RELOAD bar. See `RELEASING.md` in the parent folder.
- `logic.js`, `sync.js` and `carfax.js` are copies of the files in `../lib/`. `npm run sync-version` refreshes them; edit the `lib/` originals.

## Files

```
index.html, styles.css, app.js   the app
logic.js                         due-date and stats logic (shared with desktop)
manifest.webmanifest, sw.js      install + offline support
icons/                           app icons
```
