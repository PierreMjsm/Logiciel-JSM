import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const nav = (page, label) => page.locator('nav').getByText(label, { exact: true }).click();
const ops = (page) => page.evaluate(() => window.__appended);
const win = (page, k) => page.evaluate((k) => window[k], k);

test('paramètres : changement de tarif en cours d’année (ajouter, retirer)', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Paramètres');
  const sec = page.locator('section', { hasText: 'Changements de tarif' });
  await sec.locator('select[name=ch-cle]').selectOption('pedibus');
  await sec.locator('input[name=ch-from]').fill('2027-01-04');
  await sec.locator('input[name=ch-montant]').fill('6');
  await sec.getByRole('button', { name: 'Ajouter' }).click();
  let op = (await ops(page)).at(-1);
  assert.equal(op.path.join('.'), 'params.tarifsChangements');
  assert.deepEqual(op.value, [{ from: '2027-01-04', cle: 'pedibus', montant: 6 }]);
  await page.locator('section', { hasText: 'Changements de tarif' }).locator('tr', { hasText: '04/01/2027' }).getByRole('button', { name: 'Retirer' }).click();
  op = (await ops(page)).at(-1);
  assert.deepEqual(op.value, []);
  assert.deepEqual(errors, []);
});

test('assistant nouvelle année : tarifs, dates, fériés, puis création', async () => {
  const s = miniState();
  s.params.tarifsChangements = [{ from: '2027-01-04', cle: 'pedibus', montant: 6 }];
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Paramètres');
  await page.locator('main').getByRole('button', { name: 'Nouvelle année…', exact: true }).click();
  const m = page.locator('.modal');
  await m.getByText(/2027-2028/).first().waitFor();
  await m.getByRole('button', { name: 'Suivant' }).click();
  assert.equal(await m.locator('input[name=tarif-pedibus]').inputValue(), '6', 'dernier tarif de l’année');
  await m.locator('input[name=tarif-mercredi]').fill('7.5');
  await m.getByRole('button', { name: 'Suivant' }).click();
  await m.getByText(/calendrier scolaire officiel/).waitFor();
  await m.locator('input[name="per-toussaint-start"]').fill('2027-10-18');
  await m.getByRole('button', { name: 'Suivant' }).click();
  await m.getByText('17/04/2028').waitFor();
  await m.getByRole('button', { name: 'Suivant' }).click();
  await m.getByText(/Présences et règlements repartent à zéro/).waitFor();
  await m.getByRole('button', { name: 'Créer l\'année 2027-2028' }).click();
  await page.locator('.modal', { hasText: 'Confirmer' }).getByRole('button', { name: 'Créer' }).click();
  await page.waitForFunction(() => !!window.__newYear);
  const ny = await win(page, '__newYear');
  assert.equal(ny.label, '2027-2028');
  assert.equal(ny.base.year, '2027-2028');
  assert.equal(ny.base.params.tarifs.pedibus, 6);
  assert.equal(ny.base.params.tarifs.mercredi, 7.5);
  assert.equal(ny.base.params.periods.find((p) => p.id === 'toussaint').start, '2027-10-18');
  assert.deepEqual(ny.base.params.tarifsChangements, []);
  assert.deepEqual(errors, []);
});

function avecFiches() {
  const s = miniState();
  s.params.fichesPdf = { m1: { nom: 'Fiche adhésion', fichier: 'Modeles/F.pdf', champs: [{ nom: 'Nom de lenfant', type: 'texte' }], correspondance: { 'Nom de lenfant': 'enfant.nom' } } };
  s.params.fichePdfDefaut = 'm1';
  s.children.c1.fichesPdf = { m1: { creee: '2026-11-10', imprimee: null } };
  s.children.c3.fichesPdf = { m1: { creee: '2026-11-10', imprimee: '2026-11-11' } };
  return s;
}

