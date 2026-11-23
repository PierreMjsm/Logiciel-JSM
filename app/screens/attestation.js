// Attestation de paiement / de présence (remplace la feuille « Facture »).
import { h, fill, select, todayIso, toast, esc, field, clear } from '../ui.js';
import { attestation, attestationPresence } from '../../src/core/reports.js';
import { childPostes } from '../../src/core/billing.js';
import { euro, dateFr, round2 } from '../../src/core/format.js';
import { printDocument } from '../print.js';
import { libellesEnfants } from '../../src/core/noms.js';
import { attestationsAnnee, texteAttestation } from '../../src/core/caf.js';
import { mailtoUrl, splitMails } from '../../src/core/reports.js';
import { etatsDisponibles, anneesCiviles } from '../annees-civiles.js';

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
    fill(tabs, [['presence', 'Attestation de présence'], ['paiement', 'Attestation de paiement'], ['annuelles', 'Attestations annuelles']].map(([k, l]) =>
      h('button', { class: tab === k ? 'active' : '', onclick: () => { tab = k; draw(); } }, l)));
    clear(body);
    ({ presence: renderPresence, paiement: renderPaiement, annuelles: renderAnnuelles })[tab](body, ctx);
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

// --- Attestations annuelles : une par famille, année civile, toutes d'un coup ---------------

const MODES = [['impots', 'Frais de garde pour les impôts (enfants de moins de 6 ans)'], ['paiement', 'Paiement de l\'année (comité d\'entreprise…), tous les enfants']];
const TITRE = { impots: 'Attestation frais de garde', paiement: 'Attestation de paiement' };

function annuelleHtml(params, a, annee, mode) {
  const at = params.attestation || {};
  const rows = a.enfants.map((e) => `<tr><td>${esc(`${e.prenom} ${e.nom}`)}</td><td>${esc(e.naissance ? dateFr(e.naissance) : '')}</td><td class="right">${esc(euro(e.montant))}</td></tr>`).join('');
  return `<section class="page">
    <div class="t">Les Jeunes de Saint-Médard</div>
    ${at.adresseAsso ? `<p class="n">${esc(at.adresseAsso)}</p>` : ''}
    <p class="right">Paris, le ${esc(dateFr(todayIso()))}</p>
    <p class="n"><b>${esc(a.payeur)}</b><br>${esc(a.adresse)}</p>
    <h2 style="text-align:center;margin:24px 0">${esc(TITRE[mode].toUpperCase())} ${annee}</h2>
    <p style="font-size:14px;line-height:1.6">${esc(texteAttestation(params, a, annee, mode))}</p>
    <table style="margin:18px 0"><thead><tr><th>Enfant</th><th>Né(e) le</th><th class="right">Montant réglé en ${annee}</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><th colspan="2" class="right">Total</th><th class="right">${esc(euro(a.total))}</th></tr></tfoot></table>
    <p style="font-size:14px">Attestation délivrée pour faire valoir ce que de droit.</p>
    <p style="margin-top:40px">${esc(at.tresorier || '')}<br>Le trésorier</p>
    <p class="foot" style="margin-top:80px">${esc(at.agrement || '')}</p></section>`;
}

