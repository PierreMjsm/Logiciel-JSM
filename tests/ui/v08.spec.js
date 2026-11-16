import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const nav = (page, label) => page.locator('nav').getByText(label, { exact: true }).click();
const ops = (page) => page.evaluate(() => window.__appended);

// T1 réglé, T2 prévu (dans le futur pour toute date de test avant 2027).
function payeT1() {
  const s = miniState();
  s.children.c1.adhesionDejaReglee = true;
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c3', 'mercredi', '2027-04-21', 'P', 'matin');
  s.payments.p1 = { familyId: 'f1', childId: 'c3', date: '2026-09-10', montant: 7, mode: 'especes', affectations: [{ poste: 'mercredi-T1', montant: 7, childId: 'c3' }] };
  return s;
}

test('compta : une famille qui a payé le trimestre en cours est « À jour », le reste apparaît en prévu', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: payeT1(), config: { profil: 'Pierre' } });
  await nav(page, 'Compta familles');
  const row = page.locator('main tbody tr', { hasText: 'DURAND' });
  await row.waitFor();
  const t = await row.innerText();
  assert.match(t, /À jour/);
  assert.match(t, /14,00/, 'prévu sur l’année');
  await row.click();
  const d = page.locator('.drawer');
  assert.match(await d.innerText(), /Prévu sur l'année/);
  assert.match(await d.locator('tr', { hasText: 'Mercredis T3' }).innerText(), /à venir/);
  assert.deepEqual(errors, []);
});

test('année précédente : listée dans Paramètres, s’ouvre en consultation', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await page.evaluate(() => { window.__years = [{ label: '2025-2026', dossier: 'JSM' }]; });
  await nav(page, 'Paramètres');
  await page.getByRole('button', { name: /Années précédentes/ }).click();
  await page.locator('main').getByText('2025-2026', { exact: true }).waitFor();
  await page.locator('main').getByRole('button', { name: /Consulter/ }).click();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('__openedYear')), 'JSM');
  assert.deepEqual(errors, []);
});

test('consultation : bandeau visible et aucune modification possible', async () => {
  const s = miniState();
  const { page } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre', consultation: '2025-2026' } });
  const banner = page.locator('#consult-banner');
  await banner.waitFor();
  assert.match(await banner.innerText(), /2025-2026/);
  await nav(page, 'Présences');
  await page.locator('td[data-k]').first().click();
  await page.waitForTimeout(200);
  assert.equal((await ops(page)).length, 0);
  assert.match(await page.locator('.toast').last().innerText(), /consultation/);
  await banner.getByRole('button', { name: /Revenir/ }).click();
  await page.waitForLoadState();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('__closedYear')), '1');
});

test("compte rendu de l'année : imprimable depuis Statistiques et bilan", async () => {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Statistiques et bilan');
  await page.getByRole('button', { name: /compte rendu/i }).click();
  const printed = await page.evaluate(() => window.__printed);
  assert.equal(printed.length, 1);
  assert.match(printed[0].html, /Compte rendu de l.année 2026-2027/);
  assert.match(printed[0].html, /Mercredis/);
  assert.match(printed[0].html, /Heures CAF/);
  assert.match(printed[0].html, /Familles qui doivent encore/);
  assert.deepEqual(errors, []);
});

test('listes du jour : jamais de samedi ni de dimanche', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Listes du jour');
  const input = page.locator('main header input[type=date]');
  const wd = async () => new Date(`${await input.inputValue()}T12:00:00`).getDay();
  for (let i = 0; i < 6; i++) {
    assert.ok(![0, 6].includes(await wd()), await input.inputValue());
    await page.getByRole('button', { name: '◀' }).click();
  }
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: '▶' }).click();
    assert.ok(![0, 6].includes(await wd()), await input.inputValue());
  }
  assert.deepEqual(errors, []);
});

test('mails des impayés : préparés un par un, ouverts dans la messagerie, date notée', async () => {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  s.payments.p1 = { familyId: 'f2', childId: 'c5', date: '2026-09-10', montant: 5, mode: 'especes', affectations: [{ poste: 'adhesion', montant: 5, childId: 'c5' }] };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Compta familles');
  await page.getByRole('button', { name: /mails des impayés/ }).click();
  const m = page.locator('.modal');
  const row = m.locator('tr', { hasText: 'DURAND' });
  await row.waitFor();
  assert.equal(await m.locator('tr', { hasText: 'MOREAU' }).count(), 0, 'famille à jour : pas de mail');
  await row.getByRole('button', { name: 'Voir' }).click();
  assert.match(await m.locator('pre').innerText(), /RESTE À PAYER/);
  await row.getByRole('button', { name: /messagerie/ }).click();
  const opened = await page.evaluate(() => window.__opened);
  assert.match(opened[0], /^mailto:famille\.durand/);
  const op = (await ops(page)).find((o) => o.path.join('.') === 'families.f1.dernierRecap');
  assert.ok(op && /^\d{4}-\d\d-\d\d$/.test(op.value));
  assert.match(await m.locator('tr', { hasText: 'DURAND' }).innerText(), /ouvert le/);
  assert.deepEqual(errors, []);
});

test('paramètres : ajouter et retirer une journée exceptionnelle', async () => {
  const s = miniState();
  s.extraDates = { exceptionnel: ['2026-10-02'], ado: [] };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Paramètres');
  const sec = page.locator('section', { hasText: 'Journées exceptionnelles' });
  await sec.locator('input[name=exceptionnel-add]').fill('2027-03-12');
  await sec.locator('input[name=exceptionnel-add]').dispatchEvent('change');
  let op = (await ops(page)).at(-1);
  assert.equal(op.path.join('.'), 'extraDates.exceptionnel');
  assert.deepEqual(op.value, ['2026-10-02', '2027-03-12']);
  await sec.getByTitle('Retirer le 02/10/2026').click();
  op = (await ops(page)).at(-1);
  assert.deepEqual(op.value, ['2027-03-12']);
  assert.deepEqual(errors, []);
});
