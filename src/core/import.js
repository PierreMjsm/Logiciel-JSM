// Reprise des classeurs Excel 2026-2027 → base.json.
// Les enfants sont reconnus par NOM + PRÉNOM (et non plus par numéro de ligne) ;
// en cas d'homonymes, la position de la ligne sert à départager.
import { defaultParams2026, defaultGroupe, ageAt } from './calendar.js';
import { round2 } from './format.js';
import { derivePlanning } from './planning.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const norm = (s) => String(s ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const keyOf = (nom, prenom) => `${norm(nom)}|${norm(prenom)}`;
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function detectBook(wb) {
  const n = new Set(Object.keys(wb.sheets));
  if (n.has('Suivi Paiements')) return 'compta';
  if (n.has('Remise chèque')) return 'cheque';
  if (n.has('PageJaune') || (n.has('général') && n.has('Mails'))) return 'contact';
  if (n.has('Pedibus')) return 'pedibus';
  if (n.has('Liste Matin') || n.has('Liste Aprem')) return 'mercredi';
  if (n.has('Toussaint')) return 'vacances';
  if (n.has('Liste Collégiens')) return 'ado';
  if (n.has('CAF')) return 'caf';
  if (n.has('général')) return 'contact';
  return null;
}

function phone(v) {
  if (typeof v === 'number') { const s = String(v); return s.length === 9 ? `0${s}` : s; }
  return str(v);
}

const INS_COLS = ['pedibus', 'mercredi', 'pediMercredi', 'toussaint', 'noel', 'hiver', 'printemps', 'rose',
  'juillet', 'aout', 'ktMardi', 'ktJeudi', 'exceptionnel', 'collegiens']; // colonnes M → Z

// Documents d'après la colonne COM de Contact (ce qui manque encore).
function documentsFrom(com, adherent) {
  if (!adherent) return { fiche: false, vaccins: false, amelie: false };
  const c = com.toLowerCase();
  return {
    fiche: !c.includes('papier'),
    vaccins: !(c.includes('vaccin')),
    amelie: !(c.includes('sécu') || c.includes('secu') || c.includes('amélie') || c.includes('amelie')),
  };
}

