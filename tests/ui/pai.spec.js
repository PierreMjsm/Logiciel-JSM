import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const CLOCK = '2026-11-22T10:00:00';

test('onglet P.A.I de la fiche enfant : infos, validité, rappel, fiche de suivi jointe', async () => {
  const s = miniState();
  s.children.c1.pai = false;
  s.children.c3.pai = false;
  s.children.c5.pai = false;
  s.children.c1.fiche = { traitement: 'Asthme : Ventoline' };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' }, clock: CLOCK });
  await page.locator('nav').getByText('Enfants', { exact: true }).click();
  await page.locator('main tbody tr', { hasText: 'LOUISE' }).click();
  await page.locator('.modal').getByRole('button', { name: /^P\.A\.I/ }).click();
  const m = page.locator('.modal');
  assert.match(await m.innerText(), /Indiqué à l'inscription : Asthme : Ventoline/);
  await m.locator('input[name=pai]').check();
  await m.locator('input[name=pai-motif]').fill('Asthme');
  await m.locator('textarea[name=pai-conduite]').fill('2 bouffées de Ventoline, appeler les parents');
  await m.locator('input[name=pai-fin]').fill('2026-12-10');
  await m.locator('input[name=pai-prevenir]').fill('20');
  assert.match(await m.locator('.pai-etat').innerText(), /Expire le 10\/12\/2026 \(dans 18 jours\)/);
  await m.getByRole('button', { name: /Joindre la fiche de suivi/ }).click();
  await m.getByRole('button', { name: 'Ouvrir la fiche de suivi' }).click();
  const w = await page.evaluate(() => ({ j: window.__joints, o: window.__fichiersOuverts }));
  assert.deepEqual(w.j[0], ['DURAND Louise (c1)', { nom: 'PAI - fiche de suivi', titre: 'Fiche de suivi du PAI de LOUISE' }]);
  assert.deepEqual(w.o[0], ['DURAND Louise (c1)', 'PAI - fiche de suivi.pdf']);
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  const o = await page.evaluate(() => window.__appended.map((x) => [x.path.join('.'), x.value]));
  const v = Object.fromEntries(o);
  assert.equal(v['children.c1.pai'], true);
  assert.equal(v['children.c1.paiInfo.fichier'], 'PAI - fiche de suivi.pdf', 'enregistré tout de suite');
  const info = v['children.c1.paiInfo'] || {};
  const get = (k) => v[`children.c1.paiInfo.${k}`] ?? info[k];
  assert.deepEqual([get('motif'), get('conduite'), get('fin'), get('prevenir')], ['Asthme', '2 bouffées de Ventoline, appeler les parents', '2026-12-10', 20]);
  // L'étoile apparaît à côté du prénom, et le rappel s'affiche.
  assert.match(await page.locator('main tbody tr', { hasText: 'LOUISE' }).innerText(), /LOUISE \*/);
  await page.locator('#pai-banner').waitFor();
  assert.match(await page.locator('#pai-banner').innerText(), /LOUISE DURAND\s*: expire le 10\/12\/2026/);
  assert.deepEqual(errors, []);
});

test('rappel PAI au démarrage : bandeau, notification Windows une fois par jour, clic → onglet P.A.I', async () => {
  const s = miniState();
  s.children.c3.pai = true; s.children.c3.paiInfo = { fin: '2026-10-31', motif: 'Allergie arachide' };
  s.children.c5.pai = false;
  s.children.c1.pai = true; s.children.c1.paiInfo = { fin: '2027-09-01' };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' }, clock: CLOCK });
  await page.locator('#pai-banner').waitFor();
  const b = await page.locator('#pai-banner').innerText();
  assert.match(b, /PAI à vérifier/);
  assert.match(b, /NOAH DURAND\s*: expiré depuis le 31\/10\/2026/);
  assert.doesNotMatch(b, /LOUISE/, 'valable');
  const notifs = await page.evaluate(() => window.__notifs);
  assert.equal(notifs.length, 1);
  assert.match(notifs[0].titre, /1 PAI à vérifier/);
  await page.reload();
  await page.locator('#pai-banner').waitFor();
  assert.equal((await page.evaluate(() => window.__notifs || [])).length, 0, 'déjà notifié aujourd’hui');
  await page.locator('#pai-banner').getByText('NOAH DURAND').click();
  assert.equal(await page.locator('.modal input[name=pai-motif]').inputValue(), 'Allergie arachide');
  await page.locator('.modal').getByRole('button', { name: 'Annuler' }).click();
  // Fiches santé à emporter en sortie : le PAI y figure.
  await page.locator('nav a[data-id=trombi]').click();
  await page.getByRole('button', { name: 'Fiches santé (PAI)' }).click();
  assert.match(await page.locator('main').innerText(), /PAI : Allergie arachide \(valable jusqu'au 31\/10\/2026\)/);
  assert.deepEqual(errors, []);
});
