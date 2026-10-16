// Up next, weight nudge, live new best, edit/delete a finished workout, duplicate routine, save dot.
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
const finishAll = () => {
  for (let i = 1; i < 3; i++) {
    act('jump', { i }); act('startEx');
    $$('.set').forEach((el, j) => { if (!/Done/.test(el.querySelector('.set-s').textContent)) act('mark', { j, s: 'done' }); });
  }
  act('finishAsk'); act('finish');
};
const nextCard = () => { const c = $('.rcard.next'); return c ? c.querySelector('.rname').textContent : ''; };

(async () => {
  await sleep(50);
  ok(!$('.rcard.next'), 'no Up next with a single routine');
  ok(!$('.sdot'), 'no save dot when GitHub is not connected');

  // duplicate
  act('go', { to: 'routine', id: 'sample' });
  act('dupRoutine', { id: 'sample' });
  ok(/Customize/.test(txt()) && $('#rname').value === 'Sample push copy', 'duplicate opens the editor on the copy');
  ok($$('.cmp').length === 3, 'copy has the same 3 exercises');
  act('saveRoutine');
  ok($$('.rcard').length === 2, 'home shows original and copy');
  ok(nextCard() === 'Sample push', 'Up next is the first routine before any workout');

  // first workout on Sample push: bench 3 sets at 40 kg x 6 (top of 4-6)
  act('start', { id: 'sample' });
  ok(!$('.nudge'), 'no weight nudge without history');
  act('startEx');
  click($('[data-act="step"][data-k="w:0:0:reps"][data-d="1"]'));
  click($('[data-act="step"][data-k="w:0:0:reps"][data-d="1"]'));
  for (let j = 0; j < 3; j++) act('mark', { j, s: 'done' });
  ok(!$('.toast.top'), 'no new best on the very first session');
  finishAll();
  act('go', { to: 'today' }); act('tab', { to: 'home' });
  ok(nextCard() === 'Sample push copy', 'Up next moves to the routine after the one just done');

  // second workout: nudge to 42.5 kg
  act('start', { id: 'sample' });
  ok(!!$('.nudge') && /42\.5 kg/.test($('.nudge').textContent), 'weight nudge suggests 42.5 kg');
  act('applyNudge');
  const kgs = $$('input[data-k^="w:0:"][data-k$=":kg"]').map((i) => i.value);
  ok(kgs.every((v) => v === '42.5'), 'nudge sets all sets to 42.5 kg: ' + kgs.join(','));
  ok(!$('.nudge'), 'nudge disappears once applied');
  act('startEx');
  act('mark', { j: 0, s: 'done' });
  ok(!!$('.toast.top') && /New best · 42\.5 kg x 6/.test($('.toast.top').textContent), 'new best toast during the workout');
  ok(/Done · New best/.test($$('.set')[0].textContent), 'set is labelled New best');
  act('mark', { j: 1, s: 'done' });
  ok(!/New best/.test($$('.set')[1].textContent), 'equal set right after is not another best');
  act('mark', { j: 0, s: 'done' });
  ok(!/New best/.test($$('.set')[0].textContent), 'unmarking removes the label');
  act('mark', { j: 0, s: 'done' });
  act('mark', { j: 2, s: 'done' });
  await sleep(3000);
  finishAll();

  // edit a finished workout
  act('go', { to: 'today' }); act('tab', { to: 'home' });
  act('tab', { to: 'progress' });
  act('ptab', { t: 'workouts' });
  const rows = $$('[data-act="openSession"]');
  ok(rows.length === 2, 'two workouts listed');
  click(rows[0]);
  act('sEdit');
  ok(/Fix any number/.test(txt()) && $$('.hset').length > 0, 'edit mode shows each set');
  const kgIn = $('input[data-k="h:0:1:kg"]');
  ok(kgIn && kgIn.value === '42.5', 'set 2 shows 42.5 kg');
  kgIn.value = '45'; kgIn.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok($('input[data-k="h:0:1:kg"]').value === '45', 'typed weight saved');
  ok($('input[data-k="h:0:2:kg"]').value === '42.5', 'other sets unchanged');
  const hs = () => $('[data-act="hStatus"][data-i="0"][data-j="2"]').textContent;
  const seq = [];
  for (let n = 0; n < 3; n++) { act('hStatus', { i: 0, j: 2 }); seq.push(hs()); }
  ok(seq.join('|') === 'Skipped|Not done|✓ Done', 'set status cycles: ' + seq.join('|'));
  act('sEdit');
  ok(/45x6/.test(txt()), 'read view shows the fixed number');
  act('sEdit');
  act('delSessionAsk');
  act('delSession');
  ok($$('[data-act="openSession"]').length === 1, 'deleting removes the workout');

  ok(!errors.length, 'JS errors: ' + (errors.join(' | ') || 'none'));
  if (fail.length) { console.log('FAILED:\n - ' + fail.join('\n - ')); process.exit(1); }
  console.log('errors: none'); console.log('ALL PASSED');
  process.exit(0);
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