function readContact(book, report) {
  const rows = book.sheets['général'].rows();
  const children = {}, childIndex = new Map(), childRow = new Map();
  const raw = []; // une entrée par enfant : clés de rapprochement de la famille
  let nc = 0;
  for (let r = 7; r < rows.length; r++) {
    const R = rows[r] || [];
    const nom = norm(R[2]);
    if ((!nom && !norm(R[3])) || nom === 'NOM') continue;
    const prenomRaw = str(R[3]);
    const pai = /\*/.test(prenomRaw) || str(R[11]).toUpperCase() === 'PAI';
    const prenom = norm(prenomRaw);
    const naissance = typeof R[5] === 'string' && ISO.test(R[5]) ? R[5] : null;
    const groupe = str(R[0]) || (naissance ? defaultGroupe(ageAt(naissance, '2026-09-01')) : 'en attente');
    const id = `c${++nc}`;
    const inscriptions = { ado: false };
    INS_COLS.forEach((k, i) => { inscriptions[k] = R[12 + i] === true; });
    const adh = R[1] === true;
    children[id] = {
      familyId: null, prenom, naissance, groupes: [{ from: null, groupe }], ecole: str(R[6]).toUpperCase(),
      adhesionDejaReglee: adh, statut: str(R[11]), pai, documents: documentsFrom(str(R[11]), adh), inscriptions,
    };
    const mails = str(R[7]).toLowerCase().split(/[;,\s]+/).filter((m) => m.includes('@'));
    const tels = [phone(R[9]), phone(R[10])].map((t) => t.replace(/\D/g, '')).filter((t) => t.length >= 9);
    const adresse = str(R[8]).toLowerCase().replace(/\s+/g, ' ');
    raw.push({ id, nom, keys: [...mails.map((m) => `m:${m}`), ...tels.map((t) => `t:${t}`), ...(adresse.length > 8 ? [`a:${adresse}`] : [])],
      fam: { mails: str(R[7]), adresse: str(R[8]), telMaman: phone(R[9]), telPapa: phone(R[10]) } });
    const k = keyOf(nom, prenom);
    if (!childIndex.has(k)) childIndex.set(k, []);
    childIndex.get(k).push(id);
    childRow.set(id, r);
  }
  // Familles : même nom (tel qu'écrit dans Excel, ex. DUPONT3) ET au moins un mail, téléphone ou adresse en commun.
  const parent = new Map(raw.map((x) => [x.id, x.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const seen = new Map();
  for (const x of raw) {
    if (!x.keys.length) { const k = `n:${x.nom}|seul`; if (seen.has(k)) parent.set(find(x.id), find(seen.get(k))); else seen.set(k, x.id); }
    for (const key of x.keys) {
      const k = `${x.nom}|${key}`;
      if (seen.has(k)) parent.set(find(x.id), find(seen.get(k))); else seen.set(k, x.id);
    }
  }
  const families = {};
  const famOf = new Map();
  let nf = 0;
  for (const x of raw) {
    const root = find(x.id);
    if (!famOf.has(root)) {
      const fid = `f${++nf}`;
      famOf.set(root, fid);
      const display = x.nom.replace(/\s*\d+$/, '').trim() || x.nom;
      families[fid] = { nom: display, nomImport: x.nom, nomCheque: '', ...x.fam };
    }
    children[x.id].familyId = famOf.get(root);
  }
  const byPrenom = new Map();
  for (const [id, c] of Object.entries(children)) { if (!byPrenom.has(c.prenom)) byPrenom.set(c.prenom, []); byPrenom.get(c.prenom).push(id); }
  for (const [k, ids] of childIndex) if (ids.length > 1) report.ambiguous.push(`${k.replace('|', ' ')} (${ids.length} fiches homonymes : vérifier qu'il ne s'agit pas d'un doublon)`);
  const homonymes = new Map();
  for (const f of Object.values(families)) homonymes.set(f.nom, (homonymes.get(f.nom) || 0) + 1);
  for (const [nom, n] of homonymes) if (n > 1) report.familles.push(`${nom} : ${n} familles différentes portent ce nom`);
  return { families, children, childIndex, childRow, byPrenom };
}

// Associe une ligne d'une feuille à un enfant : par nom+prénom, la position départage les homonymes.
function makeMatcher(ctx, sheetLabel, report) {
  const offsets = new Map();
  let offset = null;
  return (rowIdx, nom, prenom) => {
    let ids = ctx.childIndex.get(keyOf(nom, prenom));
    if (!ids && !norm(nom) && norm(prenom)) {
      // Nom vide dans la feuille (lien Excel cassé) : prénom + position de la ligne.
      const byPrenom = ctx.byPrenom.get(norm(prenom)) || [];
      const atRow = offset !== null ? byPrenom.filter((id) => ctx.childRow.get(id) + offset === rowIdx) : [];
      if (atRow.length === 1) return atRow[0];
      if (byPrenom.length === 1) return byPrenom[0];
    }
    if (!ids) {
      if (norm(nom) || norm(prenom)) report.unmatched.push(`${sheetLabel} : ${norm(nom)} ${norm(prenom)} introuvable dans Contact`);
      return null;
    }
    if (ids.length === 1) {
      const d = rowIdx - ctx.childRow.get(ids[0]);
      offsets.set(d, (offsets.get(d) || 0) + 1);
      offset = [...offsets.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return ids[0];
    }
    const pick = ids.find((id) => ctx.childRow.get(id) + (offset ?? 0) === rowIdx);
    return pick || ids[0];
  };
}

function readGrid({ rows, datesRow, headerRow, firstData, firstCol, lastCol, nomCol = 1, prenomCol = 2, slotOf, accept, match, activity, out, report }) {
  const dates = rows[datesRow] || [];
  const header = rows[headerRow] || [];
  const cols = [];
  for (let c = firstCol; c <= lastCol; c++) {
    const d = dates[c];
    if (typeof d !== 'string' || !ISO.test(d)) continue;
    const slot = slotOf ? slotOf(str(header[c])) : '';
    if (slot === null) continue;
    cols.push([c, d, slot]);
  }
  const seenDates = new Set();
  for (let r = firstData; r < rows.length; r++) {
    const R = rows[r];
    if (!R || (!norm(R[nomCol]) && !norm(R[prenomCol]))) continue;
    let cid;
    let matched = false;
    for (const [c, d, slot] of cols) {
      const raw = R[c];
      if (raw === null || raw === undefined || raw === '' || raw === 0) continue;
      const v = str(raw).toUpperCase().replace(/^A[ .-]?KT$/, 'AKT');
      if (!accept.includes(v)) { report.ignoredValues[v] = (report.ignoredValues[v] || 0) + 1; continue; }
      if (!matched) { cid = match(r, R[nomCol], R[prenomCol]); matched = true; }
      if (!cid) break;
      out[`${cid}|${activity}|${d}|${slot}`] = v;
      seenDates.add(d);
      report.presences += 1;
    }
  }
  return [...seenDates];
}

const VAC_SHEETS = [['toussaint', 'Toussaint'], ['noel', 'Noël'], ['hiver', 'Hiver'], ['printemps', 'Printemps'], ['rose', 'Rose'],
  ['collegiens', 'Collégiens'], ['juillet', 'Juillet'], ['aout', 'Août'], ['exceptionnel', 'Exceptionnel']];

const CHEQUE_MONTHS = { 9: '2026-10', 10: '2026-11', 11: '2026-12', 12: '2027-01', 13: '2027-02', 14: '2027-03', 15: '2027-04',
  16: '2027-05', 17: '2027-06', 18: '2027-06', 19: '2027-06', 20: '2027-07', 21: '2027-08', 22: '2027-08', 23: '2027-09' };

export function importWorkbooks(books) {
  const report = { children: 0, families: 0, presences: 0, payments: 0, unmatched: [], ambiguous: [], familles: [], ignoredValues: {}, ecarts: [] };
  if (!books.contact) throw new Error('Le fichier Contact est indispensable pour l\'import.');
  const ctx = readContact(books.contact, report);
  const presences = {};
  const extraDates = { exceptionnel: [], ado: [] };
  const reel = new Map(); // childId -> [{poste, montant}]
  const addReel = (cid, poste, m) => { if (!cid || !m) return; if (!reel.has(cid)) reel.set(cid, []); reel.get(cid).push({ poste, montant: round2(m) }); };

  if (books.pedibus) {
    const rows = books.pedibus.sheets.Pedibus.rows();
    readGrid({ rows, datesRow: 12, headerRow: 13, firstData: 14, firstCol: 7, lastCol: 190, accept: ['P', 'A', 'KT', 'AKT', 'C'],
      match: makeMatcher(ctx, 'Pédibus', report), activity: 'pedibus', out: presences, report });
  }
  if (books.mercredi) {
    const rows = books.mercredi.sheets.Mercredi.rows();
    readGrid({ rows, datesRow: 13, headerRow: 14, firstData: 15, firstCol: 7, lastCol: 96, accept: ['P', 'A'],
      slotOf: (h) => (/^MATIN/i.test(h) ? 'matin' : /^APREM/i.test(h) ? 'aprem' : null),
      match: makeMatcher(ctx, 'Mercredi', report), activity: 'mercredi', out: presences, report });
  }
  if (books.vacances) {
    for (const [id, name] of VAC_SHEETS) {
      const sh = books.vacances.sheets[name];
      if (!sh) continue;
      const rows = sh.rows();
      const h = rows.findIndex((x) => x && x[1] === 'Nom');
      if (h < 1) continue;
      const match = makeMatcher(ctx, `Vacances ${name}`, report);
      const dates = readGrid({ rows, datesRow: h - 1, headerRow: h, firstData: h + 1, firstCol: 7, lastCol: 30, accept: ['P', 'A'],
        slotOf: (hd) => (/^Pr[ée]sent/i.test(hd) ? '' : null), match, activity: id, out: presences, report });
      if (id === 'exceptionnel') extraDates.exceptionnel = [...new Set([...(rows[h - 1] || []).filter((d) => typeof d === 'string' && ISO.test(d)), ...dates])].sort();
      for (let r = h + 1; r < rows.length; r++) {
        const R = rows[r];
        if (R && num(R[6]) > 0) addReel(match(r, R[1], R[2]), id, num(R[6]));
      }
    }
  }
  if (books.ado) {
    const rows = books.ado.sheets['Liste Collégiens'].rows();
    const hdr = rows[6] || [];
    const cols = [];
    hdr.forEach((v, c) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str(v)); if (m && c >= 6) cols.push([c, `${m[3]}-${m[2]}-${m[1]}`]); });
    extraDates.ado = cols.map((x) => x[1]).sort();
    const match = makeMatcher(ctx, 'ADO', report);
    for (let r = 7; r < rows.length; r++) {
      const R = rows[r];
      if (!R || (!norm(R[2]) && !norm(R[3]))) continue;
      for (const [c, d] of cols) {
        if (str(R[c]).toUpperCase() !== 'P') continue;
        const cid = match(r, R[2], R[3]);
        if (!cid) break;
        presences[`${cid}|ado|${d}|`] = 'P';
        ctx.children[cid].inscriptions.ado = true;
        report.presences += 1;
      }
    }
  }
  if (books.compta) {
    const rows = books.compta.sheets['général'].rows();
    const match = makeMatcher(ctx, 'Compta', report);
    const cols = [[10, 'pedibus-T1'], [13, 'pedibus-T2'], [16, 'pedibus-T3'], [20, 'mercredi-T1'], [23, 'mercredi-T2'], [26, 'mercredi-T3']];
    for (let r = 7; r < rows.length; r++) {
      const R = rows[r];
      if (!R || (!norm(R[1]) && !norm(R[2]))) continue;
      const amounts = cols.filter(([c]) => num(R[c]) > 0);
      if (!amounts.length) continue;
      const cid = match(r, R[1], R[2]);
      for (const [c, poste] of amounts) addReel(cid, poste, num(R[c]));
    }
  }
  const bank = new Map(); // childId -> [{mode, mois, montant}]
  if (books.cheque) {
    const rows = books.cheque.sheets['Remise chèque'].rows();
    const match = makeMatcher(ctx, 'Chèque-Banque', report);
    for (let r = 7; r < rows.length; r++) {
      const R = rows[r];
      if (!R || (!norm(R[1]) && !norm(R[2]))) continue;
      const items = [];
      for (let c = 5; c <= 23; c++) {
        const m = num(R[c]);
        if (m <= 0) continue;
        if (c <= 7) items.push({ mode: 'especes', mois: null, montant: m });
        else if (c === 8) items.push({ mode: 'carte', mois: null, montant: m });
        else items.push({ mode: 'cheque', mois: CHEQUE_MONTHS[c], montant: m });
      }
      if (!items.length) continue;
      const cid = match(r, R[1], R[2]);
      if (!cid) continue;
      if (!bank.has(cid)) bank.set(cid, []);
      bank.get(cid).push(...items);
    }
  }

  // Règlements : le montant de Chèque-Banque fait foi (c'est ce qui est réellement payé).
  // Compta et Vacances (« réel ») servent seulement à savoir ce que paie chaque règlement.
  // On raisonne par famille : ce sont les parents qui paient, pas l'enfant.
  const payments = {};
  let np = 0;
  const DATE0 = '2026-09-01';
  const famReel = new Map(), famBank = new Map();
  for (const [cid, list] of reel) {
    const f = ctx.children[cid].familyId;
    if (!famReel.has(f)) famReel.set(f, []);
    famReel.get(f).push(...list.map((x) => ({ ...x, childId: cid })));
  }
  for (const [cid, list] of bank) {
    const f = ctx.children[cid].familyId;
    if (!famBank.has(f)) famBank.set(f, []);
    famBank.get(f).push(...list);
  }
  for (const [familyId, items] of famBank) {
    const todo = (famReel.get(familyId) || []).map((x) => ({ ...x }));
    for (const cid of Object.keys(ctx.children)) {
      const c = ctx.children[cid];
      if (c.familyId === familyId && !c.adhesionDejaReglee && Object.values(c.inscriptions).some(Boolean)) todo.push({ poste: 'adhesion', montant: 5, childId: cid });
    }
    const R = round2((famReel.get(familyId) || []).reduce((t, x) => t + x.montant, 0));
    const K = round2(items.reduce((t, x) => t + x.montant, 0));
    if (Math.abs(R - K) > 0.005) report.ecarts.push(`${ctx.families[familyId].nom} : Compta ${R} € / Banque ${K} € (la banque fait foi)`);
    for (const it of items) {
      let left = it.montant;
      const aff = [];
      while (left > 0.005 && todo.length) {
        const take = Math.min(left, todo[0].montant);
        aff.push({ poste: todo[0].poste, montant: round2(take), childId: todo[0].childId });
        todo[0].montant = round2(todo[0].montant - take);
        left = round2(left - take);
        if (todo[0].montant <= 0.005) todo.shift();
      }
      if (left > 0.005) aff.push({ poste: 'a-repartir', montant: round2(left), childId: '' });
      payments[`p${++np}`] = {
        familyId, childId: '', date: DATE0, montant: round2(it.montant), mode: it.mode, numero: '', banque: '',
        nomCheque: '', commentaire: 'Repris de Chèque-Banque', affectations: aff, moisEncaissement: it.mois, remis: false, dateRemise: null,
      };
    }
  }
  for (const [familyId] of famReel) {
    if (famBank.has(familyId)) continue;
    const R = round2(famReel.get(familyId).reduce((t, x) => t + x.montant, 0));
    report.ecarts.push(`${ctx.families[familyId].nom} : Compta ${R} € / Banque 0 € (rien en banque : non repris)`);
  }
  report.children = Object.keys(ctx.children).length;
  report.families = Object.keys(ctx.families).length;
  report.payments = np;
  report.unmatched = [...new Set(report.unmatched)];
  const base = {
    schema: 1, year: '2026-2027', params: defaultParams2026(),
    families: ctx.families, children: ctx.children, presences, extraDates, payments,
  };
  // Jours habituels retrouvés d'après les présences déjà prévues dans Excel.
  for (const [id, plan] of Object.entries(derivePlanning(base))) base.children[id].planning = plan;
  report.plannings = Object.values(base.children).filter((c) => c.planning).length;
  return { base, report };
}
