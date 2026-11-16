import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

function data() {
  const s = miniState();
  mark(s, 'c2', 'pedibus', '2026-09-07', 'P');
  mark(s, 'c3', 'toussaint', '2026-10-19', 'P');
  s.extraDates.ado = ['2026-10-02'];
  s.children.c2.inscriptions.ado = true;
  return s;
}
const nav = (page, label) => page.locator('nav').getByText(label, { exact: true }).click();

test('every remaining screen opens without errors', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  for (const label of ['Attestation', 'Mailings', 'Statistiques et bilan', 'ADO', 'Carte', 'Paramètres', 'Import Excel']) {
    await nav(page, label);
    await page.locator('main h1').filter({ hasNotText: 'Chargement' }).first().waitFor();
    assert.ok(!(await page.locator('main').innerText()).includes('En construction'), label);
    assert.ok(!/\bnull\b|undefined/.test(await page.locator('main').innerText()), `${label}: no null/undefined text`);
  }
  assert.deepEqual(errors, []);
});

test('mailing list for Pédibus is deduplicated and copyable', async () => {
  const { page } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await nav(page, 'Mailings');
  await page.locator('main select[name=ins]').selectOption('pedibus');
  assert.equal(await page.locator('main textarea').inputValue(), 'famille.durand@example.fr; b@y.fr');
  await page.getByRole('button', { name: 'Copier les adresses' }).click();
  assert.deepEqual(await page.evaluate(() => window.__copied), ['famille.durand@example.fr; b@y.fr']);
});

test('CAF table shows hours per school and category', async () => {
  const { page } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await nav(page, 'Statistiques et bilan');
  await page.locator('main input[name=from]').fill('2026-09-01');
  await page.locator('main input[name=to]').fill('2026-09-30');
  const t = await page.locator('main table.grid').first().innerText();
  assert.match(t, /ROSALIE/);
  assert.match(t, /6-11/);
  assert.match(t, /2,5 h/);
});

test('paramètres: changing a tariff dispatches a params op', async () => {
  const { page } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await nav(page, 'Paramètres');
  const input = page.locator('main input[name="tarif-journee"]');
  await input.fill('15');
  await input.blur();
  const ops = await page.evaluate(() => window.__appended);
  assert.ok(ops.some((o) => o.path.join('.') === 'params.tarifs.journee' && o.value === 15));
});

test('attestation builds lines from the child postes and exports a PDF', async () => {
  const { page } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await nav(page, 'Attestation');
  await page.getByRole('button', { name: 'Attestation de paiement' }).click();
  await page.locator('main select[name=child]').selectOption({ label: 'DURAND NOAH' });
  assert.match(await page.locator('main tbody input[type=text]').first().inputValue(), /Toussaint/);
  await page.getByRole('button', { name: 'Enregistrer en PDF' }).click();
  const printed = await page.evaluate(() => window.__printed);
  assert.match(printed[0].html, /Je soussigné Jean EXEMPLE/);
  assert.match(printed[0].fileName, /^Attestation DURAND NOAH/);
});

test('import Excel: report then replace the data', async () => {
  const { page } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await page.evaluate(() => {
    const g = [[], [], [], [], [], [], ['Tranche', 'Adh', 'Nom', 'Prénom'], ['6-8 ans', true, 'NOUVEAU', 'TOM', '', '2019-02-02', 'MARCEL', 'n@x.fr', '', '', '', '', true]];
    window.__excel = [{ file: 'Contact 26-27.xlsm', sheets: { 'général': g, PageJaune: [], Mails: [] } }];
  });
  await nav(page, 'Import Excel');
  await page.getByRole('button', { name: /Choisir les fichiers Excel/ }).click();
  await page.getByText(/1 enfant/).waitFor();
  await page.getByRole('button', { name: /Remplacer les données/ }).click();
  await page.locator('.modal').getByRole('button', { name: 'Remplacer' }).click();
  await page.locator('nav').getByText('Enfants', { exact: true }).click();
  await page.locator('main tbody', { hasText: 'NOUVEAU' }).waitFor();
});
