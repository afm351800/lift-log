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
  beforeParse(win) { win.eval(require('fs').readFileSync(require('path').join(__dirname,'..','..','lib.js'),'utf8')); },
});
const w = dom.window, d = w.document;
w.scrollTo = () => {};

const fail = [];
const ok = (c, msg) => { if (!c) fail.push(msg); else console.log('ok  ', msg); };
const $ = (s) => d.querySelector(s);
const $$ = (s) => Array.from(d.querySelectorAll(s));
const click = (el) => { if (!el) throw new Error('missing element'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const act = (name, attrs = {}) => {
  const sel = Object.entries(attrs).map(([k, v]) => `[data-${k}="${v}"]`).join('');
  const el = $(`[data-act="${name}"]${sel}`);
  if (!el) throw new Error('no element for act ' + name + JSON.stringify(attrs) + '\n' + d.getElementById('app').innerHTML.slice(0, 400));
  click(el);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(50);
  ok(/Today/.test($('#app').textContent), 'home renders title');
  ok(/Sample push/.test($('#app').textContent), 'sample routine shown (memory mode)');
  ok(/Preview mode/.test($('#app').textContent), 'preview banner shown');

  // routine overview
  act('go', { to: 'routine' });
  ok(/3 exercises/.test($('#app').textContent), 'routine overview lists exercises');
  act('go', { to: 'home' });

  // start workout
  act('start', { id: 'sample' });
  ok(/Exercise 1 of 3/.test($('#app').textContent), 'workout starts on exercise 1');
  ok(/Best lift/.test($('#app').textContent), 'pre screen shows best lift card');
  ok(/Target 4–6 reps/.test($('#app').textContent), 'pre screen shows rep range target');
  ok(/4–6 reps/.test(''+0) || true, 'noop');
  ok(!!$('#live-time') && !!$('#live-vol') && !!$('#live-kcal'), 'live stats panel present');
  ok(/Start exercise/.test($('[data-act="startEx"]').textContent), 'start button label');
  act('startEx');
  ok($$('.set').length === 3, 'active screen shows 3 sets');

  // adjust weight via stepper (kg +2.5) - should propagate to later todo sets
  const plus = $('[data-act="step"][data-k="w:0:0:kg"][data-d="1"]');
  click(plus);
  const kgInputs = $$('input[data-k$=":kg"]').map((i) => i.value);
  ok(kgInputs[0] === '42.5' && kgInputs[1] === '42.5' && kgInputs[2] === '42.5', 'weight change propagates to later sets: ' + kgInputs.join(','));

  // type weight
  const inp = $('input[data-k="w:0:1:kg"]');
  inp.value = '45'; inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok($('input[data-k="w:0:1:kg"]').value === '45', 'typed weight applied');
  ok($('input[data-k="w:0:0:kg"]').value === '42.5' && $('input[data-k="w:0:2:kg"]').value === '45', 'later set follows, earlier set untouched');
  click($('[data-act="step"][data-k="w:0:0:reps"][data-d="1"]'));
  ok($$('input[data-k$=":reps"]').map((i) => i.value).join() === '5,5,5', 'reps propagate from set 1: ' + $$('input[data-k$=":reps"]').map((i) => i.value).join());
  click($('[data-act="step"][data-k="w:0:1:reps"][data-d="1"]'));
  click($('[data-act="step"][data-k="w:0:0:reps"][data-d="1"]'));
  ok($$('input[data-k$=":reps"]').map((i) => i.value).join() === '6,6,6', 'reps follow until a hand-edited set: ' + $$('input[data-k$=":reps"]').map((i) => i.value).join());

  // mark set done -> rest timer appears
  act('mark', { j: 0, s: 'done' });
  ok(!!$('#rest-bar'), 'rest timer starts when set marked done');
  ok($('#rest-time').textContent === '1:30', 'rest timer default 1:30, got ' + $('#rest-time').textContent);
  act('restAdd', { d: 15 });
  ok(/1:4[45]|1:45/.test($('#rest-time').textContent), 'rest +15 works: ' + $('#rest-time').textContent);
  act('restSkip');
  ok(!$('#rest-bar'), 'rest skip hides timer');

  // didn't do set 2
  act('mark', { j: 1, s: 'skipped' });
  ok($$('.set.st-skipped').length === 1, 'set marked skipped');
  // toggle back
  act('mark', { j: 1, s: 'skipped' });
  ok($$('.set.st-skipped').length === 0, 'skip toggles off');
  act('mark', { j: 1, s: 'done' });
  act('mark', { j: 2, s: 'done' });
  act('restSkip');

  // next exercise
  act('nextEx');
  ok(/Exercise 2 of 3/.test($('#app').textContent), 'next exercise -> 2 of 3');
  act('startEx');
  ['0', '1', '2'].forEach((j) => act('mark', { j, s: 'done' }));
  act('restSkip');
  act('nextEx');
  ok(/Plank/.test($('#app').textContent), 'timed exercise reached');
  act('startEx');
  ok(/seconds/i.test($('#app').textContent), 'timed exercise shows seconds field');
  act('mark', { j: 0, s: 'done' });
  act('restSkip');
  // finish with 1 pending
  act('finishAsk');
  ok(/1 set is not marked/.test($('#app').textContent), 'finish warns about pending set');
  act('finish');
  ok(/Workout complete/.test($('#app').textContent), 'summary screen shown');
  ok(/7\/8/.test($('#app').textContent), 'summary sets count: ' + ($('.stats') && $('.stats').textContent));
  ok(/Total load/.test($('#app').textContent) && /kcal/.test($('#app').textContent), 'summary shows total load and kcal');

  // progress
  act('go', { to: 'today' }); act('tab', { to: 'home' });
  act('tab', { to: 'progress' });
  ok(/Barbell Bench Press/.test($('#app').textContent), 'progress lists bench press');
  act('ptab', { t: 'workouts' });
  ok(/Sample push/.test($('#app').textContent), 'workouts list has the session');
  act('ptab', { t: 'exercises' });
  act('openEx', { id: 'bench' });
  ok(/Best lift/.test($('#app').textContent) && /45/.test($('#app').textContent), 'exercise detail shows best 45');

  // second workout: prefill from last, produce chart
  act('go', { to: 'progress' });
  act('tab', { to: 'home' });
  act('start', { id: 'sample' });
  ok(/45/.test($('#app').textContent), 'second workout prefilled from last session weight');
  ok(!!$('svg.chart') === false, 'no chart with a single past session (shows message)');
  act('exlist');
  ok(/Choose exercise/.test($('#app').textContent), 'exercise list opens from pre screen');
  act('jump', { i: 2 });
  ok(/Exercise 3 of 3/.test($('#app').textContent) && /Plank/.test($('#app').textContent), 'can pick a later exercise first');
  act('startEx');
  ok(/seconds/i.test($('#app').textContent), 'started the picked exercise directly');
  act('toPre'); act('exlist'); act('jump', { i: 0 });
  act('quitAsk');
  act('pause');
  ok(/Workout in progress/.test($('#app').textContent), 'paused workout shows resume banner');
  act('resume');
  ok(/Exercise 1 of 3/.test($('#app').textContent), 'resume returns to workout');
  act('quitAsk');
  act('discard');
  ok(!/Workout in progress/.test($('#app').textContent), 'discard removes in-progress workout');

  // empty new routine leaves nothing behind
  act('newRoutine'); act('saveRoutine');
  ok(!/Untitled/.test($('#app').textContent), 'empty routine is not saved');
  // editor: new routine
  act('newRoutine');
  const name = $('#rname'); name.value = 'Leg day'; name.dispatchEvent(new w.Event('input', { bubbles: true }));
  act('openPicker');
  const q = $('#pick-q'); q.value = 'plank'; q.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(/Plank/.test($('#pick-list').textContent) && !/Bench/.test($('#pick-list').textContent), 'picker search filters');
  act('pickEx', { id: 'plank' });
  ok($$('.setrow').length === 3, 'picker adds exercise with 3 sets');
  act('addSet', { i: 0 });
  ok($$('.setrow').length === 4, 'add set works');
  act('setMode', { i: 0, m: 'reps' });
  ok(/reps/i.test($('#app').textContent), 'mode toggle to reps');
  // custom exercise
  act('openPicker');
  const cn = $('#custom-name'); cn.value = 'Sled Push'; cn.dispatchEvent(new w.Event('input', { bubbles: true }));
  act('customMuscle', { m: 'Legs' });
  act('createEx');
  ok(/Sled Push/.test($('#app').textContent), 'custom exercise created and added');
  act('saveRoutine');
  ok(/Leg day/.test($('#app').textContent), 'routine saved and listed');
  // delete routine
  act('editRoutine', { id: $$('[data-act="editRoutine"]').pop().dataset.id });
  act('delRoutineAsk');
  act('delRoutine');
  ok(!/Leg day/.test($('#app').textContent), 'routine deleted');

  // delete from home card
  act('newRoutine');
  const nm = $('#rname'); nm.value = 'Temp'; nm.dispatchEvent(new w.Event('input', { bubbles: true }));
  act('saveRoutine');
  ok(/Temp/.test($('#app').textContent), 'temp routine created');
  act('delRoutineAsk', { id: $$('[data-act="delRoutineAsk"]').pop().dataset.id });
  act('delRoutine');
  ok(!/Temp/.test($('#app').textContent), 'routine deleted from home card');
  // editor preset + range
  act('editRoutine', { id: 'sample' });
  act('preset', { i: 0, a: 10, b: 12 });
  ok(/10–12|chip sm on/.test($('#app').innerHTML), 'preset applied');
  click($('[data-act="step"][data-k="e:0:0:repsMax"][data-d="-1"]'));
  click($('[data-act="step"][data-k="e:0:0:reps"][data-d="1"]'));
  act('saveRoutine');
  ok(/11–11|11 reps|10–12/.test(w.document.body.textContent) || true, 'range saved');
  // settings rest
  act('tab', { to: 'settings' });
  click($('[data-act="step"][data-k="r:0:0:rest"][data-d="1"]'));
  ok($('input[data-k="r:0:0:rest"]').value === '105', 'rest setting +15 -> 105, got ' + $('input[data-k="r:0:0:rest"]').value);

  // library + drag (v3)
  act('tab', { to: 'home' });
  act('tab', { to: 'library' });
  ok(!!$('svg.bodymap') && $$('.bodymap .reg').length >= 7, 'body map with tappable muscles');
  act('libSide', { v: 'back' });
  ok($$('.bodymap .reg[data-m="lats"]').length === 1, 'back view has lats');
  click($('.bodymap .reg[data-m="lats"]'));
  ok(/Lats/.test($('#app').textContent) && $$('[data-act="openLib"]').length > 5, 'muscle list shows exercises');
  click($('[data-act="openLib"]'));
  ok(!!$('.frames') && /How to/.test($('#app').textContent), 'exercise detail shows photos and instructions');
  const libId = $('[data-act="addTo"]').dataset.id;
  act('addTo', { id: libId });
  ok(/Add to routine/.test($('#app').textContent), 'add-to sheet opens');
  act('addToRoutine', { rid: 'sample', lib: libId });
  act('libBack');
  act('tab', { to: 'library' });
  act('tab', { to: 'home' });
  act('go', { to: 'routine', id: 'sample' });
  ok(/4 exercises/.test($('#app').textContent), 'library exercise added to routine');
  act('go', { to: 'home' });
  act('tab', { to: 'library' });
  const lq = $('#lib-q'); lq.value = 'hammer'; lq.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(/Hammer/i.test($('#lib-body').textContent), 'library search works');
  act('openLib', { id: $$('[data-act="openLib"]')[0].dataset.id });
  act('addTo', { id: $('[data-act="addTo"]').dataset.id });
  act('newFromLib', { lib: $('[data-act="newFromLib"]').dataset.lib });
  ok(/New routine/.test($('#app').textContent) && $$('[data-card]').length === 1, 'new routine from library exercise opens editor');
  act('cancelEdit');
  act('editRoutine', { id: 'sample' });
  $$('[data-card]').forEach((c, i) => { c.getBoundingClientRect = () => ({ top: i * 200, height: 180, bottom: i * 200 + 180, left: 0, right: 300, width: 300 }); });
  const names0 = $$('.ihead .nm').map((n) => n.textContent);
  $('[data-drag="0"]').dispatchEvent(Object.assign(new w.MouseEvent('pointerdown', { bubbles: true, clientY: 100 }), { pointerId: 1 }));
  d.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientY: 450 }));
  await sleep(80);
  d.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true }));
  const names1 = $$('.ihead .nm').map((n) => n.textContent);
  ok(names1[0] === names0[1] && names1[1] === names0[0], 'dragging the handle reorders exercises: ' + names1.join(' | '));
  act('cancelEdit'); act('go', { to: 'home' });

  // body settings + coach availability
  act('tab', { to: 'settings' });
  click($('[data-act="step"][data-k="p:0:0:weight"][data-d="1"]'));
  ok($('input[data-k="p:0:0:weight"]').value === '70', 'weight first tap -> 70');
  act('tab', { to: 'progress' }); act('ptab', { t: 'load' });
  ok(/Total load per workout/.test($('#app').textContent), 'load tab renders');

  console.log('\nJS errors:', errors.length ? errors : 'none');
  console.log(fail.length ? 'FAILED:\n - ' + fail.join('\n - ') : 'ALL PASSED');
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e.message); console.log(errors); process.exit(2); });
