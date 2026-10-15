# Lift Log — notes for Claude

Read this first. It is the full context for working on this repo in a fresh chat.

## What this is
A personal, single-user workout tracker for the owner's iPhone, in the style of Gymverse (which went paid). It is a static web app installed on the iPhone Home Screen (a PWA). Free forever: no paid services, no App Store account, no API keys.

- Live app: https://afm351800.github.io/lift-log/ (GitHub Pages, serves `main` / root). Pushing to `main` publishes it.
- This repo (`afm351800/lift-log`, public) holds only the app. **Never put personal data here.**
- The owner's data lives in a separate PRIVATE repo, `afm351800/lift-log-data` (a single `data.json`). The app writes to it from the phone using a fine-grained GitHub token the owner pasted into the app. Never touch that repo.
- Clean-room: no Gymverse code, images, videos or branding. Exercise library is the public-domain free-exercise-db (in `lib.js`, photos in `images.js`). The body map SVG paths are MIT (`@mjcdev/react-body-highlighter`).

## The owner (how to work with them)
Alexis is a beginner, no coding experience, easily frustrated by complexity. Do everything in chat, never ask them to use Terminal. Explain in plain words, briefly. Brainstorm and get their pick on LOOK changes before big rebuilds. Push updates yourself and tell them what to do on the phone (usually: close and reopen the app while online).

## Design brief (keep consistent)
Ultra-premium dark: deep lacquered brown ombre background, smoked-glass panels, recessed amber/orange accent, white titles, Helvetica-style font (system stack), tiny turquoise accents only, minimal chrome. Routine titles are bold. No decorative trees/branches. No background photo (they accepted the plain brown).

## Files
- `index.html` — the whole app: CSS, markup shell and ~2300 lines of vanilla ES5-style JS in the last `<script>`. This is the source of truth; edit it directly.
- `lib.js` — generated exercise library data. `images.js` — generated base64 exercise photos (`window.IMGDATA`). Don't hand-edit either.
- `sw.js` — service worker (network first, falls back to cache, so the app works offline). Bump `CACHE` when you change the file list.
- `manifest.webmanifest`, `icon-*.png` — install metadata.
- `dev/test/*.js` — jsdom tests. Run: `cd dev && npm install && for t in run run-db run-scan run-local run-sync run-sound run-features; do node test/$t.js | tail -2; done`. Run `node --check` on the extracted script too. All must pass before pushing.

## Architecture (index.html)
- State object `state`; string-template `render()`; click delegation via `data-act` → `A.<action>`; `softRender()` avoids wiping inputs; `go(name, params)` switches views (see the switch in `render()`).
- Data collections: `exercises`, `routines`, `sessions`, `settings` (docs `main`, `body`). `put(col, obj)` / `removeDoc(col, id)` write optimistically.
- Storage adapter: when `window.claude.use('db')` is absent and `window.LIFTLOG_STANDALONE` is true, `localDb()` stores everything in `localStorage` key `liftlog.v1` (this is the real mode on the phone).
- GitHub sync: `SYNC` engine in index.html. After any local write it waits 2.5 s, then PUTs `data.json` to the private data repo through the GitHub contents API. On open it pulls if the remote changed and nothing local is unsent. Config in `localStorage` (`liftlog.sync*`). Backup/restore (copy/paste JSON) is in Settings.
- Body tab: manual report entry form, tap any metric or body part to open its history page (`metricView`). Photo import via Claude exists only in the old Claude-hosted copy; not available here.
- Sounds: `sfx(name)` Web Audio, soft notes (set, exercise, timer, finish); on/off in Settings (`settings.main.sound`).
- Routines seeded for the owner: "1 Push", "2 Pull", "3 Mix". Coach feature was removed (it needed a paid API key).
- Home "Up next" (`upNextId`): the routine after the last finished one, in home-screen order. No calendar.
- Weight nudge (`nudgeFor`): if every set last time hit the top of the rep range, offer +2.5 kg with a one-tap button.
- Live new best (`prCheck` in `A.mark`): beating every earlier finished session shows a top toast, `sfx('pr')`, and sets `set.pr` (optional field).
- Finished workouts are editable from Progress › Workouts › Edit (stepper ctx `h`, changes only that set; can also delete the workout).
- Routine page has Duplicate (`A.dupRoutine`), which opens the copy in the editor.
- Settings tab dot (`syncDot`): green = on GitHub, orange = waiting/offline, red = GitHub refused (token). Only shown when sync is connected.

## Rules for changes
1. **Data safety first.** If you change the shape of stored data (sessions, routines, settings, body log), write a migration that converts the OLD shape when loaded, and test it against old-shaped data, not only empty data. Never drop fields the user already has.
2. The owner's phone keeps data in Safari storage for the Home Screen app, mirrored to the private repo. Changing the app code never touches that data.
3. Keep it a single static site with no build step and no external services. Don't add paid APIs.
4. After editing: run the tests, then commit and push to `main`. Pages redeploys in ~1 minute.
5. Check the layout at phone width (390 px). Playwright + Chromium work for screenshots (serve the folder with `python3 -m http.server`).

## iPhone limits to remember (tell the owner honestly)
No background sync (it syncs when the app is open and online), no vibration, sounds follow the silent switch, wiping Safari/Home Screen app storage before a sync loses unsynced changes (the "Save now" button in Settings forces a sync). Token in the private-repo link expires (owner chose ~1 year): the app shows an error in Settings when it does.

## Ideas not built yet
Free on-device report scanning, photo background, more sounds/themes, accent colour picker, compact home view, training calendar, per-exercise rest, plate calculator.
