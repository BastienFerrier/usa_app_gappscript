/*
 * ============================================================
 * OTM
 * ============================================================
 *
 * Les contacts et leur licence FFBB restent dans ADHESIONS/Contacts.
 * Les lignes OTM sont saisonnières et résident dans SPORT/OTM.
 * Les équipes sont liées dans SPORT/OTM_Equipes.
 */

const OTM_EQUIPES_AUTORISEES = [
  "U7",
  "U9",
  "U11F",
  "U11M",
  "U13F",
  "U13M",
  "U15F",
  "U15M",
  "U18F",
  "U18M",
  "SF",
  "SM",
];

const OTM_SHEET_HEADERS = [
  "Otm_id",
  "Saison_id",
  "Contact_id",
  "Actif",
  "Date_maj",
];

const OTM_EQUIPES_SHEET_HEADERS = [
  "Otm_equipe_id",
  "Saison_id",
  "Otm_id",
  "Equipe",
  "Date_maj",
];

function ensureOtmSheets() {
  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const otmCreated = ensureSheetWithHeaders(
    sportSpreadsheet,
    SHEETS.OTM,
    OTM_SHEET_HEADERS,
  );

  const teamsCreated = ensureSheetWithHeaders(
    sportSpreadsheet,
    SHEETS.OTM_EQUIPES,
    OTM_EQUIPES_SHEET_HEADERS,
  );

  return {
    success: true,
    OTM: otmCreated ? "CREATED" : "EXISTING",
    OTM_Equipes: teamsCreated ? "CREATED" : "EXISTING",
  };
}

function getOtm(saisonId) {
  requireAuthorizedUser();

  const normalizedSaisonId = String(saisonId || "").trim();

  if (!normalizedSaisonId) {
    throw new Error("La saison est obligatoire.");
  }

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);
  const otmSheet = sportSpreadsheet.getSheetByName(SHEETS.OTM);
  const teamsSheet = sportSpreadsheet.getSheetByName(SHEETS.OTM_EQUIPES);

  if (!otmSheet || !teamsSheet) {
    return [];
  }

  const otmData = readSheetAsObjects(otmSheet);
  const teamsData = readSheetAsObjects(teamsSheet);
  const contactsSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);
  const contactsSheet = contactsSpreadsheet.getSheetByName("Contacts");

  if (!contactsSheet) {
    throw new Error("Feuille Contacts introuvable.");
  }

  const contactsById = {};
  readSheetAsObjects(contactsSheet).rows.forEach((contact) => {
    const contactId = String(contact.Contact_id || "").trim();
    if (contactId) {
      contactsById[contactId] = contact;
    }
  });

  const teamsByOtmId = {};
  teamsData.rows
    .filter((row) => String(row.Saison_id || "").trim() === normalizedSaisonId)
    .forEach((row) => {
      const otmId = String(row.Otm_id || "").trim();
      const equipe = String(row.Equipe || "").trim();

      if (!otmId || !OTM_EQUIPES_AUTORISEES.includes(equipe)) {
        return;
      }

      if (!teamsByOtmId[otmId]) {
        teamsByOtmId[otmId] = [];
      }

      if (!teamsByOtmId[otmId].includes(equipe)) {
        teamsByOtmId[otmId].push(equipe);
      }
    });

  return otmData.rows
    .filter(
      (row) =>
        String(row.Saison_id || "").trim() === normalizedSaisonId &&
        !["NON", "NO", "FALSE", "0", "INACTIF"].includes(
          String(row.Actif === undefined ? "Oui" : row.Actif)
            .trim()
            .toUpperCase(),
        ),
    )
    .map((row) => {
      const otmId = String(row.Otm_id || "").trim();
      const contactId = String(row.Contact_id || "").trim();
      const contact = contactsById[contactId] || {};
      const equipes = teamsByOtmId[otmId] || [];

      return {
        Personne_id: otmId,
        Otm_id: otmId,
        Saison_id: normalizedSaisonId,
        Contact_id: contactId,
        Prenom: String(contact.Prenom || "").trim(),
        Nom: String(contact.Nom || "").trim(),
        Telephone: String(contact.Telephone_mobile || "").trim(),
        Date_naissance: serializeOtmDate(contact.Date_naissance),
        Email: String(contact.Email || "").trim(),
        Licence_ffbb: String(contact.Licence_ffbb || "").trim(),
        Equipes: equipes,
        Equipe: equipes.join(" • "),
        Actif: String(row.Actif || "Oui").trim() || "Oui",
        Date_maj: serializeOtmDate(row.Date_maj),
      };
    })
    .sort((a, b) => {
      const nom = a.Nom.localeCompare(b.Nom, "fr");
      return nom !== 0 ? nom : a.Prenom.localeCompare(b.Prenom, "fr");
    });
}

