// Paramètres de l'année : périodes, fériés, tarifs, listes, heures CAF, attestation, nouvelle année.
import { h, fill, field, toast, confirmBox, modal } from '../ui.js';
import { newYear } from '../../src/core/newyear.js';
import { dateFr, euro } from '../../src/core/format.js';

const TARIFS = [['adhesion', 'Adhésion obligatoire (par enfant)'], ['pedibus', 'Pédibus (par jour)'], ['kt', 'KT (par jour)'], ['collegien', 'Pédibus collégien « C » (par jour)'], ['mercredi', 'Mercredi (par demi-journée)'], ['journee', 'Journée de vacances'], ['exceptionnel', 'Journée exceptionnelle']];
const DAYS = ['lundi', 'mardi', 'jeudi', 'vendredi'];

export function render(root, ctx) {
  const body = h('div');
  const set = (path, value) => ctx.store.dispatch(['params', ...path], value);

  const draw = () => {
    const s = ctx.store.get();
    const p = s.params;
    fill(body,
      section('Tarifs', 'Les montants dus sont recalculés immédiatement pour toute l\'année.',
        h('div', { class: 'form-grid' }, TARIFS.map(([k, l]) => field(l, h('input', {
          type: 'number', step: '0.01', min: '0', name: `tarif-${k}`, value: p.tarifs[k] ?? (k === 'collegien' ? 1.5 : 0),
          onchange: async (e) => { const v = Number(e.target.value); if (v >= 0 && v !== p.tarifs[k]) { await set(['tarifs', k], v); toast(`${l} : ${euro(v)}`); } },
        }))))),
      section('Périodes de l\'année', 'Trimestres d\'école et vacances. Les dates de Pédibus, Mercredi et vacances en découlent.',
        h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Période'), h('th', {}, 'Type'), h('th', {}, 'Début'), h('th', {}, 'Fin'))),
          h('tbody', {}, p.periods.map((per, i) => h('tr', {},
            h('td', {}, per.label), h('td', {}, per.kind === 'ecole' ? `École (T${per.trimestre})` : 'Vacances'),
            h('td', {}, h('input', { type: 'date', value: per.start, onchange: (e) => e.target.value && set(['periods', i, 'start'], e.target.value) })),
            h('td', {}, h('input', { type: 'date', value: per.end, onchange: (e) => e.target.value && set(['periods', i, 'end'], e.target.value) }))))))),
      section('Trimestres de facturation', 'Pédibus et mercredis sont facturés par trimestre.',
        h('div', { class: 'form-grid' }, p.trimestres.map((t, i) => h('div', {}, h('b', {}, `Trimestre ${t.n}`),
          field('Du', h('input', { type: 'date', value: t.start, onchange: (e) => e.target.value && set(['trimestres', i, 'start'], e.target.value) })),
          field('Au', h('input', { type: 'date', value: t.end, onchange: (e) => e.target.value && set(['trimestres', i, 'end'], e.target.value) })))))),
      section('Jours fériés', 'Ces jours sont retirés des grilles de présence.',
        h('div', {}, p.feries.map((d, i) => h('span', { class: 'chip', style: { padding: '4px 10px' } }, dateFr(d), ' ',
          h('button', { class: 'link', title: 'Retirer', onclick: () => set(['feries'], p.feries.filter((_, j) => j !== i)) }, '×'))),
          h('input', { type: 'date', title: 'Ajouter un jour férié', onchange: (e) => e.target.value && set(['feries'], [...new Set([...p.feries, e.target.value])].sort()) }))),
      section('Rentrée du KT', 'Le KT n\'est proposé dans la grille Pédibus qu\'à partir de ces dates.',
        h('div', { class: 'form-grid' },
          field('KT mardi à partir du', h('input', { type: 'date', value: p.ktStart.mardi, onchange: (e) => e.target.value && set(['ktStart', 'mardi'], e.target.value) })),
          field('KT jeudi à partir du', h('input', { type: 'date', value: p.ktStart.jeudi, onchange: (e) => e.target.value && set(['ktStart', 'jeudi'], e.target.value) })))),
      section('Listes', 'Une valeur par ligne.',
        h('div', { class: 'form-grid' },
          listField('Écoles (ordre des pages Pédibus)', p.ecoles, (v) => set(['ecoles'], v.map((x) => x.toUpperCase()))),
          listField('Écoles du Pédibus mercredi', p.pediMercrediEcoles, (v) => set(['pediMercrediEcoles'], v.map((x) => x.toUpperCase()))),
          listField('Groupes d\'âge', p.groupes, (v) => set(['groupes'], v)),
          listField('Statuts de dossier', p.statuts, (v) => set(['statuts'], v)))),
      section('Heures CAF', 'Heures comptées par présence au Pédibus, selon l\'école, la catégorie et le jour.',
        h('table', { class: 'grid' },
          h('thead', {}, h('tr', {}, h('th', {}, 'École'), h('th', {}, 'Catégorie'), DAYS.map((d) => h('th', {}, d)))),
          h('tbody', {}, Object.entries(p.cafHeures).flatMap(([ecole, cats]) => ['KT', '-6', '6-11'].map((cat) => h('tr', {},
            h('td', {}, ecole), h('td', {}, cat),
            DAYS.map((d) => h('td', {}, h('input', { type: 'number', step: '0.5', min: '0', style: { width: '70px' }, value: cats[cat]?.[d] ?? 0,
              onchange: (e) => set(['cafHeures', ecole, cat, d], Number(e.target.value)) }))))))))),
      section('Documents du dossier', 'Pièces demandées pour chaque enfant (une par ligne). Le dossier est « complet » quand toutes sont cochées sur la fiche de l\'enfant.',
        listField('Documents', (p.documents || []).map((d) => d.label), (v) => set(['documents'], v.map((label, i) => ({ id: (p.documents || [])[i]?.label === label ? p.documents[i].id : label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label }))))),
      section('Heures CAF des autres activités', 'Heures comptées par présence, pour les tableaux séparés de l\'écran Statistiques CAF (laisser 0 si vous faites le calcul vous-même).',
        h('div', { class: 'form-grid' }, [['collegienPedibus', 'Pédibus collégien (par présence C)'], ['mercrediMatin', 'Mercredi matin'], ['mercrediAprem', 'Mercredi après-midi'], ['vacancesJournee', 'Journée de vacances'], ['adoSoiree', 'Soirée ADO']].map(([k, l]) =>
          field(l, h('input', { type: 'number', step: '0.25', min: '0', name: `caf-${k}`, value: (p.cafAutres || {})[k] ?? 0, onchange: (e) => set(['cafAutres', k], Number(e.target.value)) }))))),
      section('Attestation', null,
        h('div', { class: 'form-grid' },
          field('Trésorier', h('input', { type: 'text', value: p.attestation.tresorier, onchange: (e) => set(['attestation', 'tresorier'], e.target.value) })),
          field('N° d\'habilitation', h('input', { type: 'text', value: p.attestation.habilitation, onchange: (e) => set(['attestation', 'habilitation'], e.target.value) })))),
      section('Ce poste', null,
        h('div', { class: 'tools' },
          h('button', { onclick: async () => { const f = await ctx.bridge.choosePdfFolder(); if (f) toast(`Les PDF seront enregistrés dans ${f}`); } }, 'Changer le dossier des PDF'),
          h('button', { onclick: async () => { if (await ctx.bridge.chooseFolder()) location.reload(); } }, 'Changer le dossier partagé'))),
      section('Nouvelle année scolaire', `Année en cours : ${s.year}. Crée un nouveau dossier à côté de l'actuel, avec les familles et les enfants encore présents ; présences et règlements repartent de zéro. L'année ${s.year} reste consultable.`,
        h('button', { class: 'danger', onclick: () => startNewYear(ctx) }, 'Préparer la nouvelle année…')));
  };

  root.append(h('header', { class: 'screen-head' }, h('h1', {}, 'Paramètres')), body);
  draw();
  ctx.subscribe((st, info) => { if (info && info.remote && info.remote.some((o) => o.path[0] === 'params')) draw(); });
}

