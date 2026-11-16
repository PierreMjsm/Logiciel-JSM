import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState } from '../core/fixtures/mini-state.js';
import { ENTETES, ligne } from '../core/fixtures/tally.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const nav = (page, label) => (label === 'Pré-inscriptions' ? page.locator('nav a[data-id=preinscriptions]').click() : page.locator('nav').getByText(label, { exact: true }).click());
const ops = (page) => page.evaluate(() => window.__appended);
const win = (page, k) => page.evaluate((k) => window[k], k);

function avecFiche() {
  const s = miniState();
  s.params.fichesPdf = { m1: { nom: 'Fiche adhésion 2026-2027', fichier: 'Modeles/Fiche.pdf', champs: [{ nom: 'Nom de lenfant', type: 'texte' }, { nom: '1', type: 'coche' }],
    correspondance: { 'Nom de lenfant': 'enfant.nom', 1: 'coche.vaccination' } } };
  s.params.fichePdfDefaut = 'm1';
  return s;
}
const ROWS = [ENTETES,
  ligne({ 'Téléphone': '0699999999', Classe: 'CM2' }),
  ligne({ Nom: 'Petit', 'Prénom': 'Lina', 'E-mail': 'petit@example.fr', 'Téléphone': '0611223344', 'Date de naissance': '02/05/2019', "Lien attestation d'ayant droit": 'https://storage.tally.so/private/ameli.pdf?id=B' })];

test('pré-inscriptions : liste, nouvelle famille validée → famille, enfant, pièces jointes, fiche PDF', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: avecFiche(), config: { profil: 'Pierre' }, win: { __preFile: 'Inscriptions.xlsx', __preRows: ROWS } });
  await nav(page, 'Pré-inscriptions');
  const lina = page.locator('main tbody tr', { hasText: 'LINA' });
  await lina.waitFor();
  assert.match(await lina.innerText(), /Nouvelle famille/);
  assert.match(await page.locator('main tbody tr', { hasText: 'LOUISE' }).innerText(), /Enfant connu/);
  await lina.click();
  const m = page.locator('.modal');
  await m.getByRole('button', { name: 'Valider' }).click();
  await page.waitForFunction(() => (window.__fiches || []).length === 1);
  const o = await ops(page);
  const fam = o.find((x) => x.path[0] === 'families' && x.path.length === 2);
  const kid = o.find((x) => x.path[0] === 'children' && x.path.length === 2);
  assert.equal(fam.value.nom, 'PETIT');
  assert.equal(kid.value.prenom, 'LINA');
  assert.equal(kid.value.fiche.signataire, 'Marie Durand');
  const dossier = `PETIT Lina (${kid.path[1]})`;
  const dl = await win(page, '__downloads');
  assert.deepEqual(dl.map((d) => [d.base, d.dossier]), [['Vaccins', dossier], ['Attestation ayant droit', dossier]]);
  const [fiche] = await win(page, '__fiches');
  assert.equal(fiche.fichier, 'Modeles/Fiche.pdf');
  assert.equal(fiche.dossier, dossier);
  assert.deepEqual(fiche.valeurs, { 'Nom de lenfant': 'PETIT', 1: true });
  await page.locator('main tbody tr', { hasText: 'LINA' }).filter({ hasText: 'Traitée' }).waitFor();
  assert.deepEqual(errors, []);
});

test('pré-inscriptions : enfant connu, seules les différences cochées sont reprises', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: avecFiche(), config: { profil: 'Pierre' }, win: { __preFile: 'Inscriptions.xlsx', __preRows: ROWS } });
  await nav(page, 'Pré-inscriptions');
  await page.locator('main tbody tr', { hasText: 'LOUISE' }).click();
  const m = page.locator('.modal');
  const tel = m.locator('tr', { hasText: 'Téléphone 1' });
  assert.match(await tel.innerText(), /06 99 99 99 99/);
  await tel.locator('input[type=checkbox]').uncheck();
  await m.locator('input[name=fichePdf]').uncheck();
  await m.getByRole('button', { name: 'Valider' }).click();
  await page.locator('main tbody tr', { hasText: 'LOUISE' }).filter({ hasText: 'Traitée' }).waitFor();
  const paths = (await ops(page)).map((x) => x.path.join('.'));
  assert.ok(paths.includes('children.c1.classe'));
  assert.ok(!paths.includes('families.f1.telMaman'));
  assert.equal(await win(page, '__fiches'), undefined);
  assert.deepEqual(errors, []);
});

test('pré-inscriptions : pas encore de dossier → bouton pour le choisir', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Pré-inscriptions');
  await page.locator('main').getByRole('button', { name: /Choisir le dossier des exports/ }).click();
  await page.locator('main').getByText(/Inscriptions Tally/).waitFor();
  assert.deepEqual(errors, []);
});

test('paramètres : ajouter une fiche PDF, correspondance proposée, aperçu avec les noms', async () => {
  const modele = { fichier: 'Modeles/Fiche adhésion.pdf', nom: 'Fiche adhésion', champs: [{ nom: 'Nom de lenfant', type: 'texte' }, { nom: 'Date de naissance', type: 'texte' }, { nom: '9', type: 'coche' }] };
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' }, win: { __modele: modele } });
  await nav(page, 'Paramètres');
  await page.getByRole('button', { name: 'Fiches PDF' }).click();
  await page.locator('main').getByRole('button', { name: /Ajouter une fiche/ }).click();
  const add = (await ops(page)).find((x) => x.path[1] === 'fichesPdf');
  assert.deepEqual(add.value.correspondance, { 'Nom de lenfant': 'enfant.nom', 'Date de naissance': 'enfant.naissance', 9: 'coche.image' });
  assert.equal((await ops(page)).find((x) => x.path[1] === 'fichePdfDefaut').value, add.path[2], 'première fiche = fiche des inscriptions');
  await page.locator('main').getByRole('button', { name: /Champs/ }).click();
  const m = page.locator('.modal');
  await m.locator('select[name="src-Nom de lenfant"]').selectOption('enfant.nomPrenom');
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  const last = (await ops(page)).at(-1);
  assert.equal(last.path.join('.'), `params.fichesPdf.${add.path[2]}.correspondance`);
  assert.equal(last.value['Nom de lenfant'], 'enfant.nomPrenom');
  await page.locator('main').getByRole('button', { name: /Aperçu avec les noms/ }).click();
  const [f] = await win(page, '__fiches');
  assert.equal(f.apercu, true);
  assert.equal(f.valeurs['Nom de lenfant'], '[Nom et prénom de l\'enfant]');
  assert.deepEqual(errors, []);
});

test('fiche enfant : renseignements de la fiche modifiables et bouton « Fiche PDF »', async () => {
  const s = avecFiche();
  s.children.c1.fiche = { secu: '1 99', coches: { vaccination: true } };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.locator('main tbody tr', { hasText: 'LOUISE' }).click();
  const m = page.locator('.modal');
  await m.getByText('Renseignements de la fiche d\'adhésion').click();
  await m.locator('input[name="fiche-urgence"]').fill('Oncle 0600000009');
  await m.getByRole('button', { name: 'Fiche PDF' }).click();
  await page.waitForFunction(() => (window.__fiches || []).length === 1);
  const [f] = await win(page, '__fiches');
  assert.equal(f.ouvrir, true);
  assert.equal(f.dossier, 'DURAND Louise (c1)');
  const o = (await ops(page)).find((x) => x.path.join('.') === 'children.c1.fiche.urgence');
  assert.equal(o.value, 'Oncle 0600000009', 'enregistré avant de créer la fiche');
  assert.deepEqual(errors, []);
});
