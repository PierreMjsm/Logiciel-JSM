// Fichiers des enfants : téléchargement des pièces jointes Tally, noms de dossiers sûrs.
const fs = require('node:fs');
const path = require('node:path');

const nomPropre = (s) => String(s).replace(/[\\/:]/g, '-').replace(/[*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
const capital = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const nomDossierEnfant = (nom, prenom, id) => nomPropre(`${nom} ${capital(prenom)} (${id})`);

function libre(dir, base, ext) {
  let p = path.join(dir, `${base}${ext}`);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}

// Télécharge un lien (https uniquement) dans dir, sous le nom base + extension du lien.
async function telecharger(url, dir, base, { autoriserHttp = false } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:' && !(autoriserHttp && u.protocol === 'http:')) throw new Error('Seuls les liens https sont acceptés.');
  const res = await fetch(u, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}) : le lien a peut-être expiré.`);
  const buf = Buffer.from(await res.arrayBuffer());
  let ext = path.extname(decodeURIComponent(u.pathname)).toLowerCase();
  if (!/^\.[a-z0-9]{2,5}$/.test(ext)) {
    const ct = res.headers.get('content-type') || '';
    ext = ct.includes('pdf') ? '.pdf' : ct.includes('png') ? '.png' : ct.includes('jpeg') ? '.jpg' : '';
  }
  fs.mkdirSync(dir, { recursive: true });
  const p = libre(dir, nomPropre(base), ext);
  fs.writeFileSync(p, buf);
  return p;
}

// Supprime les fichiers « base.ext » et « base (n).ext » d'un dossier (ancienne version d'une pièce jointe).
function effacerPieces(dir, base) {
  if (!fs.existsSync(dir)) return 0;
  const b = nomPropre(base).toLowerCase();
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    const stem = path.basename(f, path.extname(f)).toLowerCase();
    if (stem === b || new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(\\d+\\)$`).test(stem)) { fs.unlinkSync(path.join(dir, f)); n += 1; }
  }
  return n;
}

module.exports = { telecharger, nomDossierEnfant, nomPropre, libre, effacerPieces };
