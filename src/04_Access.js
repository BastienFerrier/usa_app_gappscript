/**
 * Rôles autorisés dans l'application.
 */
const ACCESS_ROLES = ["ADMIN", "BUREAU", "COACH"];

/**
 * Retourne la liste des utilisateurs
 * de l'application.
 *
 * Réservé aux administrateurs.
 */
function getAccessUsers() {
  requireRole("ADMIN");

  const utilisateurs = getSheetData("ADMINISTRATION", "Utilisateurs");

  return utilisateurs
    .map((item) => ({
      email: item["Email"] ? item["Email"].toString().trim().toLowerCase() : "",

      nom: item["Nom"] ? item["Nom"].toString().trim() : "",

      prenom: item["Prenom"] ? item["Prenom"].toString().trim() : "",

      role: item["Role"] ? item["Role"].toString().trim().toUpperCase() : "",

      actif: item["Actif"]
        ? item["Actif"].toString().trim().toLowerCase() === "oui"
        : false,
    }))
    .sort((a, b) =>
      (a.prenom + " " + a.nom).localeCompare(b.prenom + " " + b.nom),
    );
}

/**
 * Ajoute ou modifie un utilisateur.
 *
 * data :
 * {
 *   email: "...",
 *   nom: "...",
 *   prenom: "...",
 *   role: "COACH",
 *   actif: true
 * }
 */
function saveAccessUser(data) {
  requireRole("ADMIN");

  /*
   * Validation données reçues
   */

  if (!data) {
    throw new Error("Aucune donnée utilisateur reçue.");
  }

  const email = data.email ? data.email.toString().trim().toLowerCase() : "";

  const nom = data.nom ? data.nom.toString().trim() : "";

  const prenom = data.prenom ? data.prenom.toString().trim() : "";

  const role = data.role ? data.role.toString().trim().toUpperCase() : "";

  const actif = data.actif === true;

  /*
   * Protection du compte
   * administrateur connecté.
   *
   * Un administrateur ne peut pas
   * se retirer lui-même ses droits.
   */
  const currentUser = getCurrentUser();

  if (email === currentUser.email && (role !== "ADMIN" || !actif)) {
    throw new Error(
      "Vous ne pouvez pas retirer vos propres droits administrateur.",
    );
  }
  /*
   * Email obligatoire
   */

  if (!email) {
    throw new Error("L'adresse email est obligatoire.");
  }

  /*
   * Validation simple de l'email
   */

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    throw new Error("L'adresse email n'est pas valide.");
  }

  /*
   * Prénom / nom
   */

  if (!prenom) {
    throw new Error("Le prénom est obligatoire.");
  }

  if (!nom) {
    throw new Error("Le nom est obligatoire.");
  }

  /*
   * Rôle
   */

  if (!ACCESS_ROLES.includes(role)) {
    throw new Error("Rôle utilisateur invalide.");
  }

  /*
   * Accès au Sheet
   */

  const spreadsheet = getSpreadsheet("ADMINISTRATION");

  const sheet = spreadsheet.getSheetByName("Utilisateurs");

  if (!sheet) {
    throw new Error("Onglet Utilisateurs introuvable.");
  }

  const dataRange = sheet.getDataRange().getValues();

  if (dataRange.length === 0) {
    throw new Error("L'onglet Utilisateurs est vide.");
  }

  const headers = dataRange[0];

  const emailColumn = headers.indexOf("Email");

  const nomColumn = headers.indexOf("Nom");

  const prenomColumn = headers.indexOf("Prenom");

  const roleColumn = headers.indexOf("Role");

  const actifColumn = headers.indexOf("Actif");

  if (
    emailColumn === -1 ||
    nomColumn === -1 ||
    prenomColumn === -1 ||
    roleColumn === -1 ||
    actifColumn === -1
  ) {
    throw new Error("La structure de l'onglet Utilisateurs est incorrecte.");
  }

  /*
   * Recherche utilisateur existant
   */

  let existingRow = null;

  for (let i = 1; i < dataRange.length; i++) {
    const existingEmail = dataRange[i][emailColumn]
      ? dataRange[i][emailColumn].toString().trim().toLowerCase()
      : "";

    if (existingEmail === email) {
      existingRow = i + 1;

      break;
    }
  }

  /*
   * Mise à jour
   */

  if (existingRow) {
    sheet.getRange(existingRow, nomColumn + 1).setValue(nom);

    sheet.getRange(existingRow, prenomColumn + 1).setValue(prenom);

    sheet.getRange(existingRow, roleColumn + 1).setValue(role);

    sheet
      .getRange(existingRow, actifColumn + 1)
      .setValue(actif ? "Oui" : "Non");
  } else {

  /*
   * Nouvel utilisateur
   */
    const newRow = new Array(headers.length).fill("");

    newRow[emailColumn] = email;

    newRow[nomColumn] = nom;

    newRow[prenomColumn] = prenom;

    newRow[roleColumn] = role;

    newRow[actifColumn] = actif ? "Oui" : "Non";

    sheet.appendRow(newRow);
  }

  /*
   * Synchronisation des permissions
   * Google Sheets avec le rôle
   * de l'utilisateur.
   */

  /**
   * Synchronise les permissions
   * Google Drive d'un utilisateur
   * avec son rôle applicatif.
   */
  function syncUserPermissions(email, role, actif) {
    requireRole("ADMIN");

    email = email.toString().trim().toLowerCase();

    role = role.toString().trim().toUpperCase();

    if (!email) {
      throw new Error("Adresse email manquante.");
    }

    if (actif && !ROLE_PERMISSIONS[role]) {
      throw new Error("Rôle inconnu : " + role);
    }

    /*
     * =========================
     * GOOGLE SHEETS
     * =========================
     */

    Object.keys(SPREADSHEETS).forEach((database) => {
      const fileId = SPREADSHEETS[database];

      const permission = actif
        ? ROLE_PERMISSIONS[role][database] || "NONE"
        : "NONE";

      applyFilePermission(fileId, email, permission);
    });

    /*
     * =========================
     * DOSSIER EXTRACTS
     * =========================
     *
     * ADMIN  -> EDITOR
     * BUREAU -> EDITOR
     * COACH  -> NONE
     */

    let extractsPermission = "NONE";

    if (actif && (role === "ADMIN" || role === "BUREAU")) {
      extractsPermission = "EDITOR";
    }

    applyFolderPermission(DRIVE_FOLDERS.EXTRACTS, email, extractsPermission);
  }

  /*
   * Retourne la liste actualisée.
   */

  return getAccessUsers();
}

