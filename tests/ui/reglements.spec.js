import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState, mark } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

function data() {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  s.payments.p1 = { familyId: 'f1', childId: 'c1', date: '2026-10-01', montant: 30, mode: 'cheque', numero: '111', moisEncaissement: '2026-11', affectations: [{ poste: 'adhesion', montant: 30 }], remis: false };
  s.payments.p2 = { familyId: 'f2', childId: 'c5', date: '2026-10-02', montant: 20, mode: 'cheque', numero: '222', moisEncaissement: '2026-12', affectations: [{ poste: 'adhesion', montant: 20 }], remis: false };
  return s;
}

test('payment form: affectations must add up to the amount before saving', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Règlements & banque').click();
  await page.getByRole('button', { name: 'Nouveau règlement' }).click();
  const m = page.locator('.modal');
  await m.locator('select[name=familyId]').selectOption({ label: 'DURAND — famille.durand@example.fr ; b@y.fr' });
  await m.locator('input[name=montant]').fill('20');
  await m.locator('select[name=mode]').selectOption('cheque');
  await m.locator('input[name=moisEncaissement]').fill('2027-01');
  await m.locator('select[name=aff-poste-0]').selectOption('mercredi-T1');
  await m.locator('input[name=aff-montant-0]').fill('7');
  assert.equal(await m.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
  assert.match(await m.innerText(), /reste 13,00/);
  await m.locator('input[name=aff-montant-0]').fill('20');
  assert.equal(await m.getByRole('button', { name: 'Enregistrer' }).isDisabled(), false);
  await m.getByRole('button', { name: 'Enregistrer' }).click();
  const ops = await page.evaluate(() => window.__appended);
  const p = ops.find((o) => o.path[0] === 'payments').value;
  assert.equal(p.montant, 20);
  assert.equal(p.moisEncaissement, '2027-01');
  assert.deepEqual(p.affectations, [{ poste: 'mercredi-T1', montant: 20, childId: 'c3' }]);
  assert.deepEqual(errors, []);
});

test('remise du mois lists the cheques to deposit and marks them remis', async () => {
  const { page } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Règlements & banque').click();
  await page.getByRole('button', { name: 'Remise du mois' }).click();
  await page.locator('main input[type=month]').fill('2026-11');
  const t = await page.locator('main table.grid').innerText();
  assert.match(t, /111/);
  assert.ok(!t.includes('222'));
  await page.getByRole('button', { name: /Marquer remis/ }).click();
  const ops = await page.evaluate(() => window.__appended);
  assert.ok(ops.some((o) => o.path.join('.') === 'payments.p1.remis' && o.value === true));
});

test('plan d\'encaissement shows months as columns', async () => {
  const { page } = await openApp(browser, server.url, { base: data(), config: { profil: 'Pierre' } });
  await page.locator('nav').getByText('Règlements & banque').click();
  await page.getByRole('button', { name: 'Plan d\'encaissement' }).click();
  const head = await page.locator('main table.grid thead').innerText();
  assert.match(head, /nov\. 2026/i);
  assert.match(head, /déc\. 2026/i);
});
