/*
 * ============================================================
 * IMPORTS ADMIN - FBI MATCHS
 * ============================================================
 */

function getFbiMatchImportFolder(saisonId) {
  requirePermission("IMPORT_MATCH");

  const config = IMPORT_FOLDERS.FBI && IMPORT_FOLDERS.FBI[saisonId];
  const folderId = config && config.MATCHS;

  if (!folderId) {
    throw new Error("Dossier FBI MATCHS non configuré pour " + saisonId + ".");
  }

  return DriveApp.getFolderById(folderId);
}

function getFbiMatchImportFiles(saisonId) {
  const folder = getFbiMatchImportFolder(String(saisonId || "").trim());
  const files = folder.getFiles();
  const result = [];

  while (files.hasNext()) {
    const file = files.next();

    if (!file.getName().toLowerCase().endsWith(".xlsx")) {
      continue;
    }

    result.push({
      id: file.getId(),
      name: file.getName(),
      dateUpdated: file.getLastUpdated().toISOString(),
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeFbiMatchCategory(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

  if (/^D[M]\d*/.test(normalized)) {
    return "SENIORS_M";
  }

  if (/^D[F]\d*/.test(normalized)) {
    return "SENIORS_F";
  }

  const youthMatch = normalized.match(/U?(7|9|11|13|15|18)(F|M)/);

  if (youthMatch) {
    return "U" + youthMatch[1] + youthMatch[2];
  }

  return "";
}

function normalizeFbiMatchDate(value) {
  if (value instanceof Date) {
    return value;
  }

  const raw = String(value || "").trim();
  const frenchDate = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);

  if (frenchDate) {
    return new Date(
      Number(frenchDate[3]),
      Number(frenchDate[2]) - 1,
      Number(frenchDate[1]),
    );
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? "" : parsed;
}

function normalizeFbiMatchHour(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value < 1
  ) {
    const totalMinutes = Math.round(value * 24 * 60) % (24 * 60);

    return (
      String(Math.floor(totalMinutes / 60)).padStart(2, "0") +
      ":" +
      String(totalMinutes % 60).padStart(2, "0")
    );
  }

  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2})\s*(?::|h|H|\.)\s*(\d{2})/);

  return match ? String(match[1]).padStart(2, "0") + ":" + match[2] : raw;
}

function normalizeFbiMatchVenue(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized.includes("PIERRE DENIS")) {
    return "PIERRE_DENIS";
  }

  if (
    normalized.includes("TILLION") ||
    normalized.includes("TILLON") ||
    normalized.includes("GERMAINE")
  ) {
    return "GERMAINE_TILLON";
  }

  return "EXTERIEUR";
}

function normalizeFbiMatchRow(rawRow, saisonId, sourceFile) {
  const numero = String(getFbiValue(rawRow, "N° de match") || "").trim();
  const equipe1 = String(getFbiValue(rawRow, "Equipe 1") || "").trim();
  const equipe2 = String(getFbiValue(rawRow, "Equipe 2") || "").trim();

  if (!numero || (!equipe1 && !equipe2)) {
    return null;
  }

  const score1 = String(getFbiValue(rawRow, "Score 1") || "").trim();
  const score2 = String(getFbiValue(rawRow, "Score 2") || "").trim();

  return {
    Match_id: "FBI-" + saisonId + "-" + numero,
    Fbi_numero_match: numero,
    Saison_id: saisonId,
    Date: normalizeFbiMatchDate(getFbiValue(rawRow, "Date de rencontre")),
    Heure: normalizeFbiMatchHour(getFbiValue(rawRow, "Heure")),
    Equipe1: equipe1,
    Equipe2: equipe2,
    Domicile_exterieur: "",
    Categorie: normalizeFbiMatchCategory(getFbiValue(rawRow, "Division")),
    Score: score1 || score2 ? score1 + "-" + score2 : "",
    Score1: score1,
    Score2: score2,
    Lieu: normalizeFbiMatchVenue(getFbiValue(rawRow, "Salle")),
    Code_eMarque: String(getFbiValue(rawRow, "e-Marque V2") || "").trim(),
    Forfait1: String(getFbiValue(rawRow, "Forfait 1") || "").trim(),
    Forfait2: String(getFbiValue(rawRow, "Forfait 2") || "").trim(),
    Source_fichier: sourceFile,
  };
}

function importFbiMatchs(saisonId) {
  requirePermission("IMPORT_MATCH");

  const normalizedSaisonId = String(saisonId || "").trim();

  if (!normalizedSaisonId) {
    throw new Error("Saison Matchs manquante.");
  }

  const files = getFbiMatchImportFiles(normalizedSaisonId);

  if (files.length === 0) {
    throw new Error("Aucun fichier XLSX FBI Matchs trouvé.");
  }

  const importedRows = [];

  files.forEach((file) => {
    const data = readXlsxFile(file.id);

    if (!data || data.length < 2) {
      return;
    }

    const headers = data[0].map((value) => String(value).trim());
    const normalizedHeaders = headers.map((value) => normalizeFbiHeader(value));

    [
      "Division",
      "N° de match",
      "Equipe 1",
      "Equipe 2",
      "Date de rencontre",
      "Heure",
      "Salle",
      "e-Marque V2",
      "Score 1",
      "Forfait 1",
      "Score 2",
      "Forfait 2",
    ].forEach((header) => {
      if (!normalizedHeaders.includes(normalizeFbiHeader(header))) {
        throw new Error(file.name + " : colonne Matchs manquante : " + header);
      }
    });

    data
      .slice(1)
      .filter((row) => row.some((value) => value !== "" && value !== null))
      .forEach((values) => {
        const rawRow = {};

        headers.forEach((header, index) => {
          rawRow[header] = values[index];
        });

        const normalized = normalizeFbiMatchRow(
          rawRow,
          normalizedSaisonId,
          file.name,
        );

        if (normalized) {
          importedRows.push(normalized);
        }
      });
  });

  if (importedRows.length === 0) {
    throw new Error("Aucun match exploitable dans les fichiers FBI.");
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);
  const sheet = getRequiredSheet(spreadsheet, SHEETS.MATCHS);
  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    ensureMatchsColumns(sheet);

    const data = readSheetAsObjects(sheet);
    const rows = data.rows;
    const byKey = {};

    rows.forEach((row) => {
      const key =
        String(row.Saison_id || "").trim() +
        "|" +
        String(row.Fbi_numero_match || row.Match_id || "").trim();

      if (key !== "|") {
        byKey[key] = row;
      }
    });

    let created = 0;
    let updated = 0;

    importedRows.forEach((imported) => {
      const key = normalizedSaisonId + "|" + imported.Fbi_numero_match;
      const existing = byKey[key];

      if (existing) {
        Object.keys(imported).forEach((field) => {
          if (field !== "Match_id" && field !== "Source_fichier") {
            existing[field] = imported[field];
          }
        });

        updated++;
      } else {
        rows.push(imported);
        byKey[key] = imported;
        created++;
      }
    });

    writeObjectsToSheet(sheet, data.headers, rows);
    SpreadsheetApp.flush();

    return {
      success: true,
      saisonId: normalizedSaisonId,
      files: files.length,
      rows: importedRows.length,
      created: created,
      updated: updated,
    };
  } finally {
    lock.releaseLock();
  }
}