/**
 * Applique une permission
 * à un dossier Google Drive.
 */
function applyFolderPermission(folderId, email, permission) {
  const folder = DriveApp.getFolderById(folderId);

  /*
   * EDITOR
   */
  if (permission === "EDITOR") {
    try {
      folder.removeViewer(email);
    } catch (error) {
      console.log("removeViewer dossier ignoré : " + email);
    }

    folder.addEditor(email);

    return;
  }

  /*
   * READER
   */
  if (permission === "READER") {
    try {
      folder.removeEditor(email);
    } catch (error) {
      console.log("removeEditor dossier ignoré : " + email);
    }

    folder.addViewer(email);

    return;
  }

  /*
   * NONE
   */
  if (permission === "NONE") {
    try {
      folder.removeEditor(email);
    } catch (error) {
      console.log("removeEditor dossier ignoré : " + email);
    }

    try {
      folder.removeViewer(email);
    } catch (error) {
      console.log("removeViewer dossier ignoré : " + email);
    }

    return;
  }

  throw new Error("Permission dossier inconnue : " + permission);
}

/**
 * Test lecture.
 */
function testAccessUsers() {
  const users = getAccessUsers();

  console.log(JSON.stringify(users, null, 2));
}

/**
 * Test écriture.
 *
 * ATTENTION :
 * crée ou modifie réellement
 * cet utilisateur dans le Sheet.
 */
function testSaveAccessUser() {
  const users = saveAccessUser({
    email: "test.usabasket@gmail.com",

    nom: "Test",

    prenom: "Utilisateur",

    role: "COACH",

    actif: true,
  });

  console.log(JSON.stringify(users, null, 2));
}

/**
 * Synchronise les permissions Google Sheets
 * d'un utilisateur avec son rôle applicatif.
 */
function syncUserPermissions(email, role, actif) {
  requireRole("ADMIN");

  email = email.toString().trim().toLowerCase();

  role = role.toString().trim().toUpperCase();

  if (!email) {
    throw new Error("Adresse email manquante.");
  }

  if (actif && !ROLE_PERMISSIONS[role]) {
    throw new Error("Rôle inconnu : " + role);
  }

  Object.keys(SPREADSHEETS).forEach((database) => {
    const fileId = SPREADSHEETS[database];

    /*
     * Utilisateur inactif :
     * aucun accès.
     */
    const permission = actif
      ? ROLE_PERMISSIONS[role][database] || "NONE"
      : "NONE";

    applyFilePermission(fileId, email, permission);
  });
}

/**
 * Applique une permission
 * à un fichier Google Drive.
 */
function applyFilePermission(fileId, email, permission) {
  const file = DriveApp.getFileById(fileId);

  /*
   * EDITOR
   */
  if (permission === "EDITOR") {
    /*
     * On retire éventuellement
     * le statut lecteur.
     */
    try {
      file.removeViewer(email);
    } catch (error) {
      console.log("removeViewer ignoré : " + email);
    }

    file.addEditor(email);

    return;
  }

  /*
   * READER
   */
  if (permission === "READER") {
    /*
     * On retire éventuellement
     * le statut éditeur.
     */
    try {
      file.removeEditor(email);
    } catch (error) {
      console.log("removeEditor ignoré : " + email);
    }

    file.addViewer(email);

    return;
  }

  /*
   * NONE
   */
  if (permission === "NONE") {
    try {
      file.removeEditor(email);
    } catch (error) {
      console.log("removeEditor ignoré : " + email);
    }

    try {
      file.removeViewer(email);
    } catch (error) {
      console.log("removeViewer ignoré : " + email);
    }

    return;
  }

  throw new Error("Permission inconnue : " + permission);
}

function testSyncUserPermissions() {
  syncUserPermissions("test.usabasket@gmail.com", "COACH", true);

  console.log("Synchronisation terminée.");
}

function testSyncBastienPermissions() {
  syncUserPermissions("bastien.ferrier@gmail.com", "ADMIN", true);

  console.log("Permissions Bastien synchronisées.");
}

function testExtractsPermission() {
  requireRole("ADMIN");

  const email = "bastien.ferrier@gmail.com";

  const folderId = DRIVE_FOLDERS.EXTRACTS;

  const folder = DriveApp.getFolderById(folderId);

  console.log("Dossier : " + folder.getName());

  console.log("ID : " + folder.getId());

  folder.addEditor(email);

  console.log("Ajout éditeur demandé pour : " + email);

  const editors = folder.getEditors().map((user) => user.getEmail());

  console.log("Editeurs du dossier : " + JSON.stringify(editors));
}
