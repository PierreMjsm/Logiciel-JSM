// Historique : qui a changé quoi, quand.
import { h, clear, fill, debounce } from '../ui.js';
import { historyOf } from '../../src/core/store.js';

export function render(root, ctx) {
  let who = '', q = '';
  const list = h('div', { class: 'history' });
  const draw = () => {
    const s = ctx.store.get();
    const items = historyOf(ctx.store.getOps(), s, (e) => (!who || e.by === who) && (!q || e.label.toLowerCase().includes(q))).slice(0, 500);
    fill(list, items.length
      ? h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Quand'), h('th', {}, 'Qui'), h('th', {}, 'Modification'))),
        h('tbody', {}, items.map((e) => h('tr', {},
          h('td', { class: 'nowrap' }, new Date(e.t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })),
          h('td', {}, e.by), h('td', {}, e.label)))))
      : h('p', { class: 'muted' }, 'Aucune modification pour le moment.'));
  };
  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Historique'),
      h('div', { class: 'tools' },
        h('select', { onchange: (e) => { who = e.target.value; draw(); } }, ['', 'Pierre', 'Katell', 'Lucas'].map((p) => h('option', { value: p }, p || 'Tout le monde'))),
        h('input', { type: 'search', placeholder: 'Rechercher (nom, date…)', oninput: debounce((e) => { q = e.target.value.toLowerCase(); draw(); }) }))),
    h('p', { class: 'muted' }, 'Les 500 dernières modifications. Toutes sont conservées dans les journaux du dossier partagé.'),
    list);
  draw();
  ctx.subscribe(() => draw());
}
