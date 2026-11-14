// Attestation de paiement / de présence (remplace la feuille « Facture »).
import { h, fill, select, todayIso, toast, esc } from '../ui.js';
import { attestation } from '../../src/core/reports.js';
import { childPostes } from '../../src/core/billing.js';
import { euro, dateFr } from '../../src/core/format.js';
import { printDocument } from '../print.js';

const DESIGNATION = (label) => label.replace(/^Vacances /, 'Vacances de ').replace(/^Mercredis/, 'Mercredis').replace('Vacances de Toussaint', 'Vacances de la Toussaint');

export function render(root, ctx) {
  const s0 = ctx.store.get();
  let childId = ctx.params.childId || '';
  let lignes = [];
  const box = h('div');
  const children = Object.entries(s0.children)
    .map(([id, c]) => [id, `${(s0.families[c.familyId] || {}).nom || ''} ${c.prenom}`.trim()])
    .sort((a, b) => a[1].localeCompare(b[1], 'fr'));

  const loadLines = () => {
    const s = ctx.store.get();
    lignes = childId ? childPostes(s, childId).filter((p) => p.poste !== 'adhesion').map((p) => ({
      on: true, designation: DESIGNATION(p.label), quantite: p.jours + (p.ktJours || 0), prix: p.jours ? Math.round((p.du / (p.jours + (p.ktJours || 0))) * 100) / 100 : p.du,
    })) : [];
  };

  const draw = () => {
    if (!childId) { fill(box, h('p', { class: 'muted' }, 'Choisissez un enfant.')); return; }
    const s = ctx.store.get();
    const a = attestation(s, { childId, lignes: lignes.filter((l) => l.on) }, todayIso());
    fill(box,
      h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Désignation'), h('th', {}, 'Quantité'), h('th', {}, 'Prix unitaire'), h('th', {}, 'Total'))),
        h('tbody', {}, lignes.map((l) => h('tr', {},
          h('td', {}, h('input', { type: 'checkbox', checked: l.on, onchange: (e) => { l.on = e.target.checked; draw(); } })),
          h('td', {}, h('input', { type: 'text', value: l.designation, style: { width: '100%' }, onchange: (e) => { l.designation = e.target.value; draw(); } })),
          h('td', {}, h('input', { type: 'number', value: l.quantite, style: { width: '80px' }, onchange: (e) => { l.quantite = Number(e.target.value); draw(); } })),
          h('td', {}, h('input', { type: 'number', step: '0.01', value: l.prix, style: { width: '90px' }, onchange: (e) => { l.prix = Number(e.target.value); draw(); } })),
          h('td', { class: 'num' }, euro((l.quantite || 0) * (l.prix || 0))))))),
      h('div', { class: 'tools', style: { margin: '8px 0 16px' } },
        h('button', { class: 'link', onclick: () => { lignes.push({ on: true, designation: 'Activités extrascolaires', quantite: 1, prix: 0 }); draw(); } }, '+ Ajouter une ligne'),
        h('span', { class: 'spacer' }), h('b', {}, `Total : ${euro(a.total)}`)),
      h('div', { class: 'card' }, h('p', {}, a.texte), h('p', { style: { whiteSpace: 'pre-line' } }, a.recuTexte)),
      h('div', { class: 'tools', style: { marginTop: '12px' } },
        h('button', { onclick: () => ctx.bridge.print({ html: docHtml(a) }) }, 'Imprimer'),
        h('button', { class: 'primary', onclick: async () => {
          const p = await ctx.bridge.printToPDF({ html: docHtml(a), fileName: `Attestation ${children.find(([id]) => id === childId)[1]} ${dateFr(todayIso()).replace(/\//g, '-')}.pdf` });
          if (p) toast(`PDF enregistré : ${p}`);
        } }, 'Enregistrer en PDF')));
  };

  root.append(...[
    h('header', { class: 'screen-head' }, h('h1', {}, 'Attestation')),
    !s0.params.attestation.tresorier || !s0.params.attestation.habilitation
      ? h('p', { class: 'error' }, 'Renseignez d\'abord le nom du trésorier et le numéro d\'habilitation dans Paramètres › Attestation.') : null,
    h('div', { class: 'tools', style: { marginBottom: '12px' } },
      select([['', '— choisir un enfant —'], ...children], childId, { name: 'child', onchange: (e) => { childId = e.target.value; loadLines(); draw(); } })),
    box].filter(Boolean));
  loadLines();
  draw();
}

function docHtml(a) {
  const rows = a.lignes.map((l) => `<tr><td>${esc(l.designation)}</td><td>${esc(a.nom)}</td><td class="right">${esc(l.quantite)}</td><td class="right">${esc(euro(l.prix))}</td><td class="right">${esc(euro(l.total))}</td></tr>`).join('');
  return printDocument(`Attestation ${a.nom}`, `<section class="page">
    <div class="t">Les Jeunes de Saint-Médard</div>
    <p class="right">Paris, le ${esc(a.date)}</p>
    <h2 style="text-align:center;margin:24px 0">ATTESTATION</h2>
    <p style="font-size:14px;line-height:1.6">${esc(a.texte)}</p>
    <table style="margin:18px 0"><thead><tr><th>Désignation</th><th>Destinataire</th><th class="right">Quantité</th><th class="right">Prix unitaire</th><th class="right">Prix total</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><th colspan="4" class="right">Total</th><th class="right">${esc(euro(a.total))}</th></tr></tfoot></table>
    <p style="font-size:14px;line-height:1.6;white-space:pre-line">${esc(a.recuTexte)}</p>
    <p style="margin-top:40px">Le trésorier</p>
    <p class="foot" style="margin-top:80px">${esc(a.agrement)}</p></section>`);
}
