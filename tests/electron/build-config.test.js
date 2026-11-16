const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const pkg = require('../../package.json');

// Le dossier app/ (interface) a son propre package.json ; electron-builder doit quand même construire depuis la racine.
test('configuration de construction : application à la racine, nom, version, description, auteur', () => {
  assert.equal(pkg.build.directories && pkg.build.directories.app, '.');
  assert.ok(pkg.name && pkg.version && pkg.description && pkg.author);
  assert.equal(pkg.main && path.normalize(pkg.main), path.normalize('electron/main.js'));
});
