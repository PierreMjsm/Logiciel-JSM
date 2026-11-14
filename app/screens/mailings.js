// Mailings : adresses des familles d'une activité, sans doublon.
import { h, select, toast } from '../ui.js';
import { mailingList } from '../../src/core/reports.js';
import { INSCRIPTIONS } from './enfants.js';

export function render(root, ctx) {
  let ins = '', adh = false, anciens = false;
  const area = h('textarea', { readonly: true, style: { minHeight: '220px' } });
  const count = h('span', { class: 'muted' });
  const draw = () => {
    const list = mailingList(ctx.store.get(), ins, adh, { anciens });
    area.value = list;
    const n = list ? list.split('; ').length : 0;
    count.textContent = `${n} adresse${n > 1 ? 's' : ''}`;
  };
  root.append(
    h('header', { class: 'screen-head' }, h('h1', {}, 'Mailings')),
    h('p', { class: 'muted' }, 'Adresses des familles inscrites, dédoublonnées et séparées par « ; ». Collez-les en copie cachée (Cci) de votre message.'),
    h('div', { class: 'tools', style: { marginBottom: '10px' } },
      select([['', 'Tous les enfants présents cette année'], ...INSCRIPTIONS], ins, { name: 'ins', onchange: (e) => { ins = e.target.value; draw(); } }),
      h('label', {}, h('input', { type: 'checkbox', onchange: (e) => { adh = e.target.checked; draw(); } }), ' Adhérents seulement'),
      h('label', { title: 'Pour garder le contact : campagne de dons, nouvelles de l\'association…' }, h('input', { type: 'checkbox', name: 'anciens', onchange: (e) => { anciens = e.target.checked; draw(); } }), ' Inclure les anciennes familles (« Plus présent »)'),
      count,
      h('button', { class: 'primary', onclick: async () => { await ctx.bridge.copy(area.value); toast('Adresses copiées.'); } }, 'Copier les adresses')),
    area);
  draw();
  ctx.subscribe(draw);
}
