const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStorage, initFolder } = require('../../electron/storage.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-'));
const op = (dev, seq, value, t) => ({ t: t || new Date().toISOString(), by: dev === 'A' ? 'Pierre' : 'Katell', dev, seq, path: ['presences', 'c1|pedibus|2026-11-13|'], value });

test('initFolder creates base.json only once', () => {
  const d = tmp();
  initFolder(d, { year: 'x', n: 1 });
  initFolder(d, { year: 'x', n: 2 });
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'base.json'), 'utf8')).n, 1);
});

test('each device appends only to its own journal; load reads them all', () => {
  const d = tmp();
  initFolder(d, { year: 'x' });
  const a = createStorage({ folder: d, profil: 'Pierre', device: 'A' });
  const b = createStorage({ folder: d, profil: 'Katell', device: 'B' });
  a.append(op('A', 1, 'P'));
  b.append(op('B', 1, 'A'));
  const files = fs.readdirSync(d).filter((f) => f.startsWith('journal-')).sort();
  assert.deepEqual(files, ['journal-Katell-B.jsonl', 'journal-Pierre-A.jsonl']);
  const loaded = a.load();
  assert.equal(loaded.ops.length, 2);
  assert.deepEqual(loaded.base, { year: 'x' });
  a.close(); b.close();
});

test('ignores a truncated trailing line', () => {
  const d = tmp();
  initFolder(d, { year: 'x' });
  fs.writeFileSync(path.join(d, 'journal-Lucas-C.jsonl'), JSON.stringify(op('C', 1, 'P')) + '\n{"t":"2026-11-13T10:00');
  const s = createStorage({ folder: d, profil: 'Pierre', device: 'A' });
  const r = s.load();
  assert.equal(r.ops.length, 1);
  assert.equal(r.warnings.length, 1);
  s.close();
});

test('onRemote delivers ops appended by another device', async () => {
  const d = tmp();
  initFolder(d, { year: 'x' });
  const a = createStorage({ folder: d, profil: 'Pierre', device: 'A', pollMs: 200 });
  const b = createStorage({ folder: d, profil: 'Katell', device: 'B', pollMs: 200 });
  a.load(); b.load();
  const got = new Promise((resolve) => b.onRemote((ops) => resolve(ops)));
  a.append(op('A', 1, 'KT'));
  const ops = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
  assert.equal(ops[0].value, 'KT');
  a.close(); b.close();
});

test('presence heartbeat: others() sees the other device, not itself', () => {
  const d = tmp();
  const a = createStorage({ folder: d, profil: 'Pierre', device: 'A' });
  const b = createStorage({ folder: d, profil: 'Katell', device: 'B' });
  a.presence(); b.presence();
  assert.deepEqual(b.others().map((o) => o.profil), ['Pierre']);
  a.close(); b.close();
});

test('daily backup written once and pruned to 60', () => {
  const d = tmp();
  const s = createStorage({ folder: d, profil: 'Pierre', device: 'A', now: () => new Date('2026-11-13T10:00:00Z') });
  const dir = path.join(d, 'Sauvegardes');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= 61; i++) fs.writeFileSync(path.join(dir, `JSM-2026-01-${String(i).padStart(2, '0')}.json`), '{}');
  assert.equal(s.backupIfNeeded({ a: 1 }), true);
  assert.equal(s.backupIfNeeded({ a: 2 }), false);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 60);
  assert.ok(files.includes('JSM-2026-11-13.json'));
  s.close();
});

test('compactOwn keeps the last op per path in its own journal', () => {
  const d = tmp();
  const s = createStorage({ folder: d, profil: 'Pierre', device: 'A' });
  s.append(op('A', 1, 'P', '2026-11-13T09:00:00Z'));
  s.append(op('A', 2, 'A', '2026-11-13T09:01:00Z'));
  s.compactOwn();
  const lines = fs.readFileSync(path.join(d, 'journal-Pierre-A.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).value, 'A');
  s.close();
});

test('a replaced base.json triggers a reset for other devices', async (t) => {
  const d = tmp();
  initFolder(d, { year: 'x' });
  const { writeBase } = require('../../electron/storage.js');
  const b = createStorage({ folder: d, profil: 'Katell', device: 'B', pollMs: 100 });
  t.after(() => b.close());
  b.load();
  const got = new Promise((resolve) => b.onRemote((ops, info) => info.reset && resolve(true)));
  await new Promise((r) => setTimeout(r, 30));
  writeBase(d, { year: 'y' });
  const fs2 = require('fs');
  const later = new Date(Date.now() + 5000);
  fs2.utimesSync(require('path').join(d, 'base.json'), later, later);
  assert.equal(await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]), true);
  b.close();
});

test('base.json incomplet (synchro OneDrive en cours) : message clair, pas de plantage obscur', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-base-'));
  fs.writeFileSync(path.join(dir, 'base.json'), '{"year":"2026-2027","families":{"f1":');
  const st = createStorage({ folder: dir, profil: 'Pierre', device: 'PC1', pollMs: 0 });
  assert.throws(() => st.load(), /base\.json.*synchronis/i);
  st.close();
});
