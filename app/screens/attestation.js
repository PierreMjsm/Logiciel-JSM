// Attestation de paiement / de présence (remplace la feuille « Facture »).
import { h, fill, select, todayIso, toast, esc, field, clear } from '../ui.js';
import { attestation, attestationPresence } from '../../src/core/reports.js';
import { childPostes } from '../../src/core/billing.js';
import { euro, dateFr, round2 } from '../../src/core/format.js';
import { printDocument } from '../print.js';
import { libellesEnfants } from '../../src/core/noms.js';

const DESIGNATION = (label) => label.replace(/^Vacances /, 'Vacances de ').replace(/^Mercredis/, 'Mercredis').replace('Vacances de Toussaint', 'Vacances de la Toussaint');

function renderPaiement(root, ctx) {
  const s0 = ctx.store.get();
  const lib = libellesEnfants(s0);
  let childId = ctx.params.childId || '';
  let lignes = [];
  const box = h('div');
  const children = Object.entries(s0.children)
    .map(([id, c]) => [id, lib[id]])
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

// Écran à deux onglets : présence (pour l'employeur) et paiement.
export function render(root, ctx) {
  let tab = ctx.params.tab || 'presence';
  const tabs = h('div', { class: 'tabs' });
  const body = h('div');
  const draw = () => {
    fill(tabs, [['presence', 'Attestation de présence'], ['paiement', 'Attestation de paiement']].map(([k, l]) =>
      h('button', { class: tab === k ? 'active' : '', onclick: () => { tab = k; draw(); } }, l)));
    clear(body);
    (tab === 'presence' ? renderPresence : renderPaiement)(body, ctx);
    const h1 = body.querySelector('h1');
    if (h1) h1.closest('header')?.remove();
  };
  root.append(h('header', { class: 'screen-head' }, h('h1', {}, 'Attestations')), tabs, body);
  draw();
}

const hrs = (n) => `${String(round2(n)).replace('.', ',')} h`;

function renderPresence(root, ctx) {
  const s0 = ctx.store.get();
  const lib = libellesEnfants(s0);
  const T = s0.params.trimestres;
  let childId = '', from = T[0].start, to = todayIso();
  const box = h('div');
  const children = Object.entries(s0.children)
    .map(([id, c]) => [id, lib[id]])
    .sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  const draw = () => {
    if (!childId) { fill(box, h('p', { class: 'muted' }, 'Choisissez un enfant et la période demandée par l\'employeur.')); return; }
    const a = attestationPresence(ctx.store.get(), childId, from, to, todayIso());
    fill(box,
      h('div', { class: 'cards' },
        h('div', { class: 'card stat' }, h('div', { class: 'v' }, `${a.totalJours} jour${a.totalJours > 1 ? 's' : ''}`), h('div', { class: 'l' }, 'de présence')),
        h('div', { class: 'card stat' }, h('div', { class: 'v' }, hrs(a.totalHeures)), h('div', { class: 'l' }, 'heures (règles CAF)')),
        h('div', { class: 'card stat' }, h('div', { class: 'v' }, euro(a.totalRegle)), h('div', { class: 'l' }, 'réglés pour ces activités'))),
      h('div', { class: 'card' }, h('p', {}, a.texte),
        a.lignes.length ? a.lignes.map((l) => h('div', { style: { margin: '10px 0' } },
          h('b', {}, `${l.label} : ${l.jours} jour${l.jours > 1 ? 's' : ''} — ${hrs(l.heures)}`),
          h('div', { class: 'muted', style: { fontSize: '12.5px' } }, l.dates.join(' · ')))) : h('p', { class: 'muted' }, 'Aucune présence sur cette période.'),
        a.montants.length ? h('p', {}, h('b', {}, 'Montants réglés : '), a.montants.map((m) => `${m.label} ${euro(m.montant)}`).join(' · '), ` — total ${euro(a.totalRegle)}`) : null),
      h('div', { class: 'tools', style: { marginTop: '12px' } },
        h('button', { onclick: () => ctx.bridge.print({ html: presenceHtml(a) }) }, 'Imprimer'),
        h('button', { class: 'primary', onclick: async () => {
          const label = children.find(([id]) => id === childId)[1];
          const p = await ctx.bridge.printToPDF({ html: presenceHtml(a), fileName: `Attestation de présence ${label} ${dateFr(from).replace(/\//g, '-')} au ${dateFr(to).replace(/\//g, '-')}.pdf` });
          if (p) toast(`PDF enregistré : ${p}`);
        } }, 'Enregistrer en PDF')));
  };
  root.append(
    !s0.params.attestation.tresorier || !s0.params.attestation.habilitation
      ? h('p', { class: 'error' }, 'Renseignez d\'abord le nom du trésorier et le numéro d\'habilitation dans Paramètres › Attestation.') : h('span'),
    h('div', { class: 'tools', style: { marginBottom: '12px' } },
      select([['', '— choisir un enfant —'], ...children], childId, { name: 'child', onchange: (e) => { childId = e.target.value; draw(); } }),
      field('Du', h('input', { type: 'date', name: 'from', value: from, onchange: (e) => { from = e.target.value || from; draw(); } })),
      field('Au', h('input', { type: 'date', name: 'to', value: to, onchange: (e) => { to = e.target.value || to; draw(); } }))),
    box);
  draw();
}

function presenceHtml(a) {
  const rows = a.lignes.map((l) => `<tr><td><b>${esc(l.label)}</b><br><span style="font-size:11px">${esc(l.dates.join(' · '))}</span></td><td class="right">${l.jours}</td><td class="right">${esc(hrs(l.heures))}</td></tr>`).join('');
  const montants = a.montants.length
    ? `<p style="font-size:14px">Montants réglés par la famille pour ces activités : ${a.montants.map((m) => `${esc(m.label)} ${esc(euro(m.montant))}`).join(', ')} — <b>total ${esc(euro(a.totalRegle))}</b>.</p>` : '';
  return printDocument(`Attestation de présence ${a.nom}`, `<section class="page">
    <div class="t">Les Jeunes de Saint-Médard</div>
    <p class="right">Paris, le ${esc(a.date)}</p>
    <h2 style="text-align:center;margin:24px 0">ATTESTATION DE PRÉSENCE</h2>
    <p style="font-size:14px;line-height:1.6">${esc(a.texte)}</p>
    <table style="margin:18px 0"><thead><tr><th>Activité et dates de présence</th><th class="right">Jours</th><th class="right">Heures</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><th class="right">Total</th><th class="right">${a.totalJours}</th><th class="right">${esc(hrs(a.totalHeures))}</th></tr></tfoot></table>
    ${montants}
    <p style="font-size:14px">Attestation délivrée pour faire valoir ce que de droit.</p>
    <p style="margin-top:40px">Le trésorier</p></section>`);
}
