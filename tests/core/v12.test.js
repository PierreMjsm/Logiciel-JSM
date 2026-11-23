import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { anneesPresence } from '../../src/core/annees.js';
import { newYear } from '../../src/core/newyear.js';
import { rappelDossierText, familiesDossierIncomplet } from '../../src/core/reports.js';
import { trombinoscope, fichesSante, prenomInitiale } from '../../src/core/trombi.js';

test('anneesPresence : années notées + année en cours si l’enfant a été présent', () => {
  const s = miniState();
  s.children.c1.annees = ['2024-2025'];
  assert.deepEqual(anneesPresence(s, 'c1'), ['2024-2025']);
  mark(s, 'c1', 'pedibus', '2026-11-12', 'A');
  assert.deepEqual(anneesPresence(s, 'c1'), ['2024-2025', '2026-2027'], 'une absence payée compte');
  s.children.c1.annees = ['2026-2027', '2025-2026'];
  assert.deepEqual(anneesPresence(s, 'c1'), ['2025-2026', '2026-2027'], 'triées, sans doublon');
});

test('nouvelle année : les années de présence sont gardées', () => {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  const n = newYear(s, '2027-2028', s.params, '2027-09-01');
  assert.deepEqual(n.children.c3.annees, ['2026-2027']);
  assert.equal(n.children.c5.annees, undefined, 'jamais venu : rien');
});

test('dossiers incomplets : familles concernées et texte du mail', () => {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  s.children.c3.documents = { fiche: true };
  s.children.c5.documents = { fiche: true, vaccins: true, amelie: true };
  const fams = familiesDossierIncomplet(s, '2026-11-15');
  assert.deepEqual(fams.map((f) => f.familyId), ['f1']);
  const t = rappelDossierText(s, 'f1', '2026-11-15');
  assert.match(t, /NOAH/);
  assert.match(t, /Vaccins/);
  assert.doesNotMatch(t, /LOUISE/, 'enfant sans activité : pas concerné');
});

test('prenomInitiale et trombinoscope par groupe, par âge, tout le monde', () => {
  const s = miniState();
  assert.equal(prenomInitiale(s, s.children.c1), 'Louise D.');
  const g = trombinoscope(s, '2026-11-15', 'groupe');
  assert.deepEqual(g.map((x) => x.titre), s.params.groupes.filter((n) => g.some((x) => x.titre === n)), 'dans l’ordre des groupes');
  assert.ok(g.every((x) => x.enfants.every((e) => e.libelle && e.id)));
  const a = trombinoscope(s, '2026-11-15', 'age');
  assert.ok(a.every((x) => /^\d+ ans?$/.test(x.titre)));
  const t = trombinoscope(s, '2026-11-15', 'tous');
  assert.equal(t.length, 1);
  assert.equal(t[0].enfants.length, 4);
  assert.deepEqual(t[0].enfants.map((e) => e.libelle), [...t[0].enfants.map((e) => e.libelle)].sort((x, y) => x.localeCompare(y, 'fr')));
});

test('fichesSante : enfants avec PAI ou difficultés de santé, contacts', () => {
  const s = miniState();
  s.children.c3.pai = true;
  s.children.c3.fiche = { difficultes: 'Allergie arachides', traitement: 'Stylo adrénaline', urgence: 'Tante 0611111111' };
  s.children.c5.fiche = { difficultes: 'Asthme' };
  const f = fichesSante(s, '2026-11-15');
  assert.deepEqual(f.map((x) => x.id), ['c3', 'c5']);
  assert.equal(f[0].pai, true);
  assert.equal(f[0].telephones, '0600000001');
  assert.equal(f[0].urgence, 'Tante 0611111111');
});

test('activités de l’année et historique gardé à la nouvelle année', async () => {
  const { activitesAnnee, dejaVenu } = await import('../../src/core/annees.js');
  const s = miniState();
  for (const c of Object.values(s.children)) c.inscriptions = {};
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c3', 'toussaint', '2026-10-19', 'A');
  s.children.c1.inscriptions = { pediMercredi: true, ktJeudi: true };
  assert.deepEqual(activitesAnnee(s, 'c3'), ['mercredi', 'vacances']);
  assert.deepEqual(activitesAnnee(s, 'c1'), ['pedibus'], 'Pédibus mercredi et KT comptent pour le Pédibus');
  const n = newYear(s, '2027-2028', s.params, '2027-09-01');
  assert.deepEqual(n.children.c3.activites, { '2026-2027': ['mercredi', 'vacances'] });
  assert.equal(dejaVenu(n, 'c3', 'vacances'), true, 'l’année d’avant compte');
  assert.equal(dejaVenu(n, 'c3', 'pedibus'), false);
  assert.equal(dejaVenu(s, 'c1', 'pedibus'), true, 'inscription de l’année en cours');
});
