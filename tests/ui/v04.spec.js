import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const nav = (page, label) => page.locator('nav').getByText(label, { exact: true }).click();
const ops = (page) => page.evaluate(() => window.__appended);

test('fiche enfant: jours habituels, puis remplissage des présences à venir', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.locator('main tbody tr', { hasText: 'JULES' }).click();
  await page.locator('.modal input[name="plan-pedibus-1"]').check();
  await page.locator('.modal input[name="plan-mercredi-aprem"]').check();
  await page.locator('.modal input[name="plan-from"]').fill('2027-06-21');
  await page.locator('.modal').getByRole('button', { name: 'Enregistrer' }).click();
  const o = await ops(page);
  assert.ok(o.some((x) => x.path.join('.') === 'children.c2.planning.pedibus' && JSON.stringify(x.value) === '[1]'));
  assert.ok(o.some((x) => x.path[1] === 'c2|pedibus|2027-06-21|' && x.value === 'P'));
  assert.ok(o.some((x) => x.path[1] === 'c2|mercredi|2027-06-23|aprem' && x.value === 'P'));
  assert.deepEqual(errors, []);
});

test('grille: remplir d\'après les jours habituels pour tous les enfants', async () => {
  const s = miniState();
  s.children.c1.planning = { pedibus: [1, 2] };
  s.children.c3.planning = { pedibus: [5] };
  s.children.c1.inscriptions.ktJeudi = false;
  s.children.c3.inscriptions.ktJeudi = false;
  const { page } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Présences');
  await page.getByRole('button', { name: /Remplir d'après les jours habituels/ }).click();
  const m = page.locator('.modal');
  await m.locator('input[name=from]').fill('2027-06-21');
  await m.locator('input[name=to]').fill('2027-06-25');
  await m.getByText(/3 présence\(s\) à ajouter/).waitFor();
  await m.getByRole('button', { name: 'Remplir' }).click();
  const o = await ops(page);
  assert.deepEqual(o.map((x) => x.path[1]).sort(), ['c1|pedibus|2027-06-21|', 'c1|pedibus|2027-06-22|', 'c3|pedibus|2027-06-25|']);
});

test('grille: inscrire des enfants depuis la grille avec leurs jours habituels', async () => {
  const s = miniState();
  s.children.c5.inscriptions.mercredi = false;
  const { page } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Présences');
  await page.locator('select[name=activity]').selectOption('mercredi');
  await page.getByRole('button', { name: /Inscrire des enfants/ }).click();
  const m = page.locator('.modal');
  await m.locator('input[type=search]').fill('zoe');
  await m.locator('label', { hasText: 'ZOE' }).locator('input').check();
  await m.locator('input[name="plan-mercredi-matin"]').check();
  await m.getByRole('button', { name: /Inscrire/ }).click();
  const o = await ops(page);
  assert.ok(o.some((x) => x.path.join('.') === 'children.c5.inscriptions.mercredi' && x.value === true));
  assert.ok(o.some((x) => x.path.join('.') === 'children.c5.planning.mercredi'));
  await page.locator('td.name', { hasText: 'MOREAU ZOE' }).waitFor();
});

test('grille: clic sur le nom d\'un enfant pour régler ses jours habituels', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Présences');
  await page.locator('td.name', { hasText: 'DURAND NOAH' }).click();
  await page.locator('.modal input[name="plan-pedibus-4"]').check();
  await page.locator('.modal').getByRole('button', { name: 'Enregistrer' }).click();
  const o = await ops(page);
  assert.ok(o.some((x) => x.path.join('.') === 'children.c3.planning.pedibus'));
});

test('attestation de présence: dates, heures, montants et PDF', async () => {
  const s = miniState();
  mark(s, 'c3', 'pedibus', '2026-11-16', 'P');
  mark(s, 'c3', 'mercredi', '2026-11-18', 'P', 'matin');
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Attestation');
  await page.locator('main select[name=child]').selectOption({ label: 'DURAND NOAH' });
  await page.locator('main input[name=from]').fill('2026-11-01');
  await page.locator('main input[name=to]').fill('2026-11-30');
  const t = await page.locator('main').innerText();
  assert.match(t, /lundi 16\/11\/2026/);
  assert.match(t, /mercredi 18\/11\/2026 \(matin\)/);
  assert.match(t, /2 jour/);
  await page.getByRole('button', { name: 'Enregistrer en PDF' }).click();
  const printed = await page.evaluate(() => window.__printed);
  assert.match(printed[0].html, /atteste que l’enfant NOAH DURAND/);
  assert.match(printed[0].fileName, /^Attestation de présence DURAND NOAH/);
  assert.deepEqual(errors, []);
});

test('mailing par tranche d\'âge', async () => {
  const s = miniState();
  s.families.f2.mails = 'f2@x.fr';
  const { page } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Mailings');
  await page.locator('main select[name=groupe]').selectOption('3 ans');
  assert.equal(await page.locator('main textarea').inputValue(), 'f2@x.fr');
});

test('grille: absence KT (AKT) au clic et au clavier, uniquement les jours de KT', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Présences');
  const c = page.locator('td.c[data-k="c2|2026-09-17|"]'); // jeudi de KT
  for (let i = 0; i < 4; i++) await c.click();             // P, A, KT, AKT
  assert.equal(await c.innerText(), 'AKT');
  await c.click();
  assert.equal(await c.innerText(), '');
  await page.keyboard.press('k');
  await page.keyboard.press('a');                           // sur une case KT, A = absence KT
  assert.equal(await c.innerText(), 'AKT');
  const lundi = page.locator('td.c[data-k="c2|2026-09-14|"]');
  for (let i = 0; i < 3; i++) await lundi.click();          // P, A, vide (pas de KT le lundi)
  assert.equal(await lundi.innerText(), '');
  assert.match(await page.locator('.legend').innerText(), /absence KT/);
});

test('paramètres: page des règles de fonctionnement et notes personnelles', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Paramètres');
  await page.getByRole('button', { name: 'Règles de fonctionnement' }).click();
  const t = await page.locator('main').innerText();
  assert.match(t, /Remise 3e enfant/);
  assert.match(t, /AKT : absence au KT/);
  await page.locator('main textarea[name=notesRegles]').fill('Cadeau possible si arrêt en cours d\'année.');
  await page.locator('main textarea[name=notesRegles]').blur();
  const o = await page.evaluate(() => window.__appended);
  assert.ok(o.some((x) => x.path.join('.') === 'params.notesRegles'));
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.locator('main input[name="tarif-pedibus"]').waitFor();
  assert.deepEqual(errors, []);
});
