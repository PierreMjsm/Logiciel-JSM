# JSM Gestion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop app (Electron, .exe built by GitHub Actions) that replaces the 8 JSM Excel workbooks. Data lives in a shared Google Drive / OneDrive folder, and several people can edit at the same time.

**Architecture:** The code is split into three layers.
- **Pure core** (`src/core/*.js`, plain ES modules, no dependencies): calendar, event-sourced store, billing, lists, reports and the Excel import mapping. It runs both under `node --test` and in the renderer.
- **Main process** (`electron/*.js`, CommonJS): handles the data folder (base snapshot + one append-only journal per device), file watching, presence heartbeat, backups, the dependency-free xlsx reader, and PDF printing.
- **Renderer** (`app/`, vanilla JS ES modules, no bundler): a single window with screens. It talks to the main process only through `window.jsm` (preload bridge). This lets Playwright test it in Chrome with a mock bridge.

**Tech Stack:** Node 22, Electron 33 + electron-builder 25 (installed only in CI), `node:test` for unit tests, Playwright (already installed at `/opt/node-tools/node_modules/playwright`) with `/usr/bin/google-chrome` for UI tests. No other runtime dependencies.

**Spec:** `docs/specs/2026-11-14-jsm-design.md`

## Global Constraints

- All UI text is in French. Money is shown as `1 234,50 €`. Dates are shown as `13/11/2026` and stored as ISO `2026-11-13`.
- Tariffs (defaults, editable): adhésion 5 €, Pédibus 5,50 €/jour, KT 5 €/jour, Mercredi 7 €/demi-journée, journée vacances 14 €, journée exceptionnelle 14 €.
- Billed day = `P` or `A` (and `KT` on Pédibus). Paper lists show only `P` (and `KT` for Pédibus).
- Fratrie −50 % applies only to Mercredi (per half-day) and Vacances (per day). It applies when ≥3 children of a family are marked `P`/`A` on the same date+slot. The youngest child of that day pays half price first, and so does every child from the 3rd onward.
- Paper lists are sorted by age (youngest first), with `*` after the prénom for PAI and `⛪` for KT.
- Profiles: `Pierre`, `Katell`, `Lucas`, with no password. The app version is shown bottom-right.
- A device writes only `journal-<profil>-<device>.jsonl` and `presence-<device>.json`. It never writes another device's file. Only "Nouvelle année" and import write `base.json`.
- No runtime npm dependency (no network here). `package.json` devDependencies are `electron` and `electron-builder` only.
- Windows target only: NSIS installer named `JSM-Gestion-Setup-<version>.exe`.

## Review Focus

1. **Two devices edit the same cell within seconds.** The later timestamp wins on both devices after sync, and nothing crashes. Test: `store.test.js › concurrent same-key ops converge regardless of arrival order`.
2. **A journal line half-written by the drive (truncated last line).** The line is skipped with a warning and the rest loads. Test: `storage.test.js › ignores a truncated trailing line`.
3. **Two children with the same nom+prénom during import.** They become two distinct children: the import never merges them silently, and the report lists the ambiguity. Test: `import.test.js › duplicate names are kept separate and reported`.
4. **A child changes group mid-year (3 ans → 4-5 ans on 2027-07-05).** The June list shows "3 ans" and the July list shows "4-5 ans". Test: `calendar.test.js › groupAt uses the dated change`.
5. **A payment affected to a poste that has no dû.** It still counts in the family's réglé and shows as trop-perçu, and is never dropped. Test: `billing.test.js › orphan affectation counts as trop-perçu`.

---

## Data model (shared by every task)

