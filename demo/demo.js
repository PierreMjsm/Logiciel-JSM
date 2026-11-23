// Démonstration en ligne : faux « drive » en mémoire + familles fictives.
import { ENTETES, ligne } from '../tests/core/fixtures/tally.js';
// Aucune donnée réelle : tous les noms sont inventés.
import { defaultParams2026, activityDates, defaultGroupe, ageAt } from '../src/core/calendar.js';
import { derivePlanning } from '../src/core/planning.js';

let seed = 20262027;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const NOMS = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'RICHARD', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'SIMON', 'LAURENT',
  'LEFEBVRE', 'MICHEL', 'GARCIA', 'DAVID', 'BERTRAND', 'ROUX', 'VINCENT', 'FOURNIER', 'MOREL', 'GIRARD', 'ANDRE', 'MERCIER', 'DUPONT',
  'LAMBERT', 'BONNET', 'FRANCOIS', 'MARTINEZ', 'LEGRAND', 'GARNIER', 'FAURE', 'ROUSSEAU', 'BLANC', 'GUERIN', 'MULLER', 'HENRY', 'ROUSSEL',
  'NICOLAS', 'PERRIN', 'MORIN', 'MATHIEU', 'CLEMENT', 'GAUTHIER', 'DUMONT', 'LOPEZ', 'FONTAINE', 'CHEVALIER', 'ROBIN', 'MASSON'];
const PRENOMS = ['LEO', 'GABRIEL', 'RAPHAEL', 'ARTHUR', 'LOUIS', 'JULES', 'ADAM', 'MAEL', 'LUCAS', 'HUGO', 'NOAH', 'LIAM', 'SACHA', 'NATHAN',
  'TOM', 'PAUL', 'JADE', 'LOUISE', 'EMMA', 'AMBRE', 'ALICE', 'ROSE', 'ANNA', 'MIA', 'LINA', 'CHLOE', 'LEA', 'MILA', 'JULIA', 'ZOE',
  'INES', 'LOU', 'NINA', 'CAMILLE', 'SARAH', 'MARGAUX'];
const ECOLES = ['ROSALIE', 'MARCEL', 'BUFFON', 'BROSSO', 'ARBALETE', 'VICTOR', 'EPEE DE BOIS'];

