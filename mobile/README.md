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

## Moving data between desktop and phone

Both apps use the same JSON backup format. In either app: **Data > Export backup**, then **Import backup** in the other. Importing replaces everything in the app you import into.

## Things to know

- Data is stored in the browser on that device (localStorage). Clearing site data or uninstalling the web app deletes it. Export a backup now and then.
- On iOS, export uses the share sheet ("Save to Files" works well).
- Updating: bump the version in the parent `package.json`, run `npm run sync-version` (it also runs on every build), and upload the folder again. Installed phones check for a new version when opened and show a RELOAD bar. See `RELEASING.md` in the parent folder.
- `logic.js` is a copy of `../lib/logic.js` (the due-date logic). Keep the two in sync if you change it.

## Files

```
index.html, styles.css, app.js   the app
logic.js                         due-date and stats logic (shared with desktop)
manifest.webmanifest, sw.js      install + offline support
icons/                           app icons
```
