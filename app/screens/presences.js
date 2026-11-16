// Grille de présence : enfants × dates, saisie au clic ou au clavier.
import { h, clear, debounce, select, modal, toast, todayIso, confirmBox } from '../ui.js';
import { activityDates, slotsOf, ktDay, groupAt, trimestreOf, VACANCES, VACANCES_LABELS, ageLabel } from '../../src/core/calendar.js';
import { dateFr, weekday, euro } from '../../src/core/format.js';
import { pathKey } from '../../src/core/store.js';
import { planningFields, applyPlanning, fillDialog } from '../planning-ui.js';
import { openChild } from './enfants.js';
import { openQuickPayment } from './reglements.js';
import { posteDeLActivite, resteDuPoste, posteLabel } from '../../src/core/billing.js';
import { fill } from '../ui.js';
import { nomEnfant } from '../../src/core/noms.js';

const ACTS = [
  ['pedibus', 'Pédibus'], ['mercredi', 'Mercredi'],
  ...VACANCES.map((v) => [v, `Vacances ${VACANCES_LABELS[v]}`]),
  ['exceptionnel', 'Journées exceptionnelles'], ['ado', 'Soirées ADO'],
];
const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const SLOT_LABEL = { matin: 'Matin', aprem: 'A-midi', '': '' };

function inscribed(c, act) {
  const i = c.inscriptions || {};
  if (act === 'pedibus') return i.pedibus || i.ktMardi || i.ktJeudi;
  return !!i[act];
}

