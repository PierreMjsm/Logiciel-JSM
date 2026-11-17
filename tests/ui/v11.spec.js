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
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('fiche enfant : photo d’identité affichée, et changeable', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.locator('main tbody tr', { hasText: 'LOUISE' }).click();
  const m = page.locator('.modal');
  await m.locator('.photo-enfant').getByText('Pas de photo').waitFor();
  await m.getByRole('button', { name: /Changer la photo|Ajouter une photo/ }).click();
  await m.locator('.photo-enfant img').waitFor();
  assert.equal(await m.locator('.photo-enfant img').getAttribute('src'), PNG);
  assert.equal(await win(page, '__photoChoisie'), 'DURAND Louise (c1)');
  assert.deepEqual(errors, []);
});

test('photo déjà dans le dossier (reçue par Tally) : affichée à l’ouverture', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' }, win: { __photo: PNG } });
  await nav(page, 'Enfants');
  await page.locator('main tbody tr', { hasText: 'LOUISE' }).click();
  await page.locator('.modal .photo-enfant img').waitFor();
  assert.deepEqual(errors, []);
});

test('« Plus présent » : confirmation, documents et renseignements effacés, dossier supprimé', async () => {
  const s = miniState();
  s.children.c5.fiche = { secu: '1 99' };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.locator('main tbody tr', { hasText: 'ZOE' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Marquer « Plus présent »' }).click();
  const c = page.locator('.modal', { hasText: 'Départ de' });
  assert.match(await c.innerText(), /nom, prénom, date de naissance/i);
  assert.equal(await c.locator('input[name=effacer]').isChecked(), false, 'par défaut on garde les documents');
  await c.locator('input[name=effacer]').check();
  await c.getByRole('button', { name: 'Confirmer' }).click();
  await page.waitForFunction(() => (window.__supprimes || []).length === 1);
  const o = Object.fromEntries((await ops(page)).map((x) => [x.path.join('.'), x.value]));
  assert.equal(o['children.c5.fiche'], null);
  assert.equal(o['families.f2.telMaman'], '');
  assert.equal(o['children.c5.groupes'].at(-1).groupe, 'Plus présent');
  assert.deepEqual(await win(page, '__supprimes'), ['MOREAU Zoe (c5)']);
  assert.equal(await page.locator('.modal').count(), 0, 'fiche fermée');
  assert.deepEqual(errors, []);
});

test('« Plus présent » sans effacer : dossier gardé', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.locator('main tbody tr', { hasText: 'ZOE' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Marquer « Plus présent »' }).click();
  const c = page.locator('.modal', { hasText: 'Départ de' });
  await c.getByRole('button', { name: 'Confirmer' }).click();
  await page.waitForFunction(() => (window.__appended || []).length === 1);
  assert.equal(await win(page, '__supprimes'), undefined);
  assert.deepEqual(errors, []);
});
