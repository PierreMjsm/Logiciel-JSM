// Pré-inscriptions en ligne (formulaire Tally → classeur « Inscriptions » rempli par Power Automate).
// Lecture des lignes, rapprochement avec les familles connues, différences à valider, opérations à enregistrer.
import { ageAt, defaultGroupe } from './calendar.js';

// Colonnes reconnues (en-têtes du classeur, avec quelques variantes possibles d'un export Tally).
// Une chaîne = en-tête exact (sans accents ni ponctuation), une RegExp = en-tête qui y correspond.
const COLONNES = {
  id: ['submission id'],
  recue: ['date de reception', 'submitted at', 'date de soumission'],
  nom: ['nom', 'nom de l enfant'],
  prenom: ['prenom', 'prenom de l enfant'],
  mail: ['e mail', 'email', 'adresse e mail', 'adresse email'],
  mail2: ['e mail secondaire', 'email secondaire', 'adresse e mail secondaire'],
  tel: ['telephone', 'n de telephone 1 et lien', 'telephone 1'],
  tel2: ['telephone secondaire', 'n de telephone 2 et lien', 'telephone 2'],
  adresse: ['adresse et cp', 'adresse et code postal', 'adresse'],
  naissance: ['date de naissance'],
  ecole: ['ecole college', 'ecole', /^ecole ou colleges? frequentes? par l enfant/],
  classe: ['classe', 'classe frequentee par l enfant'],
  difficultes: ['difficultes de sante', /^renseignements medicaux/],
  traitement: ['traitement p a i', 'traitement pai', 'traitement', /^votre enfant suit il/],
  observations: ['observations', /^observations particulieres/],
  secu: [/^n de securite sociale/, 'numero de securite sociale'],
  urgence: [/^personne a contacter/],
  autorise1: ['personne autorisee 1', /^personnes? autorisees? a venir/],
  autorise2: ['personne autorisee 2', /^seconde personne autorisee/],
  'coche.vaccination': ['vaccination photocopies a joindre', 'vaccination', /^renseignements sanitaires concernant l enfant vaccination/],
  'coche.certifie': ['certifie vaccins a jour', /^renseignements sanitaires concernant l enfant certifie/],
  'coche.ayantDroit': ['attestation d ayant droit', /^renseignements sanitaires concernant l enfant attestation/],
  'coche.paiement': ['paiement 5', 'paiement 5 €', /^renseignements sanitaires concernant l enfant un paiement/],
  'coche.activites': ['participe a toutes les activites', /^concernant les activites .* a participer/],
  'coche.partSeul': ['part seul collegiens', 'part seul', /^concernant les activites .* quitte seul/],
  'coche.image': ['droit a l image', /^concernant les activites .* photographier/],
  'coche.facturation': ['journees facturees', /^concernant les activites .* chaque journee/],
  'coche.soins': ['autorisation de soins', /^concernant les activites .* autorise le responsable/],
  'coche.exactitude': [/^cochez si vous etes d accord .*soussign/],
  signataire: ['responsable legal je soussigne', 'je soussigne'],
  signature: ['signature'],
  'lien.ayantDroit': ['lien attestation d ayant droit', 'attestation d ayant droit de votre assurance maladie'],
  'lien.vaccins': ['lien photocopies vaccins', /^merci de joindre les photocopies/],
  'lien.photo': ['lien photo', 'photo d identite', 'lien photo d identite', /^une photo de l enfant/],
};
export const COCHES = {
  vaccination: 'Vaccination : photocopies jointes', certifie: 'Certifie les vaccins à jour', ayantDroit: 'Attestation d\'ayant droit jointe',
  paiement: 'Paiement de l\'adhésion (5 €)', activites: 'Participe à toutes les activités', partSeul: 'Part seul (collégiens)',
  image: 'Droit à l\'image', facturation: 'Journées cochées facturées', soins: 'Autorisation de soins',
  exactitude: 'Certifie exacts les renseignements',
};
export const FICHE_CHAMPS = {
  secu: 'N° de sécurité sociale', urgence: 'Personne à contacter en urgence', autorise1: 'Personne autorisée 1', autorise2: 'Personne autorisée 2',
  difficultes: 'Difficultés de santé', traitement: 'Traitement (PAI)', observations: 'Observations', signataire: 'Responsable légal (signataire)',
  signature: 'Signature', dateSignature: 'Date de la fiche',
};

