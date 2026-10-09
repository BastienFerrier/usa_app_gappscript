/**
 * =========================
 * ADHESIONS - ASSOCONNECT
 * =========================
 */

/**
 * Retourne le dossier d'import
 * AssoConnect d'une saison.
 */
function getAssoConnectImportFolder(saisonId) {
  const folderId = IMPORT_FOLDERS.ASSOCONNECT[saisonId];

  if (!folderId) {
    throw new Error(
      "Aucun dossier AssoConnect configuré pour la saison " + saisonId,
    );
  }

  return DriveApp.getFolderById(folderId);
}

/**
 * Retourne les fichiers présents
 * dans le dossier d'import AssoConnect.
 */
function getAssoConnectImportFiles(saisonId) {
  requireRole("ADMIN", "BUREAU");

  const folder = getAssoConnectImportFolder(saisonId);

  const files = folder.getFiles();

  const result = [];

  while (files.hasNext()) {
    const file = files.next();

    result.push({
      id: file.getId(),

      name: file.getName(),

      mimeType: file.getMimeType(),

      dateUpdated: file.getLastUpdated().toISOString(),
    });
  }

  return result;
}

/**
 * Lit un fichier XLSX en le convertissant
 * temporairement en Google Sheets.
 */
function readXlsxFile(fileId) {
  const sourceFile = DriveApp.getFileById(fileId);

  const sourceName = sourceFile.getName();

  const blob = sourceFile.getBlob();

  const convertedFile = Drive.Files.create(
    {
      name: "TEMP_" + sourceName,

      mimeType: MimeType.GOOGLE_SHEETS,
    },

    blob,

    {
      fields: "id,name",
    },
  );

  const convertedFileId = convertedFile.id;

  try {
    Utilities.sleep(500);

    const spreadsheet = SpreadsheetApp.openById(convertedFileId);

    const sheets = spreadsheet.getSheets();

    if (sheets.length === 0) {
      return [];
    }

    return sheets[0].getDataRange().getValues();
  } finally {
    try {
      DriveApp.getFileById(convertedFileId).setTrashed(true);
    } catch (error) {
      console.warn(
        "Impossible de supprimer le fichier temporaire " +
          convertedFileId +
          " : " +
          error.message,
      );
    }
  }
}

/**
 * Analyse les exports AssoConnect
 * disponibles pour une saison.
 *
 * VALIDE est détecté automatiquement.
 * Les autres exports restent A_DEFINIR.
 */
function getAssoConnectExports(saisonId) {
  requireRole("ADMIN", "BUREAU");

  console.log("Analyse AssoConnect - saison " + saisonId);

  let files;

  try {
    files = getAssoConnectImportFiles(saisonId);
  } catch (error) {
    throw new Error(
      "Impossible d'accéder au dossier AssoConnect : " + error.message,
    );
  }

  console.log(files.length + " fichier(s) trouvé(s)");

  const result = [];

  files.forEach((file) => {
    console.log("Lecture : " + file.name);

    let data;

    try {
      data = readXlsxFile(file.id);
    } catch (error) {
      console.error("Erreur lecture " + file.name + " : " + error.message);

      throw new Error(
        "Impossible de lire " + file.name + " : " + error.message,
      );
    }

    if (data.length === 0) {
      result.push({
        id: file.id,

        name: file.name,

        type: "VIDE",

        lignes: 0,

        colonnes: 0,
      });

      return;
    }

    const headers = data[0].map((header) => String(header).trim());

    const rows = data
      .slice(1)
      .filter((row) => row.some((value) => value !== "" && value !== null));

    const hasParticipantId = headers.includes("ID participant");

    const type = hasParticipantId ? "VALIDE" : "A_DEFINIR";

    result.push({
      id: file.id,

      name: file.name,

      type: type,

      lignes: rows.length,

      colonnes: headers.length,
    });

    console.log(file.name + " -> " + type + " | " + rows.length + " ligne(s)");
  });

  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
}

/**
 * =========================
 * PREPARATION IMPORT
 * =========================
 */

/**
 * Prépare les exports AssoConnect.
 */
function prepareAssoConnectImport(saisonId, files) {
  requireRole("ADMIN", "BUREAU");

  if (!saisonId) {
    throw new Error("Saison manquante.");
  }

  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new Error("Aucun fichier à importer.");
  }

  const allowedTypes = ["VALIDE", "ATTENTE_PAIEMENT", "ATTENTE_VALIDATION"];

  const result = {
    saisonId: saisonId,

    fichiers: [],

    totalLignes: 0,

    lignes: [],

    apercu: [],
  };

  files.forEach((fileConfig) => {
    const fileId = fileConfig.id;

    const type = fileConfig.type
      ? fileConfig.type.toString().trim().toUpperCase()
      : "";

    if (!fileId) {
      throw new Error("Identifiant de fichier manquant.");
    }

    if (!allowedTypes.includes(type)) {
      throw new Error("Type d'export invalide : " + type);
    }

    const sourceFile = DriveApp.getFileById(fileId);

    const fileName = sourceFile.getName();

    const data = readXlsxFile(fileId);

    if (!data || data.length === 0) {
      result.fichiers.push({
        id: fileId,

        name: fileName,

        type: type,

        lignes: 0,
      });

      return;
    }

    const headers = data[0].map((header) => String(header).trim());

    const rows = data
      .slice(1)
      .filter((row) => row.some((value) => value !== "" && value !== null));

    const hasParticipantId = headers.includes("ID participant");

    if (hasParticipantId && type !== "VALIDE") {
      throw new Error(
        fileName + " est un export validé mais a été déclaré " + type + ".",
      );
    }

    if (!hasParticipantId && type === "VALIDE") {
      throw new Error(fileName + " ne semble pas être un export validé.");
    }

    const normalizedRows = rows.map((row) =>
      normalizeAssoConnectRow(saisonId, type, fileName, headers, row),
    );

    result.fichiers.push({
      id: fileId,

      name: fileName,

      type: type,

      lignes: normalizedRows.length,
    });

    result.totalLignes += normalizedRows.length;

    result.lignes.push(...normalizedRows);

    normalizedRows.slice(0, 3).forEach((row) => {
      result.apercu.push(row);
    });
  });

  return result;
}

/**
 * Transforme une ligne AssoConnect
 * dans notre format Import_Assoconnect.
 *
 * Aucune donnée médicale n'est importée.
 */
function normalizeAssoConnectRow(
  saisonId,
  sourceStatut,
  sourceFichier,
  headers,
  row,
) {
  const source = {};

  headers.forEach((header, index) => {
    source[normalizeAssoConnectHeader(header)] = row[index];
  });

  const get = (...possibleHeaders) =>
    getAssoConnectValue(source, possibleHeaders);

  /*
   * =========================
   * IDENTIFIANTS
   * =========================
   */

  const assoconnectId = get("ID participant", "Identifiant");

  const numeroBillet = get("Numéro billet", "Nº de billet", "N° de billet");

  const numeroTransaction = get(
    "N° de transaction",
    "Nº de transaction",
    "Numéro de transaction",
  );

  /*
   * =========================
   * IDENTITE
   * =========================
   */

  const prenom = get("Prénom participant", "Prénom");

  const nom = get("Nom participant", "Nom");

  /*
   * =========================
   * PRESTATIONS
   * =========================
   */

  const prestations = String(get("Prestations") || "").trim();

  const prestationsNormalized = normalizeAssoConnectHeader(prestations);

  /*
   * =========================
   * ATOUT SPORT
   * =========================
   */

  const atoutSportDemande = prestationsNormalized.includes("atoutsport");

  /*
   * =========================
   * PASS'SPORT
   * =========================
   */

  const passSportDemande =
    prestationsNormalized.includes("pass'sport") ||
    prestationsNormalized.includes("pass sport") ||
    prestationsNormalized.includes("passsport");

  /*
   * =========================
   * HORS AUSSONNE
   * =========================
   */

  const horsAussonne =
    prestationsNormalized.includes("n'habite pas aussonne") ||
    prestationsNormalized.includes("n habite pas aussonne");

  /*
   * =========================
   * BENEVOLE
   * =========================
   */

  const benevole = prestationsNormalized.includes("joueuse/joueur benevole");

  /*
   * =========================
   * DON
   * =========================
   *
   * Exemple :
   * Don de 20,00 €
   *
   * Valeur enregistrée :
   * 20,00
   */

  let don = "";

  const donMatch = prestations.match(
    /don\s+de\s+([0-9]+(?:[.,][0-9]+)?)\s*(?:€|eur)/i,
  );

  if (donMatch && donMatch[1]) {
    don = donMatch[1].trim();
  }

  /*
   * =========================
   * SURMAILLOT
   * =========================
   *
   * La commande est identifiée par
   * l'intitulé précis de la prestation.
   */

  const surmaillotCommande = prestationsNormalized.includes(
    "possibilite de commander un surmaillot",
  );

  let surmaillotDetails = "";

  if (surmaillotCommande) {
    /*
     * Recherche du début exact du champ
     * quantité / taille.
     *
     * La valeur est ensuite arrêtée avant
     * le début d'une autre prestation connue.
     */
    const surmaillotMatch = prestations.match(
      /indiquez\s+la\s+quantit[eé]\s+et\s+la\/les\s+taille\(s\)\s+du\/es\s+surmaillot\(s\)\s+command[eé]\(s\)\s*:\s*(.*?)(?=\s*(?:joueuse\/joueur\s+b[eé]n[eé]vole|don\s+de|je\s+b[eé]n[eé]ficie\s+de|le\/la\s+licenci[eé]\(e\)\s+n['’]habite\s+pas\s+aussonne|u(?:7|9|11|13|15|18)\b|senior\b)|$)/i,
    );

    if (surmaillotMatch && surmaillotMatch[1]) {
      surmaillotDetails = surmaillotMatch[1].trim();
    }
  }

  /*
   * =========================
   * CATEGORIE
   * =========================
   */

  const categorie = detectAssoConnectCategorie(source);

  /*
   * =========================
   * RESULTAT NORMALISE
   * =========================
   */

  return {
    Import_id: "",

    Saison_id: saisonId,

    Source_statut: sourceStatut,

    Source_fichier: sourceFichier,

    Date_import: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    ),

    Assoconnect_id: assoconnectId,

    Numero_billet: numeroBillet,

    Numero_transaction: numeroTransaction,

    Date_demande: serializeAssoConnectValue(
      get("Date de la demande", "Date de la commande", "Date de création"),
    ),

    Prenom: prenom,

    Nom: nom,

    Date_naissance: serializeAssoConnectValue(get("Date de naissance")),

    Sexe: get("Sexe"),

    Email: get("Adresse email"),

    Telephone_mobile: get(
      "Téléphone mobile",
      "Telephone mobile",
      "Téléphone portable",
      "Telephone portable",
    ),

    Telephone_fixe: get("Téléphone fixe", "Telephone fixe"),

    Adresse: get("Adresse"),

    Complement: get(
      "Complément d'adresse",
      "Complement d'adresse",
      "Complément",
      "Complement",
    ),

    Code_postal: get("Code postal"),

    Ville: get("Ville"),

    Pays: get("Pays"),

    Categorie: categorie,

    Statut_paiement: get("Paiement"),

    Montant_du: get("Montant dû", "Montant du"),

    Moyen_paiement: get("Moyen de paiement"),

    Mode_paiement_souhaite: detectAssoConnectOption(source, [
      "mode de paiement souhaité",
      "mode de paiement souhaite",
    ]),

    AtoutSport_demande: atoutSportDemande ? "Oui" : "Non",

    PassSport_demande: passSportDemande ? "Oui" : "Non",

    Mutation: detectAssoConnectBooleanOption(source, ["mutation"]),

    Hors_Aussonne: horsAussonne ? "Oui" : "Non",

    Benevole: benevole ? "Oui" : "Non",

    Don: don,

    Surmaillot_commande: surmaillotCommande ? "Oui" : "Non",

    Surmaillot_details: surmaillotDetails,

    Email_responsable_1: get("Email responsable 1"),

    Telephone_responsable_1: get(
      "Téléphone responsable 1",
      "Telephone responsable 1",
    ),

    Nom_responsable_1: get("Nom responsable 1"),

    Email_responsable_2: get("Email responsable 2"),

    Telephone_responsable_2: get(
      "Téléphone responsable 2",
      "Telephone responsable 2",
    ),

    Nom_responsable_2: get("Nom responsable 2"),

    Droit_image_refuse: detectAssoConnectBooleanOption(source, [
      "droit à l'image",
      "droit image",
    ]),

    Transport_autorise: detectAssoConnectBooleanOption(source, ["transport"]),

    Urgence_autorisee: detectAssoConnectBooleanOption(source, ["urgence"]),

    Sortie_seul_autorisee: detectAssoConnectBooleanOption(source, [
      "sortie seul",
      "quitter seul",
      "seul après l'entraînement",
      "seul apres l'entrainement",
    ]),

    Lien_detail: get("Détails", "Details"),
  };
}

/**
 * Détecte la catégorie sélectionnée
 * dans les colonnes AssoConnect.
 */
function detectAssoConnectCategorie(source) {
  const categories = [
    {
      value: "U7",
      patterns: ["u7 ("],
    },

    {
      value: "U9",
      patterns: ["u9 ("],
    },

    {
      value: "U11F",
      patterns: ["u11 feminin"],
    },

    {
      value: "U11M",
      patterns: ["u11 masculin"],
    },

    {
      value: "U13F",
      patterns: ["u13 feminin"],
    },

    {
      value: "U13M",
      patterns: ["u13 masculin"],
    },

    {
      value: "U15F",
      patterns: ["u15 feminin"],
    },

    {
      value: "U15M",
      patterns: ["u15 masculin"],
    },

    {
      value: "U18F",
      patterns: ["u18 feminin"],
    },

    {
      value: "U18M",
      patterns: ["u18 masculin"],
    },

    {
      value: "SENIORS_F",
      patterns: ["senior feminin"],
    },

    {
      value: "SENIORS_M",
      patterns: ["senior masculin"],
    },
  ];

  const keys = Object.keys(source);

  for (let i = 0; i < categories.length; i++) {
    const categorie = categories[i];

    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];

      const matches = categorie.patterns.some((pattern) =>
        key.includes(pattern),
      );

      if (matches && isAssoConnectSelected(source[key])) {
        return categorie.value;
      }
    }
  }

  return "";
}