`base.json`:
```json
{ "schema": 1, "year": "2026-2027",
  "params": {
    "periods": [{"id":"T1a","label":"1er Trimestre","kind":"ecole","trimestre":1,"start":"2026-09-01","end":"2026-10-16"},
                {"id":"toussaint","label":"Toussaint","kind":"vacances","start":"2026-10-19","end":"2026-10-30"}],
    "trimestres": [{"n":1,"start":"2026-09-01","end":"2026-12-18"},{"n":2,"start":"2027-01-04","end":"2027-04-02"},{"n":3,"start":"2027-04-19","end":"2027-07-02"}],
    "feries": ["2026-11-11"], "ktStart": {"mardi":"2026-09-15","jeudi":"2026-09-17"},
    "tarifs": {"adhesion":5,"pedibus":5.5,"kt":5,"mercredi":7,"journee":14,"exceptionnel":14},
    "ecoles": ["ROSALIE","MARCEL","NDF","BUFFON","BROSSO","ARBALETE","VICTOR","GENEVIEVE","AUTRE","COLLEGE","ARAGO","EPEE DE BOIS","NORMAN"],
    "pediMercrediEcoles": ["BUFFON","BROSSO"],
    "groupes": ["3 ans","4-5 ans","6-8 ans","8-10 ans","Collégiens","Plus présent","en attente"],
    "statuts": ["Perfect","Papier Adh","Amélie","Vaccin","Sécu & Vaccin","PAI","€","Autre"],
    "cafHeures": {"<ECOLE>": {"KT": {"lundi":2.5,"mardi":1,"jeudi":2.5,"vendredi":1}, "-6": {...}, "6-11": {...}}},
    "attestation": {"tresorier":"","habilitation":""},
    "pdfFolder": null },
  "families": {"f1": {"nom":"DURAND","nomCheque":"","mails":"famille.durand@example.fr","adresse":"…","telMaman":"…","telPapa":"…"}},
  "children": {"c1": {"familyId":"f1","prenom":"NOAH","naissance":"2020-03-12",
        "groupes":[{"from":null,"groupe":"6-8 ans"}],"ecole":"MARCEL","adherent":true,"statut":"PAI","pai":true,
        "inscriptions":{"pedibus":true,"ktMardi":false,"ktJeudi":false,"mercredi":true,"pediMercredi":false,
          "toussaint":false,"noel":false,"hiver":false,"printemps":false,"rose":false,"juillet":false,"aout":false,
          "collegiens":false,"exceptionnel":false,"ado":false}}},
  "presences": {"c1|pedibus|2026-09-08|": "P", "c1|mercredi|2026-09-02|matin": "P"},
  "extraDates": {"exceptionnel": ["2026-10-06"], "ado": ["2026-09-18","2026-10-02"]},
  "payments": {"p1": {"familyId":"f1","childId":"c1","date":"2026-09-20","montant":44,"mode":"cheque",
        "numero":"1234567","banque":"","nomCheque":"","commentaire":"",
        "affectations":[{"poste":"pedibus-T1","montant":44}],"moisEncaissement":"2026-10","remis":false,"dateRemise":null}} }
```
- Activity ids: `pedibus` (slot `""`, values `P|A|KT`), `mercredi` (slot `matin|aprem`), `pediMercredi`, the vacances period ids `toussaint|noel|hiver|printemps|rose|juillet|aout|collegiens`, `exceptionnel`, `ado`.
- Postes: `adhesion`, `pedibus-T1..T3`, `mercredi-T1..T3`, `toussaint`, `noel`, `hiver`, `printemps`, `rose`, `juillet`, `aout`, `collegiens`, `exceptionnel`. KT days are billed inside `pedibus-Tn`.
- Journal line (one JSON per line): `{"t":"2026-11-13T09:12:03.120Z","by":"Katell","dev":"PORTABLE","seq":17,"path":["presences","c1|pedibus|2026-11-13|"],"value":"P"}`. `value:null` deletes. The order is `(t, dev, seq)`.

## File Structure

```
package.json                     scripts: test, start, dist; build config (nsis)
.github/workflows/build-windows.yml
electron/main.js                 window, IPC handlers, printToPDF
electron/preload.js              exposes window.jsm
electron/storage.js              data folder: load, append, watch, presence, backup, compact
electron/xlsx-reader.js          zip + sheet XML → cached cell values (no deps)
src/core/calendar.js             dates, periods, groupAt, age
src/core/store.js                applyOps, makeOp, history
src/core/billing.js              per-child postes, fratrie, family totals, bank
src/core/lists.js                daily paper lists
src/core/reports.js              recap text, attestation, mailing, CAF, bilan, carte
src/core/import.js               workbook values → base.json + report
src/core/newyear.js              rollover
src/core/format.js               euro(), dateFr()
app/index.html, app/style.css, app/print.css
app/main.js                      boot, profile, router, status bar
app/state.js                     in-memory state + dispatch(op) + subscribe
app/ui.js                        h() element helper, table, modal, toast
app/screens/{enfants,presences,listes,compta,reglements,attestation,mailings,stats,ado,carte,parametres,historique,import}.js
tests/core/*.test.js, tests/electron/*.test.js, tests/ui/*.spec.mjs, tests/fixtures/
```

