// Démarrage de JSM Gestion : dossier, profil, chargement, navigation.
import { h, clear, fill, toast } from './ui.js';
import * as store from './state.js';
import { defaultParams2026 } from '../src/core/calendar.js';
import { lireSources, nbNouvelles, majBadge } from './inscriptions-source.js';

const bridge = window.jsm;
const root = document.getElementById('app');
const PROFILS = ['Pierre', 'Katell', 'Lucas'];

export const SCREENS = [
  { group: 'Au quotidien' },
  { id: 'listes', label: 'Listes du jour' },
  { id: 'presences', label: 'Présences' },
  { id: 'enfants', label: 'Enfants' },
  { id: 'preinscriptions', label: 'Pré-inscriptions' },
  { group: 'Argent' },
  { id: 'compta', label: 'Compta familles' },
  { id: 'reglements', label: 'Règlements & banque' },
  { id: 'attestation', label: 'Attestation' },
  { group: 'Communication et bilans' },
  { id: 'trombi', label: 'Trombinoscope' },
  { id: 'mailings', label: 'Mailings' },
  { id: 'caf', label: 'Heures CAF' },
  { id: 'stats', label: 'Statistiques et bilan' },
  { id: 'ado', label: 'ADO' },
  { id: 'carte', label: 'Carte' },
  { group: 'Réglages' },
  { id: 'parametres', label: 'Paramètres' },
  { id: 'historique', label: 'Historique' },
  { id: 'import', label: 'Import Excel' },
];

let config = null;
let current = { id: null, cleanup: null };
let othersTimer = null;

async function boot() {
  config = await bridge.getConfig();
  if (!config.folder) return showFolder();
  if (!config.profil) return showProfil();
  await store.init(bridge, config);
  if (!store.get()) return showWelcome();
  showApp();
}

function centered(...children) {
  clear(root).appendChild(h('div', { class: 'center-page' }, h('div', { class: 'center-card' }, h('div', { class: 'brand big' }, 'JSM', h('span', {}, 'Gestion')), ...children)));
}

function showFolder() {
  centered(
    h('h1', {}, 'Bienvenue'),
    h('p', {}, 'Choisissez le dossier JSM sur le drive partagé (Google Drive ou OneDrive). Katell, Lucas et vous devez choisir le même dossier.'),
    h('button', { class: 'primary big', onclick: async () => { if (await bridge.chooseFolder()) boot(); } }, 'Choisir le dossier JSM sur le drive'));
}

function showProfil() {
  centered(
    h('h1', {}, 'Qui êtes-vous ?'),
    h('p', {}, 'Votre nom apparaît dans l\'historique des modifications.'),
    h('div', { class: 'profils' }, PROFILS.map((p) => h('button', { class: 'profil', onclick: async () => { await bridge.setProfil(p); boot(); } }, p))));
}

function showWelcome() {
  centered(
    h('h1', {}, 'Le dossier est vide'),
    h('p', {}, 'Pour démarrer, reprenez vos fichiers Excel 2026-2027 : enfants, présences et règlements seront importés.'),
    h('button', { class: 'primary big', onclick: () => { showApp(); navigate('import'); } }, 'Importer mes fichiers Excel'),
    h('p', {}, h('button', { class: 'link', onclick: async () => {
      await bridge.writeBase({ schema: 1, year: '2026-2027', params: defaultParams2026(), families: {}, children: {}, presences: {}, extraDates: { exceptionnel: [], ado: [] }, payments: {} });
      await store.reload();
      showApp();
    } }, 'ou commencer une année vide')));
}

