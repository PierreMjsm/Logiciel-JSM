// Processus principal Electron : fenêtre, dossier de données, impression, import.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { createStorage, writeBase, archiveJournals, writeAtomic } = require('./storage.js');
const { readWorkbook } = require('./xlsx-reader.js');
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
  storage = createStorage({ folder: c.folder, profil: c.profil, device: DEVICE });
  storage.onRemote((ops, info) => { if (win && !win.isDestroyed()) win.webContents.send('data:remote', ops, info); });
  storage.presence();
  clearInterval(presenceTimer);
  presenceTimer = setInterval(() => storage && storage.presence(), 30000);
  if (presenceTimer.unref) presenceTimer.unref();
  return storage;
}

// ---------- IPC ----------
ipcMain.on('app:version', (e) => { e.returnValue = pkg.version; });
ipcMain.handle('config:get', () => ({ ...readConfig(), device: DEVICE, version: pkg.version }));

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

ipcMain.handle('data:load', () => {
  const s = storage || openStorage();
  if (!s) return { base: null, ops: [], warnings: [] };
  const r = s.load();
  if (s.ownSize() > 20 * 1024 * 1024) s.compactOwn();
  return r;
});
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
  writeBase(folder, base);
  saveConfig({ folder });
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

// Impression et PDF : on rend le HTML dans une fenêtre cachée.
async function renderHidden(html) {
  const w = new BrowserWindow({ show: false });
  const tmp = path.join(app.getPath('temp'), `jsm-impression-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  await w.loadFile(tmp);
  setTimeout(() => fs.rm(tmp, { force: true }, () => {}), 60000);
  return w;
}
ipcMain.handle('print:pdf', async (e, { html, fileName, landscape }) => {
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
  const target = path.join(folder, fileName.replace(/[\\/:*?"<>|]/g, '_'));
  fs.writeFileSync(target, data);
  shell.openPath(target);
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
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
