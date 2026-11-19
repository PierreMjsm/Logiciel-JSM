// Déclaration CAF en année civile : périscolaire, extrascolaire et collégiens (PS Jeunes),
// heures par tranche d'âge, réalisé ou prévision de l'année, participations des familles.
import { h, fill, field, select, toast, todayIso, esc } from '../ui.js';
import { cafAnnee, TRANCHES } from '../../src/core/caf.js';
import { round2, euro } from '../../src/core/format.js';
import { printDocument } from '../print.js';
import { etatsDisponibles, anneesCiviles } from '../annees-civiles.js';

const HEURES = [
  ['mercrediMatin', 'Mercredi matin'], ['mercrediAprem', 'Mercredi après-midi'], ['vacancesJournee', 'Journée de vacances'],
  ['vacancesCollegiensJournee', 'Journée vacances collégiens'], ['adoSoiree', 'Soirée ADO'], ['collegienPedibus', 'Pédibus collégien (C)'],
];
const VUES = [['realise', 'Réalisé à ce jour'], ['prevision', 'Prévision de l\'année (réalisé + inscrit + estimé)']];
const fmtH = (n) => (n ? `${String(round2(n)).replace('.', ',')} h` : '');
const RECETTES = [['peri', 'Périscolaire (Pédibus, mercredis)'], ['extra', 'Extrascolaire (vacances)'], ['exceptionnel', 'Journées exceptionnelles'], ['jeunes', 'Collégiens (PS Jeunes)'], ['adhesion', 'Adhésions'], ['nonAffecte', 'Règlements non affectés']];

// Valeur affichée d'une case selon la vue.
function val(x, vue) {
  if (!x) return { presences: 0, heures: 0, estime: 0 };
  if (vue === 'realise') return { ...x.realise, estime: 0 };
  return {
    presences: x.realise.presences + x.inscrit.presences + x.estime.presences,
    heures: round2(x.realise.heures + x.inscrit.heures + x.estime.heures),
    estime: x.estime.heures,
  };
}

function colonnes(sec) {
  return sec.id === 'jeunes' ? [['J', 'Collégiens']] : TRANCHES;
}

