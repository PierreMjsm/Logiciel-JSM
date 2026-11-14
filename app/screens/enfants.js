// Enfants et familles : recherche, tris, fiches, passage de groupe.
import { h, clear, fill, debounce, modal, field, select, table, toast, todayIso } from '../ui.js';
import { ageLabel, ageAt, groupAt, defaultGroupe } from '../../src/core/calendar.js';
import { dateFr } from '../../src/core/format.js';
import { adhesionStatus, documentsManquants, isActive } from '../../src/core/billing.js';

export const INSCRIPTIONS = [
  ['pedibus', 'Pédibus'], ['ktMardi', 'KT mardi'], ['ktJeudi', 'KT jeudi'], ['mercredi', 'Mercredi'],
  ['pediMercredi', 'Pédibus mercredi'], ['toussaint', 'Toussaint'], ['noel', 'Noël'], ['hiver', 'Hiver'],
  ['printemps', 'Printemps'], ['rose', 'Rose'], ['juillet', 'Juillet'], ['aout', 'Août'],
  ['collegiens', 'Collégiens'], ['exceptionnel', 'Exceptionnel'], ['ado', 'ADO'],
];
const INS_LABEL = Object.fromEntries(INSCRIPTIONS);

export function childName(s, id) {
  const c = s.children[id];
  return `${(s.families[c.familyId] || {}).nom || ''} ${c.prenom}`.trim();
}

export function render(root, ctx) {
  const today = todayIso();
  const f = { q: '', ecole: '', groupe: '', ins: '', adh: '', dossier: '', anciens: false };
  let sortKey = 'nom', sortDir = 1;
  const selected = new Set();
  const counts = h('div', { class: 'cards' });
  const list = h('div');
  const s0 = ctx.store.get();

  const rowsOf = (s) => Object.entries(s.children).map(([id, c]) => ({ id, c, fam: s.families[c.familyId] || {}, groupe: groupAt(c, today), adh: adhesionStatus(s, id), actif: isActive(s, id), manque: documentsManquants(s, id) }));
  const match = (r) => {
    if (!f.anciens && r.groupe === 'Plus présent') return false;
    if (f.q) {
      const t = `${r.fam.nom} ${r.c.prenom} ${r.c.prenom} ${r.fam.nom} ${r.fam.mails || ''}`.toLowerCase();
      if (!f.q.split(/\s+/).every((w) => t.includes(w))) return false;
    }
    if (f.ecole && r.c.ecole !== f.ecole) return false;
    if (f.groupe && r.groupe !== f.groupe) return false;
    if (f.ins && !(r.c.inscriptions || {})[f.ins]) return false;
    if (f.adh && r.adh !== f.adh) return false;
    if (f.dossier === 'incomplet' && !(r.actif && r.manque.length)) return false;
    if (f.dossier === 'complet' && !(r.actif && !r.manque.length)) return false;
    return true;
  };

  const draw = () => {
    const s = ctx.store.get();
    const all = rowsOf(s);
    const rows = all.filter(match);
    const actifs = all.filter((r) => r.groupe !== 'Plus présent');
    fill(counts, 
      stat(actifs.length, 'enfants présents cette année'),
      stat(actifs.filter((r) => r.adh === 'reglee').length, 'adhérents (adhésion réglée)'),
      stat(actifs.filter((r) => r.adh === 'due').length, 'adhésions à régler'),
      stat(actifs.filter((r) => r.actif && r.manque.length).length, 'dossiers incomplets'),
      stat(actifs.filter((r) => r.c.inscriptions?.pedibus).length, 'inscrits Pédibus'),
      stat(actifs.filter((r) => r.c.inscriptions?.mercredi).length, 'inscrits Mercredi'),
      stat(rows.length, 'dans la liste affichée'));
    const cols = [
      { key: 'sel', label: '', get: () => '', render: (r) => h('input', { type: 'checkbox', checked: selected.has(r.id), onclick: (e) => { e.stopPropagation(); e.target.checked ? selected.add(r.id) : selected.delete(r.id); } }) },
      { key: 'nom', label: 'Nom', get: (r) => r.fam.nom, sort: (r) => `${r.fam.nom} ${r.c.prenom}` },
      { key: 'prenom', label: 'Prénom', get: (r) => `${r.c.prenom}${r.c.pai ? ' *' : ''}` },
      { key: 'age', label: 'Âge', get: (r) => ageLabel(r.c.naissance, today), sort: (r) => r.c.naissance ? -Number(r.c.naissance.replace(/-/g, '')) : 0 },
      { key: 'groupe', label: 'Groupe', get: (r) => r.groupe, sort: (r) => (s.params.groupes.indexOf(r.groupe) + 100) },
      { key: 'ecole', label: 'École', get: (r) => r.c.ecole || '' },
      { key: 'adh', label: 'Adhésion', get: (r) => r.adh, render: (r) => (r.adh === 'reglee' ? h('span', { class: 'chip ok' }, 'Adhérent') : r.adh === 'due' ? h('span', { class: 'chip ko' }, 'Adhésion à régler') : '') },
      { key: 'dossier', label: 'Dossier', get: (r) => r.manque.length, render: (r) => (!r.actif ? '' : r.manque.length ? h('span', { class: 'chip warn', title: r.c.statut || '' }, `Manque : ${r.manque.join(', ')}`) : h('span', { class: 'chip ok' }, 'Complet')) },
      { key: 'ins', label: 'Inscriptions', get: (r) => Object.keys(r.c.inscriptions || {}).filter((k) => r.c.inscriptions[k]).length, render: (r) => INSCRIPTIONS.filter(([k]) => r.c.inscriptions?.[k]).map(([, l]) => h('span', { class: 'chip' }, l)) },
      { key: 'mail', label: 'Mail', get: (r) => r.fam.mails || '' },
    ];
    fill(list, table(cols, rows, {
      sortKey, sortDir,
      onSort: (k) => { if (k === 'sel') return; sortDir = k === sortKey ? -sortDir : 1; sortKey = k; draw(); },
      onRow: (r) => openChild(ctx, r.id),
      rowClass: () => 'clic',
      empty: 'Aucun enfant ne correspond.',
    }));
  };

  const s = s0;
  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Enfants'),
      h('div', { class: 'tools' },
        h('button', { onclick: () => bulkGroup(ctx, [...selected], () => { selected.clear(); draw(); }) }, 'Passage de groupe…'),
        h('button', { class: 'primary', onclick: () => openChild(ctx, null) }, 'Nouvel enfant'))),
    counts,
    h('div', { class: 'tools', style: { marginBottom: '10px' } },
      h('input', { type: 'search', placeholder: 'Rechercher un nom, un prénom, un mail…', oninput: debounce((e) => { f.q = e.target.value.toLowerCase().trim(); draw(); }, 120) }),
      select([['', 'Toutes les écoles'], ...s.params.ecoles], '', { onchange: (e) => { f.ecole = e.target.value; draw(); } }),
      select([['', 'Tous les groupes'], ...s.params.groupes], '', { onchange: (e) => { f.groupe = e.target.value; draw(); } }),
      select([['', 'Toutes les activités'], ...INSCRIPTIONS], '', { onchange: (e) => { f.ins = e.target.value; draw(); } }),
      select([['', 'Adhésion : tous'], ['reglee', 'Adhérents (réglée)'], ['due', 'Adhésion à régler']], '', { name: 'adh', onchange: (e) => { f.adh = e.target.value; draw(); } }),
      select([['', 'Dossiers : tous'], ['incomplet', 'Dossier incomplet'], ['complet', 'Dossier complet']], '', { name: 'dossier', onchange: (e) => { f.dossier = e.target.value; draw(); } }),
      h('label', {}, h('input', { type: 'checkbox', onchange: (e) => { f.anciens = e.target.checked; draw(); } }), ' Afficher les « Plus présent »')),
    list);
  draw();
  ctx.subscribe(() => draw());
}

