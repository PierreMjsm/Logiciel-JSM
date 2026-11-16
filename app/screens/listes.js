// Listes papier du jour : aperçu, impression, PDF.
import { h, clear, fill, todayIso, toast } from '../ui.js';
import { dailyLists, pdfFileName } from '../../src/core/lists.js';
import { addDays, dateFr, dayName } from '../../src/core/format.js';
import { jourSansWeekend } from '../../src/core/calendar.js';
import { VACANCES_LABELS } from '../../src/core/calendar.js';
import { printDocument, listPageHtml } from '../print.js';

const KIND_LABEL = { pedibus: 'Pédibus', kt: 'KT', pediMercredi: 'Pédibus mercredi', mercredi: 'Mercredi', vacances: 'Vacances', exceptionnel: 'Journée exceptionnelle', ado: 'Soirée ADO' };

export function render(root, ctx) {
  let date = ctx.params.date || jourSansWeekend(todayIso(), 1);
  const hidden = new Set();
  const dateInput = h('input', { type: 'date', value: date, onchange: (e) => { if (e.target.value) { date = e.target.value; draw(); } } });
  const kinds = h('div', { class: 'tools' });
  const preview = h('div', { class: 'sheets' });
  const summary = h('p', { class: 'muted' });

  const families = (lists) => {
    const fam = new Map();
    for (const l of lists) {
      const k = l.kind === 'kt' ? 'pedibus' : l.kind;
      if (!fam.has(k)) fam.set(k, []);
      fam.get(k).push(l);
    }
    return fam;
  };
  const kindName = (k, lists) => (k === 'vacances' ? `Vacances ${VACANCES_LABELS[lists[0].periode] || ''}`.trim() : KIND_LABEL[k] || k);
  const visible = () => dailyLists(ctx.store.get(), date).filter((l) => !hidden.has(l.kind === 'kt' ? 'pedibus' : l.kind));

  function draw() {
    const all = dailyLists(ctx.store.get(), date);
    const fam = families(all);
    fill(kinds, [...fam.entries()].map(([k, lists]) => h('label', { class: 'chip', style: { padding: '4px 10px' } },
      h('input', { type: 'checkbox', checked: !hidden.has(k), onchange: (e) => { e.target.checked ? hidden.delete(k) : hidden.add(k); draw(); } }),
      ` ${kindName(k, lists)} (${lists.length} page${lists.length > 1 ? 's' : ''})`)));
    const lists = visible();
    const total = lists.filter((l) => l.kind !== 'kt').reduce((s, l) => s + l.rows.length, 0);
    summary.textContent = lists.length ? `${dayName(date)} ${dateFr(date)} · ${lists.length} page(s) · ${total} présence(s)` : '';
    clear(preview);
    if (!all.length) {
      preview.appendChild(h('div', { class: 'card' }, h('p', {}, `Aucune liste pour le ${dayName(date)} ${dateFr(date)}.`),
        h('p', { class: 'muted' }, 'Il n\'y a pas d\'activité ce jour-là, ou aucun enfant n\'est encore noté « P ». Les présences se saisissent dans l\'écran Présences.')));
      return;
    }
    for (const l of lists) {
      preview.appendChild(h('div', { class: 'sheet' },
        h('div', { class: 't' }, l.title),
        h('div', { class: 'd' }, dateFr(date)),
        h('div', {}, `Nb enfants : `, h('b', {}, l.rows.length)),
        h('table', {}, h('thead', {}, h('tr', {}, l.columns.map((c) => h('th', {}, c)))),
          h('tbody', {}, l.rows.map((r) => h('tr', {}, l.columns.map((c) => h('td', {},
            c === '#' ? r.n : c === 'Nom' ? r.nom : c === 'Prénom' ? `${r.prenom}${r.kt ? ' ⛪' : ''}` : c === 'Âge' ? r.age : c === 'École' ? r.ecole : ''))))))));
    }
  }

  function documentHtml() {
    const lists = visible();
    return printDocument(`Listes du ${dateFr(date)}`, lists.map((l) => listPageHtml(l, `${dayName(date)} ${dateFr(date)}`)).join(''));
  }
  function fileName() {
    const fam = families(visible());
    const keys = [...fam.keys()];
    return pdfFileName(date, keys.length === 1 ? kindName(keys[0], fam.get(keys[0])) : 'Listes');
  }

  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Listes du jour'),
      h('div', { class: 'tools' },
        h('button', { title: 'Jour précédent', onclick: () => { date = jourSansWeekend(addDays(date, -1), -1); dateInput.value = date; draw(); } }, '◀'),
        dateInput,
        h('button', { title: 'Jour suivant', onclick: () => { date = jourSansWeekend(addDays(date, 1), 1); dateInput.value = date; draw(); } }, '▶'),
        h('button', { onclick: () => { date = jourSansWeekend(todayIso(), 1); dateInput.value = date; draw(); } }, 'Aujourd\'hui'),
        h('button', { onclick: async () => { if (!visible().length) return; await ctx.bridge.print({ html: documentHtml() }); } }, 'Imprimer'),
        h('button', { class: 'primary', onclick: async () => {
          if (!visible().length) { toast('Rien à enregistrer pour ce jour.', 'warn'); return; }
          const p = await ctx.bridge.printToPDF({ html: documentHtml(), fileName: fileName() });
          if (p) toast(`PDF enregistré : ${p}`);
        } }, 'Enregistrer en PDF'))),
    kinds, summary, preview);
  draw();
  ctx.subscribe(() => draw());
}