/**
 * Recherche une option AssoConnect
 * à partir d'une partie de son intitulé.
 */
function detectAssoConnectOption(source, patterns) {
  const normalizedPatterns = patterns.map((pattern) =>
    normalizeAssoConnectHeader(pattern),
  );

  const keys = Object.keys(source);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    const matches = normalizedPatterns.some((pattern) => key.includes(pattern));

    if (!matches) {
      continue;
    }

    const value = source[key];

    if (value !== "" && value !== null && value !== undefined) {
      return value;
    }
  }

  return "";
}

/**
 * Recherche une option AssoConnect
 * et retourne Oui / Non.
 */
function detectAssoConnectBooleanOption(source, patterns) {
  const value = detectAssoConnectOption(source, patterns);

  return isAssoConnectSelected(value) ? "Oui" : "Non";
}

/**
 * Détermine si une option
 * AssoConnect est sélectionnée.
 */
function isAssoConnectSelected(value) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (value === true) {
    return true;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = normalizeAssoConnectHeader(value);

  const falseValues = ["", "non", "false", "0", "aucun", "aucune"];

  return !falseValues.includes(normalized);
}

/**
 * Normalise un nom de colonne
 * ou un texte AssoConnect.
 */
function normalizeAssoConnectHeader(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "o")
    .replace(/\s+/g, " ");
}

/**
 * Recherche une valeur parmi
 * plusieurs noms de colonnes possibles.
 */
function getAssoConnectValue(source, possibleHeaders) {
  for (let i = 0; i < possibleHeaders.length; i++) {
    const key = normalizeAssoConnectHeader(possibleHeaders[i]);

    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];

      if (value !== "" && value !== null && value !== undefined) {
        return value;
      }
    }
  }

  return "";
}

/**
 * Rend une valeur compatible
 * avec un retour Web App / Sheet.
 */
function serializeAssoConnectValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
  }

  if (value === null || value === undefined) {
    return "";
  }

  return value;
}

/**
 * =========================
 * ECRITURE IMPORT ASSOCONNECT
 * =========================
 */

/**
 * Importe réellement les exports
 * dans Import_Assoconnect.
 *
 * Les anciennes données de la saison
 * sont remplacées.
 */
function importAssoConnect(saisonId, files) {
  requireRole("ADMIN", "BUREAU");

  const prepared = prepareAssoConnectImport(saisonId, files);

  if (prepared.totalLignes === 0) {
    throw new Error("Aucune ligne AssoConnect à importer.");
  }

  const normalizedRows = prepared.lignes;

  const spreadsheet = getSpreadsheet("ADHESIONS");

  const sheet = spreadsheet.getSheetByName("Import_Assoconnect");

  if (!sheet) {
    throw new Error("Onglet Import_Assoconnect introuvable.");
  }

  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    throw new Error("L'onglet Import_Assoconnect ne contient aucun en-tête.");
  }

  const sheetHeaders = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((header) => String(header).trim());

  ["Import_id", "Saison_id", "Source_statut", "Source_fichier"].forEach(
    (requiredHeader) => {
      if (!sheetHeaders.includes(requiredHeader)) {
        throw new Error(
          "Colonne obligatoire absente de Import_Assoconnect : " +
            requiredHeader,
        );
      }
    },
  );

  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMddHHmmss",
  );

  normalizedRows.forEach((row, index) => {
    row.Import_id =
      "IMP-" + timestamp + "-" + String(index + 1).padStart(6, "0");
  });

  const values = normalizedRows.map((row) =>
    sheetHeaders.map((header) => {
      const value = row[header];

      if (value === null || value === undefined) {
        return "";
      }

      return value;
    }),
  );

  deleteAssoConnectImportSeason(sheet, saisonId, sheetHeaders);

  if (values.length > 0) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, values.length, sheetHeaders.length)
      .setValues(values);
  }

  SpreadsheetApp.flush();

  return {
    success: true,

    saisonId: saisonId,

    fichiers: prepared.fichiers.length,

    lignes: values.length,
  };
}

/**
 * Supprime les anciennes données
 * Import_Assoconnect d'une saison.
 */
function deleteAssoConnectImportSeason(sheet, saisonId, headers) {
  const saisonColumn = headers.indexOf("Saison_id");

  if (saisonColumn === -1) {
    throw new Error("Colonne Saison_id introuvable.");
  }

  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  const remainingRows = values.filter(
    (row) => String(row[saisonColumn]).trim() !== String(saisonId).trim(),
  );

  sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();

  if (remainingRows.length > 0) {
    sheet
      .getRange(2, 1, remainingRows.length, headers.length)
      .setValues(remainingRows);
  }
}

/**
 * =========================
 * SYNCHRONISATION METIER
 * =========================
 */

/**
 * Transforme le cache Import_Assoconnect
 * en Contacts + Adhesions.
 *
 * Cette fonction est idempotente :
 * elle peut être relancée sans créer
 * de doublons.
 *
 * Les champs de suivi manuel des
 * adhésions ne sont jamais écrasés.
 */
function syncAssoConnectToAdhesions(saisonId) {
  requireRole("ADMIN", "BUREAU");

  if (!saisonId) {
    throw new Error("Saison manquante.");
  }

  const spreadsheet = getSpreadsheet("ADHESIONS");

  const importSheet = spreadsheet.getSheetByName("Import_Assoconnect");

  const contactsSheet = spreadsheet.getSheetByName("Contacts");

  const adhesionsSheet = spreadsheet.getSheetByName("Adhesions");

  if (!importSheet) {
    throw new Error("Onglet Import_Assoconnect introuvable.");
  }

  if (!contactsSheet) {
    throw new Error("Onglet Contacts introuvable.");
  }

  if (!adhesionsSheet) {
    throw new Error("Onglet Adhesions introuvable.");
  }

  /*
   * Lecture des trois tables.
   */

  const importData = readSheetAsObjects(importSheet);

  const contactsData = readSheetAsObjects(contactsSheet);

  const adhesionsData = readSheetAsObjects(adhesionsSheet);

  /*
   * On ne travaille que sur
   * la saison demandée.
   */

  const seasonImports = importData.rows.filter(
    (row) => String(row.Saison_id).trim() === String(saisonId).trim(),
  );

  if (seasonImports.length === 0) {
    throw new Error(
      "Aucune donnée AssoConnect trouvée pour la saison " + saisonId + ".",
    );
  }

  /*
   * Déduplication des exports.
   *
   * Si une personne existe dans
   * plusieurs exports, on conserve
   * la version ayant le statut
   * le plus avancé.
   */

  const bestImports = selectBestAssoConnectImports(seasonImports);

  /*
   * Indexation des contacts existants.
   */

  const contactsByAssoConnectId = {};

  const contactsByIdentity = {};

  contactsData.rows.forEach((contact) => {
    const assoId = normalizeBusinessKey(contact.Assoconnect_id);

    if (assoId) {
      contactsByAssoConnectId[assoId] = contact;
    }

    const identityKey = buildContactIdentityKey(contact);

    if (identityKey) {
      contactsByIdentity[identityKey] = contact;
    }
  });

  /*
   * Calcul du prochain Contact_id.
   */

  let nextContactNumber = getNextContactNumber(contactsData.rows);

  let contactsCreated = 0;

  let contactsUpdated = 0;

  const resolvedContacts = [];

  /*
   * =========================
   * CONTACTS
   * =========================
   */

  bestImports.forEach((imported) => {
    let contact = null;

    const assoId = normalizeBusinessKey(imported.Assoconnect_id);

    /*
     * Priorité 1 :
     * ID AssoConnect.
     */

    if (assoId && contactsByAssoConnectId[assoId]) {
      contact = contactsByAssoConnectId[assoId];
    }

    /*
     * Priorité 2 :
     * Nom + prénom + naissance.
     */

    if (!contact) {
      const identityKey = buildContactIdentityKey(imported);

      if (identityKey && contactsByIdentity[identityKey]) {
        contact = contactsByIdentity[identityKey];
      }
    }

    /*
     * Nouveau contact.
     */

    if (!contact) {
      contact = {
        Contact_id: "CNT-" + String(nextContactNumber).padStart(6, "0"),
      };

      nextContactNumber++;

      contactsData.rows.push(contact);

      contactsCreated++;
    } else {
      contactsUpdated++;
    }

    /*
     * Mise à jour des données
     * provenant d'AssoConnect.
     */

    updateContactFromAssoConnect(contact, imported);

    /*
     * Reconstruction des index.
     */

    const updatedAssoId = normalizeBusinessKey(contact.Assoconnect_id);

    if (updatedAssoId) {
      contactsByAssoConnectId[updatedAssoId] = contact;
    }

    const updatedIdentityKey = buildContactIdentityKey(contact);

    if (updatedIdentityKey) {
      contactsByIdentity[updatedIdentityKey] = contact;
    }

    resolvedContacts.push({
      imported: imported,

      contact: contact,
    });
  });

  /*
   * Ecriture Contacts.
   */

  writeObjectsToSheet(contactsSheet, contactsData.headers, contactsData.rows);

  /*
   * =========================
   * ADHESIONS
   * =========================
   */

  const adhesionsByKey = {};

  adhesionsData.rows.forEach((adhesion) => {
    const key = buildAdhesionKey(adhesion.Saison_id, adhesion.Contact_id);

    if (key) {
      adhesionsByKey[key] = adhesion;
    }
  });

  let nextAdhesionNumber = getNextAdhesionNumber(adhesionsData.rows);

  let adhesionsCreated = 0;

  let adhesionsUpdated = 0;

  resolvedContacts.forEach((item) => {
    const imported = item.imported;

    const contact = item.contact;

    const adhesionKey = buildAdhesionKey(saisonId, contact.Contact_id);

    let adhesion = adhesionsByKey[adhesionKey];

    if (!adhesion) {
      adhesion = {
        Adhesion_id: "ADH-" + String(nextAdhesionNumber).padStart(6, "0"),

        Saison_id: saisonId,

        Contact_id: contact.Contact_id,
      };

      nextAdhesionNumber++;

      initializeManualAdhesionFields(adhesion);

      adhesionsData.rows.push(adhesion);

      adhesionsByKey[adhesionKey] = adhesion;

      adhesionsCreated++;
    } else {
      adhesionsUpdated++;
    }

    /*
     * Important :
     *
     * cette fonction ne modifie
     * QUE les champs provenant
     * d'AssoConnect.
     */

    updateAdhesionFromAssoConnect(adhesion, imported);
  });

  /*
   * Ecriture Adhesions.
   */

  writeObjectsToSheet(
    adhesionsSheet,
    adhesionsData.headers,
    adhesionsData.rows,
  );

  SpreadsheetApp.flush();

  return {
    success: true,

    saisonId: saisonId,

    imports: seasonImports.length,

    personnes: bestImports.length,

    contactsCreated: contactsCreated,

    contactsUpdated: contactsUpdated,

    adhesionsCreated: adhesionsCreated,

    adhesionsUpdated: adhesionsUpdated,
  };
}

