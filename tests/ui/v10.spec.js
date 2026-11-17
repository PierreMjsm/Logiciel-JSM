import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState } from '../core/fixtures/mini-state.js';
import { tallyCsv, tallyLigne } from '../core/fixtures/tally-csv.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const nav = (page, label) => (label === 'Pré-inscriptions' ? page.locator('nav a[data-id=preinscriptions]').click() : page.locator('nav').getByText(label, { exact: true }).click());
const ops = (page) => page.evaluate(() => window.__appended);
const win = (page, k) => page.evaluate((k) => window[k], k);

// Deux exports Tally : l'ancien et le nouveau contiennent la même réponse sub1 ; le nouveau a aussi Lina.
const FILES = [
  { nom: 'Plateforme_d_adhesion_Submissions_2026-11-15.csv', mtime: 1, text: tallyCsv([tallyLigne()]) },
  { nom: 'Plateforme_d_adhesion_Submissions_2026-11-20.csv', mtime: 2, text: tallyCsv([tallyLigne(), tallyLigne({ 0: 'sub2', 'Nom de l': 'Petit', 'Prénom': 'Lina', 'Adresse e-mail ': 'petit@example.fr', 'Téléphone': '0611223344', 'Date de Naissance': '2019-05-02', 'Submitted at': '2026-11-19 08:00:00' })]) },
  { nom: 'releve-banque.csv', mtime: 3, text: 'Date;Libellé;Montant\n01/11/2026;CB;12' },
];

test('exports Tally : réponses communes comptées une fois, autre CSV ignoré ; refuser une inscription', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' }, win: { __preFile: 'Inscriptions Tally', __preFiles: FILES } });
  await nav(page, 'Pré-inscriptions');
  await page.locator('main tbody tr', { hasText: 'LINA' }).waitFor();
  assert.equal(await page.locator('main tbody tr').count(), 2);
  assert.match(await page.locator('main').innerText(), /2 export\(s\) Tally/);
  const lina = page.locator('main tbody tr', { hasText: 'LINA' });
  await lina.getByRole('button', { name: 'Refuser' }).click();
  const op = (await ops(page)).find((o) => o.path.join('.') === 'preinscriptions.tally-sub2');
  assert.equal(op.value.refusee, true);
  assert.match(await page.locator('main tbody tr', { hasText: 'LINA' }).innerText(), /Refusée/);
  assert.equal((await ops(page)).filter((o) => o.path[0] === 'families').length, 0);
  assert.deepEqual(errors, []);
});

test('accepter : les pièces jointes plus récentes remplacent les anciennes, les plus anciennes sont gardées', async () => {
  const s = miniState();
  s.children.c1.pieces = { vaccins: '2026-11-20 10:00:00', photo: '2026-09-01 10:00:00' };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' }, win: { __preFile: 'Inscriptions Tally', __preFiles: FILES.slice(0, 1) } });
  await nav(page, 'Pré-inscriptions');
  const row = page.locator('main tbody tr', { hasText: 'LOUISE' });
  await row.getByRole('button', { name: /Accepter/ }).click();
  await page.locator('.modal').getByRole('button', { name: 'Valider' }).click();
  await page.locator('main tbody tr', { hasText: 'LOUISE' }).filter({ hasText: 'Traitée' }).waitFor();
  await page.waitForFunction(() => (window.__downloads || []).length === 2);
  const dl = await win(page, '__downloads');
  assert.deepEqual(dl.map((d) => [d.base, d.remplacer]), [['Attestation ayant droit', true], ['Photo', true]], 'vaccins plus récents déjà dans le dossier : gardés');
  const paths = Object.fromEntries((await ops(page)).map((o) => [o.path.join('.'), o.value]));
  assert.equal(paths['children.c1.pieces.photo'], '2026-11-15 17:15:15');
  assert.equal(paths['children.c1.pieces.ayantDroit'], '2026-11-15 17:15:15');
  assert.equal(paths['children.c1.pieces.vaccins'], undefined);
  assert.deepEqual(errors, []);
});

test('paramètres : choisir où ranger les dossiers des enfants', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Paramètres');
  await page.getByRole('button', { name: 'Fiches PDF' }).click();
  const sec = page.locator('section', { hasText: 'Dossiers des enfants' });
  await sec.getByText(/Dossiers enfants/).first().waitFor();
  await sec.getByRole('button', { name: /Changer/ }).click();
  await sec.getByText('D:/OneDrive/Enfants JSM').waitFor();
  assert.deepEqual(errors, []);
});

const TALLY = {
  questions: [{ id: 'q1', type: 'INPUT_TEXT', title: "Nom de l'enfant : ", fields: [] }, { id: 'q2', type: 'INPUT_TEXT', title: "Prénom de l'enfant", fields: [] },
    { id: 'q3', type: 'INPUT_DATE', title: 'Date de Naissance', fields: [] }, { id: 'q4', type: 'INPUT_EMAIL', title: 'Adresse e-mail ', fields: [] }],
  submissions: [{ id: 'tsub1', isCompleted: true, submittedAt: '2026-11-18T09:00:00.000Z', responses: [
    { questionId: 'q1', answer: 'Petit' }, { questionId: 'q2', answer: 'Lina' }, { questionId: 'q3', answer: '2019-05-02' }, { questionId: 'q4', answer: 'petit@example.fr' }] }],
};

test('Tally en direct : réponses lues sans export', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre', tally: { formulaire: 'D4LrYR', configuree: true } }, win: { __preTally: TALLY } });
  await nav(page, 'Pré-inscriptions');
  await page.locator('main tbody tr', { hasText: 'LINA' }).waitFor();
  assert.match(await page.locator('main header').innerText(), /Tally en direct/);
  assert.deepEqual(errors, []);
});

test('connexion Tally : lien du formulaire, clé API, test, enregistrement', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Pré-inscriptions');
  await page.locator('main').getByRole('button', { name: /Connexion Tally/ }).first().click();
  const m = page.locator('.modal');
  assert.equal(await m.locator('input[name=formulaire]').inputValue(), 'https://tally.so/forms/D4LrYR/submissions');
  await m.locator('input[name=cle]').fill('tly-exemple');
  await m.getByRole('button', { name: 'Tester' }).click();
  await m.getByText(/2 réponse/).waitFor();
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  assert.deepEqual(await win(page, '__tallyReglages'), { formulaire: 'https://tally.so/forms/D4LrYR/submissions', cle: 'tly-exemple' });
  assert.deepEqual(errors, []);
});

test('au démarrage : rappel des nouvelles pré-inscriptions Tally', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre', tally: { formulaire: 'D4LrYR', configuree: true } }, win: { __preTally: TALLY } });
  await page.locator('nav').getByText('Pré-inscriptions (1)').waitFor();
  assert.match(await page.locator('.toast').last().innerText(), /1 nouvelle pré-inscription/);
  assert.deepEqual(errors, []);
});
