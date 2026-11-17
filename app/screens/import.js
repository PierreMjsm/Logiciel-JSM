// Import des classeurs Excel actuels.
import { h, fill, toast, confirmBox } from '../ui.js';
import { importWorkbooks, detectBook } from '../../src/core/import.js';
import { parseChildRows, planAjout, parseCsv } from '../../src/core/familles-fichier.js';

const BOOK_LABEL = { contact: 'Contact', pedibus: 'Pédibus', mercredi: 'Mercredi', vacances: 'Vacances', compta: 'Compta', cheque: 'Chèque-Banque', ado: 'ADO', caf: 'CAF (non importé : recalculé)' };

function asBook(raw) {
  const sheets = {};
  for (const [name, rows] of Object.entries(raw.sheets)) {
    sheets[name] = { rows: () => rows, cell: () => null };
  }
  return { sheets };
}

export function render(root, ctx) {
  const out = h('div');
  let result = null;

  async function pick() {
    const raws = await ctx.bridge.pickExcel();
    if (!raws) return;
    const books = {};
    const found = [];
    const unknown = [];
    for (const raw of raws) {
      const b = asBook(raw);
      const k = detectBook(b);
      if (k) { books[k] = b; found.push(`${BOOK_LABEL[k]} (${raw.file})`); } else unknown.push(raw.file);
    }
    if (!books.contact) { toast('Le fichier Contact est indispensable : ajoutez-le à la sélection.', 'err'); return; }
    try { result = importWorkbooks(books); } catch (e) { toast(`Import impossible : ${e.message}`, 'err'); return; }
    const r = result.report;
    const list = (title, items, empty) => h('div', { class: 'card', style: { marginBottom: '10px' } }, h('h3', { style: { marginTop: 0 } }, `${title} (${items.length})`),
      items.length ? h('ul', {}, items.slice(0, 200).map((x) => h('li', {}, x))) : h('p', { class: 'muted' }, empty));
    fill(out,
      h('div', { class: 'cards' },
        stat(`${r.children} enfant${r.children > 1 ? 's' : ''}`, `dans ${r.families} famille(s)`),
        stat(r.presences, 'présences'), stat(r.payments, 'règlements')),
      h('p', {}, 'Fichiers reconnus : ', found.join(', ')),
      unknown.length ? h('p', { class: 'error' }, `Fichiers non reconnus (ignorés) : ${unknown.join(', ')}`) : null,
      list('Homonymes à vérifier', r.ambiguous, 'Aucun.'),
      list('Noms portés par plusieurs familles (gardées séparées : vérifiez qu\'elles ne doivent pas être regroupées)', r.familles || [], 'Aucun.'),
      list('Lignes non rattachées à un enfant de Contact', r.unmatched, 'Toutes les lignes ont été rattachées.'),
      list('Écarts entre Compta et Chèque-Banque (le montant banque fait foi)', r.ecarts, 'Aucun écart.'),
      Object.keys(r.ignoredValues).length ? h('p', { class: 'muted' }, 'Valeurs inconnues ignorées dans les grilles : ', Object.entries(r.ignoredValues).map(([k, n]) => `« ${k} » × ${n}`).join(', ')) : null,
      h('div', { class: 'tools', style: { marginTop: '12px' } },
        h('button', { class: 'primary big', onclick: replace }, 'Remplacer les données par cet import')));
  }

  async function replace() {
    if (!result) return;
    const ok = await confirmBox('Remplacer les données',
      'Toutes les données actuelles du dossier partagé seront remplacées par cet import (elles restent archivées dans « Sauvegardes »). Les autres ordinateurs se mettront à jour automatiquement.', 'Remplacer');
    if (!ok) return;
    await ctx.bridge.replaceAll(result.base);
    await ctx.store.reload();
    toast('Import terminé.');
    location.hash = '#enfants';
    location.reload();
  }

  const ajoutOut = h('div');
  async function pickAjout() {
    let raw;
    try { raw = await ctx.bridge.pickTable(); } catch (e) { toast(e.message, 'err'); return; }
    if (!raw) return;
    const rows = raw.rows || parseCsv(raw.text || '');
    const { enfants, erreurs } = parseChildRows(rows);
    const plan = planAjout(ctx.store.get(), enfants, (p) => ctx.store.newId(p));
    const list = (title, items, empty) => h('div', { class: 'card', style: { marginBottom: '10px' } }, h('h3', { style: { marginTop: 0 } }, `${title} (${items.length})`),
      items.length ? h('ul', {}, items.slice(0, 300).map((x) => h('li', {}, x))) : h('p', { class: 'muted' }, empty));
    const kids = plan.changes.filter(([p]) => p[0] === 'children').map(([, v]) => v);
    const famName = (fid) => (ctx.store.get().families[fid] || plan.changes.find(([p]) => p[1] === fid)?.[1] || {}).nom || '';
    fill(ajoutOut,
      h('p', {}, h('b', {}, raw.file), ` : ${plan.nouveauxEnfants} enfant(s) à ajouter, dont ${plan.nouvellesFamilles} nouvelle(s) famille(s).`),
      list('À ajouter', kids.map((k) => `${famName(k.familyId)} ${k.prenom}${k.naissance ? ` — né(e) le ${k.naissance.split('-').reverse().join('/')}` : ''} — ${k.groupes[0].groupe}${ctx.store.get().families[k.familyId] ? ' (famille déjà connue)' : ''}`), 'Aucun nouvel enfant.'),
      list('Déjà présents (non ajoutés)', plan.dejaPresents, 'Aucun.'),
      erreurs.length ? list('À vérifier dans le fichier', erreurs, '') : null,
      plan.nouveauxEnfants ? h('button', { class: 'primary', onclick: async () => {
        await ctx.store.dispatchMany(plan.changes);
        toast(`${plan.nouveauxEnfants} enfant(s) ajouté(s).`);
        fill(ajoutOut, h('p', {}, `✓ ${plan.nouveauxEnfants} enfant(s) ajouté(s). Retrouvez-les dans l'écran Enfants.`));
      } }, `Ajouter les ${plan.nouveauxEnfants} enfants`) : null);
  }

  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Import Excel')),
    h('div', { class: 'card', style: { marginBottom: '14px' } },
      h('h2', {}, 'Ajouter des enfants depuis un fichier'),
      h('p', {}, 'Pour inscrire plusieurs enfants d\'un coup (nouvelles inscriptions, export d\'un formulaire…) sans les saisir un par un. Les enfants et familles déjà présents sont conservés : rien n\'est remplacé.'),
      h('div', { class: 'tools' },
        h('button', { onclick: async () => { const p = await ctx.bridge.saveTemplate(); if (p) toast(`Modèle enregistré : ${p}`); } }, 'Enregistrer le modèle Excel'),
        h('button', { class: 'primary', onclick: pickAjout }, 'Choisir le fichier des enfants (Excel ou CSV)…')),
      ajoutOut),
    h('h2', { style: { marginTop: '20px' } }, 'Reprendre les classeurs Excel 2026-2027'),
    h('div', { class: 'card', style: { marginBottom: '14px' } },
      h('p', {}, 'Sélectionnez en une fois vos classeurs 2026-2027 : Contact, Pédibus, Mercredi, Vacances, Compta, Chèque-Banque et ADO (le fichier CAF est recalculé automatiquement).'),
      h('p', { class: 'muted' }, 'Les enfants sont reconnus par leur nom et prénom, plus par leur numéro de ligne. Rien n\'est modifié tant que vous n\'avez pas confirmé.'),
      h('button', { class: 'primary', onclick: pick }, 'Choisir les fichiers Excel…')),
    out);
}

function stat(v, l) { return h('div', { class: 'card stat' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)); }
