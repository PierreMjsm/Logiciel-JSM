// Enfants et familles : recherche, tris, fiches, passage de groupe.
import { h, clear, fill, debounce, modal, field, select, table, toast, todayIso } from '../ui.js';
import { ageLabel, ageAt, groupAt, defaultGroupe } from '../../src/core/calendar.js';
import { dateFr } from '../../src/core/format.js';
import { adhesionStatus, documentsManquants, isActive } from '../../src/core/billing.js';
import { planningFields, applyPlanning } from '../planning-ui.js';
import { nomEnfant } from '../../src/core/noms.js';
import { COCHES } from '../../src/core/preinscriptions.js';
import { genererFiche } from '../fiche-actions.js';
import { dossierEnfant } from '../../src/core/noms.js';
import { opsDepart } from '../../src/core/depart.js';
import { anneesPresence, lireAnnees, enfantsVenus, activitesTous, dejaVenu, ACTIVITES_HISTO } from '../../src/core/annees.js';
import { familiesDossierIncomplet, rappelDossierText, mailtoUrl, splitMails } from '../../src/core/reports.js';

export const INSCRIPTIONS = [
  ['pedibus', 'Pédibus'], ['ktMardi', 'KT mardi'], ['ktJeudi', 'KT jeudi'], ['mercredi', 'Mercredi'],
  ['pediMercredi', 'Pédibus mercredi'], ['toussaint', 'Toussaint'], ['noel', 'Noël'], ['hiver', 'Hiver'],
  ['printemps', 'Printemps'], ['rose', 'Rose'], ['juillet', 'Juillet'], ['aout', 'Août'],
  ['collegiens', 'Collégiens'], ['exceptionnel', 'Exceptionnel'], ['ado', 'ADO'],
];
const INS_LABEL = Object.fromEntries(INSCRIPTIONS);

export function childName(s, id) {
  const c = s.children[id];
  return `${nomEnfant(s, c)} ${c.prenom}`.trim();
}

