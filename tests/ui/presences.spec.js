import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './harness.js';
import { miniState } from '../core/fixtures/mini-state.js';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

async function open(page) {
  await page.locator('nav').getByText('Présences', { exact: true }).click();
  await page.locator('table.pgrid').waitFor();
}
const cell = (page, cid, date, slot = '') => page.locator(`td.c[data-k="${cid}|${date}|${slot}"]`);

test('clicking a cell twice gives A and dispatches 2 ops', async () => {
  const { page, errors } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await open(page);
  const c = cell(page, 'c3', '2026-09-01');
  await c.click();
  assert.equal(await c.innerText(), 'P');
  await c.click();
  assert.equal(await c.innerText(), 'A');
  const ops = await page.evaluate(() => window.__appended);
  assert.deepEqual(ops.map((o) => [o.path[1], o.value]), [['c3|pedibus|2026-09-01|', 'P'], ['c3|pedibus|2026-09-01|', 'A']]);
  assert.deepEqual(errors, []);
});

test('keyboard: K sets KT on a KT Thursday, arrows move, Suppr clears', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await open(page);
  const c = cell(page, 'c2', '2026-09-17');
  await c.click(); // P
  await page.keyboard.press('k');
  assert.equal(await c.innerText(), 'KT');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('p');
  assert.equal(await cell(page, 'c2', '2026-09-18').innerText(), 'P');
  await page.keyboard.press('Delete');
  assert.equal(await cell(page, 'c2', '2026-09-18').innerText(), '');
});

test('mercredi grid has matin and après-midi columns; counts row by groupe', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await open(page);
  await page.locator('select[name=activity]').selectOption('mercredi');
  await cell(page, 'c1', '2026-09-02', 'aprem').click();
  const ops = await page.evaluate(() => window.__appended);
  assert.equal(ops.at(-1).path[1], 'c1|mercredi|2026-09-02|aprem');
  assert.match(await page.locator('tr.count', { hasText: 'Total présents' }).innerText(), /\b1\b/);
});

test('remote change updates the cell live and marks it as recent', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await open(page);
  await page.evaluate(() => window.__pushRemote([{ t: new Date().toISOString(), by: 'Katell', dev: 'K', seq: 1, path: ['presences', 'c1|pedibus|2026-09-03|'], value: 'A' }]));
  const c = cell(page, 'c1', '2026-09-03');
  await page.waitForFunction(() => document.querySelector('td.c[data-k="c1|2026-09-03|"]')?.textContent === 'A');
  assert.match(await c.getAttribute('class'), /recent/);
});

test('fill a column with P via the header menu', async () => {
  const { page } = await openApp(browser, server.url, { base: miniState(), config: { profil: 'Pierre' } });
  await open(page);
  await page.locator('th[data-date="2026-09-04"]').click({ button: 'right' });
  await page.getByRole('button', { name: /Tout en P/ }).click();
  const ops = await page.evaluate(() => window.__appended);
  assert.equal(ops.filter((o) => o.value === 'P' && o.path[1].includes('2026-09-04')).length, 4);
});
