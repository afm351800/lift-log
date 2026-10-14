const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8').replace(/<link[^>]*>/g, '').replace('window.LIFTLOG_STANDALONE = true;', '');
const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.detail || e.message)));
let called = null, n = 0;
const fakeSample = async (turns, opts) => {
  called = opts;
  const t = opts.tools.find((x) => x.name === 'record_body_scan');
  await t.execute({ test_date: n++ ? '2026-10-13 09:00' : '2026-10-06 11:31', weight_kg: n > 1 ? 73.2 : 74, body_fat_percent: 20.4, muscle_mass_kg: 54.9, fat_mass_kg: 15.1, bmi: 24.7, visceral_fat_grade: 5, basal_metabolic_rate_kcal: 1642, body_score: 77, height_cm: 173, age_years: 25, sex: 'male', seg_muscle_kg: { left_arm: 3.4, right_arm: 3.4, trunk: 25.6, left_leg: 9.6, right_leg: 9.6 }, seg_fat_kg: { trunk: 7.5 } });
  return { text: '' };
};
fakeSample.limits = async () => ({ images: { maxCount: 4, maxInputBytes: 2e7, mediaTypes: ['image/png'] }, tools: { maxCount: 8 } });
const dom = new JSDOM('<!doctype html><html><head></head><body>' + html + '</body></html>', { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
  beforeParse(win) { win.eval(fs.readFileSync(path.join(__dirname, '..', '..', 'lib.js'), 'utf8')); win.claude = { use: async (n) => (n === 'sample' ? fakeSample : null) }; win.scrollTo = () => {}; } });
const w = dom.window, d = w.document, $ = (s) => d.querySelector(s), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (el) => { if (!el) throw new Error('missing'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const fail = []; const ok = (c, m) => { if (!c) fail.push(m); else console.log('ok  ', m); };
(async () => {
  await sleep(80);
  click($('[data-act="tab"][data-to="progress"]')); click($('[data-act="ptab"][data-t="body"]'));
  ok(!!$('#scan-file') && /No reports yet/.test($('#app').textContent), 'empty body tab with import button');
  const inp = $('#scan-file'); Object.defineProperty(inp, 'files', { value: [{ type: 'image/png', name: 'r.png' }] });
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(60);
  ok(called && called.images.length === 1, 'image sent to sample');
  ok(/Check what I read/.test($('#app').textContent) && /74 kg/.test($('#app').textContent), 'draft card shown');
  click($('[data-act="scanSave"]')); await sleep(40);
  ok(/Latest ·/.test($('#app').textContent) && /By body part/.test($('#app').textContent) && /25.6/.test($('#app').textContent), 'saved report rendered with segments');
  ok(!!$('[data-act="scanOpen"][data-k="weight"]') && !!$('[data-act="scanOpen"][data-k="seg:la"], [data-act="scanOpen"][data-k^="seg:"]'), 'metrics and body parts are tappable');
  click($('[data-act="scanOpen"][data-k="weight"]')); await sleep(30);
  ok(/Weight/.test($('#app').textContent) && /One report so far/.test($('#app').textContent), 'weight history page (single point)');
  click($('[data-act="metricBack"]')); await sleep(30);
  const inp2 = $('#scan-file'); Object.defineProperty(inp2, 'files', { value: [{ type: 'image/png', name: 'r2.png' }] });
  inp2.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(60); click($('[data-act="scanSave"]')); await sleep(40);
  click($('[data-act="scanOpen"][data-k="weight"]')); await sleep(30);
  ok(/Data points/.test($('#app').textContent) && /73.2/.test($('#app').textContent) && /74/.test($('#app').textContent) && !!$('svg'), 'weight history with chart and 2 points');
  click($('[data-act="metricBack"]')); await sleep(30);
  click($('[data-act="scanOpen"][data-k^="seg:"]')); await sleep(30);
  ok(/Muscle mass/.test($('#app').textContent) && /Data points/.test($('#app').textContent), 'body part history');
  click($('[data-act="metricBack"]')); await sleep(30);
  click($('[data-act="tab"][data-to="settings"]'));
  ok($('input[data-k="p:0:0:weight"]').value === '73.2', 'weight setting updated');
  click($('[data-act="tab"][data-to="progress"]')); click($('[data-act="ptab"][data-t="body"]'));
  for (let i = 0; i < 2; i++) { click($('[data-act="delScanAsk"]')); click($('[data-act="delScan"]')); await sleep(20); }
  ok(/No reports yet/.test($('#app').textContent), 'report removed');
  console.log('errors:', errors.length ? errors : 'none'); console.log(fail.length ? 'FAILED:\n - ' + fail.join('\n - ') : 'ALL PASSED');
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
