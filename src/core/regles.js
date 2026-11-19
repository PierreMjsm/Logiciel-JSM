// Règles de fonctionnement de l'appli, rédigées d'après les paramètres actuels (tarifs, dates…).
import { euro, dateFr } from './format.js';
import { TARIF_LABELS } from './calendar.js';

export function reglesFonctionnement(p) {
  const t = p.tarifs;
  const docs = (p.documents || []).map((d) => d.label).join(', ');
  return [
    { titre: 'Tarifs', lignes: [
      `Adhésion obligatoire : ${euro(t.adhesion)} par enfant et par année.`,
      `Pédibus : ${euro(t.pedibus)} par jour.`,
      `KT : ${euro(t.kt)} par jour (le jour de KT remplace le Pédibus classique).`,
      `Pédibus collégien (C) : ${euro(t.collegien ?? 1.5)} par jour.`,
      `Mercredi : ${euro(t.mercredi)} par demi-journée (matin ou après-midi).`,
      `Vacances : ${euro(t.journee)} par journée. Journée exceptionnelle : ${euro(t.exceptionnel)}.`,
      ...[...(p.tarifsChangements || [])].sort((a, b) => a.from.localeCompare(b.from)).map((ch) => `Changement : ${TARIF_LABELS[ch.cle] || ch.cle} à ${euro(ch.montant)} à partir du ${dateFr(ch.from)} (les jours d'avant restent à l'ancien tarif).`),
      'Les tarifs se modifient dans Paramètres › Tarifs. Pour un tarif qui change en cours d\'année, ajoutez un « changement de tarif » avec sa date : chaque jour est facturé au tarif en vigueur ce jour-là.',
    ] },
    { titre: 'Codes de la grille de présence', lignes: [
      'P : présent. Facturé, sur les listes du jour, compté pour la CAF.',
      'A : absent mais facturé (absence non excusée ou prévenue trop tard). Pas sur les listes du jour ; compté pour la CAF puisque payé.',
      'KT : jour de KT (mardi ou jeudi, à partir de la rentrée du KT). Facturé au prix du KT, sur la liste de l\'école (⛪) et sur la page KT.',
      'AKT : absence au KT. Facturée au prix du KT, pas sur les listes, comptée pour la CAF.',
      'C : collégien au Pédibus. Facturé au tarif collégien, sur la liste de l\'école.',
      'Case vide : rien n\'est facturé.',
    ] },
    { titre: 'Remise 3e enfant (fratrie)', lignes: [
      'Mercredis et vacances seulement (jamais le Pédibus, le KT ni les journées exceptionnelles).',
      'Elle se calcule jour par jour (demi-journée par demi-journée le mercredi) : si au moins 3 enfants de la même famille sont notés ce jour-là (P ou A), le 3e paie moitié prix, ainsi que le 4e et les suivants.',
      'Ce sont les plus jeunes qui sont comptés à demi-tarif ; le total de la famille est le même.',
    ] },
    { titre: 'Facturation et trimestres', lignes: [
      `Pédibus et mercredis sont facturés par trimestre : ${p.trimestres.map((x) => `T${x.n} du ${dateFr(x.start)} au ${dateFr(x.end)}`).join(' ; ')}.`,
      'Les mercredis et jours de Pédibus tombant pendant les vacances ou un jour férié ne sont jamais facturés comme Pédibus ou mercredi.',
      'Les vacances sont facturées par période (Toussaint, Noël, Hiver, Printemps, Rose, Vacances collégiens, Juillet, Août).',
      'Une famille paie pour tous ses enfants : le dû, le réglé et le solde sont calculés par famille (ce sont les parents qui règlent).',
    ] },
    { titre: 'Adhésion et dossier', lignes: [
      `L\'adhésion de ${euro(t.adhesion)} est due pour chaque enfant inscrit à une activité ou noté au moins une fois dans une grille.`,
      'Elle est réglée par un règlement affecté au poste « Adhésion » (le formulaire indique « Comprend l\'adhésion de… »), ou par la case « adhésion déjà réglée (hors logiciel) » de la fiche.',
      `Dossier complet quand toutes les pièces sont cochées : ${docs || 'aucune pièce définie'}. Les pièces manquantes sont rappelées dans le récapitulatif envoyé aux familles.`,
    ] },
    { titre: 'Règlements et banque', lignes: [
      'Chaque règlement est saisi une fois : famille, montant, mode (chèque, espèces, carte, virement), et ce qu\'il paie (un ou plusieurs postes).',
      'Les chèques ont un mois d\'encaissement prévu pour étaler les remises ; ils comptent « en banque » à partir de ce mois ou quand ils sont marqués remis.',
      'Les parents paient par trimestre : « dû à ce jour » ne compte que les trimestres et vacances déjà commencés ; « prévu sur l\'année » ajoute les présences déjà prévues jusqu\'en août.',
      'Solde à ce jour = réglé − dû à ce jour. Positif : trop-perçu (déduit des prochains frais). Négatif : reste à payer. Le statut Impayé et le récapitulatif envoyé aux familles suivent ce solde à ce jour.',
      'Les mails de récapitulatif sont préparés par l\'appli mais toujours relus et envoyés par nous ; la date du dernier récap ouvert est notée sur la famille.',
    ] },
    { titre: 'Jours habituels', lignes: [
      'Sur la fiche de l\'enfant (ou en cliquant sur son nom dans la grille), on coche ses jours de Pédibus et ses mercredis.',
      'L\'appli met P sur ces jours jusqu\'à la fin de l\'année : KT les jours de KT s\'il est inscrit au KT, C pour un collégien.',
      'Les vacances, les jours fériés et toutes les saisies existantes (en particulier les absences A et AKT) ne sont jamais écrasés.',
      'Quand un enfant s\'arrête en cours d\'année, les P se corrigent à la main dans la grille.',
    ] },
    { titre: 'Groupes d\'âge', lignes: [
      'Chaque enfant a un groupe (3 ans, 4-5 ans, 6-8 ans, 8-10 ans, Collégiens), qui peut changer à une date (ex. passage en 4-5 ans pour l\'été).',
      'Les listes du jour, les compteurs et la CAF utilisent le groupe valable à la date concernée.',
      '« Plus présent » : l\'enfant est gardé dans le carnet d\'adresses (mailings, campagnes de dons) mais n\'apparaît plus dans les grilles.',
      'À la nouvelle année : les enfants qui entrent en 6e passent en Collégiens, les 3 ans passent en 4-5 ans, les autres gardent leur groupe (à ajuster à la main).',
    ] },
    { titre: 'Nouvelle année', lignes: [
      'Chaque année a son dossier sur le drive. La nouvelle année garde toutes les familles et tous les enfants avec leurs coordonnées et leurs jours habituels ; présences, règlements, adhésions, documents et inscriptions repartent de zéro.',
      'Les impayés restent sur leur année. L\'année précédente se consulte en lecture seule (Paramètres › Années précédentes) et son compte rendu s\'imprime depuis Statistiques et bilan.',
      'Les autres ordinateurs passent automatiquement sur la nouvelle année à leur prochaine ouverture.',
    ] },
    { titre: 'Heures CAF', lignes: [
      'Un jour payé compte pour la CAF : présences (P, KT, C) et absences facturées (A, AKT).',
      'Pédibus : heures selon l\'école, le jour et la catégorie (moins de 6 ans, 6-11 ans, KT), dans Paramètres › Heures CAF.',
      'Mercredis, vacances, vacances collégiens et soirées ADO : un nombre d\'heures fixe par demi-journée, journée ou soirée.',
      'Déclaration CAF en année civile (1er janvier – 31 décembre) : l\'appli additionne l\'année scolaire précédente (janvier-août) et l\'année en cours (septembre-décembre). Noël est coupé au 31 décembre.',
      'Périscolaire : Pédibus et mercredis. Extrascolaire : vacances. Journées exceptionnelles : périscolaire ou extrascolaire, réglé date par date dans Paramètres.',
      'Tranches : 3 ans, 4-5 ans, 6 ans et plus. Les collégiens (toutes activités, Pédibus « C », soirées ADO) sont comptés à part, pour la PS Jeunes.',
      'Prévision de l\'année : réalisé + inscrit à venir ; un mois à venir sans aucune inscription est estimé sur le même mois de l\'année précédente.',
    ] },
    { titre: 'Listes du jour et attestations', lignes: [
      'Listes du jour : seuls les enfants notés P (et KT, C au Pédibus) y figurent, triés par âge ; * signale un PAI, ⛪ le KT. Les week-ends sont sautés.',
      'Journées exceptionnelles (journée pédagogique, fermeture d\'école…) : à ajouter dans Paramètres dès qu\'on les connaît.',
      'Attestation de présence : dates de présence réelle (P, KT, C), jours, heures et montants réglés pour ces activités sur la période choisie.',
      'Attestations annuelles (année civile, une par famille) : sommes réglées dans l\'année selon la date du règlement, adhésion exclue. Frais de garde pour les impôts : seulement les enfants de moins de 6 ans au 1er janvier.',
    ] },
    { titre: 'Pré-inscriptions et fiches PDF', lignes: [
      'Les réponses du formulaire Tally (lues en direct ou depuis les exports CSV) sont acceptées ou refusées une par une dans l\'écran Pré-inscriptions : rien n\'est modifié sans validation.',
      'Une pièce jointe plus récente (nouvelle année, nouveau fichier envoyé par les parents) remplace l\'ancienne dans le dossier de l\'enfant.',
      'Une famille est retrouvée par son mail ou son téléphone, un enfant par son prénom et sa date de naissance. Les mails sont ajoutés, jamais remplacés.',
      'Les pièces jointes et la fiche PDF remplie sont rangées dans « Dossiers enfants » sur le drive, un dossier par enfant, comme justificatifs en cas de contrôle.',
      'Les données de santé et le n° de sécurité sociale restent dans le dossier partagé : ne le partagez qu\'avec l\'équipe.',
    ] },
    { titre: 'Travail à plusieurs', lignes: [
      'Chaque ordinateur écrit dans son propre fichier du dossier partagé : on peut travailler en même temps sans conflit.',
      'Si deux personnes changent la même case, la modification la plus récente l\'emporte ; l\'historique garde les deux.',
      'Une sauvegarde complète est faite chaque jour dans le dossier « Sauvegardes » (60 jours gardés).',
      'OneDrive : régler le dossier JSM sur « Toujours conserver sur cet appareil » pour que chaque ordinateur ait toujours les fichiers à jour.',
    ] },
  ];
}