export function render(root, ctx) {
  const s0 = ctx.store.get();
  const today = todayIso();
  const me = ctx.store.whoami();
  const v = {
    act: ctx.params.activity || 'pedibus',
    tri: trimestreOf(s0.params, today) || 1,
    q: '', ecole: '', groupe: '', sort: 'nom',
  };
  let cols = [];      // [{date, slot}]
  let rows = [];      // [{id, label, c, groupe}]
  let sel = null;     // {r, c}
  const wrap = h('div', { class: 'pgrid-wrap', tabindex: '0' });
  const info = h('span', { class: 'muted' });
  const extraTools = h('span', { class: 'tools' });

  const valueOf = (s, cid, col) => s.presences[`${cid}|${v.act}|${col.date}|${col.slot}`] || '';
  const cycle = (cur, col, cid) => {
    const st = ctx.store.get();
    const coll = v.act === 'pedibus' && groupAt(st.children[cid], col.date) === 'Collégiens';
    const seq = coll ? ['', 'C', 'A'] : ['', 'P', 'A'];
    if (!coll && v.act === 'pedibus' && ktDay(st.params, col.date)) seq.push('KT', 'AKT');
    const i = seq.indexOf(cur);
    return seq[(i + 1) % seq.length] ?? '';
  };

  function computeCols(s) {
    const dates = activityDates(s.params, v.act, s.extraDates || {})
      .filter((d) => (v.act === 'pedibus' || v.act === 'mercredi') ? trimestreOf(s.params, d) === v.tri : true);
    return dates.flatMap((date) => slotsOf(v.act).map((slot) => ({ date, slot })));
  }

  function computeRows(s) {
    const shown = new Set(cols.map((c) => c.date));
    const marked = new Set();
    for (const k of Object.keys(s.presences)) {
      const [cid, act, date] = k.split('|');
      if (act === v.act && shown.has(date)) marked.add(cid);
    }
    const out = [];
    for (const [id, c] of Object.entries(s.children)) {
      const g = groupAt(c, cols[0]?.date || today);
      if (!marked.has(id) && (!inscribed(c, v.act) || g === 'Plus présent')) continue;
      const label = `${nomEnfant(s, c)} ${c.prenom}${c.pai ? ' *' : ''}`.trim();
      if (v.q && !label.toLowerCase().includes(v.q)) continue;
      if (v.ecole && c.ecole !== v.ecole) continue;
      if (v.groupe && g !== v.groupe) continue;
      out.push({ id, label, c, groupe: g, nom: nomEnfant(s, c) });
    }
    const gi = (g) => s.params.groupes.indexOf(g);
    out.sort((a, b) => (v.sort === 'groupe' ? gi(a.groupe) - gi(b.groupe) : 0)
      || (v.sort === 'ecole' ? (a.c.ecole || '').localeCompare(b.c.ecole || '') : 0)
      || a.label.localeCompare(b.label, 'fr'));
    return out;
  }

  function recentClass(s, key) {
    const w = s._lastWriter && s._lastWriter[pathKey(['presences', key])];
    return w && w.dev !== me.device && Date.now() - new Date(w.t) < 60000 ? ' recent' : '';
  }

  function cellClass(s, cid, col) {
    const val = valueOf(s, cid, col);
    const key = `${cid}|${v.act}|${col.date}|${col.slot}`;
    return `c${val ? ` v-${val}` : ''}${col.weekStart ? ' week-start' : ''}${recentClass(s, key)}`;
  }

  function countsRows(s) {
    const groups = [...new Set(rows.map((r) => r.groupe))].sort((a, b) => s.params.groupes.indexOf(a) - s.params.groupes.indexOf(b));
    const line = (label, filter) => h('tr', { class: 'count' }, h('td', { class: 'name' }, label),
      cols.map((col, ci) => h('td', { 'data-ci': ci, 'data-g': label }, String(rows.filter(filter).filter((r) => ['P', 'KT', 'C'].includes(valueOf(s, r.id, col))).length || ''))));
    return [...groups.map((g) => line(g, (r) => r.groupe === g)), line('Total présents', () => true)];
  }

  function refreshCounts() {
    const s = ctx.store.get();
    const tbody = wrap.querySelector('tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr.count').forEach((tr) => tr.remove());
    const first = tbody.firstChild;
    countsRows(s).forEach((tr) => tbody.insertBefore(tr, first));
  }

  function draw() {
    const s = ctx.store.get();
    cols = computeCols(s);
    let prevWeek = null;
    cols.forEach((c) => {
      const wk = isoWeek(c.date);
      c.weekStart = prevWeek !== null && wk !== prevWeek && c.slot !== 'aprem';
      prevWeek = wk;
    });
    rows = computeRows(s);
    const twoRows = v.act === 'mercredi';
    const dateCells = [];
    const seen = new Set();
    for (const c of cols) {
      if (seen.has(c.date)) continue;
      seen.add(c.date);
      const span = cols.filter((x) => x.date === c.date).length;
      const kt = v.act === 'pedibus' && ktDay(s.params, c.date);
      dateCells.push(h('th', {
        colspan: span, 'data-date': c.date, class: c.weekStart ? 'week-start' : null,
        title: `${dateFr(c.date)}${kt ? ' — jour de KT' : ''} · clic droit : remplir la colonne`,
        oncontextmenu: (e) => { e.preventDefault(); columnMenu(c.date); },
        style: c.date === today ? { background: '#dbe8f7', color: '#154677' } : null,
      }, `${JOURS[weekday(c.date)]} ${c.date.slice(8, 10)}/${c.date.slice(5, 7)}${kt ? ' ⛪' : ''}`));
    }
    const thead = h('thead', {},
      h('tr', {}, h('th', { class: 'name', rowspan: twoRows ? 2 : 1 }, `${rows.length} enfant${rows.length > 1 ? 's' : ''}`), dateCells),
      twoRows ? h('tr', {}, cols.map((c) => h('th', {}, SLOT_LABEL[c.slot]))) : null);
    const body = rows.map((r, ri) => h('tr', {},
      h('td', { class: 'name', 'data-id': r.id, style: { cursor: 'pointer' }, title: `${r.label} · ${ageLabel(r.c.naissance, today)} · ${r.c.ecole || ''} · ${r.groupe} — cliquer pour ses jours habituels` }, r.label),
      cols.map((col, ci) => h('td', { class: cellClass(s, r.id, col), 'data-k': `${r.id}|${col.date}|${col.slot}`, 'data-r': ri, 'data-c': ci }, valueOf(s, r.id, col)))));
    const tbl = h('table', { class: 'pgrid' }, thead, h('tbody', {}, ...countsRows(s), ...body));
    clear(wrap).appendChild(tbl);
    info.textContent = cols.length ? `${cols.length} colonnes · du ${dateFr(cols[0].date)} au ${dateFr(cols[cols.length - 1].date)}` : 'Aucune date sur cette période.';
    drawExtraTools();
    sel = null;
  }

  function drawExtraTools() {
    clear(extraTools);
    if (v.act === 'exceptionnel' || v.act === 'ado') {
      extraTools.append(h('button', { onclick: addDate }, '+ Ajouter une date'));
    }
    if (v.act === 'pedibus' || v.act === 'mercredi') {
      extraTools.append(h('button', { onclick: () => fillDialog(ctx, v.act, draw) }, 'Remplir d\'après les jours habituels…'));
    }
    extraTools.append(h('button', { class: 'primary', onclick: inscrire }, '+ Inscrire des enfants'));
  }

  const hasPlan = () => v.act === 'pedibus' || v.act === 'mercredi';
  const actLabel = () => (ACTS.find(([k]) => k === v.act) || [, v.act])[1];

  // Inscrire des enfants à l'activité affichée (sans passer par chaque fiche).
  function inscrire() {
    const st = ctx.store.get();
    const chosen = new Set();
    const plan = {};
    let from = today, q = '', anciens = false;
    const list = h('div', { class: 'checks', style: { maxHeight: '320px', overflow: 'auto', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' } });
    const drawList = () => {
      const cand = Object.entries(st.children)
        .filter(([, c]) => !inscribed(c, v.act) && (anciens || groupAt(c, today) !== 'Plus présent'))
        .map(([id, c]) => ({ id, c, label: `${nomEnfant(st, c)} ${c.prenom}`.trim() }))
        .filter((x) => !q || x.label.toLowerCase().includes(q))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
      fill(list, cand.length ? cand.slice(0, 300).map((x) => h('label', {}, h('input', { type: 'checkbox', checked: chosen.has(x.id), onchange: (e) => { e.target.checked ? chosen.add(x.id) : chosen.delete(x.id); } }),
        ` ${x.label}`, h('span', { class: 'muted' }, ` · ${groupAt(x.c, today)}${x.c.ecole ? ` · ${x.c.ecole}` : ''}`))) : h('p', { class: 'muted' }, 'Aucun enfant à inscrire ne correspond.'));
    };
    drawList();
    modal(`Inscrire des enfants — ${actLabel()}`, h('div', {},
      h('div', { class: 'tools', style: { marginBottom: '8px' } },
        h('input', { type: 'search', placeholder: 'Rechercher un enfant…', oninput: (e) => { q = e.target.value.toLowerCase().trim(); drawList(); } }),
        h('label', {}, h('input', { type: 'checkbox', onchange: (e) => { anciens = e.target.checked; drawList(); } }), ' Inclure les « Plus présent »'),
        h('span', { class: 'spacer' }),
        h('button', { onclick: () => { document.querySelector('.modal-back')?.remove(); openChild(ctx, null, { inscription: v.act === 'pedibus' ? 'pedibus' : v.act }); } }, '+ Nouvel enfant')),
      list,
      hasPlan() ? h('div', {}, h('h3', {}, 'Jours habituels (pour les enfants cochés)'), planningFields(plan, [v.act]),
        h('div', { class: 'tools', style: { marginTop: '6px' } }, h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Mettre P à partir du'), h('input', { type: 'date', value: today, onchange: (e) => { from = e.target.value || today; } })))) : null), [
      { label: 'Annuler' },
      { label: 'Inscrire', primary: true, onClick: async () => {
        if (!chosen.size) { toast('Cochez au moins un enfant.', 'warn'); return false; }
        const key = v.act;
        const changes = [];
        for (const id of chosen) {
          changes.push([['children', id, 'inscriptions', key], true]);
          if (hasPlan() && (plan[v.act] || []).length) changes.push([['children', id, 'planning', v.act], plan[v.act]]);
        }
        await ctx.store.dispatchMany(changes);
        let n = 0;
        if (hasPlan() && (plan[v.act] || []).length) n = await applyPlanning(ctx, { childIds: [...chosen], activities: [v.act], from, replace: false });
        toast(`${chosen.size} enfant(s) inscrit(s)${n ? `, ${n} présence(s) ajoutée(s)` : ''}.`);
        draw();
      } },
    ]);
  }

  // Clic sur le nom : jours habituels de l'enfant pour cette activité.
  function childMenu(id) {
    const st = ctx.store.get();
    const c = st.children[id];
    const plan = structuredClone(c.planning || {});
    let from = today;
    const poste = posteDeLActivite(v.act, v.tri);
    const reste = poste ? resteDuPoste(st, id, poste, today) : 0;
    modal(`${nomEnfant(st, c)} ${c.prenom} — ${actLabel()}`, h('div', {},
      poste ? h('p', {}, `${posteLabel(poste)} : `, h('b', { style: { color: reste ? 'var(--rouge)' : 'var(--vert)' } }, reste ? `reste ${euro(reste)} à payer` : 'rien à payer')) : null,
      hasPlan() ? h('div', {}, h('p', { class: 'muted' }, 'Jours habituels : P sera mis automatiquement sur ces jours (les P prévus qui ne correspondent plus sont retirés, les absences A restent).'),
        planningFields(plan, [v.act]),
        h('div', { class: 'tools', style: { marginTop: '6px' } }, h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'À partir du'), h('input', { type: 'date', value: today, onchange: (e) => { from = e.target.value || today; } }))))
        : h('p', {}, 'Inscrit à cette activité.')), [
      { label: 'Ouvrir la fiche', onClick: () => openChild(ctx, id) },
      poste ? { label: '+ Règlement', title: `Règlement pour ${posteLabel(poste)}`, onClick: () => { setTimeout(() => openQuickPayment(ctx, { childId: id, poste }), 0); } } : null,
      inscribed(c, v.act) ? { label: 'Retirer de l\'activité', danger: true, onClick: async () => {
        if (!(await confirmBox('Retirer', `Retirer ${c.prenom} de l'activité ? Les présences déjà saisies sont gardées.`, 'Retirer'))) return false;
        await ctx.store.dispatch(['children', id, 'inscriptions', v.act === 'pedibus' ? 'pedibus' : v.act], false);
        draw();
      } } : null,
      hasPlan() ? { label: 'Enregistrer', primary: true, onClick: async () => {
        await ctx.store.dispatch(['children', id, 'planning', v.act], plan[v.act] || []);
        const n = await applyPlanning(ctx, { childIds: [id], activities: [v.act], from, replace: true });
        toast(`Jours habituels enregistrés${n ? ` : ${n} case(s) mise(s) à jour` : ''}.`);
        draw();
      } } : null,
    ].filter(Boolean));
  }

  async function addDate() {
    let d = '';
    modal(v.act === 'ado' ? 'Nouvelle soirée ADO' : 'Nouvelle journée exceptionnelle', h('input', { type: 'date', onchange: (e) => { d = e.target.value; } }), [
      { label: 'Annuler' },
      { label: 'Ajouter', primary: true, onClick: async () => {
        if (!d) return false;
        const s = ctx.store.get();
        const list = [...new Set([...(s.extraDates?.[v.act] || []), d])].sort();
        await ctx.store.dispatch(['extraDates', v.act], list);
        draw();
        return true;
      } },
    ]);
  }

  async function setCell(td, value) {
    const [cid, date, slot] = td.dataset.k.split('|');
    const key = `${cid}|${v.act}|${date}|${slot}`;
    const s = ctx.store.get();
    if ((s.presences[key] || '') === value) return;
    if ((value === 'KT' || value === 'AKT') && !(v.act === 'pedibus' && ktDay(s.params, date))) { toast('KT seulement les jours de KT (mardi / jeudi) au Pédibus.', 'warn'); return; }
    if (value === 'C' && v.act !== 'pedibus') { toast('C (collégien) seulement au Pédibus.', 'warn'); return; }
    await ctx.store.dispatch(['presences', key], value || null);
    td.textContent = value;
    td.className = cellClass(ctx.store.get(), cid, { date, slot, weekStart: td.classList.contains('week-start') }) + (td.classList.contains('sel') ? ' sel' : '');
    refreshCounts();
  }

  function select_(td) {
    wrap.querySelectorAll('td.sel').forEach((x) => x.classList.remove('sel'));
    if (!td) { sel = null; return; }
    td.classList.add('sel');
    sel = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const tdAt = (r, c) => wrap.querySelector(`td.c[data-r="${r}"][data-c="${c}"]`);

  wrap.addEventListener('click', (e) => {
    const nameTd = e.target.closest('td.name[data-id]');
    if (nameTd) { childMenu(nameTd.dataset.id); return; }
    const td = e.target.closest('td.c');
    if (!td) return;
    select_(td);
    const [cid, date, slot] = td.dataset.k.split('|');
    setCell(td, cycle(valueOf(ctx.store.get(), cid, { date, slot }), { date, slot }, cid));
  });

  const onKey = (e) => {
    if (!sel || document.querySelector('.modal-back') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const td = tdAt(sel.r, sel.c);
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      const n = tdAt(sel.r + moves[e.key][0], sel.c + moves[e.key][1]);
      if (n) select_(n);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'p' || k === 'a' || k === 'k' || k === 'c' || e.key === 'Delete' || e.key === 'Backspace' || e.key === ' ') {
      e.preventDefault();
      let val = k === 'p' ? 'P' : k === 'a' ? 'A' : k === 'k' ? 'KT' : k === 'c' ? 'C' : '';
      if (val === 'A' && td && td.textContent === 'KT') val = 'AKT'; // A sur une case KT = absence au KT
      if (td) setCell(td, val);
    }
  };
  document.addEventListener('keydown', onKey);

  async function columnMenu(date) {
    const s = ctx.store.get();
    const slots = cols.filter((c) => c.date === date).map((c) => c.slot);
    const empties = rows.flatMap((r) => slots.filter((sl) => !s.presences[`${r.id}|${v.act}|${date}|${sl}`]).map((sl) => [r.id, sl]));
    const filled = rows.flatMap((r) => slots.filter((sl) => s.presences[`${r.id}|${v.act}|${date}|${sl}`]).map((sl) => [r.id, sl]));
    modal(`Colonne du ${dateFr(date)}`, h('p', {}, `${rows.length} enfants affichés · ${empties.length} case(s) vide(s).`), [
      { label: 'Annuler' },
      filled.length ? { label: `Tout effacer (${filled.length})`, danger: true, onClick: async () => {
        if (!(await confirmBox('Effacer la colonne', `Effacer ${filled.length} saisie(s) du ${dateFr(date)} ?`, 'Effacer'))) return;
        await ctx.store.dispatchMany(filled.map(([id, sl]) => [['presences', `${id}|${v.act}|${date}|${sl}`], null]));
        draw();
      } } : null,
      { label: `Tout en P (${empties.length} case${empties.length > 1 ? 's' : ''} vide${empties.length > 1 ? 's' : ''})`, primary: true, onClick: async () => {
        await ctx.store.dispatchMany(empties.map(([id, sl]) => [['presences', `${id}|${v.act}|${date}|${sl}`], 'P']));
        draw();
      } },
    ].filter(Boolean));
  }

  const s = s0;
  const triSel = select([[1, '1er trimestre'], [2, '2e trimestre'], [3, '3e trimestre']], v.tri, { name: 'tri', onchange: (e) => { v.tri = Number(e.target.value); draw(); } });
  const triBox = h('span', {}, triSel);
  const showTri = () => { triBox.style.display = (v.act === 'pedibus' || v.act === 'mercredi') ? '' : 'none'; };
  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Présences'),
      h('div', { class: 'tools' },
        select(ACTS, v.act, { name: 'activity', onchange: (e) => { v.act = e.target.value; showTri(); draw(); } }),
        triBox,
        h('button', { onclick: () => { const th = wrap.querySelector(`th[data-date="${today}"]`) || [...wrap.querySelectorAll('th[data-date]')].find((x) => x.dataset.date >= today); if (th) th.scrollIntoView({ inline: 'center', block: 'nearest' }); } }, 'Aujourd\'hui'),
        extraTools)),
    h('div', { class: 'tools', style: { marginBottom: '8px' } },
      h('input', { type: 'search', placeholder: 'Filtrer un enfant…', oninput: debounce((e) => { v.q = e.target.value.toLowerCase(); draw(); }, 150) }),
      select([['', 'Toutes les écoles'], ...s.params.ecoles], '', { onchange: (e) => { v.ecole = e.target.value; draw(); } }),
      select([['', 'Tous les groupes'], ...s.params.groupes], '', { onchange: (e) => { v.groupe = e.target.value; draw(); } }),
      select([['nom', 'Trier par nom'], ['groupe', 'Trier par groupe'], ['ecole', 'Trier par école']], v.sort, { onchange: (e) => { v.sort = e.target.value; draw(); } }),
      info),
    h('div', { class: 'legend' },
      h('span', {}, h('span', { class: 'sw', style: { background: 'var(--vert-clair)', color: 'var(--vert)' } }, 'P'), ' présent'),
      h('span', {}, h('span', { class: 'sw', style: { background: 'var(--orange-clair)', color: 'var(--orange)' } }, 'A'), ' absent facturé (pas sur les listes)'),
      h('span', {}, h('span', { class: 'sw', style: { background: '#efe9fb', color: 'var(--violet)' } }, 'KT'), ' KT (mardi / jeudi)'),
      h('span', {}, h('span', { class: 'sw', style: { background: 'var(--orange-clair)', color: 'var(--violet)', width: '30px' } }, 'AKT'), ' absence KT (facturée au prix du KT)'),
      h('span', {}, h('span', { class: 'sw', style: { background: '#eef1f4', color: 'var(--gris)' } }, 'C'), ` collégien au Pédibus (${String(s0.params.tarifs.collegien ?? 1.5).replace('.', ',')} €)`),
      h('span', {}, 'Clic : vide → P → A → KT → AKT (collégiens : vide → C → A) · Clavier : P, A, K, C, Suppr, flèches (A sur une case KT = absence KT) · Clic droit sur une date : remplir la colonne'),
      h('span', {}, h('span', { class: 'sw', style: { boxShadow: 'inset 0 0 0 2px #f79009' } }, ''), ' modifié par quelqu\'un d\'autre il y a moins d\'une minute')),
    wrap);
  showTri();
  draw();

  ctx.subscribe((st, inf) => {
    if (!inf || !inf.remote) { if (inf && inf.reset) draw(); return; }
    const onlyPres = inf.remote.every((o) => o.path[0] === 'presences');
    if (!onlyPres) { draw(); return; }
    for (const o of inf.remote) {
      const [cid, act, date, slot] = o.path[1].split('|');
      if (act !== v.act) continue;
      const td = wrap.querySelector(`td.c[data-k="${cid}|${date}|${slot || ''}"]`);
      if (!td) { draw(); return; }
      td.textContent = o.value || '';
      td.className = cellClass(st, cid, { date, slot: slot || '', weekStart: td.classList.contains('week-start') });
    }
    refreshCounts();
  });
  return () => document.removeEventListener('keydown', onKey);
}

function isoWeek(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return d.getUTCFullYear() * 100 + 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}