export function render(root, ctx) {
  const today = todayIso();
  const f = { q: '', ecole: '', groupe: '', ins: '', adh: '', dossier: '', anciens: false, deja: '' };
  let actsAnnee = new Map();
  let sortKey = 'nom', sortDir = 1;
  const selected = new Set();
  const counts = h('div', { class: 'cards' });
  const list = h('div');
  const s0 = ctx.store.get();

  const rowsOf = (s) => Object.entries(s.children).map(([id, c]) => ({ id, c, fam: s.families[c.familyId] || {}, nom: nomEnfant(s, c), groupe: groupAt(c, today), adh: adhesionStatus(s, id), actif: isActive(s, id), manque: documentsManquants(s, id) }));
  const match = (r) => {
    if (f.deja) { if (!dejaVenu(ctx.store.get(), r.id, f.deja, actsAnnee.get(r.id) || [])) return false; } else if (!f.anciens && r.groupe === 'Plus présent') return false;
    if (f.q) {
      const t = `${r.nom} ${r.c.prenom} ${r.c.prenom} ${r.nom} ${r.fam.nom} ${r.fam.mails || ''}`.toLowerCase();
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
    actsAnnee = activitesTous(s);
    const all = rowsOf(s);
    const rows = all.filter(match);
    const venus = enfantsVenus(s);
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
      { key: 'nom', label: 'Nom', get: (r) => r.nom, sort: (r) => `${r.nom} ${r.c.prenom}` },
      { key: 'prenom', label: 'Prénom', get: (r) => `${r.c.prenom}${r.c.pai ? ' *' : ''}` },
      { key: 'age', label: 'Âge', get: (r) => ageLabel(r.c.naissance, today), sort: (r) => r.c.naissance ? -Number(r.c.naissance.replace(/-/g, '')) : 0 },
      { key: 'groupe', label: 'Groupe', get: (r) => r.groupe, sort: (r) => (s.params.groupes.indexOf(r.groupe) + 100) },
      { key: 'ecole', label: 'École', get: (r) => r.c.ecole || '' },
      { key: 'adh', label: 'Adhésion', get: (r) => r.adh, render: (r) => (r.adh === 'reglee' ? h('span', { class: 'chip ok' }, 'Adhérent') : r.adh === 'due' ? h('span', { class: 'chip ko' }, 'Adhésion à régler') : '') },
      { key: 'dossier', label: 'Dossier', get: (r) => r.manque.length, render: (r) => (!r.actif ? '' : r.manque.length ? h('span', { class: 'chip warn', title: r.c.statut || '' }, `Manque : ${r.manque.join(', ')}`) : h('span', { class: 'chip ok' }, 'Complet')) },
      { key: 'ins', label: 'Inscriptions', get: (r) => Object.keys(r.c.inscriptions || {}).filter((k) => r.c.inscriptions[k]).length, render: (r) => INSCRIPTIONS.filter(([k]) => r.c.inscriptions?.[k]).map(([, l]) => h('span', { class: 'chip' }, l)) },
      { key: 'annees', label: 'Années', get: (r) => anneesPresence(s, r.id, venus).join(', ') },
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
        h('button', { title: 'Un mail par famille, à relire et envoyer vous-même', onclick: () => mailsDossiers(ctx) }, 'Mails dossiers incomplets…'),
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
      h('label', {}, h('input', { type: 'checkbox', onchange: (e) => { f.anciens = e.target.checked; draw(); } }), ' Afficher les « Plus présent »'),
      select([['', 'Déjà venu à… (toutes années)'], ...ACTIVITES_HISTO], '', { name: 'deja', title: 'Tous les enfants déjà venus au moins une fois à cette activité, cette année ou les années précédentes, anciens compris', onchange: (e) => { f.deja = e.target.value; draw(); } })),
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

export function openChild(ctx, id, preset = {}) {
  const s = ctx.store.get();
  const today = todayIso();
  const isNew = !id;
  const c = isNew ? { familyId: '', prenom: '', naissance: '', groupes: [], ecole: '', adhesionDejaReglee: false, statut: '', pai: false, documents: {}, inscriptions: {} } : structuredClone(s.children[id]);
  if (!c.documents) c.documents = {};
  if (!c.planning) c.planning = {};
  if (isNew && preset.inscription) c.inscriptions[preset.inscription] = true;
  const planBefore = JSON.stringify(c.planning);
  let planFrom = today;
  const fam = structuredClone(s.families[c.familyId] || { nom: '', nomCheque: '', mails: '', adresse: '', telMaman: '', telPapa: '' });
  let newFamily = isNew;
  let nomLie = !c.nom || c.nom === fam.nom; // le nom de l'enfant suit celui de la famille
  const nomInput = h('input', { type: 'text', name: 'enfantNom', value: c.nom || fam.nom || '', oninput: (e) => {
    const v = e.target.value.toUpperCase();
    if (newFamily) { fam.nom = v; const fi = famBox.querySelector('input[name=nom]'); if (fi) fi.value = v; nomLie = true; } else nomLie = v === fam.nom;
  } });
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
            const garde = nomInput.value.trim().toUpperCase();
            Object.assign(fam, newFamily ? { nom: '', nomCheque: '', mails: '', adresse: '', telMaman: '', telPapa: '' } : structuredClone(s.families[c.familyId]));
            if (newFamily) { fam.nom = garde; nomLie = true; } else if (nomLie || !garde) { nomInput.value = fam.nom; nomLie = true; }
            drawFam();
          },
        }))),
      h('div', { class: 'form-grid' },
        field('Nom de famille (des parents)', inp('nom', fam.nom, { oninput: (e) => { fam.nom = e.target.value.toUpperCase(); if (nomLie) nomInput.value = fam.nom; } })),
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
    !isNew ? photoBox(ctx, id) : null,
    h('h3', {}, 'Enfant'),
    h('div', { class: 'form-grid' },
      field('Prénom', inp('prenom', c.prenom, { oninput: (e) => { c.prenom = e.target.value.toUpperCase(); } })),
      field('Nom', nomInput, 'Remplit aussi le nom de la famille. Changez-le si l\'enfant ne porte pas le même nom que ses parents.'),
      field('Date de naissance', h('input', { type: 'date', name: 'naissance', value: c.naissance || '', oninput: (e) => { c.naissance = e.target.value || null; } })),
      field('École', h('input', { type: 'text', name: 'ecole', list: 'ecoles-list', value: c.ecole, oninput: (e) => { c.ecole = e.target.value.toUpperCase(); } }), h('datalist', { id: 'ecoles-list' }, s.params.ecoles.map((e) => h('option', { value: e })))),
      field('Classe', h('input', { type: 'text', name: 'classe', value: c.classe || '', oninput: (e) => { c.classe = e.target.value.toUpperCase(); } })),
      field('Années de présence', h('input', { type: 'text', name: 'annees', value: (c.annees || []).join(', '), placeholder: 'ex. 2024-2025, 2025-2026', oninput: (e) => { c.annees = lireAnnees(e.target.value); } }), !isNew ? `L'année en cours s'ajoute toute seule dès qu'il y a une présence${anneesPresence(s, id).length ? ` (connues : ${anneesPresence(s, id).join(', ')})` : ''}.` : null),
      field('Note / à relancer', h('input', { type: 'text', name: 'statut', list: 'statuts-list', value: c.statut || '', oninput: (e) => { c.statut = e.target.value; } }), h('datalist', { id: 'statuts-list' }, s.params.statuts.map((x) => h('option', { value: x }))))),
    h('h3', {}, 'Adhésion et dossier'),
    h('p', { class: 'muted', style: { margin: '0 0 6px' } }, `L'adhésion de ${s.params.tarifs.adhesion} € par enfant est obligatoire. Elle est réglée par un règlement de la famille (poste « Adhésion »), ou cochez ci-dessous si elle a été réglée autrement.`,
      !isNew ? h('b', {}, ` Statut actuel : ${{ reglee: 'adhérent ✓', due: 'adhésion à régler', inactif: 'aucune activité' }[adhesionStatus(s, id)]}.`) : null),
    h('div', { class: 'checks', style: { margin: '6px 0 10px' } },
      h('label', {}, h('input', { type: 'checkbox', name: 'adhesionDejaReglee', checked: c.adhesionDejaReglee, onchange: (e) => { c.adhesionDejaReglee = e.target.checked; } }), ' Adhésion déjà réglée (hors logiciel)'),
      (s.params.documents || []).map((d) => h('label', {}, h('input', { type: 'checkbox', name: `doc-${d.id}`, checked: !!c.documents[d.id], onchange: (e) => { c.documents[d.id] = e.target.checked; } }), ` ${d.label}`)),
      h('label', {}, h('input', { type: 'checkbox', checked: c.pai, onchange: (e) => { c.pai = e.target.checked; } }), ' PAI (affiche * sur les listes)')),
    ficheBox(c),
    h('h3', {}, 'Groupe d\'âge'), groupesBox,
    h('h3', {}, 'Jours habituels'),
    h('p', { class: 'muted', style: { margin: '0 0 6px' } }, 'Les jours où l\'enfant vient d\'habitude : l\'appli met P automatiquement sur ces jours jusqu\'à la fin de l\'année (vous corrigez ensuite les absences dans la grille).'),
    planningFields(c.planning),
    h('div', { class: 'tools', style: { marginTop: '6px' } }, field('Mettre à jour les présences à partir du', h('input', { type: 'date', name: 'plan-from', value: today, onchange: (e) => { planFrom = e.target.value || today; } }))),
    h('h3', {}, 'Inscriptions'),
    h('div', { class: 'checks' }, INSCRIPTIONS.map(([k, l]) => h('label', {}, h('input', { type: 'checkbox', checked: !!c.inscriptions[k], onchange: (e) => { c.inscriptions[k] = e.target.checked; } }), ` ${l}`))),
    h('h3', {}, 'Famille'), famBox,
    !isNew ? h('p', { class: 'muted' }, `Âge : ${ageLabel(c.naissance, today) || '—'} · Groupe aujourd'hui : ${groupAt(c, today) || '—'}`) : null);

  modal(isNew ? 'Nouvel enfant' : childName(s, id), body, [
    !isNew ? { label: 'Marquer « Plus présent »', onClick: () => { depart(ctx, id); } } : null,
    { label: 'Annuler' },
    !isNew ? { label: 'Dossier', title: 'Ouvrir le dossier de l\'enfant sur le drive (pièces jointes, fiches PDF)', onClick: () => { ctx.bridge.dossierOuvrir(dossierEnfant(ctx.store.get(), id)); return false; } } : null,
    !isNew ? { label: 'Fiche PDF', title: 'Enregistre la fiche, puis crée et ouvre le PDF rempli', onClick: async () => {
      if ((await save()) === false) return false;
      try { await genererFiche(ctx, id, { ouvrir: true }); } catch (e) { toast(`Fiche PDF : ${e.message || e}`, 'err'); }
    } } : null,
    { label: 'Enregistrer', primary: true, onClick: () => save() },
  ].filter(Boolean));

  async function save() {
      if (!c.prenom.trim()) { toast('Le prénom est obligatoire.', 'err'); return false; }
      if (!fam.nom.trim()) { toast('Le nom de famille est obligatoire.', 'err'); return false; }
      { const v = nomInput.value.trim().toUpperCase(); if (v && v !== fam.nom) c.nom = v; else if (c.nom) c.nom = ''; else delete c.nom; }
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
      if (JSON.stringify(c.planning) !== planBefore) {
        const childId = isNew ? changes.find(([p]) => p[0] === 'children' && p.length === 2)[0][1] : id;
        const n = await applyPlanning(ctx, { childIds: [childId], from: planFrom, replace: !isNew });
        if (n) toast(`Jours habituels appliqués : ${n} présence(s) mise(s) à jour.`);
      }
      toast(isNew ? 'Enfant ajouté.' : 'Fiche enregistrée.');
      return true;
  }
}

