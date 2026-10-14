// Runs the page against a fake `db` capability to check the saving layer.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8').replace(/<link[^>]*>/g, '').replace('window.LIFTLOG_STANDALONE = true;', '');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e.detail || e.message)));

const store = {};          // path -> body
const listeners = {};      // collection -> [fn]
const writes = [];
function snapFor(col) {
  const docs = Object.keys(store).filter((p) => p.startsWith(col + '/')).map((p) => ({
    id: p.split('/')[1], exists: true, data: () => Object.freeze(JSON.parse(JSON.stringify(store[p]))),
  }));
  return { docs, size: docs.length, empty: !docs.length };
}
function emit(col) { (listeners[col] || []).forEach((fn) => fn(snapFor(col))); }
const fakeDb = {
  collection(col) {
    return { onSnapshot(next) { (listeners[col] = listeners[col] || []).push(next); setTimeout(() => next(snapFor(col)), 5); return () => {}; } };
  },
  doc(p) {
    const col = p.split('/')[0];
    return {
      async set(data) { writes.push(['set', p]); await new Promise((r) => setTimeout(r, 10)); store[p] = JSON.parse(JSON.stringify(data)); emit(col); },
      async delete() { writes.push(['delete', p]); await new Promise((r) => setTimeout(r, 10)); delete store[p]; emit(col); },
    };
  },
};

// seed like the real seeding will
store['exercises/bench'] = { id: 'bench', name: 'Barbell Bench Press', muscle: 'Chest' };
store['routines/push'] = { id: 'push', name: '1 Push', order: 1, items: [{ exId: 'bench', mode: 'reps', sets: [{ kg: 0, reps: 5, secs: 0 }, { kg: 0, reps: 5, secs: 0 }] }] };

const dom = new JSDOM('<!doctype html><html><head></head><body>' + html + '</body></html>', {
  runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
  beforeParse(win) { win.eval(require('fs').readFileSync(require('path').join(__dirname,'..','..','lib.js'),'utf8')); win.claude = { use: async (n) => (n === 'db' ? fakeDb : null) }; win.scrollTo = () => {}; },
});
const w = dom.window, d = w.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); else console.log('ok  ', m); };

(async () => {
  ok(/Skeleton|skel/.test(d.getElementById('app').innerHTML), 'loading skeleton shown before data arrives');
  await sleep(100);
  const t = d.getElementById('app').textContent;
  ok(/1 Push/.test(t), 'routine from db rendered');
  ok(!/Preview mode/.test(t), 'no preview banner in db mode');

  click(d.querySelector('[data-act="start"]'));
  click(d.querySelector('[data-act="startEx"]'));
  click(d.querySelector('[data-act="mark"][data-j="0"][data-s="done"]'));
  await sleep(80);
  const sess = Object.keys(store).filter((p) => p.startsWith('sessions/'));
  ok(sess.length === 1, 'session document written');
  ok(store[sess[0]].items[0].sets[0].status === 'done', 'set status saved to db');
  const before = writes.length;
  // several quick edits should coalesce, one write at a time
  for (let i = 0; i < 5; i++) click(d.querySelector('[data-act="step"][data-k="w:0:1:kg"][data-d="1"]'));
  await sleep(120);
  ok(writes.length - before <= 3, 'rapid edits coalesced (' + (writes.length - before) + ' writes for 5 taps)');
  ok(store[sess[0]].items[0].sets[1].kg === 12.5, 'latest weight saved: ' + store[sess[0]].items[0].sets[1].kg);

  click(d.querySelector('[data-act="mark"][data-j="1"][data-s="done"]'));
  click(d.querySelector('[data-act="restSkip"]'));
  click(d.querySelector('[data-act="finishAsk"]'));
  click(d.querySelector('[data-act="finish"]'));
  await sleep(80);
  ok(!!store[sess[0]].finishedAt, 'finished session saved');
  ok(/Workout complete/.test(d.getElementById('app').textContent), 'summary shown');

  // settings write
  click(d.querySelector('[data-act="go"][data-to="home"]'));
  click(d.querySelector('[data-act="tab"][data-to="settings"]'));
  click(d.querySelector('[data-act="step"][data-k="r:0:0:rest"][data-d="1"]'));
  await sleep(60);
  ok(store['settings/main'] && store['settings/main'].restSeconds === 105, 'settings saved');

  // discard deletes
  click(d.querySelector('[data-act="tab"][data-to="home"]'));
  click(d.querySelector('[data-act="start"]'));
  await sleep(40);
  click(d.querySelector('[data-act="quitAsk"]'));
  click(d.querySelector('[data-act="discard"]'));
  await sleep(80);
  ok(Object.keys(store).filter((p) => p.startsWith('sessions/')).length === 1, 'discarded session deleted from db');

  console.log('errors:', errors.length ? errors : 'none');
  console.log(fail.length ? 'FAILED:\n - ' + fail.join('\n - ') : 'ALL PASSED');
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