function section(title, hint, content) {
  return h('section', { class: 'card', style: { marginBottom: '14px' } }, h('h2', {}, title), hint ? h('p', { class: 'muted', style: { marginTop: 0 } }, hint) : null, content);
}

function listField(label, values, onSave) {
  return field(label, h('textarea', { style: { minHeight: '140px' }, onchange: (e) => onSave(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean)) }, values.join('\n')));
}

function startNewYear(ctx) {
  const s = ctx.store.get();
  const [y1] = s.year.split('-').map(Number);
  const label = `${y1 + 1}-${y1 + 2}`;
  let start = `${y1 + 1}-09-01`;
  modal('Nouvelle année scolaire', h('div', {},
    h('p', {}, `Un dossier « JSM-${label} » sera créé à côté du dossier actuel. Pensez ensuite à vérifier les dates des périodes et les jours fériés dans les Paramètres de la nouvelle année.`),
    field('Date de rentrée (pour calculer les groupes d\'âge)', h('input', { type: 'date', value: start, onchange: (e) => { start = e.target.value || start; } }))), [
    { label: 'Annuler' },
    { label: `Créer l'année ${label}`, primary: true, onClick: async () => {
      if (!(await confirmBox('Confirmer', `Créer l'année ${label} et basculer dessus sur ce poste ?`, 'Créer'))) return false;
      const clean = ctx.store.cleanState();
      const base = newYear(clean, label, clean.params, start);
      try {
        await ctx.bridge.newYear({ base, label });
      } catch (e) { toast(e.message, 'err'); return false; }
      toast(`Année ${label} créée.`);
      setTimeout(() => location.reload(), 600);
      return true;
    } },
  ]);

}
