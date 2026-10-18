// Recover tab: coverage map and bars (sets per muscle per week), week chips, time slider, Right now toggle.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8')
  .replace(/<link[^>]*>/g, '').replace('window.LIFTLOG_STANDALONE = true;', '');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.detail || e.message)));
vc.on('error', (e) => errors.push('console.error: ' + e));
const dom = new JSDOM('<!doctype html><html><head></head><body>' + html + '</body></html>', {
  runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
  beforeParse(win) { win.eval(fs.readFileSync(path.join(__dirname, '..', '..', 'lib.js'), 'utf8')); },
});
const w = dom.window, d = w.document;
w.scrollTo = () => {};
const fail = [];
const ok = (c, msg) => { if (!c) fail.push(msg); else console.log('ok  ', msg); };
const $ = (s) => d.querySelector(s);
const $$ = (s) => Array.from(d.querySelectorAll(s));
const txt = () => $('#app').textContent;
const click = (el) => { if (!el) throw new Error('missing element'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const act = (name, attrs = {}) => {
  const sel = Object.entries(attrs).map(([k, v]) => `[data-${k}="${v}"]`).join('');
  const el = $(`[data-act="${name}"]${sel}`);
  if (!el) throw new Error('no element for act ' + name + JSON.stringify(attrs) + '\n' + txt().slice(0, 300));
  click(el);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rowVal = (m) => { const r = $(`.covrow[data-m="${m}"]`); return r ? r.querySelector('.v').textContent : null; };

(async () => {
  await sleep(50);
  act('tab', { to: 'recover' });
  ok(/Coverage/.test(txt()) && $('.seg button.on').textContent === 'Coverage', 'Recover opens on Coverage');
  ok($$('.covrow').length === 14, 'one bar per muscle: ' + $$('.covrow').length);
  ok(/No finished workouts/.test(txt()), 'empty window says so');
  ok($$('#hmaps .hreg').length > 10, 'body map is drawn');

  // one workout: bench x3, overhead press x3, plank
  act('tab', { to: 'home' });
  act('start', { id: 'sample' }); act('startEx');
  for (let j = 0; j < 3; j++) act('mark', { j, s: 'done' });
  for (let i = 1; i < 3; i++) {
    act('jump', { i }); act('startEx');
    $$('.set').forEach((el, j) => { if (!/Done/.test(el.querySelector('.set-s').textContent)) act('mark', { j, s: 'done' }); });
  }
  act('finishAsk'); act('finish');
  act('go', { to: 'today' }); act('tab', { to: 'recover' });

  ok(rowVal('chest') === '3', 'chest shows 3 sets a week: ' + rowVal('chest'));
  ok(rowVal('shoulders') === '4.5', 'shoulders show 3 own + 1.5 helper: ' + rowVal('shoulders'));
  ok(rowVal('triceps') && +rowVal('triceps') > 0, 'helper muscle gets partial credit: ' + rowVal('triceps'));
  ok(rowVal('hamstrings') === '0', 'untrained muscle shows 0');
  ok(/Below goal/.test(txt()) && /Hamstrings/.test($('#cov-sum').textContent), 'summary names muscles below goal');
  ok($$('.covrow.low').length > 0, 'low rows are flagged');

  // tap a muscle
  act('recMuscle', { m: 'chest' });
  ok(/Chest/.test($('#rec-sel').textContent) && /3 sets a week/.test($('#rec-sel').textContent) && /reps in this window/.test($('#rec-sel').textContent), 'chest detail: ' + $('#rec-sel').textContent);
  ok(/Trained by Sample push/.test($('#rec-sel').textContent), 'detail names the routine');
  act('recMuscle', { m: 'chest' });

  // week chips: 4 wk window has only a few days of history, so the average stays 3 and the note appears
  act('recW', { v: 4 });
  ok($('.covctl button.on').textContent === '4 wk', '4 wk chip is on');
  ok(rowVal('chest') === '3' && /of history so far/.test(txt()), 'short history is not diluted: ' + rowVal('chest'));
  act('recW', { v: 1 });

  // slider back a week: the workout falls outside the window
  const sl = $('#cov-e');
  sl.value = '-7'; sl.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok($('#cov-el').textContent !== 'Today', 'slider label moves: ' + $('#cov-el').textContent);
  ok(rowVal('chest') === '0' && /No finished workouts/.test($('#cov-sum').textContent), 'earlier window is empty');
  sl.value = '0'; sl.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(rowVal('chest') === '3' && $('#cov-el').textContent === 'Today', 'back to today restores the numbers');

  // Right now toggle keeps the old tiredness view
  act('recMode', { v: 'now' });
  ok(!!$('#rec-t') && /Recovering|Everything is fresh/.test(txt()) && !$('.covrow'), 'Right now shows the tiredness map and time slider');
  ok(/Heat and cold/.test(txt()), 'Heat and cold stays in both views');
  act('recMode', { v: 'cov' });
  ok(!!$('.covrow') && /Heat and cold/.test(txt()), 'back to Coverage');

  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  if (fail.length) { console.log('\nFAILED:\n' + fail.join('\n')); process.exit(1); }
  console.log('\nall passed'); process.exit(0);
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
