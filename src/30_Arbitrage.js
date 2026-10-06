/*
 * ============================================================
 * ARBITRAGE
 * ============================================================
 *
 * Gestion du référentiel des arbitres du club.
 *
 * Sources :
 * - USAB - Adhésions / Contacts
 * - USAB - Adhésions / Adhesions
 * - USAB - Sport / Arbitrage
 *
 * Les joueurs proviennent des adhésions.
 * La feuille Arbitrage contient uniquement les informations
 * spécifiques à l'arbitrage.
 */

/*
 * ============================================================
 * CONSTANTES
 * ============================================================
 */

const ARBITRAGE_NIVEAUX = [
  "DEBUTANT",
  "APPRENTISSAGE",
  "AUTONOME",
  "CONFIRME",
  "REFERENT",
];

const ARBITRAGE_TYPES = ["JOUEUR", "CLUB", "EXTERIEUR"];

/*
 * Catégories de joueurs intégrées
 * au vivier d'arbitrage.
 *
 * Les catégories U7, U9 et U11
 * ne sont volontairement pas incluses.
 */
const ARBITRAGE_CATEGORIES_JOUEURS = [
  "U13F",
  "U13M",
  "U15F",
  "U15M",
  "U18F",
  "U18M",
  "SENIORS_F",
  "SENIORS_M",
];

/*
 * ============================================================
 * GET ARBITRES
 * ============================================================
 *
 * Retourne le référentiel complet des arbitres pour une saison.
 *
 * Pour les joueurs :
 * - identité depuis Contacts
 * - catégorie depuis Adhesions
 * - évaluation depuis Arbitrage
 *
 * Pour CLUB / EXTERIEUR :
 * - identité directement depuis Arbitrage
 */