function listOtmEquipes(saisonId) {
  requireAuthorizedUser();

  if (!String(saisonId || "").trim()) {
    throw new Error("La saison est obligatoire.");
  }

  return OTM_EQUIPES_AUTORISEES.slice();
}

function saveOtm(payload) {
  requireRole("ADMIN", "BUREAU");

  payload = payload || {};
  const saisonId = String(payload.Saison_id || "").trim();
  const otmId = String(payload.Otm_id || "").trim();
  const prenom = String(payload.Prenom || "").trim();
  const nom = String(payload.Nom || "").trim();
  const telephone = String(payload.Telephone || "").trim();
  const dateNaissance = String(payload.Date_naissance || "").trim();
  const email = String(payload.Email || "")
    .trim()
    .toLowerCase();
  const licence = String(payload.Licence_ffbb || "").trim();
  const equipes = Array.isArray(payload.Equipes)
    ? Array.from(
        new Set(
          payload.Equipes.map((equipe) => String(equipe || "").trim()).filter(
            Boolean,
          ),
        ),
      )
    : [];

  if (!saisonId) throw new Error("La saison est obligatoire.");
  if (!prenom) throw new Error("Le prénom est obligatoire.");
  if (!nom) throw new Error("Le nom est obligatoire.");
  if (!telephone) throw new Error("Le téléphone est obligatoire.");
  if (!dateNaissance || !/^\d{4}-\d{2}-\d{2}$/.test(dateNaissance)) {
    throw new Error(
      "La date de naissance est obligatoire et doit être valide.",
    );
  }

  const parsedDateNaissance = new Date(dateNaissance + "T00:00:00Z");
  if (
    Number.isNaN(parsedDateNaissance.getTime()) ||
    parsedDateNaissance.toISOString().substring(0, 10) !== dateNaissance
  ) {
    throw new Error("La date de naissance est invalide.");
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Un email valide est obligatoire.");
  }

  const invalidEquipes = equipes.filter(
    (equipe) => !OTM_EQUIPES_AUTORISEES.includes(equipe),
  );

  if (invalidEquipes.length > 0) {
    throw new Error(
      "Catégorie d'équipe OTM invalide : " + invalidEquipes.join(", "),
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureOtmSheets();

    const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);
    const otmSheet = getRequiredSheet(sportSpreadsheet, SHEETS.OTM);
    const teamsSheet = getRequiredSheet(sportSpreadsheet, SHEETS.OTM_EQUIPES);
    const otmData = readSheetAsObjects(otmSheet);
    const teamsData = readSheetAsObjects(teamsSheet);

    const contactsSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);
    const contactsSheet = getRequiredSheet(contactsSpreadsheet, "Contacts");
    const contactsData = readSheetAsObjects(contactsSheet);

    [
      "Contact_id",
      "Prenom",
      "Nom",
      "Date_naissance",
      "Email",
      "Telephone_mobile",
      "Licence_ffbb",
    ].forEach((header) => {
      if (!contactsData.headers.includes(header)) {
        throw new Error("Colonne Contacts manquante : " + header);
      }
    });

    let otm = otmData.rows.find(
      (row) =>
        String(row.Otm_id || "").trim() === otmId &&
        String(row.Saison_id || "").trim() === saisonId,
    );

    if (otmId && !otm) {
      throw new Error("OTM introuvable : " + otmId);
    }

    let contactId = otm ? String(otm.Contact_id || "").trim() : "";
    let contact = contactId
      ? contactsData.rows.find(
          (row) => String(row.Contact_id || "").trim() === contactId,
        )
      : null;

    if (!contact) {
      contact = contactsData.rows.find(
        (row) =>
          String(row.Email || "")
            .trim()
            .toLowerCase() === email,
      );
    }

    if (!contact) {
      contactId = getNextContactNumber(contactsData.rows);
      contactId = "CNT-" + String(contactId).padStart(6, "0");
      contact = { Contact_id: contactId, Actif: "Oui" };
      contactsData.rows.push(contact);
    } else {
      contactId = String(contact.Contact_id || "").trim();
    }

    if (
      !otm &&
      otmData.rows.some(
        (row) =>
          String(row.Saison_id || "").trim() === saisonId &&
          String(row.Contact_id || "").trim() === contactId,
      )
    ) {
      throw new Error(
        "Ce contact est déjà déclaré comme OTM pour cette saison.",
      );
    }

    contact.Prenom = prenom;
    contact.Nom = nom;
    contact.Telephone_mobile = telephone;
    contact.Date_naissance = dateNaissance;
    contact.Email = email;
    contact.Licence_ffbb = licence;
    contact.Actif = "Oui";
    writeObjectsToSheet(contactsSheet, contactsData.headers, contactsData.rows);

    const now = new Date();
    if (!otm) {
      const nextNumber = getNextOtmNumber(otmData.rows);
      otm = {
        Otm_id: "OTM-" + String(nextNumber).padStart(6, "0"),
        Saison_id: saisonId,
        Contact_id: contactId,
        Actif: "Oui",
        Date_maj: now,
      };
      otmData.rows.push(otm);
    } else {
      otm.Contact_id = contactId;
      otm.Actif = "Oui";
      otm.Date_maj = now;
    }

    writeObjectsToSheet(otmSheet, otmData.headers, otmData.rows);

    const remainingTeams = teamsData.rows.filter(
      (row) =>
        !(
          String(row.Saison_id || "").trim() === saisonId &&
          String(row.Otm_id || "").trim() === otm.Otm_id
        ),
    );
    const nextTeamNumber = getNextOtmEquipeNumber(teamsData.rows);

    equipes.forEach((equipe, index) => {
      remainingTeams.push({
        Otm_equipe_id:
          "OTME-" + String(nextTeamNumber + index).padStart(6, "0"),
        Saison_id: saisonId,
        Otm_id: otm.Otm_id,
        Equipe: equipe,
        Date_maj: now,
      });
    });

    writeObjectsToSheet(teamsSheet, teamsData.headers, remainingTeams);
    SpreadsheetApp.flush();

    return {
      success: true,
      action: otmId ? "UPDATED" : "CREATED",
      Otm_id: otm.Otm_id,
      Saison_id: saisonId,
    };
  } finally {
    lock.releaseLock();
  }
}

function serializeOtmDate(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
  }

  const text = String(value || "").trim();
  return text ? text.substring(0, 10) : "";
}

function getNextOtmNumber(rows) {
  let max = 0;
  rows.forEach((row) => {
    const match = String(row.Otm_id || "")
      .trim()
      .match(/^OTM-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return max + 1;
}

function getNextOtmEquipeNumber(rows) {
  let max = 0;
  rows.forEach((row) => {
    const match = String(row.Otm_equipe_id || "")
      .trim()
      .match(/^OTME-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return max + 1;
}
