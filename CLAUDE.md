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
- Motion (added 2026-10-16, owner wants it snappy, never laggy): `render()` puts page content in one `.page` wrapper (`wrapPage`); fixed bars, sheet and toast stay outside it. `go()` plays an iOS-style zoom in/out (`fxKind` uses `DEPTH`; the old page is kept as a `.ghost` copy, `playNav`). The four main tabs (`TAB_ORDER`) slide, and swiping left/right follows the finger (touch handlers near `sw`). Only transform and opacity are animated, blur is paused while moving, `endFx()` cancels instantly on the next tap, and nothing runs with reduced motion. If it ever feels slow on the phone, remove the motion rather than tune it.
- Hold timer (2026-10-16): timed exercises (`mode:'time'`) show a slim timer per todo set in `activeView` (`holdHtml`, `holdTick`, actions `holdToggle`/`holdReset`). Started by hand, kept only in memory (`hold`), never linked to Did it. Blip at 10 s, 5-4-3-2-1, bell at 0 (`SFX.ten/tick/ring`).
- Rename exercise (2026-10-16): pencil button on each exercise card in the routine editor opens the `rename` sheet (`renameAsk`/`renameGo`). It stores `ex.lib` first so the photo and form guide stay linked after the name changes.
- Tabs (2026-10-16): Today · Train · Recover · Progress · Settings (`TAB_ORDER`; Train is view `home`, Library opens from Train). Tab bar is one floating pill with a sliding thumb (`.tabtrack`, `.tab-thumb`); drag along it (`td` handlers) or tap any tab; the thumb glides (FLIP in `render()` via `thumbFrom`/`lastThumb`) and follows page swipes. `render()` defers while a finger is dragging (`td`/`sw`) so touches never lose their target.
- Activity log (2026-10-16): cardio (run, swim) and heat/cold (sauna, hammam, cold shower/plunge) live in settings doc `acts` = `{ id:'acts', log:[{id,t,ts,min,effort?,stroke?,dist?,rounds?,temp?,kind?}] }`, so backup and GitHub sync carry it with no plumbing. Log sheet = sheet type `lg`, stepper ctx `x` (`state.lg`). Calories = Compendium MET x weight (Settings) x hours, shown as a range. Logging cold within 6 h after lifting shows a gentle note.
- Living body map (2026-10-16): `loadEvents` turns finished sessions (and the active one) plus cardio into per-muscle load (main muscle 1, helpers about 0.5, per done set; `exWeights`, `HELP`, `CARDIO_W`). Load fades over `REC_H` hours (back/legs 72, chest/shoulders 48, arms ~36-42). `heatAt` -> 0..1, `heatFill` grey->amber->red. Figure = library outline drawn 10% narrower with plain head/hands (`heatSvg`). Recover tab has a time slider (`state.recT`, updates fills in place via `updateRecMap`).
- Today plan (2026-10-16): `planDays(n)` simulates the next days: first routine in rotation whose main muscles are under 0.35 heat; after 3 lifting days in a row, or 5+ days without cardio after 2 lifting days, it plans cardio (an easy swim if legs are tired) or rest. Train's "Up next" follows the same plan. Reminders: stall tip and long no-cardio tip, hideable for the day (localStorage `liftlog.tipsOff`).
- Stall detector: `stallOf` = sessions since the last new best by estimated 1RM (>= 3 -> tip on Today and on the exercise page).
- Share card: `shareSession` draws a 1080x1920 PNG on a canvas (worked-muscle map, time/sets/kg, only real wins), shares via the iOS share sheet, falls back to an image sheet.
- Each side: routine item `sides:true` (editor chip, time mode only), copied to the session item; the hold timer runs side 1, a 5 s "Switch sides" gap, then side 2.
- Settings tab dot (`syncDot`): green = on GitHub, orange = waiting/offline, red = GitHub refused (token). Only shown when sync is connected.

## Rules for changes
1. **Data safety first.** If you change the shape of stored data (sessions, routines, settings, body log), write a migration that converts the OLD shape when loaded, and test it against old-shaped data, not only empty data. Never drop fields the user already has.
2. The owner's phone keeps data in Safari storage for the Home Screen app, mirrored to the private repo. Changing the app code never touches that data.
3. Keep it a single static site with no build step and no external services. Don't add paid APIs.
4. After editing: run the tests, then commit and push to `main`. Pages redeploys in ~1 minute.
5. Check the layout at phone width (390 px). Playwright + Chromium work for screenshots (serve the folder with `python3 -m http.server`).

## iPhone limits to remember (tell the owner honestly)
No background sync (it syncs when the app is open and online), no vibration, sounds follow the silent switch, wiping Safari/Home Screen app storage before a sync loses unsynced changes (the "Save now" button in Settings forces a sync). Token in the private-repo link expires (owner chose ~1 year): the app shows an error in Settings when it does.

## Ideas tried and dropped
AI coach (2026-10-15): the owner only has Claude Pro (no API). A Claude-hosted page can call Claude on the Pro plan, but tested: it cannot fetch api.github.com (blocked), so it can't share data with this app without copy/paste. Owner chose to drop the coach idea entirely. Don't re-propose unless asked.

## Ideas not built yet
Free on-device report scanning, photo background, more sounds/themes, accent colour picker, compact home view, training calendar, per-exercise rest, plate calculator, strength levels, shared multi-person data repo (discussed with the owner, not started). "Race your last workout" was dropped by the owner.
