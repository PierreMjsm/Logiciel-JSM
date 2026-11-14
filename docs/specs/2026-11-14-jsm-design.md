# JSM Gestion — Conception (brouillon à valider)

Logiciel de gestion de l'accueil de loisirs **Les Jeunes de Saint-Médard**, qui remplace les 8 classeurs Excel 2026-2027 : Contact, Pédibus, Mercredi, Vacances, Compta, Chèque-Banque, CAF et ADO.

## 1. Pourquoi

Les classeurs actuels posent quatre problèmes :
- ils sont **lents** : chaque ouverture charge huit fichiers liés par OneDrive ;
- ils ne sont **pas fiables** : certaines formules sont fausses (voir l'annexe) ;
- la **génération du récapitulatif** envoyé aux familles marche mal ;
- **une ligne = un enfant, repéré par sa position** : trier ou insérer un enfant dans Contact fait glisser les présences et les paiements sur l'enfant voisin.

Le logiciel donne à chaque enfant un **identifiant fixe**. Les présences et les paiements y sont rattachés, pas à un numéro de ligne.

## 2. Objectifs / non-objectifs / à éviter

**Objectifs**
- Une seule appli, rapide (ouverture en moins de 2 secondes), qui couvre **tout** ce que font les 8 classeurs dès la première version.
- Des calculs justes et testés : tarifs, remise fratrie, dû, réglé, solde.
- Un récapitulatif famille toujours correct, à copier ou à envoyer.
- Des listes papier imprimables ou exportables en PDF.
- La reprise des données déjà saisies dans les Excel : rien à ressaisir.

**Non-objectifs**
- Pas d'hébergement en ligne, pas de comptes ni de mots de passe.
- Pas de saisie sur téléphone : tout se saisit sur ordinateur, à l'avance.
- Pas d'envoi automatique de mails : on passe par la messagerie habituelle.

**À éviter (ce serait un échec même si « ça marche »)**
- Perdre la saisie de quelqu'un parce que deux personnes ont enregistré en même temps.
- Un dû calculé différemment de ce que l'association applique réellement.
- Être obligé de repasser par Excel pour une tâche courante.

## 3. Contraintes

- **Utilisateurs** : Pierre, Katell, Lucas, **tous sous Windows**.
- **Installation** : appli de bureau installée par un **.exe**, sur le même modèle que « Planning des salles » (Electron). L'installateur est fabriqué par **GitHub Actions**.
- **Données** : un dossier sur le **drive synchronisé en local** (Google Drive ou OneDrive). Chaque ordinateur choisit ce dossier au premier lancement.
- **Plusieurs personnes peuvent avoir l'appli ouverte et modifier en même temps** (voir §5.2).
- Volume : environ 350 enfants actifs (plus de 800 fiches historiques), environ 180 jours de Pédibus, une quarantaine de mercredis et 8 périodes de vacances.

## 4. Approches envisagées

| Approche | Pour | Contre | Choix |
|---|---|---|---|
| **A. Appli de bureau Electron (.exe), données en fichiers sur le drive** | même modèle que Planning des salles, déjà maîtrisé ; vraie appli avec icône ; rapide ; fichiers lisibles et sauvegardables | il faut passer par GitHub Actions pour fabriquer le .exe | ✅ **retenue** (choix de Pierre) |
| B. Page HTML ouverte dans Chrome/Edge | rien à installer, mises à jour immédiates | pas un vrai .exe, ce que Pierre ne veut pas | écartée |
| C. Un seul Excel reconstruit proprement | rien de nouveau à apprendre | reste lent et fragile | écartée |

Pourquoi des fichiers texte plutôt qu'une base SQLite : une base SQLite posée dans un dossier synchronisé par un drive peut se corrompre, et elle ne supporte pas plusieurs écrivains à travers le drive. Ici, **chaque poste écrit uniquement dans son propre fichier** (§5.2), ce qui empêche les conflits de synchronisation.

## 5. Conception

### 5.1 Données (une année scolaire = un dossier `JSM-2026-2027/`)

- **Paramètres de l'année**
  - Périodes datées : T1, Toussaint, T1 (suite), Noël, T2, Hiver, T2 (suite), Printemps, T3, Juillet, Août, Rose, Collégiens été.
  - Jours fériés.
  - Dates de rentrée du KT mardi et du KT jeudi.
  - **Tarifs** : adhésion 5 €, Pédibus 5,50 €/jour, KT 5 €/jour, Mercredi 7 €/demi-journée, journée de vacances 14 €, journée exceptionnelle 14 €.
  - Listes : écoles, tranches d'âge, statuts de dossier (Perfect, Papier Adh, Vaccin, Sécu & Vaccin, PAI, €, Autre…).
  - Heures CAF par école, par jour et par catégorie.
  - Trésorier, numéro d'habilitation et textes de l'attestation.
- **Famille** : nom, nom pour les chèques si différent, mail(s), adresse, téléphone maman, téléphone papa.
- **Enfant** :
  - identifiant fixe, famille, prénom, date de naissance (l'âge est calculé) ;
  - **groupe d'âge datable** : un groupe de départ (3 ans, 4-5 ans, 6-8 ans, 8-10 ans, Collégiens, « Plus présent », « en attente »), plus des changements datés. Exemple : « 3 ans » toute l'année, puis « 4-5 ans » **à partir du 05/07/2027** pour l'été. Chaque liste, chaque compteur et la CAF utilisent **le groupe en vigueur à la date concernée** : le même enfant est compté en 3 ans en juin et en 4-5 ans en juillet. Un bouton « passage de groupe pour l'été » permet de faire le changement pour plusieurs enfants d'un coup ;
  - école, adhésion réglée (oui/non), statut du dossier, PAI ;
  - **inscriptions** : Pédibus, KT mardi, KT jeudi, Mercredi, Pédibus mercredi, chaque période de vacances, journées exceptionnelles, collégiens / ADO.
- **Présence** : (enfant, activité, date, créneau) → `P`, `A` ou `KT`. Le créneau sert au Mercredi (matin ou après-midi).
  - `A` signifie absent mais facturé : l'enfant **n'apparaît pas sur les listes papier** du jour, mais le jour est compté dans le dû.
- **Journées exceptionnelles et soirées ADO** : dates créées librement.
- **Règlement** (remplace à la fois le « réel € » de Compta et le fichier Chèque-Banque) :
  - famille, enfant concerné, date de réception, montant, mode (**chèque**, **espèces**, **carte**), n° de chèque, banque, nom sur le chèque, commentaire ;
  - **affectation** : l'activité et la période que le règlement paie (Pédibus T1/T2/T3, Mercredi T1/T2/T3, Toussaint, Noël, Hiver, Printemps, Rose, Juillet, Août, Collégiens, Exceptionnel, Adhésion). Un même chèque peut être réparti sur plusieurs postes ;
  - **mois d'encaissement prévu** (octobre … septembre), pour étaler les chèques dans le temps. Les espèces et la carte sont encaissées le jour même ;
  - **remis en banque** : oui/non, avec la date de remise (bordereau).
- **Historique** : qui, quand, quoi (« Katell : Mercredi 04/11 matin, AJAMRI Rayan A → P »).

### 5.2 Plusieurs personnes en même temps, sans conflit de drive

Un drive synchronisé ne sait pas fusionner un fichier modifié sur deux ordinateurs à la fois : il en garde une version, ou crée une « copie conflictuelle ». D'où le principe retenu : **personne n'écrit jamais dans le fichier d'un autre**.

- Le dossier `JSM-2026-2027/` contient :
  - `base.json` : l'état de départ (import Excel ou nouvelle année) ;
  - un **journal par poste** : `journal-Pierre-PC-BUREAU.jsonl`, `journal-Katell-PORTABLE.jsonl`… Chaque modification y ajoute une ligne (qui, quand, quoi). Exemples : « présence AJAMRI Rayan / Mercredi / 04-11 / matin = P », « règlement n°… créé ».
- À l'ouverture, l'appli lit `base.json` et **tous** les journaux, puis rejoue les modifications dans l'ordre chronologique.
- **Pendant l'utilisation**, l'appli surveille le dossier. Quand le drive apporte des nouvelles lignes d'un autre poste, elles s'affichent automatiquement. Le délai dépend du drive, en général quelques secondes à une minute.
- **Si deux personnes modifient la même case**, la modification la plus récente l'emporte. L'historique garde les deux, et un petit badge signale la case modifiée par quelqu'un d'autre dans la dernière minute.
- Un bandeau indique qui d'autre est actif (« Katell active il y a 20 s »). Chaque poste écrit un petit fichier `presence-<poste>.json`, mis à jour toutes les 30 secondes.
- Chaque poste compacte de temps en temps **son propre** journal. Il ne touche jamais aux autres.
- **Sauvegarde automatique** : une fois par jour, une copie consolidée datée dans `Sauvegardes/`. Les 60 dernières sont conservées.
- Le journal sert aussi d'**historique** : qui a changé quoi, quand.

### 5.3 Écrans

1. **Enfants / familles** (remplace Contact « général » et « PageJaune ») : recherche instantanée, tris et filtres (école, tranche, activité, adhérent, statut), fiche enfant, fiche famille avec la fratrie, ajout d'un enfant, compteurs comme en haut de « général ».
2. **Présences** : choix de l'activité et de la période, puis une grille enfants × dates.
   - Le clic fait tourner la case : vide → P → A → (KT pour le Pédibus les mardis et jeudis) → vide.
   - Saisie rapide au clavier, et « tout cocher P » sur une colonne.
   - Les fériés et les jours hors période sont grisés.
   - Les dates sont générées depuis les paramètres de l'année : Pédibus lundi, mardi, jeudi et vendredi ; Mercredi matin et après-midi ; vacances jour par jour, hors week-end.
   - Les totaux par tranche d'âge et par jour sont affichés en haut, comme dans les feuilles actuelles.
3. **Listes papier du jour** (remplace « Papier », « Liste », « Liste Générale » et « Liste Matin / Aprem ») : **l'écran le plus utilisé**. On choisit la date, puis on clique « Imprimer » ou « PDF ». Plus de filtre ni de copier-coller.
   - **Présentation** : celle des feuilles « Liste » actuelles, telles que tu les imprimes une fois triées. En haut, le titre en grand (« LISTE PRÉSENCE PÉDIBUS », « Liste de présence : Noël »…), la date en grand et le nombre d'enfants. Ensuite, un tableau numéroté Nom / Prénom / Âge / École / « Présent ? » (case vide, à cocher à la main), **trié par âge**.
   - **Qui apparaît** : seuls les enfants notés `P` à cette date. Les `A` ne figurent pas sur la liste.
   - **PAI** : un astérisque `*` après le prénom, comme aujourd'hui.
   - **Pédibus** : un seul PDF, **une page par école** (Rosalie, Buffon, Marcel, Brosso, Arbalète, Arago, Épée de Bois…). Les enfants qui ont KT ce jour-là portent ⛪ sur la liste de leur école. Ils apparaissent **aussi** sur une page **KT mardi** ou **KT jeudi** (avec leur école), puisqu'on va les chercher à l'école avant de les emmener au KT.
   - **Pédibus mercredi** (Buffon & Brosso) : une page par école.
   - **Mercredi** : matin et après-midi (et la journée entière), une page par tranche d'âge.
   - **Vacances** : une page par tranche d'âge, avec les colonnes « Présent ? » et « Sortie ? » vides, que les animateurs cochent à la main.
   - Le PDF est enregistré dans un dossier choisi une fois pour toutes, sous un nom comme `Pédibus 13-11-2026.pdf`.
4. **Compta familles** (remplace Compta « général », « Suivi Paiements » et « Résumé ») :
   - tableau par famille : dû, réglé, solde (✅ à jour / 💰 trop-perçu / ⚠️ reste à payer) ;
   - détail par enfant, par activité et par trimestre ;
   - filtre « impayés » ;
   - **récapitulatif famille** généré, avec les boutons « Copier » et « Ouvrir dans la messagerie ».
5. **Règlements et banque** (remplace Chèque-Banque et les colonnes « réel € » de Compta) :
   - saisie d'un règlement depuis la fiche famille, avec son affectation et son mois d'encaissement ;
   - **plan d'encaissement** : un tableau familles × mois qui montre combien chaque famille aura en banque chaque mois, pour étaler les chèques ;
   - **remise du mois** : la liste des chèques à déposer ce mois-ci, avec le total, la case « remis » et le bordereau imprimable ;
   - totaux espèces / carte / chèques, par mois.
6. **Attestation** (remplace « Facture ») : pour un enfant et une période, quantités × prix ; texte « Je soussigné… » ; export PDF.
7. **Mailings** (remplace « Mails » et « Tri de mail ») : adresses des familles inscrites à une activité ou une période, dédoublonnées, prêtes à copier (séparées par `;`).
8. **Statistiques CAF et bilan** (remplace CAF et « Rendu Global ») : heures par école × jour × catégorie (KT, -6 ans, 6-11 ans) entre deux dates ; totaux par trimestre ; montant prévu (présences × tarifs) / montant encaissé ; moyennes par jour ; nombre d'adhérents.
9. **ADO collégiens** : liste des collégiens et présences aux soirées.
10. **Carte** : nombre d'enfants par code postal et par école, et lien Google Maps pour chaque adresse.
11. **Paramètres** : année, périodes, fériés, tarifs, listes, heures CAF ; **nouvelle année** (reprend les familles et les enfants encore présents, vide les présences et les paiements).
12. **Historique**, et un **profil** au démarrage (Pierre, Katell ou Lucas). La version de l'appli est affichée en bas à droite.

### 5.4 Règles de calcul

Les règles sont reprises du classeur Compta et corrigées. Elles seront couvertes par des tests automatiques.

- **Jours facturés** = nombre de `P` + nombre de `A`. Les absences sont facturées, comme aujourd'hui.
- **Pédibus** : (jours P/A) × 5,50 € + (jours KT) × 5 €, par trimestre.
- **Mercredi** : demi-journées × 7 €, par trimestre.
- **Vacances** : jours × 14 €, par période.
- **Journées exceptionnelles** : jours × 14 €.
- **Adhésion** : 5 € par enfant adhérent.
- **Remise fratrie (−50 %)** : uniquement pour les **mercredis** et les **vacances**. Elle se calcule **jour par jour** (demi-journée par demi-journée pour le mercredi) :
  - si **au moins 3 enfants d'une même famille** sont notés sur ce même jour (ou cette même demi-journée), **en `P` ou en `A`**, le 3e paie moitié prix, ainsi que le 4e et les suivants ;
  - le « 3e » est le plus jeune des présents ce jour-là (choix du constructeur : le total famille est le même, quel que soit l'enfant désigné) ;
  - le Pédibus, le KT et les journées exceptionnelles n'ont jamais de remise.
- **Réglé par poste** = somme des règlements affectés à ce poste (activité + période). **Reste par poste** = dû du poste − réglé du poste.
- **Dû famille** = somme des postes de tous ses enfants. **Réglé famille** = somme de ses règlements. **Solde** = réglé − dû.
- **En banque** (à une date) = espèces et carte reçues + chèques dont le mois d'encaissement est passé ou qui sont marqués « remis ».

### 5.5 Reprise des données Excel

Un écran « Importer depuis Excel » lit les `.xlsm` actuels :
- les enfants depuis Contact « général », avec un identifiant attribué à chacun ;
- les présences depuis Pédibus, Mercredi et Vacances, rattachées au bon enfant par nom + prénom (et non plus par numéro de ligne) ;
- les règlements depuis Compta (« réel € » par poste) et Chèque-Banque (mode, mois d'encaissement), rapprochés par famille.

Un rapport liste ce qui n'a pas pu être rattaché.

## 6. Laissé au constructeur

- Le découpage du code, l'interface (sobre, claire, lisible à l'impression) et la police.
- Les raccourcis clavier de la grille de présence.
- La mise en page exacte des listes papier, au plus proche des feuilles actuelles.

## Annexe — anomalies relevées dans les classeurs actuels

1. Les présences sont reliées à Contact **par numéro de ligne** : un tri ou une insertion décale tout.
2. Remise fratrie des vacances de la Toussaint : le 3e enfant est calculé sur le prix de la demi-journée au lieu de celui de la journée (`AF8` : `Data!$C$10*0.5` au lieu de `$C$12`).
3. Le rang fratrie des mercredis T2 et T3 et des vacances (hors Toussaint) se compare à une seule cellule (`$W$8`, `$AD$8`…) au lieu de la colonne entière.
4. Le récapitulatif famille affiche « année scolaire 2025-2026 ». Il prend aussi les jours de caté et les collégiens dans de mauvaises colonnes (`AZ`, `BB`, `BD`, `BH`, `BJ`, qui sont en réalité les montants collégiens et KT).
5. « Réglé » existe à deux endroits : le « réel € » saisi par activité dans les feuilles et le total Chèque-Banque. Compta garde le plus grand des deux au lieu de les additionner ou de les rapprocher.
6. La remise fratrie actuelle classe les enfants sur le total de jours de la période. La règle réelle, elle, se joue jour par jour : 3 enfants présents le même jour.
7. Les macros d'export PDF pointent vers des dossiers 2025 en dur (`C:\Users\pierr\…\JSM - 2025\…`).

## Version 0.2 (retours de Pierre, 14/11/2026)

- **« C » = collégien au Pédibus**, facturé au tarif collégien (1,50 €/jour, modifiable). Dans la grille, un collégien passe de vide → C → A. Les C figurent sur les listes du jour de leur école.
- **Le montant banque fait foi** à l'import : les règlements repris sont ceux de Chèque-Banque. Compta et Vacances (« réel ») servent seulement à savoir ce que paie chaque règlement. On ne crée aucun règlement au-delà de ce qui est en banque. À la rentrée 2027, l'année repart d'un fichier vierge.
- **On raisonne par famille** : ce sont les parents qui paient. Les règlements importés sont rattachés à la famille. Les familles homonymes (ex. BERNARD et BERNARD3) restent distinctes et s'affichent « BERNARD (mail) ». Les frères et sœurs sont regroupés quand ils partagent un mail, un téléphone ou une adresse. On peut rattacher un enfant à une autre famille depuis sa fiche.
- **Adhésion obligatoire** : 5 € par enfant actif, c'est-à-dire inscrit à une activité ou noté présent. Elle est réglée soit par un règlement affecté au poste « Adhésion » (le formulaire indique « Comprend l'adhésion de : … »), soit par la case « déjà réglée hors logiciel » (reprise de la colonne Adh de Contact). Les statuts « Adhérent » et « Adhésion à régler » sont visibles partout, avec un filtre.
- **Documents du dossier** (fiche d'adhésion, vaccins, attestation Amélie / ayant droit), avec une liste modifiable dans Paramètres. Une coche par enfant, un statut « Dossier complet » ou « Manque : … », un filtre, et un rappel dans le récapitulatif envoyé aux familles.
- **CAF séparée** : Pédibus (école × jour × catégorie), Pédibus collégiens, Mercredis, Vacances et journées exceptionnelles, Soirées ADO. Seules les présences réelles (P, KT, C) comptent, pas les A. Chaque tableau est exportable en CSV pour Excel.
- **Anciennes familles conservées** (« Plus présent »), y compris à la nouvelle année, pour garder les contacts. Mailings : option « Inclure les anciennes familles ».
