// Fumée du processus principal avec un faux module « electron ».
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fakeNext = { pick: null };
function fakeElectron(tmp, pickFolder) {
  const handlers = {}, listeners = {};
  fakeNext.pick = null;
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
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [fakeNext.pick || pickFolder] }), showSaveDialog: async (w, o) => ({ canceled: false, filePath: path.join(tmp, path.basename(o.defaultPath)) }) },
      shell: { openExternal() {}, openPath: (p) => { fakeNext.opened = p; return ''; } },
      clipboard: { writeText() {} },
      protocol: { registerSchemesAsPrivileged() {}, handle() {} },
      net: { fetch: async () => ({}) },
    },
  };
}

function loadMain(fake) {
  const orig = Module._load;
  Module._load = function (req, ...rest) { return req === 'electron' ? fake.mod : orig.call(this, req, ...rest); };
  try {
    delete require.cache[require.resolve('../../electron/main.js')];
    require('../../electron/main.js');
  } finally { Module._load = orig; }
  return (ch, ...a) => fake.handlers[ch]({}, ...a);
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
  const tpl = await call('file:saveTemplate');
  assert.ok(fs.statSync(tpl).size > 1000, 'modèle copié');
  for (const ch of ['import:pickTable', 'data:others', 'import:pick', 'print:print', 'shell:open', 'clipboard:write', 'data:newYear']) assert.ok(fake.handlers[ch], ch);
});

test('nouvelle année : l’ancienne reste consultable (lecture seule) et les collègues basculent seuls', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-year-'));
  const shared = path.join(tmp, 'drive', 'JSM');
  fs.mkdirSync(shared, { recursive: true });
  const fake = fakeElectron(tmp, shared);
  const call = loadMain(fake);
  await call('config:chooseFolder');
  await call('config:setProfil', 'Pierre');
  const dev = (await call('config:get')).device;
  await call('data:writeBase', { year: '2026-2027', presences: {} });
  await call('data:append', { t: '2026-11-14T08:00:00Z', by: 'Pierre', dev, seq: 1, path: ['presences', 'x|pedibus|2026-11-13|'], value: 'P' });

  const folder = await call('data:newYear', { base: { year: '2027-2028', presences: {}, anneePrecedente: { label: '2026-2027', dossier: '' } }, label: '2027-2028' });
  assert.equal(path.basename(folder), 'JSM-2027-2028');
  const now = await call('data:load');
  assert.equal(now.base.year, '2027-2028');
  assert.equal(now.base.anneePrecedente.dossier, 'JSM');
  assert.deepEqual(await call('years:list'), [{ label: '2026-2027', dossier: 'JSM' }]);

  await call('years:open', 'JSM');
  const old = await call('data:load');
  assert.equal(old.base.year, '2026-2027');
  assert.equal(old.ops.length, 1);
  assert.equal(old.consultation, '2026-2027');
  await assert.rejects(() => Promise.resolve().then(() => call('data:append', { t: 'x', by: 'Pierre', dev, seq: 2, path: ['a'], value: 1 })), /consultation/);
  assert.equal((await call('config:get')).consultation, '2026-2027');
  await call('years:close');
  assert.equal((await call('data:load')).base.year, '2027-2028');

  // Katell : son ordinateur pointe encore sur l'ancien dossier.
  await call('config:set', { folder: shared });
  const k = await call('data:load');
  assert.equal(k.base.year, '2027-2028');
  assert.ok(k.notices.some((w) => /2027-2028/.test(w)));
  assert.equal((await call('config:get')).folder, folder);
});

