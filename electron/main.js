// Processus principal Electron : fenêtre, dossier de données, impression, import.
const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, protocol, net } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { createStorage, writeBase, archiveJournals, writeAtomic } = require('./storage.js');
const { readWorkbook } = require('./xlsx-reader.js');
const { listerChamps, remplir } = require('./pdf-fill.js');
const { telecharger, nomPropre, libre: libreNom, effacerPieces } = require('./fichiers.js');
const pkg = require('../package.json');

const ROOT = path.join(__dirname, '..');
const DEVICE = os.hostname().replace(/[^A-Za-z0-9_-]/g, '_') || 'POSTE';
let win = null;
let storage = null;
let presenceTimer = null;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// ---------- configuration locale (par ordinateur) ----------
const configFile = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch { return {}; }
}
function saveConfig(patch) {
  const c = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  writeAtomic(configFile(), JSON.stringify(c, null, 2));
  return c;
}

function openStorage() {
  const c = readConfig();
  if (storage) storage.close();
  storage = null;
  if (!c.folder || !c.profil) return null;
  const consult = c.consultation ? path.join(path.dirname(c.folder), c.consultation.dossier) : null;
  storage = createStorage({ folder: consult || c.folder, profil: c.profil, device: DEVICE, readOnly: !!consult });
  storage.onRemote((ops, info) => { if (win && !win.isDestroyed()) win.webContents.send('data:remote', ops, info); });
  storage.presence();
  clearInterval(presenceTimer);
  presenceTimer = setInterval(() => storage && storage.presence(), 30000);
  if (presenceTimer.unref) presenceTimer.unref();
  return storage;
}

// ---------- IPC ----------
ipcMain.on('app:version', (e) => { e.returnValue = pkg.version; });
ipcMain.handle('config:get', () => {
  const { tallyCle, tallyFormulaire, ...c } = readConfig();
  return { ...c, consultation: c.consultation ? c.consultation.label : null, tally: tallyFormulaire ? { formulaire: tallyFormulaire, configuree: !!tallyCle } : null, device: DEVICE, version: pkg.version };
});

ipcMain.handle('config:chooseFolder', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choisir le dossier JSM sur le drive partagé',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  saveConfig({ folder: r.filePaths[0] });
  openStorage();
  return r.filePaths[0];
});

ipcMain.handle('config:setProfil', (e, profil) => { saveConfig({ profil }); openStorage(); return profil; });
ipcMain.handle('config:set', (e, patch) => saveConfig(patch));

// Un collègue a ouvert la nouvelle année : l'ancien dossier contient suite.json → on bascule sur la nouvelle.
function followNextYear() {
  const c = readConfig();
  if (!c.folder || c.consultation) return null;
  try {
    const suite = JSON.parse(fs.readFileSync(path.join(c.folder, 'suite.json'), 'utf8'));
    const next = path.join(path.dirname(c.folder), suite.dossier);
    if (!fs.existsSync(path.join(next, 'base.json'))) return null;
    saveConfig({ folder: next });
    openStorage();
    return `L'année ${suite.label} a été ouverte : l'appli est passée dessus. L'année précédente reste consultable dans Paramètres.`;
  } catch { return null; }
}

ipcMain.handle('data:load', () => {
  const notices = [];
  const moved = followNextYear();
  if (moved) notices.push(moved);
  const s = storage || openStorage();
  if (!s) return { base: null, ops: [], warnings: [], notices };
  const r = s.load();
  if (s.ownSize() > 20 * 1024 * 1024) s.compactOwn();
  const c = readConfig();
  return { ...r, notices, consultation: c.consultation ? c.consultation.label : null };
});