export const sansAccent = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const cleCol = (s) => sansAccent(s).toLowerCase().replace(/[^a-z0-9€]+/g, ' ').trim();
const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const digits = (s) => String(s || '').replace(/\D/g, '');

// Téléphone au format « 06 12 34 56 78 » (Power Automate enlève le « + » de +33).
export function normTel(v) {
  const s = txt(v);
  if (!s) return '';
  let d = digits(s);
  if (/[a-z@]/i.test(s.replace(/^\+/, ''))) return s;
  if (d.startsWith('33') && d.length === 11) d = `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith('0')) return d.replace(/(\d\d)(?=\d)/g, '$1 ');
  return s;
}

// Date « 27/06/2016 », « 2016-06-27 » ou « 2016-06-27 00:00:00 » → « 2016-06-27 ».
export function normDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = txt(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
const oui = (v) => /^(oui|yes|true|vrai|1|x)$/i.test(txt(v));
const nomMaj = (v) => txt(v).toUpperCase().replace(/\s+/g, ' ');

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

// rows : tableau de lignes (la première = en-têtes). Renvoie une inscription par contenu distinct.
export function lireInscriptions(rows) {
  if (!rows || !rows.length) return [];
  const head = rows[0].map(cleCol);
  const idx = {};
  for (const [k, noms] of Object.entries(COLONNES)) {
    const i = head.findIndex((h) => noms.some((n) => (n instanceof RegExp ? n.test(h) : n === h)));
    if (i >= 0) idx[k] = i;
  }
  const out = new Map();
  rows.slice(1).forEach((r, n) => {
    const v = (k) => (idx[k] === undefined ? '' : r[idx[k]]);
    const nom = nomMaj(v('nom')), prenom = nomMaj(v('prenom'));
    if (!nom && !prenom) return;
    const coches = {};
    for (const k of Object.keys(COCHES)) coches[k] = oui(v(`coche.${k}`));
    const signature = txt(v('signature'));
    const rec = {
      ligne: n + 2,
      recue: normDate(v('recue')),
      recueLe: (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?/.exec(txt(v('recue'))) || [normDate(v('recue'))])[0].replace('T', ' '),
      nom, prenom,
      mail: txt(v('mail')).toLowerCase(),
      mail2: txt(v('mail2')).toLowerCase(),
      tel: normTel(v('tel')), tel2: normTel(v('tel2')),
      adresse: txt(v('adresse')),
      naissance: normDate(v('naissance')),
      ecole: nomMaj(v('ecole')), classe: nomMaj(v('classe')),
      fiche: {
        secu: txt(v('secu')), urgence: txt(v('urgence')), autorise1: txt(v('autorise1')), autorise2: txt(v('autorise2')),
        difficultes: txt(v('difficultes')), traitement: txt(v('traitement')), observations: txt(v('observations')),
        signataire: txt(v('signataire')) || (/^https?:/i.test(signature) ? '' : signature), signature, dateSignature: normDate(v('recue')),
      },
      coches,
      liens: { vaccins: txt(v('lien.vaccins')), ayantDroit: txt(v('lien.ayantDroit')), photo: txt(v('lien.photo')) },
    };
    // Les liens Tally changent à chaque téléchargement du fichier : on les laisse hors de la clé.
    const { ligne, liens, ...contenu } = rec;
    const id = txt(v('id'));
    rec.cle = id ? `tally-${id}` : hash(JSON.stringify(contenu));
    if (out.has(rec.cle)) out.get(rec.cle).fois += 1;
    else out.set(rec.cle, { ...rec, fois: 1 });
  });
  return [...out.values()];
}

const prenomCle = (s) => sansAccent(s).toUpperCase().replace(/[^A-Z]/g, '');
const telsOf = (f) => [f.telMaman, f.telPapa].map(digits).filter((d) => d.length >= 9).map((d) => d.slice(-9));
const mailsOf = (f) => String(f.mails || '').toLowerCase().split(/[;,\s]+/).filter((m) => m.includes('@'));

// Trouve la famille (et l'enfant) qui correspondent à une inscription.
export function rapprocher(state, rec) {
  const pc = prenomCle(rec.prenom);
  for (const [cid, c] of Object.entries(state.children)) {
    if (prenomCle(c.prenom) === pc && rec.naissance && c.naissance === rec.naissance) return { familyId: c.familyId, childId: cid, candidats: [c.familyId] };
  }
  const recMails = [rec.mail, rec.mail2].filter(Boolean);
  const recTels = [rec.tel, rec.tel2].map(digits).filter((d) => d.length >= 9).map((d) => d.slice(-9));
  const candidats = Object.entries(state.families).filter(([, f]) =>
    mailsOf(f).some((m) => recMails.includes(m)) || telsOf(f).some((t) => recTels.includes(t))).map(([id]) => id);
  if (!candidats.length) return { familyId: null, childId: null, candidats };
  const memeNom = candidats.filter((id) => sansAccent(state.families[id].nom).toUpperCase() === sansAccent(rec.nom));
  const familyId = candidats.length === 1 ? candidats[0] : memeNom.length === 1 ? memeNom[0] : null;
  let childId = null;
  if (familyId) {
    const hit = Object.entries(state.children).find(([, c]) => c.familyId === familyId && prenomCle(c.prenom) === pc && (!c.naissance || !rec.naissance || c.naissance === rec.naissance));
    if (hit) childId = hit[0];
  }
  return { familyId, childId, candidats };
}

const paiDe = (rec) => !!rec.fiche.traitement && !/^non\b/i.test(rec.fiche.traitement);

// Liste des changements proposés pour une famille / un enfant existants (ou nouveaux : avant vide).
export function differences(state, rec, familyId, childId) {
  const f = (familyId && state.families[familyId]) || {};
  const c = (childId && state.children[childId]) || {};
  const out = [];
  const push = (id, label, avant, apres, defaut = true) => {
    if (apres === '' || apres === undefined || apres === null) return;
    if (JSON.stringify(avant ?? '') === JSON.stringify(apres)) return;
    out.push({ id, label, avant: avant ?? '', apres, defaut });
  };
  push('famille.adresse', 'Adresse', f.adresse || '', rec.adresse);
  const mails = mailsOf(f);
  const nouveaux = [rec.mail, rec.mail2].filter((m) => m && !mails.includes(m));
  if (nouveaux.length) push('famille.mails', 'Mails', f.mails || '', [...(f.mails ? [f.mails.trim()] : []), ...nouveaux].join(' ; '));
  const connus = telsOf(f);
  const nouveauTel = (t) => t && !connus.includes(digits(t).slice(-9));
  if (nouveauTel(rec.tel)) push('famille.telMaman', 'Téléphone 1', f.telMaman || '', rec.tel);
  if (nouveauTel(rec.tel2)) push('famille.telPapa', 'Téléphone 2', f.telPapa || '', rec.tel2);
  push('enfant.naissance', 'Date de naissance', c.naissance || '', rec.naissance, !c.naissance);
  push('enfant.ecole', 'École', c.ecole || '', rec.ecole, !c.ecole);
  push('enfant.classe', 'Classe', c.classe || '', rec.classe);
  if (paiDe(rec) && !c.pai) push('enfant.pai', 'PAI (affiche * sur les listes)', !!c.pai, true);
  const fiche = c.fiche || {};
  for (const [k, label] of Object.entries(FICHE_CHAMPS)) push(`fiche.${k}`, label, fiche[k] || '', rec.fiche[k]);
  push('fiche.coches', 'Cases cochées', fiche.coches || '', rec.coches);
  const docs = c.documents || {};
  const apporte = { fiche: true, vaccins: !!(rec.liens.vaccins || rec.coches.vaccination), amelie: !!(rec.liens.ayantDroit || rec.coches.ayantDroit) };
  const docLabels = Object.fromEntries((state.params.documents || []).map((d) => [d.id, d.label]));
  for (const [k, v] of Object.entries(apporte)) if (v && !docs[k] && docLabels[k]) push(`doc.${k}`, `Document reçu : ${docLabels[k]}`, false, true);
  return out;
}

// Opérations à enregistrer. retenus : Set des id de différences à appliquer (null = toutes celles cochées par défaut).
export function opsPreinscription(state, rec, { familyId, childId, retenus = null, newFamilyId, newChildId, today, by }) {
  const ops = [];
  const fid = familyId || newFamilyId;
  const cid = childId || newChildId;
  const diffs = differences(state, rec, familyId, childId);
  const garde = (d) => (retenus ? retenus.has(d.id) : d.defaut);
  if (!familyId) {
    ops.push([['families', fid], { nom: rec.nom, nomCheque: '', mails: [rec.mail, rec.mail2].filter(Boolean).join(' ; '), adresse: rec.adresse, telMaman: rec.tel, telPapa: rec.tel2 }]);
  } else {
    for (const d of diffs.filter((x) => x.id.startsWith('famille.') && garde(x))) ops.push([['families', fid, d.id.split('.')[1]], d.apres]);
  }
  if (!childId) {
    const debut = (state.params.periods || []).map((p) => p.start).sort()[0] || today;
    const fam = familyId ? state.families[familyId] : null;
    ops.push([['children', cid], {
      familyId: fid, prenom: rec.prenom, ...(fam && fam.nom !== rec.nom ? { nom: rec.nom } : {}),
      naissance: rec.naissance, groupes: [{ from: null, groupe: defaultGroupe(ageAt(rec.naissance, debut)) }],
      ecole: rec.ecole, classe: rec.classe, adhesionDejaReglee: false, statut: paiDe(rec) ? 'PAI' : '', pai: paiDe(rec),
      documents: { fiche: true, vaccins: !!(rec.liens.vaccins || rec.coches.vaccination), amelie: !!(rec.liens.ayantDroit || rec.coches.ayantDroit) },
      inscriptions: {}, fiche: { ...rec.fiche, coches: rec.coches },
    }]);
  } else {
    for (const d of diffs.filter((x) => !x.id.startsWith('famille.') && garde(x))) {
      const [cible, k] = d.id.split('.');
      if (cible === 'enfant') ops.push([['children', cid, k], d.apres]);
      else if (cible === 'fiche') ops.push([['children', cid, 'fiche', k], d.apres]);
      else if (cible === 'doc') ops.push([['children', cid, 'documents', k], true]);
    }
  }
  ops.push([['preinscriptions', rec.cle], { traitee: today, by, childId: cid }]);
  return ops;
}

// Plusieurs exports (Tally ne permet de supprimer les réponses qu'une à une : les mêmes reviennent d'un export à l'autre).
// files : [{ nom, mtime, rows }]. Une réponse n'est gardée qu'une fois, depuis le fichier le plus récent (liens à jour).
// Si le même enfant a été inscrit plusieurs fois, les anciennes réponses sont marquées remplaceePar.
export function fusionnerExports(files) {
  const out = new Map();
  for (const f of [...files].sort((a, b) => (b.mtime || 0) - (a.mtime || 0))) {
    for (const rec of lireInscriptions(f.rows)) if (!out.has(rec.cle)) out.set(rec.cle, { ...rec, fichier: f.nom });
  }
  const recs = [...out.values()].sort((a, b) => (a.recueLe || '').localeCompare(b.recueLe || '') || a.cle.localeCompare(b.cle));
  const dernier = new Map();
  for (const r of recs) {
    const k = `${prenomCle(r.prenom)}|${r.naissance}|${prenomCle(r.nom)}`;
    if (dernier.has(k)) dernier.get(k).remplaceePar = r.cle;
    dernier.set(k, r);
  }
  return recs;
}

// Un fichier du dossier est-il un export d'inscriptions ? (export Tally, ou classeur avec Nom / Prénom / Date de naissance)
export function estExportInscriptions(rows) {
  const head = (rows && rows[0] ? rows[0] : []).map(cleCol);
  if (head.includes('submission id')) return true;
  const has = (k) => head.some((h) => COLONNES[k].some((n) => (n instanceof RegExp ? n.test(h) : n === h)));
  return has('prenom') && has('naissance');
}
