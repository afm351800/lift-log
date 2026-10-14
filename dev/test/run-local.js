const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8').replace(/<link[^>]*>/g, '').replace('window.LIFTLOG_STANDALONE = true;', '');
const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.detail || e.message)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = []; const ok = (c, m) => { if (!c) fail.push(m); else console.log('ok  ', m); };
function boot(store) {
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + html + '</body></html>', { url: 'https://example.github.io/lift-log/', runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(win) {
      win.LIFTLOG_STANDALONE = true;
      win.eval(fs.readFileSync(path.join(__dirname, '..', '..', 'lib.js'), 'utf8'));
      win.scrollTo = () => {};
      if (store) win.localStorage.setItem('liftlog.v1', store);
      win.navigator.clipboard = { writeText: async (t) => { win.__clip = t; } };
    } });
  return dom.window;
}
(async () => {
  let w = boot(null), d = w.document; const $ = (s) => d.querySelector(s);
  const click = (el) => { if (!el) throw new Error('missing'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  await sleep(100);
  ok(!d.querySelector('[data-to="coach"]'), 'no Coach tab');
  ok(/Routines/.test($('#app').textContent), 'home renders with local store');
  click($('[data-act="tab"][data-to="progress"]')); click($('[data-act="ptab"][data-t="body"]'));
  click($('[data-act="mfOpen"]'));
  const setv = (id, v) => { const el = $('#mf-' + id); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  setv('date', '2026-10-13'); setv('weight', '73.4'); setv('bodyFat', '19.8'); setv('sm-left_arm', '3.5');
  click($('[data-act="mfSave"]')); await sleep(60);
  ok(/73.4/.test($('#app').textContent) && /Latest/.test($('#app').textContent), 'manual report saved and shown');
  const stored = w.localStorage.getItem('liftlog.v1');
  ok(stored && /73.4/.test(stored), 'written to local storage');
  click($('[data-act="scanOpen"][data-k="weight"]')); await sleep(30);
  ok(/Data points/.test($('#app').textContent), 'history page works');
  // reload: data persists
  const w2 = boot(stored); await sleep(120);
  const d2 = w2.document;
  d2.querySelector('[data-act="tab"][data-to="progress"]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  d2.querySelector('[data-act="ptab"][data-t="body"]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  ok(/73.4/.test(d2.querySelector('#app').textContent), 'data survives a reload');
  // backup copy + restore into a fresh app
  d2.querySelector('[data-act="tab"][data-to="settings"]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  d2.querySelector('[data-act="bkCopy"]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true })); await sleep(30);
  ok(w2.__clip && /"app":"lift-log"/.test(w2.__clip), 'backup copied');
  const w3 = boot(null); await sleep(100); const d3 = w3.document;
  const c3 = (s) => d3.querySelector(s).dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  c3('[data-act="tab"][data-to="settings"]');
  const ta = d3.querySelector('#bk-in'); ta.value = w2.__clip; ta.dispatchEvent(new w3.Event('input', { bubbles: true }));
  c3('[data-act="bkAsk"]'); c3('[data-act="bkGo"]'); await sleep(60);
  c3('[data-act="tab"][data-to="progress"]'); c3('[data-act="ptab"][data-t="body"]');
  ok(/73.4/.test(d3.querySelector('#app').textContent), 'restore brings the report back');
  console.log('errors:', errors.length ? errors : 'none'); console.log(fail.length ? 'FAILED:\n - ' + fail.join('\n - ') : 'ALL PASSED');
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