/**
 * Lit un onglet sous forme :
 *
 * {
 *   headers: [...],
 *   rows: [
 *     { Colonne: valeur }
 *   ]
 * }
 */
function readSheetAsObjects(sheet) {
  const lastRow = sheet.getLastRow();

  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    throw new Error(
      "L'onglet " + sheet.getName() + " ne contient aucun en-tête.",
    );
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((value) => String(value).trim());

  if (lastRow <= 1) {
    return {
      headers: headers,

      rows: [],
    };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  const rows = values
    .filter((row) => row.some((value) => value !== "" && value !== null))
    .map((row) => {
      const object = {};

      headers.forEach((header, index) => {
        object[header] = row[index];
      });

      return object;
    });

  return {
    headers: headers,

    rows: rows,
  };
}

/**
 * Ecrit une liste d'objets
 * dans un onglet.
 *
 * Les headers ne sont pas modifiés.
 */
function writeObjectsToSheet(sheet, headers, rows) {
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  if (rows.length === 0) {
    return;
  }

  const values = rows.map((row) =>
    headers.map((header) => {
      const value = row[header];

      if (value === null || value === undefined) {
        return "";
      }

      return value;
    }),
  );

  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

/**
 * Ne conserve que la meilleure
 * version AssoConnect d'une personne.
 */
function selectBestAssoConnectImports(rows) {
  const priorities = {
    ATTENTE_VALIDATION: 1,

    ATTENTE_PAIEMENT: 2,

    VALIDE: 3,
  };

  const selected = {};

  rows.forEach((row) => {
    const key = buildAssoConnectPersonKey(row);

    if (!key) {
      return;
    }

    const current = selected[key];

    if (!current) {
      selected[key] = row;

      return;
    }

    const currentPriority =
      priorities[String(current.Source_statut).trim()] || 0;

    const newPriority = priorities[String(row.Source_statut).trim()] || 0;

    if (newPriority > currentPriority) {
      selected[key] = row;
    }
  });

  return Object.values(selected);
}

/**
 * Construit la clé permettant
 * d'identifier une personne dans
 * les différents exports AssoConnect.
 */
function buildAssoConnectPersonKey(row) {
  /*
   * L'ID AssoConnect n'existe pas
   * forcément dans les exports
   * non encore validés.
   *
   * On privilégie donc l'identité
   * pour rapprocher les 3 exports.
   */

  const identityKey = buildContactIdentityKey(row);

  if (identityKey) {
    return "IDENTITY:" + identityKey;
  }

  const assoId = normalizeBusinessKey(row.Assoconnect_id);

  if (assoId) {
    return "ASSO:" + assoId;
  }

  /*
   * Dernier recours :
   * billet.
   */

  const billet = normalizeBusinessKey(row.Numero_billet);

  if (billet) {
    return "BILLET:" + billet;
  }

  return "";
}

/**
 * Clé d'identité :
 * Nom + prénom + date de naissance.
 */
function buildContactIdentityKey(row) {
  const nom = normalizeBusinessKey(row.Nom);

  const prenom = normalizeBusinessKey(row.Prenom);

  const naissance = normalizeDateBusinessKey(row.Date_naissance);

  if (!nom || !prenom || !naissance) {
    return "";
  }

  return [nom, prenom, naissance].join("|");
}

/**
 * Normalisation utilisée pour
 * les clés de rapprochement.
 */
function normalizeBusinessKey(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Normalise une date pour
 * le rapprochement des contacts.
 */
function normalizeDateBusinessKey(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return "";
    }

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
  }

  /*
   * Selon la source et le format de la cellule,
   * Apps Script peut recevoir une date sous forme
   * de texte ou de numéro Excel. Les exports FBI
   * utilisent notamment parfois dd/MM/yyyy alors
   * que les dates Contacts sont au format ISO.
   */
  if (typeof value === "number" && isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);

    if (!isNaN(date.getTime())) {
      return Utilities.formatDate(date, "UTC", "yyyy-MM-dd");
    }
  }

  const text = String(value).trim();

  if (!text) {
    return "";
  }

  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  if (match) {
    return [match[1], match[2], match[3]]
      .map((part, index) =>
        index === 0 ? part : String(part).padStart(2, "0"),
      )
      .join("-");
  }

  match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);

  if (match) {
    return [match[3], match[2], match[1]]
      .map((part) => String(part).padStart(2, "0"))
      .join("-");
  }

  const parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(
      parsed,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
  }

  return "";
}

/**
 * Met à jour uniquement les champs
 * Contact provenant d'AssoConnect.
 */
function updateContactFromAssoConnect(contact, imported) {
  const fields = {
    Assoconnect_id: imported.Assoconnect_id,

    Prenom: imported.Prenom,

    Nom: imported.Nom,

    Date_naissance: imported.Date_naissance,

    Sexe: imported.Sexe,

    Email: imported.Email,

    Telephone_mobile: imported.Telephone_mobile,

    Telephone_fixe: imported.Telephone_fixe,

    Adresse: imported.Adresse,

    Complement: imported.Complement,

    Code_postal: imported.Code_postal,

    Ville: imported.Ville,

    Pays: imported.Pays,

    Actif: "Oui",
  };

  Object.keys(fields).forEach((field) => {
    const value = fields[field];

    /*
     * Une valeur vide provenant
     * d'AssoConnect n'efface pas
     * une information existante.
     */
    if (value !== "" && value !== null && value !== undefined) {
      contact[field] = value;
    }
  });
}

/**
 * Initialise les champs gérés
 * manuellement par le club.
 *
 * Cette fonction n'est appelée
 * QUE lors de la création.
 */
function initializeManualAdhesionFields(adhesion) {
  adhesion.Paiement_hors_ligne_recu = "Non";

  adhesion.AtoutSport_recu = "Non";

  adhesion.PassSport_recu = "Non";

  adhesion.Cautions_arbitrage_recues = 0;

  adhesion.SportEasy_ok = "Non";

  adhesion.SportEasy_equipe = "";

  adhesion.Licence_statut = "";

  adhesion.Commentaire = "";
}

/**
 * Met à jour uniquement les données
 * provenant d'AssoConnect.
 *
 * Aucun champ de suivi manuel
 * n'est modifié ici.
 */
function updateAdhesionFromAssoConnect(adhesion, imported) {
  adhesion.Assoconnect_billet = imported.Numero_billet || "";

  adhesion.Assoconnect_transaction = imported.Numero_transaction || "";

  adhesion.Statut_assoconnect = imported.Source_statut || "";

  adhesion.Categorie = imported.Categorie || "";

  adhesion.Montant_du = imported.Montant_du || "";

  adhesion.Statut_paiement = imported.Statut_paiement || "";

  adhesion.Moyen_paiement = imported.Moyen_paiement || "";

  adhesion.AtoutSport_demande = imported.AtoutSport_demande || "Non";

  adhesion.PassSport_demande = imported.PassSport_demande || "Non";

  /*
   * Arbitrage requis automatiquement
   * à partir de la catégorie.
   */

  const categoriesArbitrage = [
    "U15F",
    "U15M",
    "U18F",
    "U18M",
    "SENIORS_F",
    "SENIORS_M",
  ];

  adhesion.Caution_arbitrage_requise = categoriesArbitrage.includes(
    String(imported.Categorie).trim(),
  )
    ? "Oui"
    : "Non";

  adhesion.Surmaillot_requis =
    imported.Surmaillot_commande === "Oui"
      ? "Oui"
      : adhesion.Surmaillot_requis || "Non";

  adhesion.Surmaillot_commande = imported.Surmaillot_commande || "Non";

  adhesion.Date_maj = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm:ss",
  );
}

/**
 * Retourne le prochain numéro
 * de Contact_id.
 */
function getNextContactNumber(contacts) {
  let max = 0;

  contacts.forEach((contact) => {
    const match = String(contact.Contact_id || "").match(/^CNT-(\d+)$/);

    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  });

  return max + 1;
}

/**
 * Retourne le prochain numéro
 * d'Adhesion_id.
 */
function getNextAdhesionNumber(adhesions) {
  let max = 0;

  adhesions.forEach((adhesion) => {
    const match = String(adhesion.Adhesion_id || "").match(/^ADH-(\d+)$/);

    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  });

  return max + 1;
}

/**
 * Clé unique d'une adhésion :
 * saison + contact.
 */
function buildAdhesionKey(saisonId, contactId) {
  if (!saisonId || !contactId) {
    return "";
  }

  return String(saisonId).trim() + "|" + String(contactId).trim();
}

/**
 * Test manuel de synchronisation.
 */
function testSyncAssoConnectToAdhesions() {
  const result = syncAssoConnectToAdhesions("2026-2027");

  console.log(JSON.stringify(result, null, 2));
}

/**
 * =========================
 * LECTURE DES ADHESIONS
 * =========================
 */

/**
 * Retourne les adhésions d'une saison
 * avec les informations du contact.
 *
 * Aucune donnée n'est modifiée.
 */
