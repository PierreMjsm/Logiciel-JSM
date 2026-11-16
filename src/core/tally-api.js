// Réponses lues directement chez Tally (API gratuite) → mêmes lignes que l'export CSV, pour réutiliser la même lecture.

// « https://tally.so/forms/D4LrYR/submissions », « https://tally.so/r/D4LrYR » ou « D4LrYR » → « D4LrYR ».
export function idFormulaire(s) {
  const t = String(s || '').trim();
  const m = /tally\.so\/(?:forms|r)\/([A-Za-z0-9]+)/.exec(t);
  return m ? m[1] : t.replace(/[^A-Za-z0-9]/g, '');
}

// Date ISO (UTC) → « 2026-11-15 17:15:15 » à l'heure de Paris, comme dans l'export.
function heureParis(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || '');
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Paris', hour12: false }).replace('T', ' ');
}

const estFichier = (x) => x && typeof x === 'object' && typeof x.url === 'string';

function texte(answer) {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer)) {
    if (answer.some(estFichier)) return answer.filter(estFichier).map((f) => f.url).join(', ');
    return answer.map((a) => (typeof a === 'object' ? (a.text || a.title || a.name || JSON.stringify(a)) : String(a))).join(', ');
  }
  if (estFichier(answer)) return answer.url;
  if (typeof answer === 'object') return answer.text || answer.title || answer.name || JSON.stringify(answer);
  return String(answer);
}

// L'option (case) est-elle cochée dans la réponse ? La réponse peut citer le texte de l'option, son identifiant, ou le titre complet.
function coche(answer, field) {
  const vals = (Array.isArray(answer) ? answer : [answer]).filter((a) => a !== null && a !== undefined);
  return vals.some((a) => {
    const s = typeof a === 'object' ? (a.id || a.uuid || a.text || a.title || '') : String(a);
    return s === field.uuid || s === field.title || field.title.endsWith(`(${s})`) || (s.length > 12 && field.title.includes(s));
  });
}

export function tallyVersLignes(questions, submissions) {
  const cols = [];
  for (const q of questions || []) {
    const fields = q.fields || [];
    if (/CHECKBOX/i.test(q.type) && fields.length) {
      for (const f of fields) cols.push({ titre: f.title, val: (ans) => (coche(ans, f) ? 'true' : 'false'), q: q.id });
    } else {
      cols.push({ titre: q.title, val: texte, q: q.id });
    }
  }
  const head = ['Submission ID', 'Respondent ID', 'Submitted at', ...cols.map((c) => c.titre)];
  const rows = [head];
  for (const s of submissions || []) {
    if (s.isCompleted === false) continue;
    const ans = Object.fromEntries((s.responses || []).map((r) => [r.questionId, r.answer !== undefined ? r.answer : r.value]));
    rows.push([s.id, s.respondentId || '', heureParis(s.submittedAt), ...cols.map((c) => c.val(ans[c.q]))]);
  }
  return rows;
}