// Photo d'identité (reçue par Tally ou choisie à la main), rangée dans le dossier de l'enfant.
function photoBox(ctx, id) {
  const box = h('div', { class: 'photo-enfant' });
  const draw = async () => {
    const src = await ctx.bridge.dossierPhoto(dossierEnfant(ctx.store.get(), id)).catch(() => null);
    fill(box, src ? h('img', { src, alt: 'Photo de l\'enfant' }) : h('div', { class: 'photo-vide' }, 'Pas de photo'),
      h('button', { class: 'small', onclick: async () => { if (await ctx.bridge.dossierChoisirPhoto(dossierEnfant(ctx.store.get(), id))) draw(); } }, src ? 'Changer la photo' : 'Ajouter une photo'));
  };
  draw();
  return box;
}

// Rappel des documents manquants : un mail par famille, relu et envoyé par l'équipe ; la date est notée.
function mailsDossiers(ctx) {
  const box = h('div');
  const apercu = h('div');
  const today = todayIso();
  const drawList = () => {
    const s = ctx.store.get();
    const fams = familiesDossierIncomplet(s, today);
    fill(box,
      h('p', { class: 'muted', style: { marginTop: 0 } }, `${fams.length} famille(s) avec un dossier incomplet (enfants inscrits). Chaque mail s'ouvre dans votre messagerie : relisez-le avant de l'envoyer.`),
      h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Famille'), h('th', {}, 'Il manque'), h('th', {}, 'Dernier rappel'), h('th', {}, ''))),
        h('tbody', {}, fams.map((f) => {
          const fam = s.families[f.familyId];
          const mails = splitMails(fam.mails);
          return h('tr', {},
            h('td', {}, f.label),
            h('td', {}, f.enfants.map((e) => h('div', {}, h('b', {}, e.prenom), ` : ${e.manque.join(', ')}`))),
            h('td', { class: 'muted' }, fam.dernierRappelDossier ? `ouvert le ${dateFr(fam.dernierRappelDossier)}` : '—'),
            h('td', { class: 'nowrap' },
              h('button', { class: 'small', onclick: () => fill(apercu, h('h3', {}, `Rappel ${f.label}`), h('pre', { class: 'recap' }, rappelDossierText(s, f.familyId, today))) }, 'Voir'), ' ',
              mails.length ? h('button', { class: 'small primary', onclick: async () => {
                await ctx.bridge.openExternal(mailtoUrl(mails.join(';'), 'JSM — Documents à compléter', rappelDossierText(ctx.store.get(), f.familyId, today)));
                if (!ctx.store.getConsultation()) await ctx.store.dispatch(['families', f.familyId, 'dernierRappelDossier'], today);
                drawList();
              } }, 'Ouvrir dans la messagerie') : h('span', { class: 'chip warn' }, 'pas de mail')));
        }))),
      apercu);
  };
  drawList();
  modal('Mails des dossiers incomplets', box, [{ label: 'Fermer' }]);
}