function showApp() {
  clear(root);
  const nav = h('nav', {},
    h('div', { class: 'brand' }, 'JSM', h('span', {}, 'Gestion')),
    SCREENS.map((s) => (s.group
      ? h('div', { class: 'nav-group' }, s.group)
      : h('a', { href: `#${s.id}`, 'data-id': s.id, onclick: (e) => { e.preventDefault(); navigate(s.id); } }, s.label))));
  const main = h('main', { id: 'main' });
  const status = h('footer', { id: 'status' });
  root.appendChild(h('div', { class: 'layout' }, nav, h('div', { class: 'content' }, main, status)));
  store.subscribe((s, info) => { if (info && (info.remote || info.reset)) updateStatus(info); });
  const banner = h('div', { id: 'write-banner', class: 'error', style: { display: 'none', borderRadius: 0 } });
  main.before(banner);
  store.onWriteStatus((msg) => { banner.textContent = msg || ''; banner.style.display = msg ? '' : 'none'; if (msg) toast(msg, 'warn'); });
  window.addEventListener('beforeunload', (e) => { if (store.pendingCount()) { e.preventDefault(); e.returnValue = ''; } });
  updateStatus();
  clearInterval(othersTimer);
  othersTimer = setInterval(updateStatus, 30000);
  backupSoon();
  for (const n of store.getNotices()) toast(n, 'warn');
  const consult = store.getConsultation();
  if (consult) {
    main.before(h('div', { id: 'consult-banner', class: 'consult-banner' },
      h('span', {}, `Vous consultez l'année ${consult} (lecture seule) : listes, compta, CAF et compte rendu sont visibles, rien ne peut être modifié.`),
      h('button', { onclick: async () => { await bridge.closeYear(); location.reload(); } }, 'Revenir à l\'année en cours')));
  }
  const warnings = store.getWarnings();
  if (warnings.length) toast(`${warnings.length} ligne(s) de journal illisible(s) ignorée(s).`, 'warn');
  navigate((location.hash || '').slice(1) || 'listes');
  rappelInscriptions();
}

// Rappel au démarrage : nouvelles pré-inscriptions arrivées sur Tally.
async function rappelInscriptions() {
  if (!config.tally || !config.tally.configuree || store.getConsultation()) return;
  try {
    const { recs } = await lireSources(bridge);
    const n = nbNouvelles(store.get(), recs);
    majBadge(n);
    if (n) toast(`${n} nouvelle${n > 1 ? 's' : ''} pré-inscription${n > 1 ? 's' : ''} sur Tally : voir l'écran Pré-inscriptions.`);
  } catch { /* hors connexion : pas de rappel */ }
}

let lastRemote = null;
async function updateStatus(info) {
  if (info && info.remote) lastRemote = info.remote[info.remote.length - 1];
  const el = document.getElementById('status');
  if (!el) return;
  const others = await bridge.others();
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - new Date(t)) / 1000)); return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`; };
  const s = store.get();
  fill(el, ...[
    h('span', {}, 'Connecté : ', h('b', {}, config.profil)),
    others.length ? h('span', {}, others.map((o) => `${o.profil} actif il y a ${ago(o.t)}`).join(' · ')) : h('span', { class: 'muted' }, 'Personne d\'autre en ligne'),
    lastRemote ? h('span', { class: 'muted' }, `Dernière modif. reçue : ${lastRemote.by} à ${new Date(lastRemote.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`) : null,
    h('span', { class: 'spacer' }),
    s ? h('span', { class: 'muted' }, `Année ${s.year}`) : null,
    h('button', { class: 'link', title: 'Changer d\'utilisateur', onclick: async () => { await bridge.setProfil(null); location.reload(); } }, 'Changer de profil'),
    h('span', { class: 'version' }, `v${bridge.version}`)].filter(Boolean));
}

function backupSoon() {
  setTimeout(() => { const s = store.get(); if (s) bridge.backup(store.cleanState()); }, 5000);
  setInterval(() => { const s = store.get(); if (s) bridge.backup(store.cleanState()); }, 3600 * 1000);
}

export async function navigate(id, params = {}) {
  const main = document.getElementById('main');
  if (!main) return;
  if (current.cleanup) { try { current.cleanup(); } catch { /* écran déjà fermé */ } }
  current = { id, cleanup: null };
  history.replaceState(null, '', `#${id}`);
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.id === id));
  clear(main).appendChild(h('div', { class: 'loading' }, 'Chargement…'));
  try {
    const mod = await import(`./screens/${id}.js`);
    if (current.id !== id) return;
    clear(main);
    const subs = [];
    const ctx = {
      bridge, store, navigate, params,
      subscribe: (fn) => { const u = store.subscribe(fn); subs.push(u); return u; },
    };
    const cleanup = mod.render(main, ctx);
    current.cleanup = () => { subs.forEach((u) => u()); if (typeof cleanup === 'function') cleanup(); };
  } catch (e) {
    console.error(e);
    clear(main).appendChild(h('div', { class: 'error' }, `Erreur à l'ouverture de l'écran : ${e.message}`));
  }
}

window.addEventListener('error', (e) => toast(`Erreur : ${e.message}`, 'err'));
window.addEventListener('unhandledrejection', (e) => toast(`Erreur : ${e.reason && e.reason.message ? e.reason.message : e.reason}`, 'err'));
boot().catch((e) => { console.error(e); clear(root).appendChild(h('div', { class: 'error' }, `Impossible de démarrer : ${e.message}`)); });
