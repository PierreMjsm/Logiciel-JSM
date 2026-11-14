import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

function data() {
  const s = miniState();
  mark(s, 'c1', 'pedibus', '2026-11-12', 'P');
  mark(s, 'c2', 'pedibus', '2026-11-12', 'KT');
  mark(s, 'c3', 'pedibus', '2026-11-12', 'A');
  return s;
}

test('preview for Thursday 12/11/2026 shows school pages and a KT JEUDI page; A child absent', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Listes du jour').click();
  await page.locator('main input[type=date]').fill('2026-11-12');
  await page.locator('.sheet').first().waitFor();
  const text = await page.locator('.sheets').innerText();
  assert.match(text, /LISTE PRÉSENCE PÉDIBUS — MARCEL/);
  assert.match(text, /KT JEUDI/);
  assert.match(text, /⛪/);
  assert.ok(!text.includes('RAYAN'), 'absent child not listed');
  assert.match(text, /12\/11\/2026/);
  assert.deepEqual(errors, []);
});

test('PDF export sends one HTML document with a page per list', async () => {
  const { page } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Listes du jour').click();
  await page.locator('main input[type=date]').fill('2026-11-12');
  await page.getByRole('button', { name: 'Enregistrer en PDF' }).click();
  const printed = await page.evaluate(() => window.__printed);
  assert.equal(printed.length, 1);
  assert.equal(printed[0].fileName, 'Pédibus 12-11-2026.pdf');
  assert.equal((printed[0].html.match(/class="page"/g) || []).length, 3);
  assert.match(printed[0].html, /SHERYNE/);
});

test('a day without any list says so', async () => {
  const { page } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Listes du jour').click();
  await page.locator('main input[type=date]').fill('2026-11-15');
  await page.getByText(/Aucune liste/).waitFor();
});
