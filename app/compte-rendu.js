// Compte rendu imprimable d'une année.
import { esc } from './ui.js';
import { printDocument } from './print.js';
import { euro } from '../src/core/format.js';

const hrs = (n) => `${String(Math.round(n * 100) / 100).replace('.', ',')} h`;

export function compteRenduHtml(cr) {
  const tr = (cells, tag = 'td') => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  const tab = (head, rows) => `<table><thead>${tr(head, 'th')}</thead><tbody>${rows.map((r) => tr(r)).join('')}</tbody></table>`;
  const famList = (list) => (list.length ? tab(['Famille', 'Montant'], list.map((x) => [esc(x.famille), euro(x.montant)])) : '<p>Aucune.</p>');
  const css = 'h3 { margin: 16px 0 6px; font-size: 16px; } td, th { height: auto; } .num, td:not(:first-child) { text-align: right; }';
  const page1 = `<section class="page">
    <div class="t">Compte rendu de l'année ${esc(cr.annee)}</div>
    <div class="n">Les Jeunes de Saint-Médard — édité le ${esc(cr.date)}</div>
    <h3>Effectifs</h3>
    ${tab(['', 'Nombre'], [['Enfants inscrits (au moins une activité)', cr.effectifs.enfants], ['Familles', cr.effectifs.familles], ['Adhérents (adhésion réglée)', cr.effectifs.adherents],
    ...cr.effectifs.parGroupe.map(([g, n]) => [`Groupe ${esc(g)} (à la rentrée)`, n])])}
    <h3>Activités</h3>
    ${tab(['Activité', 'Jours facturés (adhésions : nombre)', 'Dû', 'Réglé'], cr.activites.map((a) => [esc(a.label), a.jours, euro(a.du), euro(a.regle)]))}
    <h3>Heures CAF (de la rentrée à la fin de l'été)</h3>
    ${tab(['Activité', 'Moins de 6 ans', '6 ans et +', 'Collégiens', 'Total'], cr.caf.map((r) => [r.id === 'total' ? '<b>Total</b>' : esc(r.label),
    ...['moins6', 'plus6', 'collegiens', 'total'].map((k) => `${r[k].presences} j. · ${hrs(r[k].heures)}`)]))}
  </section>`;
  const page2 = `<section class="page">
    <div class="d">Compta ${esc(cr.annee)}</div>
    ${tab(['', 'Montant'], [['Total dû sur l\'année', euro(cr.compta.du)], ['Total réglé', euro(cr.compta.regle)],
    ...cr.compta.parMode.map(([m, v]) => [`dont ${esc(m)}`, euro(v)])])}
    <h3>Familles qui doivent encore (${cr.compta.impayes.length})</h3>
    ${famList(cr.compta.impayes)}
    <h3>Trop-perçus (${cr.compta.tropPercus.length})</h3>
    ${famList(cr.compta.tropPercus)}
  </section>`;
  return printDocument(`Compte rendu ${cr.annee}`, page1 + page2, css);
}
