// Lignes fictives au format du classeur « Inscriptions » (formulaire Tally → Power Automate).
// Mêmes en-têtes que le classeur « Inscriptions » rempli par Power Automate.
export const ENTETES = ['Date de réception', 'Statut_Paiement', 'Date_Paiement', 'ConcatHelloAsso', 'Nom', 'Prénom', 'E-mail', 'E-mail secondaire',
  'Téléphone', 'Téléphone secondaire', 'Adresse et CP', 'Date de naissance', 'École / Collège', 'Classe', 'Difficultés de santé', 'Traitement (P.A.I)',
  'Observations', 'N° de sécurité sociale', "Personne à contacter en cas d'urgence", 'Personne autorisée 1', 'Personne autorisée 2',
  'Vaccination (photocopies à joindre)', 'Certifie vaccins à jour', "Attestation d'ayant droit", 'Paiement 5 €', 'Participe à toutes les activités',
  'Part seul (collégiens)', "Droit à l'image", 'Journées facturées', 'Autorisation de soins', 'Responsable légal (je soussigné)', 'Signature',
  "Lien attestation d'ayant droit", 'Lien photocopies vaccins'];

export function ligne(o) {
  const base = { 'Date de réception': '12/11/2026', Nom: 'Durand', 'Prénom': 'Louise', 'E-mail': 'Famille.Durand@example.fr', 'Téléphone': '33612345678',
    'Adresse et CP': '1 rue des Exemples 75013 Paris', 'Date de naissance': '27/06/2016', 'École / Collège': 'Marcel', Classe: 'CM2',
    'Difficultés de santé': 'Allergie aux arachides', 'Traitement (P.A.I)': 'Oui, PAI arachides', 'N° de sécurité sociale': '1 99 99 99 999 999 99',
    "Personne à contacter en cas d'urgence": 'Tante 0611111111', 'Vaccination (photocopies à joindre)': 'Oui', 'Certifie vaccins à jour': 'Oui',
    "Droit à l'image": 'Non', 'Autorisation de soins': 'Oui', 'Responsable légal (je soussigné)': 'Marie Durand', Signature: 'Marie Durand',
    'Lien photocopies vaccins': 'https://storage.tally.so/private/vaccins.pdf?id=A&accessToken=x', ...o };
  return ENTETES.map((h) => (h in base ? base[h] : null));
}

