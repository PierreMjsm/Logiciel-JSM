import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const nav = (page, label) => page.locator('nav').getByText(label, { exact: true }).click();

test('enfants: adhésion et dossier visibles, filtre « adhésion à régler »', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  const row = page.locator('main tbody tr', { hasText: 'SHERYNE' });
  assert.match(await row.innerText(), /Adhésion à régler/);
  assert.match(await page.locator('main tbody tr', { hasText: 'LYNESS' }).innerText(), /Adhérent/);
  assert.match(await page.locator('main tbody tr', { hasText: 'LYNESS' }).innerText(), /Manque : Vaccins/);
  await page.locator('main select[name=adh]').selectOption('due');
  assert.equal(await page.locator('main tbody tr').count(), 2);
  assert.deepEqual(errors, []);
});

test('fiche enfant: documents cochables et changement de famille possible', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.locator('main tbody tr', { hasText: 'LYNESS' }).click();
  await page.locator('.modal input[name="doc-vaccins"]').check();
  await page.locator('.modal select[name=familyId]').selectOption('f2');
  await page.locator('.modal').getByRole('button', { name: 'Enregistrer' }).click();
  const ops = (await page.evaluate(() => window.__appended)).map((o) => [o.path.join('.'), o.value]);
  assert.ok(ops.some(([p, v]) => p === 'children.c2.documents.vaccins' && v === true));
  assert.ok(ops.some(([p, v]) => p === 'children.c2.familyId' && v === 'f2'));
});

test('grille Pédibus: C proposé pour un collégien, tarif collégien dans Paramètres', async () => {
  const s = miniState();
  s.children.c1.groupes = [{ from: null, groupe: 'Collégiens' }];
  const { page } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Présences');
  const c = page.locator('td.c[data-k="c1|2026-09-01|"]');
  await c.click();
  assert.equal(await c.innerText(), 'C');
  await page.keyboard.press('p');
  await page.keyboard.press('c');
  assert.equal(await c.innerText(), 'C');
  await nav(page, 'Paramètres');
  assert.equal(await page.locator('main input[name="tarif-collegien"]').inputValue(), '1.5');
});

test('règlement: on voit si le montant comprend l\'adhésion', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Règlements & banque');
  await page.getByRole('button', { name: 'Nouveau règlement' }).click();
  const m = page.locator('.modal');
  await m.locator('select[name=familyId]').selectOption('f1');
  await m.locator('input[name=montant]').fill('5');
  await m.getByRole('button', { name: /Répartir automatiquement/ }).click();
  assert.match(await m.innerText(), /Comprend l'adhésion de : SHERYNE/);
});

test('statistiques CAF: sections séparées et export CSV', async () => {
  const s = miniState();
  mark(s, 'c2', 'pedibus', '2026-09-07', 'P');
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c5', 'toussaint', '2026-10-19', 'P');
  const { page } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Statistiques CAF');
  await page.locator('main h2', { hasText: 'Soirées ADO' }).waitFor();
  const t = await page.locator('main').innerText();
  for (const title of ['Pédibus', 'Pédibus collégiens', 'Mercredis', 'Vacances et journées exceptionnelles', 'Soirées ADO']) assert.ok(t.includes(title), title);
  await page.getByRole('button', { name: 'Exporter tout pour Excel (CSV)' }).click();
  const saved = await page.evaluate(() => window.__saved);
  assert.match(saved[0].fileName, /^CAF .*\.csv$/);
  assert.match(saved[0].text, /ROSALIE/);
  assert.match(saved[0].text, /Toussaint/);
});

test('mailings: option anciennes familles', async () => {
  const s = miniState();
  s.families.f2.mails = 'ancien@x.fr';
  s.children.c5.groupes = [{ from: null, groupe: 'Plus présent' }];
  const { page } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Mailings');
  assert.ok(!(await page.locator('main textarea').inputValue()).includes('ancien@x.fr'));
  await page.locator('main input[name=anciens]').check();
  assert.ok((await page.locator('main textarea').inputValue()).includes('ancien@x.fr'));
});
