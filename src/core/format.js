// Formatage français : montants, dates, jours.
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function euro(n) {
  return EUR.format(Number(n) || 0);
}

export function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function weekday(iso) {
  return parseIso(iso).getUTCDay(); // 0 = dimanche
}

export function dayName(iso) {
  return DAYS[weekday(iso)];
}

export function dateFr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