test('pré-inscriptions et fiches PDF : classeur lu, modèle copié dans le dossier partagé, fiche rangée dans le dossier de l’enfant', async () => {
  const { PDFDocument } = require('pdf-lib');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-fiche-'));
  const shared = path.join(tmp, 'drive', 'JSM');
  fs.mkdirSync(shared, { recursive: true });
  const fake = fakeElectron(tmp, shared);
  const call = loadMain(fake);
  await call('config:chooseFolder');
  await call('config:setProfil', 'Pierre');
  await call('data:writeBase', { year: '2026-2027', presences: {} });

  assert.equal((await call('pre:lire')).source, null, 'pas encore de dossier choisi');
  const { tallyCsv, tallyLigne } = await import('../core/fixtures/tally-csv.js');
  const exports = path.join(tmp, 'drive', 'Inscriptions Tally');
  fs.mkdirSync(exports, { recursive: true });
  fs.writeFileSync(path.join(exports, 'Plateforme_d_adhesion_Submissions_2026-11-15.csv'), tallyCsv([tallyLigne()]));
  fs.copyFileSync(path.join(__dirname, '..', '..', 'modeles', 'Modele-ajout-enfants.xlsx'), path.join(exports, 'Inscriptions.xlsx'));
  fs.writeFileSync(path.join(exports, 'notes.txt'), 'pas lu');
  fakeNext.pick = exports;
  assert.equal(await call('pre:choisir'), 'Inscriptions Tally');
  const lu = await call('pre:lire');
  assert.equal(lu.source, 'Inscriptions Tally');
  assert.deepEqual(lu.files.map((f) => f.nom).sort(), ['Inscriptions.xlsx', 'Plateforme_d_adhesion_Submissions_2026-11-15.csv']);
  assert.match(lu.files.find((f) => f.nom.endsWith('.csv')).text, /Submission ID/);
  assert.ok(lu.files.find((f) => f.nom.endsWith('.xlsx')).rows[0].includes('Prénom'));

  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  doc.getForm().createTextField('Nom de lenfant').addToPage(page, { x: 50, y: 500, width: 200, height: 16 });
  const src = path.join(tmp, 'Fiche adhésion 2026.pdf');
  fs.writeFileSync(src, await doc.save());
  fakeNext.pick = src;
  const m = await call('fiche:ajouterModele');
  assert.equal(m.fichier, 'Modeles/Fiche adhésion 2026.pdf');
  assert.ok(fs.existsSync(path.join(shared, 'Modeles', 'Fiche adhésion 2026.pdf')));
  assert.deepEqual(m.champs, [{ nom: 'Nom de lenfant', type: 'texte' }]);
  assert.deepEqual(await call('fiche:champs', m.fichier), m.champs);

  const p = await call('fiche:generer', { fichier: m.fichier, valeurs: { 'Nom de lenfant': 'DURAND' }, dossier: 'DURAND Louise (c1)', nomFichier: 'Fiche adhésion 2026-2027' });
  assert.equal(p, path.join(shared, 'Dossiers enfants', 'DURAND Louise (c1)', 'Fiche adhésion 2026-2027.pdf'));
  const relu = await PDFDocument.load(fs.readFileSync(p));
  assert.equal(relu.getForm().getFields().length, 0, 'fiche aplatie');
  await call('fiche:generer', { fichier: m.fichier, valeurs: {}, dossier: 'DURAND Louise (c1)', nomFichier: 'Fiche adhésion 2026-2027' });
  assert.equal(fs.readdirSync(path.dirname(p)).length, 1, 'regénérer remplace la fiche');
  await call('fiche:generer', { fichier: m.fichier, valeurs: {}, apercu: true });
  assert.match(fakeNext.opened, /\.pdf$/);
  await call('dossier:ouvrir', 'DURAND Louise (c1)');
  assert.equal(fakeNext.opened, path.dirname(p));

  // Dossiers des enfants ailleurs sur le drive (réglage de cet ordinateur).
  const ailleurs = path.join(tmp, 'drive', 'Enfants JSM');
  fs.mkdirSync(ailleurs);
  fakeNext.pick = ailleurs;
  assert.equal(await call('dossier:choisirRacine'), ailleurs);
  assert.equal((await call('config:get')).dossiersEnfants, ailleurs);
  const p2 = await call('fiche:generer', { fichier: m.fichier, valeurs: {}, dossier: 'DURAND Louise (c1)', nomFichier: 'Fiche' });
  assert.equal(p2, path.join(ailleurs, 'DURAND Louise (c1)', 'Fiche.pdf'));
});

test('Tally en direct : clé gardée sur l’ordinateur, pages lues jusqu’au bout, erreurs claires', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-tally-'));
  const shared = path.join(tmp, 'drive', 'JSM');
  fs.mkdirSync(shared, { recursive: true });
  const fake = fakeElectron(tmp, shared);
  const call = loadMain(fake);
  await call('config:chooseFolder');
  await call('config:setProfil', 'Pierre');
  const vraiFetch = globalThis.fetch;
  const appels = [];
  globalThis.fetch = async (url, opts) => {
    appels.push([String(url), opts && opts.headers && opts.headers.Authorization]);
    if (opts.headers.Authorization !== 'Bearer tly-bonne') return new Response('{}', { status: 401 });
    const page = Number(new URL(url).searchParams.get('page'));
    return new Response(JSON.stringify({ page, hasMore: page < 2, totalNumberOfSubmissionsPerFilter: { completed: 2 },
      questions: [{ id: 'q1', type: 'INPUT_TEXT', title: 'Prénom', fields: [] }],
      submissions: [{ id: `s${page}`, isCompleted: true, submittedAt: '2026-11-15T10:00:00Z', responses: [] }] }), { status: 200 });
  };
  try {
    await call('tally:reglages', { formulaire: 'https://tally.so/forms/D4LrYR/submissions', cle: 'tly-mauvaise' });
    const cfg = await call('config:get');
    assert.equal(cfg.tallyCle, undefined, 'la clé ne remonte pas dans l’interface');
    assert.deepEqual(cfg.tally, { formulaire: 'D4LrYR', configuree: true });
    assert.match((await call('tally:tester')).erreur, /clé/i);
    await call('tally:reglages', { formulaire: 'D4LrYR', cle: 'tly-bonne' });
    assert.deepEqual(await call('tally:tester'), { ok: true, total: 2 });
    const lu = await call('pre:lire');
    assert.deepEqual(lu.tally.submissions.map((s) => s.id), ['s1', 's2']);
    assert.match(appels.at(-1)[0], /^https:\/\/api\.tally\.so\/forms\/D4LrYR\/submissions\?page=2/);
    await call('tally:reglages', { formulaire: 'D4LrYR' });
    assert.equal((await call('config:get')).tally.configuree, true, 'clé laissée vide : on garde l’ancienne');
  } finally { globalThis.fetch = vraiFetch; }
});

