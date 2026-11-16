// État de l'application : base + journaux, rejoués ; synchronisation en direct.
import { makeOp, sortOps, applyOps, compareOps } from '../src/core/store.js';

let bridge = null;
let base = null;
let ops = [];
let state = null;
let me = { profil: '', device: '' };
let seq = 0;
let warnings = [];
let notices = [];
let consultation = null;
const listeners = new Set();
const remoteListeners = new Set();

export async function init(br, config) {
  bridge = br;
  me = { profil: config.profil, device: config.device };
  await reload();
  bridge.onRemote((remote, info) => {
    if (info && info.reset) { reload().then(() => notify({ reset: true })); return; }
    receive(remote);
  });
}

export async function reload() {
  const r = await bridge.load();
  base = r.base;
  warnings = r.warnings || [];
  notices = r.notices || [];
  consultation = r.consultation || null;
  ops = sortOps(r.ops || []);
  seq = ops.filter((o) => o.dev === me.device).reduce((m, o) => Math.max(m, o.seq || 0), 0);
  state = base ? applyOps(base, ops) : null;
  return state;
}

function receive(remote) {
  if (!remote.length || !state) return;
  const last = ops.length ? ops[ops.length - 1] : null;
  const sorted = sortOps(remote);
  ops = sortOps([...ops, ...remote]);
  if (last && compareOps(sorted[0], last) < 0) state = applyOps(base, ops); // arrivée dans le désordre : on rejoue tout
  else applyOps(base, sorted, state);
  notify({ remote: sorted });
  remoteListeners.forEach((fn) => fn(sorted));
}

export function get() { return state; }
export function getOps() { return ops; }
export function getWarnings() { return warnings; }
export function getNotices() { return notices; }
// Année ouverte en consultation (lecture seule) : son libellé, sinon null.
export function getConsultation() { return consultation; }
export function whoami() { return me; }

export async function dispatch(path, value) {
  return dispatchMany([[path, value]]);
}

export async function dispatchMany(changes) {
  if (consultation) throw new Error(`Année ${consultation} en consultation : rien ne peut être modifié. Revenez à l'année en cours pour saisir.`);
  const t = new Date().toISOString();
  const made = changes.map(([path, value]) => makeOp({ by: me.profil, dev: me.device, seq: ++seq, t, path, value }));
  applyOps(base, made, state);
  ops.push(...made);
  notify({ local: made });
  pending.push(...made);
  await flush();
  return made;
}

// Écritures en attente : si le dossier partagé est momentanément indisponible,
// on réessaie toutes les 5 secondes au lieu de perdre la saisie.
const pending = [];
let retryTimer = null;
let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (pending.length) {
      try {
        await bridge.append(pending[0]);
        pending.shift();
      } catch (e) {
        notifyWrite(`${pending.length} modification(s) pas encore enregistrée(s) dans le dossier partagé — réessai automatique… (${e.message})`);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(flush, 5000);
        return;
      }
    }
    notifyWrite(null);
  } finally { flushing = false; }
}
const writeListeners = new Set();
let lastWriteMsg = null;
function notifyWrite(msg) { if (msg !== lastWriteMsg) { lastWriteMsg = msg; writeListeners.forEach((fn) => fn(msg)); } }
export function onWriteStatus(fn) { writeListeners.add(fn); return () => writeListeners.delete(fn); }
export function pendingCount() { return pending.length; }

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onRemoteOps(fn) { remoteListeners.add(fn); return () => remoteListeners.delete(fn); }
function notify(info) { listeners.forEach((fn) => fn(state, info)); }

export function newId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function cleanState() {
  const s = { ...state };
  delete s._lastWriter;
  delete s._rev;
  return s;
}
