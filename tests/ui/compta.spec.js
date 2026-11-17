import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

function data() {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  s.payments.p1 = { familyId: 'f2', childId: 'c5', date: '2026-09-10', montant: 5, mode: 'especes', affectations: [{ poste: 'adhesion', montant: 5 }] };
  return s;
}

test('families table shows statuses; unpaid filter; drawer shows postes and copies the recap', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Compta familles').click();
  await page.locator('main table.grid').waitFor();
  const t = await page.locator('main tbody').innerText();
  assert.match(t, /DURAND[\s\S]*Impayé/);
  assert.match(t, /MOREAU[\s\S]*À jour/);
  await page.locator('main select[name=statut]').selectOption('Impayé');
  assert.equal(await page.locator('main tbody tr').count(), 1);
  await page.locator('main tbody tr', { hasText: 'DURAND' }).click();
  const drawer = page.locator('.drawer');
  await drawer.waitFor();
  assert.match(await drawer.innerText(), /Mercredis T1/);
  assert.match(await drawer.innerText(), /RESTE À PAYER/);
  await drawer.getByRole('button', { name: 'Copier le récapitulatif' }).click();
  const copied = await page.evaluate(() => window.__copied);
  assert.match(copied[0], /Bonjour M\. \/ Mme DURAND/);
  await drawer.getByRole('button', { name: 'Ouvrir dans la messagerie' }).click();
  const opened = await page.evaluate(() => window.__opened);
  assert.match(opened[0], /^mailto:famille\.durand%40example\.fr/);
  assert.deepEqual(errors, []);
});
