import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

test('onglet Heures CAF: tableau par activité et tranche, heures modifiables, export', async () => {
  const s = miniState();
  mark(s, 'c5', 'toussaint', '2026-10-19', 'P');
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Heures CAF', { exact: true }).click();
  await page.locator('main select[name=periode]').selectOption('annee');
  await page.locator('main input[name="h-vacancesJournee"]').fill('8');
  await page.locator('main input[name="h-vacancesJournee"]').blur();
  await page.locator('main input[name="h-mercrediMatin"]').fill('3,5');
  await page.locator('main input[name="h-mercrediMatin"]').blur();
  const t = await page.locator('main table.grid').innerText();
  assert.match(t, /Vacances Toussaint[\s\S]*8 h/);
  assert.match(t, /Mercredis[\s\S]*3,5 h/);
  assert.match(t, /Moins de 6 ans/);
  const o = await page.evaluate(() => window.__appended);
  assert.ok(o.some((x) => x.path.join('.') === 'params.cafAutres.mercrediMatin' && x.value === 3.5));
  await page.getByRole('button', { name: /Exporter pour Excel/ }).click();
  const saved = await page.evaluate(() => window.__saved);
  assert.match(saved[0].text, /Vacances Toussaint/);
  assert.deepEqual(errors, []);
});