// Départ : « Plus présent » ; au choix, on efface ses documents et renseignements et on supprime son dossier.
function depart(ctx, id) {
  const s = ctx.store.get();
  let effacer = false;
  modal(`Départ de ${childName(s, id)}`, h('div', {},
    h('p', { style: { marginTop: 0 } }, 'L\'enfant passe en « Plus présent » à partir d\'aujourd\'hui : il n\'apparaît plus dans les listes et les grilles. Ses présences et les règlements de la famille restent pour la compta et la CAF.'),
    h('label', {}, h('input', { type: 'checkbox', name: 'effacer', checked: false, onchange: (e) => { effacer = e.target.checked; } }),
      ' Effacer aussi ses documents : pièces jointes, fiches PDF, photo, renseignements de santé et jours habituels.'),
    h('p', { class: 'muted' }, 'Sans cocher : tout est gardé, l\'enfant reste dans la liste des anciens avec ses années de présence. En cochant : on garde seulement le nom, prénom, date de naissance, ainsi que le mail et l\'adresse de la famille (mailings, campagnes de dons). Les téléphones sont effacés s\'il n\'y a plus d\'autre enfant de la famille. Les fichiers supprimés restent 30 jours dans la corbeille de OneDrive.')), [
    { label: 'Annuler' },
    { label: 'Confirmer', primary: true, onClick: async () => {
      await ctx.store.dispatchMany(opsDepart(ctx.store.get(), id, todayIso(), { effacer }));
      if (effacer) { try { await ctx.bridge.dossierSupprimer(dossierEnfant(s, id)); } catch (e) { toast(`Dossier : ${e.message || e}`, 'err'); } }
      document.querySelectorAll('.modal-back').forEach((b) => b.remove());
      toast(`${childName(s, id)} : « Plus présent »${effacer ? ', documents effacés' : ''}.`);
    } },
  ]);
}

