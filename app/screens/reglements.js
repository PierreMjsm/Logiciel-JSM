// Règlements et banque : saisie, plan d'encaissement, remise du mois, totaux.
import { h, clear, fill, modal, field, select, table, toast, todayIso, debounce, confirmBox } from '../ui.js';
import { familyAccount, familyChildren, POSTES, posteLabel, encaissementPlan, encaissementMonth } from '../../src/core/billing.js';
import { euro, dateFr, round2 } from '../../src/core/format.js';
import { familyLabels } from '../../src/core/reports.js';
import { printDocument } from '../print.js';
import { esc } from '../ui.js';

export const MODES = [['cheque', 'Chèque'], ['especes', 'Espèces'], ['carte', 'Carte'], ['virement', 'Virement'], ['inconnu', 'À préciser']];
const MODE_LABEL = Object.fromEntries(MODES);
export const modeLabel = (m) => MODE_LABEL[m] || m;
export const monthLabel = (ym) => (ym ? new Date(`${ym}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '—');

function familyOptions(s) {
  return Object.entries(s.families).map(([id, f]) => [id, `${f.nom} — ${f.mails || f.adresse || 'sans mail'}`]).sort((a, b) => a[1].localeCompare(b[1], 'fr'));
}

export function openPayment(ctx, { familyId = '', paymentId = null, childId = '' } = {}) {
  const s = ctx.store.get();
  const today = todayIso();
  const existing = paymentId ? s.payments[paymentId] : null;
  const p = existing ? structuredClone(existing) : {
    familyId, childId, date: today, montant: '', mode: 'cheque', numero: '', banque: '', nomCheque: '', commentaire: '',
    affectations: [{ poste: '', montant: '', childId: '' }], moisEncaissement: today.slice(0, 7), remis: false, dateRemise: null,
  };
  if (!p.affectations.length) p.affectations.push({ poste: '', montant: '', childId: '' });
  const famBox = h('div');
  const affBox = h('div');
  const status = h('span', { class: 'muted' });
  let saveBtn = null;

  const kids = () => (p.familyId ? familyChildren(s, p.familyId) : []);
  const sum = () => round2(p.affectations.reduce((t, a) => t + (Number(a.montant) || 0), 0));
  const check = () => {
    const m = Number(p.montant) || 0;
    const rest = round2(m - sum());
    status.textContent = !m ? 'Indiquez le montant.' : Math.abs(rest) < 0.005 ? '✓ Montant entièrement réparti' : `Montant ${euro(m)} : reste ${euro(rest)} à répartir`;
    status.style.color = m && Math.abs(rest) < 0.005 ? 'var(--vert)' : 'var(--orange)';
    if (saveBtn) saveBtn.disabled = !(p.familyId && m > 0 && Math.abs(rest) < 0.005 && p.affectations.every((a) => !Number(a.montant) || a.poste));
  };

  const drawFam = () => {
    fill(famBox, h('div', { class: 'form-grid' },
      field('Famille', select([['', '— choisir —'], ...familyOptions(s)], p.familyId, { name: 'familyId', onchange: (e) => { p.familyId = e.target.value; p.childId = ''; drawFam(); drawAff(); check(); } })),
      field('Enfant (facultatif)', select([['', 'Toute la famille'], ...kids().map((id) => [id, s.children[id].prenom])], p.childId, { name: 'childId', onchange: (e) => { p.childId = e.target.value; } }))));
  };

  const drawAff = () => {
    const acc = p.familyId ? familyAccount(s, p.familyId, today) : { postes: [] };
    const dues = acc.postes.filter((r) => r.reste > 0.005);
    fill(affBox,
      h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Enfant'), h('th', {}, 'Ce que paie ce règlement'), h('th', {}, 'Montant'), h('th', {}, ''))),
        h('tbody', {}, p.affectations.map((a, i) => h('tr', {},
          h('td', {}, select([['', 'auto'], ...kids().map((id) => [id, s.children[id].prenom])], a.childId || '', { name: `aff-child-${i}`, onchange: (e) => { a.childId = e.target.value; } })),
          h('td', {}, select([['', '— poste —'], ...POSTES], a.poste, { name: `aff-poste-${i}`, onchange: (e) => { a.poste = e.target.value; check(); drawAff(); } })),
          h('td', {}, h('input', { type: 'number', step: '0.01', min: '0', name: `aff-montant-${i}`, value: a.montant, style: { width: '110px' }, oninput: (e) => { a.montant = e.target.value; check(); } })),
          h('td', {}, p.affectations.length > 1 ? h('button', { class: 'link', onclick: () => { p.affectations.splice(i, 1); drawAff(); check(); } }, 'Retirer') : ''))))),
      h('div', { class: 'tools', style: { marginTop: '6px' } },
        h('button', { class: 'link', onclick: () => { p.affectations.push({ poste: '', montant: '', childId: '' }); drawAff(); } }, '+ Ajouter une ligne'),
        dues.length ? h('button', { class: 'link', onclick: () => {
          let left = Number(p.montant) || 0;
          p.affectations = [];
          for (const r of dues) { if (left <= 0.005) break; const m = round2(Math.min(left, r.reste)); p.affectations.push({ poste: r.poste, montant: m, childId: r.childId }); left = round2(left - m); }
          if (left > 0.005) p.affectations.push({ poste: 'a-repartir', montant: left, childId: '' });
          if (!p.affectations.length) p.affectations.push({ poste: '', montant: '', childId: '' });
          drawAff(); check();
        } }, 'Répartir automatiquement sur ce qui reste dû') : null,
        status),
      (() => {
        const adh = p.affectations.filter((a) => a.poste === 'adhesion' && Number(a.montant) > 0);
        if (!adh.length) return h('p', { class: 'muted' }, 'Ce règlement ne comprend pas d\'adhésion.');
        const names = adh.map((a) => (a.childId ? s.children[a.childId]?.prenom : '') || 'un enfant (à préciser)');
        return h('p', {}, h('span', { class: 'chip ok' }, `Comprend l'adhésion de : ${names.join(', ')}`));
      })(),
      dues.length ? h('p', { class: 'muted' }, 'Reste dû : ', dues.map((r) => h('span', { class: 'chip warn' }, `${s.children[r.childId]?.prenom || ''} · ${r.label} : ${euro(r.reste)}`))) : null);
    check();
  };

  const moisInput = h('input', { type: 'month', name: 'moisEncaissement', value: p.moisEncaissement || '', oninput: (e) => { p.moisEncaissement = e.target.value || null; } });
  const body = h('div', {}, famBox,
    h('div', { class: 'form-grid', style: { marginTop: '10px' } },
      field('Date de réception', h('input', { type: 'date', name: 'date', value: p.date, oninput: (e) => { p.date = e.target.value; } })),
      field('Montant (€)', h('input', { type: 'number', step: '0.01', min: '0', name: 'montant', value: p.montant, oninput: (e) => { p.montant = e.target.value; check(); } })),
      field('Mode', select(MODES, p.mode, { name: 'mode', onchange: (e) => { p.mode = e.target.value; } })),
      field('Encaissement prévu (mois)', moisInput, 'Pour étaler les chèques'),
      field('N° de chèque', h('input', { type: 'text', name: 'numero', value: p.numero, oninput: (e) => { p.numero = e.target.value; } })),
      field('Banque', h('input', { type: 'text', name: 'banque', value: p.banque, oninput: (e) => { p.banque = e.target.value; } })),
      field('Nom sur le chèque', h('input', { type: 'text', name: 'nomCheque', value: p.nomCheque, oninput: (e) => { p.nomCheque = e.target.value; } })),
      field('Commentaire', h('input', { type: 'text', name: 'commentaire', value: p.commentaire, oninput: (e) => { p.commentaire = e.target.value; } }))),
    h('label', { style: { display: 'block', margin: '8px 0' } }, h('input', { type: 'checkbox', checked: p.remis, onchange: (e) => { p.remis = e.target.checked; p.dateRemise = e.target.checked ? (p.dateRemise || today) : null; } }), ' Déjà remis en banque'),
    h('h3', {}, 'Répartition'), affBox);
  drawFam();
  drawAff();

  const m = modal(existing ? 'Modifier le règlement' : 'Nouveau règlement', body, [
    existing ? { label: 'Supprimer', danger: true, onClick: async () => {
      if (!(await confirmBox('Supprimer le règlement', `Supprimer ce règlement de ${euro(existing.montant)} ?`, 'Supprimer'))) return false;
      await ctx.store.dispatch(['payments', paymentId], null);
      toast('Règlement supprimé.');
    } } : null,
    { label: 'Annuler' },
    { label: 'Enregistrer', primary: true, id: 'pay-save', onClick: async () => {
      const acc = familyAccount(s, p.familyId, today);
      const kidsList = kids();
      const out = {
        ...p,
        montant: round2(Number(p.montant)),
        moisEncaissement: p.mode === 'cheque' ? (p.moisEncaissement || p.date.slice(0, 7)) : null,
        affectations: p.affectations.filter((a) => Number(a.montant) > 0).map((a) => {
          let cid = a.childId;
          if (!cid) {
            const due = acc.postes.find((r) => r.poste === a.poste && r.reste > 0.005) || acc.postes.find((r) => r.poste === a.poste);
            cid = due ? due.childId : (p.childId || kidsList[0] || '');
          }
          return { poste: a.poste, montant: round2(Number(a.montant)), childId: cid };
        }),
      };
      await ctx.store.dispatch(['payments', paymentId || ctx.store.newId('p')], out);
      toast(`Règlement de ${euro(out.montant)} enregistré.`);
    } },
  ].filter(Boolean));
  saveBtn = m.el.querySelector('#pay-save');
  check();
}