// Années précédentes : chaînées par base.json → anneePrecedente { label, dossier } (dossier voisin sur le drive).
ipcMain.handle('years:list', () => {
  const c = readConfig();
  if (!c.folder) return [];
  const out = [];
  let dir = c.folder;
  for (let i = 0; i < 30; i++) {
    let b;
    try { b = JSON.parse(fs.readFileSync(path.join(dir, 'base.json'), 'utf8')); } catch { break; }
    const p = b.anneePrecedente;
    if (!p || !p.dossier) break;
    dir = path.join(path.dirname(c.folder), p.dossier);
    if (!fs.existsSync(path.join(dir, 'base.json'))) break;
    out.push({ label: p.label, dossier: p.dossier });
  }
  return out;
});
ipcMain.handle('years:open', (e, dossier) => {
  const c = readConfig();
  const dir = path.join(path.dirname(c.folder), path.basename(dossier));
  const b = JSON.parse(fs.readFileSync(path.join(dir, 'base.json'), 'utf8'));
  saveConfig({ consultation: { dossier: path.basename(dossier), label: b.year } });
  openStorage();
  return b.year;
});
// Lecture seule d'une autre année, sans la quitter (déclaration CAF et attestations en année civile).
ipcMain.handle('years:etat', (e, dossier) => {
  const c = readConfig();
  const dir = path.join(path.dirname(c.folder), path.basename(String(dossier || '')));
  if (!fs.existsSync(path.join(dir, 'base.json'))) throw new Error('Dossier de l\'année introuvable.');
  const s = createStorage({ folder: dir, profil: c.profil || 'lecture', device: DEVICE, readOnly: true });
  try { const { base, ops } = s.load(); return { base, ops }; } finally { s.close(); }
});
ipcMain.handle('years:close', () => { saveConfig({ consultation: null }); openStorage(); return true; });
ipcMain.handle('data:append', (e, op) => {
  if (!storage) throw new Error('Dossier partagé non disponible');
  storage.append(op);
  return true;
});
ipcMain.handle('data:others', () => (storage ? storage.others() : []));
ipcMain.handle('data:backup', (e, state) => (storage ? storage.backupIfNeeded(state) : false));
ipcMain.handle('data:writeBase', (e, base) => { writeBase(readConfig().folder, base); return true; });
ipcMain.handle('data:replaceAll', (e, base) => {
  const folder = readConfig().folder;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (fs.existsSync(path.join(folder, 'base.json'))) archiveJournals(folder, stamp);
  writeBase(folder, base);
  openStorage();
  return true;
});
ipcMain.handle('data:newYear', (e, { base, label }) => {
  const cur = readConfig().folder;
  const folder = path.join(path.dirname(cur), `JSM-${label}`);
  if (fs.existsSync(path.join(folder, 'base.json'))) throw new Error(`Le dossier ${folder} existe déjà.`);
  writeBase(folder, { ...base, anneePrecedente: { ...(base.anneePrecedente || {}), dossier: path.basename(cur) } });
  writeAtomic(path.join(cur, 'suite.json'), JSON.stringify({ label, dossier: path.basename(folder) }));
  saveConfig({ folder, consultation: null });
  openStorage();
  return folder;
});

// Import Excel : lecture ici, mise en correspondance dans l'interface.
// Seules ces feuilles sont envoyées avec leur contenu ; les autres n'envoient que leur nom (reconnaissance du fichier).
const NEEDED = ['général', 'Pedibus', 'Mercredi', 'Toussaint', 'Noël', 'Hiver', 'Printemps', 'Rose', 'Collégiens', 'Juillet', 'Août',
  'Exceptionnel', 'Remise chèque', 'Liste Collégiens'];
ipcMain.handle('import:pick', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choisir les fichiers Excel (Contact, Pédibus, Mercredi, Vacances, Compta, Chèque-Banque, ADO)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Excel', extensions: ['xlsm', 'xlsx'] }],
  });
  if (r.canceled) return null;
  return r.filePaths.map((file) => {
    const wb = readWorkbook(file);
    const names = Object.keys(wb.sheets);
    const sheets = {};
    for (const n of names) sheets[n] = NEEDED.includes(n) ? wb.sheets[n].rows() : [];
    return { file: path.basename(file), sheets };
  });
});

