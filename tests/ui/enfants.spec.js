import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const go = async (page) => { await page.locator('nav').getByText('Enfants', { exact: true }).click(); await page.locator('main table.grid').waitFor(); };

test('sorting by école then editing a prénom changes only that child', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await go(page);
  await page.locator('main th', { hasText: 'École' }).click();
  const first = await page.locator('main tbody tr').first().innerText();
  assert.match(first, /BUFFON/);
  await page.locator('main tbody tr', { hasText: 'NOAH' }).click();
  assert.ok(!/\bnull\b/.test(await page.locator('.modal').innerText()), 'no stray "null" text in the form');
  const prenom = page.locator('.modal input[name=prenom]');
  await prenom.fill('NOAHE');
  await page.locator('.modal').getByRole('button', { name: 'Enregistrer' }).click();
  const ops = await page.evaluate(() => window.__appended);
  assert.deepEqual(ops.map((o) => [o.path.join('.'), o.value]), [['children.c3.prenom', 'NOAHE']]);
  assert.match(await page.locator('main tbody').innerText(), /NOAHE/);
  assert.match(await page.locator('main tbody').innerText(), /LOUISE/);
  assert.deepEqual(errors, []);
});

test('search filters instantly and new child joins an existing family', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await go(page);
  await page.locator('main input[type=search]').fill('liy');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('main tbody tr').count(), 1);
  await page.getByRole('button', { name: 'Nouvel enfant' }).click();
  await page.locator('.modal select[name=familyId]').selectOption({ label: 'DURAND — famille.durand@example.fr ; b@y.fr' });
  await page.locator('.modal input[name=prenom]').fill('ADAM');
  await page.locator('.modal input[name=naissance]').fill('2021-05-02');
  await page.locator('.modal').getByRole('button', { name: 'Enregistrer' }).click();
  const ops = await page.evaluate(() => window.__appended);
  const created = ops.find((o) => o.path[0] === 'children' && o.path.length === 2);
  assert.equal(created.value.familyId, 'f1');
  assert.equal(created.value.prenom, 'ADAM');
  assert.equal(created.value.groupes[0].groupe, '4-5 ans');
  assert.deepEqual(errors, []);
});

test('bulk group change adds a dated change to the selected children', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await go(page);
  await page.locator('main tbody tr', { hasText: 'ZOE' }).locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: /Passage de groupe/ }).click();
  await page.locator('.modal input[type=date]').fill('2027-07-05');
  await page.locator('.modal select').selectOption('4-5 ans');
  await page.locator('.modal').getByRole('button', { name: 'Appliquer' }).click();
  const ops = await page.evaluate(() => window.__appended);
  const op = ops.find((o) => o.path.join('.') === 'children.c5.groupes');
  assert.deepEqual(op.value.at(-1), { from: '2027-07-05', groupe: '4-5 ans' });
});
