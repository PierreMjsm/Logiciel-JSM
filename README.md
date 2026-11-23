# JSM Gestion

Logiciel de gestion de l'accueil de loisirs **Les Jeunes de Saint-Médard**. Il remplace les 8 classeurs Excel (Contact, Pédibus, Mercredi, Vacances, Compta, Chèque-Banque, CAF, ADO).

- **Enfants et familles** : fiches, fratries, inscriptions, groupes d'âge datés (ex. « 3 ans » toute l'année, « 4-5 ans » à partir de juillet).
- **Présences** : grille P / A / KT / AKT (absence KT, facturée au prix du KT) / C (collégien), saisie au clic ou au clavier.
- **Listes du jour** : Pédibus par école (+ KT), Mercredi, Vacances. Impression ou PDF en un clic.
- **Compta familles** : dû, réglé, solde, avec la remise de 50 % pour le 3e enfant présent le même jour (mercredis et vacances). Récapitulatif à copier ou à envoyer par mail.
- **Règlements et banque** : chèques, espèces, carte ; plan d'encaissement mois par mois ; remise du mois et bordereau.
- **Attestation**, **Mailings**, **Statistiques CAF et bilan**, **ADO**, **Carte**, **Paramètres** (tarifs, périodes, fériés…), **Historique** (qui a changé quoi).

## Installer l'application (Windows)

1. Sur GitHub, ouvrez l'onglet **Actions** du projet, puis la dernière exécution réussie de « Construire l'installateur Windows ».
2. En bas de la page, téléchargez **JSM-Gestion-windows** (un fichier zip). Il contient `JSM-Gestion-Setup-1.4.1.exe`.
3. Lancez l'installateur sur chaque ordinateur (Pierre, Katell, Lucas). Windows peut afficher « Windows a protégé votre ordinateur » : cliquez sur *Informations complémentaires*, puis sur *Exécuter quand même*. Le logiciel n'est pas signé, ce qui est normal pour une association.

## Premier démarrage

1. **Choisir le dossier partagé.** Créez un dossier `JSM` dans votre Google Drive (ou OneDrive) synchronisé sur l'ordinateur, puis choisissez-le. **Les trois ordinateurs doivent choisir le même dossier.**
2. **Choisir son profil** : Pierre, Katell ou Lucas. Ce nom apparaît dans l'historique.
3. **Importer les fichiers Excel** (une seule fois, par une seule personne). Dans l'écran *Import Excel*, sélectionnez en une fois les 8 classeurs `.xlsm`. Lisez le rapport (homonymes, lignes non rattachées, écarts Compta / Banque), puis cliquez sur *Remplacer les données*.

## Travailler à plusieurs en même temps

Chaque ordinateur écrit **uniquement dans son propre fichier** (`journal-<profil>-<ordinateur>.jsonl`). L'appli lit les fichiers de tout le monde et affiche les modifications des autres dès que le drive les a synchronisées, en général en quelques secondes. Il n'y a donc jamais de « copie conflictuelle ». Si deux personnes changent la même case au même moment, la modification la plus récente l'emporte, et l'historique garde les deux.

La barre du bas indique qui d'autre est connecté.

**OneDrive** : dans l'explorateur Windows, clic droit sur le dossier JSM › *Toujours conserver sur cet appareil*, sur chaque ordinateur. Ainsi les fichiers des autres sont toujours présents et à jour.

## Sauvegardes

L'appli enregistre chaque jour une copie complète dans `JSM/Sauvegardes/` et garde les 60 dernières. Un import Excel archive aussi les anciennes données dans `Sauvegardes/journaux-<date>/`.

## Nouvelle année scolaire