function renderAnnuelles(root, ctx) {
  const today = todayIso();
  let annee = Number(today.slice(0, 4)) - (today.slice(5, 7) <= '06' ? 1 : 0);
  let mode = 'impots';
  let etats = [{ label: ctx.store.get().year, state: ctx.store.get() }];
  let manquants = [];
  let liste = [];
  const controls = h('div', { class: 'tools', style: { marginBottom: '12px' } });
  const box = h('div', {}, h('p', { class: 'muted' }, 'Chargement des années…'));
  const apercu = h('div', { class: 'apercu' });
  const params = () => ctx.store.get().params;
  const nomFichier = (a) => `${TITRE[mode]} ${annee} ${a.nom}.pdf`;
  const doc = (list) => printDocument(`${TITRE[mode]} ${annee}`, list.map((a) => annuelleHtml(params(), a, annee, mode)).join(''));
  const corpsMail = (a) => `Bonjour,\n\nVous trouverez ci-joint ${mode === 'impots' ? 'l\'attestation de frais de garde' : 'l\'attestation de paiement'} ${annee} pour ${a.enfants.map((e) => e.prenom).join(', ')} (${euro(a.total)}).\n\nBien cordialement,\nL'équipe des Jeunes de Saint-Médard`;

  const draw = () => {
    liste = attestationsAnnee(etats, annee, mode);
    const annees = [...new Set([...anneesCiviles(etats), annee])].sort((a, b) => b - a);
    fill(controls,
      select(annees.map((y) => [String(y), `Année ${y}`]), String(annee), { name: 'annee', onchange: (e) => { annee = Number(e.target.value); fill(apercu); draw(); } }),
      select(MODES, mode, { name: 'mode', onchange: (e) => { mode = e.target.value; fill(apercu); draw(); } }),
      h('span', { class: 'spacer' }),
      h('button', { disabled: !liste.length, onclick: () => ctx.bridge.print({ html: doc(liste) }) }, `Imprimer toutes (${liste.length})`),
      h('button', { class: 'primary', disabled: !liste.length, onclick: async () => {
        let last = null;
        for (const [i, a] of liste.entries()) {
          last = await ctx.bridge.printToPDF({ html: doc([a]), fileName: nomFichier(a), sousDossier: `Attestations ${annee}`, ouvrir: false, ouvrirDossier: i === liste.length - 1 });
          if (!last) return;
        }
        toast(`${liste.length} attestation(s) enregistrée(s) dans le dossier « Attestations ${annee} ».`);
      } }, `Enregistrer toutes en PDF (${liste.length})`));
    const p = params().attestation || {};
    const besoin = [`${annee - 1}-${annee}`, `${annee}-${annee + 1}`].filter((l) => !etats.some((x) => x.label === l));
    fill(box,
      !p.tresorier || !p.habilitation || !p.adresseAsso ? h('p', { class: 'error' }, 'Renseignez le trésorier, le numéro d\'habilitation et l\'adresse de l\'association dans Paramètres › Attestation.') : null,
      besoin.length || manquants.length ? h('p', { class: 'error' }, `Années scolaires absentes : ${[...besoin, ...manquants].join(', ')}. Les règlements de ces mois-là ne sont pas comptés.`) : null,
      h('p', { class: 'muted' }, mode === 'impots'
        ? `Enfants nés après le 1er janvier ${annee - 6} (moins de 6 ans au 1er janvier ${annee}). Sommes réglées du 1er janvier au 31 décembre ${annee}, selon la date du règlement, sans l'adhésion.`
        : `Sommes réglées du 1er janvier au 31 décembre ${annee}, selon la date du règlement, sans l'adhésion.`),
      liste.length ? h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Famille'), h('th', {}, 'Enfants'), h('th', { class: 'num' }, 'Montant'), h('th', {}, ''))),
        h('tbody', {}, liste.map((a) => h('tr', {},
          h('td', {}, a.nom),
          h('td', {}, a.enfants.map((e) => `${e.prenom} (${euro(e.montant)})`).join(', ')),
          h('td', { class: 'num' }, h('b', {}, euro(a.total)), a.nonAffecte ? h('div', { class: 'chip warn', title: 'Règlement sans enfant ni activité : à affecter dans la compta pour qu\'il compte' }, `${euro(a.nonAffecte)} non affectés`) : null),
          h('td', {},
            h('button', { class: 'small', onclick: () => fill(apercu, h('div', { class: 'card' }, h('h3', {}, `${TITRE[mode]} ${annee} — ${a.nom}`), h('p', {}, texteAttestation(params(), a, annee, mode)))) }, 'Voir'), ' ',
            h('button', { class: 'small', onclick: async () => { const r = await ctx.bridge.printToPDF({ html: doc([a]), fileName: nomFichier(a), sousDossier: `Attestations ${annee}` }); if (r) toast(`PDF enregistré : ${r}`); } }, 'PDF'), ' ',
            splitMails(a.mails).length
              ? h('button', { class: 'small', title: 'Ouvre le mail dans votre messagerie : joignez-y le PDF avant de l\'envoyer', onclick: () => ctx.bridge.openExternal(mailtoUrl(splitMails(a.mails).join(';'), `${TITRE[mode]} ${annee} — Jeunes de Saint-Médard`, corpsMail(a))) }, 'Mail')
              : h('span', { class: 'chip warn' }, 'pas de mail')))))) : h('p', { class: 'muted' }, 'Aucune attestation pour cette année.'),
      liste.length ? h('p', { class: 'muted' }, 'Le bouton « Mail » prépare le message ; joignez-y le PDF (dossier « Attestations ' + annee + ' ») avant de l\'envoyer.') : null);
  };

  root.append(controls, box, apercu);
  draw();
  etatsDisponibles(ctx).then((x) => { etats = x.etats; manquants = x.manquants; draw(); });
}
