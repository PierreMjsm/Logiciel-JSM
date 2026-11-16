// Jours habituels : remplir les présences de l'année d'après le planning de chaque enfant.
// child.planning = { pedibus: [1, 2, 4, 5] (jours de la semaine, 1 = lundi), mercredi: ['matin', 'aprem'] }
import { activityDates, ktDay, groupAt } from './calendar.js';
import { weekday } from './format.js';

export const JOURS_PEDIBUS = [[1, 'Lundi'], [2, 'Mardi'], [4, 'Jeudi'], [5, 'Vendredi']];

function expected(state, child, activity, date, slot) {
  const plan = child.planning || {};
  const ins = child.inscriptions || {};
  if (activity === 'pedibus') {
    const kd = ktDay(state.params, date);
    if ((kd === 'mardi' && ins.ktMardi) || (kd === 'jeudi' && ins.ktJeudi)) return 'KT';
    if (!(plan.pedibus || []).includes(weekday(date))) return null;
    return groupAt(child, date) === 'Collégiens' ? 'C' : 'P';
  }
  if (activity === 'mercredi') return (plan.mercredi || []).includes(slot) ? 'P' : null;
  return null;
}

export function hasPlanning(child, activity) {
  const p = (child.planning || {})[activity];
  return Array.isArray(p) && p.length > 0;
}

export function fillFromPlanning(state, { activity, from, to, childIds = null, replace = false }) {
  const dates = activityDates(state.params, activity, state.extraDates || {}).filter((d) => d >= from && d <= to);
  const slots = activity === 'mercredi' ? ['matin', 'aprem'] : [''];
  const ids = (childIds || Object.keys(state.children)).filter((id) => state.children[id] && hasPlanning(state.children[id], activity));
  const changes = [];
  for (const id of ids) {
    const child = state.children[id];
    if (groupAt(child, from) === 'Plus présent') continue;
    for (const date of dates) {
      for (const slot of slots) {
        const key = `${id}|${activity}|${date}|${slot}`;
        const cur = state.presences[key];
        const want = expected(state, child, activity, date, slot);
        if (cur) {
          if (replace && cur !== 'A' && cur !== 'AKT' && cur !== want) changes.push([['presences', key], want]);
          continue;
        }
        if (want) changes.push([['presences', key], want]);
      }
    }
  }
  return changes;
}

// Retrouve les jours habituels d'après les présences existantes : un jour est « habituel »
// s'il est coché (P, KT ou C) au moins 3 fois, et au moins 40 % aussi souvent que le jour le plus fréquent de l'enfant.
export function derivePlanning(state) {
  const counts = new Map(); // id -> { pedibus: {wd: n}, mercredi: {slot: n} }
  for (const [k, v] of Object.entries(state.presences)) {
    if (!['P', 'KT', 'C'].includes(v)) continue;
    const [id, act, date, slot] = k.split('|');
    if (act !== 'pedibus' && act !== 'mercredi') continue;
    if (!counts.has(id)) counts.set(id, { pedibus: {}, mercredi: {} });
    const c = counts.get(id)[act];
    const key = act === 'pedibus' ? weekday(date) : slot;
    c[key] = (c[key] || 0) + 1;
  }
  const keep = (obj) => {
    const max = Math.max(0, ...Object.values(obj));
    return Object.entries(obj).filter(([, n]) => n >= 3 && n >= 0.4 * max).map(([k]) => k);
  };
  const out = {};
  for (const [id, c] of counts) {
    const plan = {};
    const ped = keep(c.pedibus).map(Number).filter((wd) => [1, 2, 4, 5].includes(wd)).sort();
    const mer = ['matin', 'aprem'].filter((sl) => keep(c.mercredi).includes(sl));
    if (ped.length) plan.pedibus = ped;
    if (mer.length) plan.mercredi = mer;
    if (Object.keys(plan).length) out[id] = plan;
  }
  return out;
}