function getAdhesions(saisonId) {
  requireRole("ADMIN", "BUREAU");

  if (!saisonId) {
    throw new Error("Saison manquante.");
  }

  const spreadsheet = getSpreadsheet("ADHESIONS");

  const contactsSheet = spreadsheet.getSheetByName("Contacts");

  const adhesionsSheet = spreadsheet.getSheetByName("Adhesions");

  if (!contactsSheet) {
    throw new Error("Onglet Contacts introuvable.");
  }

  if (!adhesionsSheet) {
    throw new Error("Onglet Adhesions introuvable.");
  }

  const contactsData = readSheetAsObjects(contactsSheet);

  const adhesionsData = readSheetAsObjects(adhesionsSheet);

  /*
   * Index des contacts.
   */
  const contactsById = {};

  contactsData.rows.forEach((contact) => {
    const contactId = String(contact.Contact_id || "").trim();

    if (contactId) {
      contactsById[contactId] = contact;
    }
  });

  /*
   * Sélection de la saison
   * et jointure avec Contacts.
   */
  const result = adhesionsData.rows
    .filter(
      (adhesion) =>
        String(adhesion.Saison_id || "").trim() === String(saisonId).trim(),
    )
    .map((adhesion) => {
      const contactId = String(adhesion.Contact_id || "").trim();

      const contact = contactsById[contactId] || {};

      const suivi = getAdhesionSuivi(adhesion);

      return {
        /*
         * Identifiants
         */

        Adhesion_id: adhesion.Adhesion_id || "",

        Contact_id: contactId,

        Saison_id: adhesion.Saison_id || "",

        /*
         * Identité
         */

        Prenom: contact.Prenom || "",

        Nom: contact.Nom || "",

        Date_naissance: serializeAssoConnectValue(contact.Date_naissance),

        Sexe: contact.Sexe || "",

        Email: contact.Email || "",

        Telephone_mobile: contact.Telephone_mobile || "",

        /*
         * Adhésion
         */

        Categorie: adhesion.Categorie || "",

        Statut_assoconnect: adhesion.Statut_assoconnect || "",

        Montant_du: adhesion.Montant_du || "",

        Statut_paiement: adhesion.Statut_paiement || "",

        Moyen_paiement: adhesion.Moyen_paiement || "",

        Paiement_hors_ligne_recu: adhesion.Paiement_hors_ligne_recu || "Non",

        /*
         * Aides
         */

        AtoutSport_demande: adhesion.AtoutSport_demande || "Non",

        AtoutSport_recu: adhesion.AtoutSport_recu || "Non",

        PassSport_demande: adhesion.PassSport_demande || "Non",

        PassSport_recu: adhesion.PassSport_recu || "Non",

        /*
         * Arbitrage
         */

        Caution_arbitrage_requise: adhesion.Caution_arbitrage_requise || "Non",

        Cautions_arbitrage_recues: normalizeNumber(
          adhesion.Cautions_arbitrage_recues,
        ),

        /*
         * Surmaillot
         */

        Surmaillot_requis: adhesion.Surmaillot_requis || "Non",

        Surmaillot_commande: adhesion.Surmaillot_commande || "Non",

        /*
         * Outils / licence
         */

        SportEasy_ok: adhesion.SportEasy_ok || "Non",

        SportEasy_equipe: adhesion.SportEasy_equipe || "",

        Licence_ffbb: contact.Licence_ffbb || "",

        Licence_statut: adhesion.Licence_statut || "",

        Licence_fonctions: adhesion.Licence_fonctions || "",

        /*
         * Suivi interne
         */

        Commentaire: adhesion.Commentaire || "",

        Date_maj: serializeAssoConnectValue(adhesion.Date_maj),

        /*
         * Champs calculés.
         */

        Suivi_statut: suivi.statut,

        Suivi_progression: suivi.progression,

        Suivi_controles_valides: suivi.controlesValides,

        Suivi_controles_total: suivi.controlesTotal,

        Suivi_controles: suivi.controles,

        Suivi_actions: suivi.actions,

        Suivi_nb_actions: suivi.actions.length,
        Paiement_hors_ligne_recu: adhesion.Paiement_hors_ligne_recu || "Non",

        Moyen_paiement: adhesion.Moyen_paiement || "",

        Moyens_paiement_manuel: adhesion.Moyens_paiement_manuel || "",

        Montant_paiement_manuel_recu:
          adhesion.Montant_paiement_manuel_recu || "",

        AtoutSport_demande: adhesion.AtoutSport_demande || "Non",

        AtoutSport_recu: adhesion.AtoutSport_recu || "",

        PassSport_demande: adhesion.PassSport_demande || "Non",

        PassSport_recu: adhesion.PassSport_recu || "",

        Caution_arbitrage_requise: adhesion.Caution_arbitrage_requise || "Non",

        Caution_arbitrage_statut: adhesion.Caution_arbitrage_statut || "",

        Cautions_arbitrage_recues: adhesion.Cautions_arbitrage_recues || 0,

        SportEasy_ok: adhesion.SportEasy_ok || "Non",

        SportEasy_equipe: adhesion.SportEasy_equipe || "",

        Licence_statut: adhesion.Licence_statut || "",

        Commentaire: adhesion.Commentaire || "",
      };
    });

  /*
   * Tri :
   *
   * 1. catégorie
   * 2. nom
   * 3. prénom
   */

  result.sort((a, b) => {
    const categorieComparison = String(a.Categorie).localeCompare(
      String(b.Categorie),
      "fr",
      {
        numeric: true,
      },
    );

    if (categorieComparison !== 0) {
      return categorieComparison;
    }

    const nomComparison = String(a.Nom).localeCompare(String(b.Nom), "fr");

    if (nomComparison !== 0) {
      return nomComparison;
    }

    return String(a.Prenom).localeCompare(String(b.Prenom), "fr");
  });

  return result;
}

function getAdhesionSuivi(adhesion) {
  const controles = [];

  /*
   * =========================
   * ASSOCONNECT
   * =========================
   */

  const assoconnectOk =
    String(adhesion.Statut_assoconnect || "").trim() === "VALIDE";

  controles.push({
    code: "ASSOCONNECT",
    label: "Inscription AssoConnect",
    statut: assoconnectOk ? "OK" : "KO",
  });

  /*
   * =========================
   * PAIEMENT
   * =========================
   *
   * Logique actuelle conservée :
   *
   * - inscription AssoConnect validée
   *   => paiement considéré reçu
   *
   * - sinon possibilité de valider
   *   manuellement un paiement
   *   hors ligne.
   */

  const paiementOk = assoconnectOk || isYes(adhesion.Paiement_hors_ligne_recu);

  controles.push({
    code: "PAIEMENT",
    label: "Paiement",
    statut: paiementOk ? "OK" : "KO",
  });

  /*
   * =========================
   * ATOUT SPORT
   * =========================
   *
   * OUI = reçu        => OK
   * NA  = non applicable => NA
   * NON = non reçu    => KO
   * vide = à renseigner => KO
   *
   * AtoutSport_demande reste
   * uniquement une information
   * provenant d'AssoConnect.
   */

  const atoutSportStatut = normalizeSuiviTriState(adhesion.AtoutSport_recu);

  controles.push({
    code: "ATOUTSPORT",
    label: "AtoutSport",
    statut:
      atoutSportStatut === "OUI"
        ? "OK"
        : atoutSportStatut === "NA"
          ? "NA"
          : "KO",
  });

  /*
   * =========================
   * PASS'SPORT
   * =========================
   *
   * Même logique qu'AtoutSport.
   */

  const passSportStatut = normalizeSuiviTriState(adhesion.PassSport_recu);

  controles.push({
    code: "PASSSPORT",
    label: "Pass'Sport",
    statut:
      passSportStatut === "OUI" ? "OK" : passSportStatut === "NA" ? "NA" : "KO",
  });

  /*
   * =========================
   * ARBITRAGE
   * =========================
   *
   * OUI = caution reçue => OK
   * NA  = non applicable => NA
   * NON = non reçue => KO
   * vide = à renseigner => KO
   *
   * Caution_arbitrage_requise
   * reste une information métier,
   * mais ne valide plus automatiquement
   * le contrôle.
   */

  const arbitrageStatut = normalizeSuiviTriState(
    adhesion.Caution_arbitrage_statut,
  );

  controles.push({
    code: "ARBITRAGE",
    label: "Caution arbitrage",
    statut:
      arbitrageStatut === "OUI" ? "OK" : arbitrageStatut === "NA" ? "NA" : "KO",
  });

  /*
   * =========================
   * LICENCE FFBB
   * =========================
   *
   * Seule une licence réellement
   * générée est considérée terminée.
   */

  const licenceStatut = String(adhesion.Licence_statut || "")
    .trim()
    .toUpperCase();

  const licenceOk = licenceStatut === "LICENCE_GENEREE";

  controles.push({
    code: "LICENCE",
    label: "Licence FFBB",
    statut: licenceOk ? "OK" : "KO",
  });

  /*
   * =========================
   * PROGRESSION
   * =========================
   *
   * OK et NA sont considérés
   * comme des contrôles terminés.
   *
   * KO signifie qu'une action
   * ou une décision reste nécessaire.
   */

  const controlesValides = controles.filter(
    (controle) => controle.statut === "OK" || controle.statut === "NA",
  ).length;

  const progression =
    controles.length > 0
      ? Math.round((controlesValides / controles.length) * 100)
      : 0;

  const actions = controles
    .filter((controle) => controle.statut === "KO")
    .map((controle) => controle.label);

  return {
    statut: progression === 100 ? "OK" : "A_TRAITER",

    progression: progression,

    controlesValides: controlesValides,

    controlesTotal: controles.length,

    controles: controles,

    actions: actions,
  };
}

function normalizeSuiviTriState(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (normalized === "OUI" || normalized === "NON" || normalized === "NA") {
    return normalized;
  }

  return "";
}

/* =========================
   MODIFICATION ADHESION
   ========================= */

/**
 * Enregistre les informations
 * de suivi manuel d'une adhésion.
 *
 * Seuls les champs explicitement
 * autorisés peuvent être modifiés.
 */
function saveAdhesionFollowUp(adhesionId, data) {
  requireRole("ADMIN", "BUREAU");

  if (!adhesionId) {
    throw new Error("Identifiant d'adhésion manquant.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Données de modification invalides.");
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error("Une autre modification est en cours. Merci de réessayer.");
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

    const sheet = spreadsheet.getSheetByName("Adhesions");

    if (!sheet) {
      throw new Error("L'onglet Adhesions est introuvable.");
    }

    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      throw new Error("Aucune adhésion disponible.");
    }

    const headers = values[0].map((header) => String(header).trim());

    const adhesionIdIndex = headers.indexOf("Adhesion_id");

    if (adhesionIdIndex === -1) {
      throw new Error("La colonne Adhesion_id est introuvable.");
    }

    let rowIndex = -1;

    for (let i = 1; i < values.length; i++) {
      if (
        String(values[i][adhesionIdIndex]).trim() === String(adhesionId).trim()
      ) {
        rowIndex = i;

        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Adhésion introuvable : " + adhesionId);
    }

    /*
     * Champs que l'interface
     * a le droit de modifier.
     */

    const allowedFields = [
      "Paiement_hors_ligne_recu",

      "Moyens_paiement_manuel",

      "Montant_paiement_manuel_recu",

      "AtoutSport_recu",

      "PassSport_recu",

      "Caution_arbitrage_statut",

      "Cautions_arbitrage_recues",

      "SportEasy_ok",

      "SportEasy_equipe",

      "Licence_statut",

      "Commentaire",
    ];

    /*
     * Validation avant toute
     * modification de la feuille.
     */

    const validatedData = validateAdhesionFollowUpData(data);

    const changes = [];

    allowedFields.forEach((field) => {
      /*
       * Un champ absent de data
       * n'est pas modifié.
       */

      if (!Object.prototype.hasOwnProperty.call(validatedData, field)) {
        return;
      }

      const columnIndex = headers.indexOf(field);

      if (columnIndex === -1) {
        throw new Error("La colonne " + field + " est introuvable.");
      }

      const oldValue = values[rowIndex][columnIndex];

      const newValue = validatedData[field];

      if (normalizeHistoryValue(oldValue) === normalizeHistoryValue(newValue)) {
        return;
      }

      changes.push({
        field: field,

        columnIndex: columnIndex,

        oldValue: oldValue,

        newValue: newValue,
      });
    });

    /*
     * Rien n'a changé.
     */

    if (changes.length === 0) {
      return {
        success: true,

        changed: false,

        adhesionId: adhesionId,

        changes: 0,
      };
    }

    /*
     * Écriture des nouvelles
     * valeurs.
     */

    changes.forEach((change) => {
      sheet
        .getRange(rowIndex + 1, change.columnIndex + 1)
        .setValue(change.newValue);
    });

    /*
     * Mise à jour Date_maj.
     */

    const dateMajIndex = headers.indexOf("Date_maj");

    const now = new Date();

    if (dateMajIndex !== -1) {
      sheet.getRange(rowIndex + 1, dateMajIndex + 1).setValue(now);
    }

    /*
     * Historisation.
     */

    writeAdhesionHistory(spreadsheet, adhesionId, changes, now);

    SpreadsheetApp.flush();

    return {
      success: true,

      changed: true,

      adhesionId: adhesionId,

      changes: changes.length,
    };
  } finally {
    lock.releaseLock();
  }
}

