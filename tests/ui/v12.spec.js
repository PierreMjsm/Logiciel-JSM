import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const nav = (page, label) => page.locator('nav').getByText(label, { exact: true }).click();
const ops = (page) => page.evaluate(() => window.__appended);
const win = (page, k) => page.evaluate((k) => window[k], k);

test('trombinoscope : par groupe avec photos, par âge, tout le monde ; impression à la demande', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' }, win: { __vignettes: ['DURAND Louise (c1)'] } });
  await nav(page, 'Trombinoscope');
  const main = page.locator('main');
  await main.locator('.trombi-carte', { hasText: 'Louise D.' }).locator('img').waitFor();
  assert.equal(await main.locator('.trombi-carte', { hasText: 'Jules D.' }).locator('img').count(), 0, 'pas de photo : initiales');
  assert.match(await main.locator('h2').first().innerText(), /ans/);
  await main.locator('select[name=mode]').selectOption('tous');
  assert.equal(await main.locator('h2').count(), 1);
  await main.locator('select[name=mode]').selectOption('age');
  await main.locator('h2', { hasText: '10 ans' }).waitFor();
  assert.equal((await win(page, '__printed') || []).length, 0, 'rien n’est imprimé sans le demander');
  await main.getByRole('button', { name: 'Imprimer' }).click();
  const [p] = await win(page, '__printed');
  assert.match(p.html, /Louise D\./);
  assert.match(p.html, /<img/);
  assert.deepEqual(errors, []);
});

test('fiches santé : enfants avec PAI ou difficultés, imprimables', async () => {
  const s = miniState();
  s.children.c3.fiche = { difficultes: 'Allergie arachides', traitement: 'Stylo adrénaline', urgence: 'Tante 0611111111' };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Trombinoscope');
  await page.getByRole('button', { name: 'Fiches santé (PAI)' }).click();
  const main = page.locator('main');
  await main.getByText('Stylo adrénaline').waitFor();
  assert.match(await main.innerText(), /Tante 0611111111/);
  await main.getByRole('button', { name: 'Imprimer' }).click();
  const [p] = await win(page, '__printed');
  assert.match(p.html, /Allergie arachides/);
  assert.deepEqual(errors, []);
});

test('enfants : mails des dossiers incomplets, préparés un par un, date notée', async () => {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.getByRole('button', { name: /dossiers incomplets/ }).click();
  const m = page.locator('.modal');
  const row = m.locator('tr', { hasText: 'DURAND' });
  assert.match(await row.innerText(), /NOAH.*Vaccins/s);
  await row.getByRole('button', { name: 'Voir' }).click();
  assert.match(await m.locator('pre').innerText(), /il nous manque/);
  await row.getByRole('button', { name: /messagerie/ }).click();
  assert.match((await win(page, '__opened'))[0], /^mailto:famille\.durand/);
  const op = (await ops(page)).find((o) => o.path.join('.') === 'families.f1.dernierRappelDossier');
  assert.ok(op);
  assert.deepEqual(errors, []);
});

test('enfants : années de présence dans la liste et dans la fiche (modifiables)', async () => {
  const s = miniState();
  s.children.c1.annees = ['2024-2025'];
  mark(s, 'c1', 'pedibus', '2026-11-12', 'P');
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  const row = page.locator('main tbody tr', { hasText: 'LOUISE' });
  assert.match(await row.innerText(), /2024-2025, 2026-2027/);
  await row.click();
  const m = page.locator('.modal');
  await m.locator('input[name=annees]').fill('2023-2024, 2024-2025');
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  const op = (await ops(page)).find((o) => o.path.join('.').startsWith('children.c1.annees'));
  assert.deepEqual(op.value, ['2023-2024', '2024-2025']);
  assert.deepEqual(errors, []);
});

test('enfants : « Déjà venu au Pédibus » montre tout le monde, anciens et années passées compris', async () => {
  const s = miniState();
  for (const c of Object.values(s.children)) c.inscriptions = {};
  mark(s, 'c1', 'pedibus', '2026-11-12', 'P');
  s.children.c5.groupes = [{ from: null, groupe: 'Plus présent' }];
  s.children.c5.activites = { '2024-2025': ['pedibus'] };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.locator('main select[name=deja]').selectOption('pedibus');
  const noms = await page.locator('main tbody tr').allInnerTexts();
  assert.equal(noms.length, 2);
  assert.ok(noms.some((t) => /LOUISE/.test(t)) && noms.some((t) => /ZOE/.test(t)));
  assert.deepEqual(errors, []);
});
