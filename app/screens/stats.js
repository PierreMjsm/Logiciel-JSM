// Statistiques CAF (séparées par activité, en heures) et bilan de l'année.
import { h, fill, field, todayIso, table, toast } from '../ui.js';
import { cafStats, cafDetail, bilan, toCsv, compteRendu } from '../../src/core/reports.js';
import { compteRenduHtml } from '../compte-rendu.js';
import { euro, round2, dateFr } from '../../src/core/format.js';
import { VACANCES_LABELS } from '../../src/core/calendar.js';

const DAYS = ['lundi', 'mardi', 'jeudi', 'vendredi'];
const hrs = (n) => `${String(round2(n)).replace('.', ',')} h`;
const perLabel = (k) => (k === 'exceptionnel' ? 'Journées exceptionnelles' : `Vacances ${VACANCES_LABELS[k] || k}`);

export function render(root, ctx) {
  const s0 = ctx.store.get();
  let from = s0.params.trimestres[0].start;
  let to = todayIso() < s0.params.trimestres[2].end ? todayIso() : s0.params.trimestres[2].end;
  const body = h('div');
  const bil = h('div');
  let sections = [];

  const draw = () => {
    const s = ctx.store.get();
    const ped = cafStats(s, from, to);
    const d = cafDetail(s, from, to);
    sections = [
      {
        title: 'Pédibus', hint: 'Jours payés (P, A, KT, AKT), par école, catégorie d\'âge et jour. Heures = présences × heures par jour (Paramètres › Heures CAF).',
        columns: [
          { key: 'ecole', label: 'École', get: (r) => r.ecole },
          { key: 'cat', label: 'Catégorie', get: (r) => r.categorie },
          ...DAYS.flatMap((dd) => [
            { key: `${dd}-p`, label: `${dd} présences`, class: 'num', get: (r) => r.byDay[dd].presences },
            { key: `${dd}-h`, label: `${dd} heures`, class: 'num', get: (r) => r.byDay[dd].heures, render: (r) => (r.byDay[dd].heures ? hrs(r.byDay[dd].heures) : '') },
          ]),
          { key: 'tp', label: 'Total présences', class: 'num', get: (r) => r.totalPresences },
          { key: 'th', label: 'Total heures', class: 'num', get: (r) => r.totalHeures, render: (r) => h('b', {}, hrs(r.totalHeures)) },
        ],
        rows: ped,
      },
      {
        title: 'Pédibus collégiens', hint: 'Présences « C » des collégiens au Pédibus.',
        columns: [{ key: 'ecole', label: 'École', get: (r) => r.ecole }, { key: 'p', label: 'Présences', class: 'num', get: (r) => r.presences }, { key: 'h', label: 'Heures', class: 'num', get: (r) => r.heures }],
        rows: d.collegiensPedibus,
      },
      {
        title: 'Mercredis', hint: 'Demi-journées payées (P et A) par catégorie d\'âge.',
        columns: [{ key: 'cat', label: 'Catégorie', get: (r) => r.categorie }, { key: 'm', label: 'Matins', class: 'num', get: (r) => r.matin }, { key: 'a', label: 'Après-midi', class: 'num', get: (r) => r.aprem }, { key: 'h', label: 'Heures', class: 'num', get: (r) => r.heures }],
        rows: d.mercredi,
      },
      {
        title: 'Vacances et journées exceptionnelles', hint: 'Journées payées (P et A) par période et catégorie d\'âge (les collégiens à part).',
        columns: [{ key: 'per', label: 'Période', get: (r) => perLabel(r.periode) }, { key: 'cat', label: 'Catégorie', get: (r) => r.categorie }, { key: 'j', label: 'Journées', class: 'num', get: (r) => r.jours }, { key: 'h', label: 'Heures', class: 'num', get: (r) => r.heures }],
        rows: d.vacances,
      },
      {
        title: 'Soirées ADO', hint: 'Collégiens présents à chaque soirée.',
        columns: [{ key: 'd', label: 'Soirée', get: (r) => dateFr(r.date) }, { key: 'p', label: 'Présents', class: 'num', get: (r) => r.presences }, { key: 'h', label: 'Heures', class: 'num', get: (r) => r.heures }],
        rows: d.ado,
      },
    ];
    fill(body, sections.map((sec) => h('section', { class: 'card', style: { marginBottom: '14px' } },
      h('div', { class: 'tools' }, h('h2', { style: { margin: 0 } }, sec.title), h('span', { class: 'spacer' }),
        h('button', { onclick: () => save(sec.title, toCsv(sec.columns, sec.rows)) }, 'Exporter (CSV)')),
      h('p', { class: 'muted' }, sec.hint),
      table(sec.columns, sec.rows, { empty: 'Aucune présence sur cette période.' }))));

    const b = bilan(s, todayIso());
    const rowsB = [
      ...[1, 2, 3].map((n) => ({ label: `Pédibus T${n}`, jours: b.pedibus[n].jours + b.pedibus[n].kt, prevu: b.pedibus[n].prevu, regle: b.pedibus[n].regle })),
      ...[1, 2, 3].map((n) => ({ label: `Mercredis T${n} (½ j.)`, ...b.mercredi[n] })),
      ...Object.entries(b.vacances).map(([k, v]) => ({ label: perLabel(k), ...v })),
    ];
    fill(bil,
      h('div', { class: 'cards' }, stat(b.enfantsActifs, 'enfants présents cette année'), stat(b.adherents, 'adhérents (adhésion réglée)'),
        stat(String(b.moyennes.pedibusParJour).replace('.', ','), 'enfants en moyenne par jour de Pédibus'),
        stat(String(b.moyennes.mercrediParDemiJournee).replace('.', ','), 'enfants en moyenne par demi-journée de mercredi')),
      table([
        { key: 'label', label: 'Activité', get: (r) => r.label },
        { key: 'jours', label: 'Jours facturés', class: 'num', get: (r) => r.jours },
        { key: 'prevu', label: 'Prévu (tarif plein)', class: 'num', get: (r) => r.prevu, render: (r) => euro(r.prevu) },
        { key: 'regle', label: 'Réglé', class: 'num', get: (r) => r.regle, render: (r) => euro(r.regle) },
      ], rowsB));
  };

  async function save(title, text) {
    const p = await ctx.bridge.saveText({ fileName: `CAF ${title} ${dateFr(from).replace(/\//g, '-')} au ${dateFr(to).replace(/\//g, '-')}.csv`, text });
    if (p) toast(`Fichier enregistré : ${p}`);
  }
  async function saveAll() {
    const text = sections.map((sec) => `${sec.title}\r\n${toCsv(sec.columns, sec.rows).replace(/^﻿/, '')}`).join('\r\n\r\n');
    const p = await ctx.bridge.saveText({ fileName: `CAF ${dateFr(from).replace(/\//g, '-')} au ${dateFr(to).replace(/\//g, '-')}.csv`, text: `﻿${text}` });
    if (p) toast(`Fichier enregistré : ${p}`);
  }

  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Statistiques et bilan'),
      h('div', { class: 'tools' },
        h('button', { title: 'Effectifs, activités, heures CAF et compta de l\'année, sur 2 pages', onclick: () => ctx.bridge.print({ html: compteRenduHtml(compteRendu(ctx.store.get(), todayIso())) }) }, 'Imprimer le compte rendu de l\'année'),
        h('button', { class: 'primary', onclick: saveAll }, 'Exporter tout pour Excel (CSV)'))),
    h('p', { class: 'muted' }, 'Chaque activité est comptée à part : vous pouvez reprendre ces chiffres dans votre propre tableau pour la CAF.'),
    h('div', { class: 'tools', style: { marginBottom: '10px' } },
      field('Du', h('input', { type: 'date', name: 'from', value: from, onchange: (e) => { from = e.target.value || from; draw(); } })),
      field('Au', h('input', { type: 'date', name: 'to', value: to, onchange: (e) => { to = e.target.value || to; draw(); } }))),
    body,
    h('h2', { style: { marginTop: '24px' } }, 'Bilan de l\'année'),
    bil);
  draw();
  ctx.subscribe(draw);
}

function stat(v, l) { return h('div', { class: 'card stat' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)); }