---

### Task 1: Scaffold + CI build

**Files:** Create `package.json`, `.github/workflows/build-windows.yml`, `electron/main.js`, `electron/preload.js`, `app/index.html`, `app/main.js`, `src/core/format.js`, `tests/core/format.test.js`, `.gitignore`, `README.md`.

**Interfaces:** Produces `euro(n:number):string` → `"1 234,50 €"` (narrow no-break space U+202F as the thousands separator, matching `Intl` fr-FR), `dateFr(iso):string` → `"13/11/2026"`, and `dayName(iso):string` → `"vendredi"`.

- [ ] Write `format.test.js`: `euro(5.5)==="5,50 €"`, `euro(1234.5)==="1 234,50 €"`, `dateFr("2026-11-13")==="13/11/2026"`, `dayName("2026-11-13")==="vendredi"`.
- [ ] Run `node --test tests/` → FAIL (module missing).
- [ ] Implement `format.js` with `Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'})`. Parse dates as UTC to avoid timezone shifts.
- [ ] Run `node --test tests/` → PASS.
- [ ] `package.json`: `"type":"commonjs"`, `"main":"electron/main.js"`, scripts `"test":"node --test tests/core tests/electron"`, `"start":"electron ."`, `"dist":"electron-builder --win nsis"`. Build: `appId:"fr.jsm.gestion"`, `productName:"JSM Gestion"`, nsis `artifactName:"JSM-Gestion-Setup-${version}.${ext}"`, `oneClick:false`, `allowToChangeInstallationDirectory:true`. Files: `electron/**`, `src/**`, `app/**`.
- [ ] Workflow: on push to `main` and `workflow_dispatch`, `runs-on: windows-latest`, node 22, `npm install`, `npm test`, `npm run dist`, then upload `dist/*.exe` as an artifact named `JSM-Gestion-windows`.
- [ ] `main.js` opens a 1400×900 window that loads `app/index.html` with `contextIsolation:true`. `preload.js` exposes a stub `window.jsm = { version }`. `index.html` loads `app/main.js` as a module, which shows "JSM Gestion" and the version in the bottom-right corner.
- [ ] Commit `chore: scaffold electron app and windows build`.

### Task 2: Calendar

**Files:** `src/core/calendar.js`, `tests/core/calendar.test.js`

**Interfaces:**
- `periodOf(params, iso) -> {id,label,kind,trimestre?}|null`
- `trimestreOf(params, iso) -> 1|2|3|null`
- `activityDates(params, activity, extraDates) -> string[]`:
  - `pedibus`: Monday, Tuesday, Thursday and Friday in `kind:"ecole"` periods, excluding `feries`;
  - `mercredi` and `pediMercredi`: Wednesdays in `ecole` periods, excluding feries;
  - a vacances id: Monday to Friday within that period, excluding feries;
  - `exceptionnel` and `ado`: `extraDates[activity]` sorted.
- `slotsOf(activity) -> string[]`: `["matin","aprem"]` for mercredi, `[""]` otherwise.
- `ageAt(naissance, iso) -> number|null`
- `ageLabel(naissance, iso) -> "7 ans"` (or `""`)
- `groupAt(child, iso) -> string`: the last `groupes` entry whose `from` ≤ iso (or `from:null`).
- `defaultGroupe(ageYears) -> "3 ans"|"4-5 ans"|"6-8 ans"|"8-10 ans"|"Collégiens"`, with bounds ≤3, 4–5, 6–7, 8–10, ≥11.
- `ktDay(params, iso) -> "mardi"|"jeudi"|null`: Tuesday on or after `ktStart.mardi`, Thursday on or after `ktStart.jeudi`.
- `defaultParams2026() -> params`, using the exact 2026-2027 values from the Excel `Data` sheets:
  - school periods: T1a 09-01→10-16, T1b 11-02→12-18, T2a 2027-01-04→02-05, T2b 02-22→04-02, T3 04-19→07-02;
  - vacances: Toussaint 10-19→10-30, Noël 12-21→2027-01-01, Hiver 02-08→02-19, Printemps 04-05→04-16, Rose 06-28→07-02, Collégiens 06-14→07-02, Juillet 07-05→07-23, Août 08-16→08-27;
  - 2026-2027 fériés: 11-01, 11-11, 12-25, 2027-01-01, 03-29 (Lundi de Pâques), 05-01, 05-08, 05-06 (Ascension), 05-17 (Pentecôte), 07-14, 08-15.
