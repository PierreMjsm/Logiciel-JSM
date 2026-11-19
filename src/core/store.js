import { nomComplet } from './noms.js';
// Données « par journal » : un état de départ + une liste de modifications.
// Chaque modification remplace la valeur à un chemin ; la plus récente gagne.
import { dateFr } from './format.js';
import { activityLabel } from './calendar.js';

export function makeOp({ by, dev, seq, path, value, t }) {
  return { t: t || new Date().toISOString(), by, dev, seq, path, value: value === undefined ? null : value };
}

export function compareOps(a, b) {
  if (a.t !== b.t) return a.t < b.t ? -1 : 1;
  if (a.dev !== b.dev) return a.dev < b.dev ? -1 : 1;
  return (a.seq || 0) - (b.seq || 0);
}

export function sortOps(ops) {
  return [...ops].sort(compareOps);
}

export function pathKey(path) {
  return path.join('\u0001');
}

export function setPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  const last = path[path.length - 1];
  if (value === null) delete cur[last];
  else cur[last] = value && typeof value === 'object' ? structuredClone(value) : value;
}

export function applyOps(base, ops, into) {
  const state = into || structuredClone(base);
  if (!state._lastWriter) state._lastWriter = {};
  state._rev = (state._rev || 0) + 1;
  for (const op of ops) {
    setPath(state, op.path, op.value);
    state._lastWriter[pathKey(op.path)] = { by: op.by, t: op.t, dev: op.dev };
  }
  return state;
}

function childName(state, id) {
  return nomComplet(state, id);
}

const FIELD_LABELS = {
  children: 'Enfant', families: 'Famille', payments: 'Règlement', params: 'Paramètres', extraDates: 'Dates',
};

export function opLabel(op, state) {
  const [root, key, ...rest] = op.path;
  const v = op.value === null ? '(supprimé)' : typeof op.value === 'object' ? '(fiche)' : String(op.value);
  if (root === 'presences') {
    const [cid, act, date, slot] = key.split('|');
    return `Présence ${childName(state, cid)} · ${activityLabel(act)} · ${dateFr(date)}${slot ? ' ' + slot : ''} → ${op.value === null ? 'vide' : op.value}`;
  }
  if (root === 'children') return `Enfant ${childName(state, key)}${rest.length ? ' · ' + rest.join(' ') : ''} → ${v}`;
  if (root === 'families') {
    const f = state && state.families && state.families[key];
    return `Famille ${f ? f.nom : key}${rest.length ? ' · ' + rest.join(' ') : ''} → ${v}`;
  }
  return `${FIELD_LABELS[root] || root} ${[key, ...rest].filter(Boolean).join(' · ')} → ${v}`;
}

export function historyOf(ops, state, filter) {
  const out = [];
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    const e = { t: op.t, by: op.by, label: opLabel(op, state), op };
    if (!filter || filter(e)) out.push(e);
  }
  return sortHistory(out);
}

function sortHistory(list) {
  return list.sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
}
