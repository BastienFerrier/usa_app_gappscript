const ACCESS_USER_HEADERS = [
  "Utilisateur_id",
  "Email",
  "Nom",
  "Prenom",
  "Role",
  "Actif",
  "Date_maj",
];

function ensureAccessGroupsSheet() {
  const spreadsheet = getSpreadsheet("ADMINISTRATION");
  let sheet = spreadsheet.getSheetByName(SHEETS.UTILISATEURS_GROUPES);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEETS.UTILISATEURS_GROUPES);
    sheet
      .getRange(1, 1, 1, ACCESS_GROUP_SHEET_HEADERS.length)
      .setValues([ACCESS_GROUP_SHEET_HEADERS]);
  }

  return sheet;
}

function ensureAccessUsersColumns(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    throw new Error("L'onglet Utilisateurs ne contient aucun en-tête.");
  }

  let headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((value) => String(value).trim());

  const missingHeaders = ACCESS_USER_HEADERS.filter(
    (header) => !headers.includes(header),
  );

  if (missingHeaders.length > 0) {
    sheet
      .getRange(1, headers.length + 1, 1, missingHeaders.length)
      .setValues([missingHeaders]);
    headers = headers.concat(missingHeaders);
  }

  const idColumn = headers.indexOf("Utilisateur_id");
  const dateColumn = headers.indexOf("Date_maj");
  const data = readSheetAsObjects(sheet);
  let nextNumber = getNextAccessUserNumber(data.rows);
  let changed = false;

  data.rows.forEach((row) => {
    if (!String(row.Utilisateur_id || "").trim()) {
      row.Utilisateur_id = "USR-" + String(nextNumber++).padStart(6, "0");
      changed = true;
    }
  });

  if (changed) {
    writeObjectsToSheet(sheet, headers, data.rows);
  }

  return {
    headers: headers,
    rows: data.rows,
    idColumn: idColumn,
    dateColumn: dateColumn,
  };
}

function getNextAccessUserNumber(rows) {
  let max = 0;

  rows.forEach((row) => {
    const match = String(row.Utilisateur_id || "")
      .trim()
      .match(/^USR-(\d+)$/);

    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  });

  return max + 1;
}

function getNextAccessGroupNumber(rows) {
  let max = 0;

  rows.forEach((row) => {
    const match = String(row.Utilisateur_groupe_id || "")
      .trim()
      .match(/^USRGRP-(\d+)$/);

    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  });

  return max + 1;
}

function getAccessUsers() {
  requirePermission("ACCESS");

  const spreadsheet = getSpreadsheet("ADMINISTRATION");
  const usersSheet = spreadsheet.getSheetByName("Utilisateurs");

  if (!usersSheet) {
    throw new Error("Onglet Utilisateurs introuvable.");
  }

  const usersData = ensureAccessUsersColumns(usersSheet);
  const groupsSheet = ensureAccessGroupsSheet();
  const groupsData = readSheetAsObjects(groupsSheet).rows;
  const groupsByUserId = {};

  groupsData.forEach((row) => {
    const userId = String(row.Utilisateur_id || "").trim();
    const group = String(row.Groupe_code || "")
      .trim()
      .toUpperCase();
    const actif =
      String(row.Actif || "")
        .trim()
        .toLowerCase() === "oui";

    if (!userId || !actif || !ACCESS_GROUPS.includes(group)) {
      return;
    }

    if (!groupsByUserId[userId]) {
      groupsByUserId[userId] = [];
    }

    if (!groupsByUserId[userId].includes(group)) {
      groupsByUserId[userId].push(group);
    }
  });

  return usersData.rows
    .map((item) => {
      const groups =
        groupsByUserId[String(item.Utilisateur_id || "").trim()] ||
        (ACCESS_GROUPS.includes(
          String(item.Role || "")
            .trim()
            .toUpperCase(),
        )
          ? [String(item.Role).trim().toUpperCase()]
          : []);

      return {
        utilisateurId: String(item.Utilisateur_id || "").trim(),
        email: String(item.Email || "")
          .trim()
          .toLowerCase(),
        nom: String(item.Nom || "").trim(),
        prenom: String(item.Prenom || "").trim(),
        role:
          groups[0] ||
          String(item.Role || "")
            .trim()
            .toUpperCase(),
        groupes: groups,
        permissions: getPermissionsForGroups(groups),
        actif:
          String(item.Actif || "")
            .trim()
            .toLowerCase() === "oui",
      };
    })
    .sort((a, b) =>
      (a.prenom + " " + a.nom).localeCompare(b.prenom + " " + b.nom),
    );
}