test('photo de l’enfant et suppression de son dossier', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-photo-'));
  const shared = path.join(tmp, 'drive', 'JSM');
  fs.mkdirSync(shared, { recursive: true });
  const fake = fakeElectron(tmp, shared);
  const call = loadMain(fake);
  await call('config:chooseFolder');
  await call('config:setProfil', 'Pierre');
  const dossier = 'DURAND Louise (c1)';
  assert.equal(await call('dossier:photo', dossier), null, 'pas encore de photo');
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const src = path.join(tmp, 'grimace.png');
  fs.writeFileSync(src, PNG);
  const dir = path.join(shared, 'Dossiers enfants', dossier);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Photo.jpeg'), 'ancienne');
  fs.writeFileSync(path.join(dir, 'Vaccins.pdf'), 'x');
  fakeNext.pick = src;
  assert.equal(await call('dossier:choisirPhoto', dossier), true);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['Photo.png', 'Vaccins.pdf'], 'la nouvelle photo remplace l’ancienne');
  assert.match(await call('dossier:photo', dossier), /^data:image\/png;base64,iVBOR/);
  assert.equal(await call('dossier:supprimer', dossier), true);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(await call('dossier:supprimer', dossier), false, 'déjà supprimé');
  await assert.rejects(() => Promise.resolve().then(() => call('dossier:supprimer', '..')), /dossier/i);
});

test('vignettes du trombinoscope : une image par enfant qui a une photo', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-trombi-'));
  const shared = path.join(tmp, 'drive', 'JSM');
  fs.mkdirSync(shared, { recursive: true });
  const fake = fakeElectron(tmp, shared);
  const call = loadMain(fake);
  await call('config:chooseFolder');
  await call('config:setProfil', 'Pierre');
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const dir = path.join(shared, 'Dossiers enfants', 'DURAND Louise (c1)');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Photo.png'), PNG);
  const v = await call('dossier:vignettes', ['DURAND Louise (c1)', 'DURAND Jules (c2)']);
  assert.deepEqual(Object.keys(v), ['DURAND Louise (c1)']);
  assert.match(v['DURAND Louise (c1)'], /^data:image\//);
});

test('imprimer un lot de fiches : un seul PDF avec toutes les pages, fiches manquantes signalées', async () => {
  const { PDFDocument } = require('pdf-lib');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-lot-'));
  const shared = path.join(tmp, 'drive', 'JSM');
  fs.mkdirSync(shared, { recursive: true });
  const fake = fakeElectron(tmp, shared);
  const call = loadMain(fake);
  await call('config:chooseFolder');
  await call('config:setProfil', 'Pierre');
  for (const d of ['DURAND Louise (c1)', 'DURAND Jules (c2)']) {
    const doc = await PDFDocument.create();
    doc.addPage([842, 595]); doc.addPage([842, 595]);
    fs.mkdirSync(path.join(shared, 'Dossiers enfants', d), { recursive: true });
    fs.writeFileSync(path.join(shared, 'Dossiers enfants', d, 'Fiche adhésion.pdf'), await doc.save());
  }
  const r = await call('fiche:imprimerLot', [
    { dossier: 'DURAND Louise (c1)', nomFichier: 'Fiche adhésion' }, { dossier: 'DURAND Jules (c2)', nomFichier: 'Fiche adhésion' }, { dossier: 'MOREAU Zoe (c5)', nomFichier: 'Fiche adhésion' }]);
  assert.deepEqual(r.trouvees, [0, 1]);
  assert.deepEqual(r.manquantes, [2]);
  assert.equal((await PDFDocument.load(fs.readFileSync(fakeNext.opened))).getPageCount(), 4);
});
