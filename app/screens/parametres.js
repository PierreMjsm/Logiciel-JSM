// Paramètres de l'année : périodes, fériés, tarifs, listes, heures CAF, attestation, nouvelle année.
import { h, fill, field, toast, confirmBox, modal, select, todayIso } from '../ui.js';
import { SOURCES, correspondanceInitiale, valeursEtiquettes, valeursFiche, signatureImage } from '../../src/core/fiche-pdf.js';
import { nomEnfant } from '../../src/core/noms.js';
import { newYear } from '../../src/core/newyear.js';
import { reglesFonctionnement } from '../../src/core/regles.js';
import { esc } from '../ui.js';
import { printDocument } from '../print.js';
import { dateFr, euro } from '../../src/core/format.js';
import { TARIF_LABELS, preparerParams } from '../../src/core/calendar.js';
import { fichesAImprimer, imprimerFichesEnAttente } from '../fiche-actions.js';

const TARIFS = [['adhesion', 'Adhésion obligatoire (par enfant)'], ['pedibus', 'Pédibus (par jour)'], ['kt', 'KT (par jour)'], ['collegien', 'Pédibus collégien « C » (par jour)'], ['mercredi', 'Mercredi (par demi-journée)'], ['journee', 'Journée de vacances'], ['exceptionnel', 'Journée exceptionnelle']];
const DAYS = ['lundi', 'mardi', 'jeudi', 'vendredi'];

