// Remplissage d'un modèle PDF à champs de formulaire (fiche d'adhésion…) avec pdf-lib, sur l'ordinateur.
const { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts, PDFName, PDFRef } = require('pdf-lib');

async function listerChamps(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getForm().getFields().map((f) => ({
    nom: f.getName(),
    type: f instanceof PDFTextField ? 'texte' : f instanceof PDFCheckBox ? 'coche' : 'autre',
  }));
}

// Garde seulement les caractères que la police standard sait écrire (accents français compris).
function nettoyer(font, s) {
  const ok = new Set(font.getCharacterSet());
  return String(s).normalize('NFC').split('').map((ch) => {
    if (ok.has(ch.codePointAt(0))) return ch;
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return base && [...base].every((b) => ok.has(b.codePointAt(0))) ? base : '';
  }).join('');
}

function rectOf(field) {
  const w = field.acroField.getWidgets()[0];
  return w ? w.getRectangle() : null;
}

function pageOf(doc, field) {
  const w = field.acroField.getWidgets()[0];
  const ref = w && w.P();
  const pages = doc.getPages();
  return pages.find((p) => ref && p.ref === ref) || pages.find((p) => (p.node.Annots() || { asArray: () => [] }).asArray().some((a) => a === doc.context.getObjectRef(w.dict))) || pages[0];
}

// valeurs : { nomDuChamp: texte | booléen }. signature : { bytes, type: 'png' | 'jpg' } posée dans le champ « signature ».
async function remplir(bytes, valeurs, { signature = null, aplatir = true } = {}) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const nom = field.getName();
    if (field instanceof PDFTextField) {
      const v = nom in valeurs ? nettoyer(font, valeurs[nom] ?? '') : '';
      if (field.getMaxLength && field.getMaxLength() !== undefined) field.setMaxLength(undefined);
      field.setText(v || undefined);
      const r = rectOf(field);
      let size = 10;
      if (r && v) {
        size = Math.min(10, Math.max(5, r.height - 4));
        while (size > 5 && font.widthOfTextAtSize(v, size) > r.width - 4) size -= 0.5;
      }
      field.setFontSize(size);
      field.updateAppearances(font);
    } else if (field instanceof PDFCheckBox && nom in valeurs) {
      if (valeurs[nom]) field.check(); else field.uncheck();
    }
  }
  if (signature && signature.bytes) {
    const sf = form.getFields().find((f) => /signature/i.test(f.getName()));
    if (sf) {
      const r = rectOf(sf);
      const img = signature.type === 'png' ? await doc.embedPng(signature.bytes) : await doc.embedJpg(signature.bytes);
      const k = Math.min(r.width / img.width, r.height / img.height);
      const w = img.width * k, hh = img.height * k;
      pageOf(doc, sf).drawImage(img, { x: r.x + (r.width - w) / 2, y: r.y + (r.height - hh) / 2, width: w, height: hh });
    }
  }
  if (aplatir) {
    form.flatten();
    // pdf-lib laisse dans /Annots des références vers les morceaux de champs supprimés : on les retire.
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      if (!annots) continue;
      const garde = annots.asArray().filter((a) => !(a instanceof PDFRef) || doc.context.lookup(a) !== undefined);
      if (garde.length === annots.size()) continue;
      if (garde.length) page.node.set(PDFName.of('Annots'), doc.context.obj(garde));
      else page.node.delete(PDFName.of('Annots'));
    }
  }
  return doc.save({ useObjectStreams: false });
}

module.exports = { listerChamps, remplir };
