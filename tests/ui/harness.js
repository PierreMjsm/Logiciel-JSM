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
export async function openApp(browser, url, { base = null, ops = [], config = {}, viewport = { width: 1400, height: 900 } } = {}) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(({ base, ops, config }) => {
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
      load: async () => ({ base: currentBase, ops: [...ops, ...appended], warnings: [] }),
      append: async (op) => { appended.push(op); return true; },
      others: async () => [{ profil: 'Katell', device: 'PORTABLE', t: new Date().toISOString() }],
      backup: async () => true,
      writeBase: async (b) => { keep(b); return true; },
      replaceAll: async (b) => { keep(b); appended.length = 0; return true; },
      newYear: async () => '/drive/JSM-2027-2028',
      pickExcel: async () => window.__excel || null,
      printToPDF: async (x) => { window.__printed.push(x); return '/pdf/' + x.fileName; },
      print: async (x) => { window.__printed.push(x); return true; },
      choosePdfFolder: async () => '/pdf',
      openExternal: async (u) => { window.__opened.push(u); return true; },
      copy: async (t) => { window.__copied.push(t); return true; },
      saveText: async (x) => { window.__saved.push(x); return '/fichiers/' + x.fileName; },
      onRemote: (cb) => { remoteCb = cb; return () => {}; },
    };
  }, { base, ops, config });
  await page.goto(url);
  return { page, errors };
}
