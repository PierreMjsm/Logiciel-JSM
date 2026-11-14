# JSM Gestion

Logiciel de gestion de l'accueil de loisirs **Les Jeunes de Saint-Médard**. Il remplace les 8 classeurs Excel (Contact, Pédibus, Mercredi, Vacances, Compta, Chèque-Banque, CAF, ADO).

- **Enfants et familles** : fiches, fratries, inscriptions, groupes d'âge datés (ex. « 3 ans » toute l'année, « 4-5 ans » à partir de juillet).
- **Présences** : grille P / A / KT par activité, saisie au clic ou au clavier.
- **Listes du jour** : Pédibus par école (+ KT), Mercredi, Vacances. Impression ou PDF en un clic.
- **Compta familles** : dû, réglé, solde, avec la remise de 50 % pour le 3e enfant présent le même jour (mercredis et vacances). Récapitulatif à copier ou à envoyer par mail.
- **Règlements et banque** : chèques, espèces, carte ; plan d'encaissement mois par mois ; remise du mois et bordereau.
- **Attestation**, **Mailings**, **Statistiques CAF et bilan**, **ADO**, **Carte**, **Paramètres** (tarifs, périodes, fériés…), **Historique** (qui a changé quoi).

## Installer l'application (Windows)

1. Sur GitHub, ouvrez l'onglet **Actions** du projet, puis la dernière exécution réussie de « Construire l'installateur Windows ».
2. En bas de la page, téléchargez **JSM-Gestion-windows** (un fichier zip). Il contient `JSM-Gestion-Setup-0.2.0.exe`.
3. Lancez l'installateur sur chaque ordinateur (Pierre, Katell, Lucas). Windows peut afficher « Windows a protégé votre ordinateur » : cliquez sur *Informations complémentaires*, puis sur *Exécuter quand même*. Le logiciel n'est pas signé, ce qui est normal pour une association.

## Premier démarrage

1. **Choisir le dossier partagé.** Créez un dossier `JSM` dans votre Google Drive (ou OneDrive) synchronisé sur l'ordinateur, puis choisissez-le. **Les trois ordinateurs doivent choisir le même dossier.**
2. **Choisir son profil** : Pierre, Katell ou Lucas. Ce nom apparaît dans l'historique.
3. **Importer les fichiers Excel** (une seule fois, par une seule personne). Dans l'écran *Import Excel*, sélectionnez en une fois les 8 classeurs `.xlsm`. Lisez le rapport (homonymes, lignes non rattachées, écarts Compta / Banque), puis cliquez sur *Remplacer les données*.

## Travailler à plusieurs en même temps

Chaque ordinateur écrit **uniquement dans son propre fichier** (`journal-<profil>-<ordinateur>.jsonl`). L'appli lit les fichiers de tout le monde et affiche les modifications des autres dès que le drive les a synchronisées, en général en quelques secondes. Il n'y a donc jamais de « copie conflictuelle ». Si deux personnes changent la même case au même moment, la modification la plus récente l'emporte, et l'historique garde les deux.

La barre du bas indique qui d'autre est connecté.

## Sauvegardes

L'appli enregistre chaque jour une copie complète dans `JSM/Sauvegardes/` et garde les 60 dernières. Un import Excel archive aussi les anciennes données dans `Sauvegardes/journaux-<date>/`.

## Nouvelle année scolaire

*Paramètres › Préparer la nouvelle année* crée un dossier `JSM-2027-2028` à côté du dossier actuel. Il reprend les familles et les enfants encore présents ; les présences et les règlements repartent de zéro. Sur les autres ordinateurs, utilisez ensuite *Paramètres › Changer le dossier partagé*.

## Pour les développeurs

```bash
npm install          # installe Electron (nécessite Internet)
npm start            # lance l'application
npm test             # tests du cœur de calcul et du stockage
npm run test:ui      # tests d'interface (Playwright + Chrome)
npm run dist         # fabrique l'installateur Windows
```

- `src/core/` : calculs purs (calendrier, facturation, listes, rapports, import Excel), testés avec `node --test`.
- `electron/` : processus principal (dossier partagé, journaux, impression PDF, lecture des .xlsm sans dépendance).
- `app/` : interface (JavaScript sans framework, sans étape de compilation).
- Les fichiers Excel réels ne sont **jamais** mis sur GitHub (données personnelles des enfants) : `tests/fixtures/*.xlsm` est ignoré par git.
