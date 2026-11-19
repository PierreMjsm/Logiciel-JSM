// Documents et statistiques : récap famille, attestation, mailings, CAF, bilan, carte.
import { familyAccount, familyChildren, presencesByChild, adhesionStatus, documentsManquants, isActive, posteLabel } from './billing.js';
import { nomEnfant } from './noms.js';
import { groupAt, trimestreOf, VACANCES, activityDates, tarifAt } from './calendar.js';
import { euro, dateFr, dayName, round2 } from './format.js';

const SEP = '________________________________________';

function posteLine(r) {
  if (r.poste === 'adhesion') return `• Adhésion obligatoire (${String(r.du).replace('.', ',')} € par enfant) : dû ${euro(r.du)}`;
  let detail;
  if (r.poste.startsWith('mercredi')) detail = `${r.jours} ½ j.`;
  else if (r.poste.startsWith('pedibus')) detail = [r.jours ? `${r.jours} j.` : '', r.ktJours ? `${r.ktJours} j. caté` : '', r.cJours ? `${r.cJours} j. collégien` : ''].filter(Boolean).join(' + ');
  else detail = `${r.jours} j.`;
  const half = r.demiTarif ? ` dont ${r.demiTarif} à demi-tarif` : '';
  return `• ${r.label} (${detail}${half}) : dû ${euro(r.du)}`;
}

export function recapText(state, familyId, todayIso) {
  const f = state.families[familyId];
  const acc = familyAccount(state, familyId, todayIso);
  const lines = [];
  lines.push(`Bonjour M. / Mme ${f.nom},`, '');
  lines.push(`Voici le récapitulatif de situation pour vos enfants au ${dateFr(todayIso)} pour l'année scolaire ${state.year}.`);
  lines.push('(Le tarif réduit de 50 % pour le 3e enfant présent le même jour est déjà appliqué. L\'adhésion de 5 € figure dans le détail ci-dessous.)');
  lines.push(SEP);
  const blocks = [];
  for (const cid of familyChildren(state, familyId)) {
    const rows = acc.postes.filter((r) => r.childId === cid && r.du > 0 && r.commence);
    if (!rows.length) continue;
    blocks.push([`DÉTAIL DES ACTIVITÉS — ${state.children[cid].prenom}`, ...rows.map(posteLine)].join('\n'));
  }
  if (blocks.length) lines.push(blocks.join('\n \n'));
  lines.push('', SEP, '');
  lines.push(`--- RÉSUMÉ GLOBAL FAMILLE ${f.nom} ---`);
  lines.push(`• Total dû à ce jour pour la famille : ${euro(acc.duMaintenant)}`);
  lines.push(`• Total déjà réglé par vos soins : ${euro(acc.regle)}`, '');
  if (Math.abs(acc.soldeMaintenant) < 0.005) lines.push('✅ Dossier complet : La famille est à jour de ses paiements.');
  else if (acc.soldeMaintenant > 0) lines.push(`💰 TROP-PERÇU : La famille a réglé ${euro(acc.soldeMaintenant)} de plus que ce qui est dû à ce jour. Ce montant sera déduit de vos prochains frais.`);
  else lines.push(`⚠️ RESTE À PAYER : ► ${euro(-acc.soldeMaintenant)} ◄`);
  const docs = familyChildren(state, familyId).filter((cid) => isActive(state, cid))
    .map((cid) => [state.children[cid].prenom, documentsManquants(state, cid)]).filter(([, m]) => m.length);
  if (docs.length) lines.push('', `📄 Documents à nous fournir : ${docs.map(([p, m]) => `${p} : ${m.join(', ')}`).join(' ; ')}`);
  lines.push('');
  lines.push("N'hésitez pas à regarder de votre côté et à nous contacter si vous avez la moindre question. De notre côté, nous restons humains et pouvons tout à fait nous tromper : l'essentiel pour nous est de rectifier le tir ensemble, peu importe qui a commis l'erreur.");
  lines.push('', 'Belle Journée,', 'Katell et Pierre — Les Jeunes de Saint-Médard');
  return lines.join('\n');
}

