// En-têtes exacts de l'export CSV Tally « Plateforme d'adhésion » (texte du formulaire), avec des réponses fictives.
export const TALLY_ENTETES = [
  "Submission ID",
  "Respondent ID",
  "Submitted at",
  "Nom de l'enfant : ",
  "Prénom de l'enfant",
  "Adresse e-mail ",
  "Adresse e-mail secondaire ",
  "Téléphone",
  "Téléphone secondaire",
  "Adresse et code postal",
  "Date de Naissance",
  "Ecole ou Collège fréquentés par l'enfant",
  "Classe fréquentée par l'enfant",
  "Une photo de l'enfant (n'importe laquelle, même une grimace fera l'affaire).",
  "Renseignements Sanitaires concernant l'enfant",
  "Renseignements Sanitaires concernant l'enfant (VACCINATION : merci de JOINDRE les photocopies des pages concernées)",
  "Renseignements Sanitaires concernant l'enfant (CERTIFIE sur l'honneur que mon enfant est à jour de l'ensemble des vaccinations obligatoires fixées par le Code de la santé publique (DTP, Coqueluche, Hib, Hépatite B, Pneumocoque, Méningocoque B, Méningocoques ACWY, ROR))",
  "Renseignements Sanitaires concernant l'enfant (ATTESTATION d’AYANT DROIT que vous retrouvez sur votre assurance maladie (Ameli). La caisse d’allocations familiales, qui nous accorde une subvention de prestation de service nous demande la photocopie de l’attestation Vitale du parent dont l’enfant est un ayant droit.)",
  "Renseignements Sanitaires concernant l'enfant (UN PAIEMENT du montant de 5€ pour l'ADHESION annuelle. Par carte, espèce ou chèque à l’ordre des Jeunes de Saint Médard)",
  "Renseignements médicaux concernant l'enfant, Indiquez si l'enfant a rencontré des difficultés de santé : (Maladies, accidents, allergies, hospitalisations)",
  "Votre enfant suit-il actuellement un traitement (P.A.I) Si oui, lequel ?Renseignements médicaux concernant l'enfant, Indiquez si l'enfant a rencontré des difficultés de santé : (Maladies, accidents, allergies, hospitalisations)",
  "Observations particulières concernant l'enfant :Si oui, lequel ?Renseignements médicaux concernant l'enfant, Indiquez si l'enfant a rencontré des difficultés de santé : (Maladies, accidents, allergies, hospitalisations)",
  "N° de sécurité sociale dont l'enfant est un ayant droit :",
  "Personne à contacter en cas d'urgence (Nom et numéro) :",
  "Personne autorisées à venir chercher votre enfant : (Nom, Prénom et lien)",
  "Seconde personne autorisées à venir chercher votre enfant : (Nom, Prénom et lien)",
  "Concernant les activités (cochés si vous êtes d'accords)",
  "Concernant les activités (cochés si vous êtes d'accords) (À participer à toutes les activités proposées dans le cadre de l'accueil de loisirs.)",
  "Concernant les activités (cochés si vous êtes d'accords) (À ce que mon enfant quitte seul l'accueil de loisirs à la fin des activités (12h15 le matin, à partir de 17h30 l'après-midi) – Uniquement pour les collégiens.)",
  "Concernant les activités (cochés si vous êtes d'accords) (J’autorise les Jeunes de Saint Médard à photographier et/ou filmer mon enfant dans le cadre des activités, et à diffuser ces images exclusivement sur les supports internes de l'association à des fins purement pédagogique (bilans d'activités papier, diaporamas internes).)",
  "Concernant les activités (cochés si vous êtes d'accords) (Chaque journée cochée sur les fiches d'inscription (Pédibus, vacances ou mercredis) sera facturée et due, les effectifs d'animation étant prévus en conséquence)",
  "Concernant les activités (cochés si vous êtes d'accords) (Autorise le responsable de l’accueil de loisirs à prendre, le cas échéant, toutes mesures (traitement médical, hospitalisation, intervention chirurgicale) rendues nécessaires par l'état de l'enfant.)",
  "Attestation d'ayant droit de votre Assurance Maladie",
  "Merci de joindre les photocopies des pages de vaccins",
  "Cochez si vous êtes d'accord",
  "Cochez si vous êtes d'accord (Je soussigné(e), en tant que responsable légal de l’enfant, déclare avoir pris connaissance des modalités d'inscription et certifie exacts les renseignements portés sur cette fiche.)",
  "Signature"
];

const SANITAIRE = "VACCINATION : merci de JOINDRE les photocopies des pages concernées, CERTIFIE sur l'honneur…";
const ACTIVITES = "À participer à toutes les activités proposées dans le cadre de l'accueil de loisirs., …";

// Une réponse fictive ; o remplace des valeurs par le numéro de colonne ou le début de l'en-tête.
export function tallyLigne(o = {}) {
  const v = ['sub1', 'resp1', '2026-11-15 17:15:15', 'Durand', 'Louise', 'famille.durand@example.fr', '', '0612345678', '', '1 rue des Exemples 75013 Paris',
    '2016-06-27', 'Marcel', 'CM2', 'https://storage.tally.so/private/photo.jpeg?id=P&accessToken=x', SANITAIRE, 'true', 'true', 'true', 'false',
    'Allergie aux arachides', 'Oui, PAI arachides', 'Aucune', '1 99 99 99 999 999 99', 'Tante 0611111111', 'Grand-mère Exemple', '', ACTIVITES,
    'true', 'false', 'false', 'true', 'true', 'https://storage.tally.so/private/ameli.pdf?id=A&accessToken=x', 'https://storage.tally.so/private/vaccins.pdf?id=V&accessToken=x',
    'Je soussigné(e)…', 'true', 'Marie Durand'];
  for (const [k, val] of Object.entries(o)) {
    const i = /^\d+$/.test(k) ? Number(k) : TALLY_ENTETES.findIndex((h) => h.startsWith(k));
    if (i < 0) throw new Error(`colonne inconnue : ${k}`);
    v[i] = val;
  }
  return v;
}

// Texte CSV comme l'export Tally (BOM, virgules, guillemets partout).
export function tallyCsv(lignes) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return `\ufeff${[TALLY_ENTETES, ...lignes].map((r) => r.map(q).join(',')).join('\n')}`;
}