function getArbitres(saisonId) {
  requireRole("ADMIN", "BUREAU");

  saisonId = String(saisonId || "").trim();

  if (!saisonId) {
    throw new Error("La saison est obligatoire.");
  }

  /*
   * =========================
   * OUVERTURE DES BASES
   * =========================
   */

  const adhesionSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const contactsSheet = adhesionSpreadsheet.getSheetByName("Contacts");

  const adhesionsSheet = adhesionSpreadsheet.getSheetByName("Adhesions");

  const arbitrageSheet = sportSpreadsheet.getSheetByName("Arbitrage");

  if (!contactsSheet) {
    throw new Error("Feuille Contacts introuvable.");
  }

  if (!adhesionsSheet) {
    throw new Error("Feuille Adhesions introuvable.");
  }

  if (!arbitrageSheet) {
    throw new Error("Feuille Arbitrage introuvable.");
  }

  /*
   * =========================
   * LECTURE
   * =========================
   */

  const contactsData = readSheetAsObjects(contactsSheet);

  const adhesionsData = readSheetAsObjects(adhesionsSheet);

  const arbitrageData = readSheetAsObjects(arbitrageSheet);

  const contacts = contactsData.rows;

  const adhesions = adhesionsData.rows;

  const arbitrages = arbitrageData.rows;

  /*
   * =========================
   * INDEX CONTACTS
   * =========================
   */

  const contactsById = {};

  contacts.forEach((contact) => {
    const contactId = String(contact.Contact_id || "").trim();

    if (contactId) {
      contactsById[contactId] = contact;
    }
  });

  /*
   * =========================
   * INDEX ARBITRAGE JOUEURS
   * =========================
   */

  const arbitrageByContactId = {};

  arbitrages

    .filter(
      (arbitrage) => String(arbitrage.Saison_id || "").trim() === saisonId,
    )

    .filter((arbitrage) => String(arbitrage.Contact_id || "").trim() !== "")

    .forEach((arbitrage) => {
      const contactId = String(arbitrage.Contact_id).trim();

      arbitrageByContactId[contactId] = arbitrage;
    });

  /*
   * =========================
   * JOUEURS
   * =========================
   */

  const result = [];

  adhesions

    /*
     * Saison sélectionnée.
     */
    .filter((adhesion) => String(adhesion.Saison_id || "").trim() === saisonId)

    /*
     * Seuls les joueurs U13
     * à Seniors sont intégrés
     * au vivier d'arbitrage.
     */
    .filter((adhesion) =>
      ARBITRAGE_CATEGORIES_JOUEURS.includes(
        String(adhesion.Categorie || "").trim(),
      ),
    )

    .forEach((adhesion) => {
      const contactId = String(adhesion.Contact_id || "").trim();

      if (!contactId) {
        return;
      }

      const contact = contactsById[contactId];

      if (!contact) {
        return;
      }

      const evaluation = arbitrageByContactId[contactId] || {};

      result.push({
        Arbitre_id: evaluation.Arbitre_id || "",

        Saison_id: saisonId,

        Contact_id: contactId,

        Type: "JOUEUR",

        Prenom: contact.Prenom || "",

        Nom: contact.Nom || "",

        Licence_ffbb: contact.Licence_ffbb || "",

        Categorie: adhesion.Categorie || "",

        Niveau: evaluation.Niveau || "",

        Actif: evaluation.Actif || "",

        Commentaire: evaluation.Commentaire || "",

        Date_maj: formatArbitrageDateForClient(evaluation.Date_maj),
      });
    });

  /*
   * =========================
   * CLUB / EXTERIEURS
   * =========================
   */

  arbitrages

    .filter(
      (arbitrage) => String(arbitrage.Saison_id || "").trim() === saisonId,
    )

    .filter((arbitrage) => String(arbitrage.Contact_id || "").trim() === "")

    .forEach((arbitrage) => {
      result.push({
        Arbitre_id: arbitrage.Arbitre_id || "",

        Saison_id: saisonId,

        Contact_id: "",

        Type: arbitrage.Type || "EXTERIEUR",

        Prenom: arbitrage.Prenom_externe || "",

        Nom: arbitrage.Nom_externe || "",

        Licence_ffbb: "",

        Categorie: "",

        Niveau: arbitrage.Niveau || "",

        Actif: arbitrage.Actif || "",

        Commentaire: arbitrage.Commentaire || "",

        Date_maj: formatArbitrageDateForClient(arbitrage.Date_maj),
      });
    });

  /*
   * =========================
   * TRI
   * =========================
   */

  const categorieOrder = ARBITRAGE_CATEGORIES_JOUEURS;

  result.sort((a, b) => {
    const indexA = categorieOrder.indexOf(a.Categorie);

    const indexB = categorieOrder.indexOf(b.Categorie);

    /*
     * Les personnes CLUB /
     * EXTERIEUR n'ont pas
     * de catégorie.
     *
     * Elles sont placées après
     * les joueurs.
     */
    const orderA = indexA === -1 ? 999 : indexA;

    const orderB = indexB === -1 ? 999 : indexB;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const nomCompare = String(a.Nom || "").localeCompare(
      String(b.Nom || ""),
      "fr",
      {
        sensitivity: "base",
      },
    );

    if (nomCompare !== 0) {
      return nomCompare;
    }

    return String(a.Prenom || "").localeCompare(String(b.Prenom || ""), "fr", {
      sensitivity: "base",
    });
  });

  return result;
}
/*
 * ============================================================
 * SAVE NIVEAU ARBITRE CLUB / EXTERIEUR
 * ============================================================
 *
 * Modifie le niveau d'un arbitre
 * CLUB ou EXTERIEUR existant.
 */