export function render(root, ctx) {
  const body = h('div');
  const tabs = h('div', { class: 'tabs' });
  let tab = 'reglages';
  const set = (path, value) => ctx.store.dispatch(['params', ...path], value);

  const drawTabs = () => fill(tabs, [['reglages', 'Réglages'], ['regles', 'Règles de fonctionnement'], ['fiches', 'Fiches PDF'], ['annees', 'Années précédentes']].map(([k, l]) =>
    h('button', { class: tab === k ? 'active' : '', onclick: () => { tab = k; drawTabs(); draw(); } }, l)));

  const drawRegles = () => {
    const p = ctx.store.get().params;
    const regles = reglesFonctionnement(p);
    fill(body,
      h('div', { class: 'tools', style: { marginBottom: '10px' } },
        h('p', { class: 'muted', style: { margin: 0 } }, 'Comment l\'appli calcule et affiche les choses. Ce texte suit automatiquement vos tarifs et vos dates.'),
        h('span', { class: 'spacer' }),
        h('button', { onclick: () => ctx.bridge.print({ html: printDocument('Règles JSM Gestion', `<section class="page"><div class="t">Règles de fonctionnement — JSM Gestion</div>${regles.map((x) => `<h3>${esc(x.titre)}</h3><ul>${x.lignes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}${p.notesRegles ? `<h3>Nos règles et notes</h3><p style="white-space:pre-line">${esc(p.notesRegles)}</p>` : ''}</section>`) }) }, 'Imprimer')),
      h('section', { class: 'card', style: { marginBottom: '14px', borderColor: '#9cc1ea' } },
        h('h2', {}, 'Nos règles et notes'),
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'Vos propres règles, visibles par Katell, Lucas et vous (ex. cas particuliers, gestes commerciaux, qui fait quoi).'),
        h('textarea', { name: 'notesRegles', style: { minHeight: '120px' }, onchange: (e) => set(['notesRegles'], e.target.value) }, p.notesRegles || '')),
      regles.map((x) => h('section', { class: 'card', style: { marginBottom: '12px' } }, h('h2', {}, x.titre), h('ul', { style: { margin: '4px 0 0 18px', padding: 0, lineHeight: 1.55 } }, x.lignes.map((l) => h('li', {}, l))))));
  };

  const drawFiches = () => {
    const p = ctx.store.get().params;
    const fiches = p.fichesPdf || {};
    const defaut = p.fichePdfDefaut;
    const ajouter = async () => {
      const m = await ctx.bridge.ficheAjouterModele();
      if (!m) return;
      const prec = Object.values(fiches).at(-1);
      const id = ctx.store.newId('m');
      const changes = [[['params', 'fichesPdf', id], { nom: m.nom, fichier: m.fichier, champs: m.champs, correspondance: correspondanceInitiale(m.champs, prec ? prec.correspondance : {}), ajoute: todayIso() }]];
      if (!defaut || !fiches[defaut]) changes.push([['params', 'fichePdfDefaut'], id]);
      await ctx.store.dispatchMany(changes);
      toast(`Fiche « ${m.nom} » ajoutée : vérifiez les champs avec « Aperçu avec les noms ».`);
      drawFiches();
    };
    const apercuNoms = (f) => ctx.bridge.ficheGenerer({ fichier: f.fichier, valeurs: valeursEtiquettes(f.correspondance || {}), apercu: true });
    const apercuEnfant = (id, f) => {
      const st = ctx.store.get();
      const kids = Object.entries(st.children).filter(([, c]) => (c.groupes || []).at(-1)?.groupe !== 'Plus présent')
        .map(([cid, c]) => [cid, `${nomEnfant(st, c)} ${c.prenom}`]).sort((a, b) => a[1].localeCompare(b[1], 'fr'));
      let cid = kids[0]?.[0] || '';
      modal('Aperçu avec un enfant', field('Enfant', select(kids, cid, { name: 'enfant', onchange: (e) => { cid = e.target.value; } })), [
        { label: 'Annuler' },
        { label: 'Voir la fiche', primary: true, onClick: () => ctx.bridge.ficheGenerer({ fichier: f.fichier, valeurs: valeursFiche(ctx.store.get(), cid, f.correspondance || {}), signatureUrl: signatureImage(ctx.store.get(), cid), apercu: true }) },
      ]);
    };
    const editer = (id, f) => {
      const corr = { ...(f.correspondance || {}) };
      const rows = (f.champs || []).map((ch) => h('tr', {},
        h('td', {}, h('b', {}, ch.nom)), h('td', { class: 'muted' }, ch.type === 'coche' ? 'case' : 'texte'),
        h('td', {}, select([['', '— laisser vide —'], ...SOURCES.filter((s) => s.type === ch.type || ch.type === 'autre').map((s) => [s.id, s.label])], corr[ch.nom] || '',
          { name: `src-${ch.nom}`, onchange: (e) => { corr[ch.nom] = e.target.value; } }))));
      modal(`Champs de « ${f.nom} »`, h('div', {},
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'Pour chaque champ du PDF, choisissez l\'information à y écrire. Les cases numérotées (1, 2, 3…) sont dans l\'ordre où elles ont été créées dans le PDF : vérifiez avec « Aperçu avec les noms ».'),
        h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Champ du PDF'), h('th', {}, 'Type'), h('th', {}, 'Information'))), h('tbody', {}, rows))), [
        { label: 'Annuler' },
        { label: 'Enregistrer', primary: true, onClick: async () => { await set(['fichesPdf', id, 'correspondance'], corr); drawFiches(); } },
      ]);
    };
    const racine = h('span', { class: 'muted' }, '…');
    ctx.bridge.getConfig().then((c) => { racine.textContent = c.dossiersEnfants || 'Dossiers enfants (dans le dossier partagé JSM)'; });
    fill(body,
      section('Dossiers des enfants', 'Chaque enfant a son dossier (pièces jointes, photo, fiches PDF). Réglage propre à cet ordinateur : si vous le déplacez, faites-le aussi sur les ordinateurs de Katell et Lucas (même dossier du drive).',
        h('div', { class: 'tools' }, h('b', {}, 'Emplacement : '), racine,
          h('button', { onclick: async () => { const d = await ctx.bridge.dossierChoisirRacine(); if (d) racine.textContent = d; } }, 'Changer…'))),
      section('Fiches PDF', 'Le PDF de la fiche (avec ses champs à remplir, comme la fiche d\'adhésion 2026-2027) est copié dans le dossier partagé. L\'appli le remplit pour chaque enfant à partir des pré-inscriptions ou de sa fiche, et range le PDF dans le dossier de l\'enfant (Dossiers enfants). Quand la fiche change, ajoutez la nouvelle version : les champs qui gardent le même nom reprennent la même information.',
        h('button', { class: 'primary', onclick: ajouter }, 'Ajouter une fiche (PDF)…')),
      ...Object.entries(fiches).map(([id, f]) => {
        const nbVides = (f.champs || []).filter((ch) => !(f.correspondance || {})[ch.nom]).length;
        return section(f.nom, `${(f.champs || []).length} champs${nbVides ? `, dont ${nbVides} laissé(s) vide(s)` : ''} · fichier ${f.fichier}${f.ajoute ? ` · ajoutée le ${dateFr(f.ajoute)}` : ''}`,
          h('div', { class: 'tools' },
            h('label', {}, h('input', { type: 'radio', name: 'fiche-defaut', checked: id === defaut, onchange: async () => { await set(['fichePdfDefaut'], id); drawFiches(); } }), ' Fiche utilisée pour les inscriptions'),
            (() => { const n = fichesAImprimer(ctx.store.get(), id).length; return n ? h('button', { class: 'primary', onclick: () => imprimerFichesEnAttente(ctx, id, drawFiches) }, `Imprimer les fiches pas encore imprimées (${n})`) : null; })(),
            h('button', { onclick: () => editer(id, f) }, 'Champs…'),
            h('button', { onclick: () => apercuNoms(f) }, 'Aperçu avec les noms'),
            h('button', { onclick: () => apercuEnfant(id, f) }, 'Aperçu avec un enfant…'),
            h('button', { class: 'danger', onclick: async () => {
              if (!(await confirmBox('Retirer la fiche', `Retirer « ${f.nom} » de la liste ? Les PDF déjà créés restent dans les dossiers des enfants.`, 'Retirer'))) return;
              await set(['fichesPdf', id], null); drawFiches();
            } }, 'Retirer')));
      }));
  };

  const drawAnnees = async () => {
    const consult = ctx.store.getConsultation();
    fill(body, h('p', { class: 'muted' }, 'Chargement…'));
    const list = await ctx.bridge.years();
    fill(body,
      section('Années précédentes', 'Chaque année reste dans son propre dossier sur le drive, avec ses présences, ses règlements et son historique. On l\'ouvre en consultation (lecture seule) pour justifier auprès de la CAF, retrouver un paiement ou imprimer le compte rendu (écran Statistiques et bilan).',
        consult ? h('p', {}, h('b', {}, `Vous consultez l'année ${consult}. `), h('button', { onclick: async () => { await ctx.bridge.closeYear(); location.reload(); } }, 'Revenir à l\'année en cours'))
          : list.length ? h('table', { class: 'grid' }, h('tbody', {}, list.map((y) => h('tr', {}, h('td', {}, h('b', {}, y.label)), h('td', { class: 'muted' }, `dossier « ${y.dossier} »`),
            h('td', {}, h('button', { onclick: async () => { await ctx.bridge.openYear(y.dossier); location.reload(); } }, `Consulter ${y.label}`))))))
            : h('p', {}, 'Aucune année précédente pour le moment : elle apparaîtra ici après « Préparer la nouvelle année ».')));
  };

  const draw = () => {
    if (tab === 'regles') { drawRegles(); return; }
    if (tab === 'annees') { drawAnnees(); return; }
    if (tab === 'fiches') { drawFiches(); return; }
    const s = ctx.store.get();
    const p = s.params;
    fill(body,
      section('Tarifs', 'Les montants dus sont recalculés immédiatement pour toute l\'année.',
        h('div', { class: 'form-grid' }, TARIFS.map(([k, l]) => field(l, h('input', {
          type: 'number', step: '0.01', min: '0', name: `tarif-${k}`, value: p.tarifs[k] ?? (k === 'collegien' ? 1.5 : 0),
          onchange: async (e) => { const v = Number(e.target.value); if (v >= 0 && v !== p.tarifs[k]) { await set(['tarifs', k], v); toast(`${l} : ${euro(v)}`); } },
        }))))),
      changementsTarifs(ctx, p, set, draw),
      section('Taux d\'encadrement', 'Utilisés pour le nombre minimum d\'animateurs affiché sous les listes du jour. Vacances : 1 animateur pour 8 moins de 6 ans et 1 pour 12 de 6 ans et plus. Le mercredi (périscolaire) dépend de la durée de l\'accueil et d\'un éventuel PEDT : vérifiez avec votre déclaration.',
        field('Mercredi', select([['8-12', '1/8 et 1/12 (accueil de plus de 5 h consécutives)'], ['10-14', '1/10 et 1/14 (5 h consécutives ou moins)'], ['14-18', '1/14 et 1/18 (5 h ou moins, avec PEDT)']],
          ((p.encadrement || {}).mercredi || [8, 12]).join('-'), { name: 'encadrement-mercredi', onchange: (e) => set(['encadrement'], { ...(p.encadrement || {}), mercredi: e.target.value.split('-').map(Number) }) }))),
      section('Périodes de l\'année', 'Trimestres d\'école et vacances. Les dates de Pédibus, Mercredi et vacances en découlent.',
        h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Période'), h('th', {}, 'Type'), h('th', {}, 'Début'), h('th', {}, 'Fin'))),
          h('tbody', {}, p.periods.map((per, i) => h('tr', {},
            h('td', {}, per.label), h('td', {}, per.kind === 'ecole' ? `École (T${per.trimestre})` : 'Vacances'),
            h('td', {}, h('input', { type: 'date', value: per.start, onchange: (e) => e.target.value && set(['periods', i, 'start'], e.target.value) })),
            h('td', {}, h('input', { type: 'date', value: per.end, onchange: (e) => e.target.value && set(['periods', i, 'end'], e.target.value) }))))))),
      section('Trimestres de facturation', 'Pédibus et mercredis sont facturés par trimestre.',
        h('div', { class: 'form-grid' }, p.trimestres.map((t, i) => h('div', {}, h('b', {}, `Trimestre ${t.n}`),
          field('Du', h('input', { type: 'date', value: t.start, onchange: (e) => e.target.value && set(['trimestres', i, 'start'], e.target.value) })),
          field('Au', h('input', { type: 'date', value: t.end, onchange: (e) => e.target.value && set(['trimestres', i, 'end'], e.target.value) })))))),
      section('Jours fériés', 'Ces jours sont retirés des grilles de présence.',
        h('div', {}, p.feries.map((d, i) => h('span', { class: 'chip', style: { padding: '4px 10px' } }, dateFr(d), ' ',
          h('button', { class: 'link', title: 'Retirer', onclick: () => set(['feries'], p.feries.filter((_, j) => j !== i)) }, '×'))),
          h('input', { type: 'date', title: 'Ajouter un jour férié', onchange: (e) => e.target.value && set(['feries'], [...new Set([...p.feries, e.target.value])].sort()) }))),
      section('Journées exceptionnelles', 'Journées pédagogiques, fermeture d\'école (canicule…) : ajoutez-les dès que vous les connaissez. Elles apparaissent dans Présences › Journées exceptionnelles et sont facturées au tarif « Journée exceptionnelle ».',
        h('div', {}, ((s.extraDates || {}).exceptionnel || []).map((d) => h('span', { class: 'chip', style: { padding: '4px 10px' } }, dateFr(d), ' ',
          h('button', { class: 'link', title: `Retirer le ${dateFr(d)}`, onclick: async () => {
            const n = Object.keys(s.presences || {}).filter((k) => k.includes(`|exceptionnel|${d}|`)).length;
            if (n && !(await confirmBox('Retirer la journée', `${n} enfant(s) sont notés ce jour-là. Retirer quand même la journée du ${dateFr(d)} ?`, 'Retirer'))) return;
            await ctx.store.dispatch(['extraDates', 'exceptionnel'], ((ctx.store.get().extraDates || {}).exceptionnel || []).filter((x) => x !== d));
            draw();
          } }, '×'))),
          h('input', { type: 'date', name: 'exceptionnel-add', title: 'Ajouter une journée exceptionnelle', onchange: async (e) => {
            if (!e.target.value) return;
            await ctx.store.dispatch(['extraDates', 'exceptionnel'], [...new Set([...((ctx.store.get().extraDates || {}).exceptionnel || []), e.target.value])].sort());
            draw();
          } }))),
      section('Rentrée du KT', 'Le KT n\'est proposé dans la grille Pédibus qu\'à partir de ces dates.',
        h('div', { class: 'form-grid' },
          field('KT mardi à partir du', h('input', { type: 'date', value: p.ktStart.mardi, onchange: (e) => e.target.value && set(['ktStart', 'mardi'], e.target.value) })),
          field('KT jeudi à partir du', h('input', { type: 'date', value: p.ktStart.jeudi, onchange: (e) => e.target.value && set(['ktStart', 'jeudi'], e.target.value) })))),
      section('Listes', 'Une valeur par ligne.',
        h('div', { class: 'form-grid' },
          listField('Écoles (ordre des pages Pédibus)', p.ecoles, (v) => set(['ecoles'], v.map((x) => x.toUpperCase()))),
          listField('Écoles du Pédibus mercredi', p.pediMercrediEcoles, (v) => set(['pediMercrediEcoles'], v.map((x) => x.toUpperCase()))),
          listField('Groupes d\'âge', p.groupes, (v) => set(['groupes'], v)),
          listField('Statuts de dossier', p.statuts, (v) => set(['statuts'], v)))),
      section('Heures CAF', 'Heures comptées par présence au Pédibus, selon l\'école, la catégorie et le jour.',
        h('table', { class: 'grid' },
          h('thead', {}, h('tr', {}, h('th', {}, 'École'), h('th', {}, 'Catégorie'), DAYS.map((d) => h('th', {}, d)))),
          h('tbody', {}, Object.entries(p.cafHeures).flatMap(([ecole, cats]) => ['KT', '-6', '6-11'].map((cat) => h('tr', {},
            h('td', {}, ecole), h('td', {}, cat),
            DAYS.map((d) => h('td', {}, h('input', { type: 'number', step: '0.5', min: '0', style: { width: '70px' }, value: cats[cat]?.[d] ?? 0,
              onchange: (e) => set(['cafHeures', ecole, cat, d], Number(e.target.value)) }))))))))),
      section('Documents du dossier', 'Pièces demandées pour chaque enfant (une par ligne). Le dossier est « complet » quand toutes sont cochées sur la fiche de l\'enfant.',
        listField('Documents', (p.documents || []).map((d) => d.label), (v) => set(['documents'], v.map((label, i) => ({ id: (p.documents || [])[i]?.label === label ? p.documents[i].id : label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label }))))),
      section('Heures CAF des autres activités', 'Heures comptées par présence, pour les tableaux séparés de l\'écran Statistiques CAF (laisser 0 si vous faites le calcul vous-même).',
        h('div', { class: 'form-grid' }, [['collegienPedibus', 'Pédibus collégien (par présence C)'], ['mercrediMatin', 'Mercredi matin'], ['mercrediAprem', 'Mercredi après-midi'], ['vacancesJournee', 'Journée de vacances'], ['vacancesCollegiensJournee', 'Journée vacances collégiens'], ['adoSoiree', 'Soirée ADO']].map(([k, l]) =>
          field(l, h('input', { type: 'number', step: '0.25', min: '0', name: `caf-${k}`, value: (p.cafAutres || {})[k] ?? 0, onchange: (e) => set(['cafAutres', k], Number(e.target.value)) }))))),
      section('Attestation', null,
        h('div', { class: 'form-grid' },
          field('Trésorier', h('input', { type: 'text', value: p.attestation.tresorier, onchange: (e) => set(['attestation', 'tresorier'], e.target.value) })),
          field('N° d\'habilitation', h('input', { type: 'text', value: p.attestation.habilitation, onchange: (e) => set(['attestation', 'habilitation'], e.target.value) })))),
      section('Ce poste', null,
        h('div', { class: 'tools' },
          h('button', { onclick: async () => { const f = await ctx.bridge.choosePdfFolder(); if (f) toast(`Les PDF seront enregistrés dans ${f}`); } }, 'Changer le dossier des PDF'),
          h('button', { onclick: async () => { if (await ctx.bridge.chooseFolder()) location.reload(); } }, 'Changer le dossier partagé'))),
      section('Nouvelle année scolaire', `Année en cours : ${s.year}. Crée un nouveau dossier à côté de l'actuel. Toutes les familles et tous les enfants sont gardés avec leurs coordonnées ; présences, règlements, adhésions, documents et inscriptions repartent de zéro. Les impayés restent sur l'année ${s.year}, qui reste consultable (onglet « Années précédentes »). Katell et Lucas passent automatiquement sur la nouvelle année à leur prochaine ouverture.`,
        ctx.store.getConsultation() ? h('p', { class: 'muted' }, 'Indisponible en consultation.') : h('button', { class: 'danger', onclick: () => startNewYear(ctx) }, 'Préparer la nouvelle année…')));
  };

  root.append(h('header', { class: 'screen-head' }, h('h1', {}, 'Paramètres'),
    h('div', { class: 'tools' }, ctx.store.getConsultation() ? null : h('button', { title: 'Assistant : tarifs, dates des vacances, jours fériés, puis création de l\'année suivante', onclick: () => startNewYear(ctx) }, 'Nouvelle année…'))), tabs, body);
  drawTabs();
  draw();
  ctx.subscribe((st, info) => { if (info && info.remote && info.remote.some((o) => o.path[0] === 'params')) draw(); });
}

function section(title, hint, content) {
  return h('section', { class: 'card', style: { marginBottom: '14px' } }, h('h2', {}, title), hint ? h('p', { class: 'muted', style: { marginTop: 0 } }, hint) : null, content);
}

function listField(label, values, onSave) {
  return field(label, h('textarea', { style: { minHeight: '140px' }, onchange: (e) => onSave(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean)) }, values.join('\n')));
}

// Changements de tarif en cours d'année : chaque jour est facturé au tarif en vigueur ce jour-là.
function changementsTarifs(ctx, p, set, redraw) {
  const list = [...(p.tarifsChangements || [])].sort((a, b) => a.from.localeCompare(b.from));
  const v = { cle: 'pedibus', from: '', montant: '' };
  return section('Changements de tarif en cours d\'année', 'Exemple : Pédibus à 6 € à partir du 4 janvier. Les jours d\'avant restent à l\'ancien tarif ; le montant dû tient compte des deux.', h('div', {},
    list.length ? h('table', { class: 'grid' }, h('tbody', {}, list.map((ch) => h('tr', {},
      h('td', {}, TARIF_LABELS[ch.cle] || ch.cle), h('td', {}, `${euro(ch.montant)} à partir du ${dateFr(ch.from)}`),
      h('td', {}, h('button', { class: 'small', onclick: async () => { await set(['tarifsChangements'], (p.tarifsChangements || []).filter((x) => x !== ch)); redraw(); } }, 'Retirer'))))))
      : h('p', { class: 'muted' }, 'Aucun changement pour cette année.'),
    h('div', { class: 'tools' },
      select(TARIFS.filter(([k]) => k !== 'adhesion').map(([k, l]) => [k, l]), v.cle, { name: 'ch-cle', onchange: (e) => { v.cle = e.target.value; } }),
      h('input', { type: 'date', name: 'ch-from', onchange: (e) => { v.from = e.target.value; } }),
      h('input', { type: 'number', step: '0.01', min: '0', name: 'ch-montant', placeholder: 'Nouveau montant', style: { width: '130px' }, oninput: (e) => { v.montant = e.target.value; } }),
      h('button', { onclick: async () => {
        const montant = Number(v.montant);
        if (!v.from || !(montant >= 0) || v.montant === '') { toast('Indiquez la date et le nouveau montant.', 'err'); return; }
        await set(['tarifsChangements'], [...(p.tarifsChangements || []), { from: v.from, cle: v.cle, montant }]);
        toast(`${TARIF_LABELS[v.cle]} : ${euro(montant)} à partir du ${dateFr(v.from)}.`);
        redraw();
      } }, 'Ajouter'))));
}

// Assistant « Nouvelle année » : on passe en revue ce qui change d'une année sur l'autre, puis on crée l'année.
function startNewYear(ctx) {
  const s = ctx.store.get();
  const [y1] = s.year.split('-').map(Number);
  const label = `${y1 + 1}-${y1 + 2}`;
  const np = preparerParams(s.params, y1 + 1);
  let start = np.periods.map((x) => x.start).sort()[0];
  let etape = 0;
  const box = h('div');
  const ETAPES = ['Année', 'Tarifs', 'Dates', 'Jours fériés', 'Récapitulatif'];
  const fer = new Set(np.feries);
  const draw = () => {
    const titre = h('p', { class: 'muted', style: { marginTop: 0 } }, ETAPES.map((e, i) => (i === etape ? `● ${e}` : `○ ${e}`)).join('   '));
    if (etape === 0) {
      fill(box, titre,
        h('p', {}, h('b', {}, `Année ${label}`), ` : un nouveau dossier « JSM-${label} » sera créé à côté du dossier actuel. L'année ${s.year} reste intacte (présences, règlements, historique) et consultable dans Paramètres › Années précédentes.`),
        h('p', {}, 'L\'assistant passe en revue ce qui change d\'une année sur l\'autre : tarifs, dates des vacances, jours fériés. Tout reste modifiable ensuite dans les Paramètres de la nouvelle année.'),
        h('p', { class: 'muted' }, 'Conseil : imprimez avant le compte rendu de l\'année (Statistiques et bilan).'));
    } else if (etape === 1) {
      fill(box, titre,
        h('p', {}, 'Tarifs de la nouvelle année (repris des derniers tarifs en vigueur cette année) :'),
        h('div', { class: 'form-grid' }, TARIFS.map(([k, l]) => field(l, h('input', { type: 'number', step: '0.01', min: '0', name: `tarif-${k}`, value: np.tarifs[k] ?? '', oninput: (e) => { np.tarifs[k] = Number(e.target.value); } })))));
    } else if (etape === 2) {
      fill(box, titre,
        h('p', {}, 'Dates proposées : les mêmes que cette année, décalées d\'un an au même jour de la semaine. ', h('b', {}, 'À vérifier avec le calendrier scolaire officiel'), ' (zone C).'),
        h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Période'), h('th', {}, 'Début'), h('th', {}, 'Fin'))),
          h('tbody', {}, np.periods.map((per) => h('tr', {},
            h('td', {}, per.label),
            h('td', {}, h('input', { type: 'date', name: `per-${per.id}-start`, value: per.start, onchange: (e) => { if (e.target.value) per.start = e.target.value; } })),
            h('td', {}, h('input', { type: 'date', name: `per-${per.id}-end`, value: per.end, onchange: (e) => { if (e.target.value) per.end = e.target.value; } })))))),
        h('div', { class: 'form-grid', style: { marginTop: '8px' } },
          field('Rentrée du KT (mardi)', h('input', { type: 'date', value: np.ktStart.mardi || '', onchange: (e) => { np.ktStart.mardi = e.target.value; } })),
          field('Rentrée du KT (jeudi)', h('input', { type: 'date', value: np.ktStart.jeudi || '', onchange: (e) => { np.ktStart.jeudi = e.target.value; } }))));
    } else if (etape === 3) {
      fill(box, titre,
        h('p', {}, 'Jours fériés calculés pour l\'année (Pâques, Ascension et Pentecôte compris). Les journées exceptionnelles (journées pédagogiques, canicule…) s\'ajouteront dans les Paramètres au fil de l\'année.'),
        h('div', {}, [...fer].sort().map((d) => h('span', { class: 'chip', style: { padding: '4px 10px', margin: '2px' } }, dateFr(d), ' ', h('button', { class: 'link', title: `Retirer le ${dateFr(d)}`, onclick: () => { fer.delete(d); draw(); } }, '×')))),
        h('div', { class: 'tools', style: { marginTop: '6px' } }, h('input', { type: 'date', onchange: (e) => { if (e.target.value) { fer.add(e.target.value); draw(); } } }), h('span', { class: 'muted' }, 'ajouter un jour')));
    } else {
      fill(box, titre,
        h('ul', {},
          h('li', {}, 'Gardé : toutes les familles et tous les enfants (coordonnées, santé, années de présence, activités passées, jours habituels), les fiches PDF.'),
          h('li', {}, 'Présences et règlements repartent à zéro ; adhésions, documents et inscriptions sont à refaire. Les impayés restent sur l\'année ' + s.year + '.'),
          h('li', {}, 'Groupes : entrée en 6e → Collégiens, 3 ans → 4-5 ans ; les autres gardent leur groupe.'),
          h('li', {}, `Tarifs : Pédibus ${euro(np.tarifs.pedibus)}, Mercredi ${euro(np.tarifs.mercredi)}, Vacances ${euro(np.tarifs.journee)}, Adhésion ${euro(np.tarifs.adhesion)}.`),
          h('li', {}, `Rentrée : ${dateFr(start)} ; ${fer.size} jours fériés.`),
          h('li', {}, 'Katell et Lucas passent automatiquement sur la nouvelle année à leur prochaine ouverture.')));
    }
    const btns = m.el.querySelectorAll('.modal-foot button');
    btns.forEach((b) => {
      if (b.id === 'ny-prev') b.style.display = etape ? '' : 'none';
      if (b.id === 'ny-next') b.style.display = etape < ETAPES.length - 1 ? '' : 'none';
      if (b.id === 'ny-create') b.style.display = etape === ETAPES.length - 1 ? '' : 'none';
    });
  };
  const m = modal(`Nouvelle année scolaire ${label}`, box, [
    { label: 'Annuler' },
    { label: 'Précédent', id: 'ny-prev', onClick: () => { etape = Math.max(0, etape - 1); draw(); return false; } },
    { label: 'Suivant', id: 'ny-next', primary: true, onClick: () => { etape += 1; draw(); return false; } },
    { label: `Créer l'année ${label}`, id: 'ny-create', primary: true, onClick: async () => {
      if (!(await confirmBox('Confirmer', `Créer l'année ${label} et basculer dessus sur ce poste ?`, 'Créer'))) return false;
      np.feries = [...fer].sort();
      np.trimestres = [1, 2, 3].map((n) => { const ps = np.periods.filter((x) => x.kind === 'ecole' && x.trimestre === n); return { n, start: ps.map((x) => x.start).sort()[0], end: ps.map((x) => x.end).sort().at(-1) }; });
      start = np.periods.map((x) => x.start).sort()[0];
      const clean = ctx.store.cleanState();
      const base = newYear(clean, label, np, start);
      try { await ctx.bridge.newYear({ base, label }); } catch (e) { toast(e.message, 'err'); return false; }
      toast(`Année ${label} créée.`);
      setTimeout(() => location.reload(), 600);
      return true;
    } },
  ]);
  draw();
}