// Fichier d'enfants à ajouter (modèle Excel ou CSV).
ipcMain.handle('import:pickTable', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choisir le fichier des enfants à ajouter',
    properties: ['openFile'],
    filters: [{ name: 'Excel ou CSV', extensions: ['xlsx', 'xlsm', 'csv'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  if (/\.csv$/i.test(file)) return { file: path.basename(file), text: fs.readFileSync(file, 'utf8') };
  const wb = readWorkbook(file);
  const name = Object.keys(wb.sheets).find((n) => n === 'Enfants') || Object.keys(wb.sheets)[0];
  return { file: path.basename(file), rows: wb.sheets[name].rows() };
});
ipcMain.handle('file:saveTemplate', async () => {
  const src = path.join(ROOT, 'modeles', 'Modele-ajout-enfants.xlsx');
  const r = await dialog.showSaveDialog(win, { title: 'Enregistrer le modèle', defaultPath: path.join(app.getPath('documents'), 'Modèle - ajout d\'enfants JSM.xlsx') });
  if (r.canceled || !r.filePath) return null;
  fs.copyFileSync(src, r.filePath);
  shell.openPath(r.filePath);
  return r.filePath;
});

// Impression et PDF : on rend le HTML dans une fenêtre cachée.
async function renderHidden(html) {
  // Page d'impression : simple HTML, sans JavaScript (rien d'injecté par un nom ou une réponse Tally ne peut s'y exécuter).
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const tmp = path.join(app.getPath('temp'), `jsm-impression-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  await w.loadFile(tmp);
  const t = setTimeout(() => fs.rm(tmp, { force: true }, () => {}), 60000);
  if (t.unref) t.unref();
  return w;
}
ipcMain.handle('print:pdf', async (e, { html, fileName, landscape, sousDossier = '', ouvrir = true, ouvrirDossier = false }) => {
  const c = readConfig();
  let folder = c.pdfFolder;
  if (!folder || !fs.existsSync(folder)) {
    const r = await dialog.showOpenDialog(win, { title: 'Dossier où enregistrer les PDF', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    folder = r.filePaths[0];
    saveConfig({ pdfFolder: folder });
  }
  const w = await renderHidden(html);
  const data = await w.webContents.printToPDF({ pageSize: 'A4', landscape: !!landscape, printBackground: true, margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
  w.destroy();
  const sous = path.basename(String(sousDossier || '').replace(/\\/g, '/')).replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').trim();
  if (sous) { folder = path.join(folder, sous); fs.mkdirSync(folder, { recursive: true }); }
  const target = path.join(folder, fileName.replace(/[\\/:*?"<>|]/g, '_'));
  fs.writeFileSync(target, data);
  if (ouvrirDossier) shell.openPath(folder);
  else if (ouvrir) shell.openPath(target);
  return target;
});
ipcMain.handle('print:print', async (e, { html, landscape }) => {
  const w = await renderHidden(html);
  return new Promise((resolve) => {
    w.webContents.print({ silent: false, printBackground: true, landscape: !!landscape }, (ok) => { w.destroy(); resolve(ok); });
  });
});
ipcMain.handle('print:chooseFolder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Dossier des PDF', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  saveConfig({ pdfFolder: r.filePaths[0] });
  return r.filePaths[0];
});

// ---- Pré-inscriptions (classeur « Inscriptions » rempli par Power Automate) et fiches PDF ----
function dossierPartage() {
  const c = readConfig();
  if (!c.folder) throw new Error('Choisissez d\'abord le dossier partagé.');
  return c.folder;
}
function ecriturePermise() {
  if (readConfig().consultation) throw new Error('Année en consultation : rien ne peut être modifié.');
}
const racineEnfants = () => readConfig().dossiersEnfants || path.join(dossierPartage(), 'Dossiers enfants');
const dossierEnfant = (dossier) => path.join(racineEnfants(), nomPropre(path.basename(String(dossier || 'Sans nom'))));
function modelePath(fichier) {
  const rel = String(fichier || '').replace(/\\/g, '/');
  if (!/^Modeles\/[^/]+\.pdf$/i.test(rel)) throw new Error('Modèle de fiche inconnu.');
  return path.join(dossierPartage(), ...rel.split('/'));
}

// ---- Tally en direct (API gratuite) : la clé reste dans la configuration de cet ordinateur ----
const idForm = (s) => { const m = /tally\.so\/(?:forms|r)\/([A-Za-z0-9]+)/.exec(String(s || '')); return m ? m[1] : String(s || '').replace(/[^A-Za-z0-9]/g, ''); };
async function tallyPage(page) {
  const c = readConfig();
  const res = await fetch(`https://api.tally.so/forms/${encodeURIComponent(c.tallyFormulaire)}/submissions?page=${page}&limit=100`, { headers: { Authorization: `Bearer ${c.tallyCle}`, Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new Error('Tally refuse la clé API : vérifiez-la (Tally › Réglages › API).');
  if (res.status === 404) throw new Error('Formulaire Tally introuvable : vérifiez le lien.');
  if (!res.ok) throw new Error(`Tally ne répond pas (${res.status}). Réessayez plus tard.`);
  return res.json();
}
async function tallyTout() {
  const questions = [];
  const submissions = [];
  for (let page = 1; page <= 50; page++) {
    const r = await tallyPage(page);
    if (page === 1) questions.push(...(r.questions || []));
    submissions.push(...(r.submissions || []));
    if (!r.hasMore) break;
  }
  return { questions, submissions };
}
ipcMain.handle('tally:reglages', (e, { formulaire = '', cle = '' } = {}) => {
  const patch = { tallyFormulaire: idForm(formulaire) || null };
  if (cle) patch.tallyCle = String(cle).trim();
  if (!patch.tallyFormulaire) patch.tallyCle = null;
  saveConfig(patch);
  return true;
});
ipcMain.handle('tally:tester', async () => {
  try {
    const r = await tallyPage(1);
    return { ok: true, total: (r.totalNumberOfSubmissionsPerFilter || {}).completed ?? (r.submissions || []).length };
  } catch (err) { return { erreur: err.message || String(err) }; }
});

// Dossier où l'on enregistre les exports Tally (CSV) ; on y lit aussi un classeur « Inscriptions » s'il y en a un.
ipcMain.handle('pre:choisir', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choisir le dossier où vous enregistrez les exports Tally (CSV)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  saveConfig({ preinscriptionsDossier: r.filePaths[0] });
  return path.basename(r.filePaths[0]);
});
ipcMain.handle('pre:lire', async () => {
  const c = readConfig();
  let tally = null, tallyErreur = null;
  if (c.tallyFormulaire && c.tallyCle) {
    try { tally = await tallyTout(); } catch (err) { tallyErreur = err.message || String(err); }
  }
  const r = lireExports(c);
  return { ...r, tally, tallyErreur };
});
function lireExports(c) {
  const lire = (file) => {
    const st = fs.statSync(file);
    const nom = path.basename(file);
    if (/\.csv$/i.test(nom)) return { nom, mtime: st.mtimeMs, text: fs.readFileSync(file, 'utf8') };
    const wb = readWorkbook(file);
    const name = Object.keys(wb.sheets).find((n) => n.toLowerCase() === 'inscriptions') || Object.keys(wb.sheets)[0];
    return { nom, mtime: st.mtimeMs, rows: wb.sheets[name].rows() };
  };
  if (c.preinscriptionsDossier) {
    const dir = c.preinscriptionsDossier;
    if (!fs.existsSync(dir)) throw new Error(`Dossier introuvable : ${dir}. Choisissez-le à nouveau.`);
    const files = fs.readdirSync(dir).filter((f) => /\.(csv|xlsx|xlsm)$/i.test(f) && !f.startsWith('~$'))
      .map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).size < 10 * 1024 * 1024)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(0, 60);
    const out = [];
    for (const f of files) { try { out.push(lire(f)); } catch { /* fichier illisible : ignoré */ } }
    return { source: path.basename(dir), files: out };
  }
  if (c.preinscriptions && fs.existsSync(c.preinscriptions)) return { source: path.basename(c.preinscriptions), files: [lire(c.preinscriptions)] };
  return { source: null, files: [] };
}