/* =========================
   VALIDATION ADHESION
   ========================= */

/**
 * Valide et normalise les
 * informations reçues depuis
 * l'interface.
 */
function validateAdhesionFollowUpData(data) {
  const result = {};

  /*
   * Oui / Non.
   */

  if (Object.prototype.hasOwnProperty.call(data, "Paiement_hors_ligne_recu")) {
    result.Paiement_hors_ligne_recu = validateYesNoValue(
      data.Paiement_hors_ligne_recu,
      "Paiement hors ligne",
    );
  }

  if (Object.prototype.hasOwnProperty.call(data, "SportEasy_ok")) {
    result.SportEasy_ok = validateYesNoValue(data.SportEasy_ok, "SportEasy");
  }

  /*
   * Oui / Non / N/A.
   */

  ["AtoutSport_recu", "PassSport_recu", "Caution_arbitrage_statut"].forEach(
    (field) => {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        result[field] = validateTriStateValue(data[field], field);
      }
    },
  );

  /*
   * Moyens de paiement manuel.
   */

  if (Object.prototype.hasOwnProperty.call(data, "Moyens_paiement_manuel")) {
    result.Moyens_paiement_manuel = validateManualPaymentMethods(
      data.Moyens_paiement_manuel,
    );
  }

  /*
   * Montant reçu manuellement.
   */

  if (
    Object.prototype.hasOwnProperty.call(data, "Montant_paiement_manuel_recu")
  ) {
    result.Montant_paiement_manuel_recu = validateManualPaymentAmount(
      data.Montant_paiement_manuel_recu,
    );
  }

  /*
   * Nombre de cautions reçues.
   */

  if (Object.prototype.hasOwnProperty.call(data, "Cautions_arbitrage_recues")) {
    const cautions = Number(data.Cautions_arbitrage_recues);

    if (!Number.isInteger(cautions) || cautions < 0 || cautions > 2) {
      throw new Error("Le nombre de cautions arbitrage doit être 0, 1 ou 2.");
    }

    result.Cautions_arbitrage_recues = cautions;
  }

  /*
   * Champs texte.
   */

  ["SportEasy_equipe", "Licence_statut", "Commentaire"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      result[field] = String(data[field] || "").trim();
    }
  });

  return result;
}

/**
 * Validation Oui / Non.
 */
function validateYesNoValue(value, label) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (normalized === "OUI") {
    return "Oui";
  }

  if (normalized === "NON") {
    return "Non";
  }

  throw new Error("Valeur invalide pour " + label + ".");
}

/**
 * Validation tri-état.
 *
 * Valeurs stockées :
 * OUI
 * NON
 * NA
 */
function validateTriStateValue(value, label) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (normalized === "") {
    return "";
  }

  if (!["OUI", "NON", "NA"].includes(normalized)) {
    throw new Error(label + " : valeur invalide.");
  }

  return normalized;
}

/**
 * Validation des moyens
 * de paiement hors ligne.
 *
 * Entrée possible :
 * tableau JS ou texte séparé
 * par |.
 */
function validateManualPaymentMethods(value) {
  let methods = [];

  if (Array.isArray(value)) {
    methods = value;
  } else if (value) {
    methods = String(value).split("|");
  }

  const allowed = ["CHEQUE", "ESPECES", "ANCV"];

  methods = methods
    .map((method) => String(method).trim().toUpperCase())
    .filter(Boolean);

  methods = [...new Set(methods)];

  methods.forEach((method) => {
    if (!allowed.includes(method)) {
      throw new Error("Moyen de paiement invalide : " + method);
    }
  });

  return methods.join("|");
}

/**
 * Validation du montant
 * reçu manuellement.
 */
function validateManualPaymentAmount(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return "";
  }

  const normalized = String(value).trim().replace(",", ".");

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Le montant du paiement reçu est invalide.");
  }

  return Math.round(amount * 100) / 100;
}

/* =========================
   HISTORIQUE ADHESION
   ========================= */

/**
 * Enregistre les changements
 * dans l'onglet Historique
 * du fichier Adhésions.
 */
function writeAdhesionHistory(spreadsheet, adhesionId, changes, date) {
  const historySheet = spreadsheet.getSheetByName("Historique");

  if (!historySheet) {
    throw new Error("L'onglet Historique est introuvable.");
  }

  const user = requireAuthorizedUser();

  const email = user.email || getCurrentUserEmail();

  const rows = changes.map((change) => [
    date,

    email,

    "ADHESIONS",

    "ADHESION",

    adhesionId,

    "MODIFICATION",

    change.field,

    serializeHistoryValue(change.oldValue),

    serializeHistoryValue(change.newValue),
  ]);

  if (rows.length === 0) {
    return;
  }

  historySheet
    .getRange(historySheet.getLastRow() + 1, 1, rows.length, 9)
    .setValues(rows);
}

/**
 * Valeur comparable pour
 * déterminer si un champ
 * a réellement changé.
 */
function normalizeHistoryValue(value) {
  if (value instanceof Date) {
    return value.getTime();
  }

  return String(
    value === null || typeof value === "undefined" ? "" : value,
  ).trim();
}

/**
 * Valeur lisible dans
 * l'historique.
 */
function serializeHistoryValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
  }

  if (value === null || typeof value === "undefined") {
    return "";
  }

  return String(value);
}

/* =========================
   TEST MODIFICATION
   ========================= */

/**
 * Test volontairement sans
 * écriture.
 *
 * Vérifie uniquement la
 * validation des données.
 */
function testValidateAdhesionFollowUp() {
  const result = validateAdhesionFollowUpData({
    Paiement_hors_ligne_recu: "Oui",

    Moyens_paiement_manuel: ["CHEQUE", "ANCV"],

    Montant_paiement_manuel_recu: "120,50",

    AtoutSport_recu: "OUI",

    PassSport_recu: "NA",

    Caution_arbitrage_statut: "NON",

    Cautions_arbitrage_recues: 0,

    SportEasy_ok: "Oui",

    SportEasy_equipe: "U15M",

    Licence_statut: "",

    Commentaire: "Test",
  });

  console.log(JSON.stringify(result, null, 2));
}

/**
 * Teste une valeur Oui / Non.
 */
function isYes(value) {
  return normalizeBusinessKey(value) === "oui";
}

/**
 * Convertit proprement une valeur
 * en nombre.
 */
function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const number = Number(String(value).replace(",", "."));

  return Number.isNaN(number) ? 0 : number;
}

/**
 * Test manuel de lecture
 * des adhésions.
 *
 * On ne logue volontairement
 * aucune donnée personnelle.
 */
function testGetAdhesions() {
  const adhesions = getAdhesions("2026-2027");

  const aTraiter = adhesions.filter(
    (adhesion) => adhesion.Suivi_statut === "A_TRAITER",
  );

  const ok = adhesions.filter((adhesion) => adhesion.Suivi_statut === "OK");

  console.log(
    JSON.stringify(
      {
        total: adhesions.length,

        aTraiter: aTraiter.length,

        ok: ok.length,
      },
      null,
      2,
    ),
  );
}

/**
 * =========================
 * DIAGNOSTICS TECHNIQUES
 * =========================
 */

/**
 * Test d'accès au dossier depuis
 * le contexte d'exécution courant.
 */
function debugAssoConnectWebApp() {
  requireRole("ADMIN", "BUREAU");

  const saisonId = "2026-2027";

  const folderId = IMPORT_FOLDERS.ASSOCONNECT[saisonId];

  const user = getCurrentUser();

  let folder;

  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (error) {
    throw new Error("ERREUR ACCES DOSSIER : " + error.message);
  }

  return {
    user: user.email,

    folderId: folderId,

    folderName: folder.getName(),
  };
}

/**
 * Test manuel :
 * liste uniquement les fichiers.
 */
function testAssoConnectImportFiles() {
  const files = getAssoConnectImportFiles("2026-2027");

  console.log(JSON.stringify(files, null, 2));
}

/**
 * Test manuel :
 * analyse uniquement la structure
 * des exports.
 *
 * Aucune donnée adhérent n'est loguée.
 */
function testGetAssoConnectExports() {
  const exports = getAssoConnectExports("2026-2027");

  console.log(JSON.stringify(exports, null, 2));
}

function testSaveAdhesionFollowUp() {
  const adhesions = getAdhesions("2026-2027");

  if (!adhesions || adhesions.length === 0) {
    throw new Error("Aucune adhésion disponible.");
  }

  /*
   * On prend la première adhésion
   * uniquement pour lire son ID.
   *
   * Le commentaire actuel est conservé
   * puis restauré après le test.
   */

  const adhesion = adhesions[0];

  const adhesionId = adhesion.Adhesion_id;

  const oldComment = adhesion.Commentaire || "";

  const testComment = "TEST ECRITURE " + new Date().getTime();

  console.log("Test sur :", adhesionId);

  /*
   * Première écriture.
   */

  const result1 = saveAdhesionFollowUp(adhesionId, {
    Commentaire: testComment,
  });

  console.log("Résultat écriture :", JSON.stringify(result1, null, 2));

  /*
   * Restauration de la valeur
   * initiale.
   */

  const result2 = saveAdhesionFollowUp(adhesionId, {
    Commentaire: oldComment,
  });

  console.log("Résultat restauration :", JSON.stringify(result2, null, 2));

  console.log("Test terminé. Commentaire initial restauré.");
}

/* ============================================================
   FBI / FFBB - IMPORT
   ============================================================ */

/**
 * Retourne les dossiers FBI configurés pour une saison.
 */
function getFbiImportFolders(saisonId) {
  requireRole("ADMIN", "BUREAU");

  const saisonConfig = IMPORT_FOLDERS.FBI && IMPORT_FOLDERS.FBI[saisonId];

  if (!saisonConfig) {
    throw new Error(
      "Aucun dossier FBI configuré pour la saison " + saisonId + ".",
    );
  }

  if (!saisonConfig.PREINSCRIPTION) {
    throw new Error(
      "Dossier FBI PREINSCRIPTION non configuré pour " + saisonId + ".",
    );
  }

  if (!saisonConfig.LICENCIES) {
    throw new Error(
      "Dossier FBI LICENCIES non configuré pour " + saisonId + ".",
    );
  }

  return {
    PREINSCRIPTION: DriveApp.getFolderById(saisonConfig.PREINSCRIPTION),

    LICENCIES: DriveApp.getFolderById(saisonConfig.LICENCIES),
  };
}

/**
 * Liste les fichiers XLSX présents dans les deux dossiers FBI.
 */
function getFbiImportFiles(saisonId) {
  requireRole("ADMIN", "BUREAU");

  const folders = getFbiImportFolders(saisonId);

  const result = [];

  [
    {
      type: "PREINSCRIPTION",
      folder: folders.PREINSCRIPTION,
    },
    {
      type: "LICENCE",
      folder: folders.LICENCIES,
    },
  ].forEach((config) => {
    const files = config.folder.getFiles();

    while (files.hasNext()) {
      const file = files.next();

      const name = file.getName();

      if (!name.toLowerCase().endsWith(".xlsx")) {
        continue;
      }

      result.push({
        id: file.getId(),

        name: name,

        type: config.type,
      });
    }
  });

  return result;
}

/**
 * Importe tous les fichiers FBI d'une saison
 * dans la feuille Import_FBI.
 *
 * La saison est supprimée/reconstruite à chaque import.
 */