function saveArbitreExterneNiveau(arbitreId, niveau) {
  requireRole("ADMIN", "BUREAU");

  arbitreId = String(arbitreId || "").trim();

  niveau = String(niveau || "")
    .trim()
    .toUpperCase();

  /*
   * =========================
   * VALIDATION
   * =========================
   */

  if (!arbitreId) {
    throw new Error("L'Arbitre_id est obligatoire.");
  }

  if (niveau && !ARBITRAGE_NIVEAUX.includes(niveau)) {
    throw new Error("Niveau d'arbitrage invalide : " + niveau);
  }

  /*
   * =========================
   * FEUILLE ARBITRAGE
   * =========================
   */

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const arbitrageSheet = sportSpreadsheet.getSheetByName("Arbitrage");

  if (!arbitrageSheet) {
    throw new Error("Feuille Arbitrage introuvable.");
  }

  /*
   * =========================
   * VERROU
   * =========================
   */

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    /*
     * Relire après acquisition
     * du verrou.
     */

    const arbitrageData = readSheetAsObjects(arbitrageSheet);

    const headers = arbitrageData.headers;

    const arbitrages = arbitrageData.rows;

    /*
     * =========================
     * RECHERCHE
     * =========================
     */

    const matches = arbitrages.filter(
      (row) => String(row.Arbitre_id || "").trim() === arbitreId,
    );

    if (matches.length === 0) {
      throw new Error("Arbitre introuvable : " + arbitreId);
    }

    if (matches.length > 1) {
      throw new Error(
        "Plusieurs arbitres utilisent l'identifiant " + arbitreId + ".",
      );
    }

    const arbitre = matches[0];

    /*
     * =========================
     * VERIFICATION TYPE
     * =========================
     */

    const type = String(arbitre.Type || "")
      .trim()
      .toUpperCase();

    if (type !== "CLUB" && type !== "EXTERIEUR") {
      throw new Error(
        "Cette fonction ne peut modifier que les arbitres CLUB ou EXTERIEUR.",
      );
    }

    /*
     * Sécurité supplémentaire :
     * un arbitre CLUB / EXTERIEUR
     * ne doit pas être lié à un
     * Contact_id joueur.
     */

    if (String(arbitre.Contact_id || "").trim()) {
      throw new Error(
        "Cet arbitre est lié à un contact du club et ne peut pas être modifié avec cette fonction.",
      );
    }

    /*
     * =========================
     * VALEUR ACTUELLE
     * =========================
     */

    const ancienneValeur = String(arbitre.Niveau || "")
      .trim()
      .toUpperCase();

    if (ancienneValeur === niveau) {
      return {
        success: true,

        action: "UNCHANGED",

        Arbitre_id: arbitreId,

        Type: type,

        Niveau: niveau,
      };
    }

    /*
     * =========================
     * MISE A JOUR
     * =========================
     */

    arbitre.Niveau = niveau;

    arbitre.Actif = "Oui";

    arbitre.Date_maj = new Date();

    writeObjectsToSheet(arbitrageSheet, headers, arbitrages);

    return {
      success: true,

      action: "UPDATED",

      Arbitre_id: arbitreId,

      Type: type,

      Niveau: niveau,
    };
  } finally {
    lock.releaseLock();
  }
}

/*
 * ============================================================
 * TEST
 * ============================================================
 */
function testSaveArbitreExterneNiveau() {
  const result = saveArbitreExterneNiveau("ARB-000001", "CONFIRME");

  console.log(JSON.stringify(result, null, 2));
}
function testGetArbitres() {
  const arbitres = getArbitres("2026-2027");

  const stats = {
    total: arbitres.length,

    joueurs: 0,

    club: 0,

    exterieurs: 0,

    avecLicence: 0,

    avecNiveau: 0,

    categories: {},
  };

  arbitres.forEach((arbitre) => {
    if (arbitre.Type === "JOUEUR") {
      stats.joueurs++;
    }

    if (arbitre.Type === "CLUB") {
      stats.club++;
    }

    if (arbitre.Type === "EXTERIEUR") {
      stats.exterieurs++;
    }

    if (String(arbitre.Licence_ffbb || "").trim()) {
      stats.avecLicence++;
    }

    if (String(arbitre.Niveau || "").trim()) {
      stats.avecNiveau++;
    }

    const categorie = String(arbitre.Categorie || "").trim();

    if (categorie) {
      stats.categories[categorie] = (stats.categories[categorie] || 0) + 1;
    }
  });

  console.log(JSON.stringify(stats, null, 2));

  console.log(JSON.stringify(arbitres.slice(0, 10), null, 2));
}

/*
 * ============================================================
 * SAVE NIVEAU ARBITRE
 * ============================================================
 *
 * Enregistre ou modifie le niveau d'arbitrage
 * d'un joueur pour une saison.
 *
 * Une ligne Arbitrage est créée uniquement
 * lorsqu'un joueur est évalué.
 */

