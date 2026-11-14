// Compta familles : dû, réglé, solde, détail, récapitulatif.
import { h, clear, fill, table, select, debounce, todayIso, toast } from '../ui.js';
import { familyAccount, familyStatus, familyChildren, adhesionStatus, documentsManquants, isActive } from '../../src/core/billing.js';
import { recapText, mailtoUrl, splitMails, familyLabels } from '../../src/core/reports.js';
import { euro, dateFr, round2 } from '../../src/core/format.js';
import { openPayment, modeLabel, monthLabel } from './reglements.js';

const STATUS_CHIP = { 'À jour': 'ok', 'Trop-perçu': 'warn', 'Impayé': 'ko' };

export function render(root, ctx) {
  const today = todayIso();
  const f = { q: '', statut: '', actifs: true };
  let sortKey = 'nom', sortDir = 1;
  let openFam = null;
  const cards = h('div', { class: 'cards' });
  const list = h('div');
  let drawer = null;

  const accounts = () => {
    const s = ctx.store.get();
    const labels = familyLabels(s);
    return Object.entries(s.families).map(([id, fam]) => {
      const a = familyAccount(s, id, today);
      return { id, fam, label: labels[id], a, statut: familyStatus(a.solde), enfants: familyChildren(s, id).map((c) => s.children[c].prenom).join(', ') };
    });
  };

  function draw() {
    const all = accounts();
    const rows = all.filter((r) => (!f.actifs || r.a.du > 0 || r.a.regle > 0)
      && (!f.statut || r.statut === f.statut)
      && (!f.q || `${r.fam.nom} ${r.enfants} ${r.fam.mails || ''}`.toLowerCase().includes(f.q)));
    const tot = (k) => round2(all.reduce((t, r) => t + r.a[k], 0));
    const reste = round2(all.reduce((t, r) => t + Math.max(0, -r.a.solde), 0));
    const trop = round2(all.reduce((t, r) => t + Math.max(0, r.a.solde), 0));
    fill(cards,
      card(euro(tot('du')), 'Total dû (toutes familles)'),
      card(euro(tot('regle')), 'Total réglé'),
      card(euro(tot('enBanque')), 'Déjà en banque'),
      card(euro(reste), `Reste à payer · ${all.filter((r) => r.statut === 'Impayé').length} famille(s)`),
      card(euro(trop), `Trop-perçu · ${all.filter((r) => r.statut === 'Trop-perçu').length} famille(s)`));
    fill(list, table([
      { key: 'nom', label: 'Famille', get: (r) => r.label },
      { key: 'enfants', label: 'Enfants', get: (r) => r.enfants },
      { key: 'du', label: 'Dû', class: 'num', get: (r) => r.a.du, render: (r) => euro(r.a.du) },
      { key: 'regle', label: 'Réglé', class: 'num', get: (r) => r.a.regle, render: (r) => euro(r.a.regle) },
      { key: 'banque', label: 'En banque', class: 'num', get: (r) => r.a.enBanque, render: (r) => euro(r.a.enBanque) },
      { key: 'solde', label: 'Solde', class: 'num', get: (r) => r.a.solde, render: (r) => h('b', { style: { color: r.a.solde < -0.005 ? 'var(--rouge)' : r.a.solde > 0.005 ? 'var(--orange)' : 'var(--vert)' } }, euro(r.a.solde)) },
      { key: 'statut', label: 'Statut', get: (r) => r.statut, render: (r) => h('span', { class: `chip ${STATUS_CHIP[r.statut]}` }, r.statut) },
    ], rows, {
      sortKey, sortDir,
      onSort: (k) => { sortDir = k === sortKey ? -sortDir : 1; sortKey = k; draw(); },
      onRow: (r) => openDrawer(r.id), rowClass: () => 'clic', empty: 'Aucune famille ne correspond.',
    }));
    if (openFam) openDrawer(openFam, true);
  }

  function openDrawer(familyId, refresh = false) {
    const s = ctx.store.get();
    const fam = s.families[familyId];
    if (!fam) return;
    openFam = familyId;
    const a = familyAccount(s, familyId, today);
    const recap = recapText(s, familyId, today);
    const mails = splitMails(fam.mails);
    if (!drawer) { drawer = h('div', { class: 'drawer' }); document.body.appendChild(drawer); }
    else if (!refresh) clear(drawer);
    const scroll = drawer.querySelector('.drawer-body')?.scrollTop || 0;
    const statut = familyStatus(a.solde);
    fill(drawer,
      h('div', { class: 'drawer-head' }, h('h2', {}, `Famille ${familyLabels(s)[familyId]}`), h('span', { class: `chip ${STATUS_CHIP[statut]}` }, statut),
        h('button', { class: 'icon', title: 'Fermer', onclick: closeDrawer }, '×')),
      h('div', { class: 'drawer-body' },
        h('div', { class: 'cards' }, card(euro(a.du), 'Dû'), card(euro(a.regle), 'Réglé'), card(euro(a.solde), 'Solde')),
        h('h3', {}, 'Enfants : adhésion et dossier'),
        h('div', {}, familyChildren(s, familyId).filter((cid) => isActive(s, cid)).map((cid) => {
          const st = adhesionStatus(s, cid);
          const m = documentsManquants(s, cid);
          return h('div', { style: { margin: '3px 0' } }, h('b', {}, s.children[cid].prenom), ' ',
            h('span', { class: `chip ${st === 'reglee' ? 'ok' : 'ko'}` }, st === 'reglee' ? 'Adhérent' : 'Adhésion à régler'), ' ',
            h('span', { class: `chip ${m.length ? 'warn' : 'ok'}` }, m.length ? `Manque : ${m.join(', ')}` : 'Dossier complet'));
        })),
        h('h3', {}, 'Détail par enfant et par poste'),
        table([
          { key: 'enf', label: 'Enfant', get: (r) => s.children[r.childId]?.prenom || '—' },
          { key: 'poste', label: 'Poste', get: (r) => r.label },
          { key: 'jours', label: 'Jours', class: 'num', get: (r) => r.jours, render: (r) => `${r.jours || ''}${r.ktJours ? ` + ${r.ktJours} KT` : ''}${r.cJours ? ` ${r.cJours} C` : ''}${r.demiTarif ? ` (${r.demiTarif} à ½ tarif)` : ''}` },
          { key: 'du', label: 'Dû', class: 'num', get: (r) => r.du, render: (r) => euro(r.du) },
          { key: 'regle', label: 'Réglé', class: 'num', get: (r) => r.regle, render: (r) => euro(r.regle) },
          { key: 'reste', label: 'Reste', class: 'num', get: (r) => r.reste, render: (r) => h('b', { style: { color: r.reste > 0.005 ? 'var(--rouge)' : r.reste < -0.005 ? 'var(--orange)' : '' } }, euro(r.reste)) },
        ], a.postes, { empty: 'Aucune activité facturée.' }),
        h('h3', {}, 'Règlements'),
        table([
          { key: 'date', label: 'Reçu le', get: (p) => p.date, render: (p) => dateFr(p.date) },
          { key: 'mode', label: 'Mode', get: (p) => modeLabel(p.mode) },
          { key: 'num', label: 'N°', get: (p) => p.numero || '' },
          { key: 'montant', label: 'Montant', class: 'num', get: (p) => Number(p.montant), render: (p) => euro(p.montant) },
          { key: 'mois', label: 'Encaissement', get: (p) => (p.mode === 'cheque' ? monthLabel(p.moisEncaissement) : '') },
          { key: 'comm', label: 'Commentaire', get: (p) => p.commentaire || '' },
        ], a.payments, { sortKey: 'date', sortDir: 1, onRow: (p) => openPayment(ctx, { paymentId: p.id }), rowClass: () => 'clic', empty: 'Aucun règlement.' }),
        h('div', { class: 'tools', style: { margin: '8px 0 16px' } }, h('button', { class: 'primary', onclick: () => openPayment(ctx, { familyId }) }, 'Ajouter un règlement')),
        h('h3', {}, 'Récapitulatif à envoyer'),
        h('pre', { class: 'recap' }, recap),
        h('div', { class: 'tools' },
          h('button', { onclick: async () => { await ctx.bridge.copy(recap); toast('Récapitulatif copié : collez-le dans votre mail.'); } }, 'Copier le récapitulatif'),
          h('button', { disabled: !mails.length, title: mails.length ? mails.join('; ') : 'Pas de mail', onclick: () => ctx.bridge.openExternal(mailtoUrl(mails.join(';'), `JSM — Récapitulatif ${fam.nom}`, recap)) }, 'Ouvrir dans la messagerie'))));
    drawer.querySelector('.drawer-body').scrollTop = scroll;
  }
  function closeDrawer() { if (drawer) drawer.remove(); drawer = null; openFam = null; }

  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Compta familles'),
      h('div', { class: 'tools' }, h('button', { class: 'primary', onclick: () => openPayment(ctx, {}) }, 'Nouveau règlement'))),
    cards,
    h('div', { class: 'tools', style: { marginBottom: '10px' } },
      h('input', { type: 'search', placeholder: 'Rechercher une famille, un enfant…', oninput: debounce((e) => { f.q = e.target.value.toLowerCase(); draw(); }, 200) }),
      select([['', 'Tous les statuts'], ['Impayé', 'Impayés'], ['Trop-perçu', 'Trop-perçus'], ['À jour', 'À jour']], '', { name: 'statut', onchange: (e) => { f.statut = e.target.value; draw(); } }),
      h('label', {}, h('input', { type: 'checkbox', checked: true, onchange: (e) => { f.actifs = e.target.checked; draw(); } }), ' Seulement les familles avec des activités ou des règlements')),
    list);
  draw();
  ctx.subscribe(() => draw());
  return closeDrawer;
}

function card(v, l) { return h('div', { class: 'card stat' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)); }