function stat(v, l) { return h('div', { class: 'card stat' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)); }

function familyOptions(s) {
  return Object.entries(s.families)
    .map(([id, fam]) => [id, `${fam.nom} — ${fam.mails || fam.adresse || 'sans mail'}`])
    .sort((a, b) => a[1].localeCompare(b[1], 'fr'));
}

export function openChild(ctx, id) {
  const s = ctx.store.get();
  const today = todayIso();
  const isNew = !id;
  const c = isNew ? { familyId: '', prenom: '', naissance: '', groupes: [], ecole: '', adhesionDejaReglee: false, statut: '', pai: false, documents: {}, inscriptions: {} } : structuredClone(s.children[id]);
  if (!c.documents) c.documents = {};
  const fam = structuredClone(s.families[c.familyId] || { nom: '', nomCheque: '', mails: '', adresse: '', telMaman: '', telPapa: '' });
  let newFamily = isNew;
  const inp = (name, value, attrs = {}) => h('input', { type: 'text', name, value: value ?? '', ...attrs });

  const famBox = h('div');
  const drawFam = () => {
    fill(famBox, 
      h('div', { class: 'form-grid' },
        field(isNew ? 'Famille' : 'Famille (changer pour rattacher l\'enfant à une autre famille)', select([['__new', '+ Nouvelle famille'], ...familyOptions(s)], newFamily ? '__new' : c.familyId, {
          name: 'familyId',
          onchange: (e) => {
            newFamily = e.target.value === '__new';
            c.familyId = newFamily ? '' : e.target.value;
            Object.assign(fam, newFamily ? { nom: '', nomCheque: '', mails: '', adresse: '', telMaman: '', telPapa: '' } : structuredClone(s.families[c.familyId]));
            drawFam();
          },
        }))),
      h('div', { class: 'form-grid' },
        field('Nom de famille', inp('nom', fam.nom, { oninput: (e) => { fam.nom = e.target.value.toUpperCase(); } })),
        field('Nom sur les chèques (si différent)', inp('nomCheque', fam.nomCheque, { oninput: (e) => { fam.nomCheque = e.target.value; } })),
        field('Mail(s)', inp('mails', fam.mails, { oninput: (e) => { fam.mails = e.target.value; } }), 'Séparer plusieurs adresses par ;'),
        field('Adresse', inp('adresse', fam.adresse, { oninput: (e) => { fam.adresse = e.target.value; } })),
        field('Téléphone maman', inp('telMaman', fam.telMaman, { oninput: (e) => { fam.telMaman = e.target.value; } })),
        field('Téléphone papa', inp('telPapa', fam.telPapa, { oninput: (e) => { fam.telPapa = e.target.value; } }))),
      !isNew ? h('p', { class: 'muted' }, 'Fratrie : ', Object.entries(s.children).filter(([cid, x]) => x.familyId === c.familyId && cid !== id).map(([, x]) => h('span', { class: 'chip' }, x.prenom)), ' (les modifications de la famille valent pour tous ses enfants)') : null);
  };
  drawFam();

  const groupesBox = h('div');
  const drawGroupes = () => {
    fill(groupesBox, 
      h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'À partir du'), h('th', {}, 'Groupe'), h('th', {}, ''))),
        h('tbody', {}, (c.groupes.length ? c.groupes : [{ from: null, groupe: '' }]).map((g, i) => h('tr', {},
          h('td', {}, i === 0 ? 'Début d\'année' : h('input', { type: 'date', value: g.from || '', onchange: (e) => { g.from = e.target.value; } })),
          h('td', {}, select([['', '—'], ...s.params.groupes], g.groupe, { name: i === 0 ? 'groupe0' : null, onchange: (e) => { if (!c.groupes.length) c.groupes.push({ from: null, groupe: '' }); c.groupes[i].groupe = e.target.value; } })),
          h('td', {}, i > 0 ? h('button', { class: 'link', onclick: () => { c.groupes.splice(i, 1); drawGroupes(); } }, 'Retirer') : ''))))),
      h('button', { class: 'link', onclick: () => { if (!c.groupes.length) c.groupes.push({ from: null, groupe: defaultGroupe(ageAt(c.naissance, today)) }); c.groupes.push({ from: today, groupe: '' }); drawGroupes(); } }, '+ Ajouter un changement de groupe (ex. passage en 4-5 ans pour l\'été)'));
  };
  drawGroupes();

  const body = h('div', {},
    h('h3', {}, 'Enfant'),
    h('div', { class: 'form-grid' },
      field('Prénom', inp('prenom', c.prenom, { oninput: (e) => { c.prenom = e.target.value.toUpperCase(); } })),
      field('Date de naissance', h('input', { type: 'date', name: 'naissance', value: c.naissance || '', oninput: (e) => { c.naissance = e.target.value || null; } })),
      field('École', h('input', { type: 'text', name: 'ecole', list: 'ecoles-list', value: c.ecole, oninput: (e) => { c.ecole = e.target.value.toUpperCase(); } }), h('datalist', { id: 'ecoles-list' }, s.params.ecoles.map((e) => h('option', { value: e })))),
      field('Note / à relancer', h('input', { type: 'text', name: 'statut', list: 'statuts-list', value: c.statut || '', oninput: (e) => { c.statut = e.target.value; } }), h('datalist', { id: 'statuts-list' }, s.params.statuts.map((x) => h('option', { value: x }))))),
    h('h3', {}, 'Adhésion et dossier'),
    h('p', { class: 'muted', style: { margin: '0 0 6px' } }, `L'adhésion de ${s.params.tarifs.adhesion} € par enfant est obligatoire. Elle est réglée par un règlement de la famille (poste « Adhésion »), ou cochez ci-dessous si elle a été réglée autrement.`,
      !isNew ? h('b', {}, ` Statut actuel : ${{ reglee: 'adhérent ✓', due: 'adhésion à régler', inactif: 'aucune activité' }[adhesionStatus(s, id)]}.`) : null),
    h('div', { class: 'checks', style: { margin: '6px 0 10px' } },
      h('label', {}, h('input', { type: 'checkbox', name: 'adhesionDejaReglee', checked: c.adhesionDejaReglee, onchange: (e) => { c.adhesionDejaReglee = e.target.checked; } }), ' Adhésion déjà réglée (hors logiciel)'),
      (s.params.documents || []).map((d) => h('label', {}, h('input', { type: 'checkbox', name: `doc-${d.id}`, checked: !!c.documents[d.id], onchange: (e) => { c.documents[d.id] = e.target.checked; } }), ` ${d.label}`)),
      h('label', {}, h('input', { type: 'checkbox', checked: c.pai, onchange: (e) => { c.pai = e.target.checked; } }), ' PAI (affiche * sur les listes)')),
    h('h3', {}, 'Groupe d\'âge'), groupesBox,
    h('h3', {}, 'Inscriptions'),
    h('div', { class: 'checks' }, INSCRIPTIONS.map(([k, l]) => h('label', {}, h('input', { type: 'checkbox', checked: !!c.inscriptions[k], onchange: (e) => { c.inscriptions[k] = e.target.checked; } }), ` ${l}`))),
    h('h3', {}, 'Famille'), famBox,
    !isNew ? h('p', { class: 'muted' }, `Âge : ${ageLabel(c.naissance, today) || '—'} · Groupe aujourd'hui : ${groupAt(c, today) || '—'}`) : null);

  modal(isNew ? 'Nouvel enfant' : childName(s, id), body, [
    !isNew ? { label: 'Marquer « Plus présent »', onClick: async () => {
      const g = [...(s.children[id].groupes || []), { from: today, groupe: 'Plus présent' }];
      await ctx.store.dispatch(['children', id, 'groupes'], g);
      toast(`${childName(s, id)} : « Plus présent » à partir d'aujourd'hui.`);
    } } : null,
    { label: 'Annuler' },
    { label: 'Enregistrer', primary: true, onClick: async () => {
      if (!c.prenom.trim()) { toast('Le prénom est obligatoire.', 'err'); return false; }
      if (!fam.nom.trim()) { toast('Le nom de famille est obligatoire.', 'err'); return false; }
      if (!c.groupes.length || !c.groupes[0].groupe) c.groupes = [{ from: null, groupe: defaultGroupe(ageAt(c.naissance, today)) }, ...c.groupes.slice(1)];
      c.groupes = sortGroupes(c.groupes.filter((g, i) => i === 0 || (g.from && g.groupe)));
      const changes = [];
      if (isNew) {
        let familyId = c.familyId;
        if (newFamily || !familyId) {
          familyId = ctx.store.newId('f');
          changes.push([['families', familyId], { ...fam }]);
        } else pushDiff(changes, ['families', familyId], s.families[familyId], fam);
        const childId = ctx.store.newId('c');
        changes.push([['children', childId], { ...c, familyId }]);
      } else {
        if (newFamily || !c.familyId) {
          c.familyId = ctx.store.newId('f');
          changes.push([['families', c.familyId], { ...fam }]);
        } else pushDiff(changes, ['families', c.familyId], s.families[c.familyId], fam);
        pushDiff(changes, ['children', id], s.children[id], c);
      }
      if (changes.length) await ctx.store.dispatchMany(changes);
      toast(isNew ? 'Enfant ajouté.' : 'Fiche enregistrée.');
      return true;
    } },
  ].filter(Boolean));
}

