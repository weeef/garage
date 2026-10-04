# Releasing updates

Garage Log updates itself from **GitHub Releases**. You publish a new version once; the desktop app and the phone app both pick it up.

## One-time setup

1. Create a **public** GitHub repository, e.g. `garage-log`. (Public is simplest: the app contains no secrets and your data stays on your devices. A private repo would need a token inside the app, which is not recommended.)
2. Point the app at it:
   ```
   npm run set-repo -- yourname/garage-log
   ```
3. Build and install once, so this copy knows where to look for updates:
   ```
   npm install
   npm run dist
   ```
   then run `dist\Garage-Log-Setup-<version>.exe`. (Updates only start working from a build made after step 2. Your data is kept when you reinstall.)
4. Optional, for one-command publishing: create a GitHub token (Settings > Developer settings > Fine-grained tokens, your repo only, **Contents: Read and write**) and save it in PowerShell with `setx GH_TOKEN "your-token"`, then open a new terminal.

## Shipping a new version

1. Finish the new features, then bump the version:
   ```
   npm version minor --no-git-tag-version      (or: patch)
   ```
2. Publish the desktop app, either way:
   - **One command** (needs the token from step 4): `npm run release`. It builds the installer and publishes the release for you.
   - **By hand:** `npm run dist`, then on GitHub go to Releases > Draft a new release. Use the tag `v<version>` (e.g. `v1.2.0`, matching package.json), attach these three files from `dist\`, and click **Publish release** (not "Save draft"):
     `Garage-Log-Setup-<version>.exe`, `Garage-Log-Setup-<version>.exe.blockmap`, `latest.yml`
3. Publish the phone app: `npm run release` already does this (it runs `npm run publish-mobile`, which pushes the `mobile` folder to the `gh-pages` branch served at https://weeef.github.io/garage/). If you published the desktop app by hand, run `npm run publish-mobile` yourself.
   The phone app is kept level with the desktop app automatically: `npm run sync-version` copies every shared `lib/` file into `mobile/`, and `scripts/check-mobile.js` (part of `npm test`, and run before every build and release) stops the release if the phone app is missing a shared file, a version bump, or a feature the desktop app has.

## What users see

- **Desktop:** within a few seconds of launch (and every 6 hours), or via Data > Check for updates, an amber bar says "Version X is available". DOWNLOAD, then RESTART & INSTALL. A downloaded update also installs when you close the app. Data is never touched (it lives in `%APPDATA%\Garage Log`).
- **Phone:** when the app is opened it looks for a new version in the background and shows "A new version is ready. RELOAD". Data > Check for updates does it on demand.

## Troubleshooting

- *"No published release found"*: the release is still a draft, the tag does not match package.json (`v1.2.0` for version `1.2.0`), or `latest.yml` was not attached.
- *Nothing happens on the desktop:* the version in package.json must be higher than the installed one, and the installed copy must have been built after `set-repo`.
- *Check for updates says "only work in the installed app":* you are running with `npm start`. Use the installed app.
- Windows SmartScreen may warn about the unsigned installer. Click More info, then Run anyway.