// Libellé de famille : le nom, suivi d'un repère (mail ou téléphone) quand plusieurs familles portent ce nom.
export function familyLabels(state) {
  const count = new Map();
  for (const f of Object.values(state.families)) count.set(f.nom, (count.get(f.nom) || 0) + 1);
  const out = {};
  for (const [id, f] of Object.entries(state.families)) {
    const hint = splitMails(f.mails)[0] || f.telMaman || f.telPapa || f.adresse || id;
    out[id] = count.get(f.nom) > 1 ? `${f.nom} (${hint})` : f.nom;
  }
  return out;
}

export function mailtoUrl(to, subject, body) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function splitMails(s) {
  return String(s || '').split(/[;,\s]+/).map((x) => x.trim()).filter((x) => x.includes('@'));
}

export function mailingList(state, inscription, onlyAdherents = false, { anciens = false, groupe = '', today = null } = {}) {
  const seen = new Map();
  for (const [cid, c] of Object.entries(state.children)) {
    if (inscription && !(c.inscriptions || {})[inscription]) continue;
    if (onlyAdherents && adhesionStatus(state, cid) !== 'reglee') continue;
    const g = (c.groupes || []).at(-1);
    if (!anciens && g && g.groupe === 'Plus présent') continue;
    if (groupe && groupAt(c, today || new Date().toISOString().slice(0, 10)) !== groupe) continue;
    const f = state.families[c.familyId];
    for (const m of splitMails(f && f.mails)) if (!seen.has(m.toLowerCase())) seen.set(m.toLowerCase(), m);
  }
  return [...seen.values()].join('; ');
}

// Pour la CAF, un jour payé compte : présences (P, KT, C) et absences facturées (A, AKT).
export const CAF_VALUES = ['P', 'A', 'KT', 'AKT', 'C'];

export function cafCategorie(child, iso, value) {
  if (value === 'KT' || value === 'AKT') return 'KT';
  const g = groupAt(child, iso);
  return g === '3 ans' || g === '4-5 ans' ? '-6' : '6-11';
}

export function cafStats(state, fromIso, toIso) {
  const rows = new Map();
  const days = ['lundi', 'mardi', 'jeudi', 'vendredi'];
  const heures = state.params.cafHeures || {};
  for (const [k, v] of Object.entries(state.presences)) {
    if (!CAF_VALUES.includes(v) || v === 'C') continue; // jours payés (présences et absences facturées)
    const [cid, act, date] = k.split('|');
    if (act !== 'pedibus' || date < fromIso || date > toIso) continue;
    const c = state.children[cid];
    if (!c) continue;
    const ecole = c.ecole || 'AUTRE';
    const cat = cafCategorie(c, date, v);
    const day = dayName(date);
    const key = `${ecole}|${cat}`;
    if (!rows.has(key)) rows.set(key, { ecole, categorie: cat, byDay: Object.fromEntries(days.map((d) => [d, { presences: 0, heures: 0 }])), totalPresences: 0, totalHeures: 0 });
    const r = rows.get(key);
    const h = ((heures[ecole] || {})[cat] || {})[day] || 0;
    if (!r.byDay[day]) continue;
    r.byDay[day].presences += 1;
    r.byDay[day].heures = round2(r.byDay[day].heures + h);
    r.totalPresences += 1;
    r.totalHeures = round2(r.totalHeures + h);
  }
  const order = state.params.ecoles;
  const catOrder = ['KT', '-6', '6-11'];
  return [...rows.values()].sort((a, b) => (order.indexOf(a.ecole) - order.indexOf(b.ecole)) || (catOrder.indexOf(a.categorie) - catOrder.indexOf(b.categorie)));
}

