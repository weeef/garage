# Garage Log

A desktop maintenance log for any vehicle. Track services, set mileage/time schedules, see what's due, and keep cost history. Everything is stored locally in one JSON file; nothing leaves your PC.

## Run it

Requires [Node.js](https://nodejs.org) 18+.

```
npm install
npm start
```

Build a Windows installer (output in `dist/Garage-Log-Setup-1.0.0.exe`):

```
npm run dist
```

The installer lets you pick the install folder and adds Desktop and Start Menu shortcuts. It is unsigned, so Windows SmartScreen may show "Windows protected your PC": click **More info**, then **Run anyway**. Your data is kept on uninstall.

Updates: the app checks GitHub Releases for new versions and offers to install them. One-time setup and the publishing steps are in [RELEASING.md](RELEASING.md).

Run the tests: `npm test`

## How it works

- **Vehicles**: add as many as you like (miles or km). Updating the odometer or logging a service with a higher reading moves it forward.
- **Service log**: date, odometer, service, cost, DIY/shop, notes. Export to CSV.
- **Schedules**: "every X miles and/or Y months". A schedule matches log entries by name, so logging "Oil & filter change" resets its countdown. Whichever limit hits first sets the status: ok, soon (within 10% of the interval or 30 days), overdue.
- **VIN lookup**: type or paste a VIN when adding a vehicle and the year, make and model fill in automatically (free NHTSA database, needs internet; you can always fill details by hand). A VIN whose check digit doesn't match gets a warning, in case of a typo.
- **Dashboard**: odometer, total spend, last 12 months, cost per mile, what's due, recent work.
- **3D car**: the dashboard shows a 3D model you can drag to spin, shaped by the body style from the VIN decode (sedan, coupe, hatchback, wagon, SUV, pickup, van, convertible, motorcycle) and painted the color set in Edit vehicle. It's a styled model of the body type, not the exact make and model. Built with three.js (`lib/vendor/`, MIT license), so it works offline.
- **CARFAX import**: Service log > Import CARFAX. Copy your vehicle's service history from carfax.com (Ctrl+A, Ctrl+C) and paste it in; you get a preview of the records found, mapped onto your schedule names, and pick what to add.
- **Phone sync**: Data > Phone sync. Connect the desktop and phone apps with the same GitHub token (gist permission only); they sync through a private gist on your account and merge changes from both sides.
- **Data tab**: JSON backup and restore, app version and Check for updates.

Data file location: `%APPDATA%\Garage Log\garage-log.json` (a `.bak` copy is kept on each save). Sync settings are in `sync.json` next to it, with the token encrypted by Windows.

## Layout

```
main.js          Electron main process, file storage, dialogs
preload.js       Safe bridge to the renderer
lib/logic.js     Due-date and stats logic (pure, tested)
lib/sync.js      Phone/PC sync: change tracking, merging, GitHub Gist client (shared with mobile)
lib/carfax.js    Reads service records from pasted CARFAX text (shared with mobile)
lib/car3d.js     3D car model and viewer, body style from the VIN (shared with mobile)
lib/vendor/      three.js r159 (bundled, so no internet is needed)
mobile/          Phone version (installable web app), served from GitHub Pages
renderer/        UI (index.html, styles.css, app.js)
test/            Logic tests
```
