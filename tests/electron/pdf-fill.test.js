const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { listerChamps, remplir } = require('../../electron/pdf-fill.js');

// Petit modèle : un champ texte, une case, un champ signature.
async function modele() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const form = doc.getForm();
  form.createTextField('Nom de lenfant').addToPage(page, { x: 50, y: 500, width: 200, height: 16 });
  form.createCheckBox('1').addToPage(page, { x: 50, y: 450, width: 10, height: 10 });
  form.createTextField('Signature4_es_:signer:signature').addToPage(page, { x: 400, y: 80, width: 160, height: 50 });
  return doc.save();
}
// Image PNG 1×1.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('listerChamps : nom et type de chaque champ', async () => {
  assert.deepEqual(await listerChamps(await modele()), [
    { nom: 'Nom de lenfant', type: 'texte' }, { nom: '1', type: 'coche' }, { nom: 'Signature4_es_:signer:signature', type: 'texte' }]);
});

test('remplir : textes (accents compris), cases, sans aplatir', async () => {
  const out = await remplir(await modele(), { 'Nom de lenfant': 'BÉRANGÈRE Œ — test ✓', 1: true, inconnu: 'x' }, { aplatir: false });
  const form = (await PDFDocument.load(out)).getForm();
  assert.equal(form.getTextField('Nom de lenfant').getText(), 'BÉRANGÈRE Œ — test ');
  assert.equal(form.getCheckBox('1').isChecked(), true);
});

test('remplir : aplatit (plus de champs modifiables) et pose la signature dessinée', async () => {
  const out = await remplir(await modele(), { 'Nom de lenfant': 'DURAND' }, { signature: { bytes: PNG, type: 'png' } });
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getForm().getFields().length, 0);
  assert.ok(out.length > 500);
});
