/**
 * Retourne un Google Sheet
 * utilisé comme base de données.
 *
 * Exemple :
 * getSpreadsheet("SPORT")
 */
function getSpreadsheet(database) {
  const spreadsheetId = SPREADSHEETS[database];

  if (!spreadsheetId) {
    throw new Error("Base de données inconnue : " + database);
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

/**
 * Lecture générique d'un onglet.
 *
 * database :
 * SPORT
 * ADMINISTRATION
 *
 * La première ligne de l'onglet
 * est utilisée comme nom des propriétés.
 */
function getSheetData(database, sheetName) {
  const spreadsheet = getSpreadsheet(database);

  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("Onglet introuvable : " + sheetName + " dans " + database);
  }

  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return [];
  }

  const headers = data[0];

  return data

    .slice(1)

    .filter((row) => row.some((cell) => cell !== ""))

    .map((row) => {
      const object = {};

      headers.forEach((header, index) => {
        object[header] = row[index];
      });

      return object;
    });
}

/**
 * Convertit une heure
 * en nombre de minutes depuis minuit.
 *
 * 18h30 → 1110
 * 19h00 → 1140
 * 00h   → 1440
 */
function parseTime(time) {
  if (!time) {
    return null;
  }

  const normalized = time.toString().trim().toLowerCase();

  const parts = normalized.split("h");

  const hours = parseInt(parts[0], 10);

  const minutes = parts[1] ? parseInt(parts[1], 10) : 0;

  if (hours === 0) {
    return 24 * 60;
  }

  return hours * 60 + minutes;
}

/**
 * Uniformise les jours.
 *
 * lundi → Lundi
 * MERCREDI → Mercredi
 */
function normalizeDay(day) {
  if (!day) {
    return null;
  }

  const value = day.toString().trim().toLowerCase();

  return value.charAt(0).toUpperCase() + value.slice(1);
}
