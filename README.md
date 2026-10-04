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

Run the tests: `npm test` (also checks the phone app is level with the desktop app). Check the code: `npm run lint`.

## How it works

- **Vehicles**: add as many as you like (miles or km). Updating the odometer or logging a service with a higher reading moves it forward.
- **Service log**: date, odometer, service, cost, DIY/shop, notes. Everything done on the same day is shown as one visit with its total. Attach PDF receipts to a visit (+ RECEIPT) or to an entry when adding or editing it; a shop invoice imported from a PDF keeps that PDF. Receipts are stored on the device they were added on (PC: the app's data folder; phone: the app's storage): the list syncs, the files don't, and JSON backups don't include them. Export to CSV.
- **Schedules**: "every X miles and/or Y months". A schedule matches log entries by name, so logging "Oil & filter change" resets its countdown. Whichever limit hits first sets the status: ok, soon (within 10% of the interval or 30 days), overdue.
- **VIN lookup**: type or paste a VIN when adding a vehicle and the year, make and model fill in automatically (free NHTSA database, needs internet; you can always fill details by hand). A VIN whose check digit doesn't match gets a warning, in case of a typo.
- **Dashboard**: odometer, total spend, last 12 months, cost per mile, what's due, recent work.
- **3D car**: the dashboard shows a 3D model you can drag to spin, shaped by the body style from the VIN decode (sedan, coupe, hatchback, wagon, SUV, pickup, van, convertible, motorcycle) and painted the color set in Edit vehicle. Once the year, make and model are known (from the VIN or typed in), Garage Log finds that exact generation on Wikipedia (e.g. a 2018 Camry is the XV70) and builds the model to its real length, width, height and wheelbase. A real photo of that generation is shown next to it: tap the thumbnail to flip between the photo and the 3D model. Photos come from Wikimedia Commons and are credited on screen. The model is still a styled body of that type, not a scan of the exact car. Built with three.js (`lib/vendor/`, MIT license); the 3D model works offline once the dimensions have been found.
- **Real 3D model**: "real model" under the car searches [Sketchfab](https://sketchfab.com) for your year, make and model and shows the matches; pick the one that is your car and the dashboard shows that real model, scaled to the car's real length, with the author credited. Downloading needs a free Sketchfab account: paste your API token once (Sketchfab > Settings > Password & API); on the PC it's stored encrypted and only sent to Sketchfab. Models are kept on each device (PC: the app's data folder; phone: browser storage). Coverage depends on what Sketchfab's community has made, so "use the generated car" is always there.
- **Registration and plate**: Edit vehicle has the license plate, state and the date your registration (tabs) expires. The due list shows it like a service item: OK, due soon (30 days) or overdue, with RENEWED to roll it forward a year. The plate shows by the vehicle's name, as a card next to the 3D car in the style of your state's current standard plate (all 50 states and DC: colors, wording and main graphic, following Wikipedia's descriptions of each state's plates; drawn in their style, not copies of the artwork), and on the car itself: real models get it mounted on the flattest spot at the middle of each bumper (the plate recess, usually), generated cars on their bumpers.
- **Import records**: Service log > Import records. Open a shop's invoice PDF (Les Schwab, Discount Tire, Jiffy Lube, dealers...) or paste an email receipt, text copied from a photo of a paper receipt, or a CARFAX service history page. The app reads the date, mileage, shop and line items, maps the work onto your schedule names, folds fees and tax into the cost so totals match the invoice, and shows a preview before anything is added. PDFs are read with pdf.js (`lib/vendor/`, Apache-2.0).
- **Phone sync**: Data > Phone sync. Connect the desktop and phone apps with the same GitHub token (gist permission only); they sync through a private gist on your account and merge changes from both sides.
- **Fuel**: an optional fuel log on its own Fuel tab, with a fuel card on the dashboard. Import gas receipts (PDFs, as many as you like at once or dragged onto the window; an emailed receipt; or the text of a paper slip copied with your phone's camera) or add fill-ups by hand. Costco gas receipts saved from costco.com (Orders & Purchases) are read in full: date and time, gallons, price per gallon, grade, total and warehouse. Everything found is listed for one check before it's added, and receipts already in the log are skipped. Member and card numbers are never stored. Shows this year's fuel spend, an estimate per year and per month, all-time total, average price per gallon (or liter), fuel economy (mpg or L/100 km, full-tank method), fuel cost per mile and a by-year breakdown. Fill-ups sync between phone and PC and count as odometer readings.
- **Themes**: Data > Appearance. Pick a look for the whole app: Garage (amber, the default), Racing (checkered flag, race red), Gulf, British Green, Rally, Midnight or Showroom (light), or a brand theme (Ford, Chevrolet, Dodge/Ram, Jeep, Toyota, Honda, Subaru, Volkswagen, BMW, Mercedes-Benz, Audi, Porsche, Ferrari, Harley-Davidson; your vehicle's make is suggested first), then change the accent color if you like. Brand themes are color schemes inspired by each maker; they aren't affiliated with or endorsed by them. It changes instantly and is remembered on each device.
- **Updates**: when a new version is out, a banner at the top of the dashboard says so with an UPDATE NOW button (and a slim bar on the other tabs). The PC app checks on start, every 6 hours and when you come back to the window; the phone when it's opened. LATER hides it for 6 hours.
- **Data tab**: JSON backup and restore, app version and Check for updates.

Data file location: `%APPDATA%\Garage Log\garage-log.json` (a `.bak` copy is kept on each save). Sync settings are in `sync.json` next to it, with the token encrypted by Windows.

## Layout

```
main.js           Electron main process: file storage, dialogs, VIN and Wikipedia look-ups, updates
preload.js        Safe bridge to the renderer
renderer/         Desktop UI (index.html, styles.css, app.js)
mobile/           Phone version (installable web app), served from GitHub Pages
mobile/lib/       Generated: copies of lib/ for the phone app (npm run sync-version; not committed)
lib/              Code shared by both apps:
  logic.js          due dates, stats, VIN decoding (pure, tested)
  sync.js           phone/PC sync: change tracking, merging, GitHub Gist client
  carfax.js         reads service records from CARFAX text
  workorder.js      reads shop work orders, invoices and receipts
  fuel.js           reads gas receipts; fuel cost, yearly estimate and economy
  car3d.js          the 3D car model and viewer
  carlook.js        finds the vehicle generation, real dimensions and photo on Wikipedia
  themes.js         color themes and the Appearance picker
  updatebanner.js   the "new version" prompt
  replica.js        real car models from Sketchfab: search results, downloads, fitting a model to the car
  ui-replica.js     the real-model picker
  ui-registration.js registration (tabs) and license plate
  ui-receipts.js    PDF receipts on service entries
  plates.js         license plates in the style of each US state
  ui-car.js         the dashboard car: 3D stage, photo, background look-ups
  ui-fuel.js        fuel form, receipt import, delete, dashboard fuel card
  ui-import.js      PDF reading and the service-record import dialog
  updater.js        desktop auto-update (Electron only)
  vendor/           three.js r159 (+ its GLTFLoader), pdf.js 3.11 and fflate (bundled, loaded when first needed)
scripts/          Release helpers: version sync, phone-app checks and publishing
test/             Tests (npm test runs every *.test.js)
```