Bouton **Paramètres › Nouvelle année…** : un assistant passe en revue les **tarifs** (repris des derniers en vigueur), les **dates des vacances** (proposées au même jour de la semaine, à vérifier avec le calendrier officiel), la rentrée du KT et les **jours fériés** (calculés, Pâques compris), puis crée le dossier `JSM-2027-2028`. Toutes les familles et tous les enfants sont repris ; présences, règlements, adhésions, documents et inscriptions repartent de zéro. Les enfants qui entrent en 6e passent en Collégiens et les 3 ans en 4-5 ans ; les autres gardent leur groupe.

Les autres ordinateurs passent tout seuls sur la nouvelle année à leur prochaine ouverture. L'année précédente reste dans son dossier : *Paramètres › Années précédentes* l'ouvre en lecture seule (pour la CAF ou une recherche), et *Statistiques et bilan › Imprimer le compte rendu de l'année* en donne le résumé sur 2 pages.

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

## Confidentialité

Ce dépôt peut être **public** : il ne contient que le programme. Aucune donnée des familles ou des enfants n'y figure (les tests utilisent des personnes fictives). Les vraies données restent uniquement dans le dossier partagé sur votre drive. Le nom du trésorier et le numéro d'habilitation se saisissent dans *Paramètres › Attestation* et sont enregistrés dans ce dossier, pas dans le code.

## Ajouter plusieurs enfants d'un coup

*Import Excel › Ajouter des enfants depuis un fichier* : enregistrez le modèle Excel, remplissez une ligne par enfant (ou utilisez l'export CSV d'un formulaire), puis choisissez le fichier. Un aperçu montre les enfants à ajouter, les familles déjà connues et les doublons, avant tout ajout. Rien n'est remplacé.

## Jours habituels

Sur la fiche d'un enfant (ou en cliquant sur son nom dans la grille Présences), cochez ses jours de Pédibus (lundi, mardi, jeudi, vendredi) et ses mercredis (matin, après-midi). L'appli met P sur tous ces jours jusqu'à la fin de l'année (KT les jours de KT, C pour les collégiens), sans toucher aux vacances, aux jours fériés ni aux absences déjà notées. Dans la grille, « Remplir d'après les jours habituels… » le fait pour tous les enfants d'un coup, et « + Inscrire des enfants » ajoute des enfants à l'activité affichée.

## Heures CAF et attestations

- *Heures CAF* : un jour payé compte (présences et absences facturées A, AKT) ; heures par activité (Pédibus, Mercredis, chaque période de vacances, Vacances collégiens, Soirées ADO) pour les moins de 6 ans, les 6 ans et plus et les collégiens, exportables vers Excel.
- *Attestation* : attestation de présence pour l'employeur des parents (dates, jours, heures, montants réglés) et attestation de paiement.

## Règles de fonctionnement

*Paramètres › Règles de fonctionnement* explique comment l'appli calcule chaque chose (tarifs, codes P / A / KT / AKT / C, remise 3e enfant, adhésion, CAF…), d'après vos réglages actuels, avec un espace « Nos règles et notes » partagé entre vous.

## Pré-inscriptions en ligne et fiches PDF

Les parents remplissent le formulaire Tally. L'appli lit les réponses de deux façons (les deux peuvent servir ensemble) :

- **Tally en direct (conseillé)** : *Pré-inscriptions › Connexion Tally…*, collez le lien des réponses (`https://tally.so/forms/D4LrYR/submissions`) et une clé API Tally (gratuite : tally.so › Settings › API keys). La clé reste sur l'ordinateur ; à refaire sur chaque PC. Au démarrage, l'appli signale les nouvelles pré-inscriptions (« Pré-inscriptions (3) »).
- **Exports CSV** : enregistrez les téléchargements Tally (Réponses › Télécharger CSV) toujours dans le même dossier et choisissez-le une fois. Tous les exports du dossier sont lus ; une réponse présente dans plusieurs exports n'apparaît qu'une fois (inutile de supprimer les réponses dans Tally).

