const SPREADSHEETS = {
  ADMINISTRATION: "1Ljjy5r1UmxGftECdiTRUYJllMJchrG5npK-LOCcnopw",

  SPORT: "1zoWUZKmdipw9Es1okFo9RetxNOo-hGhpG8dNTa_sMQo",
  ADHESIONS: "1lFoqN3EDBHu1UcKAZsQ7kcszCgKEIZOURVJp3T8d688",
};

const IMPORT_FOLDERS = {
  ASSOCONNECT: {
    "2026-2027": "1TjVEhR5bEEjOEwHF-vwgJL8tsNdSW1A7",
  },
  FBI: {
    "2026-2027": {
      PREINSCRIPTION: "1ao_Inip12ULii5rWeXOvYlkkPOgxk-ZA",

      LICENCIES: "1jYg8T5xbyLK0M7UunWzsrpE_jwaSiZhW",
    },
  },
};

const DRIVE_FOLDERS = {
  EXTRACTS: "1xGgB3fMnXu8PSVn8rCP7MmaQA5M8gq9C",
};

/**
 * Permissions Google Sheets
 * associées aux rôles applicatifs.
 *
 * EDITOR = modification
 * READER = lecture seule
 * NONE   = aucun accès
 */
const ROLE_PERMISSIONS = {
  ADMIN: {
    ADMINISTRATION: "EDITOR",

    SPORT: "EDITOR",

    ADHESIONS: "EDITOR",
  },

  BUREAU: {
    ADMINISTRATION: "READER",

    SPORT: "EDITOR",

    ADHESIONS: "EDITOR",
  },

  COACH: {
    ADMINISTRATION: "READER",

    SPORT: "READER",

    ADHESIONS: "NONE",
  },
};

/**
 * Noms des onglets utilisés comme tables.
 *
 * Centralisés pour éviter les chaînes magiques
 * dispersées dans les modules.
 */
const SHEETS = {
  MATCHS: "Matchs",
  AFFECTATIONS_MATCHS: "Affectations_matchs",
  ARBITRAGE: "Arbitrage",
  SAISONS: "Saisons",
  HISTORIQUE: "Historique",
};

/**
 * Lieux possibles d'un match.
 *
 * Valeurs techniques stables (sans accent ni espace).
 * Les libellés d'affichage sont gérés côté client.
 */
const MATCHS_LIEUX = ["PIERRE_DENIS", "GERMAINE_TILLON", "EXTERIEUR"];

/**
 * Catégories d'un match.
 *
 * Dupliquées volontairement depuis ARBITRAGE_CATEGORIES_JOUEURS :
 * les deux listes ont la même valeur aujourd'hui mais répondent
 * à des besoins métier distincts (vivier d'arbitrage vs catégories
 * de matchs) et peuvent diverger. La validation côté serveur
 * s'appuie sur MATCHS_CATEGORIES.
 */
const MATCHS_CATEGORIES = [
  "U13F",
  "U13M",
  "U15F",
  "U15M",
  "U18F",
  "U18M",
  "SENIORS_F",
  "SENIORS_M",
];

/**
 * Rôles d'affectation d'une personne à un match.
 */
const AFFECTATION_ROLES = ["ARBITRE", "OTM", "RESPONSABLE_SALLE"];