function importFbi(saisonId) {
  requireRole("ADMIN", "BUREAU");

  saisonId = String(saisonId || "").trim();

  if (!saisonId) {
    throw new Error("Saison FBI manquante.");
  }

  const files = getFbiImportFiles(saisonId);

  if (files.length === 0) {
    throw new Error("Aucun fichier XLSX FBI trouvé.");
  }

  const spreadsheet = getSpreadsheet("ADHESIONS");

  const sheet = spreadsheet.getSheetByName("Import_FBI");

  if (!sheet) {
    throw new Error("Onglet Import_FBI introuvable.");
  }

  /*
   * =========================
   * HEADERS IMPORT_FBI
   * =========================
   */

  const sheetHeaders = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((header) => String(header).trim());

  const requiredHeaders = [
    "Import_id",
    "Saison_id",
    "Source_type",
    "Source_fichier",
    "Date_import",
    "Fbi_id",
    "Licence_ffbb",
    "Prenom",
    "Nom",
    "Email",
    "Date_naissance",
    "Statut_fbi",
    "Fonctions",
    "Type_preinscription",
  ];

  requiredHeaders.forEach((header) => {
    if (!sheetHeaders.includes(header)) {
      throw new Error("Colonne obligatoire absente de Import_FBI : " + header);
    }
  });

  const importedRows = [];

  /*
   * =========================
   * LECTURE DES FICHIERS
   * =========================
   */

  files.forEach((fileInfo) => {
    const data = readXlsxFile(fileInfo.id);

    if (!data || data.length === 0) {
      return;
    }

    /*
     * Première ligne du XLSX :
     * headers FBI.
     */

    const sourceHeaders = data[0].map((header) => String(header).trim());

    /*
     * Toutes les autres lignes :
     * données FBI.
     */

    const sourceRows = data
      .slice(1)
      .filter((row) => row.some((value) => value !== "" && value !== null));

    /*
     * Validation minimale
     * de la structure du fichier.
     */

    const normalizedHeaders = sourceHeaders.map((header) =>
      normalizeFbiHeader(header),
    );

    if (fileInfo.type === "LICENCE") {
      ["Numéro", "Nom", "Prénom", "Né(e) le", "Fonctions"].forEach(
        (requiredHeader) => {
          if (!normalizedHeaders.includes(normalizeFbiHeader(requiredHeader))) {
            throw new Error(
              fileInfo.name + " : colonne FBI manquante : " + requiredHeader,
            );
          }
        },
      );
    }

    if (fileInfo.type === "PREINSCRIPTION") {
      ["Id", "Nom", "Prénom", "E-mail", "Date de naissance", "Statut"].forEach(
        (requiredHeader) => {
          if (!normalizedHeaders.includes(normalizeFbiHeader(requiredHeader))) {
            throw new Error(
              fileInfo.name + " : colonne FBI manquante : " + requiredHeader,
            );
          }
        },
      );
    }

    /*
     * =========================
     * NORMALISATION
     * =========================
     *
     * On transforme chaque ligne
     * matricielle en objet :
     *
     * {
     *   "Nom": "...",
     *   "Prénom": "...",
     *   ...
     * }
     */

    sourceRows.forEach((sourceRow, index) => {
      const rawRow = {};

      sourceHeaders.forEach((header, columnIndex) => {
        rawRow[header] = sourceRow[columnIndex];
      });

      let normalized;

      if (fileInfo.type === "PREINSCRIPTION") {
        normalized = normalizeFbiPreinscriptionRow(
          rawRow,
          saisonId,
          fileInfo.name,
          index,
        );
      } else if (fileInfo.type === "LICENCE") {
        normalized = normalizeFbiLicenceRow(
          rawRow,
          saisonId,
          fileInfo.name,
          index,
        );
      }

      if (normalized) {
        importedRows.push(normalized);
      }
    });
  });

  /*
   * Sécurité :
   * on ne supprime surtout pas
   * l'ancien import si aucun fichier
   * exploitable n'a été trouvé.
   */

  if (importedRows.length === 0) {
    throw new Error(
      "Les fichiers FBI ont été trouvés mais aucune ligne exploitable n'a été importée.",
    );
  }

  /*
   * =========================
   * IMPORT_ID
   * =========================
   */

  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMddHHmmss",
  );

  importedRows.forEach((row, index) => {
    row.Import_id =
      "FBI-" + timestamp + "-" + String(index + 1).padStart(6, "0");
  });

  /*
   * =========================
   * CONSERVATION AUTRES SAISONS
   * =========================
   */

  const existingData = readSheetAsObjects(sheet);

  const keptRows = existingData.rows.filter(
    (row) => String(row.Saison_id || "").trim() !== saisonId,
  );

  /*
   * =========================
   * ECRITURE
   * =========================
   */

  writeObjectsToSheet(sheet, sheetHeaders, keptRows.concat(importedRows));

  SpreadsheetApp.flush();

  return {
    success: true,

    saisonId: saisonId,

    files: files.length,

    rows: importedRows.length,

    preinscriptions: importedRows.filter(
      (row) => row.Source_type === "PREINSCRIPTION",
    ).length,

    licences: importedRows.filter((row) => row.Source_type === "LICENCE")
      .length,
  };
}

/* ============================================================
   FBI - NORMALISATION LICENCIES
   ============================================================ */

/**
 * Normalise une ligne de l'export
 * "Licenciés" FBI.
 */
function normalizeFbiLicenceRow(rawRow, saisonId, sourceFile, index) {
  const nom = getFbiValue(rawRow, "Nom");

  const prenom = getFbiValue(rawRow, "Prénom");

  const licence = getFbiValue(rawRow, "Numéro");

  /*
   * Ignore les lignes complètement vides.
   */
  if (!nom && !prenom && !licence) {
    return null;
  }

  return {
    Import_id: buildFbiImportId(saisonId, "LICENCE", sourceFile, index),

    Saison_id: saisonId,

    Source_type: "LICENCE",

    Source_fichier: sourceFile,

    Date_import: new Date(),

    Fbi_id: getFbiValue(rawRow, "N° national"),

    Licence_ffbb: licence,

    Prenom: prenom,

    Nom: nom,

    /*
     * L'export Licenciés
     * ne contient pas l'email.
     */
    Email: "",

    Date_naissance: serializeAssoConnectValue(getFbiValue(rawRow, "Né(e) le")),

    /*
     * Une présence dans cet export
     * signifie que la licence existe.
     */
    Statut_fbi: "LICENCE_GENEREE",

    Fonctions: getFbiValue(rawRow, "Fonctions"),

    Type_preinscription: "",
  };
}

/* ============================================================
   FBI - NORMALISATION PREINSCRIPTIONS
   ============================================================ */

/**
 * Normalise une ligne de l'export
 * Préinscriptions FBI.
 */
function normalizeFbiPreinscriptionRow(rawRow, saisonId, sourceFile, index) {
  const nom = getFbiValue(rawRow, "Nom");

  const prenom = getFbiValue(rawRow, "Prénom");

  const email = getFbiValue(rawRow, "E-mail");

  if (!nom && !prenom && !email) {
    return null;
  }

  return {
    Import_id: buildFbiImportId(saisonId, "PREINSCRIPTION", sourceFile, index),

    Saison_id: saisonId,

    Source_type: "PREINSCRIPTION",

    Source_fichier: sourceFile,

    Date_import: new Date(),

    Fbi_id: getFbiValue(rawRow, "Id"),

    /*
     * Le numéro de licence
     * n'est pas présent dans
     * cet export.
     */
    Licence_ffbb: "",

    Prenom: prenom,

    Nom: nom,

    Email: email,

    Date_naissance: serializeAssoConnectValue(
      getFbiValue(rawRow, "Date de naissance"),
    ),

    Statut_fbi: normalizeFbiStatus(getFbiValue(rawRow, "Statut")),

    Fonctions: "",

    Type_preinscription: getFbiValue(rawRow, "Type"),
  };
}

/* ============================================================
   FBI - STATUTS
   ============================================================ */

function normalizeFbiStatus(value) {
  const normalized = normalizeFbiIdentityValue(value);

  if (normalized === "licence generee") {
    return "LICENCE_GENEREE";
  }

  if (normalized === "en attente de validation groupement sportif") {
    return "ATTENTE_VALIDATION_CLUB";
  }

  if (normalized === "en cours de saisie") {
    return "EN_COURS_SAISIE";
  }

  if (normalized === "en attente de saisie adherent") {
    return "ATTENTE_SAISIE";
  }

  /*
   * On conserve volontairement
   * une valeur explicite si FBI
   * ajoute un nouveau statut.
   */
  return value ? "INCONNU:" + String(value).trim() : "";
}

/* ============================================================
   FBI - NORMALISATION IDENTITE
   ============================================================ */

/**
 * Normalisation utilisée pour les rapprochements.
 *
 * Exemple :
 *
 * Élodie   -> elodie
 * LE-GOFF  -> le goff
 * D'ANGELO -> dangelo
 */
function normalizeFbiIdentityValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[-‐-‒–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFbiEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Produit une clé Nom + Prénom.
 */
function buildFbiNameKey(nom, prenom) {
  const normalizedNom = normalizeFbiIdentityValue(nom);

  const normalizedPrenom = normalizeFbiIdentityValue(prenom);

  if (!normalizedNom || !normalizedPrenom) {
    return "";
  }

  return normalizedNom + "|" + normalizedPrenom;
}

/**
 * Produit une clé Nom + Prénom + date de naissance.
 */
function buildFbiBirthIdentityKey(nom, prenom, dateNaissance) {
  const nameKey = buildFbiNameKey(nom, prenom);

  const birthKey = normalizeDateBusinessKey(dateNaissance);

  if (!nameKey || !birthKey) {
    return "";
  }

  return nameKey + "|" + birthKey;
}

/**
 * Produit une clé Nom + Prénom + email.
 */
function buildFbiEmailIdentityKey(nom, prenom, email) {
  const nameKey = buildFbiNameKey(nom, prenom);

  const normalizedEmail = normalizeFbiEmail(email);

  if (!nameKey || !normalizedEmail) {
    return "";
  }

  return nameKey + "|" + normalizedEmail;
}

/* ============================================================
   FBI - UTILITAIRES
   ============================================================ */

/**
 * Récupère une valeur dans une ligne XLSX
 * en tolérant les différences d'accents/casse
 * dans les headers.
 */
function getFbiValue(row, expectedHeader) {
  const expected = normalizeFbiHeader(expectedHeader);

  const key = Object.keys(row).find(
    (header) => normalizeFbiHeader(header) === expected,
  );

  if (!key) {
    return "";
  }

  return row[key];
}

function normalizeFbiHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFbiImportId(saisonId, type, sourceFile, index) {
  return ["FBI", saisonId, type, sourceFile, index + 1].join("-");
}

/* ============================================================
   FBI - TEST
   ============================================================ */

function testImportFbi() {
  const result = importFbi("2026-2027");

  console.log(JSON.stringify(result, null, 2));
}

/* ============================================================
   FBI - RAPPROCHEMENT / DIAGNOSTIC
   ============================================================ */

/**
 * Analyse le rapprochement FBI sans modifier Contacts / Adhesions.
 */
function diagnoseFbiSync(saisonId) {
  requireRole("ADMIN", "BUREAU");

  saisonId = String(saisonId || "").trim();

  if (!saisonId) {
    throw new Error("Saison manquante.");
  }

  const ss = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

  const contactsSheet = ss.getSheetByName("Contacts");

  const adhesionsSheet = ss.getSheetByName("Adhesions");

  const fbiSheet = ss.getSheetByName("Import_FBI");

  if (!contactsSheet || !adhesionsSheet || !fbiSheet) {
    throw new Error("Contacts, Adhesions ou Import_FBI introuvable.");
  }

  const contacts = readSheetAsObjects(contactsSheet).rows;

  const adhesions = readSheetAsObjects(adhesionsSheet).rows;

  const fbiRows = readSheetAsObjects(fbiSheet).rows.filter(
    (row) => String(row.Saison_id || "").trim() === saisonId,
  );

  const indexes = buildFbiIndexes(fbiRows);

  const contactsById = new Map();

  contacts.forEach((contact) => {
    const contactId = String(contact.Contact_id || "").trim();

    if (contactId) {
      contactsById.set(contactId, contact);
    }
  });

  const results = [];

  adhesions
    .filter((adhesion) => String(adhesion.Saison_id || "").trim() === saisonId)
    .forEach((adhesion) => {
      const contactId = String(adhesion.Contact_id || "").trim();

      const contact = contactsById.get(contactId);

      if (!contact) {
        results.push({
          Adhesion_id: adhesion.Adhesion_id,

          Contact_id: contactId,

          Nom: "",

          Prenom: "",

          Match: "CONTACT_INTROUVABLE",

          Licence_actuelle: "",

          Licence_trouvee: "",

          Statut: "A_VERIFIER",

          Fonctions: "",
        });

        return;
      }

      const match = findFbiMatchForContact(contact, indexes);

      results.push({
        Adhesion_id: adhesion.Adhesion_id,

        Contact_id: contact.Contact_id,

        Nom: contact.Nom,

        Prenom: contact.Prenom,

        Match: match.matchType,

        Licence_actuelle: contact.Licence_ffbb || "",

        Licence_trouvee: match.licence || "",

        Statut: match.status,

        Fonctions: match.functions || "",
      });
    });

  return results;
}

/* ============================================================
   FBI - INDEXES
   ============================================================ */

function buildFbiIndexes(fbiRows) {
  const indexes = {
    licencesByNumber: new Map(),

    licencesByBirth: new Map(),

    licencesByName: new Map(),

    preinscriptionsByBirth: new Map(),

    preinscriptionsByEmail: new Map(),

    preinscriptionsByName: new Map(),
  };

  fbiRows.forEach((row) => {
    const sourceType = String(row.Source_type || "").trim();

    const licence = String(row.Licence_ffbb || "").trim();

    const nameKey = buildFbiNameKey(row.Nom, row.Prenom);

    const birthKey = buildFbiBirthIdentityKey(
      row.Nom,
      row.Prenom,
      row.Date_naissance,
    );

    const emailKey = buildFbiEmailIdentityKey(row.Nom, row.Prenom, row.Email);

    if (sourceType === "LICENCE") {
      if (licence) {
        addFbiIndexValue(
          indexes.licencesByNumber,
          normalizeFbiLicenceNumber(licence),
          row,
        );
      }

      if (birthKey) {
        addFbiIndexValue(indexes.licencesByBirth, birthKey, row);
      }

      if (nameKey) {
        addFbiIndexValue(indexes.licencesByName, nameKey, row);
      }
    }

    if (sourceType === "PREINSCRIPTION") {
      if (birthKey) {
        addFbiIndexValue(indexes.preinscriptionsByBirth, birthKey, row);
      }

      if (emailKey) {
        addFbiIndexValue(indexes.preinscriptionsByEmail, emailKey, row);
      }

      if (nameKey) {
        addFbiIndexValue(indexes.preinscriptionsByName, nameKey, row);
      }
    }
  });

  return indexes;
}

function addFbiIndexValue(map, key, value) {
  if (!key) {
    return;
  }

  if (!map.has(key)) {
    map.set(key, []);
  }

  map.get(key).push(value);
}

/* ============================================================
   FBI - MATCH CONTACT
   ============================================================ */

function findFbiMatchForContact(contact, indexes) {
  const currentLicence = normalizeFbiLicenceNumber(contact.Licence_ffbb);

  const nameKey = buildFbiNameKey(contact.Nom, contact.Prenom);

  const birthKey = buildFbiBirthIdentityKey(
    contact.Nom,
    contact.Prenom,
    contact.Date_naissance,
  );

  const emailKey = buildFbiEmailIdentityKey(
    contact.Nom,
    contact.Prenom,
    contact.Email,
  );

  /*
   * --------------------------------------------------------
   * 1. Numéro de licence déjà connu
   * --------------------------------------------------------
   */

  if (currentLicence) {
    const licenceRows = indexes.licencesByNumber.get(currentLicence) || [];

    if (licenceRows.length === 1) {
      return buildFbiMatchResult(
        "LICENCE_NUMBER",
        licenceRows,
        indexes,
        contact,
      );
    }

    if (licenceRows.length > 1) {
      return {
        matchType: "LICENCE_DUPLIQUEE",
        licence: currentLicence,
        status: "A_VERIFIER",
        functions: "",
      };
    }
  }

  /*
   * --------------------------------------------------------
   * 2. Nom + prénom + date de naissance
   * --------------------------------------------------------
   */

  if (birthKey) {
    const licenceRows = indexes.licencesByBirth.get(birthKey) || [];

    if (licenceRows.length === 1) {
      return buildFbiMatchResult(
        "IDENTITE_DATE",
        licenceRows,
        indexes,
        contact,
      );
    }

    if (licenceRows.length > 1) {
      return {
        matchType: "IDENTITE_DATE_AMBIGUE",
        licence: "",
        status: "A_VERIFIER",
        functions: "",
      };
    }
  }

  /*
   * --------------------------------------------------------
   * 3. Préinscription : Nom + prénom + email
   * --------------------------------------------------------
   */

  if (emailKey) {
    const preRows = indexes.preinscriptionsByEmail.get(emailKey) || [];

    if (preRows.length === 1) {
      return buildFbiMatchResult("IDENTITE_EMAIL", preRows, indexes, contact);
    }

    if (preRows.length > 1) {
      return {
        matchType: "IDENTITE_EMAIL_AMBIGUE",
        licence: "",
        status: "A_VERIFIER",
        functions: "",
      };
    }
  }

  /*
   * --------------------------------------------------------
   * 4. Préinscription : Nom + prénom + date
   * --------------------------------------------------------
   */

  if (birthKey) {
    const preRows = indexes.preinscriptionsByBirth.get(birthKey) || [];

    if (preRows.length === 1) {
      return buildFbiMatchResult(
        "PREINSCRIPTION_DATE",
        preRows,
        indexes,
        contact,
      );
    }

    if (preRows.length > 1) {
      return {
        matchType: "PREINSCRIPTION_DATE_AMBIGUE",
        licence: "",
        status: "A_VERIFIER",
        functions: "",
      };
    }
  }

  /*
   * --------------------------------------------------------
   * 5. Nom + prénom uniquement
   *
   * On agrège les résultats des deux exports.
   * On ne l'utilise que si l'identité est unique.
   * --------------------------------------------------------
   */

  if (nameKey) {
    const licenceRows = indexes.licencesByName.get(nameKey) || [];

    const preRows = indexes.preinscriptionsByName.get(nameKey) || [];

    /*
     * Si plusieurs personnes distinctes peuvent
     * correspondre, aucune décision automatique.
     */
    if (licenceRows.length > 1 || preRows.length > 1) {
      return {
        matchType: "NOM_PRENOM_AMBIGU",
        licence: "",
        status: "A_VERIFIER",
        functions: "",
      };
    }

    if (licenceRows.length === 1) {
      return buildFbiMatchResult(
        "NOM_PRENOM_UNIQUE",
        licenceRows,
        indexes,
        contact,
      );
    }

    if (preRows.length === 1) {
      return buildFbiMatchResult(
        "NOM_PRENOM_UNIQUE",
        preRows,
        indexes,
        contact,
      );
    }
  }

  /*
   * Rien trouvé dans FBI.
   */
  return {
    matchType: "AUCUN",
    licence: "",
    status: "A_ENVOYER",
    functions: "",
  };
}

/* ============================================================
   FBI - CONSTRUCTION RESULTAT
   ============================================================ */

function buildFbiMatchResult(matchType, matchedRows, indexes, contact) {
  const firstRow = matchedRows[0];

  let licence = String(firstRow.Licence_ffbb || "").trim();

  let functions = "";

  /*
   * Si le premier match vient d'une préinscription,
   * on cherche également la ligne Licenciés correspondante.
   */
  if (String(firstRow.Source_type || "").trim() === "PREINSCRIPTION") {
    const birthKey = buildFbiBirthIdentityKey(
      firstRow.Nom,
      firstRow.Prenom,
      firstRow.Date_naissance,
    );

    const licenceRows = birthKey
      ? indexes.licencesByBirth.get(birthKey) || []
      : [];

    if (licenceRows.length === 1) {
      licence = String(licenceRows[0].Licence_ffbb || "").trim();

      functions = String(licenceRows[0].Fonctions || "").trim();

      return {
        matchType: matchType + "+LICENCE",

        licence: licence,

        status: "LICENCE_GENEREE",

        functions: functions,
      };
    }
  }

  /*
   * Match direct sur le fichier Licenciés.
   */
  if (String(firstRow.Source_type || "").trim() === "LICENCE") {
    functions = String(firstRow.Fonctions || "").trim();

    return {
      matchType: matchType,

      licence: licence,

      status: "LICENCE_GENEREE",

      functions: functions,
    };
  }

  /*
   * Sinon le statut vient de la préinscription.
   */
  return {
    matchType: matchType,

    licence: licence,

    status: String(firstRow.Statut_fbi || "").trim() || "A_VERIFIER",

    functions: functions,
  };
}

/* ============================================================
   FBI - NUMERO LICENCE
   ============================================================ */

function normalizeFbiLicenceNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/* ============================================================
   FBI - TEST DIAGNOSTIC
   ============================================================ */

function testDiagnoseFbiSync() {
  const results = diagnoseFbiSync("2026-2027");

  const summary = {};

  results.forEach((result) => {
    const key = result.Match + " | " + result.Statut;

    summary[key] = (summary[key] || 0) + 1;
  });

  console.log("Nombre d'adhésions : " + results.length);

  console.log(JSON.stringify(summary, null, 2));

  /*
   * On affiche uniquement les cas
   * qui méritent notre attention.
   */
  const anomalies = results.filter(
    (result) => result.Statut === "A_VERIFIER" || result.Match === "AUCUN",
  );

  console.log("Cas à contrôler : " + anomalies.length);

  console.log(JSON.stringify(anomalies, null, 2));
}

function testFbiMatchingKeys() {
  const ss = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

  const contacts = readSheetAsObjects(ss.getSheetByName("Contacts")).rows;

  const fbiRows = readSheetAsObjects(
    ss.getSheetByName("Import_FBI"),
  ).rows.filter((row) => String(row.Saison_id || "").trim() === "2026-2027");

  const contactNameKeys = new Set();

  const contactBirthKeys = new Set();

  const contactEmailKeys = new Set();

  contacts.forEach((contact) => {
    const nameKey = buildFbiNameKey(contact.Nom, contact.Prenom);

    const birthKey = buildFbiBirthIdentityKey(
      contact.Nom,
      contact.Prenom,
      contact.Date_naissance,
    );

    const emailKey = buildFbiEmailIdentityKey(
      contact.Nom,
      contact.Prenom,
      contact.Email,
    );

    if (nameKey) {
      contactNameKeys.add(nameKey);
    }

    if (birthKey) {
      contactBirthKeys.add(birthKey);
    }

    if (emailKey) {
      contactEmailKeys.add(emailKey);
    }
  });

  let fbiNameKeys = 0;
  let fbiBirthKeys = 0;
  let fbiEmailKeys = 0;

  let matchingNames = 0;
  let matchingBirths = 0;
  let matchingEmails = 0;

  fbiRows.forEach((row) => {
    const nameKey = buildFbiNameKey(row.Nom, row.Prenom);

    const birthKey = buildFbiBirthIdentityKey(
      row.Nom,
      row.Prenom,
      row.Date_naissance,
    );

    const emailKey = buildFbiEmailIdentityKey(row.Nom, row.Prenom, row.Email);

    if (nameKey) {
      fbiNameKeys++;

      if (contactNameKeys.has(nameKey)) {
        matchingNames++;
      }
    }

    if (birthKey) {
      fbiBirthKeys++;

      if (contactBirthKeys.has(birthKey)) {
        matchingBirths++;
      }
    }

    if (emailKey) {
      fbiEmailKeys++;

      if (contactEmailKeys.has(emailKey)) {
        matchingEmails++;
      }
    }
  });

  console.log(
    JSON.stringify(
      {
        contacts: contacts.length,
        fbi: fbiRows.length,

        cles_contacts: {
          nom_prenom: contactNameKeys.size,

          nom_prenom_date: contactBirthKeys.size,

          nom_prenom_email: contactEmailKeys.size,
        },

        cles_fbi: {
          nom_prenom: fbiNameKeys,

          nom_prenom_date: fbiBirthKeys,

          nom_prenom_email: fbiEmailKeys,
        },

        correspondances: {
          nom_prenom: matchingNames,

          nom_prenom_date: matchingBirths,

          nom_prenom_email: matchingEmails,
        },
      },
      null,
      2,
    ),
  );
}

function testFbiSeasonValues() {
  const ss = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

  const sheet = ss.getSheetByName("Import_FBI");

  const data = readSheetAsObjects(sheet);

  const seasons = {};
  const types = {};

  data.rows.forEach((row) => {
    const saison = String(row.Saison_id || "").trim();

    const type = String(row.Source_type || "").trim();

    seasons[saison] = (seasons[saison] || 0) + 1;

    types[type] = (types[type] || 0) + 1;
  });

  console.log("Headers = " + JSON.stringify(data.headers));

  console.log("Saisons = " + JSON.stringify(seasons, null, 2));

  console.log("Types = " + JSON.stringify(types, null, 2));
}

/* ============================================================
   FBI - SYNCHRONISATION CONTACTS / ADHESIONS
   ============================================================ */

/**
 * Synchronise les données FBI vers :
 *
 * Contacts.Licence_ffbb
 * Adhesions.Licence_statut
 * Adhesions.Licence_fonctions
 *
 * Règles :
 *
 * - FBI ne crée jamais de Contact.
 * - Seules les adhésions de la saison demandée sont traitées.
 * - Une licence existante n'est jamais remplacée
 *   par une licence différente.
 * - Une personne absente de FBI reçoit A_ENVOYER.
 * - Toute incohérence de numéro de licence reçoit A_VERIFIER.
 */
function syncFbiToAdhesions(saisonId) {
  requireRole("ADMIN", "BUREAU");

  saisonId = String(saisonId || "").trim();

  if (!saisonId) {
    throw new Error("Saison manquante.");
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error(
      "Une autre synchronisation est en cours. Merci de réessayer.",
    );
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

    const contactsSheet = spreadsheet.getSheetByName("Contacts");

    const adhesionsSheet = spreadsheet.getSheetByName("Adhesions");

    const fbiSheet = spreadsheet.getSheetByName("Import_FBI");

    if (!contactsSheet) {
      throw new Error("Onglet Contacts introuvable.");
    }

    if (!adhesionsSheet) {
      throw new Error("Onglet Adhesions introuvable.");
    }

    if (!fbiSheet) {
      throw new Error("Onglet Import_FBI introuvable.");
    }

    /*
     * =========================
     * LECTURE
     * =========================
     */

    const contactsData = readSheetAsObjects(contactsSheet);

    const adhesionsData = readSheetAsObjects(adhesionsSheet);

    const fbiData = readSheetAsObjects(fbiSheet);

    /*
     * Vérification des colonnes
     * nécessaires.
     */

    ["Contact_id", "Licence_ffbb"].forEach((header) => {
      if (!contactsData.headers.includes(header)) {
        throw new Error("Colonne Contacts manquante : " + header);
      }
    });

    [
      "Adhesion_id",
      "Saison_id",
      "Contact_id",
      "Licence_statut",
      "Licence_fonctions",
    ].forEach((header) => {
      if (!adhesionsData.headers.includes(header)) {
        throw new Error("Colonne Adhesions manquante : " + header);
      }
    });

    /*
     * Données FBI de la saison.
     */

    const fbiRows = fbiData.rows.filter(
      (row) => String(row.Saison_id || "").trim() === saisonId,
    );

    if (fbiRows.length === 0) {
      throw new Error(
        "Aucune donnée FBI trouvée pour la saison " + saisonId + ".",
      );
    }

    /*
     * Construction des index FBI.
     */

    const indexes = buildFbiIndexes(fbiRows);

    /*
     * Index Contacts.
     */

    const contactsById = new Map();

    contactsData.rows.forEach((contact) => {
      const contactId = String(contact.Contact_id || "").trim();

      if (contactId) {
        contactsById.set(contactId, contact);
      }
    });

    /*
     * =========================
     * COMPTEURS
     * =========================
     */

    let adhesionsProcessed = 0;

    let contactsLicenceAdded = 0;

    let contactsLicenceUnchanged = 0;

    let licenceConflicts = 0;

    let adhesionsUpdated = 0;

    let adhesionsUnchanged = 0;

    let contactsMissing = 0;

    const statuses = {};

    const historyRows = [];

    const now = new Date();

    const user = requireAuthorizedUser();

    const email = user.email || getCurrentUserEmail();

    /*
     * =========================
     * SYNCHRONISATION
     * =========================
     */

    adhesionsData.rows.forEach((adhesion) => {
      /*
       * On ne traite que
       * la saison demandée.
       */

      if (String(adhesion.Saison_id || "").trim() !== saisonId) {
        return;
      }

      adhesionsProcessed++;

      const contactId = String(adhesion.Contact_id || "").trim();

      const contact = contactsById.get(contactId);

      /*
       * Contact introuvable :
       * on ne tente aucun rapprochement.
       */

      if (!contact) {
        contactsMissing++;

        const oldStatus = String(adhesion.Licence_statut || "").trim();

        if (oldStatus !== "A_VERIFIER") {
          historyRows.push([
            now,
            email,
            "ADHESIONS",
            "ADHESION",
            adhesion.Adhesion_id,
            "SYNCHRONISATION_FBI",
            "Licence_statut",
            serializeHistoryValue(oldStatus),
            "A_VERIFIER",
          ]);

          adhesion.Licence_statut = "A_VERIFIER";

          adhesion.Date_maj = now;

          adhesionsUpdated++;
        } else {
          adhesionsUnchanged++;
        }

        statuses.A_VERIFIER = (statuses.A_VERIFIER || 0) + 1;

        return;
      }

      /*
       * Recherche FBI.
       */

      const match = findFbiMatchForContact(contact, indexes);

      let targetStatus = String(match.status || "").trim() || "A_VERIFIER";

      const foundLicence = normalizeFbiLicenceNumber(match.licence);

      const currentLicence = normalizeFbiLicenceNumber(contact.Licence_ffbb);

      /*
       * =========================
       * NUMERO DE LICENCE
       * =========================
       */

      /*
       * Aucun numéro actuellement :
       * on peut enregistrer celui de FBI.
       */

      if (foundLicence && !currentLicence) {
        const oldLicence = contact.Licence_ffbb || "";

        contact.Licence_ffbb = foundLicence;

        contactsLicenceAdded++;

        historyRows.push([
          now,
          email,
          "ADHESIONS",
          "CONTACT",
          contact.Contact_id,
          "SYNCHRONISATION_FBI",
          "Licence_ffbb",
          serializeHistoryValue(oldLicence),
          serializeHistoryValue(foundLicence),
        ]);
      } else if (

      /*
       * Une licence existe déjà.
       *
       * Si FBI retourne une licence
       * différente, on n'écrase rien.
       */
        foundLicence &&
        currentLicence &&
        foundLicence !== currentLicence
      ) {
        licenceConflicts++;

        targetStatus = "A_VERIFIER";

        historyRows.push([
          now,
          email,
          "ADHESIONS",
          "CONTACT",
          contact.Contact_id,
          "ANOMALIE_FBI",
          "Licence_ffbb",
          serializeHistoryValue(currentLicence),
          serializeHistoryValue(foundLicence),
        ]);
      } else if (
        foundLicence &&
        currentLicence &&
        foundLicence === currentLicence
      ) {
        contactsLicenceUnchanged++;
      }

      /*
       * =========================
       * ADHESION
       * =========================
       */

      const targetFunctions = String(match.functions || "").trim();

      const oldStatus = String(adhesion.Licence_statut || "").trim();

      const oldFunctions = String(adhesion.Licence_fonctions || "").trim();

      let adhesionChanged = false;

      /*
       * Statut licence.
       */

      if (oldStatus !== targetStatus) {
        historyRows.push([
          now,
          email,
          "ADHESIONS",
          "ADHESION",
          adhesion.Adhesion_id,
          "SYNCHRONISATION_FBI",
          "Licence_statut",
          serializeHistoryValue(oldStatus),
          serializeHistoryValue(targetStatus),
        ]);

        adhesion.Licence_statut = targetStatus;

        adhesionChanged = true;
      }

      /*
       * Fonctions FBI.
       */

      if (oldFunctions !== targetFunctions) {
        historyRows.push([
          now,
          email,
          "ADHESIONS",
          "ADHESION",
          adhesion.Adhesion_id,
          "SYNCHRONISATION_FBI",
          "Licence_fonctions",
          serializeHistoryValue(oldFunctions),
          serializeHistoryValue(targetFunctions),
        ]);

        adhesion.Licence_fonctions = targetFunctions;

        adhesionChanged = true;
      }

      if (adhesionChanged) {
        adhesion.Date_maj = now;

        adhesionsUpdated++;
      } else {
        adhesionsUnchanged++;
      }

      statuses[targetStatus] = (statuses[targetStatus] || 0) + 1;
    });

    /*
     * Sécurité :
     *
     * toutes les adhésions de la saison
     * doivent avoir été traitées.
     */

    if (adhesionsProcessed === 0) {
      throw new Error(
        "Aucune adhésion trouvée pour la saison " + saisonId + ".",
      );
    }

    /*
     * =========================
     * ECRITURE CONTACTS
     * =========================
     */

    writeObjectsToSheet(contactsSheet, contactsData.headers, contactsData.rows);

    /*
     * =========================
     * ECRITURE ADHESIONS
     * =========================
     */

    writeObjectsToSheet(
      adhesionsSheet,
      adhesionsData.headers,
      adhesionsData.rows,
    );

    /*
     * =========================
     * HISTORIQUE
     * =========================
     */

    if (historyRows.length > 0) {
      const historySheet = spreadsheet.getSheetByName("Historique");

      if (!historySheet) {
        throw new Error("Onglet Historique introuvable.");
      }

      historySheet
        .getRange(historySheet.getLastRow() + 1, 1, historyRows.length, 9)
        .setValues(historyRows);
    }

    SpreadsheetApp.flush();

    return {
      success: true,

      saisonId: saisonId,

      fbiRows: fbiRows.length,

      adhesionsProcessed: adhesionsProcessed,

      contactsLicenceAdded: contactsLicenceAdded,

      contactsLicenceUnchanged: contactsLicenceUnchanged,

      licenceConflicts: licenceConflicts,

      contactsMissing: contactsMissing,

      adhesionsUpdated: adhesionsUpdated,

      adhesionsUnchanged: adhesionsUnchanged,

      statuses: statuses,

      historyEntries: historyRows.length,
    };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
   FBI - TEST SYNCHRONISATION
   ============================================================ */

function testSyncFbiToAdhesions() {
  const result = syncFbiToAdhesions("2026-2027");

  console.log(JSON.stringify(result, null, 2));
}

function testGetAdhesions() {
  const adhesions = getAdhesions("2026-2027");

  const result = {
    total: adhesions.length,

    avecLicence: adhesions.filter(
      (adhesion) => String(adhesion.Licence_ffbb || "").trim() !== "",
    ).length,

    avecFonctions: adhesions.filter(
      (adhesion) => String(adhesion.Licence_fonctions || "").trim() !== "",
    ).length,

    statuts: {},
  };

  adhesions.forEach((adhesion) => {
    const statut = String(adhesion.Licence_statut || "").trim() || "VIDE";

    result.statuts[statut] = (result.statuts[statut] || 0) + 1;
  });

  console.log(JSON.stringify(result, null, 2));
}