function saveArbitreNiveau(contactId, saisonId, niveau) {
  requireRole("ADMIN", "BUREAU");

  contactId = String(contactId || "").trim();

  saisonId = String(saisonId || "").trim();

  niveau = String(niveau || "")
    .trim()
    .toUpperCase();

  /*
   * =========================
   * VALIDATION
   * =========================
   */

  if (!contactId) {
    throw new Error("Le Contact_id est obligatoire.");
  }

  if (!saisonId) {
    throw new Error("La saison est obligatoire.");
  }

  if (niveau && !ARBITRAGE_NIVEAUX.includes(niveau)) {
    throw new Error("Niveau d'arbitrage invalide : " + niveau);
  }

  /*
   * =========================
   * VERIFICATION CONTACT
   * =========================
   */

  const adhesionSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

  const contactsSheet = adhesionSpreadsheet.getSheetByName("Contacts");

  const adhesionsSheet = adhesionSpreadsheet.getSheetByName("Adhesions");

  if (!contactsSheet || !adhesionsSheet) {
    throw new Error("Feuilles Contacts ou Adhesions introuvables.");
  }

  const contacts = readSheetAsObjects(contactsSheet).rows;

  const adhesions = readSheetAsObjects(adhesionsSheet).rows;

  const contact = contacts.find(
    (row) => String(row.Contact_id || "").trim() === contactId,
  );

  if (!contact) {
    throw new Error("Contact introuvable : " + contactId);
  }

  const adhesion = adhesions.find(
    (row) =>
      String(row.Contact_id || "").trim() === contactId &&
      String(row.Saison_id || "").trim() === saisonId,
  );

  if (!adhesion) {
    throw new Error("Aucune adhésion trouvée pour ce joueur et cette saison.");
  }

  /*
   * =========================
   * FEUILLE ARBITRAGE
   * =========================
   */

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const arbitrageSheet = sportSpreadsheet.getSheetByName("Arbitrage");

  if (!arbitrageSheet) {
    throw new Error("Feuille Arbitrage introuvable.");
  }

  const arbitrageData = readSheetAsObjects(arbitrageSheet);

  const headers = arbitrageData.headers;

  const arbitrages = arbitrageData.rows;

  /*
   * =========================
   * VERIFICATION COLONNES
   * =========================
   */

  const requiredHeaders = [
    "Arbitre_id",
    "Saison_id",
    "Contact_id",
    "Type",
    "Prenom_externe",
    "Nom_externe",
    "Email_externe",
    "Telephone_externe",
    "Niveau",
    "Actif",
    "Commentaire",
    "Date_maj",
  ];

  requiredHeaders.forEach((header) => {
    if (!headers.includes(header)) {
      throw new Error("Colonne manquante dans Arbitrage : " + header);
    }
  });

  /*
   * =========================
   * VERROU
   * =========================
   */

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    /*
     * =========================
     * RECHERCHE LIGNE EXISTANTE
     * =========================
     */

    const matches = arbitrages.filter(
      (row) =>
        String(row.Saison_id || "").trim() === saisonId &&
        String(row.Contact_id || "").trim() === contactId,
    );

    if (matches.length > 1) {
      throw new Error(
        "Plusieurs lignes Arbitrage existent pour " +
          contactId +
          " sur la saison " +
          saisonId +
          ".",
      );
    }

    const now = new Date();

    /*
     * =========================
     * MISE A JOUR
     * =========================
     */

    if (matches.length === 1) {
      const existing = matches[0];

      const ancienneValeur = String(existing.Niveau || "").trim();

      /*
       * Rien à modifier.
       */

      if (ancienneValeur === niveau) {
        return {
          success: true,

          action: "UNCHANGED",

          Arbitre_id: existing.Arbitre_id,

          Contact_id: contactId,

          Saison_id: saisonId,

          Niveau: niveau,
        };
      }

      existing.Niveau = niveau;

      existing.Type = "JOUEUR";

      existing.Actif = "Oui";

      existing.Date_maj = now;

      writeObjectsToSheet(arbitrageSheet, headers, arbitrages);

      return {
        success: true,

        action: "UPDATED",

        Arbitre_id: existing.Arbitre_id,

        Contact_id: contactId,

        Saison_id: saisonId,

        Niveau: niveau,
      };
    }

    /*
     * =========================
     * CREATION
     * =========================
     *
     * Si le niveau est vide et qu'aucune
     * ligne n'existe, on ne crée rien.
     */

    if (!niveau) {
      return {
        success: true,

        action: "UNCHANGED",

        Arbitre_id: "",

        Contact_id: contactId,

        Saison_id: saisonId,

        Niveau: "",
      };
    }

    const arbitreId = getNextArbitreId(arbitrages);

    const newArbitre = {
      Arbitre_id: arbitreId,

      Saison_id: saisonId,

      Contact_id: contactId,

      Type: "JOUEUR",

      Prenom_externe: "",

      Nom_externe: "",

      Email_externe: "",

      Telephone_externe: "",

      Niveau: niveau,

      Actif: "Oui",

      Commentaire: "",

      Date_maj: now,
    };

    arbitrages.push(newArbitre);

    writeObjectsToSheet(arbitrageSheet, headers, arbitrages);

    return {
      success: true,

      action: "CREATED",

      Arbitre_id: arbitreId,

      Contact_id: contactId,

      Saison_id: saisonId,

      Niveau: niveau,
    };
  } finally {
    lock.releaseLock();
  }
}