const sortGroupes = (g) => [...g].sort((a, b) => (!a.from ? -1 : !b.from ? 1 : a.from < b.from ? -1 : 1));

function pushDiff(changes, path, before, after) {
  for (const k of Object.keys(after)) {
    const a = after[k], b = (before || {})[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object') pushDiff(changes, [...path, k], b, a);
    else changes.push([[...path, k], a]);
  }
}

function bulkGroup(ctx, ids, done) {
  if (!ids.length) { toast('Cochez d\'abord les enfants concernés dans la liste.', 'warn'); return; }
  const s = ctx.store.get();
  let date = '', groupe = '';
  modal(`Passage de groupe (${ids.length} enfant${ids.length > 1 ? 's' : ''})`, h('div', {},
    h('p', {}, ids.map((id) => childName(s, id)).join(', ')),
    h('div', { class: 'form-grid' },
      field('À partir du', h('input', { type: 'date', onchange: (e) => { date = e.target.value; } })),
      field('Nouveau groupe', select([['', '—'], ...s.params.groupes], '', { onchange: (e) => { groupe = e.target.value; } }))),
    h('p', { class: 'muted' }, 'Avant cette date, les enfants restent comptés dans leur groupe actuel (listes, CAF).')), [
    { label: 'Annuler' },
    { label: 'Appliquer', primary: true, onClick: async () => {
      if (!date || !groupe) { toast('Indiquez la date et le groupe.', 'err'); return false; }
      await ctx.store.dispatchMany(ids.map((id) => [['children', id, 'groupes'], sortGroupes([...(s.children[id].groupes || []).filter((g) => g.from !== date), { from: date, groupe }])]));
      toast(`Groupe « ${groupe} » à partir du ${dateFr(date)} pour ${ids.length} enfant(s).`);
      done();
      return true;
    } },
  ]);
}

export { INS_LABEL };