- [ ] Tests:
  - `activityDates(p,'pedibus')` starts `["2026-09-01","2026-09-03","2026-09-04","2026-09-07"]`, contains no `"2026-11-11"` and nothing between 10-19 and 10-30;
  - `activityDates(p,'toussaint').length===10`;
  - `trimestreOf(p,"2026-11-04")===1`;
  - `periodOf(p,"2026-10-21").id==="toussaint"`;
  - `groupAt uses the dated change`: for `groupes:[{from:null,groupe:"3 ans"},{from:"2027-07-05",groupe:"4-5 ans"}]`, `groupAt(c,"2027-06-30")==="3 ans"` and `groupAt(c,"2027-07-05")==="4-5 ans"`;
  - `ageLabel("2020-03-12","2026-11-13")==="6 ans"`;
  - `ktDay(p,"2026-09-08")===null` and `ktDay(p,"2026-09-15")==="mardi"`.
- [ ] Fail → implement → pass → commit `feat(core): calendar`.

### Task 3: Event-sourced store

**Files:** `src/core/store.js`, `tests/core/store.test.js`

**Interfaces:**
- `makeOp({by,dev,seq,path,value,t?}) -> Op`
- `sortOps(ops) -> Op[]`, ordered by `(t, dev, seq)`
- `applyOps(base, ops) -> state`: a deep clone of base, then each op sets `path` (null deletes). Missing intermediate objects are created. Returns `{...state, _lastWriter:{ [pathKey]: {by,t} }}`.
- `pathKey(path) -> string` (`path.join("\u0001")`)
- `historyOf(ops, filter?) -> Array<{t,by,label}>`, where `label` is a French sentence built from the path (e.g. `"Présence DURAND Noah · pedibus · 13/11/2026 → P"`) given state for names.
- [ ] Tests:
  - set + delete round-trip;
  - `concurrent same-key ops converge regardless of arrival order`: two ops on the same path with t1<t2, applied in both orders after `sortOps`, both give value of t2;
  - creating a new child via path `["children","c9"]` with an object value;
  - `historyOf` returns entries newest-first.
- [ ] Fail → implement → pass → commit `feat(core): event store`.

### Task 4: Billing

**Files:** `src/core/billing.js`, `tests/core/billing.test.js`

**Interfaces:**
- `childPostes(state, childId) -> Array<{poste,label,jours,demiTarif,du}>`. Labels: `"Pédibus T1"`, `"Mercredis T2"`, `"Vacances Toussaint"`, `"Journées exceptionnelles"`, `"Adhésion"`, `"Vacances Collégiens"`. Only postes with `du>0` are returned, except `adhesion`, which is included when `adherent`.
  - `pedibus-Tn`: `jours` = P+A days of Pédibus in trimestre n; `du` = jours×pedibus + KT days×kt.
  - `mercredi-Tn`: half-days (P/A) × mercredi, with fratrie applied.
  - vacances: days (P/A) × journee, with fratrie applied.
  - `exceptionnel`: days × exceptionnel.
- `fratrieDiscounts(state, familyId) -> Set<string>` of `childId|activity|date|slot` keys that pay half. For each (activity in mercredi+vacances, date, slot): the family children with P/A, sorted by `naissance` descending (youngest first). When there are n≥3 of them, the first n−2 are discounted.
- `familyAccount(state, familyId) -> {du, regle, solde, enBanque, postes: Array<{childId,poste,label,du,regle,reste}>}`. Here `regle` per poste = sum of `affectations` for that `childId`+poste; payment affectations without a matching poste appear as rows with `du:0`.
- `familyStatus(solde) -> "À jour"|"Trop-perçu"|"Impayé"`, with a 0.005 tolerance.
- `enBanqueAt(payment, iso) -> boolean`: `mode!=="cheque"` → `date<=iso`; cheque → `remis || moisEncaissement <= iso.slice(0,7)`.
- `encaissementPlan(state) -> {months:string[], rows:Array<{familyId, byMonth:{[ym]:number}, total}>}`
- [ ] Tests (fixture `tests/fixtures/mini-state.js` with family f1 of 3 children born 2016, 2018, 2020 and tariffs from Global Constraints):
  - 10 Pédibus P in T1 + 2 KT → `pedibus-T1.du===10*5.5+2*5`;
  - 3 children all P on mercredi 2026-09-02 matin → the youngest pays 3.5, the others 7 (family du 17.5);
  - same with the third child `A` → still 17.5;
  - only 2 children present → 14;
  - 4 children present → two pay 3.5;
  - fratrie never applies to pedibus;
  - adhésion 5 when `adherent`;
  - `orphan affectation counts as trop-perçu`: a payment of 20 € on `noel` with no Noël days → `solde===20`, status `"Trop-perçu"`;
  - cheque with `moisEncaissement:"2026-12"` is not en banque on 2026-11-30 and is on 2026-12-01.
