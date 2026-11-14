// Fumée du processus principal avec un faux module « electron ».
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

function fakeElectron(tmp, pickFolder) {
  const handlers = {}, listeners = {};
  class BrowserWindow {
    constructor() { this.webContents = { send() {}, printToPDF: async () => Buffer.from('%PDF'), print: (o, cb) => cb(true) }; }
    setMenuBarVisibility() {} loadURL() {} async loadFile() {} destroy() {} isDestroyed() { return false; }
  }
  return {
    handlers, listeners,
    mod: {
      app: { getPath: (k) => { const d = path.join(tmp, k); fs.mkdirSync(d, { recursive: true }); return d; }, whenReady: () => new Promise(() => {}), on() {} },
      BrowserWindow,
      ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, on: (ch, fn) => { listeners[ch] = fn; } },
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [pickFolder] }), showSaveDialog: async (w, o) => ({ canceled: false, filePath: path.join(tmp, path.basename(o.defaultPath)) }) },
      shell: { openExternal() {}, openPath() {} },
      clipboard: { writeText() {} },
      protocol: { registerSchemesAsPrivileged() {}, handle() {} },
      net: { fetch: async () => ({}) },
    },
  };
}

test('main process: folder, profile, load, append, version and replaceAll work end to end', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-main-'));
  const shared = path.join(tmp, 'drive', 'JSM');
  fs.mkdirSync(shared, { recursive: true });
  const fake = fakeElectron(tmp, shared);
  const orig = Module._load;
  Module._load = function (req, ...rest) { return req === 'electron' ? fake.mod : orig.call(this, req, ...rest); };
  try {
    delete require.cache[require.resolve('../../electron/main.js')];
    require('../../electron/main.js');
  } finally { Module._load = orig; }
  const call = (ch, ...a) => fake.handlers[ch]({}, ...a);
  const ev = {}; fake.listeners['app:version'](ev);
  assert.equal(ev.returnValue, require('../../package.json').version);
  assert.equal(await call('config:chooseFolder'), shared);
  await call('config:setProfil', 'Katell');
  const cfg = await call('config:get');
  assert.equal(cfg.profil, 'Katell');
  assert.equal((await call('data:load')).base, null);
  await call('data:writeBase', { year: '2026-2027', presences: {} });
  await call('data:append', { t: '2026-11-14T08:00:00Z', by: 'Katell', dev: cfg.device, seq: 1, path: ['presences', 'x|pedibus|2026-11-13|'], value: 'P' });
  const loaded = await call('data:load');
  assert.equal(loaded.base.year, '2026-2027');
  assert.equal(loaded.ops.length, 1);
  await call('data:replaceAll', { year: '2026-2027', presences: { a: 'P' } });
  const after = await call('data:load');
  assert.equal(after.ops.length, 0, 'journals archived');
  assert.ok(fs.readdirSync(path.join(shared, 'Sauvegardes')).some((d) => d.startsWith('journaux-')));
  assert.equal(await call('data:backup', { year: 'x' }), true);
  const pdf = await call('print:pdf', { html: '<p>x</p>', fileName: 'Pédibus 13-11-2026.pdf' });
  assert.ok(fs.existsSync(pdf));
  const csv = await call('file:saveText', { fileName: 'CAF.csv', text: 'a;b' });
  assert.equal(fs.readFileSync(csv, 'utf8'), 'a;b');
  for (const ch of ['data:others', 'import:pick', 'print:print', 'shell:open', 'clipboard:write', 'data:newYear']) assert.ok(fake.handlers[ch], ch);
});
