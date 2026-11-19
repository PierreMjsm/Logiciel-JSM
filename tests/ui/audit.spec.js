import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';
import { ENTETES, ligne } from '../core/fixtures/tally.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });
const nav = (page, label) => page.locator('nav').getByText(label, { exact: true }).click();
const ops = (page) => page.evaluate(() => window.__appended);

test('double clic sur « Enregistrer » un règlement : un seul règlement', async () => {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' }, win: { __appendDelay: 300 } });
  await nav(page, 'Compta familles');
  await page.locator('main tbody tr', { hasText: 'DURAND' }).click();
  await page.locator('.drawer tr', { hasText: 'Mercredis T1' }).getByRole('button', { name: '+ Règlement' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Enregistrer', exact: true }).dblclick();
  await page.waitForTimeout(900);
  assert.equal((await ops(page)).filter((o) => o.path[0] === 'payments' && o.path.length === 2).length, 1);
  assert.deepEqual(errors, []);
});

test('double clic sur « Valider » une pré-inscription : une seule famille', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' },
    win: { __appendDelay: 300, __preFile: 'Inscriptions', __preRows: [ENTETES, ligne({ Nom: 'Petit', 'Prénom': 'Lina', 'E-mail': 'petit@example.fr', 'Téléphone': '0611223344', 'Date de naissance': '02/05/2019' })] } });
  await page.locator('nav a[data-id=preinscriptions]').click();
  await page.locator('main tbody tr', { hasText: 'LINA' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Valider' }).dblclick();
  await page.waitForTimeout(900);
  assert.equal((await ops(page)).filter((o) => o.path[0] === 'families' && o.path.length === 2).length, 1);
  assert.deepEqual(errors, []);
});

test('changements de tarif : l’adhésion (annuelle) n’est pas proposée, puisqu’elle ne changerait rien', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await nav(page, 'Paramètres');
  await page.locator('select[name=ch-cle]').waitFor();
  const opts = await page.locator('section', { hasText: 'Changements de tarif' }).locator('select[name=ch-cle] option').evaluateAll((os) => os.map((o) => o.value));
  assert.ok(!opts.includes('adhesion'));
  assert.ok(opts.includes('pedibus'));
  assert.deepEqual(errors, []);
});

test('changer un enfant de famille : ses règlements le suivent, les règlements partagés sont signalés', async () => {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  s.payments = {
    p1: { familyId: 'f1', childId: 'c3', date: '2026-09-10', montant: 7, mode: 'especes', affectations: [{ poste: 'mercredi-T1', montant: 7, childId: 'c3' }] },
    p2: { familyId: 'f1', childId: '', date: '2026-09-10', montant: 12, mode: 'cheque', affectations: [{ poste: 'mercredi-T1', montant: 7, childId: 'c3' }, { poste: 'adhesion', montant: 5, childId: 'c1' }] },
  };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Enfants');
  await page.locator('main tbody tr', { hasText: 'NOAH' }).click();
  const m = page.locator('.modal');
  await m.locator('select[name=familyId]').selectOption('f2');
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  const c = page.locator('.modal', { hasText: 'Règlements' });
  assert.match(await c.innerText(), /1 règlement.*suivre/s);
  assert.match(await c.innerText(), /partagé/);
  await c.getByRole('button', { name: /Déplacer/ }).click();
  await page.waitForFunction(() => (window.__appended || []).some((o) => o.path.join('.') === 'payments.p1.familyId'));
  const o = Object.fromEntries((await ops(page)).map((x) => [x.path.join('.'), x.value]));
  assert.equal(o['payments.p1.familyId'], 'f2');
  assert.equal(o['payments.p2.familyId'], undefined);
  assert.equal(o['children.c3.familyId'], 'f2');
  assert.deepEqual(errors, []);
});

test('listes du jour : encadrement minimum affiché ; taux du mercredi réglables', async () => {
  const s = miniState();
  for (const id of ['c1', 'c2', 'c3', 'c5']) mark(s, id, 'toussaint', '2026-10-20', 'P');
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' } });
  await nav(page, 'Listes du jour');
  await page.locator('main header input[type=date]').fill('2026-10-20');
  await page.locator('main header input[type=date]').dispatchEvent('change');
  const enc = page.locator('main .encadrement');
  assert.match(await enc.innerText(), /Vacances Toussaint.*1 moins de 6 ans.*3 de 6 ans et plus.*2 animateurs/s);
  await nav(page, 'Paramètres');
  await page.locator('select[name=encadrement-mercredi]').selectOption('10-14');
  const op = (await ops(page)).at(-1);
  assert.equal(op.path.join('.'), 'params.encadrement');
  assert.deepEqual(op.value.mercredi, [10, 14]);
  assert.deepEqual(errors, []);
});
