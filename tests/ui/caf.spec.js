import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

// Année en cours 2026-2027 + année précédente 2025-2026 lue en lecture seule.
function annees() {
  const s = miniState();
  s.params.cafAutres = { ...s.params.cafAutres, vacancesJournee: 8, mercrediMatin: 4, mercrediAprem: 4, adoSoiree: 3 };
  s.children.c6 = { ...s.children.c1, prenom: 'LEO', groupes: [{ from: null, groupe: 'Collégiens' }] };
  s.anneePrecedente = { label: '2025-2026', dossier: 'JSM' };
  mark(s, 'c5', 'toussaint', '2026-10-19', 'P');
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c5', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c6', 'ado', '2026-10-09', 'P');
  const avant = miniState();
  avant.year = '2025-2026';
  avant.params.cafAutres = { ...avant.params.cafAutres, mercrediMatin: 4, mercrediAprem: 4 };
  avant.presences['c3|mercredi|2026-03-04|aprem'] = 'P';
  avant.presences['c3|mercredi|2025-12-03|aprem'] = 'P'; // 2025 : hors de l'année civile 2026
  avant.payments = { x: { familyId: 'f1', date: '2026-03-05', montant: 7, affectations: [{ poste: 'mercredi-T2', montant: 7, childId: 'c3' }] } };
  return { s, win: { __years: [{ label: '2025-2026', dossier: 'JSM' }], __annees: { JSM: { base: avant, ops: [] } } } };
}

test('Déclaration CAF : année civile sur deux dossiers, périscolaire / extrascolaire / collégiens, export et impression', async () => {
  const { s, win } = annees();
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' }, win, clock: '2026-11-18T10:00:00' });
  await page.locator('nav').getByText('Déclaration CAF', { exact: true }).click();
  await page.locator('main select[name=annee]').selectOption('2026');
  await page.locator('main select[name=vue]').selectOption('prevision');
  await page.locator('main section', { hasText: 'Périscolaire' }).first().locator('table').waitFor();
  await page.waitForTimeout(300);
  const peri = await page.locator('main section', { hasText: 'Périscolaire' }).first().innerText();
  assert.match(peri, /Mercredis\s+4 h\s+1 présence\s+12 h\s+3 présences\s+16 h\s+4 présences\s+4 h/, '3 ans : 4 h ; 6 ans et + : mars (dossier précédent) + septembre + décembre estimé sur décembre 2025');
  const extra = await page.locator('main section', { hasText: 'Extrascolaire' }).first().innerText();
  assert.match(extra, /Vacances Toussaint\s+8 h/);
  const jeunes = await page.locator('main section', { hasText: 'Collégiens (PS Jeunes)' }).first().innerText();
  assert.match(jeunes, /Soirées ADO\s+3 h/);
  assert.match(await page.locator('main').innerText(), /Encaissé[\s\S]*Périscolaire[\s\S]*7,00/);
  await page.getByRole('button', { name: /Exporter pour Excel/ }).click();
  const saved = await page.evaluate(() => window.__saved);
  assert.match(saved[0].fileName, /Déclaration CAF 2026 prévision/);
  assert.match(saved[0].text, /Périscolaire;Mercredis;3 ans;1;4/);
  await page.getByRole('button', { name: 'Imprimer' }).click();
  const printed = await page.evaluate(() => window.__printed);
  assert.match(printed[0].html, /Déclaration CAF 2026/);
  assert.deepEqual(errors, []);
});

test('Déclaration CAF : avertit quand l’année scolaire précédente manque, heures modifiables', async () => {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' }, clock: '2026-11-18T10:00:00' });
  await page.locator('nav').getByText('Déclaration CAF', { exact: true }).click();
  await page.locator('main select[name=annee]').selectOption('2026');
  assert.match(await page.locator('main p.error').innerText(), /2025-2026 n'est pas dans l'appli : janvier à août 2026/);
  await page.locator('main input[name="h-mercrediMatin"]').fill('3,5');
  await page.locator('main input[name="h-mercrediMatin"]').blur();
  await page.waitForTimeout(200);
  assert.match(await page.locator('main section', { hasText: 'Périscolaire' }).first().innerText(), /Mercredis\s+3,5 h/);
  const o = await page.evaluate(() => window.__appended);
  assert.ok(o.some((x) => x.path.join('.') === 'params.cafAutres.mercrediMatin' && x.value === 3.5));
  assert.deepEqual(errors, []);
});

test('Paramètres : une journée exceptionnelle peut être comptée en périscolaire pour la CAF', async () => {
  const s = miniState();
  s.extraDates.exceptionnel = ['2026-11-12'];
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Paramètres', { exact: true }).click();
  await page.locator('select[name="exc-type-2026-11-12"]').selectOption('peri');
  await page.locator('input[name=adresse-asso]').fill('1 place Saint-Médard 75005 Paris');
  await page.locator('input[name=adresse-asso]').blur();
  await page.waitForTimeout(200);
  const o = await page.evaluate(() => window.__appended);
  assert.ok(o.some((x) => x.path.join('.') === 'params.exceptionnelType.2026-11-12' && x.value === 'peri'));
  assert.ok(o.some((x) => x.path.join('.') === 'params.attestation.adresseAsso'));
  assert.deepEqual(errors, []);
});