- [ ] Fail → implement → pass → commit `feat(core): billing with day-by-day fratrie`.

### Task 5: Daily paper lists

**Files:** `src/core/lists.js`, `tests/core/lists.test.js`

**Interfaces:**
- `dailyLists(state, iso) -> Array<{kind,title,subtitle,date,columns,rows}>`. Rows are `{n, nom, prenom, age, ecole, groupe, kt:boolean}`, where `prenom` has ` *` appended when `pai` and `nom` is the family nom. Rows are sorted by age ascending (birth date descending), then nom.
  - **Pédibus day**: one list per école that has ≥1 child with `P|KT` that day, in `params.ecoles` order. Title `"LISTE PRÉSENCE PÉDIBUS — <ECOLE>"`, columns `["#","Nom","Prénom","Âge","Présent ?"]`, `kt` true when the value is `KT`. Then, if `ktDay`, one list `"KT <MARDI|JEUDI>"` with column École, containing the children whose value is `KT`.
  - **Wednesday**: for `pediMercredi`, one list per école in `pediMercrediEcoles` (`"PÉDIBUS MERCREDI — BUFFON"`). For `mercredi`, one list per groupe (via `groupAt`) per slot (`"Mercredi matin — 6-8 ans"`, `"Mercredi après-midi — …"`), plus `"Mercredi journée — <groupe>"` for children P both slots.
  - **Vacances day**: one list per groupe, `"Liste de présence : <Label> — <groupe>"`, with columns `["#","Nom","Prénom","Âge","Présent ?","Sortie ?"]`.
  - **Exceptionnel / ADO day**: one list per groupe.
- `pdfFileName(iso, kind) -> "Pédibus 13-11-2026.pdf"` (kinds: Pédibus, Mercredi, Vacances <Label>, Exceptionnel, ADO).
- [ ] Tests:
  - an `A` child is absent from lists;
  - a `KT` child appears both on its school list with `kt:true` and on `"KT JEUDI"` on Thursday 2026-11-12;
  - PAI → `"NOAH *"`;
  - sorting by age;
  - empty schools are omitted;
  - vacances list has a `Sortie ?` column;
  - groupe follows `groupAt` (July vs June).
- [ ] Fail → implement → pass → commit `feat(core): daily paper lists`.

### Task 6: Reports

**Files:** `src/core/reports.js`, `src/core/newyear.js`, `tests/core/reports.test.js`

**Interfaces:**
- `recapText(state, familyId, todayIso) -> string`. It reproduces the current Résumé text (Bonjour M. / Mme <NOM>, date, année `state.year`, a block per child "DÉTAIL DES ACTIVITÉS — <PRÉNOM>" with the adhésion line and one `• <label> (<jours> j. | ½ j.) : dû <euro>` per poste, the global summary with total dû / total réglé, then exactly one of the three ✅ / 💰 TROP-PERÇU / ⚠️ RESTE À PAYER lines, and the closing paragraph and signature "Katell et Pierre — Les Jeunes de Saint-Médard"). The note about the 3e enfant is replaced by "Le tarif réduit de 50 % pour le 3e enfant présent le même jour est déjà appliqué."
- `mailtoUrl(to, subject, body) -> string`
- `attestation(state, {childId, lignes:[{designation,quantite,prix}]}, todayIso) -> {texte, lignes, total, recuTexte}`, with the "Je soussigné <tresorier>…" text and habilitation from params.
- `mailingList(state, activityOrPeriod, onlyAdherents?) -> string`: unique trimmed emails split on `;` and `,`, joined by `"; "`.
- `cafStats(state, fromIso, toIso) -> rows:Array<{ecole, categorie:"KT"|"-6"|"6-11", byDay:{lundi,mardi,jeudi,vendredi}:{presences,heures}, totalHeures}>` from Pédibus P/A/KT × `cafHeures`. The category is `KT` when the value is KT; otherwise `-6` if `groupAt` ∈ {3 ans, 4-5 ans}, else `6-11`.
- `bilan(state) -> {pedibus:{T1,T2,T3}, mercredi:{…}, vacances:{[id]:{jours,prevu,regle}}, adherents, moyennes}`
- `carte(state) -> {parCodePostal:[{cp,n}], parEcole:[{ecole,n}], liens:[{childId,adresse,url}]}` (url `https://www.google.com/maps/search/?api=1&query=<encoded adresse>`).
- `newYear(state, newYearLabel, params) -> base`: keeps families and children whose current groupe ≠ "Plus présent", resets `groupes` to `[{from:null, groupe: defaultGroupe(age at new start)}]`, clears inscriptions, presences, payments and extraDates.
- [ ] Tests:
  - recap contains `"2026-2027"`, does not contain `"2025-2026"`, and contains `"⚠️ RESTE À PAYER : ► 12,00 € ◄"` for a fixture owing 12 €;
  - mailing dedupes `"a@x.fr ; b@y.fr"` + `"a@x.fr"`;
  - CAF: 2 P lundi at ROSALIE `6-11` with 2.5 h → 5 h;
  - newYear drops a "Plus présent" child.
