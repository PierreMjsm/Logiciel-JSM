// Outils de test d'interface : serveur statique + faux pont window.jsm.
import { spawn } from 'node:child_process';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

export async function startServer() {
  const port = 8800 + Math.floor(Math.random() * 900);
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${port}/app/index.html`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  return { url: `http://127.0.0.1:${port}/app/index.html`, stop: () => proc.kill() };
}

export async function launch() {
  return chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
}

// Installe un faux pont dans la page. options.base, options.ops, options.config
export async function openApp(browser, url, { base = null, ops = [], config = {}, viewport = { width: 1400, height: 900 }, win = {}, clock = null } = {}) {
  const page = await browser.newPage({ viewport });
  if (clock) await page.clock.setFixedTime(new Date(clock));
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(({ base, ops, config, win }) => {
    Object.assign(window, win);
    const appended = [];
    let remoteCb = null;
    let cfg = { folder: '/drive/JSM', profil: null, device: 'TEST', version: '0.2.0', ...config };
    let currentBase = sessionStorage.getItem('__base') ? JSON.parse(sessionStorage.getItem('__base')) : base;
    const keep = (b) => { currentBase = b; sessionStorage.setItem('__base', JSON.stringify(b)); };
    window.__appended = appended;
    window.__printed = [];
    window.__copied = [];
    window.__opened = [];
    window.__saved = [];
    window.__pushRemote = (o, info = {}) => remoteCb && remoteCb(o, info);
    window.jsm = {
      version: '0.2.0',
      getConfig: async () => cfg,
      chooseFolder: async () => { cfg.folder = '/drive/JSM'; return cfg.folder; },
      setProfil: async (p) => { cfg.profil = p; return p; },
      setConfig: async (p) => { cfg = { ...cfg, ...p }; return cfg; },
      load: async () => ({ base: currentBase, ops: [...ops, ...appended], warnings: [], notices: window.__notices || [], consultation: cfg.consultation || null }),
      years: async () => window.__years || [],
      lireAnnee: async (d) => { const a = (window.__annees || {})[d]; if (!a) throw new Error('Dossier de l\'année introuvable.'); return a; },
      preLire: async () => ({ source: window.__preFile ?? null, files: window.__preFiles || (window.__preRows ? [{ nom: 'Inscriptions.xlsx', mtime: 1, rows: window.__preRows }] : []), tally: window.__preTally || null, tallyErreur: window.__tallyErreur || null }),
      tallyReglages: async (o) => { window.__tallyReglages = o; cfg.tally = { formulaire: 'D4LrYR', configuree: true }; return true; },
      tallyTester: async () => window.__tallyTest || { ok: true, total: 2 },
      preChoisir: async () => { window.__preFile = 'Inscriptions Tally'; return 'Inscriptions Tally'; },
      dossierChoisirRacine: async () => { cfg.dossiersEnfants = 'D:/OneDrive/Enfants JSM'; return cfg.dossiersEnfants; },
      ficheAjouterModele: async () => window.__modele || null,
      ficheChamps: async () => (window.__modele || {}).champs || [],
      ficheGenerer: async (o) => { (window.__fiches ||= []).push(o); return 'C:/JSM/fiche.pdf'; },
      ficheImprimerLot: async (l) => { window.__lot = l; return { trouvees: l.map((_, i) => i), manquantes: [] }; },
      dossierTelecharger: async (o) => { (window.__downloads ||= []).push(o); return 'C:/JSM/x'; },
      dossierOuvrir: async (d) => { (window.__dossiers ||= []).push(d); return d; },
      dossierPhoto: async () => window.__photo || null,
      dossierVignettes: async (ds) => Object.fromEntries((ds || []).filter((d) => (window.__vignettes || []).includes(d)).map((d) => [d, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='])),
      dossierChoisirPhoto: async (d) => { window.__photoChoisie = d; window.__photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; return true; },
      dossierSupprimer: async (d) => { (window.__supprimes ||= []).push(d); return true; },
      dossierJoindre: async (d, o) => { (window.__joints ||= []).push([d, o]); return `${o.nom}.pdf`; },
      dossierOuvrirFichier: async (d, f) => { (window.__fichiersOuverts ||= []).push([d, f]); return true; },
      notifier: async (o) => { (window.__notifs ||= []).push(o); return true; },
      openYear: async (d) => { sessionStorage.setItem('__openedYear', d); cfg.consultation = '2026-2027'; return '2026-2027'; },
      closeYear: async () => { sessionStorage.setItem('__closedYear', '1'); cfg.consultation = null; return true; },
      append: async (op) => { appended.push(op); if (window.__appendDelay) await new Promise((r) => setTimeout(r, window.__appendDelay)); return true; },
      others: async () => [{ profil: 'Katell', device: 'PORTABLE', t: new Date().toISOString() }],
      backup: async () => true,
      writeBase: async (b) => { keep(b); return true; },
      replaceAll: async (b) => { keep(b); appended.length = 0; return true; },
      newYear: async (o) => { window.__newYear = o; return '/drive/JSM-2027-2028'; },
      pickExcel: async () => window.__excel || null,
      printToPDF: async (x) => { window.__printed.push(x); return '/pdf/' + x.fileName; },
      print: async (x) => { window.__printed.push(x); return true; },
      choosePdfFolder: async () => '/pdf',
      openExternal: async (u) => { window.__opened.push(u); return true; },
      copy: async (t) => { window.__copied.push(t); return true; },
      saveText: async (x) => { window.__saved.push(x); return '/fichiers/' + x.fileName; },
      pickTable: async () => window.__table || null,
      saveTemplate: async () => { window.__saved.push({ fileName: 'modele' }); return '/fichiers/modele.xlsx'; },
      onRemote: (cb) => { remoteCb = cb; return () => {}; },
    };
  }, { base, ops, config, win });
  await page.goto(url);
  return { page, errors };
}
