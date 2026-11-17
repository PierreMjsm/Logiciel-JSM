// Compta familles : dû, réglé, solde, détail, récapitulatif.
import { h, clear, fill, table, select, debounce, todayIso, toast, modal } from '../ui.js';
import { familyAccount, familyStatus, familyChildren, adhesionStatus, documentsManquants, isActive } from '../../src/core/billing.js';
import { recapText, mailtoUrl, splitMails, familyLabels } from '../../src/core/reports.js';
import { euro, dateFr, round2 } from '../../src/core/format.js';
import { openPayment, openQuickPayment, modeLabel, monthLabel } from './reglements.js';

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
      return { id, fam, label: labels[id], a, statut: familyStatus(a.soldeMaintenant), enfants: familyChildren(s, id).map((c) => s.children[c].prenom).join(', ') };
    });
  };

  function draw() {
    const all = accounts();
    const rows = all.filter((r) => (!f.actifs || r.a.du > 0 || r.a.regle > 0)
      && (!f.statut || r.statut === f.statut)
      && (!f.q || `${r.fam.nom} ${r.enfants} ${r.fam.mails || ''}`.toLowerCase().includes(f.q)));
    const tot = (k) => round2(all.reduce((t, r) => t + r.a[k], 0));
    const reste = round2(all.reduce((t, r) => t + Math.max(0, -r.a.soldeMaintenant), 0));
    const trop = round2(all.reduce((t, r) => t + Math.max(0, r.a.soldeMaintenant), 0));
    fill(cards,
      card(euro(tot('duMaintenant')), 'Dû à ce jour (périodes commencées)'),
      card(euro(tot('du')), 'Prévu sur l\'année'),
      card(euro(tot('regle')), 'Total réglé'),
      card(euro(tot('enBanque')), 'Déjà en banque'),
      card(euro(reste), `Reste à payer à ce jour · ${all.filter((r) => r.statut === 'Impayé').length} famille(s)`),
      card(euro(trop), `Trop-perçu · ${all.filter((r) => r.statut === 'Trop-perçu').length} famille(s)`));
    fill(list, table([
      { key: 'nom', label: 'Famille', get: (r) => r.label },
      { key: 'enfants', label: 'Enfants', get: (r) => r.enfants },
      { key: 'du', label: 'Dû à ce jour', class: 'num', get: (r) => r.a.duMaintenant, render: (r) => euro(r.a.duMaintenant) },
      { key: 'regle', label: 'Réglé', class: 'num', get: (r) => r.a.regle, render: (r) => euro(r.a.regle) },
      { key: 'banque', label: 'En banque', class: 'num', get: (r) => r.a.enBanque, render: (r) => euro(r.a.enBanque) },
      { key: 'solde', label: 'Solde à ce jour', class: 'num', get: (r) => r.a.soldeMaintenant, render: (r) => h('b', { style: { color: r.a.soldeMaintenant < -0.005 ? 'var(--rouge)' : r.a.soldeMaintenant > 0.005 ? 'var(--orange)' : 'var(--vert)' } }, euro(r.a.soldeMaintenant)) },
      { key: 'prevu', label: 'Prévu sur l\'année', class: 'num', get: (r) => r.a.du, render: (r) => h('span', { class: 'muted' }, euro(r.a.du)) },
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
    const statut = familyStatus(a.soldeMaintenant);
    fill(drawer,
      h('div', { class: 'drawer-head' }, h('h2', {}, `Famille ${familyLabels(s)[familyId]}`), h('span', { class: `chip ${STATUS_CHIP[statut]}` }, statut),
        h('button', { class: 'icon', title: 'Fermer', onclick: closeDrawer }, '×')),
      h('div', { class: 'drawer-body' },
        h('div', { class: 'cards' }, card(euro(a.duMaintenant), 'Dû à ce jour'), card(euro(a.regle), 'Réglé'), card(euro(a.soldeMaintenant), 'Solde à ce jour'), card(euro(a.du), 'Prévu sur l\'année')),
        h('p', { class: 'muted', style: { margin: '4px 0 0' } }, '« À ce jour » : les trimestres et vacances déjà commencés. « Prévu sur l\'année » : avec les présences déjà prévues (jours habituels) jusqu\'à la fin de l\'année.'),
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
          { key: 'poste', label: 'Poste', get: (r) => r.label, render: (r) => (r.commence ? r.label : h('span', {}, r.label, ' ', h('span', { class: 'chip' }, 'à venir'))) },
          { key: 'jours', label: 'Jours', class: 'num', get: (r) => r.jours, render: (r) => `${r.jours || ''}${r.ktJours ? ` + ${r.ktJours} KT` : ''}${r.cJours ? ` ${r.cJours} C` : ''}${r.demiTarif ? ` (${r.demiTarif} à ½ tarif)` : ''}` },
          { key: 'du', label: 'Dû', class: 'num', get: (r) => r.du, render: (r) => euro(r.du) },
          { key: 'regle', label: 'Réglé', class: 'num', get: (r) => r.regle, render: (r) => euro(r.regle) },
          { key: 'reste', label: 'Reste', class: 'num', get: (r) => r.reste, render: (r) => h('b', { style: { color: !r.commence ? '' : r.reste > 0.005 ? 'var(--rouge)' : r.reste < -0.005 ? 'var(--orange)' : '' } }, euro(r.reste)) },
          { key: 'pay', label: '', get: () => '', render: (r) => (r.childId && r.poste !== 'a-repartir' ? h('button', { class: r.commence && r.reste > 0.005 ? 'small primary' : 'small', title: 'Règlement pour cet enfant et ce poste', onclick: (e) => { e.stopPropagation(); openQuickPayment(ctx, { childId: r.childId, poste: r.poste }); } }, '+ Règlement') : '') },
        ], a.postes, { rowClass: (r) => (r.commence ? '' : 'avenir'), empty: 'Aucune activité facturée.' }),
        h('h3', {}, 'Règlements'),
        table([
          { key: 'date', label: 'Reçu le', get: (p) => p.date, render: (p) => dateFr(p.date) },
          { key: 'mode', label: 'Mode', get: (p) => modeLabel(p.mode) },
          { key: 'num', label: 'N°', get: (p) => p.numero || '' },
          { key: 'montant', label: 'Montant', class: 'num', get: (p) => Number(p.montant), render: (p) => euro(p.montant) },
          { key: 'mois', label: 'Encaissement', get: (p) => (p.mode === 'cheque' ? monthLabel(p.moisEncaissement) : '') },
          { key: 'comm', label: 'Commentaire', get: (p) => p.commentaire || '' },
        ], a.payments, { sortKey: 'date', sortDir: 1, onRow: (p) => openPayment(ctx, { paymentId: p.id }), rowClass: () => 'clic', empty: 'Aucun règlement.' }),
        h('div', { class: 'tools', style: { margin: '8px 0 16px' } }, h('button', { class: 'primary', onclick: () => openPayment(ctx, { familyId }) }, 'Ajouter un règlement (formulaire complet)'), h('span', { class: 'muted' }, 'ou « + Règlement » sur la ligne du poste ci-dessus')),
        h('h3', {}, 'Récapitulatif à envoyer'),
        h('pre', { class: 'recap' }, recap),
        h('div', { class: 'tools' },
          h('button', { onclick: async () => { await ctx.bridge.copy(recap); toast('Récapitulatif copié : collez-le dans votre mail.'); } }, 'Copier le récapitulatif'),
          h('button', { disabled: !mails.length, title: mails.length ? mails.join('; ') : 'Pas de mail', onclick: () => ouvrirRecap(familyId) }, 'Ouvrir dans la messagerie'),
          fam.dernierRecap ? h('span', { class: 'muted' }, `Dernier récap ouvert le ${dateFr(fam.dernierRecap)}`) : null)));
    drawer.querySelector('.drawer-body').scrollTop = scroll;
  }
  // Ouvre le récapitulatif dans la messagerie et note la date (visible par toute l'équipe).
  async function ouvrirRecap(familyId) {
    const s = ctx.store.get();
    const fam = s.families[familyId];
    const mails = splitMails(fam.mails);
    if (!mails.length) { toast('Pas de mail pour cette famille.', 'warn'); return false; }
    await ctx.bridge.openExternal(mailtoUrl(mails.join(';'), `JSM — Récapitulatif ${fam.nom}`, recapText(s, familyId, today)));
    if (!ctx.store.getConsultation()) await ctx.store.dispatch(['families', familyId, 'dernierRecap'], today);
    return true;
  }

  function mailsImpayes() {
    const box = h('div');
    const apercu = h('div');
    const drawList = () => {
      const s = ctx.store.get();
      const rows = accounts().filter((r) => r.statut === 'Impayé').sort((a, b) => a.label.localeCompare(b.label, 'fr'));
      fill(box,
        h('p', { class: 'muted', style: { marginTop: 0 } }, `${rows.length} famille(s) doivent de l'argent à ce jour. Chaque mail s'ouvre dans votre messagerie : relisez-le (un règlement oublié, une erreur de notre part ?) avant de l'envoyer vous-même.`),
        h('table', { class: 'grid' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Famille'), h('th', { class: 'num' }, 'À payer à ce jour'), h('th', {}, 'Dernier récap'), h('th', {}, ''))),
          h('tbody', {}, rows.map((r) => {
            const fam = s.families[r.id];
            const has = splitMails(fam.mails).length > 0;
            return h('tr', {},
              h('td', {}, r.label),
              h('td', { class: 'num' }, h('b', { style: { color: 'var(--rouge)' } }, euro(-r.a.soldeMaintenant))),
              h('td', { class: 'muted' }, fam.dernierRecap ? `ouvert le ${dateFr(fam.dernierRecap)}` : '—'),
              h('td', {},
                h('button', { class: 'small', onclick: () => fill(apercu, h('h3', {}, `Récapitulatif ${r.label}`), h('pre', { class: 'recap' }, recapText(s, r.id, today))) }, 'Voir'), ' ',
                has ? h('button', { class: 'small primary', onclick: async () => { if (await ouvrirRecap(r.id)) drawList(); } }, 'Ouvrir dans la messagerie') : h('span', { class: 'chip warn' }, 'pas de mail'),
                ' ', h('button', { class: 'small', title: 'Ouvrir la fiche de la famille', onclick: () => { document.querySelector('.modal-back')?.remove(); openDrawer(r.id); } }, 'Fiche')));
          }))),
        apercu);
    };
    drawList();
    modal('Mails des familles en impayé', box, [{ label: 'Fermer' }]);
  }

  function closeDrawer() { if (drawer) drawer.remove(); drawer = null; openFam = null; }

  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Compta familles'),
      h('div', { class: 'tools' },
        h('button', { title: 'Un mail par famille, à relire et envoyer vous-même', onclick: () => mailsImpayes() }, 'Préparer les mails des impayés…'),
        h('button', { class: 'primary', onclick: () => openPayment(ctx, {}) }, 'Nouveau règlement'))),
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