ipcMain.handle('fiche:ajouterModele', async () => {
  ecriturePermise();
  const r = await dialog.showOpenDialog(win, { title: 'Choisir le PDF de la fiche (avec ses champs à remplir)', properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const champs = await listerChamps(fs.readFileSync(r.filePaths[0]));
  if (!champs.length) throw new Error('Ce PDF n\'a pas de champs à remplir. Dans Acrobat : Outils › Préparer un formulaire, puis enregistrez et recommencez.');
  const dir = path.join(dossierPartage(), 'Modeles');
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(r.filePaths[0]);
  let dest = path.join(dir, nomPropre(path.basename(r.filePaths[0])));
  if (fs.existsSync(dest)) dest = libreNom(dir, path.basename(dest, ext), ext);
  fs.copyFileSync(r.filePaths[0], dest);
  return { fichier: `Modeles/${path.basename(dest)}`, nom: path.basename(dest, ext), champs };
});
ipcMain.handle('fiche:champs', async (e, fichier) => listerChamps(fs.readFileSync(modelePath(fichier))));

async function signatureDepuis(url) {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const ct = res.headers.get('content-type') || '';
  const type = ct.includes('png') || /\.png(\?|$)/i.test(url) ? 'png' : 'jpg';
  return { bytes: Buffer.from(await res.arrayBuffer()), type };
}

// Remplit un modèle. apercu : fichier temporaire ouvert aussitôt ; sinon rangé dans le dossier de l'enfant (remplace l'ancien).
ipcMain.handle('fiche:generer', async (e, { fichier, valeurs, signatureUrl = '', dossier = '', nomFichier = 'Fiche', apercu = false, ouvrir = false }) => {
  const signature = await signatureDepuis(signatureUrl).catch(() => null);
  const out = await remplir(fs.readFileSync(modelePath(fichier)), valeurs || {}, { signature });
  let dest;
  if (apercu) {
    dest = path.join(os.tmpdir(), `JSM-apercu-${Date.now()}.pdf`);
  } else {
    ecriturePermise();
    const dir = dossierEnfant(dossier);
    fs.mkdirSync(dir, { recursive: true });
    dest = path.join(dir, `${nomPropre(nomFichier)}.pdf`);
  }
  fs.writeFileSync(dest, out);
  if (apercu || ouvrir) await shell.openPath(dest);
  return dest;
});
// remplacer : la pièce d'une inscription plus récente prend la place de l'ancienne (Vaccins.pdf, Vaccins (2).jpg…).
// Plusieurs fiches PDF réunies en un seul fichier, ouvert pour l'impression. Renvoie les positions trouvées / manquantes.
ipcMain.handle('fiche:imprimerLot', async (e, fiches) => {
  const { PDFDocument } = require('pdf-lib');
  const out = await PDFDocument.create();
  const trouvees = [], manquantes = [];
  for (const [i, f] of (fiches || []).entries()) {
    const p = path.join(dossierEnfant(f.dossier), `${nomPropre(f.nomFichier || 'Fiche')}.pdf`);
    if (!fs.existsSync(p)) { manquantes.push(i); continue; }
    try {
      const src = await PDFDocument.load(fs.readFileSync(p), { ignoreEncryption: true });
      for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
      trouvees.push(i);
    } catch { manquantes.push(i); }
  }
  if (trouvees.length) {
    const dest = path.join(os.tmpdir(), `JSM-fiches-a-imprimer-${Date.now()}.pdf`);
    fs.writeFileSync(dest, await out.save());
    await shell.openPath(dest);
  }
  return { trouvees, manquantes };
});

ipcMain.handle('dossier:telecharger', async (e, { url, dossier, base, remplacer = false }) => {
  ecriturePermise();
  const dir = dossierEnfant(dossier);
  if (remplacer) {
    // On télécharge d'abord à part : si le lien a expiré, l'ancienne pièce reste.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-piece-'));
    const p = await telecharger(url, tmp, base);
    effacerPieces(dir, base);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, path.basename(p));
    fs.copyFileSync(p, dest);
    fs.rmSync(tmp, { recursive: true, force: true });
    return dest;
  }
  return telecharger(url, dir, base);
});
const TYPES_PHOTO = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
function nomValide(dossier) {
  const n = nomPropre(path.basename(String(dossier || '')));
  if (!n || n === '.' || n === '..') throw new Error('Nom de dossier invalide.');
  return n;
}
// Photo d'identité de l'enfant (Photo.jpg / Photo.png… dans son dossier), renvoyée en image affichable.
ipcMain.handle('dossier:photo', (e, dossier) => {
  const dir = path.join(racineEnfants(), nomValide(dossier));
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).filter((x) => /^photo(\s\(\d+\))?\.(jpe?g|png|webp|gif)$/i.test(x)).sort()[0];
  if (!f) return null;
  const p = path.join(dir, f);
  if (fs.statSync(p).size > 15 * 1024 * 1024) return null;
  return `data:${TYPES_PHOTO[path.extname(f).toLowerCase()]};base64,${fs.readFileSync(p).toString('base64')}`;
});
function fichierPhoto(dossier) {
  const dir = path.join(racineEnfants(), nomValide(dossier));
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).filter((x) => /^photo(\s\(\d+\))?\.(jpe?g|png|webp|gif)$/i.test(x)).sort()[0];
  return f ? path.join(dir, f) : null;
}
// Vignettes réduites (trombinoscope) : { dossier: image } pour les enfants qui ont une photo.
ipcMain.handle('dossier:vignettes', (e, dossiers) => {
  const out = {};
  const ni = electron.nativeImage;
  for (const d of dossiers || []) {
    try {
      const p = fichierPhoto(d);
      if (!p) continue;
      if (ni && ni.createFromPath) {
        const img = ni.createFromPath(p);
        if (!img.isEmpty()) {
          const { width } = img.getSize();
          out[d] = `data:image/jpeg;base64,${(width > 300 ? img.resize({ width: 300, quality: 'good' }) : img).toJPEG(82).toString('base64')}`;
          continue;
        }
      }
      if (fs.statSync(p).size < 3 * 1024 * 1024) out[d] = `data:${TYPES_PHOTO[path.extname(p).toLowerCase()]};base64,${fs.readFileSync(p).toString('base64')}`;
    } catch { /* photo illisible : ignorée */ }
  }
  return out;
});
ipcMain.handle('dossier:choisirPhoto', async (e, dossier) => {
  ecriturePermise();
  const r = await dialog.showOpenDialog(win, { title: 'Choisir la photo de l\'enfant', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
  if (r.canceled || !r.filePaths[0]) return false;
  const dir = path.join(racineEnfants(), nomValide(dossier));
  fs.mkdirSync(dir, { recursive: true });
  effacerPieces(dir, 'Photo');
  fs.copyFileSync(r.filePaths[0], path.join(dir, `Photo${path.extname(r.filePaths[0]).toLowerCase()}`));
  return true;
});
// Pièce jointe choisie sur l'ordinateur (fiche de suivi du PAI…) : copiée dans le dossier de l'enfant, la nouvelle remplace l'ancienne.
ipcMain.handle('dossier:joindre', async (e, dossier, { nom, titre } = {}) => {
  ecriturePermise();
  const base = nomPropre(String(nom || 'Document'));
  const r = await dialog.showOpenDialog(win, { title: titre || 'Joindre un document', properties: ['openFile'], filters: [{ name: 'PDF ou image', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = path.join(racineEnfants(), nomValide(dossier));
  fs.mkdirSync(dir, { recursive: true });
  effacerPieces(dir, base);
  const fichier = `${base}${path.extname(r.filePaths[0]).toLowerCase()}`;
  fs.copyFileSync(r.filePaths[0], path.join(dir, fichier));
  return fichier;
});
ipcMain.handle('dossier:ouvrirFichier', async (e, dossier, fichier) => {
  const dir = path.join(racineEnfants(), nomValide(dossier));
  const f = path.join(dir, path.basename(String(fichier || '')));
  if (path.dirname(f) !== dir || !fs.existsSync(f) || String(fichier) !== path.basename(f)) return false;
  await shell.openPath(f);
  return true;
});
// Notification Windows (rappel des PAI à renouveler) ; un clic ramène la fenêtre de l'appli.
ipcMain.handle('notifier', (e, { titre, texte } = {}) => {
  if (!electron.Notification || !electron.Notification.isSupported()) return false;
  const n = new electron.Notification({ title: String(titre || 'JSM Gestion'), body: String(texte || '') });
  n.on('click', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); } });
  n.show();
  return true;
});
// Départ de l'enfant : son dossier (pièces jointes, fiches PDF, photo) est supprimé (OneDrive le garde 30 jours dans sa corbeille).
ipcMain.handle('dossier:supprimer', (e, dossier) => {
  ecriturePermise();
  const dir = path.join(racineEnfants(), nomValide(dossier));
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
});

ipcMain.handle('dossier:choisirRacine', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choisir où ranger les dossiers des enfants (sur le drive)', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  saveConfig({ dossiersEnfants: r.filePaths[0] });
  return r.filePaths[0];
});
ipcMain.handle('dossier:ouvrir', async (e, dossier) => {
  const dir = dossierEnfant(dossier);
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return dir;
});

ipcMain.handle('shell:open', (e, url) => {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
  return true;
});
ipcMain.handle('file:saveText', async (e, { fileName, text }) => {
  const r = await dialog.showSaveDialog(win, { title: 'Enregistrer le fichier', defaultPath: path.join(readConfig().pdfFolder || app.getPath('documents'), fileName.replace(/[\\/:*?"<>|]/g, '_')) });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, text, 'utf8');
  return r.filePath;
});
ipcMain.handle('clipboard:write', (e, text) => { clipboard.writeText(String(text)); return true; });

// ---------- fenêtre ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'JSM Gestion',
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  // Pas de nouvelle fenêtre ni de navigation hors de l'appli : les liens web et mails s'ouvrent dans le navigateur / la messagerie.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://local/')) e.preventDefault(); });
  win.loadURL('app://local/app/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('Interdit', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  openStorage();
  createWindow();
});
app.on('window-all-closed', () => { if (storage) storage.close(); app.quit(); });
