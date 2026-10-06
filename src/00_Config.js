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
