import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

test('first launch asks for the profile, then shows navigation, status and version', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState() });
  await page.getByRole('button', { name: 'Katell' }).click();
  await page.locator('nav').getByText('Enfants').waitFor();
  for (const label of ['Présences', 'Listes du jour', 'Compta familles', 'Règlements & banque', 'Paramètres', 'Historique', 'Import Excel']) {
    assert.ok(await page.locator('nav').getByText(label, { exact: true }).isVisible(), label);
  }
  const status = await page.locator('#status').innerText();
  assert.match(status, /Katell/);
  assert.match(status, /v0\.2\.0/);
  assert.deepEqual(errors, []);
});

test('a remote change appears without reloading (history and status)', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Historique').click();
  await page.evaluate(() => window.__pushRemote([{ t: new Date().toISOString(), by: 'Lucas', dev: 'L', seq: 1, path: ['presences', 'c3|pedibus|2026-11-13|'], value: 'P' }]));
  await page.locator('main table').getByText('Lucas').waitFor({ timeout: 3000 });
  assert.match(await page.locator('main').innerText(), /AJAMRI RAYAN/);
  assert.deepEqual(errors, []);
});

test('empty folder: the app proposes the Excel import', async () => {
  const { page } = await openApp(browser, server.url, { base: null, config: { profil: 'Pierre' } });
  await page.getByText(/Importer mes fichiers Excel/).waitFor();
});

test('a failed write to the shared folder is retried, not lost', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await page.evaluate(() => {
    const real = window.jsm.append;
    let fails = 1;
    window.jsm.append = async (op) => { if (fails-- > 0) throw new Error('Drive indisponible'); return real(op); };
  });
  await page.locator('nav').getByText('Présences', { exact: true }).click();
  await page.locator('td.c[data-k="c3|2026-09-01|"]').click();
  await page.getByText(/pas encore enregistrée|réessai/i).first().waitFor();
  await page.waitForFunction(() => window.__appended.length === 1, null, { timeout: 15000 });
});
