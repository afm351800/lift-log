const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8').replace(/<link[^>]*>/g, '').replace('window.LIFTLOG_STANDALONE = true;', '');
const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.detail || e.message)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = []; const ok = (c, m) => { if (!c) fail.push(m); else console.log('ok  ', m); };
// fake GitHub
const remote = { file: null, sha: 0, puts: 0 };
const fakeFetch = async (url, o = {}) => {
  const hdr = o.headers || {}; const json = (b, s = 200) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
  if (hdr.Authorization !== 'Bearer ghp_goodtoken_0123456789abcdef') return json({}, 401);
  if (/\/repos\/me\/lift-log-data$/.test(url)) return json({});
  if (/\/repos\/me\/nope/.test(url)) return json({}, 404);
  if (/contents\/data\.json/.test(url)) {
    if ((o.method || 'GET') === 'GET') return remote.file == null ? json({}, 404) : json({ sha: 's' + remote.sha, content: Buffer.from(remote.file).toString('base64') });
    const b = JSON.parse(o.body);
    if (remote.file != null && b.sha !== 's' + remote.sha) return json({}, 409);
    remote.file = Buffer.from(b.content, 'base64').toString('utf8'); remote.sha++; remote.puts++;
    return json({ content: { sha: 's' + remote.sha } });
  }
  return json({}, 404);
};
function boot(store, sync) {
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + html + '</body></html>', { url: 'https://me.github.io/lift-log/', runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(win) {
      win.LIFTLOG_STANDALONE = true; win.eval(fs.readFileSync(path.join(__dirname, '..', '..', 'lib.js'), 'utf8')); win.scrollTo = () => {};
      win.fetch = fakeFetch;
      for (const k in (store || {})) win.localStorage.setItem(k, store[k]);
    } });
  return dom.window;
}
const S = (w) => (sel) => w.document.querySelector(sel);
const clk = (w, sel) => { const el = w.document.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const typ = (w, sel, v) => { const el = w.document.querySelector(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
(async () => {
  // phone 1: add data, connect to empty repo
  let w = boot(); await sleep(100);
  clk(w, '[data-act="tab"][data-to="progress"]'); clk(w, '[data-act="ptab"][data-t="body"]'); clk(w, '[data-act="mfOpen"]');
  typ(w, '#mf-weight', '74.1'); clk(w, '[data-act="mfSave"]'); await sleep(50);
  clk(w, '[data-act="tab"][data-to="settings"]');
  typ(w, '#sy-repo', 'me/nope'); typ(w, '#sy-token', 'ghp_goodtoken_0123456789abcdef'); clk(w, '[data-act="syGo"]'); await sleep(80);
  ok(/Repository not found/.test(w.document.body.textContent), 'wrong repository name is explained');
  typ(w, '#sy-repo', 'me/lift-log-data'); typ(w, '#sy-token', 'ghp_BAD_BAD_BAD_BAD_BAD_BAD'); clk(w, '[data-act="syGo"]'); await sleep(80);
  ok(/did not accept the token/.test(w.document.body.textContent), 'bad token is explained');
  typ(w, '#sy-token', 'ghp_goodtoken_0123456789abcdef'); clk(w, '[data-act="syGo"]'); await sleep(120);
  ok(remote.file && /74.1/.test(remote.file), 'first connect uploads existing data');
  ok(/Connected to/.test(w.document.body.textContent), 'shows connected');
  // later edit auto-saves
  clk(w, '[data-act="tab"][data-to="progress"]'); clk(w, '[data-act="ptab"][data-t="body"]'); clk(w, '[data-act="mfOpen"]');
  typ(w, '#mf-date', '2026-10-20'); typ(w, '#mf-weight', '73.5'); clk(w, '[data-act="mfSave"]'); await sleep(3200);
  ok(/73.5/.test(remote.file), 'later change saved automatically');
  // phone 2 / cleared Safari: empty local, connect -> data returns
  const w2 = boot(); await sleep(100);
  clk(w2, '[data-act="tab"][data-to="settings"]');
  typ(w2, '#sy-repo', 'me/lift-log-data'); typ(w2, '#sy-token', 'ghp_goodtoken_0123456789abcdef'); clk(w2, '[data-act="syGo"]'); await sleep(200);
  clk(w2, '[data-act="tab"][data-to="progress"]'); clk(w2, '[data-act="ptab"][data-t="body"]');
  ok(/73.5/.test(w2.document.body.textContent), 'empty phone gets data back from GitHub');
  // token remembered across reload; remote newer gets pulled
  const keep = {}; for (let i = 0; i < w2.localStorage.length; i++) { const k = w2.localStorage.key(i); keep[k] = w2.localStorage.getItem(k); }
  const o = JSON.parse(remote.file); o.data.settings.find((x) => x.id === 'body').log.push({ ts: Date.UTC(2026, 9, 25), weight: 72.9 }); remote.file = JSON.stringify(o); remote.sha++;
  const w3 = boot(keep); await sleep(1700);
  clk(w3, '[data-act="tab"][data-to="progress"]'); clk(w3, '[data-act="ptab"][data-t="body"]');
  ok(/72.9/.test(w3.document.body.textContent), 'newer GitHub copy is pulled on open');
  console.log('errors:', errors.length ? errors : 'none'); console.log(fail.length ? 'FAILED:\n - ' + fail.join('\n - ') : 'ALL PASSED');
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
