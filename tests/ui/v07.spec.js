import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const nav = (page, label) => page.locator('nav').getByText(label, { exact: true }).click();
const ops = (page) => page.evaluate(() => window.__appended);

test("nouvel enfant, nouvelle famille : le nom de l'enfant remplit le nom de famille", async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.getByRole('button', { name: 'Nouvel enfant' }).click();
  const m = page.locator('.modal');
  await m.locator('input[name=prenom]').fill('lina');
  await m.locator('input[name=enfantNom]').fill('petit');
  assert.equal(await m.locator('input[name=nom]').inputValue(), 'PETIT');
  await m.locator('input[name=naissance]').fill('2019-05-02');
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  const o = await ops(page);
  const fam = o.find((x) => x.path[0] === 'families' && x.path.length === 2);
  const kid = o.find((x) => x.path[0] === 'children' && x.path.length === 2);
  assert.equal(fam.value.nom, 'PETIT');
  assert.equal(kid.value.familyId, fam.path[1]);
  assert.ok(!kid.value.nom, 'même nom que la famille : rien de stocké en plus');
  assert.deepEqual(errors, []);
});

test("famille existante : le nom est pré-rempli, et un nom différent est gardé pour l'enfant seul", async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.getByRole('button', { name: 'Nouvel enfant' }).click();
  const m = page.locator('.modal');
  await m.locator('select[name=familyId]').selectOption({ label: 'DURAND — famille.durand@example.fr ; b@y.fr' });
  assert.equal(await m.locator('input[name=enfantNom]').inputValue(), 'DURAND');
  await m.locator('input[name=prenom]').fill('ADAM');
  await m.locator('input[name=enfantNom]').fill('MARTIN');
  assert.equal(await m.locator('input[name=nom]').inputValue(), 'DURAND', 'la famille ne change pas');
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  const o = await ops(page);
  const kid = o.find((x) => x.path[0] === 'children' && x.path.length === 2);
  assert.equal(kid.value.nom, 'MARTIN');
  assert.ok(!o.some((x) => x.path[0] === 'families'));
  await page.locator('main tbody tr', { hasText: 'ADAM' }).first().waitFor();
  assert.match(await page.locator('main tbody tr', { hasText: 'ADAM' }).first().innerText(), /MARTIN/);
  assert.deepEqual(errors, []);
});

function compta() {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  return s;
}

test('compta : « + Règlement » sur une ligne de poste, enfant et poste déjà remplis', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: compta(), config: { profil: 'Pierre' } });
  await nav(page, 'Compta familles');
  await page.locator('main tbody tr', { hasText: 'DURAND' }).click();
  const drawer = page.locator('.drawer');
  await drawer.locator('tr', { hasText: 'Mercredis T1' }).getByRole('button', { name: '+ Règlement' }).click();
  const m = page.locator('.modal');
  assert.match(await m.innerText(), /NOAH/);
  assert.match(await m.innerText(), /Mercredis T1/);
  assert.match(await m.innerText(), /Famille DURAND[\s\S]*Impayé/);
  assert.equal(await m.locator('input[name=montant]').inputValue(), '7');
  await m.locator('select[name=mode]').selectOption('especes');
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  const o = await ops(page);
  const pay = o.find((x) => x.path[0] === 'payments' && x.path.length === 2);
  assert.equal(pay.value.familyId, 'f1');
  assert.equal(pay.value.childId, 'c3');
  assert.equal(pay.value.montant, 7);
  assert.equal(pay.value.mode, 'especes');
  assert.deepEqual(pay.value.affectations, [{ poste: 'mercredi-T1', montant: 7, childId: 'c3' }]);
  assert.deepEqual(errors, []);
});

test('grille : clic sur le nom → « + Règlement » pour le poste de la grille affichée', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: compta(), config: { profil: 'Pierre' } });
  await nav(page, 'Présences');
  await page.locator('select[name=activity]').selectOption('mercredi');
  await page.locator('select[name=tri]').selectOption('1');
  await page.locator('td.name', { hasText: 'NOAH' }).click();
  await page.locator('.modal').getByRole('button', { name: '+ Règlement' }).click();
  const m = page.locator('.modal', { hasText: 'Règlement rapide' });
  assert.match(await m.innerText(), /Mercredis T1/);
  assert.equal(await m.locator('input[name=montant]').inputValue(), '7');
  await m.locator('input[name=numero]').fill('1234567');
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  const pay = (await ops(page)).find((x) => x.path[0] === 'payments' && x.path.length === 2);
  assert.equal(pay.value.mode, 'cheque');
  assert.equal(pay.value.numero, '1234567');
  assert.ok(pay.value.moisEncaissement);
  assert.deepEqual(errors, []);
});

test('formulaire complet : « Enregistrer et nouveau » rouvre un formulaire vide pour la famille suivante', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: compta(), config: { profil: 'Pierre' } });
  await nav(page, 'Compta familles');
  await page.locator('main').getByRole('button', { name: 'Nouveau règlement' }).click();
  let m = page.locator('.modal');
  await m.locator('select[name=familyId]').selectOption('f1');
  await m.locator('input[name=date]').fill('2026-11-10');
  await m.locator('input[name=montant]').fill('7');
  await m.locator('select[name=aff-poste-0]').selectOption('mercredi-T1');
  await m.locator('input[name=aff-montant-0]').fill('7');
  await m.getByRole('button', { name: 'Enregistrer et nouveau' }).click();
  m = page.locator('.modal');
  await m.locator('select[name=familyId]').waitFor();
  assert.equal(await m.locator('select[name=familyId]').inputValue(), '', 'famille à choisir');
  assert.equal(await m.locator('input[name=montant]').inputValue(), '');
  assert.equal(await m.locator('input[name=date]').inputValue(), '2026-11-10', 'la date de réception est gardée');
  const pays = (await ops(page)).filter((x) => x.path[0] === 'payments' && x.path.length === 2);
  assert.equal(pays.length, 1);
  assert.equal(pays[0].value.familyId, 'f1');
  assert.deepEqual(errors, []);
});