/*
 * ============================================================
 * NEXT ARBITRE ID
 * ============================================================
 */

function getNextArbitreId(arbitrages) {
  let maxNumber = 0;

  arbitrages.forEach((arbitrage) => {
    const arbitreId = String(arbitrage.Arbitre_id || "").trim();

    const match = arbitreId.match(/^ARB-(\d+)$/);

    if (!match) {
      return;
    }

    const number = Number(match[1]);

    if (number > maxNumber) {
      maxNumber = number;
    }
  });

  return "ARB-" + String(maxNumber + 1).padStart(6, "0");
}

/*
 * ============================================================
 * SAVE ARBITRE EXTERNE
 * ============================================================
 *
 * Crée un arbitre qui n'est pas issu
 * des adhésions joueurs.
 *
 * Types autorisés :
 * - CLUB
 * - EXTERIEUR
 */

function saveArbitreExterne(data) {
  requireRole("ADMIN", "BUREAU");

  /*
   * =========================
   * DONNEES
   * =========================
   */

  data = data || {};

  const saisonId = String(data.Saison_id || "").trim();

  const type = String(data.Type || "")
    .trim()
    .toUpperCase();

  const prenom = String(data.Prenom || "").trim();

  const nom = String(data.Nom || "").trim();

  const email = String(data.Email || "").trim();

  const telephone = String(data.Telephone || "").trim();

  const niveau = String(data.Niveau || "")
    .trim()
    .toUpperCase();

  const commentaire = String(data.Commentaire || "").trim();

  /*
   * =========================
   * VALIDATION
   * =========================
   */

  if (!saisonId) {
    throw new Error("La saison est obligatoire.");
  }

  if (type !== "CLUB" && type !== "EXTERIEUR") {
    throw new Error("Le type doit être CLUB ou EXTERIEUR.");
  }

  if (!prenom) {
    throw new Error("Le prénom est obligatoire.");
  }

  if (!nom) {
    throw new Error("Le nom est obligatoire.");
  }

  if (niveau && !ARBITRAGE_NIVEAUX.includes(niveau)) {
    throw new Error("Niveau d'arbitrage invalide : " + niveau);
  }

  /*
   * =========================
   * FEUILLE ARBITRAGE
   * =========================
   */

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const arbitrageSheet = sportSpreadsheet.getSheetByName("Arbitrage");

  if (!arbitrageSheet) {
    throw new Error("Feuille Arbitrage introuvable.");
  }

  /*
   * =========================
   * VERROU
   * =========================
   */

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    /*
     * On relit les données APRES
     * acquisition du verrou.
     *
     * Cela évite notamment que deux
     * créations simultanées génèrent
     * le même Arbitre_id.
     */

    const arbitrageData = readSheetAsObjects(arbitrageSheet);

    const headers = arbitrageData.headers;

    const arbitrages = arbitrageData.rows;

    /*
     * =========================
     * VERIFICATION COLONNES
     * =========================
     */

    const requiredHeaders = [
      "Arbitre_id",
      "Saison_id",
      "Contact_id",
      "Type",
      "Prenom_externe",
      "Nom_externe",
      "Email_externe",
      "Telephone_externe",
      "Niveau",
      "Actif",
      "Commentaire",
      "Date_maj",
    ];

    requiredHeaders.forEach((header) => {
      if (!headers.includes(header)) {
        throw new Error("Colonne manquante dans Arbitrage : " + header);
      }
    });

    /*
     * =========================
     * CONTROLE DOUBLON
     * =========================
     *
     * On bloque uniquement un doublon
     * évident dans la même saison :
     * même prénom + même nom + même type.
     */

    const normalizedPrenom = normalizeArbitrageIdentity(prenom);

    const normalizedNom = normalizeArbitrageIdentity(nom);

    const duplicate = arbitrages.find((arbitrage) => {
      return (
        String(arbitrage.Saison_id || "").trim() === saisonId &&
        String(arbitrage.Type || "")
          .trim()
          .toUpperCase() === type &&
        normalizeArbitrageIdentity(arbitrage.Prenom_externe) ===
          normalizedPrenom &&
        normalizeArbitrageIdentity(arbitrage.Nom_externe) === normalizedNom
      );
    });

    if (duplicate) {
      throw new Error("Cet arbitre existe déjà pour cette saison.");
    }

    /*
     * =========================
     * CREATION
     * =========================
     */

    const arbitreId = getNextArbitreId(arbitrages);

    const now = new Date();

    const newArbitre = {
      Arbitre_id: arbitreId,

      Saison_id: saisonId,

      Contact_id: "",

      Type: type,

      Prenom_externe: prenom,

      Nom_externe: nom,

      Email_externe: email,

      Telephone_externe: telephone,

      Niveau: niveau,

      Actif: "Oui",

      Commentaire: commentaire,

      Date_maj: now,
    };

    arbitrages.push(newArbitre);

    writeObjectsToSheet(arbitrageSheet, headers, arbitrages);

    /*
     * =========================
     * RESULTAT
     * =========================
     */

    return {
      success: true,

      action: "CREATED",

      Arbitre_id: arbitreId,

      Saison_id: saisonId,

      Type: type,

      Prenom: prenom,

      Nom: nom,

      Email: email,

      Telephone: telephone,

      Niveau: niveau,

      Commentaire: commentaire,
    };
  } finally {
    lock.releaseLock();
  }
}

