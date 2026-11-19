// Trombinoscope (par groupe, par âge, tout le monde) et fiches santé des enfants avec PAI. Impression seulement sur demande.
import { h, fill, select, todayIso, esc } from '../ui.js';
import { printDocument } from '../print.js';
import { trombinoscope, fichesSante } from '../../src/core/trombi.js';
import { dossierEnfant } from '../../src/core/noms.js';

const MODES = [['groupe', 'Par groupe'], ['age', 'Par âge'], ['tous', 'Tout le monde']];
const initiales = (l) => l.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2);

export function render(root, ctx) {
  const v = { onglet: 'trombi', mode: 'groupe', groupe: '' };
  let photos = {};
  const tabs = h('div', { class: 'tabs' });
  const tools = h('div', { class: 'tools' });
  const body = h('div');

  async function chargerPhotos() {
    const s = ctx.store.get();
    const ids = trombinoscope(s, todayIso(), 'tous')[0].enfants.map((e) => e.id);
    try { const r = await ctx.bridge.dossierVignettes(ids.map((id) => dossierEnfant(s, id))); photos = Object.fromEntries(ids.map((id) => [id, r[dossierEnfant(s, id)]]).filter(([, x]) => x)); } catch { photos = {}; }
    draw();
  }

  function carte(e) {
    return h('div', { class: 'trombi-carte' },
      photos[e.id] ? h('img', { src: photos[e.id], alt: '' }) : h('div', { class: 'trombi-vide' }, initiales(e.libelle)),
      h('div', { class: 'trombi-nom' }, e.libelle));
  }

  function imprimerTrombi(sections) {
    const pages = sections.map((sec) => `<section class="page"><div class="t">${esc(sec.titre)}</div><div class="n">${sec.enfants.length} enfant(s)</div>
      <div class="tg">${sec.enfants.map((e) => `<div class="tc">${photos[e.id] ? `<img src="${photos[e.id]}">` : `<div class="tv">${esc(initiales(e.libelle))}</div>`}<div>${esc(e.libelle)}</div></div>`).join('')}</div></section>`).join('');
    const css = '.tg { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-top: 10px; } .tc { text-align: center; font-size: 13px; break-inside: avoid; } .tc img, .tv { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 6px; border: 1px solid #ccd; } .tv { display: flex; align-items: center; justify-content: center; font-size: 26px; color: #889; background: #f2f4f7; }';
    ctx.bridge.print({ html: printDocument('Trombinoscope', pages, css) });
  }

  function imprimerSante(list) {
    const fiches = list.map((x) => `<div class="fs">${photos[x.id] ? `<img src="${photos[x.id]}">` : '<div class="tv"></div>'}<div><b>${esc(x.nom)}</b> · ${esc(x.groupe)}${x.pai ? ' · <b>PAI</b>' : ''}
      ${x.difficultes ? `<div>Santé : ${esc(x.difficultes)}</div>` : ''}${x.traitement ? `<div>Traitement : ${esc(x.traitement)}</div>` : ''}${x.observations ? `<div>Observations : ${esc(x.observations)}</div>` : ''}
      <div>Urgence : ${esc(x.urgence || '—')} · Parents : ${esc(x.telephones || '—')}</div></div></div>`).join('');
    const css = '.fs { display: flex; gap: 12px; border: 1px solid #ccd; border-radius: 8px; padding: 8px; margin: 8px 0; break-inside: avoid; font-size: 14px; } .fs img, .fs .tv { width: 70px; height: 90px; object-fit: cover; border-radius: 6px; background: #f2f4f7; flex: none; }';
    ctx.bridge.print({ html: printDocument('Fiches santé', `<section class="page"><div class="t">Fiches santé${v.groupe ? ` — ${esc(v.groupe)}` : ''}</div><div class="n">À emporter en sortie · ${list.length} enfant(s)</div>${fiches}</section>`, css) });
  }

  function draw() {
    const s = ctx.store.get();
    const groupes = [['', 'Tous les groupes'], ...(s.params.groupes || []).filter((g) => g !== 'Plus présent').map((g) => [g, g])];
    fill(tabs, [['trombi', 'Trombinoscope'], ['sante', 'Fiches santé (PAI)']].map(([k, l]) => h('button', { class: v.onglet === k ? 'tab active' : 'tab', onclick: () => { v.onglet = k; draw(); } }, l)));
    if (v.onglet === 'trombi') {
      const sections = trombinoscope(s, todayIso(), v.mode, { groupe: v.groupe });
      fill(tools,
        select(MODES, v.mode, { name: 'mode', onchange: (e) => { v.mode = e.target.value; draw(); } }),
        select(groupes, v.groupe, { name: 'groupe', onchange: (e) => { v.groupe = e.target.value; draw(); } }),
        h('button', { class: 'primary', onclick: () => imprimerTrombi(sections) }, 'Imprimer'));
      fill(body,
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'Les photos viennent du dossier de chaque enfant (reçues par Tally ou ajoutées dans sa fiche). Sous chaque photo : le prénom et l\'initiale du nom.'),
        ...sections.map((sec) => h('section', { class: 'card' }, h('h2', {}, `${sec.titre} `, h('span', { class: 'muted' }, `(${sec.enfants.length})`)), h('div', { class: 'trombi-grille' }, sec.enfants.map(carte)))));
    } else {
      const list = fichesSante(s, todayIso(), { groupe: v.groupe });
      fill(tools,
        select(groupes, v.groupe, { name: 'groupe', onchange: (e) => { v.groupe = e.target.value; draw(); } }),
        h('button', { class: 'primary', onclick: () => imprimerSante(list) }, 'Imprimer'));
      fill(body,
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'Enfants avec un PAI ou des difficultés de santé notées sur leur fiche d\'adhésion, avec les personnes à contacter. À imprimer pour les sorties.'),
        list.length ? list.map((x) => h('div', { class: 'card fiche-sante' },
          photos[x.id] ? h('img', { src: photos[x.id], alt: '' }) : h('div', { class: 'trombi-vide' }, initiales(x.nom)),
          h('div', {},
            h('div', {}, h('b', {}, x.nom), ` · ${x.groupe}`, x.pai ? h('span', { class: 'chip ko', style: { marginLeft: '6px' } }, 'PAI') : null),
            x.difficultes ? h('div', {}, `Santé : ${x.difficultes}`) : null,
            x.traitement ? h('div', {}, `Traitement : ${x.traitement}`) : null,
            x.observations ? h('div', { class: 'muted' }, `Observations : ${x.observations}`) : null,
            h('div', {}, `Urgence : ${x.urgence || '—'} · Parents : ${x.telephones || '—'}`))))
          : h('p', {}, 'Aucun enfant avec un PAI ou des difficultés de santé notées.'));
    }
  }

  root.append(h('header', { class: 'screen-head' }, h('h1', {}, 'Trombinoscope'), tools), tabs, body);
  draw();
  chargerPhotos();
  return { refresh: draw };
}