function demoBase() {
  const params = defaultParams2026();
  params.attestation = { tresorier: 'Jean EXEMPLE', habilitation: '0000000DEMO', agrement: params.attestation.agrement };
  params.cafAutres = { collegienPedibus: 1, mercrediMatin: 3.5, mercrediAprem: 4, vacancesJournee: 8, adoSoiree: 3 };
  const families = {}, children = {}, presences = {}, payments = {};
  const used = new Set();
  let nc = 0, np = 0;
  const pedDates = activityDates(params, 'pedibus', {});
  const merDates = activityDates(params, 'mercredi', {});
  const tou = activityDates(params, 'toussaint', {});
  for (let f = 1; f <= 70; f++) {
    let nom = pick(NOMS);
    const homonyme = used.has(nom);
    used.add(nom);
    const fid = `f${f}`;
    const mail = `${nom.toLowerCase()}${homonyme ? f : ''}@exemple.fr`;
    families[fid] = { nom, nomCheque: '', mails: mail, adresse: `${1 + Math.floor(rnd() * 90)} rue des Exemples 750${pick(['05', '13', '13', '13', '14'])} Paris`, telMaman: `06000000${String(f).padStart(2, '0')}`, telPapa: '' };
    const nKids = rnd() < 0.15 ? 3 : rnd() < 0.45 ? 2 : 1;
    const ecole = pick(ECOLES);
    const ancien = rnd() < 0.1;
    for (let k = 0; k < nKids; k++) {
      const cid = `c${++nc}`;
      const year = 2015 + Math.floor(rnd() * 9);
      const naissance = `${year}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
      const age = ageAt(naissance, '2026-09-01');
      const groupe = ancien ? 'Plus présent' : defaultGroupe(age);
      const ped = !ancien && rnd() < 0.6, mer = !ancien && rnd() < 0.55, vac = !ancien && rnd() < 0.4;
      const kt = ped && age >= 7 && rnd() < 0.2;
      const adh = !ancien && rnd() < 0.7;
      children[cid] = {
        familyId: fid, prenom: pick(PRENOMS), naissance, groupes: [{ from: null, groupe }],
        ecole: groupe === 'Collégiens' ? 'COLLEGE' : ecole, adhesionDejaReglee: adh, statut: '', pai: rnd() < 0.06,
        documents: { fiche: adh, vaccins: adh && rnd() < 0.8, amelie: adh && rnd() < 0.85 },
        inscriptions: { pedibus: ped, ktMardi: false, ktJeudi: kt, mercredi: mer, pediMercredi: false, toussaint: vac, noel: false, hiver: false,
          printemps: false, rose: false, juillet: false, aout: false, collegiens: false, exceptionnel: false, ado: groupe === 'Collégiens' },
      };
      if (groupe === 'Collégiens') children[cid].groupes = [{ from: null, groupe: 'Collégiens' }];
      const days = [1, 2, 4, 5].filter(() => rnd() < 0.7);
      if (ped) for (const d of pedDates) {
        const wd = new Date(`${d}T12:00:00`).getDay();
        if (!days.includes(wd)) continue;
        let v = groupe === 'Collégiens' ? 'C' : 'P';
        if (kt && wd === 4 && d >= params.ktStart.jeudi) v = 'KT';
        if (rnd() < 0.05) v = 'A';
        presences[`${cid}|pedibus|${d}|`] = v;
      }
      const slots = rnd() < 0.6 ? ['matin', 'aprem'] : [pick(['matin', 'aprem'])];
      if (mer) for (const d of merDates) for (const sl of slots) presences[`${cid}|mercredi|${d}|${sl}`] = rnd() < 0.06 ? 'A' : 'P';
      if (vac) for (const d of tou) if (rnd() < 0.7) presences[`${cid}|toussaint|${d}|`] = 'P';
    }
    if (rnd() < 0.7) {
      const montant = 20 * (1 + Math.floor(rnd() * 8));
      payments[`p${++np}`] = { familyId: fid, childId: '', date: '2026-09-25', montant, mode: pick(['cheque', 'cheque', 'especes', 'carte']), numero: String(1000000 + np),
        banque: '', nomCheque: '', commentaire: '', affectations: [{ poste: 'pedibus-T1', montant, childId: Object.keys(children).find((c) => children[c].familyId === fid) }],
        moisEncaissement: pick(['2026-10', '2026-11', '2026-12']), remis: false, dateRemise: null };
    }
  }
  return { schema: 1, year: '2026-2027', params, families, children, presences, extraDates: { exceptionnel: ['2026-10-06'], ado: ['2026-10-02', '2026-11-06'] }, payments };
}

function showDoc(title, html) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = '<div class="modal" style="width:min(900px,100%)"><div class="modal-head"><h2></h2><button class="icon" title="Fermer">×</button></div><div class="modal-body" style="max-height:78vh"><p class="muted">Dans l\'appli Windows, ce document est imprimé ou enregistré en PDF. Voici son aperçu :</p><iframe style="width:100%;height:65vh;border:1px solid #dfe4ea;border-radius:6px;background:#fff"></iframe></div></div>';
  back.querySelector('h2').textContent = title;
  back.querySelector('iframe').srcdoc = html;
  back.querySelector('button').onclick = () => back.remove();
  back.onmousedown = (e) => { if (e.target === back) back.remove(); };
  document.body.appendChild(back);
}

// Trois réponses fictives du formulaire en ligne : un enfant connu (téléphone changé), une nouvelle famille (envoyée deux fois).
function demoInscriptions() {
  const [cid, c] = Object.entries(base.children).find(([, x]) => x.naissance);
  const f = base.families[c.familyId];
  const d = (iso) => iso.split('-').reverse().join('/');
  return [ENTETES,
    ligne({ Nom: f.nom, 'Prénom': c.prenom, 'E-mail': (f.mails || '').split(/[;,\s]+/)[0], 'Téléphone': '06 98 76 54 32', 'Adresse et CP': f.adresse, 'Date de naissance': d(c.naissance), Classe: 'CE2', 'Date de réception': '10/11/2026' }),
    ligne({ Nom: 'Exemple', 'Prénom': 'Lina', 'E-mail': 'lina.exemple@exemple.fr', 'Téléphone': '0611223344', 'Date de naissance': '02/05/2019', 'Date de réception': '13/11/2026' }),
    ligne({ Nom: 'Exemple', 'Prénom': 'Lina', 'E-mail': 'lina.exemple@exemple.fr', 'Téléphone': '0611223344', 'Date de naissance': '02/05/2019', 'Date de réception': '13/11/2026' }),
  ];
}

let base = demoBase();
for (const [id, plan] of Object.entries(derivePlanning(base))) base.children[id].planning = plan;
const ops = [];
let remote = null;
const cfg = { folder: 'Drive › JSM (démonstration)', profil: 'Pierre', device: 'DEMO', version: '1.5.0' };
window.jsm = {
  version: '1.5.0',
  getConfig: async () => cfg,
  chooseFolder: async () => cfg.folder,
  setProfil: async (p) => { cfg.profil = p || 'Pierre'; return cfg.profil; },
  setConfig: async (p) => Object.assign(cfg, p),
  load: async () => ({ base, ops: [...ops], warnings: [] }),
  append: async (op) => { ops.push(op); return true; },
  others: async () => [{ profil: 'Katell', device: 'PORTABLE', t: new Date(Date.now() - 40000).toISOString() }],
  backup: async () => true,
  writeBase: async (b) => { base = b; return true; },
  replaceAll: async (b) => { base = b; ops.length = 0; return true; },
  newYear: async () => { throw new Error('Non disponible dans la démonstration.'); },
  years: async () => [],
  lireAnnee: async () => { throw new Error('Démo : pas d\'année précédente.'); },
  openYear: async () => { throw new Error('Non disponible dans la démonstration.'); },
  closeYear: async () => true,
  preLire: async () => ({ source: 'Inscriptions Tally (démonstration)', files: [{ nom: 'Plateforme_d_adhesion_Submissions.xlsx', mtime: 1, rows: demoInscriptions() }] }),
  preChoisir: async () => 'Inscriptions Tally (démonstration)',
  tallyReglages: async () => { throw new Error('La connexion Tally se règle dans l\'appli Windows.'); },
  tallyTester: async () => ({ erreur: 'Non disponible dans la démonstration.' }),
  dossierChoisirRacine: async () => { throw new Error('Disponible dans l\'appli Windows.'); },
  dossierPhoto: async () => null,
  dossierVignettes: async () => ({}),
  dossierChoisirPhoto: async () => { throw new Error('Les photos se rangent dans l\'appli Windows.'); },
  dossierSupprimer: async () => true,
  ficheAjouterModele: async () => { throw new Error('Les fiches PDF s\'ajoutent dans l\'appli Windows.'); },
  ficheChamps: async () => [],
  ficheGenerer: async () => { throw new Error('Les fiches PDF se créent dans l\'appli Windows.'); },
  ficheImprimerLot: async () => { throw new Error('Disponible dans l\'appli Windows.'); },
  dossierTelecharger: async () => 'démonstration',
  dossierOuvrir: async () => { throw new Error('Les dossiers des enfants s\'ouvrent dans l\'appli Windows.'); },
  pickExcel: async () => { throw new Error('L\'import des fichiers Excel se fait dans l\'appli Windows.'); },
  pickTable: async () => { throw new Error('Dans la démonstration, l\'ajout depuis un fichier se fait dans l\'appli Windows.'); },
  saveTemplate: async () => { throw new Error('Le modèle Excel s\'enregistre depuis l\'appli Windows.'); },
  printToPDF: async ({ html, fileName }) => { showDoc(fileName, html); return null; },
  print: async ({ html }) => { showDoc('Impression', html); return true; },
  choosePdfFolder: async () => null,
  openExternal: async (u) => { if (/^https?:/.test(u)) window.open(u, '_blank'); return true; },
  copy: async (t) => { try { await navigator.clipboard.writeText(t); } catch { /* refusé par le navigateur */ } return true; },
  saveText: async ({ fileName, text }) => { showDoc(fileName, `<pre style="font:12px monospace;white-space:pre">${text.replace(/[&<]/g, (c) => (c === '&' ? '&amp;' : '&lt;'))}</pre>`); return null; },
  onRemote: (cb) => { remote = cb; return () => {}; },
};

// Bandeau de démonstration
const bar = document.createElement('div');
bar.style.cssText = 'position:fixed;bottom:34px;left:50%;transform:translateX(-50%);z-index:70;background:#fff3dd;color:#a15c00;border:1px solid #f5d39b;border-radius:8px;padding:4px 14px;font:13px Aptos,Segoe UI,system-ui,sans-serif';
bar.textContent = 'Démonstration — familles fictives, rien n\'est enregistré (tout repart à zéro si vous rechargez)';
document.body.appendChild(bar);

// Simule une modification de Katell sur un autre ordinateur après 25 secondes.
setTimeout(() => {
  const key = Object.keys(base.presences).find((k) => k.includes('|pedibus|2026-11-13|'));
  if (key && remote) remote([{ t: new Date().toISOString(), by: 'Katell', dev: 'PORTABLE', seq: 1, path: ['presences', key], value: 'A' }], {});
}, 25000);

import('../app/main.js');