/*
 * ============================================================
 * NORMALISATION IDENTITE
 * ============================================================
 *
 * Utilisée pour la détection
 * des doublons.
 */

function normalizeArbitrageIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/*
 * ============================================================
 * TEST CREATION ARBITRE EXTERNE
 * ============================================================
 */

function testSaveArbitreExterne() {
  const result = saveArbitreExterne({
    Saison_id: "2026-2027",

    Type: "EXTERIEUR",

    Prenom: "Test",

    Nom: "Arbitre",

    Email: "test.arbitre@example.com",

    Telephone: "0600000000",

    Niveau: "AUTONOME",

    Commentaire: "Création de test",
  });

  console.log(JSON.stringify(result, null, 2));
}

/**
 * Convertit une date Sheets
 * en valeur sérialisable pour
 * google.script.run.
 */
function formatArbitrageDateForClient(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}
/*
 * ============================================================
 * UPDATE ARBITRE EXTERNE
 * ============================================================
 *
 * Modifie la fiche d'un arbitre
 * CLUB ou EXTERIEUR.
 */

function updateArbitreExterne(data) {
  requireRole("ADMIN", "BUREAU");

  data = data || {};

  const arbitreId = String(data.Arbitre_id || "").trim();

  const type = String(data.Type || "")
    .trim()
    .toUpperCase();

  const prenom = String(data.Prenom || "").trim();

  const nom = String(data.Nom || "").trim();

  const email = String(data.Email || "").trim();

  const telephone = String(data.Telephone || "").trim();

  const niveau = String(data.Niveau || "")
    .trim()
    .toUpperCase();

  const commentaire = String(data.Commentaire || "").trim();

  /*
   * =========================
   * VALIDATION
   * =========================
   */

  if (!arbitreId) {
    throw new Error("L'Arbitre_id est obligatoire.");
  }

  if (type !== "CLUB" && type !== "EXTERIEUR") {
    throw new Error("Le type doit être CLUB ou EXTERIEUR.");
  }

  if (!prenom) {
    throw new Error("Le prénom est obligatoire.");
  }

  if (!nom) {
    throw new Error("Le nom est obligatoire.");
  }

  if (niveau && !ARBITRAGE_NIVEAUX.includes(niveau)) {
    throw new Error("Niveau d'arbitrage invalide : " + niveau);
  }

  /*
   * =========================
   * FEUILLE
   * =========================
   */

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const arbitrageSheet = sportSpreadsheet.getSheetByName("Arbitrage");

  if (!arbitrageSheet) {
    throw new Error("Feuille Arbitrage introuvable.");
  }

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    const arbitrageData = readSheetAsObjects(arbitrageSheet);

    const headers = arbitrageData.headers;

    const arbitrages = arbitrageData.rows;

    const matches = arbitrages.filter(
      (row) => String(row.Arbitre_id || "").trim() === arbitreId,
    );

    if (matches.length === 0) {
      throw new Error("Arbitre introuvable : " + arbitreId);
    }

    if (matches.length > 1) {
      throw new Error(
        "Plusieurs lignes utilisent l'identifiant " + arbitreId + ".",
      );
    }

    const arbitre = matches[0];

    /*
     * On interdit cette fonction
     * pour un joueur.
     */

    if (String(arbitre.Contact_id || "").trim()) {
      throw new Error(
        "La fiche d'un joueur ne peut pas être modifiée depuis le module Arbitrage.",
      );
    }

    /*
     * Contrôle doublon en excluant
     * la ligne en cours.
     */

    const normalizedPrenom = normalizeArbitrageIdentity(prenom);

    const normalizedNom = normalizeArbitrageIdentity(nom);

    const duplicate = arbitrages.find(
      (row) =>
        String(row.Arbitre_id || "").trim() !== arbitreId &&
        String(row.Saison_id || "").trim() ===
          String(arbitre.Saison_id || "").trim() &&
        String(row.Type || "")
          .trim()
          .toUpperCase() === type &&
        normalizeArbitrageIdentity(row.Prenom_externe) === normalizedPrenom &&
        normalizeArbitrageIdentity(row.Nom_externe) === normalizedNom,
    );

    if (duplicate) {
      throw new Error("Un arbitre avec ce nom existe déjà pour cette saison.");
    }

    /*
     * =========================
     * MISE A JOUR
     * =========================
     */

    arbitre.Type = type;

    arbitre.Prenom_externe = prenom;

    arbitre.Nom_externe = nom;

    arbitre.Email_externe = email;

    arbitre.Telephone_externe = telephone;

    arbitre.Niveau = niveau;

    arbitre.Commentaire = commentaire;

    arbitre.Actif = "Oui";

    arbitre.Date_maj = new Date();

    writeObjectsToSheet(arbitrageSheet, headers, arbitrages);

    return {
      success: true,

      action: "UPDATED",

      Arbitre_id: arbitreId,
    };
  } finally {
    lock.releaseLock();
  }
}

