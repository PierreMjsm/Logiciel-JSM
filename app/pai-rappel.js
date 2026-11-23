// Rappel des PAI à renouveler : bandeau en haut de l'appli et notification Windows (une fois par jour).
import { h, fill, todayIso } from './ui.js';
import { paiAlertes, libelleAlerte, texteAlertesPai } from '../src/core/pai.js';
import { openChild } from './screens/enfants.js';

const CLE = 'jsm.pai.notifie';

export function demarrerRappelPai({ store, bridge, ctx, avant }) {
  const banner = h('div', { id: 'pai-banner', class: 'pai-banner', style: { display: 'none' } });
  avant.before(banner);
  let ferme = '';
  const maj = () => {
    if (store.getConsultation && store.getConsultation()) return;
    const today = todayIso();
    const alertes = paiAlertes(store.get(), today);
    const sig = alertes.map((a) => `${a.childId}:${a.etat}:${a.fin}`).join('|');
    if (!alertes.length || ferme === sig) { banner.style.display = 'none'; return; }
    banner.style.display = '';
    fill(banner,
      h('b', {}, `⚠ PAI à vérifier (${alertes.length}) : `),
      alertes.map((a, i) => [i ? ' · ' : '', h('button', { class: 'link', title: 'Ouvrir l\'onglet P.A.I de l\'enfant', onclick: () => openChild(ctx(), a.childId, { onglet: 'pai' }) }, a.nom), ` : ${libelleAlerte(a)}`]),
      h('button', { class: 'icon', title: 'Masquer jusqu\'au prochain changement', style: { marginLeft: 'auto' }, onclick: () => { ferme = sig; banner.style.display = 'none'; } }, '×'));
    let deja = '';
    try { deja = localStorage.getItem(CLE) || ''; } catch { /* stockage indisponible */ }
    if (deja !== today && bridge.notifier) {
      try { localStorage.setItem(CLE, today); } catch { /* idem */ }
      const t = texteAlertesPai(alertes);
      bridge.notifier(t).catch(() => {});
    }
  };
  let timer = null;
  store.subscribe(() => { clearTimeout(timer); timer = setTimeout(maj, 300); });
  setInterval(maj, 60 * 60 * 1000); // l'appli peut rester ouverte plusieurs jours
  maj();
}
