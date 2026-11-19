import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

function donnees() {
  const s = miniState();
  s.params.attestation.adresseAsso = '1 place Saint-Médard 75005 Paris';
  s.payments = {
    b: { familyId: 'f1', date: '2026-10-21', montant: 50, affectations: [{ poste: 'toussaint', montant: 14, childId: 'c3' }, { poste: 'toussaint', montant: 36, childId: 'c1' }] },
    m: { familyId: 'f2', date: '2026-10-22', montant: 28, affectations: [{ poste: 'toussaint', montant: 28, childId: 'c5' }] },
  };
  const avant = miniState();
  avant.year = '2025-2026';
  avant.payments = { a: { familyId: 'f1', date: '2026-02-10', montant: 20, affectations: [{ poste: 'hiver', montant: 15, childId: 'c3' }, { poste: 'adhesion', montant: 5, childId: 'c3' }] } };
  return { s, win: { __years: [{ label: '2025-2026', dossier: 'JSM' }], __annees: { JSM: { base: avant, ops: [] } } } };
}

test('attestations annuelles impôts : moins de 6 ans, deux dossiers, toutes en PDF dans un sous-dossier, mail prêt', async () => {
  const { s, win } = donnees();
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' }, win, clock: '2027-01-15T10:00:00' });
  await page.locator('nav a[data-id=attestation]').click();
  await page.getByRole('button', { name: 'Attestations annuelles' }).click();
  await page.locator('main select[name=annee]').selectOption('2026');
  await page.locator('main select[name=mode]').selectOption('impots');
  await page.waitForTimeout(300);
  const t = await page.locator('main table.grid').innerText();
  assert.match(t, /DURAND[\s\S]*NOAH[\s\S]*29,00/, 'hiver (dossier précédent) 15 + Toussaint 14, adhésion exclue');
  assert.doesNotMatch(t, /LOUISE/, 'plus de 6 ans');
  assert.match(t, /MOREAU[\s\S]*ZOE[\s\S]*28,00/);
  await page.locator('main tr', { hasText: 'DURAND' }).getByRole('button', { name: 'Voir' }).click();
  assert.match(await page.locator('main .apercu').innerText(), /frais de garde[\s\S]*du 1er janvier au 31 décembre 2026/);
  await page.getByRole('button', { name: /Enregistrer toutes en PDF \(2\)/ }).click();
  await page.waitForFunction(() => window.__printed.length === 2);
  const printed = await page.evaluate(() => window.__printed);
  assert.deepEqual(printed.map((p) => [p.sousDossier, p.ouvrir]), [['Attestations 2026', false], ['Attestations 2026', false]]);
  assert.equal(printed[1].ouvrirDossier, true);
  assert.match(printed[0].fileName, /Attestation frais de garde 2026 DURAND/);
  assert.match(printed[0].html, /NOAH DURAND[\s\S]*12\/03\/2020[\s\S]*29,00/);
  await page.locator('main tr', { hasText: 'DURAND' }).getByRole('button', { name: 'Mail' }).click();
  const opened = await page.evaluate(() => window.__opened);
  assert.match(decodeURIComponent(opened[0]), /^mailto:famille\.durand@example\.fr;b@y\.fr\?subject=Attestation frais de garde 2026/);
  assert.deepEqual(errors, []);
});

test('attestations annuelles de paiement : tous les enfants, montant non affecté signalé', async () => {
  const { s, win } = donnees();
  s.payments.d = { familyId: 'f1', date: '2026-11-02', montant: 10, affectations: [{ poste: 'a-repartir', montant: 10 }] };
  const { page, errors } = await openApp(browser, server.url, { base: s, config: { profil: 'Pierre' }, win, clock: '2027-01-15T10:00:00' });
  await page.locator('nav a[data-id=attestation]').click();
  await page.getByRole('button', { name: 'Attestations annuelles' }).click();
  await page.locator('main select[name=annee]').selectOption('2026');
  await page.locator('main select[name=mode]').selectOption('paiement');
  await page.waitForTimeout(300);
  const t = await page.locator('main table.grid').innerText();
  assert.match(t, /DURAND[\s\S]*LOUISE[\s\S]*NOAH[\s\S]*65,00[\s\S]*10,00\s€ non affectés/);
  await page.getByRole('button', { name: /Imprimer toutes/ }).click();
  const printed = await page.evaluate(() => window.__printed);
  assert.equal((printed[0].html.match(/class="page"/g) || []).length, 2);
  assert.deepEqual(errors, []);
});