- [ ] Fail → implement → pass → commit `feat(core): reports, recap, CAF, new year`.

### Task 7: Storage (main process)

**Files:** `electron/storage.js`, `tests/electron/storage.test.js`

**Interfaces:** `createStorage({folder, profil, device, now?}) -> {load(), append(op), onRemote(cb), presence(), others(), backupIfNeeded(), compactOwn(), close()}`
- `load() -> {base, ops, warnings}` reads `base.json` and every `journal-*.jsonl`. Unparsable lines are skipped and reported in `warnings` (`ignores a truncated trailing line`).
- `append(op)` uses `fs.appendFileSync` to its own journal only.
- `onRemote(cb)` watches the folder with `fs.watch` plus a 5 s polling fallback, tracks byte offsets per foreign journal, and calls `cb(newOps)`.
- `presence()` writes `presence-<device>.json` `{profil, device, t}`.
- `others() -> [{profil, device, t}]` returns entries fresher than 120 s, excluding itself.
- `backupIfNeeded()` writes `Sauvegardes/JSM-<yyyy-mm-dd>.json` (applied state) once per day and keeps the 60 newest.
- `compactOwn()` rewrites its own journal keeping only the last op per path: write to `.tmp`, then rename.
- Static `initFolder(folder, base)` creates `base.json` only if it is absent.
- [ ] Tests in a `fs.mkdtempSync` dir: two storages (devices A, B) on the same folder, A appends and B's `onRemote` receives it within 6 s; the truncated-line case; `others()` sees A from B; backup created once per day; `compactOwn` keeps the last value.
- [ ] Fail → implement → pass → commit `feat(electron): per-device journal storage`.

### Task 8: xlsx reader + Excel import