Pour chaque inscription : **Refuser** (doublon, test : rien n'est modifié) ou **Accepter…** : l'appli cherche alors la famille (mail, téléphone) et l'enfant (prénom + date de naissance), montre ce qui change, et vous cochez ce que vous reprenez. « Valider » met à jour la fiche, range les pièces jointes (vaccins, attestation d'ayant droit, photo) dans le dossier de l'enfant — une pièce plus récente remplace l'ancienne — et y crée la fiche PDF remplie.

Les dossiers des enfants sont par défaut dans `JSM/Dossiers enfants/` ; *Paramètres › Fiches PDF › Dossiers des enfants* permet de les mettre ailleurs sur le drive (réglage de chaque ordinateur).

**Paramètres › Fiches PDF** : ajoutez le PDF de la fiche *avec ses champs à remplir* (comme la fiche d'adhésion 2026-2027). Il est copié dans `JSM/Modeles/`. L'appli propose pour chaque champ l'information à y écrire ; vérifiez avec « Aperçu avec les noms ». Quand la fiche change, ajoutez la nouvelle version : les champs de même nom reprennent la même information. Pour un PDF sans champs : Acrobat › Préparer un formulaire.

Dans la fiche d'un enfant : sa **photo** (reçue par Tally, ou « Ajouter une photo »), « Renseignements de la fiche d'adhésion » (modifiables), et les boutons **Fiche PDF** (crée et ouvre le PDF) et **Dossier** (ouvre son dossier sur le drive).

**Départ d'un enfant** : « Marquer « Plus présent » » garde tout par défaut (l'enfant reste dans la liste des anciens, avec ses **années de présence**, ex. « 2025-2026, 2026-2027 »). En cochant « Effacer aussi ses documents », son dossier est supprimé et on ne garde que nom, prénom, date de naissance, mail et adresse de la famille. Présences et règlements restent pour la compta et la CAF.

**Trombinoscope** (menu Communication et bilans) : par groupe, par âge ou tout le monde, prénom + initiale du nom sous chaque photo ; onglet **Fiches santé (PAI)** pour les sorties. On imprime seulement si on le souhaite.

**Enfants › « Déjà venu à… »** : tous les enfants venus au moins une fois au Pédibus, aux mercredis, aux vacances, aux journées exceptionnelles ou à l'ADO, cette année ou les années précédentes (anciens compris). L'historique des activités est gardé à chaque nouvelle année.

**Enfants › Mails dossiers incomplets** : un mail par famille listant les documents manquants, à relire et envoyer vous-même ; la date du dernier rappel est notée.

## Tarifs qui changent en cours d'année

*Paramètres › Changements de tarif en cours d'année* : par exemple Pédibus à 6 € à partir du 4 janvier. Chaque jour est facturé au tarif en vigueur ce jour-là (les jours de septembre à décembre restent à 5,50 €).

## Impression des fiches

Chaque fiche PDF créée est notée « à imprimer ». *Imprimer les fiches pas encore imprimées (N)* (dans Pré-inscriptions et dans Paramètres › Fiches PDF) les réunit en un seul PDF à imprimer d'un coup, puis les marque imprimées.

## Saisir les règlements

- **Règlement rapide** : dans la fiche d'une famille (Compta familles), bouton « + Règlement » sur la ligne de l'enfant et du poste ; ou dans Présences, clic sur le nom d'un enfant puis « + Règlement » (le poste est celui de la grille affichée). Le montant restant dû est proposé, et l'on voit en haut où en est toute la famille.
- **Formulaire complet** (« Nouveau règlement ») : pour répartir un chèque sur plusieurs enfants ou postes. « Enregistrer et nouveau » enchaîne la saisie de plusieurs familles en gardant la date et le mode.

## Nom de l'enfant

La fiche enfant a un champ « Nom » à côté du prénom : il remplit le nom de la famille. Si l'enfant ne porte pas le même nom que ses parents, changez-le : il ne vaut que pour cet enfant.
