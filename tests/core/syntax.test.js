import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const files = ['app', 'app/screens', 'src/core', 'electron'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => path.join(d, f)));

test('every source file parses', () => {
  const bad = [];
  for (const f of files) {
    try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); } catch (e) { bad.push(`${f}: ${String(e.stderr).split('\n').slice(0, 5).join(' ')}`); }
  }
  assert.deepEqual(bad, []);
});