// Détail CAF par activité, séparé : la CAF raisonne en heures de présence.
export function cafDetail(state, fromIso, toIso) {
  const h = state.params.cafAutres || {};
  const collegiensPedibus = new Map(), mercredi = new Map(), vacances = new Map(), ado = new Map();
  const ageCat = (c, date) => { const g = groupAt(c, date); return g === '3 ans' || g === '4-5 ans' ? '-6' : g === 'Collégiens' ? 'Collégiens' : '6-11'; };
  for (const [k, v] of Object.entries(state.presences)) {
    const [cid, act, date, slot] = k.split('|');
    if (date < fromIso || date > toIso) continue;
    const c = state.children[cid];
    if (!c) continue;
    if (act === 'pedibus' && v === 'C') {
      const e = c.ecole || 'AUTRE';
      if (!collegiensPedibus.has(e)) collegiensPedibus.set(e, { ecole: e, presences: 0, heures: 0 });
      const r = collegiensPedibus.get(e); r.presences += 1; r.heures = round2(r.heures + (h.collegienPedibus || 0));
    } else if (act === 'mercredi' && CAF_VALUES.includes(v)) {
      const cat = ageCat(c, date);
      if (!mercredi.has(cat)) mercredi.set(cat, { categorie: cat, matin: 0, aprem: 0, heures: 0 });
      const r = mercredi.get(cat); r[slot === 'aprem' ? 'aprem' : 'matin'] += 1;
      r.heures = round2(r.heures + (slot === 'aprem' ? (h.mercrediAprem || 0) : (h.mercrediMatin || 0)));
    } else if ((VACANCES.includes(act) || act === 'exceptionnel') && CAF_VALUES.includes(v)) {
      const cat = ageCat(c, date);
      const key = `${act}|${cat}`;
      if (!vacances.has(key)) vacances.set(key, { periode: act, categorie: cat, jours: 0, heures: 0 });
      const r = vacances.get(key); r.jours += 1; r.heures = round2(r.heures + (h.vacancesJournee || 0));
    } else if (act === 'ado' && CAF_VALUES.includes(v)) {
      if (!ado.has(date)) ado.set(date, { date, presences: 0, heures: 0 });
      const r = ado.get(date); r.presences += 1; r.heures = round2(r.heures + (h.adoSoiree || 0));
    }
  }
  const cats = ['-6', '6-11', 'Collégiens'];
  const order = [...VACANCES, 'exceptionnel'];
  return {
    collegiensPedibus: [...collegiensPedibus.values()].sort((a, b) => a.ecole.localeCompare(b.ecole)),
    mercredi: [...mercredi.values()].sort((a, b) => cats.indexOf(a.categorie) - cats.indexOf(b.categorie)),
    vacances: [...vacances.values()].sort((a, b) => order.indexOf(a.periode) - order.indexOf(b.periode) || cats.indexOf(a.categorie) - cats.indexOf(b.categorie)),
    ado: [...ado.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

// Heures d'une présence (mêmes règles que la CAF).
export function presenceHours(state, child, act, date, slot, value) {
  const h = state.params.cafAutres || {};
  const g = groupAt(child, date);
  const coll = value === 'C' || g === 'Collégiens';
  if (act === 'pedibus') {
    if (coll) return h.collegienPedibus || 0;
    const cat = value === 'KT' || value === 'AKT' ? 'KT' : g === '3 ans' || g === '4-5 ans' ? '-6' : '6-11';
    return (((state.params.cafHeures || {})[child.ecole || 'AUTRE'] || {})[cat] || {})[dayName(date)] || 0;
  }
  if (act === 'mercredi') return slot === 'aprem' ? (h.mercrediAprem || 0) : (h.mercrediMatin || 0);
  if (act === 'collegiens') return h.vacancesCollegiensJournee ?? h.vacancesJournee ?? 0;
  if (act === 'ado') return h.adoSoiree || 0;
  return h.vacancesJournee || 0;
}

// Synthèse CAF : heures par activité et par tranche (-6 ans, 6 ans et +, collégiens).
// Un jour payé compte : présences (P, KT, C) et absences facturées (A, AKT).
export function cafSynthese(state, fromIso, toIso) {
  const h = state.params.cafAutres || {};
  const heuresPed = state.params.cafHeures || {};
  const rows = new Map();
  const order = ['pedibus', 'mercredi', ...VACANCES.filter((v) => v !== 'collegiens'), 'exceptionnel', 'collegiens', 'ado'];
  const labels = { pedibus: 'Pédibus (et KT)', mercredi: 'Mercredis', exceptionnel: 'Journées exceptionnelles', collegiens: 'Vacances collégiens', ado: 'Soirées ADO (collégiens)' };
  for (const v of VACANCES) if (v !== 'collegiens') labels[v] = `Vacances ${v === 'noel' ? 'Noël' : v === 'aout' ? 'Août' : v[0].toUpperCase() + v.slice(1)}`;
  const empty = () => ({ presences: 0, heures: 0 });
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { id, label: labels[id] || id, moins6: empty(), plus6: empty(), collegiens: empty(), total: empty() });
    return rows.get(id);
  };
  const add = (id, col, hrs) => { const r = row(id); r[col].presences += 1; r[col].heures = round2(r[col].heures + hrs); r.total.presences += 1; r.total.heures = round2(r.total.heures + hrs); };
  for (const [k, v] of Object.entries(state.presences)) {
    if (!CAF_VALUES.includes(v)) continue;
    const [cid, act, date, slot] = k.split('|');
    if (date < fromIso || date > toIso) continue;
    const c = state.children[cid];
    if (!c || !order.includes(act)) continue;
    const g = groupAt(c, date);
    const col = v === 'C' || g === 'Collégiens' ? 'collegiens' : g === '3 ans' || g === '4-5 ans' ? 'moins6' : 'plus6';
    const hrs = presenceHours(state, c, act, date, slot, v);
    add(act, col, hrs);
  }
  const out = order.filter((id) => rows.has(id)).map((id) => rows.get(id));
  const tot = { id: 'total', label: 'Total', moins6: empty(), plus6: empty(), collegiens: empty(), total: empty() };
  for (const r of out) for (const col of ['moins6', 'plus6', 'collegiens', 'total']) { tot[col].presences += r[col].presences; tot[col].heures = round2(tot[col].heures + r[col].heures); }
  return [...out, tot];
}

// Attestation de présence (pour l'employeur ou le comité d'entreprise des parents).
const ACT_LABEL = { pedibus: 'Pédibus', mercredi: 'Mercredis', exceptionnel: 'Journées exceptionnelles', ado: 'Soirées ADO', collegiens: 'Vacances collégiens' };
export function attestationPresence(state, childId, fromIso, toIso, todayIso) {
  const c = state.children[childId];
  const f = state.families[c.familyId] || {};
  const a = state.params.attestation || {};
  const order = ['pedibus', 'mercredi', ...VACANCES, 'exceptionnel', 'ado'];
  const per = new Map();
  const postes = new Set();
  for (const e of presencesByChild(state).get(childId) || []) {
    if (!['P', 'KT', 'C'].includes(e.value) || e.date < fromIso || e.date > toIso || !order.includes(e.activity)) continue;
    if (!per.has(e.activity)) per.set(e.activity, new Map());
    const days = per.get(e.activity);
    if (!days.has(e.date)) days.set(e.date, { slots: [], heures: 0 });
    const d = days.get(e.date);
    d.slots.push(e.slot);
    d.heures = round2(d.heures + presenceHours(state, c, e.activity, e.date, e.slot, e.value));
    const t = trimestreOf(state.params, e.date);
    if (e.activity === 'pedibus' || e.activity === 'mercredi') { if (t) postes.add(`${e.activity}-T${t}`); }
    else if (e.activity !== 'ado') postes.add(e.activity);
  }
  const lignes = order.filter((k) => per.has(k)).map((k) => {
    const days = [...per.get(k).entries()].sort(([x], [y]) => (x < y ? -1 : 1));
    const label = ACT_LABEL[k] || `Vacances ${({ noel: 'Noël', aout: 'Août' })[k] || k[0].toUpperCase() + k.slice(1)}`;
    return {
      activite: k, label,
      dates: days.map(([d, v]) => `${dayName(d)} ${dateFr(d)}${k === 'mercredi' ? (v.slots.length > 1 ? ' (journée)' : v.slots[0] === 'aprem' ? ' (après-midi)' : ' (matin)') : ''}`),
      jours: days.length,
      heures: round2(days.reduce((t, [, v]) => t + v.heures, 0)),
    };
  });
  const regle = new Map();
  for (const p of Object.values(state.payments || {})) {
    if (p.familyId !== c.familyId) continue;
    for (const af of p.affectations || []) {
      if ((af.childId || p.childId) !== childId || !postes.has(af.poste)) continue;
      regle.set(af.poste, round2((regle.get(af.poste) || 0) + Number(af.montant || 0)));
    }
  }
  const POSTE_ORDER = ['pedibus-T1', 'pedibus-T2', 'pedibus-T3', 'mercredi-T1', 'mercredi-T2', 'mercredi-T3', ...VACANCES, 'exceptionnel'];
  const montants = [...regle.entries()].sort(([x], [y]) => POSTE_ORDER.indexOf(x) - POSTE_ORDER.indexOf(y))
    .map(([poste, montant]) => ({ poste, label: posteLabel(poste), montant }));
  const nom = `${c.prenom} ${nomEnfant(state, c)}`.trim();
  const texte = `Je soussigné(e) ${a.tresorier || '…'}, trésorier de l’association « Jeunes de Saint Médard », atteste que l’enfant ${nom}${c.naissance ? `, né(e) le ${dateFr(c.naissance)}` : ''}, a fréquenté l’accueil de loisirs sans hébergement de la Maison des Jeunes de Saint Médard (habilité sous le numéro ${a.habilitation || '…'}) du ${dateFr(fromIso)} au ${dateFr(toIso)}, selon le détail ci-dessous.`;
  return {
    nom, famille: f.nom || '', lignes, montants, texte, date: dateFr(todayIso),
    totalJours: lignes.reduce((t, l) => t + l.jours, 0),
    totalHeures: round2(lignes.reduce((t, l) => t + l.heures, 0)),
    totalRegle: round2(montants.reduce((t, m) => t + m.montant, 0)),
  };
}

export function toCsv(columns, rows) {
  const cell = (v) => {
    const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '\ufeff' + [columns.map((c) => cell(c.label)).join(';'), ...rows.map((r) => columns.map((c) => cell(c.get(r))).join(';'))].join('\r\n');
}

export function attestation(state, { childId, lignes }, todayIso) {
  const c = state.children[childId];
  const f = state.families[c.familyId];
  const a = state.params.attestation;
  const rows = lignes.map((l) => ({ ...l, total: round2((Number(l.quantite) || 0) * (Number(l.prix) || 0)) }));
  const total = round2(rows.reduce((s, r) => s + r.total, 0));
  const annee = todayIso.slice(0, 4);
  const texte = `Je soussigné ${a.tresorier}, trésorier de l’association « Jeunes de Saint Médard », certifie que ${c.prenom} ${nomEnfant(state, c)} a participé aux activités de l’accueil de loisirs sans hébergement (habilité sous le numéro ${a.habilitation}) de la Maison des Jeunes de Saint Médard durant l'année ${annee}.`;
  const recuTexte = `L’association « Jeunes de Saint Médard » a reçu de la part de M/Mme ${f.nomCheque || f.nom} une participation financière de ${euro(total)}.\nLe montant a été acquitté.\n\nA valoir ce que de droit.`;
  return { texte, lignes: rows, total, recuTexte, agrement: a.agrement || '', date: dateFr(todayIso), nom: `${c.prenom} ${nomEnfant(state, c)}` };
}

export function bilan(state, todayIso) {
  const out = { pedibus: {}, mercredi: {}, vacances: {}, adherents: 0, enfantsActifs: 0, moyennes: {} };
  for (const n of [1, 2, 3]) { out.pedibus[n] = { jours: 0, kt: 0, prevu: 0, regle: 0 }; out.mercredi[n] = { jours: 0, prevu: 0, regle: 0 }; }
  for (const v of [...VACANCES, 'exceptionnel']) out.vacances[v] = { jours: 0, prevu: 0, regle: 0 };
  const t = state.params.tarifs;
  for (const [cid, c] of Object.entries(state.children)) {
    if (adhesionStatus(state, cid) === 'reglee') out.adherents += 1;
    const g = (c.groupes || []).at(-1);
    if (!g || g.groupe !== 'Plus présent') out.enfantsActifs += 1;
  }
  for (const list of presencesByChild(state).values()) {
    for (const e of list) {
      if (e.activity === 'pedibus') {
        const n = trimestreOf(state.params, e.date);
        if (!n) continue;
        if (e.value === 'KT' || e.value === 'AKT') { out.pedibus[n].kt += 1; out.pedibus[n].prevu += tarifAt(state.params, 'kt', e.date); }
        else if (e.value === 'P' || e.value === 'A') { out.pedibus[n].jours += 1; out.pedibus[n].prevu += tarifAt(state.params, 'pedibus', e.date); }
      } else if (e.activity === 'mercredi' && (e.value === 'P' || e.value === 'A')) {
        const n = trimestreOf(state.params, e.date);
        if (n) { out.mercredi[n].jours += 1; out.mercredi[n].prevu += tarifAt(state.params, 'mercredi', e.date); }
      } else if (out.vacances[e.activity] && (e.value === 'P' || e.value === 'A')) {
        out.vacances[e.activity].jours += 1;
        out.vacances[e.activity].prevu += tarifAt(state.params, e.activity === 'exceptionnel' ? 'exceptionnel' : 'journee', e.date);
      }
    }
  }
  for (const p of Object.values(state.payments || {})) {
    for (const a of p.affectations || []) {
      const m = /^(pedibus|mercredi)-T(\d)$/.exec(a.poste);
      if (m) out[m[1]][m[2]].regle += Number(a.montant) || 0;
      else if (out.vacances[a.poste]) out.vacances[a.poste].regle += Number(a.montant) || 0;
    }
  }
  const pedDays = activityDates(state.params, 'pedibus').filter((d) => d <= todayIso).length;
  const merDays = activityDates(state.params, 'mercredi').filter((d) => d <= todayIso).length;
  let totPed = 0, totMer = 0;
  for (const list of presencesByChild(state).values()) {
    for (const e of list) {
      if (e.date > todayIso || !['P', 'KT'].includes(e.value)) continue;
      if (e.activity === 'pedibus') totPed += 1;
      else if (e.activity === 'mercredi') totMer += 1;
    }
  }
  out.moyennes = { pedibusParJour: pedDays ? round2(totPed / pedDays) : 0, mercrediParDemiJournee: merDays ? round2(totMer / (merDays * 2)) : 0 };
  for (const g of [out.pedibus, out.mercredi, out.vacances]) for (const k of Object.keys(g)) { g[k].prevu = round2(g[k].prevu); g[k].regle = round2(g[k].regle); }

  return out;
}

export function carte(state) {
  const cps = new Map(), ecoles = new Map(), liens = [];
  for (const [id, c] of Object.entries(state.children)) {
    const g = (c.groupes || []).at(-1);
    if (g && g.groupe === 'Plus présent') continue;
    const f = state.families[c.familyId] || {};
    const m = /\b(\d{5})\b/.exec(f.adresse || '');
    if (m) cps.set(m[1], (cps.get(m[1]) || 0) + 1);
    if (c.ecole) ecoles.set(c.ecole, (ecoles.get(c.ecole) || 0) + 1);
    if (f.adresse) liens.push({ childId: id, nom: `${nomEnfant(state, c)} ${c.prenom}`, adresse: f.adresse, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.adresse)}` });
  }
  const sortN = (m, key) => [...m.entries()].map(([k, n]) => ({ [key]: k, n })).sort((a, b) => b.n - a.n);
  return { parCodePostal: sortN(cps, 'cp'), parEcole: sortN(ecoles, 'ecole'), liens };
}

// Compte rendu d'une année (à imprimer ou garder) : effectifs, activités, heures CAF, compta.
const MODE_LABELS = { cheque: 'Chèque', especes: 'Espèces', carte: 'Carte', virement: 'Virement', inconnu: 'À préciser' };
export function compteRendu(state, todayIso) {
  const p = state.params;
  const actifs = Object.keys(state.children).filter((cid) => isActive(state, cid));
  const parGroupe = new Map();
  for (const cid of actifs) {
    const g = (state.children[cid].groupes || [])[0]?.groupe || '—';
    parGroupe.set(g, (parGroupe.get(g) || 0) + 1);
  }
  const familles = new Set(actifs.map((cid) => state.children[cid].familyId));
  const labels = familyLabels(state);
  const acts = new Map();
  const actOf = (poste) => {
    const m = /^(pedibus|mercredi)-T\d$/.exec(poste);
    if (m) return m[1] === 'pedibus' ? ['pedibus', 'Pédibus'] : ['mercredi', 'Mercredis'];
    if (poste === 'adhesion') return ['adhesion', 'Adhésions'];
    return [poste, posteLabel(poste)];
  };
  let du = 0;
  const impayes = [], tropPercus = [];
  for (const fid of Object.keys(state.families)) {
    const a = familyAccount(state, fid, todayIso);
    du += a.du;
    for (const r of a.postes) {
      if (r.poste === 'a-repartir') continue;
      const [k, label] = actOf(r.poste);
      if (!acts.has(k)) acts.set(k, { id: k, label, jours: 0, du: 0, regle: 0 });
      const x = acts.get(k);
      x.jours += r.poste === 'adhesion' ? (r.du > 0 || r.regle > 0 ? 1 : 0) : (r.jours || 0) + (r.ktJours || 0) + (r.cJours || 0);
      x.du = round2(x.du + r.du);
      x.regle = round2(x.regle + r.regle);
    }
    if (a.soldeMaintenant < -0.005) impayes.push({ familyId: fid, famille: labels[fid], montant: round2(-a.soldeMaintenant) });
    else if (a.soldeMaintenant > 0.005) tropPercus.push({ familyId: fid, famille: labels[fid], montant: round2(a.soldeMaintenant) });
  }
  const parMode = new Map();
  let regle = 0;
  for (const pay of Object.values(state.payments || {})) {
    const m = Number(pay.montant) || 0;
    regle += m;
    const l = MODE_LABELS[pay.mode] || pay.mode || '—';
    parMode.set(l, round2((parMode.get(l) || 0) + m));
  }
  const starts = p.periods.map((x) => x.start).sort();
  const ends = p.periods.map((x) => x.end).sort();
  const byName = (a, b) => a.famille.localeCompare(b.famille, 'fr');
  return {
    annee: state.year,
    date: dateFr(todayIso),
    effectifs: { enfants: actifs.length, familles: familles.size, adherents: actifs.filter((cid) => adhesionStatus(state, cid) === 'reglee').length, parGroupe: [...parGroupe.entries()].sort(([a], [b]) => { const o = (g) => { const i = (p.groupes || []).indexOf(g); return i < 0 ? 99 : i; }; return o(a) - o(b); }) },
    activites: [...acts.values()],
    caf: cafSynthese(state, starts[0], ends.at(-1)),
    compta: { du: round2(du), regle: round2(regle), impayes: impayes.sort(byName), tropPercus: tropPercus.sort(byName), parMode: [...parMode.entries()] },
  };
}

// Familles dont un enfant inscrit a un dossier incomplet (documents manquants).
export function familiesDossierIncomplet(state, today) {
  const out = new Map();
  for (const [cid, c] of Object.entries(state.children)) {
    if (!isActive(state, cid)) continue;
    const g = (c.groupes || []).filter((x) => !x.from || x.from <= today).at(-1);
    if (g && g.groupe === 'Plus présent') continue;
    const manque = documentsManquants(state, cid);
    if (!manque.length) continue;
    if (!out.has(c.familyId)) out.set(c.familyId, { familyId: c.familyId, enfants: [] });
    out.get(c.familyId).enfants.push({ id: cid, prenom: c.prenom, manque });
  }
  const labels = familyLabels(state);
  return [...out.values()].map((f) => ({ ...f, label: labels[f.familyId] })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

// Mail de rappel des documents manquants (relu et envoyé par l'équipe).
export function rappelDossierText(state, familyId, today) {
  const f = familiesDossierIncomplet(state, today).find((x) => x.familyId === familyId);
  const fam = state.families[familyId] || {};
  const lines = ['Bonjour,', '', `Pour compléter le dossier de votre famille (${fam.nom || ''}) aux Jeunes de Saint-Médard, il nous manque :`, ''];
  for (const e of (f ? f.enfants : [])) lines.push(`• ${e.prenom} : ${e.manque.join(', ')}`);
  lines.push('', 'Vous pouvez nous les transmettre en répondant à ce mail (photo ou scan), ou les déposer à l\'accueil.',
    'Si vous nous les avez déjà donnés, merci de nous le signaler : nous avons pu faire une erreur de saisie, et nous vous prions de nous en excuser.',
    '', 'Merci beaucoup,', 'L\'équipe des Jeunes de Saint-Médard');
  return lines.join('\n');
}
