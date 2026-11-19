// Pré-inscriptions en ligne : les réponses du formulaire Tally (classeur « Inscriptions » rempli par Power Automate)
// sont relues, rapprochées des familles connues, puis validées une par une.
import { h, fill, modal, toast, todayIso, select, field } from '../ui.js';
import { rapprocher, differences, opsPreinscription, COCHES } from '../../src/core/preinscriptions.js';
import { idFormulaire } from '../../src/core/tally-api.js';
import { lireSources, nbNouvelles, majBadge } from '../inscriptions-source.js';
import { familyLabels } from '../../src/core/reports.js';
import { dateFr } from '../../src/core/format.js';
import { nomEnfant } from '../../src/core/noms.js';
import { ficheParDefaut, genererFiche, rangerPieces, fichesAImprimer, imprimerFichesEnAttente } from '../fiche-actions.js';

const aff = (v) => {
  if (v === true) return 'oui';
  if (v === false || v === '' || v === undefined || v === null) return '—';
  if (typeof v === 'object') return Object.entries(v).filter(([, x]) => x).map(([k]) => COCHES[k] || k).join(' · ') || 'aucune case';
  return /^\d{4}-\d\d-\d\d$/.test(v) ? dateFr(v) : String(v);
};

export function render(root, ctx) {
  let source = null, recs = [], nbExports = 0, tally = false, tallyErreur = null, voirTraitees = false, erreur = '', charge = false;
  const vuesCetteFois = new Set(); // traitées pendant cette séance : restent affichées
  const body = h('div');
  const head = h('div', { class: 'tools' });

  const charger = async () => {
    vuesCetteFois.clear();
    try {
      ({ source, recs, nbExports, tally, tallyErreur } = await lireSources(ctx.bridge));
      erreur = '';
      majBadge(nbNouvelles(ctx.store.get(), recs));
    } catch (e) { erreur = e.message || String(e); }
    charge = true;
    draw();
  };
  const choisir = async () => { const f = await ctx.bridge.preChoisir(); if (f) await charger(); };

  function statut(s, rec) {
    const t = (s.preinscriptions || {})[rec.cle];
    if (t) return { traitee: true, label: `${t.refusee || t.ignoree ? 'Refusée' : 'Traitée'} le ${dateFr(t.traitee)}${t.by ? ` (${t.by})` : ''}`, cls: '' };
    const r = rapprocher(s, rec);
    if (!r.familyId && r.candidats.length > 1) return { label: 'À vérifier : plusieurs familles possibles', cls: 'warn' };
    if (!r.familyId) return { label: 'Nouvelle famille', cls: 'ok' };
    const n = differences(s, rec, r.familyId, r.childId).length;
    return { label: `${r.childId ? 'Enfant connu' : 'Nouvel enfant, famille connue'}${n ? ` · ${n} changement(s)` : ' · rien de nouveau'}`, cls: r.childId ? '' : 'ok' };
  }

  function draw() {
    const s = ctx.store.get();
    const actif = source || tally || tallyErreur;
    fill(head,
      tally ? h('span', { class: 'chip ok' }, 'Tally en direct') : null,
      source ? h('span', { class: 'muted' }, `Dossier : ${source} · ${nbExports} export(s) Tally`) : null,
      h('button', { onclick: connexion }, 'Connexion Tally…'),
      h('button', { onclick: choisir }, source ? 'Changer de dossier…' : 'Choisir le dossier des exports Tally…'),
      (() => { const m = ficheParDefaut(s); const n = m ? fichesAImprimer(s, m.id).length : 0; return n ? h('button', { onclick: () => imprimerFichesEnAttente(ctx, m.id, draw) }, `Imprimer les fiches pas encore imprimées (${n})`) : null; })(),
      actif ? h('button', { class: 'primary', onclick: charger }, 'Relire') : null);
    if (erreur) { fill(body, h('p', { class: 'chip ko' }, erreur)); return; }
    if (!charge) { fill(body, h('p', { class: 'muted' }, 'Lecture des inscriptions…')); return; }
    if (!actif) {
      fill(body, h('section', { class: 'card' }, h('h2', {}, 'Comment ça marche'),
        h('p', {}, h('b', {}, 'Le plus simple : la connexion Tally. '), 'Une clé API (gratuite) suffit : l\'appli lit alors les réponses directement chez Tally, et vous signale les nouvelles inscriptions au démarrage.', ' ', h('button', { onclick: connexion }, 'Connexion Tally…')),
        h('p', {}, h('b', {}, 'Sinon : '), 'dans Tally : Réponses › Télécharger (CSV). Enregistrez le fichier toujours dans le même dossier, de préférence sur le drive (par exemple « Inscriptions Tally »). Choisissez ce dossier une fois sur cet ordinateur : l\'appli lit tous les exports qu\'il contient. Une réponse présente dans plusieurs exports n\'apparaît qu\'une fois ; vous n\'avez donc pas besoin de supprimer les réponses dans Tally.'),
        h('p', {}, 'Pour chaque inscription, vous vérifiez la famille trouvée et les changements proposés, puis « Valider » : la fiche de l\'enfant est mise à jour, les pièces jointes sont rangées dans son dossier sur le drive et la fiche PDF est créée.')));
      return;
    }
    const avert = tallyErreur ? h('p', { class: 'chip warn' }, `Tally : ${tallyErreur}`) : null;
    const rows = recs.map((rec) => ({ rec, st: statut(s, rec) })).filter((r) => voirTraitees || !r.st.traitee || vuesCetteFois.has(r.rec.cle))
      .sort((a, b) => (b.rec.recue || '').localeCompare(a.rec.recue || ''));
    const nbTraitees = recs.filter((r) => (s.preinscriptions || {})[r.cle]).length;
    fill(body, avert,
      h('div', { class: 'tools', style: { marginBottom: '8px' } },
        h('span', {}, `${recs.length - nbTraitees} à traiter · ${nbTraitees} déjà traitée(s)`),
        h('label', {}, h('input', { type: 'checkbox', checked: voirTraitees, onchange: (e) => { voirTraitees = e.target.checked; draw(); } }), ' Afficher les inscriptions déjà traitées')),
      rows.length ? h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, ['Reçue le', 'Enfant', 'Né(e) le', 'Mail', 'Situation', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map(({ rec, st }) => h('tr', { class: st.traitee ? 'avenir' : 'clickable', onclick: () => ouvrir(rec) },
          h('td', {}, rec.recue ? dateFr(rec.recue) : '—'),
          h('td', {}, h('b', {}, `${rec.nom} ${rec.prenom}`), rec.fois > 1 ? h('span', { class: 'muted' }, ` (envoyée ${rec.fois} fois)`) : null),
          h('td', {}, rec.naissance ? dateFr(rec.naissance) : '—'),
          h('td', {}, rec.mail || '—'),
          h('td', {}, h('span', { class: `chip ${st.cls}` }, st.label), rec.remplaceePar && !st.traitee ? h('div', { class: 'muted' }, 'Une inscription plus récente existe pour cet enfant') : null),
          h('td', { class: 'nowrap' }, st.traitee ? null : [
            h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); refuser(rec); } }, 'Refuser'), ' ',
            h('button', { class: 'small primary', onclick: (e) => { e.stopPropagation(); ouvrir(rec); } }, 'Accepter…')])))))
        : h('p', { class: 'muted' }, 'Aucune inscription à traiter.'));
  }

  function connexion() {
    const lien = 'https://tally.so/forms/D4LrYR/submissions';
    const v = { formulaire: lien, cle: '' };
    const res = h('p', { class: 'muted' });
    ctx.bridge.getConfig().then((c) => { if (c.tally && c.tally.formulaire) { v.formulaire = `https://tally.so/forms/${c.tally.formulaire}/submissions`; inForm.value = v.formulaire; } if (c.tally && c.tally.configuree) inCle.placeholder = 'Clé enregistrée : laissez vide pour la garder'; });
    const inForm = h('input', { type: 'text', name: 'formulaire', value: v.formulaire, oninput: (e) => { v.formulaire = e.target.value; } });
    const inCle = h('input', { type: 'password', name: 'cle', autocomplete: 'off', placeholder: 'tly-…', oninput: (e) => { v.cle = e.target.value; } });
    modal('Connexion Tally', h('div', {},
      h('p', { style: { marginTop: 0 } }, 'Avec une clé API, l\'appli lit les réponses directement chez Tally : plus d\'export à faire. L\'API fait partie de l\'offre gratuite.'),
      h('ol', {},
        h('li', {}, 'Sur tally.so : Réglages (Settings) › API keys › Create API key.'),
        h('li', {}, 'Copiez la clé (elle commence par « tly- ») et collez-la ci-dessous.'),
        h('li', {}, 'Faites de même sur chaque ordinateur : la clé reste sur l\'ordinateur, elle n\'est pas mise sur le drive.')),
      h('div', { class: 'form-grid' },
        field('Lien des réponses du formulaire', inForm),
        field('Clé API Tally', inCle)),
      res), [
      { label: 'Ouvrir Tally', onClick: () => { ctx.bridge.openExternal(`https://tally.so/forms/${idFormulaire(v.formulaire)}/submissions`); return false; } },
      { label: 'Tester', onClick: async () => {
        await ctx.bridge.tallyReglages({ formulaire: v.formulaire, cle: v.cle });
        const t = await ctx.bridge.tallyTester();
        res.textContent = t.ok ? `Connexion réussie : ${t.total} réponse(s) sur Tally.` : `Échec : ${t.erreur}`;
        res.className = t.ok ? 'chip ok' : 'chip ko';
        return false;
      } },
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, onClick: async () => { await ctx.bridge.tallyReglages({ formulaire: v.formulaire, cle: v.cle }); toast('Connexion Tally enregistrée.'); await charger(); } },
    ]);
  }

  async function refuser(rec) {
    vuesCetteFois.add(rec.cle);
    await ctx.store.dispatch(['preinscriptions', rec.cle], { traitee: todayIso(), by: ctx.store.whoami().profil, childId: null, refusee: true });
    majBadge(nbNouvelles(ctx.store.get(), recs));
    draw();
  }

  function ouvrir(rec) {
    vuesCetteFois.add(rec.cle);
    const s = ctx.store.get();
    const deja = (s.preinscriptions || {})[rec.cle];
    const r = rapprocher(s, rec);
    let familyId = r.familyId, childId = r.childId;
    const retenus = new Set();
    const labels = familyLabels(s);
    const opts = { telecharger: true, fiche: !!ficheParDefaut(s) };
    const box = h('div');
    const draw2 = () => {
      const st = ctx.store.get();
      const diffs = differences(st, rec, familyId, childId);
      retenus.clear();
      for (const d of diffs) if (d.defaut) retenus.add(d.id);
      const autres = Object.keys(st.families).filter((id) => !r.candidats.includes(id)).sort((a, b) => (labels[a] || '').localeCompare(labels[b] || '', 'fr'));
      const kids = familyId ? Object.entries(st.children).filter(([, c]) => c.familyId === familyId) : [];
      const liens = Object.entries({ vaccins: 'Vaccins', ayantDroit: 'Attestation d\'ayant droit', photo: 'Photo' }).filter(([k]) => rec.liens[k]);
      fill(box,
        deja ? h('p', { class: 'chip warn' }, `Déjà traitée le ${dateFr(deja.traitee)}. Vous pouvez la reprendre.`) : null,
        h('p', {}, h('b', {}, `${rec.nom} ${rec.prenom}`), ` · né(e) le ${rec.naissance ? dateFr(rec.naissance) : '?'} · ${rec.mail || 'pas de mail'} · ${rec.tel || 'pas de téléphone'}`),
        h('div', { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Famille'),
            select([['', '— Nouvelle famille —'], ...r.candidats.map((id) => [id, `${labels[id]} (trouvée)`]), ...autres.map((id) => [id, labels[id]])], familyId || '',
              { name: 'familyId', onchange: (e) => { familyId = e.target.value || null; childId = null; draw2(); } })),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Enfant'),
            select([['', '— Nouvel enfant —'], ...kids.map(([id, c]) => [id, `${nomEnfant(st, c)} ${c.prenom} (${c.naissance ? dateFr(c.naissance) : '?'})`])], childId || '',
              { name: 'childId', onchange: (e) => { childId = e.target.value || null; draw2(); } }))),
        !familyId || !childId ? h('p', { class: 'muted' }, !familyId ? 'Une nouvelle famille et un nouvel enfant seront créés avec toutes les informations de l\'inscription.' : 'Un nouvel enfant sera créé dans cette famille avec toutes les informations de l\'inscription.') : null,
        diffs.length ? h('table', { class: 'grid' },
          h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Information'), h('th', {}, 'Dans l\'appli'), h('th', {}, 'Dans l\'inscription'))),
          h('tbody', {}, diffs.map((d) => {
            const auChoix = familyId && (childId || d.id.startsWith('famille.'));
            return h('tr', {},
              h('td', {}, auChoix ? h('input', { type: 'checkbox', checked: retenus.has(d.id), onchange: (e) => { if (e.target.checked) retenus.add(d.id); else retenus.delete(d.id); } }) : h('span', { title: 'Sera enregistré' }, '✓')),
              h('td', {}, d.label), h('td', { class: 'muted' }, auChoix ? aff(d.avant) : 'nouveau'), h('td', {}, h('b', {}, aff(d.apres))));
          })))
          : h('p', { class: 'muted' }, 'Rien de nouveau par rapport à la fiche de l\'enfant.'),
        liens.length ? h('label', {}, h('input', { type: 'checkbox', name: 'telecharger', checked: opts.telecharger, onchange: (e) => { opts.telecharger = e.target.checked; } }),
          ` Ranger les pièces jointes dans le dossier de l'enfant (${liens.map(([, l]) => l).join(', ')})`) : h('p', { class: 'muted' }, 'Pas de pièce jointe.'),
        h('div', {}, h('label', {}, h('input', { type: 'checkbox', name: 'fichePdf', checked: opts.fiche, disabled: !ficheParDefaut(st), onchange: (e) => { opts.fiche = e.target.checked; } }),
          ficheParDefaut(st) ? ` Créer la fiche PDF « ${ficheParDefaut(st).nom} »` : ' Fiche PDF : aucune fiche dans Paramètres › Fiches PDF')));
    };
    draw2();
    modal('Accepter la pré-inscription', box, [
      { label: 'Refuser', title: 'Doublon, test ou inscription non retenue : rien n\'est modifié', onClick: () => refuser(rec) },
      { label: 'Annuler' },
      { label: 'Valider', primary: true, onClick: async () => {
        const st = ctx.store.get();
        const cid = childId || ctx.store.newId('c');
        const changes = opsPreinscription(st, rec, { familyId, childId, retenus: familyId && childId ? retenus : (familyId ? new Set([...retenus].filter((x) => x.startsWith('famille.'))) : null),
          newFamilyId: familyId ? null : ctx.store.newId('f'), newChildId: cid, today: todayIso(), by: ctx.store.whoami().profil });
        await ctx.store.dispatchMany(changes);
        majBadge(nbNouvelles(ctx.store.get(), recs));
        draw();
        let n = 0;
        if (opts.telecharger) n = await rangerPieces(ctx, cid, rec);
        let fiche = null;
        if (opts.fiche) { try { fiche = await genererFiche(ctx, cid, { nouvelle: true }); } catch (e) { toast(`Fiche PDF : ${e.message || e}`, 'err'); } }
        toast(`${rec.prenom} ${rec.nom} : fiche mise à jour${n ? `, ${n} pièce(s) jointe(s) rangée(s)` : ''}${fiche ? ', fiche PDF créée' : ''}.`);
      } },
    ]);
  }

  root.append(h('header', { class: 'screen-head' }, h('h1', {}, 'Pré-inscriptions'), head), body);
  draw();
  charger();
  return { refresh: draw };
}
