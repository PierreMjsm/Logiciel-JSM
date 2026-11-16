// Heures CAF : heures par activité et par tranche d'âge (-6 ans, 6 ans et +, collégiens).
import { h, fill, field, select, toast, todayIso } from '../ui.js';
import { cafSynthese, toCsv } from '../../src/core/reports.js';
import { round2, dateFr, addDays } from '../../src/core/format.js';

const HEURES = [
  ['mercrediMatin', 'Mercredi matin'], ['mercrediAprem', 'Mercredi après-midi'], ['vacancesJournee', 'Journée de vacances'],
  ['vacancesCollegiensJournee', 'Journée vacances collégiens'], ['adoSoiree', 'Soirée ADO'], ['collegienPedibus', 'Pédibus collégien (C)'],
];
const fmt = (n) => (n ? `${String(round2(n)).replace('.', ',')} h` : '');

export function render(root, ctx) {
  const st0 = ctx.store.get();
  const T = st0.params.trimestres;
  const ete = st0.params.periods.filter((p) => ['collegiens', 'rose', 'juillet', 'aout'].includes(p.id));
  const PERIODES = [
    ['acejour', 'De la rentrée à aujourd\'hui', T[0].start, todayIso()],
    ['annee', 'Année entière (y compris les présences prévues)', T[0].start, st0.params.periods.reduce((m, p) => (p.end > m ? p.end : m), T[2].end)],
    ['t1', '1er trimestre (avec Toussaint et Noël)', T[0].start, addDays(T[1].start, -1)],
    ['t2', '2e trimestre (avec Hiver et Printemps)', T[1].start, addDays(T[2].start, -1)],
    ['t3', '3e trimestre', T[2].start, T[2].end],
    ['ete', 'Été (collégiens, juillet, août)', ete.reduce((m, p) => (p.start < m ? p.start : m), '9999'), ete.reduce((m, p) => (p.end > m ? p.end : m), '0000')],
    ['perso', 'Dates au choix', T[0].start, todayIso()],
  ];
  let per = 'acejour', from = PERIODES[0][2], to = PERIODES[0][3];
  const tableBox = h('div');
  const heuresBox = h('div', { class: 'form-grid' });
  const datesBox = h('div', { class: 'tools' });
  let rows = [];

  const columns = [
    { key: 'label', label: 'Activité', get: (r) => r.label },
    ...[['moins6', 'Moins de 6 ans'], ['plus6', '6 ans et +'], ['collegiens', 'Collégiens'], ['total', 'Total']].flatMap(([k, l]) => [
      { key: `${k}-p`, label: `${l} — présences`, get: (r) => r[k].presences },
      { key: `${k}-h`, label: `${l} — heures`, get: (r) => r[k].heures },
    ]),
  ];

  const draw = () => {
    const s = ctx.store.get();
    rows = cafSynthese(s, from, to);
    const head = h('thead', {},
      h('tr', {}, h('th', { rowspan: 2 }, 'Activité'), ['Moins de 6 ans', '6 ans et +', 'Collégiens', 'Total'].map((l) => h('th', { colspan: 2, style: { textAlign: 'center' } }, l))),
      h('tr', {}, [0, 1, 2, 3].flatMap(() => [h('th', { class: 'num' }, 'présences'), h('th', { class: 'num' }, 'heures')])));
    const body = h('tbody', {}, rows.map((r) => h('tr', { style: r.id === 'total' ? { fontWeight: '700', background: '#f8fafc' } : null },
      h('td', {}, r.label),
      ['moins6', 'plus6', 'collegiens', 'total'].flatMap((k) => [h('td', { class: 'num' }, r[k].presences || ''), h('td', { class: 'num' }, fmt(r[k].heures))]))));
    fill(tableBox, rows.length > 1 ? h('table', { class: 'grid' }, head, body) : h('p', { class: 'muted' }, 'Aucune présence sur cette période.'));
    const a = s.params.cafAutres || {};
    fill(heuresBox, HEURES.map(([k, l]) => field(l, h('input', {
      type: 'text', inputmode: 'decimal', name: `h-${k}`, value: String(a[k] ?? 0).replace('.', ','), style: { width: '90px' },
      onchange: async (e) => {
        const v = Number(String(e.target.value).replace(',', '.'));
        if (!Number.isFinite(v) || v < 0) { toast('Nombre d\'heures invalide.', 'err'); return; }
        await ctx.store.dispatch(['params', 'cafAutres', k], v);
        draw();
      },
    }))));
    fill(datesBox, per === 'perso'
      ? [field('Du', h('input', { type: 'date', value: from, onchange: (e) => { from = e.target.value || from; draw(); } })), field('Au', h('input', { type: 'date', value: to, onchange: (e) => { to = e.target.value || to; draw(); } }))]
      : h('span', { class: 'muted' }, `du ${dateFr(from)} au ${dateFr(to)}`));
  };

  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Heures CAF'),
      h('div', { class: 'tools' }, h('button', { class: 'primary', onclick: async () => {
        const p = await ctx.bridge.saveText({ fileName: `Heures CAF ${dateFr(from).replace(/\//g, '-')} au ${dateFr(to).replace(/\//g, '-')}.csv`, text: toCsv(columns, rows) });
        if (p) toast(`Fichier enregistré : ${p}`);
      } }, 'Exporter pour Excel (CSV)'))),
    h('p', { class: 'muted' }, 'Heures de présence par activité et par tranche d\'âge. Un jour payé compte : présences (P, KT, C) et absences facturées (A, AKT). La tranche suit le groupe de l\'enfant à chaque date (un enfant qui passe en 4-5 ans l\'été reste compté « moins de 6 ans »).'),
    h('div', { class: 'tools', style: { marginBottom: '12px' } },
      select(PERIODES.map(([k, l]) => [k, l]), per, { name: 'periode', onchange: (e) => { per = e.target.value; const p = PERIODES.find(([k]) => k === per); if (per !== 'perso') { from = p[2]; to = p[3]; } draw(); } }),
      datesBox),
    tableBox,
    h('section', { class: 'card', style: { marginTop: '16px' } },
      h('h2', {}, 'Heures comptées par présence'),
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'Le Pédibus se compte selon l\'école et le jour (tableau dans Paramètres › Heures CAF). Pour le reste, un nombre fixe :'),
      heuresBox));
  draw();
  ctx.subscribe((s, info) => { if (info && (info.remote || info.reset)) draw(); });
}
