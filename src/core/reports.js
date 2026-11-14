// Documents et statistiques : récap famille, attestation, mailings, CAF, bilan, carte.
import { familyAccount, familyChildren, presencesByChild, adhesionStatus, documentsManquants, isActive } from './billing.js';
import { groupAt, trimestreOf, VACANCES, activityDates } from './calendar.js';
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
    const rows = acc.postes.filter((r) => r.childId === cid && r.du > 0);
    if (!rows.length) continue;
    blocks.push([`DÉTAIL DES ACTIVITÉS — ${state.children[cid].prenom}`, ...rows.map(posteLine)].join('\n'));
  }
  if (blocks.length) lines.push(blocks.join('\n \n'));
  lines.push('', SEP, '');
  lines.push(`--- RÉSUMÉ GLOBAL FAMILLE ${f.nom} ---`);
  lines.push(`• Total dû pour la famille : ${euro(acc.du)}`);
  lines.push(`• Total déjà réglé par vos soins : ${euro(acc.regle)}`, '');
  if (Math.abs(acc.solde) < 0.005) lines.push('✅ Dossier complet : La famille est à jour de ses paiements.');
  else if (acc.solde > 0) lines.push(`💰 TROP-PERÇU : La famille a réglé ${euro(acc.solde)} de trop. Ce montant sera déduit de vos prochains frais.`);
  else lines.push(`⚠️ RESTE À PAYER : ► ${euro(-acc.solde)} ◄`);
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

export function mailingList(state, inscription, onlyAdherents = false, { anciens = false } = {}) {
  const seen = new Map();
  for (const [cid, c] of Object.entries(state.children)) {
    if (inscription && !(c.inscriptions || {})[inscription]) continue;
    if (onlyAdherents && adhesionStatus(state, cid) !== 'reglee') continue;
    const g = (c.groupes || []).at(-1);
    if (!anciens && g && g.groupe === 'Plus présent') continue;
    const f = state.families[c.familyId];
    for (const m of splitMails(f && f.mails)) if (!seen.has(m.toLowerCase())) seen.set(m.toLowerCase(), m);
  }
  return [...seen.values()].join('; ');
}

export function cafCategorie(child, iso, value) {
  if (value === 'KT') return 'KT';
  const g = groupAt(child, iso);
  return g === '3 ans' || g === '4-5 ans' ? '-6' : '6-11';
}

export function cafStats(state, fromIso, toIso) {
  const rows = new Map();
  const days = ['lundi', 'mardi', 'jeudi', 'vendredi'];
  const heures = state.params.cafHeures || {};
  for (const [k, v] of Object.entries(state.presences)) {
    if (!['P', 'KT'].includes(v)) continue; // la CAF compte les présences réelles
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
    } else if (act === 'mercredi' && v === 'P') {
      const cat = ageCat(c, date);
      if (!mercredi.has(cat)) mercredi.set(cat, { categorie: cat, matin: 0, aprem: 0, heures: 0 });
      const r = mercredi.get(cat); r[slot === 'aprem' ? 'aprem' : 'matin'] += 1;
      r.heures = round2(r.heures + (slot === 'aprem' ? (h.mercrediAprem || 0) : (h.mercrediMatin || 0)));
    } else if ((VACANCES.includes(act) || act === 'exceptionnel') && v === 'P') {
      const cat = ageCat(c, date);
      const key = `${act}|${cat}`;
      if (!vacances.has(key)) vacances.set(key, { periode: act, categorie: cat, jours: 0, heures: 0 });
      const r = vacances.get(key); r.jours += 1; r.heures = round2(r.heures + (h.vacancesJournee || 0));
    } else if (act === 'ado' && v === 'P') {
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
  const texte = `Je soussigné ${a.tresorier}, trésorier de l’association « Jeunes de Saint Médard », certifie que ${c.prenom} ${f.nom} a participé aux activités de l’accueil de loisirs sans hébergement (habilité sous le numéro ${a.habilitation}) de la Maison des Jeunes de Saint Médard durant l'année ${annee}.`;
  const recuTexte = `L’association « Jeunes de Saint Médard » a reçu de la part de M/Mme ${f.nomCheque || f.nom} une participation financière de ${euro(total)}.\nLe montant a été acquitté.\n\nA valoir ce que de droit.`;
  return { texte, lignes: rows, total, recuTexte, agrement: a.agrement || '', date: dateFr(todayIso), nom: `${c.prenom} ${f.nom}` };
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
        if (e.value === 'KT') { out.pedibus[n].kt += 1; out.pedibus[n].prevu += t.kt; }
        else if (e.value === 'P' || e.value === 'A') { out.pedibus[n].jours += 1; out.pedibus[n].prevu += t.pedibus; }
      } else if (e.activity === 'mercredi' && (e.value === 'P' || e.value === 'A')) {
        const n = trimestreOf(state.params, e.date);
        if (n) { out.mercredi[n].jours += 1; out.mercredi[n].prevu += t.mercredi; }
      } else if (out.vacances[e.activity] && (e.value === 'P' || e.value === 'A')) {
        out.vacances[e.activity].jours += 1;
        out.vacances[e.activity].prevu += e.activity === 'exceptionnel' ? t.exceptionnel : t.journee;
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
    if (f.adresse) liens.push({ childId: id, nom: `${f.nom} ${c.prenom}`, adresse: f.adresse, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.adresse)}` });
  }
  const sortN = (m, key) => [...m.entries()].map(([k, n]) => ({ [key]: k, n })).sort((a, b) => b.n - a.n);
  return { parCodePostal: sortN(cps, 'cp'), parEcole: sortN(ecoles, 'ecole'), liens };
}
