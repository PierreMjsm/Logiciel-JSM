// Jours habituels : cases à cocher réutilisables + remplissage des présences.
import { h, fill, modal, field, toast, todayIso } from './ui.js';
import { JOURS_PEDIBUS, fillFromPlanning } from '../src/core/planning.js';
import { dateFr } from '../src/core/format.js';

// Modifie planning (objet { pedibus: [...], mercredi: [...] }) en place.
export function planningFields(planning, activities = ['pedibus', 'mercredi']) {
  const box = h('div', { class: 'checks' });
  const toggle = (act, v, on) => {
    const set = new Set(planning[act] || []);
    on ? set.add(v) : set.delete(v);
    planning[act] = [...set].sort();
  };
  if (activities.includes('pedibus')) {
    box.append(h('b', { style: { gridColumn: '1 / -1' } }, 'Pédibus'),
      ...JOURS_PEDIBUS.map(([wd, l]) => h('label', {}, h('input', { type: 'checkbox', name: `plan-pedibus-${wd}`, checked: (planning.pedibus || []).includes(wd), onchange: (e) => toggle('pedibus', wd, e.target.checked) }), ` ${l}`)));
  }
  if (activities.includes('mercredi')) {
    box.append(h('b', { style: { gridColumn: '1 / -1' } }, 'Mercredi'),
      ...[['matin', 'Matin'], ['aprem', 'Après-midi']].map(([sl, l]) => h('label', {}, h('input', { type: 'checkbox', name: `plan-mercredi-${sl}`, checked: (planning.mercredi || []).includes(sl), onchange: (e) => toggle('mercredi', sl, e.target.checked) }), ` ${l}`)));
  }
  return box;
}

export const finAnnee = (state) => state.params.trimestres[state.params.trimestres.length - 1].end;

// Applique le planning à des enfants déjà enregistrés (après dispatch).
export async function applyPlanning(ctx, { childIds, activities = ['pedibus', 'mercredi'], from, replace = true }) {
  const st = ctx.store.get();
  const changes = activities.flatMap((activity) => fillFromPlanning(st, { activity, from, to: finAnnee(st), childIds, replace }));
  if (changes.length) await ctx.store.dispatchMany(changes);
  return changes.length;
}

// Fenêtre « Remplir d'après les jours habituels » pour une activité (tous les enfants).
export function fillDialog(ctx, activity, onDone) {
  const st = ctx.store.get();
  const v = { from: todayIso() > st.params.trimestres[0].start ? todayIso() : st.params.trimestres[0].start, to: finAnnee(st), replace: false };
  const info = h('p', {});
  const count = () => {
    const n = fillFromPlanning(ctx.store.get(), { activity, from: v.from, to: v.to, replace: v.replace });
    const nb = n.filter(([, val]) => val).length, rm = n.filter(([, val]) => !val).length;
    const withPlan = Object.values(ctx.store.get().children).filter((c) => (c.planning?.[activity] || []).length).length;
    fill(info, `${withPlan} enfant(s) ont des jours habituels. `, h('b', {}, `${nb} présence(s) à ajouter`), rm ? `, ${rm} à retirer` : '', '. Les absences (A) et les saisies existantes sont conservées.');
  };
  modal(`Remplir ${activity === 'pedibus' ? 'le Pédibus' : 'les mercredis'} d'après les jours habituels`, h('div', {},
    h('p', { class: 'muted' }, 'Met P (ou KT les jours de KT, C pour les collégiens) sur chaque date qui correspond aux jours habituels de chaque enfant, sans toucher aux vacances ni aux jours fériés.'),
    h('div', { class: 'form-grid' },
      field('Du', h('input', { type: 'date', name: 'from', value: v.from, onchange: (e) => { v.from = e.target.value || v.from; count(); } })),
      field('Au', h('input', { type: 'date', name: 'to', value: v.to, onchange: (e) => { v.to = e.target.value || v.to; count(); } }))),
    h('label', { style: { display: 'block', margin: '8px 0' } }, h('input', { type: 'checkbox', name: 'replace', onchange: (e) => { v.replace = e.target.checked; count(); } }),
      ' Retirer aussi les P prévus qui ne correspondent plus aux jours habituels (changement de planning)'),
    info), [
    { label: 'Annuler' },
    { label: 'Remplir', primary: true, onClick: async () => {
      const changes = fillFromPlanning(ctx.store.get(), { activity, from: v.from, to: v.to, replace: v.replace });
      if (changes.length) await ctx.store.dispatchMany(changes);
      toast(`${changes.length} case(s) mise(s) à jour du ${dateFr(v.from)} au ${dateFr(v.to)}.`);
      onDone?.();
    } },
  ]);
  count();
}