test('créer une fiche PDF la note « à imprimer »', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: avecFiches(), config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.locator('main tbody tr', { hasText: 'JULES' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Fiche PDF' }).click();
  await page.waitForFunction(() => (window.__appended || []).some((o) => o.path.join('.') === 'children.c2.fichesPdf.m1'));
  const op = (await ops(page)).find((o) => o.path.join('.') === 'children.c2.fichesPdf.m1');
  assert.equal(op.value.imprimee, null);
  assert.ok(op.value.creee);
  assert.deepEqual(errors, []);
});

test('imprimer les fiches pas encore imprimées : un seul PDF, puis marquées imprimées', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: avecFiches(), config: { profil: 'Pierre' } });
  await nav(page, 'Paramètres');
  await page.getByRole('button', { name: 'Fiches PDF' }).click();
  await page.locator('main').getByRole('button', { name: /Imprimer les fiches pas encore imprimées \(1\)/ }).click();
  await page.locator('.modal').getByRole('button', { name: 'Imprimer' }).click();
  await page.waitForFunction(() => !!window.__lot);
  const lot = await win(page, '__lot');
  assert.deepEqual(lot, [{ dossier: 'DURAND Louise (c1)', nomFichier: 'Fiche adhésion' }]);
  await page.locator('.modal').getByRole('button', { name: /Oui, marquer/ }).click();
  const op = (await ops(page)).find((o) => o.path.join('.') === 'children.c1.fichesPdf.m1.imprimee');
  assert.ok(op && /^\d{4}-/.test(op.value));
  assert.deepEqual(errors, []);
});

test('listes du jour : trier par nom ou par école, choix retenu et utilisé à l’impression', async () => {
  const { mark } = await import('../core/fixtures/mini-state.js');
  const s = miniState();
  for (const id of ['c1', 'c2', 'c3']) mark(s, id, 'toussaint', '2026-10-20', 'P');
  s.children.c1.groupes = s.children.c2.groupes = s.children.c3.groupes = [{ from: null, groupe: '6-8 ans' }];
  s.children.c2.nom = 'ABEL';
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Listes du jour');
  await page.locator('main header input[type=date]').fill('2026-10-20');
  await page.locator('main header input[type=date]').dispatchEvent('change');
  await page.locator('main select[name=tri]').selectOption('nom');
  const prenoms = await page.locator('main .sheets tbody tr td:nth-child(3)').allInnerTexts();
  assert.deepEqual(prenoms.map((x) => x.trim()), ['JULES', 'LOUISE', 'NOAH *']);
  await page.locator('main header').getByRole('button', { name: 'Imprimer' }).click();
  const [p] = await win(page, '__printed');
  assert.ok(p.html.indexOf('JULES') < p.html.indexOf('LOUISE'));
  await page.reload();
  await nav(page, 'Listes du jour');
  assert.equal(await page.locator('main select[name=tri]').inputValue(), 'nom', 'choix retenu sur cet ordinateur');
  assert.deepEqual(errors, []);
});

test('impression groupée des fiches : par ordre alphabétique ou par école', async () => {
  const s = avecFiches();
  s.children.c3.fichesPdf = { m1: { creee: '2026-11-10', imprimee: null } };
  s.children.c5.fichesPdf = { m1: { creee: '2026-11-10', imprimee: null } };
  s.children.c1.ecole = 'ROSALIE'; s.children.c3.ecole = 'BUFFON'; s.children.c5.ecole = 'MARCEL';
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Paramètres');
  await page.getByRole('button', { name: 'Fiches PDF' }).click();
  await page.locator('main').getByRole('button', { name: /pas encore imprimées \(3\)/ }).click();
  let m = page.locator('.modal');
  await m.locator('select[name=ordre]').selectOption('nom');
  await m.getByRole('button', { name: 'Imprimer' }).click();
  await page.waitForFunction(() => !!window.__lot);
  assert.deepEqual((await win(page, '__lot')).map((x) => x.dossier), ['DURAND Louise (c1)', 'DURAND Noah (c3)', 'MOREAU Zoe (c5)']);
  await page.locator('.modal').getByRole('button', { name: 'Pas encore' }).click();
  await page.locator('main').getByRole('button', { name: /pas encore imprimées \(3\)/ }).click();
  m = page.locator('.modal');
  await page.evaluate(() => { window.__lot = null; });
  await m.locator('select[name=ordre]').selectOption('ecole');
  await m.getByRole('button', { name: 'Imprimer' }).click();
  await page.waitForFunction(() => !!window.__lot);
  assert.deepEqual((await win(page, '__lot')).map((x) => x.dossier), ['DURAND Noah (c3)', 'MOREAU Zoe (c5)', 'DURAND Louise (c1)'], 'BUFFON, MARCEL, ROSALIE');
  assert.deepEqual(errors, []);
});