export function render(root, ctx) {
  let tab = 'liste';
  const tabs = h('div', { class: 'tabs' });
  const body = h('div');
  const f = { q: '', mode: '', mois: '' };
  let remiseMois = todayIso().slice(0, 7);

  let labelsCache = null, labelsFor = null;
  const famName = (s, id) => { if (labelsFor !== s.families) { labelsCache = familyLabels(s); labelsFor = s.families; } return labelsCache[id] || '?'; };

  const drawTabs = () => fill(tabs, [['liste', 'Tous les règlements'], ['plan', 'Plan d\'encaissement'], ['remise', 'Remise du mois'], ['totaux', 'Totaux par mois']].map(([k, l]) =>
    h('button', { class: tab === k ? 'active' : '', onclick: () => { tab = k; drawTabs(); draw(); } }, l)));

  function draw() {
    labelsFor = null; // recalcul des libellés de familles à chaque affichage
    const s = ctx.store.get();
    const pays = Object.entries(s.payments || {}).map(([id, p]) => ({ id, ...p }));
    clear(body);
    if (tab === 'liste') {
      const rows = pays.filter((p) => (!f.mode || p.mode === f.mode) && (!f.mois || encaissementMonth(p) === f.mois)
        && (!f.q || `${famName(s, p.familyId)} ${p.numero || ''} ${p.nomCheque || ''}`.toLowerCase().includes(f.q)));
      const total = round2(rows.reduce((t, p) => t + Number(p.montant || 0), 0));
      body.append(
        h('div', { class: 'tools', style: { marginBottom: '10px' } },
          h('input', { type: 'search', placeholder: 'Famille, n° de chèque…', value: f.q, oninput: debounce((e) => { f.q = e.target.value.toLowerCase(); draw(); }, 200) }),
          select([['', 'Tous les modes'], ...MODES], f.mode, { onchange: (e) => { f.mode = e.target.value; draw(); } }),
          h('input', { type: 'month', value: f.mois, title: 'Mois d\'encaissement', onchange: (e) => { f.mois = e.target.value; draw(); } }),
          h('span', { class: 'muted' }, `${rows.length} règlement(s) · ${euro(total)}`)),
        table([
          { key: 'date', label: 'Reçu le', get: (p) => p.date, render: (p) => dateFr(p.date) },
          { key: 'fam', label: 'Famille', get: (p) => famName(s, p.familyId) },
          { key: 'enf', label: 'Enfant', get: (p) => s.children[p.childId]?.prenom || '' },
          { key: 'mode', label: 'Mode', get: (p) => modeLabel(p.mode) },
          { key: 'num', label: 'N°', get: (p) => p.numero || '' },
          { key: 'montant', label: 'Montant', class: 'num', get: (p) => Number(p.montant || 0), render: (p) => euro(p.montant) },
          { key: 'mois', label: 'Encaissement', get: (p) => encaissementMonth(p), render: (p) => (p.mode === 'cheque' ? monthLabel(p.moisEncaissement) : '') },
          { key: 'remis', label: 'Remis', get: (p) => (p.remis ? 1 : 0), render: (p) => (p.mode === 'cheque' ? (p.remis ? h('span', { class: 'chip ok' }, 'remis') : h('span', { class: 'chip' }, 'à remettre')) : '') },
          { key: 'aff', label: 'Pour', get: (p) => (p.affectations || []).map((a) => posteLabel(a.poste)).join(', ') },
        ], rows, { sortKey: 'date', sortDir: -1, onRow: (p) => openPayment(ctx, { paymentId: p.id }), rowClass: () => 'clic', empty: 'Aucun règlement.' }));
    } else if (tab === 'plan') {
      const plan = encaissementPlan(s);
      const cols = [
        { key: 'fam', label: 'Famille', get: (r) => famName(s, r.familyId) },
        ...plan.months.map((m) => ({ key: m, label: monthLabel(m), class: 'num', get: (r) => r.byMonth[m] || 0, render: (r) => (r.byMonth[m] ? euro(r.byMonth[m]) : '') })),
        { key: 'total', label: 'Total', class: 'num', get: (r) => r.total, render: (r) => h('b', {}, euro(r.total)) },
      ];
      body.append(h('p', { class: 'muted' }, 'Montant encaissé (ou à encaisser) par famille et par mois. Les chèques comptent au mois d\'encaissement prévu ; espèces et carte au mois de réception.'),
        table(cols, plan.rows, { sortKey: 'fam', sortDir: 1 }),
        h('div', { class: 'cards', style: { marginTop: '12px' } }, plan.months.map((m) => h('div', { class: 'card stat' }, h('div', { class: 'v' }, euro(plan.totals[m])), h('div', { class: 'l' }, monthLabel(m))))));
    } else if (tab === 'remise') {
      const list = pays.filter((p) => p.mode === 'cheque' && p.moisEncaissement === remiseMois);
      const todo = list.filter((p) => !p.remis);
      const total = round2(list.reduce((t, p) => t + Number(p.montant || 0), 0));
      body.append(
        h('div', { class: 'tools', style: { marginBottom: '10px' } },
          field('Mois de remise', h('input', { type: 'month', value: remiseMois, onchange: (e) => { remiseMois = e.target.value; draw(); } })),
          h('span', { class: 'muted' }, `${list.length} chèque(s) · ${euro(total)}`),
          h('span', { class: 'spacer' }),
          h('button', { onclick: () => ctx.bridge.print({ html: bordereau(s, list, remiseMois) }) }, 'Imprimer le bordereau'),
          h('button', { class: 'primary', disabled: !todo.length, onclick: async () => {
            const d = todayIso();
            await ctx.store.dispatchMany(todo.flatMap((p) => [[['payments', p.id, 'remis'], true], [['payments', p.id, 'dateRemise'], d]]));
            toast(`${todo.length} chèque(s) marqué(s) remis en banque.`);
          } }, `Marquer remis (${todo.length})`)),
        table([
          { key: 'fam', label: 'Famille', get: (p) => famName(s, p.familyId) },
          { key: 'nom', label: 'Nom sur le chèque', get: (p) => p.nomCheque || s.families[p.familyId]?.nomCheque || '' },
          { key: 'num', label: 'N° chèque', get: (p) => p.numero || '' },
          { key: 'banque', label: 'Banque', get: (p) => p.banque || '' },
          { key: 'montant', label: 'Montant', class: 'num', get: (p) => Number(p.montant || 0), render: (p) => euro(p.montant) },
          { key: 'remis', label: 'État', get: (p) => (p.remis ? 1 : 0), render: (p) => (p.remis ? h('span', { class: 'chip ok' }, `remis ${dateFr(p.dateRemise)}`) : h('span', { class: 'chip warn' }, 'à déposer')) },
        ], list, { sortKey: 'fam', sortDir: 1, onRow: (p) => openPayment(ctx, { paymentId: p.id }), rowClass: () => 'clic', empty: 'Aucun chèque prévu ce mois-ci.' }));
    } else {
      const months = new Map();
      for (const p of pays) {
        const m = encaissementMonth(p);
        if (!m) continue;
        if (!months.has(m)) months.set(m, { m, cheque: 0, especes: 0, carte: 0, autre: 0, total: 0 });
        const r = months.get(m);
        const k = ['cheque', 'especes', 'carte'].includes(p.mode) ? p.mode : 'autre';
        r[k] = round2(r[k] + Number(p.montant || 0));
        r.total = round2(r.total + Number(p.montant || 0));
      }
      const money = (k) => ({ key: k, label: { cheque: 'Chèques', especes: 'Espèces', carte: 'Carte', autre: 'Autres / à préciser', total: 'Total' }[k], class: 'num', get: (r) => r[k], render: (r) => (r[k] ? euro(r[k]) : '') });
      body.append(table([{ key: 'm', label: 'Mois', get: (r) => r.m, render: (r) => monthLabel(r.m) }, money('cheque'), money('especes'), money('carte'), money('autre'), money('total')], [...months.values()], { sortKey: 'm', sortDir: 1 }));
    }
  }

  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Règlements & banque'),
      h('div', { class: 'tools' }, h('button', { class: 'primary', onclick: () => openPayment(ctx, {}) }, 'Nouveau règlement'))),
    tabs, body);
  drawTabs();
  draw();
  ctx.subscribe(() => draw());
}

function bordereau(s, list, mois) {
  const total = round2(list.reduce((t, p) => t + Number(p.montant || 0), 0));
  const rows = list.map((p, i) => `<tr><td class="num">${i + 1}</td><td>${esc(s.families[p.familyId]?.nom || '')}</td><td>${esc(p.nomCheque || '')}</td><td>${esc(p.numero || '')}</td><td>${esc(p.banque || '')}</td><td class="right">${esc(euro(p.montant))}</td></tr>`).join('');
  return printDocument(`Remise de chèques ${mois}`, `<section class="page"><div class="t">REMISE DE CHÈQUES — JSM</div><div class="d">${esc(monthLabel(mois))}</div>
    <div class="n">${list.length} chèque(s) · Total : <b>${esc(euro(total))}</b></div>
    <table><thead><tr><th class="num">#</th><th>Famille</th><th>Nom sur le chèque</th><th>N°</th><th>Banque</th><th class="right">Montant</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><th colspan="5" class="right">Total</th><th class="right">${esc(euro(total))}</th></tr></tfoot></table></section>`);
}