// Renseignements de la fiche d'adhésion (reçus des pré-inscriptions ou saisis à la main), repliés par défaut.
function ficheBox(c) {
  c.fiche = c.fiche || {};
  const f = c.fiche;
  f.coches = { ...(f.coches || {}) };
  const t = (k, label, attrs = {}) => field(label, h('input', { type: 'text', name: `fiche-${k}`, value: f[k] || '', oninput: (e) => { f[k] = e.target.value; }, ...attrs }));
  return h('details', { class: 'fiche-box' },
    h('summary', {}, h('b', {}, 'Renseignements de la fiche d\'adhésion'), f.dateSignature ? h('span', { class: 'muted' }, ` — fiche du ${dateFr(f.dateSignature)}${f.signataire ? `, signée par ${f.signataire}` : ''}`) : null),
    h('div', { class: 'form-grid' },
      t('secu', 'N° de sécurité sociale'), t('urgence', 'Personne à contacter en urgence'),
      t('autorise1', 'Personne autorisée 1'), t('autorise2', 'Personne autorisée 2'),
      t('difficultes', 'Difficultés de santé'), t('traitement', 'Traitement / PAI (lequel)'),
      t('observations', 'Observations'), t('signataire', 'Responsable légal (je soussigné)'),
      field('Date de la fiche', h('input', { type: 'date', name: 'fiche-dateSignature', value: f.dateSignature || '', oninput: (e) => { f.dateSignature = e.target.value; } }))),
    h('div', { class: 'checks' }, Object.entries(COCHES).map(([k, l]) => h('label', {}, h('input', { type: 'checkbox', name: `coche-${k}`, checked: !!f.coches[k], onchange: (e) => { f.coches[k] = e.target.checked; } }), ` ${l}`))));
}

const sortGroupes = (g) => [...g].sort((a, b) => (!a.from ? -1 : !b.from ? 1 : a.from < b.from ? -1 : 1));

function pushDiff(changes, path, before, after) {
  for (const k of Object.keys(after)) {
    const a = after[k], b = (before || {})[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (a && typeof a === 'object' && !Array.isArray(a) && (b === undefined || (b && typeof b === 'object' && !Array.isArray(b)))) pushDiff(changes, [...path, k], b || {}, a);
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