**Files:** `electron/xlsx-reader.js`, `src/core/import.js`, `tests/electron/xlsx-reader.test.js`, `tests/core/import.test.js`, `tests/fixtures/` (the 8 real `.xlsm` files are copied here only locally: they are not committed, because they contain children's personal data. Add them to `.gitignore`.)

**Interfaces:**
- `readWorkbook(path) -> {sheets: {[name]: {cell(ref)->value, rows(): Array<Array<value>>}}}`. It parses the zip central directory with `zlib.inflateRawSync`, sharedStrings, `workbook.xml` and its rels, and the sheet XML `<c r t s><v>` cached values. Booleans become `true/false`, and numeric cells styled as dates (numFmt 14–22 or custom formats containing d/m/y) become ISO dates.
- `importWorkbooks(books:{contact,pedibus,mercredi,vacances,compta,cheque,ado?}) -> {base, report:{children, presences, payments, unmatched:[…], ambiguous:[…]}}`. Mapping, all keyed by **nom+prénom**, never by row:
  - **Contact `général`** (row 8+): A groupe, B adh, C nom, D prénom, F naissance, G école, H mail, I adresse, J tel maman, K tel papa, L statut (PAI when `L==="PAI"` or the prénom ends with `*`), M–Z inscriptions in the order pedibus, mercredi, pediMercredi, toussaint, noel, hiver, printemps, rose, juillet, aout, ktMardi, ktJeudi, exceptionnel, collegiens. Families are grouped by nom + mail.
  - **Pédibus `Pedibus`**: dates in row 13 from column H; the child is in B/C at row 15+; values P/A/KT.
  - **Mercredi `Mercredi`**: dates row 14 from H, row 15 headers MATIN*/APREM* → slot; child in B/C at row 16+.
  - **Vacances** sheets Toussaint…Exceptionnel: dates row 13 from H, child B/C at row 15+, presences P/A. `G` ("€") becomes a payment affectation on that period, mode `inconnu`.
  - **Compta `général`**: K, N, Q (Pédibus réel T1–T3) and U, X, AA (Mercredi réel) become affectations.
  - **Chèque `Remise chèque`**: row 8+, F–H "ESP" become mode `especes`, I becomes `carte`, J–X month columns become `cheque` with `moisEncaissement` (Octobre→2026-10 … Septembre2→2027-09).
  - Compta "réel" amounts and Chèque-Banque amounts are both kept: Chèque gives the mode/encaissement, Compta gives the affectation. When the family totals differ, the import keeps the Chèque lines as payments with affectation `"a-repartir"` for the difference, and lists the family in `report.unmatched`.
- [ ] Tests:
  - `readWorkbook` on the real Contact file returns `général!C8==="MOREAU"` and `général!F8==="2017-09-21"`;
  - `importWorkbooks` on the real files yields ≥300 children and child DURAND NOAH has `presences["<id>|pedibus|2026-09-08|"]==="P"` (cross-checked against `Pedibus!H24/I24`);
  - `duplicate names are kept separate and reported` (synthetic fixture).
- [ ] Fail → implement → pass → commit `feat: dependency-free xlsx import`.

### Task 9: App shell, bridge, state

**Files:** `electron/main.js`, `electron/preload.js`, `app/main.js`, `app/state.js`, `app/ui.js`, `app/style.css`, `app/index.html`, `tests/ui/mock-bridge.mjs`, `tests/ui/shell.spec.mjs`

**Interfaces:**
- `window.jsm` methods:
  - `version`, `getConfig()`, `chooseFolder()`, `setProfil(p)`;
  - `load() -> {base, ops, warnings}`, `append(op)`, `onRemote(cb)`, `others()`;
  - `printToPDF({html, fileName}) -> path`, `print({html})`;
  - `importExcel() -> {base, report}`, `writeBase(base)`, `openExternal(url)`.
  - Config (`folder`, `profil`, `device` = hostname) is stored in `app.getPath('userData')/config.json`.
- `state.js`:
  - `init(bridge)`;
  - `get() -> state`;
  - `dispatch(path, value)`: builds the op, appends it via the bridge, applies it locally, notifies;
  - `subscribe(fn) -> unsubscribe`;
  - remote ops are merged with `sortOps` + `applyOps`.
- Boot flow: no folder → "Choisir le dossier JSM sur le drive"; no profil → three big buttons Pierre / Katell / Lucas; then the main layout. The layout has a left nav with the 13 screens (Enfants, Présences, Listes du jour, Compta familles, Règlements & banque, Attestation, Mailings, Statistiques CAF, ADO, Carte, Paramètres, Historique, Import Excel) and a status bar: "Connecté : Pierre · Katell active il y a 20 s · v0.1.0".
- [ ] Playwright spec (served with `python3 -m http.server`, mock bridge injected via `addInitScript`): picks profil Katell, sees nav and version; a remote op pushed by the mock appears in the status/history.
- [ ] Implement → pass → commit `feat(app): shell, profiles, live sync`.

### Tasks 10–14: Screens

Every screen is a module that exports `render(root, ctx)`, where `ctx` = `{state: get(), dispatch, bridge, params}`. Screens re-render on `subscribe`. Each task adds one Playwright spec using `tests/fixtures/mini-state.js`, then ends with a commit.

- **Task 10 — Enfants / familles** (`app/screens/enfants.js`):
  - instant search (nom/prénom) and filters (école, groupe, activité, adhérent, statut);
  - sortable columns, with counts as in Contact row 6;
  - child form: every field, inscriptions as checkboxes, a "Groupes" section listing dated changes with "Ajouter un changement" (date + groupe);
  - family form with siblings;
  - "Nouvel enfant" (new id `c<timestamp36>`);
  - bulk "Passage de groupe" (select children, date, groupe).
  - **Spec:** sorting by école then editing a child's prénom changes only that child.
- **Task 11 — Présences** (`app/screens/presences.js`):
  - activity selector, plus a period selector for vacances and a trimestre selector for Pédibus/Mercredi;
  - grid of inscribed children × `activityDates` (×slots), with a sticky first column and header;
  - clicking cycles `"" → P → A → (KT if pedibus && ktDay) → ""`;
  - keyboard keys `P`, `A`, `K`, `Suppr`, with arrow navigation;
  - right-click on a header → "Tout en P" for the column;
  - fériés greyed;
  - a counts row per groupe and a total, as in rows 3–9 of the sheets;
  - a badge on cells last written by someone else < 60 s ago.
  - Rendering 350 × 60 cells must take < 300 ms (use one delegated listener).
  - **Spec:** clicking a cell twice gives `A` and dispatches 2 ops.
- **Task 12 — Listes du jour** (`app/screens/listes.js`, `app/print.css`):
  - date picker (default today), with a preview of every `dailyLists` page;
  - buttons "Imprimer" and "Enregistrer en PDF" → `bridge.printToPDF` with A4 portrait, one list per page (`page-break-after`), a 26 px bold title, a 22 px bold date and Aptos/Arial.
  - **Spec:** for 2026-11-12 the preview shows a "KT JEUDI" page and a ⛪.
- **Task 13 — Compta familles** (`app/screens/compta.js`):
  - table family / dû / réglé / solde / statut, with the filter "Impayés" and search;
  - a detail drawer showing postes per child (dû, réglé, reste), payments, a recap preview, and the buttons "Copier" and "Ouvrir dans la messagerie" (`mailtoUrl`), plus "Ajouter un règlement".
  - **Spec:** the fixture family shows "Reste à payer" and the recap is copied to the clipboard.
- **Task 14 — Règlements & banque** (`app/screens/reglements.js`):
  - payment form: family, child, date, montant, mode, n°, banque, nomCheque, moisEncaissement, plus affectation rows that must sum to the montant (otherwise a warning, and save is disabled);
  - list with filters by mode and month;
  - "Plan d'encaissement" (families × months from `encaissementPlan`, totals per month);
  - "Remise du mois": cheques for the chosen month, a "remis" checkbox and a printable bordereau;
  - totals espèces / carte / chèques by month.
  - **Spec:** an affectation mismatch disables save.

### Task 15: Remaining screens

**Files:** `app/screens/{attestation,mailings,stats,ado,carte,parametres,historique,import}.js`, `tests/ui/others.spec.mjs`

- [ ] **Attestation**: pick a child and lines (designation from postes, quantity, price from tarifs), preview, PDF.
- [ ] **Mailings**: activity/period selector, then a textarea with `mailingList` and a "Copier" button.
- [ ] **Statistiques CAF**: from/to dates → `cafStats` table, `bilan` cards.
- [ ] **ADO**: soirée dates (add/remove `extraDates.ado`), collégiens grid reusing the presences grid component.
- [ ] **Carte**: tables plus "Voir sur la carte" links via `openExternal`.
- [ ] **Paramètres**: edit periods, fériés, KT start, tarifs, lists, CAF hours, attestation texts, PDF folder; the button "Nouvelle année…" → `newYear`, which writes a new folder `JSM-<year>/` next to the current one.
- [ ] **Historique**: `historyOf`, filter by person and text.
- [ ] **Import Excel**: pick the 8 files (main-process dialog, multi-select) → report (counts, unmatched, ambiguous) → "Remplacer les données" (confirm) → `writeBase`, and the journals are archived to `Sauvegardes/journaux-<date>/`.
- [ ] Spec: open each screen without console errors; mailing dedupes; CAF table renders.
- [ ] Commit `feat(app): attestation, mailings, CAF, ADO, carte, paramètres, historique, import`.

### Task 16: End-to-end check and delivery

- [ ] Run `npm test` and every Playwright spec → all pass.
- [ ] Import the real files through `importWorkbooks` in a node script, load the result in the renderer with the mock bridge, and take screenshots of Présences (Pédibus T1), Listes du jour 2026-11-12, and Compta (DURAND). Compare 5 families' dû against Excel `Suivi Paiements!D` and explain each difference (fratrie fix, Toussaint bug).
- [ ] Bump version to `0.1.0`, update `README.md` (installation, choosing the drive folder, first import, three profiles, simultaneous use), commit, and zip the project without the `tests/fixtures/*.xlsm` files for upload to GitHub.
