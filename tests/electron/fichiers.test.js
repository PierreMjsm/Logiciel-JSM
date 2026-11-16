const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { telecharger, nomDossierEnfant, nomPropre } = require('../../electron/fichiers.js');

test('nomDossierEnfant / nomPropre : noms de fichiers sûrs pour Windows', () => {
  assert.equal(nomDossierEnfant('DURAND', 'LOUISE', 'c1'), 'DURAND Louise (c1)');
  assert.equal(nomPropre('a/b:c*?"<>|.pdf'), 'a-b-c------.pdf');
});

test('telecharger : enregistre le fichier sous un nom choisi, avec l’extension du lien', async () => {
  const srv = http.createServer((req, res) => { res.setHeader('content-type', 'application/pdf'); res.end('%PDF-1.4 test'); }).listen(0);
  const port = srv.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-dl-'));
  try {
    const p = await telecharger(`http://127.0.0.1:${port}/private/Vaccins%20Lina.pdf?id=A&accessToken=x`, dir, 'Vaccins', { autoriserHttp: true });
    assert.equal(path.basename(p), 'Vaccins.pdf');
    assert.equal(fs.readFileSync(p, 'utf8'), '%PDF-1.4 test');
    const p2 = await telecharger(`http://127.0.0.1:${port}/x.pdf`, dir, 'Vaccins', { autoriserHttp: true });
    assert.equal(path.basename(p2), 'Vaccins (2).pdf', 'ne remplace pas un fichier existant');
    await assert.rejects(() => telecharger('http://exemple.fr/x.pdf', dir, 'X'), /https/);
  } finally { srv.close(); }
});

test('effacerPieces : retire les anciennes versions d’une pièce (toutes extensions), pas les autres', () => {
  const { effacerPieces } = require('../../electron/fichiers.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-pieces-'));
  for (const f of ['Vaccins.pdf', 'Vaccins (2).jpg', 'Vaccins anciens.pdf', 'Photo.jpeg', 'Fiche adhésion.pdf']) fs.writeFileSync(path.join(dir, f), 'x');
  assert.equal(effacerPieces(dir, 'Vaccins'), 2);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['Fiche adhésion.pdf', 'Photo.jpeg', 'Vaccins anciens.pdf']);
  assert.equal(effacerPieces(path.join(dir, 'absent'), 'Vaccins'), 0);
});
