// Gabarit HTML des documents imprimés (listes du jour, bordereaux, attestations).
import { esc } from './ui.js';

export const PRINT_CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Aptos, "Segoe UI", Arial, sans-serif; color: #000; margin: 0; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .t { font-size: 26px; font-weight: 800; margin: 0 0 2px; }
  .d { font-size: 22px; font-weight: 700; margin: 0 0 6px; }
  .n { font-size: 14px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { border: 1px solid #555; padding: 4px 6px; text-align: left; height: 26px; }
  th { background: #e9edf2; }
  td.box { width: 70px; }
  td.num, th.num { width: 32px; text-align: center; }
  .foot { margin-top: 8px; font-size: 11px; color: #555; }
  .right { text-align: right; }
`;

export function printDocument(title, pagesHtml, extraCss = '') {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}${extraCss}</style></head><body>${pagesHtml}</body></html>`;
}

export function listPageHtml(list, dateLabel) {
  const cols = list.columns;
  const cell = (r, c) => {
    switch (c) {
      case '#': return `<td class="num">${r.n}</td>`;
      case 'Nom': return `<td>${esc(r.nom)}</td>`;
      case 'Prénom': return `<td>${esc(r.prenom)}${r.kt ? ' ⛪' : ''}</td>`;
      case 'Âge': return `<td>${esc(r.age)}</td>`;
      case 'École': return `<td>${esc(r.ecole)}</td>`;
      default: return '<td class="box"></td>';
    }
  };
  return `<section class="page">
    <div class="t">${esc(list.title)}</div>
    <div class="d">${esc(dateLabel)}</div>
    <div class="n">Nb enfants : <b>${list.rows.length}</b></div>
    <table><thead><tr>${cols.map((c) => `<th class="${c === '#' ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${list.rows.map((r) => `<tr>${cols.map((c) => cell(r, c)).join('')}</tr>`).join('')}</tbody></table>
    <div class="foot">* PAI · ⛪ KT ce jour-là</div>
  </section>`;
}