function saveAccessUser(data) {
  requirePermission("ACCESS");

  if (!data) {
    throw new Error("Aucune donnée utilisateur reçue.");
  }

  const email = String(data.email || "")
    .trim()
    .toLowerCase();
  const nom = String(data.nom || "").trim();
  const prenom = String(data.prenom || "").trim();
  const actif = data.actif === true;
  const groupes = Array.isArray(data.groupes)
    ? Array.from(
        new Set(
          data.groupes
            .map((group) =>
              String(group || "")
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean),
        ),
      )
    : data.role
      ? [String(data.role).trim().toUpperCase()]
      : [];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("L'adresse email n'est pas valide.");
  }

  if (!prenom || !nom) {
    throw new Error("Le prénom et le nom sont obligatoires.");
  }

  const invalidGroups = groupes.filter(
    (group) => !ACCESS_GROUPS.includes(group),
  );

  if (invalidGroups.length > 0) {
    throw new Error(
      "Groupe utilisateur invalide : " + invalidGroups.join(", "),
    );
  }

  const currentUser = getCurrentUser();
  if (email === currentUser.email && (!actif || !groupes.includes("ADMIN"))) {
    throw new Error(
      "Vous ne pouvez pas retirer vos propres droits administrateur.",
    );
  }

  const spreadsheet = getSpreadsheet("ADMINISTRATION");
  const usersSheet = spreadsheet.getSheetByName("Utilisateurs");

  if (!usersSheet) {
    throw new Error("Onglet Utilisateurs introuvable.");
  }

  const usersData = ensureAccessUsersColumns(usersSheet);
  let user = usersData.rows.find(
    (row) =>
      String(row.Email || "")
        .trim()
        .toLowerCase() === email,
  );

  if (!user) {
    user = {
      Utilisateur_id:
        "USR-" +
        String(getNextAccessUserNumber(usersData.rows)).padStart(6, "0"),
      Email: email,
    };
    usersData.rows.push(user);
  }

  user.Nom = nom;
  user.Prenom = prenom;
  user.Actif = actif ? "Oui" : "Non";
  user.Date_maj = new Date();

  writeObjectsToSheet(usersSheet, usersData.headers, usersData.rows);

  const groupsSheet = ensureAccessGroupsSheet();
  const groupsData = readSheetAsObjects(groupsSheet);
  const userId = String(user.Utilisateur_id).trim();
  const remainingRows = groupsData.rows.filter(
    (row) => String(row.Utilisateur_id || "").trim() !== userId,
  );
  let nextGroupNumber = getNextAccessGroupNumber(groupsData.rows);

  groupes.forEach((group) => {
    remainingRows.push({
      Utilisateur_groupe_id:
        "USRGRP-" + String(nextGroupNumber++).padStart(6, "0"),
      Utilisateur_id: userId,
      Groupe_code: group,
      Actif: actif ? "Oui" : "Non",
      Date_maj: new Date(),
    });
  });

  writeObjectsToSheet(groupsSheet, groupsData.headers, remainingRows);

  SpreadsheetApp.flush();

  return getAccessUsers();
}

function migrateAccessUsersToGroups() {
  requirePermission("ACCESS");

  const spreadsheet = getSpreadsheet("ADMINISTRATION");
  const usersSheet = spreadsheet.getSheetByName("Utilisateurs");

  if (!usersSheet) {
    throw new Error("Onglet Utilisateurs introuvable.");
  }

  const usersData = ensureAccessUsersColumns(usersSheet);
  const groupsSheet = ensureAccessGroupsSheet();
  const groupsData = readSheetAsObjects(groupsSheet);
  const existingKeys = new Set(
    groupsData.rows.map(
      (row) =>
        String(row.Utilisateur_id || "").trim() +
        "|" +
        String(row.Groupe_code || "")
          .trim()
          .toUpperCase(),
    ),
  );
  let nextGroupNumber = getNextAccessGroupNumber(groupsData.rows);
  let migrated = 0;

  usersData.rows.forEach((user) => {
    const legacyRole = String(user.Role || "")
      .trim()
      .toUpperCase();
    const userId = String(user.Utilisateur_id || "").trim();

    if (!userId || !ACCESS_GROUPS.includes(legacyRole)) {
      return;
    }

    const key = userId + "|" + legacyRole;
    if (existingKeys.has(key)) {
      return;
    }

    groupsData.rows.push({
      Utilisateur_groupe_id:
        "USRGRP-" + String(nextGroupNumber++).padStart(6, "0"),
      Utilisateur_id: userId,
      Groupe_code: legacyRole,
      Actif:
        String(user.Actif || "")
          .trim()
          .toLowerCase() === "oui"
          ? "Oui"
          : "Non",
      Date_maj: new Date(),
    });
    migrated++;
  });

  if (migrated > 0) {
    writeObjectsToSheet(groupsSheet, groupsData.headers, groupsData.rows);
    SpreadsheetApp.flush();
  }

  return {
    success: true,
    migrated: migrated,
    users: usersData.rows.length,
  };
}

/**
 * Fonctions Drive historiques conservées pour la migration.
 */
function applyFolderPermission(folderId, email, permission) {
  const folder = DriveApp.getFolderById(folderId);

  if (permission === "EDITOR") {
    try {
      folder.removeViewer(email);
    } catch (error) {}
    folder.addEditor(email);
    return;
  }

  if (permission === "READER") {
    try {
      folder.removeEditor(email);
    } catch (error) {}
    folder.addViewer(email);
    return;
  }

  if (permission === "NONE") {
    try {
      folder.removeEditor(email);
    } catch (error) {}
    try {
      folder.removeViewer(email);
    } catch (error) {}
    return;
  }

  throw new Error("Permission dossier inconnue : " + permission);
}

function applyFilePermission(fileId, email, permission) {
  const file = DriveApp.getFileById(fileId);

  if (permission === "EDITOR") {
    try {
      file.removeViewer(email);
    } catch (error) {}
    file.addEditor(email);
    return;
  }

  if (permission === "READER") {
    try {
      file.removeEditor(email);
    } catch (error) {}
    file.addViewer(email);
    return;
  }

  if (permission === "NONE") {
    try {
      file.removeEditor(email);
    } catch (error) {}
    try {
      file.removeViewer(email);
    } catch (error) {}
    return;
  }

  throw new Error("Permission fichier inconnue : " + permission);
}

function testAccessUsers() {
  console.log(JSON.stringify(getAccessUsers(), null, 2));
}

function testMigrateAccessUsersToGroups() {
  console.log(JSON.stringify(migrateAccessUsersToGroups(), null, 2));
}