export function render(root, ctx) {
  const today = todayIso();
  let annee = Number(today.slice(0, 4));
  let vue = 'realise';
  let etats = [{ label: ctx.store.get().year, state: ctx.store.get() }];
  let manquants = [];
  let r = null;
  const box = h('div', {}, h('p', { class: 'muted' }, 'Chargement des années…'));
  const controls = h('div', { class: 'tools', style: { marginBottom: '12px' } });
  const heuresBox = h('div', { class: 'form-grid' });

  const table = (sec) => {
    const cols = colonnes(sec);
    const prev = vue === 'prevision';
    const R = { class: 'num', style: { textAlign: 'right' } };
    const head = h('thead', {}, h('tr', {}, h('th', {}, 'Activité'), cols.map(([, l]) => h('th', R, l)), h('th', R, 'Total'), prev ? h('th', { ...R, title: 'Mois à venir sans inscription : même mois de l\'année précédente' }, 'dont estimé') : null));
    const cell = (x) => { const v = val(x, vue); return h('td', R, v.heures ? h('div', {}, h('b', {}, fmtH(v.heures)), h('div', { class: 'muted', style: { fontSize: '11px' } }, `${v.presences} présence${v.presences > 1 ? 's' : ''}`)) : ''); };
    const rows = sec.lignes.map((l) => h('tr', {}, h('td', {}, l.label), cols.map(([t]) => cell(l.tranches[t])), cell(l.total), prev ? h('td', R, fmtH(l.total.estime.heures)) : null));
    const tot = h('tr', { style: { fontWeight: '700', background: '#f8fafc' } }, h('td', {}, `Total ${sec.label.toLowerCase()}`), cols.map(([t]) => cell(sec.tranches[t])), cell(sec.total), prev ? h('td', R, fmtH(sec.total.estime.heures)) : null);
    const enf = h('tr', {}, h('td', {}, 'Enfants différents accueillis'), cols.map(([t]) => h('td', R, sec.tranches[t].enfants || '')), h('td', R, sec.enfants || ''), prev ? h('td') : null);
    return h('table', { class: 'grid' }, head, h('tbody', {}, rows, tot, enf));
  };

  const recettesTable = () => h('table', { class: 'grid' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Participations des familles'), h('th', { class: 'num' }, 'Facturé (présences de l\'année)'), h('th', { class: 'num' }, 'Encaissé (règlements datés de l\'année)'))),
    h('tbody', {}, RECETTES.filter(([k]) => r.recettes[k].facture || r.recettes[k].encaisse).map(([k, l]) =>
      h('tr', {}, h('td', {}, l), h('td', { class: 'num' }, r.recettes[k].facture ? euro(r.recettes[k].facture) : ''), h('td', { class: 'num' }, r.recettes[k].encaisse ? euro(r.recettes[k].encaisse) : '')))));

  // Années scolaires utiles pour l'année civile : la précédente (janvier-août) et la suivante (septembre-décembre).
  const avertissement = () => {
    const besoin = [`${annee - 1}-${annee}`, `${annee}-${annee + 1}`];
    const absentes = besoin.filter((l) => !r.couverts.includes(l));
    const msgs = [];
    if (absentes.includes(`${annee - 1}-${annee}`)) msgs.push(`L'année scolaire ${annee - 1}-${annee} n'est pas dans l'appli : janvier à août ${annee} ne sont pas comptés.`);
    if (absentes.includes(`${annee}-${annee + 1}`) && `${annee}-09-01` <= today) msgs.push(`L'année scolaire ${annee}-${annee + 1} n'est pas dans l'appli : septembre à décembre ${annee} ne sont pas comptés.`);
    if (manquants.length) msgs.push(`Impossible de lire ${manquants.join(', ')} (dossier absent ou en cours de synchronisation).`);
    return msgs.length ? h('p', { class: 'error' }, msgs.join(' ')) : null;
  };

  const draw = () => {
    r = cafAnnee(etats, annee, today);
    const annees = [...new Set([...anneesCiviles(etats), annee])].sort((a, b) => b - a);
    fill(controls,
      select(annees.map((y) => [String(y), `Année ${y}`]), String(annee), { name: 'annee', onchange: (e) => { annee = Number(e.target.value); draw(); } }),
      select(VUES, vue, { name: 'vue', onchange: (e) => { vue = e.target.value; draw(); } }),
      h('span', { class: 'muted' }, vue === 'realise' ? `du 1er janvier au ${today <= r.au ? 'aujourd\'hui' : '31 décembre'}` : 'du 1er janvier au 31 décembre'));
    fill(box,
      avertissement(),
      r.sections.map((sec) => h('section', { class: 'card', style: { marginBottom: '14px' } },
        h('h2', {}, sec.label),
        sec.id === 'peri' ? h('p', { class: 'muted', style: { marginTop: 0 } }, 'Les 3 ans ont leur colonne à part (le mercredi, ils sont déclarés dans l\'autre établissement). Pédibus : heures selon l\'école, le jour et le KT (Paramètres › Heures CAF).') : null,
        sec.id === 'jeunes' ? h('p', { class: 'muted', style: { marginTop: 0 } }, 'Tous les collégiens, sur toutes les activités, comptés ici et non dans le périscolaire ou l\'extrascolaire.') : null,
        sec.lignes.length ? table(sec) : h('p', { class: 'muted' }, 'Aucune présence.'))),
      h('section', { class: 'card', style: { marginBottom: '14px' } }, h('h2', {}, 'Financier'), recettesTable(),
        h('p', { class: 'muted' }, 'Facturé : prix des présences de l\'année (remise fratrie comprise). Encaissé : règlements reçus dans l\'année, selon leur affectation ; le Pédibus des collégiens (C) reste dans le Pédibus.')));
    const a = ctx.store.get().params.cafAutres || {};
    fill(heuresBox, HEURES.map(([k, l]) => field(l, h('input', {
      type: 'text', inputmode: 'decimal', name: `h-${k}`, value: String(a[k] ?? 0).replace('.', ','), style: { width: '90px' },
      onchange: async (e) => {
        const v = Number(String(e.target.value).replace(',', '.'));
        if (!Number.isFinite(v) || v < 0) { toast('Nombre d\'heures invalide.', 'err'); return; }
        await ctx.store.dispatch(['params', 'cafAutres', k], v);
        etats[0] = { label: ctx.store.get().year, state: ctx.store.get() };
        draw();
      },
    }))));
  };

  const csv = () => {
    const lines = [['Section', 'Activité', 'Tranche', 'Présences', 'Heures', 'dont estimé'].join(';')];
    const n = (x) => String(round2(x)).replace('.', ',');
    for (const sec of r.sections) {
      for (const l of [...sec.lignes, { label: 'Total', tranches: sec.tranches, total: sec.total }]) {
        for (const [t, tl] of [...colonnes(sec), ['total', 'Total']]) {
          const v = val(t === 'total' ? l.total : l.tranches[t], vue);
          if (v.presences) lines.push([sec.label, l.label, tl, v.presences, n(v.heures), n(v.estime)].join(';'));
        }
      }
    }
    lines.push('');
    lines.push(['Participations des familles', 'Facturé', 'Encaissé'].join(';'));
    for (const [k, l] of RECETTES) lines.push([l, n(r.recettes[k].facture), n(r.recettes[k].encaisse)].join(';'));
    return `﻿${lines.join('\r\n')}`;
  };

  const printHtml = () => {
    const prev = vue === 'prevision';
    const secHtml = r.sections.filter((s) => s.lignes.length).map((sec) => {
      const cols = colonnes(sec);
      const c = (x) => { const v = val(x, vue); return `<td class="right">${v.heures ? `${esc(fmtH(v.heures))}<br><small>${v.presences}</small>` : ''}</td>`; };
      const rows = sec.lignes.map((l) => `<tr><td>${esc(l.label)}</td>${cols.map(([t]) => c(l.tranches[t])).join('')}${c(l.total)}${prev ? `<td class="right">${esc(fmtH(l.total.estime.heures))}</td>` : ''}</tr>`).join('');
      return `<h3>${esc(sec.label)}</h3><table><thead><tr><th>Activité</th>${cols.map(([, l]) => `<th class="right">${esc(l)}</th>`).join('')}<th class="right">Total</th>${prev ? '<th class="right">dont estimé</th>' : ''}</tr></thead>
        <tbody>${rows}<tr><th>Total</th>${cols.map(([t]) => c(sec.tranches[t])).join('')}${c(sec.total)}${prev ? `<th class="right">${esc(fmtH(sec.total.estime.heures))}</th>` : ''}</tr>
        <tr><td>Enfants différents</td>${cols.map(([t]) => `<td class="right">${sec.tranches[t].enfants || ''}</td>`).join('')}<td class="right">${sec.enfants || ''}</td>${prev ? '<td></td>' : ''}</tr></tbody></table>`;
    }).join('');
    const rec = RECETTES.filter(([k]) => r.recettes[k].facture || r.recettes[k].encaisse).map(([k, l]) => `<tr><td>${esc(l)}</td><td class="right">${esc(euro(r.recettes[k].facture))}</td><td class="right">${esc(euro(r.recettes[k].encaisse))}</td></tr>`).join('');
    return printDocument(`Déclaration CAF ${annee}`, `<section class="page"><p class="t">Déclaration CAF ${annee}</p>
      <p class="n">${esc(VUES.find(([k]) => k === vue)[1])} — année civile du 1er janvier au 31 décembre ${annee}. Heures (présences).</p>
      ${secHtml}<h3>Participations des familles</h3><table><thead><tr><th></th><th class="right">Facturé</th><th class="right">Encaissé</th></tr></thead><tbody>${rec}</tbody></table></section>`, 'h3{margin:14px 0 4px} small{color:#555}');
  };

  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Déclaration CAF'),
      h('div', { class: 'tools' },
        h('button', { onclick: () => r && ctx.bridge.print({ html: printHtml() }) }, 'Imprimer'),
        h('button', { class: 'primary', onclick: async () => {
          if (!r) return;
          const p = await ctx.bridge.saveText({ fileName: `Déclaration CAF ${annee} ${vue === 'realise' ? 'réalisé' : 'prévision'}.csv`, text: csv() });
          if (p) toast(`Fichier enregistré : ${p}`);
        } }, 'Exporter pour Excel (CSV)'))),
    h('p', { class: 'muted' }, 'Année civile, du 1er janvier au 31 décembre : l\'appli additionne l\'année scolaire précédente (janvier-août) et l\'année en cours (septembre-décembre). Un jour payé compte : présences (P, KT, C) et absences facturées (A, AKT). La tranche suit le groupe de l\'enfant à chaque date.'),
    controls, box,
    h('section', { class: 'card', style: { marginTop: '16px' } },
      h('h2', {}, 'Heures comptées par présence'),
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'Année scolaire en cours. Le Pédibus se compte selon l\'école, le jour et le KT (tableau dans Paramètres › Heures CAF). Pour le reste, un nombre fixe :'),
      heuresBox));
  draw();
  etatsDisponibles(ctx).then((x) => { etats = x.etats; manquants = x.manquants; draw(); });
  ctx.subscribe((s, info) => { if (info && (info.remote || info.reset)) { etats[0] = { label: s.year, state: s }; draw(); } });
}