/*
 * ============================================================
 * DELETE ARBITRE EXTERNE
 * ============================================================
 *
 * Supprime un arbitre CLUB ou EXTERIEUR.
 *
 * Les joueurs ne peuvent jamais être
 * supprimés depuis le module Arbitrage.
 */

function deleteArbitreExterne(arbitreId) {
  requireRole("ADMIN", "BUREAU");

  arbitreId = String(arbitreId || "").trim();

  if (!arbitreId) {
    throw new Error("L'Arbitre_id est obligatoire.");
  }

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const arbitrageSheet = sportSpreadsheet.getSheetByName("Arbitrage");

  if (!arbitrageSheet) {
    throw new Error("Feuille Arbitrage introuvable.");
  }

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    const arbitrageData = readSheetAsObjects(arbitrageSheet);

    const headers = arbitrageData.headers;

    const arbitrages = arbitrageData.rows;

    const index = arbitrages.findIndex(
      (row) => String(row.Arbitre_id || "").trim() === arbitreId,
    );

    if (index === -1) {
      throw new Error("Arbitre introuvable : " + arbitreId);
    }

    const arbitre = arbitrages[index];

    /*
     * Protection des joueurs.
     */

    if (String(arbitre.Contact_id || "").trim()) {
      throw new Error(
        "Un joueur ne peut pas être supprimé depuis le module Arbitrage.",
      );
    }

    const type = String(arbitre.Type || "")
      .trim()
      .toUpperCase();

    if (type !== "CLUB" && type !== "EXTERIEUR") {
      throw new Error(
        "Seuls les arbitres CLUB ou EXTERIEUR peuvent être supprimés.",
      );
    }

    /*
     * Suppression de l'objet
     * puis réécriture de la feuille.
     */

    arbitrages.splice(index, 1);

    writeObjectsToSheet(arbitrageSheet, headers, arbitrages);

    return {
      success: true,

      action: "DELETED",

      Arbitre_id: arbitreId,
    };
  } finally {
    lock.releaseLock();
  }
}
