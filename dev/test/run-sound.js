const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8').replace(/<link[^>]*>/g, '').replace('window.LIFTLOG_STANDALONE = true;', '');
const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.detail || e.message)));
let notes = 0;
class AC { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
  createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() { notes++; }, stop() {} }; }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  createDynamicsCompressor() { const p = () => ({ value: 0 }); return { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), connect() {} }; }
  createBuffer() { return {}; } createBufferSource() { return { connect() {}, start() {} }; } resume() {} }
const dom = new JSDOM('<!doctype html><html><head></head><body>' + html + '</body></html>', { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
  beforeParse(win) { win.eval(fs.readFileSync(path.join(__dirname, '..', '..', 'lib.js'), 'utf8')); win.AudioContext = AC; win.scrollTo = () => {}; } });
const w = dom.window, d = w.document, $ = (s) => d.querySelector(s), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const act = (n, a = {}) => { const el = $('[data-act="' + n + '"]' + Object.entries(a).map(([k, v]) => '[data-' + k + '="' + v + '"]').join('')); if (!el) throw new Error('missing ' + n); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const fail = []; const ok = (c, m) => { if (!c) fail.push(m); else console.log('ok  ', m); };
(async () => {
  await sleep(100);
  act('start', { id: 'sample' }); act('startEx');
  let n0 = notes; act('mark', { j: 0, s: 'done' }); ok(notes - n0 === 6, 'finishing a set plays the two-note set sound (3 layers each)');
  n0 = notes; act('mark', { j: 1, s: 'done' }); act('mark', { j: 2, s: 'done' }); ok(notes - n0 === 6 + 9, 'last set of the exercise plays the three-note chime');
  act('quitAsk'); act('discard'); act('tab', { to: 'settings' }); act('soundSet', { v: '0' });
  ok($('[data-act="soundSet"][data-v="0"]').classList.contains('btn-primary'), 'sounds can be switched off');
  act('tab', { to: 'home' }); act('start', { id: 'sample' }); act('startEx');
  n0 = notes; act('mark', { j: 0, s: 'done' }); ok(notes === n0, 'no sound when switched off');
  console.log('errors:', errors.length ? errors : 'none'); console.log(fail.length ? 'FAILED:\n - ' + fail.join('\n - ') : 'ALL PASSED');
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
