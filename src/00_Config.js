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

      MATCHS: "1qjoX8_jtGZk9PtAlL3fhPc69gPyRV12h",
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
const APP_GROUP_PERMISSIONS = {
  ADMIN: [
    "ADHESIONS_READ",
    "ADHESIONS_WRITE",
    "ARBITRAGE_READ",
    "ARBITRAGE_WRITE",
    "OTM_READ",
    "OTM_WRITE",
    "MATCHS_READ",
    "MATCHS_WRITE",
    "IMPORT_FBI_LICENCES",
    "IMPORT_MATCH",
    "IMPORT_ASSOCONNECT",
    "ACCESS",
    "COMMUNICATION",
  ],

  COACH: [
    "MATCHS_READ",
    "MATCHS_WRITE",
    "ARBITRAGE_READ",
    "ARBITRAGE_WRITE",
    "OTM_READ",
    "OTM_WRITE",
  ],

  COORDINATION_OTM: [
    "OTM_READ",
    "OTM_WRITE",
    "MATCHS_READ",
    "MATCHS_WRITE",
    "ARBITRAGE_READ",
  ],

  COORDINATION_ARBITRAGE: [
    "ARBITRAGE_READ",
    "ARBITRAGE_WRITE",
    "MATCHS_READ",
    "MATCHS_WRITE",
    "OTM_READ",
  ],
};

const ACCESS_GROUPS = Object.keys(APP_GROUP_PERMISSIONS);

const ACCESS_GROUP_SHEET_HEADERS = [
  "Utilisateur_groupe_id",
  "Utilisateur_id",
  "Groupe_code",
  "Actif",
  "Date_maj",
];

const ACCESS_USER_EXTRA_HEADERS = ["Utilisateur_id", "Date_maj"];

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
  OTM: "OTM",
  OTM_EQUIPES: "OTM_Equipes",
  UTILISATEURS_GROUPES: "Utilisateurs_Groupes",
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
