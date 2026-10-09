/*
 * ============================================================
 * MATCHS
 * ============================================================
 *
 * Backend du module Matchs (affectation arbitres & OTM).
 *
 * Classeur de référence : SPREADSHEETS.SPORT.
 *
 * Tables gérées :
 * - Matchs               : rencontres de la saison.
 * - Affectations_matchs  : affectations génériques (arbitre, OTM,
 *                          responsable de salle) via un champ Role.
 *
 * La saisie initiale des matchs reste manuelle dans l'onglet
 * Matchs (import FBI/FFBB hors périmètre). Cette couche se contente
 * d'initialiser les onglets et leurs en-têtes.
 */

/*
 * ============================================================
 * CONSTANTES INTERNES
 * ============================================================
 *
 * En-têtes exacts des onglets du module.
 *
 * Les noms d'onglets sont centralisés dans SHEETS (00_Config.js)
 * pour éviter les chaînes magiques dispersées dans les modules.
 */

const MATCHS_SHEET_HEADERS = [
  "Match_id",
  "Saison_id",
  "Date",
  "Equipe1",
  "Equipe2",
  "Domicile_exterieur",
  "Categorie",
  "Score",
  "Lieu",
  "Responsable_salle",
  "Date_maj",
];

const AFFECTATIONS_MATCHS_SHEET_HEADERS = [
  "Affectation_id",
  "Saison_id",
  "Match_id",
  "Personne_id",
  "Role",
  "Date_maj",
];

/*
 * ============================================================
 * ENSURE MATCHS SHEETS
 * ============================================================
 *
 * Initialiseur idempotent des onglets du classeur SPORT.
 *
 * Crée (si absents) les onglets Matchs et Affectations_matchs,
 * et écrit leurs en-têtes uniquement lorsqu'ils ne sont pas
 * déjà présents.
 *
 * Ne modifie jamais un onglet existant ni des en-têtes déjà
 * en place : la fonction peut être appelée plusieurs fois
 * sans effet de bord.
 */

function ensureMatchsSheets() {
  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const matchsCreated = ensureSheetWithHeaders(
    sportSpreadsheet,
    SHEETS.MATCHS,
    MATCHS_SHEET_HEADERS,
  );

  const affectationsCreated = ensureSheetWithHeaders(
    sportSpreadsheet,
    SHEETS.AFFECTATIONS_MATCHS,
    AFFECTATIONS_MATCHS_SHEET_HEADERS,
  );

  return {
    success: true,

    Matchs: matchsCreated ? "CREATED" : "EXISTING",

    Affectations_matchs: affectationsCreated ? "CREATED" : "EXISTING",
  };
}

/*
 * ============================================================
 * ENSURE SHEET WITH HEADERS
 * ============================================================
 *
 * Garantit la présence d'un onglet nommé `name` muni des
 * en-têtes `headers`.
 *
 * - Si l'onglet n'existe pas : il est créé et les en-têtes
 *   sont écrits sur la première ligne.
 * - Si l'onglet existe mais est vide (aucun en-tête) : les
 *   en-têtes sont écrits sans toucher au reste.
 * - Si l'onglet existe déjà avec des en-têtes : rien n'est
 *   écrasé.
 *
 * Retourne true si l'onglet a été créé, false sinon.
 */

function ensureSheetWithHeaders(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);

  const created = !sheet;

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  /*
   * On n'écrit les en-têtes que si la première ligne est
   * absente (onglet neuf) ou vide (aucun en-tête déjà posé).
   *
   * getLastColumn() renvoie 0 pour un onglet sans aucun
   * contenu. On ne remplace jamais des en-têtes existants.
   */

  const hasExistingHeaders = sheet.getLastColumn() > 0;

  if (!hasExistingHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return created;
}

/*
 * ============================================================
 * TEST
 * ============================================================
 *
 * Exécutable manuellement depuis l'éditeur Apps Script.
 */

function testEnsureMatchsSheets() {
  const result = ensureMatchsSheets();

  console.log(JSON.stringify(result, null, 2));
}

/*
 * ============================================================
 * GET REQUIRED SHEET
 * ============================================================
 *
 * Retourne l'onglet `name` du classeur `spreadsheet`.
 *
 * Lève une erreur explicite si l'onglet n'existe pas, afin
 * d'éviter les contrôles `if (!sheet) throw` répétés dans
 * chaque lecture/écriture du module.
 */

function getRequiredSheet(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    throw new Error('Onglet "' + name + '" introuvable dans le classeur.');
  }

  return sheet;
}

/*
 * ============================================================
 * FORMAT MATCHS DATE FOR CLIENT
 * ============================================================
 *
 * Convertit une date Sheets en valeur sérialisable pour
 * google.script.run.
 *
 * - Date  → chaîne ISO 8601 (toISOString).
 * - Autre → String(value || "") (vide si valeur falsy).
 */

function formatMatchsDateForClient(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value || "");
}

/*
 * ============================================================
 * NEXT AFFECTATION ID
 * ============================================================
 *
 * Génère le prochain identifiant d'affectation au format
 * AFF-###### (6 chiffres).
 *
 * Scanne les Affectation_id existants au format AFF-\d+,
 * conserve le maximum et retourne max+1 préfixé par AFF-.
 *
 * Retourne "AFF-000001" lorsque aucun identifiant valide
 * n'est présent dans `rows` (même algorithme que
 * getNextArbitreId dans 30_Arbitrage.js).
 */

function getNextAffectationId(rows) {
  let maxNumber = 0;

  rows.forEach((row) => {
    const affectationId = String(row.Affectation_id || "").trim();

    const match = affectationId.match(/^AFF-(\d+)$/);

    if (!match) {
      return;
    }

    const number = Number(match[1]);

    if (number > maxNumber) {
      maxNumber = number;
    }
  });

  return "AFF-" + String(maxNumber + 1).padStart(6, "0");
}

/*
 * ============================================================
 * LOG HISTORIQUE
 * ============================================================
 *
 * Journalise N entrées dans l'onglet Historique du classeur
 * ADHESIONS, au format 9 colonnes partagé avec les autres
 * modules :
 *
 *   [Date, Email, Module, Objet, Reference, Action, Champ,
 *    Ancienne_valeur, Nouvelle_valeur]
 *
 * - Module est figé à "MATCHS".
 * - Email est celui de l'utilisateur autorisé courant,
 *   avec repli sur getCurrentUserEmail (même pattern que
 *   writeAdhesionHistory dans 20_Adhesions.js).
 * - L'horodatage est capturé une seule fois en entrée de
 *   fonction : toutes les lignes d'un même appel partagent
 *   la même Date.
 * - Les champs `oldValue` et `newValue` de chaque entrée
 *   sont rendus via serializeHistoryValue (défini dans
 *   20_Adhesions.js, disponible globalement en Apps Script).
 *   Chaque entrée fournit également `objet`, `reference`,
 *   `action` et `field`.
 *
 * Retour anticipé silencieux si `entries` est vide ou
 * falsy : aucune ouverture de classeur, aucune écriture.
 *
 * L'écriture se fait en un seul setValues pour limiter
 * les appels à l'API Sheets, à la suite de la dernière
 * ligne non vide de l'onglet.
 */

function logHistorique(entries) {
  if (!entries || entries.length === 0) {
    return;
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

  const historySheet = getRequiredSheet(spreadsheet, SHEETS.HISTORIQUE);

  const user = requireAuthorizedUser();

  const email = user.email || getCurrentUserEmail();

  const now = new Date();

  const rows = entries.map((entry) => [
    now,
    email,
    "MATCHS",
    entry.objet,
    entry.reference,
    entry.action,
    entry.field,
    serializeHistoryValue(entry.oldValue),
    serializeHistoryValue(entry.newValue),
  ]);

  historySheet
    .getRange(historySheet.getLastRow() + 1, 1, rows.length, 9)
    .setValues(rows);
}

/*
 * ============================================================
 * GET ACTIVE SAISON
 * ============================================================
 *
 * Retourne la saison active (`Active` normalisé = "oui") lue
 * dans l'onglet Saisons du classeur ADHESIONS.
 *
 * Accès : lecture ouverte à tout utilisateur autorisé
 * (COACH inclus), conforme à l'exigence 9.2.
 *
 * Retourne un objet projeté sur les seuls champs utiles au
 * client :
 *
 *   { Saison_id, Libelle, Active }
 *
 * Retourne `null` lorsque aucune ligne n'a `Active` = "oui" :
 * l'UI invitera alors l'utilisateur à choisir une saison
 * manuellement.
 *
 * Aucune saison n'est codée en dur : la valeur provient
 * exclusivement du Sheet (exigences 1.1, 2.4).
 */

function getActiveSaison() {
  requireAuthorizedUser();

  const adhesionSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

  const saisonsSheet = getRequiredSheet(adhesionSpreadsheet, SHEETS.SAISONS);

  const rows = readSheetAsObjects(saisonsSheet).rows;

  const activeRow = rows.find(
    (row) =>
      String(row.Active || "")
        .trim()
        .toLowerCase() === "oui",
  );

  if (!activeRow) {
    return null;
  }

  return {
    Saison_id: String(activeRow.Saison_id || "").trim(),

    Libelle: String(activeRow.Libelle || "").trim(),

    Active: String(activeRow.Active || "").trim(),
  };
}

/*
 * ============================================================
 * LIST SAISONS
 * ============================================================
 *
 * Retourne toutes les saisons déclarées dans l'onglet Saisons
 * du classeur ADHESIONS, projetées sur `{ Saison_id, Libelle,
 * Active }` et triées par `Saison_id` décroissant (saison la
 * plus récente en tête).
 *
 * Accès : lecture ouverte à tout utilisateur autorisé
 * (COACH inclus) — même garde que `getActiveSaison`.
 *
 * Utilisée par l'UI pour peupler le sélecteur de saison
 * (exigence 2.2) ; permet de consulter les matchs d'une
 * saison antérieure sans dépendre de la saison active.
 */

function listSaisons() {
  requireAuthorizedUser();

  const adhesionSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.ADHESIONS);

  const saisonsSheet = getRequiredSheet(adhesionSpreadsheet, SHEETS.SAISONS);

  const rows = readSheetAsObjects(saisonsSheet).rows;

  const result = rows.map((row) => ({
    Saison_id: String(row.Saison_id || "").trim(),

    Libelle: String(row.Libelle || "").trim(),

    Active: String(row.Active || "").trim(),
  }));

  /*
   * Tri décroissant par Saison_id.
   *
   * Les identifiants de saison suivent le format
   * "AAAA-AAAA" (ex. "2026-2027") : l'ordre lexicographique
   * est équivalent à l'ordre chronologique.
   */

  result.sort((a, b) => String(b.Saison_id).localeCompare(String(a.Saison_id)));

  return result;
}

/*
 * ============================================================
 * LIST MATCHS
 * ============================================================
 *
 * Retourne les matchs d'une saison avec, pour chacun, le
 * nombre d'affectations existantes par rôle.
 *
 * Accès : lecture ouverte à tout utilisateur autorisé
 * (ADMIN, BUREAU, COACH), conforme à l'exigence 9.2.
 *
 * Lecture (classeur SPORT) :
 * - Onglet `Matchs`              → données propres aux matchs.
 * - Onglet `Affectations_matchs` → affectations génériques.
 *
 * Les deux collections sont filtrées sur
 * `Saison_id === saisonId` (exigences 1.2, 1.7, 10.3). Les
 * colonnes sont accédées par nom d'en-tête via
 * `readSheetAsObjects` (exigence 1.3).
 *
 * Pour chaque match, un objet `comptes` est construit avec
 * les clés `{ ARBITRE, OTM, RESPONSABLE_SALLE }` initialisées
 * à 0, puis incrémentées à partir des affectations du match
 * (exigence 1.5). Un `Role` inattendu dans la table est
 * silencieusement ignoré.
 *
 * Les champs `Date` et `Date_maj` sont sérialisés en ISO 8601
 * via `formatMatchsDateForClient` (exigence 1.4). Le tableau
 * retourné est trié par `Date` croissante, les matchs sans
 * date étant renvoyés en fin de liste.
 *
 * Chaque élément retourné conserve les propriétés d'origine
 * du match (projetées sur les en-têtes connus) et porte en
 * plus la clé `comptes`.
 */

function listMatchs(saisonId) {
  requireAuthorizedUser();

  const normalizedSaisonId = String(saisonId || "").trim();

  if (!normalizedSaisonId) {
    throw new Error("saisonId est obligatoire");
  }

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const matchsSheet = getRequiredSheet(sportSpreadsheet, SHEETS.MATCHS);

  const affectationsSheet = getRequiredSheet(
    sportSpreadsheet,
    SHEETS.AFFECTATIONS_MATCHS,
  );

  const matchsRows = readSheetAsObjects(matchsSheet).rows.filter(
    (row) => String(row.Saison_id || "").trim() === normalizedSaisonId,
  );

  const affectationsRows = readSheetAsObjects(affectationsSheet).rows.filter(
    (row) => String(row.Saison_id || "").trim() === normalizedSaisonId,
  );

  /*
   * Index des comptes d'affectations par Match_id.
   *
   * Chaque match reçoit un objet
   * `{ ARBITRE, OTM, RESPONSABLE_SALLE }` initialisé à 0 ;
   * seuls les rôles connus sont comptabilisés (une valeur
   * `Role` inattendue est silencieusement ignorée, les lignes
   * sans `Match_id` sont ignorées).
   */

  const comptesByMatchId = {};

  affectationsRows.forEach((row) => {
    const matchId = String(row.Match_id || "").trim();

    const role = String(row.Role || "").trim();

    if (!matchId) {
      return;
    }

    if (!comptesByMatchId[matchId]) {
      comptesByMatchId[matchId] = {
        ARBITRE: 0,
        OTM: 0,
        RESPONSABLE_SALLE: 0,
      };
    }

    if (comptesByMatchId[matchId][role] !== undefined) {
      comptesByMatchId[matchId][role]++;
    }
  });

  /*
   * Projection des matchs : conservation des propriétés
   * d'origine (projetées sur les en-têtes connus), avec les
   * dates sérialisées en ISO, et ajout du champ `comptes`.
   */

  const result = matchsRows.map((row) => {
    const matchId = String(row.Match_id || "").trim();

    return {
      Match_id: row.Match_id || "",

      Saison_id: row.Saison_id || "",

      Date: formatMatchsDateForClient(row.Date),

      Equipe1: row.Equipe1 || "",

      Equipe2: row.Equipe2 || "",

      Domicile_exterieur: row.Domicile_exterieur || "",

      Categorie: row.Categorie || "",

      Score: row.Score || "",

      Lieu: row.Lieu || "",

      Responsable_salle: row.Responsable_salle || "",

      Date_maj: formatMatchsDateForClient(row.Date_maj),

      comptes: comptesByMatchId[matchId] || {
        ARBITRE: 0,
        OTM: 0,
        RESPONSABLE_SALLE: 0,
      },
    };
  });

  /*
   * Tri par Date croissante.
   *
   * `Date` est déjà sérialisée (ISO 8601 ou chaîne vide) :
   * l'ordre lexicographique correspond à l'ordre
   * chronologique. Les matchs dont la date est vide sont
   * renvoyés en fin de liste pour ne pas polluer la tête du
   * tableau.
   */

  result.sort((a, b) => {
    const dateA = String(a.Date || "");

    const dateB = String(b.Date || "");

    if (!dateA && !dateB) {
      return 0;
    }

    if (!dateA) {
      return 1;
    }

    if (!dateB) {
      return -1;
    }

    return dateA.localeCompare(dateB);
  });

  return result;
}

/*
 * ============================================================
 * GET ARBITRES AFFECTABLES
 * ============================================================
 *
 * Retourne le vivier des arbitres affectables à un match pour
 * la saison demandée.
 *
 * Accès : réservé aux rôles éditeurs (ADMIN, BUREAU), aligné
 * sur le contrôle de droits de `getArbitres` dans
 * 30_Arbitrage.js (exigence 6.1 + principe « contrôle des
 * droits côté serveur » 9.5).
 *
 * Délègue à `getArbitres(saisonId)` (défini dans
 * 30_Arbitrage.js, disponible globalement en Apps Script)
 * pour construire la liste des arbitres de la saison :
 * joueurs évalués, arbitres CLUB et EXTERIEUR confondus.
 *
 * Projection appliquée à chaque arbitre :
 *
 *   {
 *     Personne_id : Arbitre_id,
 *     Nom,
 *     Prenom,
 *     Categorie,
 *     Niveau,
 *     Type,
 *     Saison_id   : saisonId
 *   }
 *
 * Le champ `Personne_id` est l'identité générique utilisée
 * dans la Table_Affectations : pour un arbitre, il s'agit
 * de l'`Arbitre_id` du module Arbitrage (glossaire).
 *
 * Les entrées sans `Arbitre_id` sont ignorées : un joueur
 * dont la ligne Arbitrage n'a pas encore été créée (donc
 * sans identifiant d'arbitre) n'est pas affectable. Cela
 * garantit que chaque `Personne_id` retourné est non vide
 * et référençable dans la Table_Affectations.
 *
 * Chaque élément retourné porte le `Saison_id` demandé
 * (exigence 10.2 : cohérence saisonnière). L'ordre de la
 * liste est celui produit par `getArbitres` (tri par
 * catégorie puis nom / prénom).
 */

function getArbitresAffectables(saisonId) {
  requireRole("ADMIN", "BUREAU");

  const normalizedSaisonId = String(saisonId || "").trim();

  const arbitres = getArbitres(normalizedSaisonId);

  const result = [];

  arbitres.forEach((arbitre) => {
    const arbitreId = String(arbitre.Arbitre_id || "").trim();

    if (!arbitreId) {
      return;
    }

    result.push({
      Personne_id: arbitreId,

      Nom: arbitre.Nom || "",

      Prenom: arbitre.Prenom || "",

      Categorie: arbitre.Categorie || "",

      Niveau: arbitre.Niveau || "",

      Type: arbitre.Type || "",

      Saison_id: normalizedSaisonId,
    });
  });

  return result;
}

/*
 * ============================================================
 * GET OTM AFFECTABLES
 * ============================================================
 *
 * Retourne le vivier des officiels de table (OTM) affectables
 * à un match pour la saison demandée.
 *
 * Accès : lecture ouverte à tout utilisateur autorisé
 * (`requireAuthorizedUser`) — l'UI utilisera ce vivier pour
 * la lecture et pour l'ajout (ce dernier étant lui-même gardé
 * côté `assignAffectation`).
 *
 * Fallback gracieux (exigence 8.7) : le module OTM
 * (50_OTM.js) peut ne pas encore être implémenté au moment
 * où l'écran Matchs s'ouvre.
 *
 * - Si `saisonId` est vide (après trim) : retourne `[]`
 *   immédiatement, sans tenter d'appeler `getOtm`.
 * - Si `getOtm` n'est pas défini comme fonction au scope
 *   global : retourne `[]` sans jeter. L'UI pourra afficher
 *   « Module OTM à venir » et désactiver l'ajout.
 * - Si l'appel à `getOtm` lève une exception (sheet absente,
 *   droits, bug du futur module) : la fonction dégrade
 *   silencieusement en `[]`. L'ouverture de la page matchs
 *   ne doit jamais échouer à cause du vivier OTM.
 *
 * Projection appliquée à chaque OTM :
 *
 *   {
 *     Personne_id,
 *     Nom,
 *     Prenom,
 *     Saison_id : saisonId
 *   }
 *
 * Chaque élément porte le `Saison_id` demandé (cohérence
 * saisonnière, exigence 10.2), de la même manière que
 * `getArbitresAffectables`.
 */

function getOtmAffectables(saisonId) {
  requireAuthorizedUser();

  const normalizedSaisonId = String(saisonId || "").trim();

  if (!normalizedSaisonId) {
    return [];
  }

  if (typeof getOtm !== "function") {
    return [];
  }

  try {
    const otms = getOtm(normalizedSaisonId) || [];

    return otms.map((otm) => ({
      Personne_id: String(otm.Personne_id || "").trim(),

      Nom: otm.Nom || "",

      Prenom: otm.Prenom || "",

      Saison_id: normalizedSaisonId,
    }));
  } catch (error) {
    /*
     * Dégradation gracieuse : toute erreur du module OTM
     * (absence d'onglet, droits insuffisants, bug) est
     * convertie en vivier vide pour ne jamais bloquer
     * l'ouverture de la page matchs (exigence 8.7).
     */

    return [];
  }
}

/*
 * ============================================================
 * ASSERT PERSONNE DANS VIVIER
 * ============================================================
 *
 * Vérifie l'existence d'un `personneId` dans le vivier
 * correspondant au `role` pour la saison demandée. Utilisée
 * par `assignAffectation` pour garantir qu'une affectation
 * ne pointe que vers une personne connue du module source
 * (exigences 6.4, 8.3, 11.4).
 *
 * Validation des entrées (exigences 11.1, 11.2, 11.3) :
 * - `personneId`, `role` et `saisonId` doivent être fournis
 *   et non vides (après trim) ; sinon erreur explicite.
 * - `role` doit appartenir à `AFFECTATION_ROLES` ; sinon
 *   erreur « Rôle d'affectation invalide ».
 *
 * Résolution du vivier selon le rôle :
 * - `ARBITRE` → `getArbitresAffectables(saisonId)`.
 * - `OTM`     → `getOtmAffectables(saisonId)`.
 * - `RESPONSABLE_SALLE` → aucun vivier géré par ce module
 *   (le responsable de salle est un champ texte libre du
 *   match). La fonction retourne sans erreur, conformément
 *   à la section « assignAffectation » du design qui limite
 *   la validation d'existence aux viviers ARBITRE et OTM.
 *
 * Lève une erreur si la personne n'est pas présente dans le
 * vivier résolu, en incluant le rôle, la saison et le
 * `personneId` pour faciliter le diagnostic côté UI.
 */

function assertPersonneDansVivier(personneId, role, saisonId) {
  const normalizedPersonneId = String(personneId || "").trim();

  const normalizedRole = String(role || "")
    .trim()
    .toUpperCase();

  const normalizedSaisonId = String(saisonId || "").trim();

  if (!normalizedPersonneId) {
    throw new Error("Le Personne_id est obligatoire.");
  }

  if (!normalizedRole) {
    throw new Error("Le rôle est obligatoire.");
  }

  if (!normalizedSaisonId) {
    throw new Error("La saison est obligatoire.");
  }

  if (AFFECTATION_ROLES.indexOf(normalizedRole) === -1) {
    throw new Error("Rôle d'affectation invalide : " + normalizedRole);
  }

  /*
   * Chargement du vivier selon le rôle.
   *
   * RESPONSABLE_SALLE n'a pas de vivier dans ce module : le
   * design utilise un champ texte libre sur le match. On
   * retourne sans erreur pour rester cohérent avec la
   * section « assignAffectation » du design doc.
   */

  let vivier;

  if (normalizedRole === "ARBITRE") {
    vivier = getArbitresAffectables(normalizedSaisonId);
  } else if (normalizedRole === "OTM") {
    vivier = getOtmAffectables(normalizedSaisonId);
  } else {
    return;
  }

  const found = (vivier || []).some(
    (personne) =>
      String(personne.Personne_id || "").trim() === normalizedPersonneId,
  );

  if (!found) {
    throw new Error(
      "Personne introuvable dans le vivier " +
        normalizedRole +
        " pour la saison " +
        normalizedSaisonId +
        " : " +
        normalizedPersonneId,
    );
  }
}

/*
 * ============================================================
 * GET MATCH DETAIL
 * ============================================================
 *
 * Retourne le détail d'un match (données propres + liste de
 * ses affectations avec nom affichable résolu).
 *
 * Accès : lecture ouverte à tout utilisateur autorisé
 * (`requireAuthorizedUser`), COACH inclus (exigence 9.2).
 * Les écritures d'édition et d'affectation ont leurs propres
 * gardes `requireRole("ADMIN", "BUREAU")`.
 *
 * Validation (exigences 11.1, 11.2) :
 * - `matchId` doit être fourni et non vide (après trim) ;
 *   sinon erreur explicite.
 *
 * Lecture :
 * - Onglet `Matchs` du classeur SPORT, recherche de la ligne
 *   dont `Match_id === matchId`. Si absente → erreur
 *   « Match introuvable » (exigence 4.3).
 * - Onglet `Affectations_matchs`, filtré sur `Match_id` ET
 *   sur le `Saison_id` du match lui-même (jamais sur une
 *   saison fournie en paramètre) — exigence 10.4.
 *
 * Résolution du nom affichable (exigence 4.2 + fallback
 * 11.4) :
 * - Vivier chargé à la demande, mis en cache par rôle pour
 *   éviter des appels Sheets répétés : chaque vivier n'est
 *   demandé qu'au plus une fois par appel.
 * - Toute erreur de chargement du vivier (ex. COACH qui
 *   n'a pas accès au vivier arbitres via
 *   `getArbitresAffectables`) est dégradée silencieusement
 *   en vivier vide, pour que la consultation du détail
 *   reste accessible même en lecture seule.
 * - DisplayName = `"Prenom Nom"` trimé. Si la personne
 *   n'est pas trouvée dans le vivier, ou si le nom résolu
 *   est vide, repli sur le `Personne_id` brut (exigence
 *   11.4).
 *
 * Sérialisation (exigence 1.4, cohérente avec `listMatchs`) :
 * - `Date` et `Date_maj` du match passent par
 *   `formatMatchsDateForClient` (ISO 8601 ou chaîne vide).
 *
 * Retour :
 *
 *   {
 *     match: {
 *       Match_id, Saison_id, Date, Equipe1, Equipe2,
 *       Domicile_exterieur, Categorie, Score, Lieu,
 *       Responsable_salle, Date_maj
 *     },
 *     affectations: [
 *       { Affectation_id, Personne_id, Role, DisplayName }
 *     ]
 *   }
 */

function getMatchDetail(matchId) {
  requireAuthorizedUser();

  const normalizedMatchId = String(matchId || "").trim();

  if (!normalizedMatchId) {
    throw new Error("Le Match_id est obligatoire.");
  }

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const matchsSheet = getRequiredSheet(sportSpreadsheet, SHEETS.MATCHS);

  const affectationsSheet = getRequiredSheet(
    sportSpreadsheet,
    SHEETS.AFFECTATIONS_MATCHS,
  );

  const matchRow = readSheetAsObjects(matchsSheet).rows.find(
    (row) => String(row.Match_id || "").trim() === normalizedMatchId,
  );

  if (!matchRow) {
    throw new Error("Match introuvable : " + normalizedMatchId);
  }

  const matchSaisonId = String(matchRow.Saison_id || "").trim();

  /*
   * Filtrage strict des affectations sur Match_id ET
   * Saison_id du match (exigence 10.4) : on ne retourne
   * jamais une affectation rattachée à une autre saison,
   * même si elle partage le Match_id (cas théorique mais
   * explicitement couvert par la spécification).
   */

  const affectationsRows = readSheetAsObjects(affectationsSheet).rows.filter(
    (row) =>
      String(row.Match_id || "").trim() === normalizedMatchId &&
      String(row.Saison_id || "").trim() === matchSaisonId,
  );

  /*
   * Viviers chargés paresseusement, au plus une fois par
   * rôle et par appel. Toute erreur (droits, module absent)
   * est dégradée en vivier vide : la résolution de nom
   * retombera alors sur le `Personne_id` brut (exigence
   * 11.4).
   */

  const viviersByRole = {};

  function loadVivierForRole(roleKey) {
    if (viviersByRole[roleKey] !== undefined) {
      return viviersByRole[roleKey];
    }

    try {
      if (roleKey === "ARBITRE") {
        viviersByRole[roleKey] = getArbitresAffectables(matchSaisonId) || [];
      } else if (roleKey === "OTM") {
        viviersByRole[roleKey] = getOtmAffectables(matchSaisonId) || [];
      } else {
        viviersByRole[roleKey] = [];
      }
    } catch (error) {
      viviersByRole[roleKey] = [];
    }

    return viviersByRole[roleKey];
  }

  function resolveDisplayName(personneId, roleKey) {
    const vivier = loadVivierForRole(roleKey);

    const personne = vivier.find(
      (entry) => String(entry.Personne_id || "").trim() === personneId,
    );

    if (!personne) {
      return personneId;
    }

    const displayName = (
      String(personne.Prenom || "").trim() +
      " " +
      String(personne.Nom || "").trim()
    ).trim();

    return displayName || personneId;
  }

  const affectations = affectationsRows.map((row) => {
    const personneId = String(row.Personne_id || "").trim();

    const roleKey = String(row.Role || "")
      .trim()
      .toUpperCase();

    return {
      Affectation_id: row.Affectation_id || "",

      Personne_id: personneId,

      Role: roleKey,

      DisplayName: resolveDisplayName(personneId, roleKey),
    };
  });

  return {
    match: {
      Match_id: matchRow.Match_id || "",

      Saison_id: matchRow.Saison_id || "",

      Date: formatMatchsDateForClient(matchRow.Date),

      Equipe1: matchRow.Equipe1 || "",

      Equipe2: matchRow.Equipe2 || "",

      Domicile_exterieur: matchRow.Domicile_exterieur || "",

      Categorie: matchRow.Categorie || "",

      Score: matchRow.Score || "",

      Lieu: matchRow.Lieu || "",

      Responsable_salle: matchRow.Responsable_salle || "",

      Date_maj: formatMatchsDateForClient(matchRow.Date_maj),
    },

    affectations: affectations,
  };
}

/*
 * ============================================================
 * UPDATE MATCH
 * ============================================================
 *
 * Modifie les données propres d'un match (lieu, score,
 * responsable de salle, etc.) sous verrou LockService.
 *
 * Accès : réservé aux rôles éditeurs (ADMIN, BUREAU). Le
 * contrôle est appliqué en premier (exigences 5.1, 5.2, 9.5).
 *
 * Champs modifiables :
 *   Date, Equipe1, Equipe2, Domicile_exterieur, Categorie,
 *   Score, Lieu, Responsable_salle.
 *
 * Les identifiants (`Match_id`, `Saison_id`) ne sont jamais
 * modifiables : la fiche d'un match reste rattachée à sa
 * saison d'origine (cohérence saisonnière, exigence 10.1).
 * Seuls les champs présents dans `payload` (via
 * `hasOwnProperty`) sont pris en compte : un champ absent
 * du payload conserve sa valeur courante.
 *
 * Validation (avant acquisition du verrou) :
 * - `payload.Match_id` doit être fourni et non vide
 *   (exigences 5.3, 11.1, 11.2) ; sinon erreur explicite.
 * - Si `payload.Lieu` est fourni et non vide : doit
 *   appartenir à `MATCHS_LIEUX` (exigence 5.4) ; sinon
 *   erreur « Lieu invalide ».
 * - Si `payload.Categorie` est fournie et non vide : doit
 *   appartenir à `MATCHS_CATEGORIES` (exigence 5.5) ; sinon
 *   erreur « Catégorie invalide ».
 * - Une valeur vide pour `Lieu` ou `Categorie` est acceptée
 *   (effacement explicite d'un champ facultatif).
 *
 * Verrou + relecture (exigence 5.6) :
 * - `LockService.getScriptLock().waitLock(30000)` avant la
 *   lecture, afin que toute écriture concurrente achève sa
 *   transaction avant que nous ne relisions.
 * - La table `Matchs` est relue sous verrou via
 *   `readSheetAsObjects` pour obtenir les valeurs les plus
 *   récentes (pas de « vue périmée » entre validation et
 *   écriture).
 * - `releaseLock()` est appelé dans un `finally`.
 *
 * Comparaison champ par champ via `normalizeHistoryValue`
 * (exigence 5.9, idempotence) :
 * - Les dates sont normalisées en `getTime()`, les autres
 *   valeurs en chaîne trimée.
 * - Si aucun champ ne diffère après normalisation : retour
 *   `{ success: true, action: "UNCHANGED", Match_id }` sans
 *   écrire ni journaliser.
 *
 * Normalisation des valeurs appliquées :
 * - Pour `Date` : si le payload fournit une chaîne non vide,
 *   on tente `new Date(string)` ; si la date est valide, on
 *   écrit l'instance `Date` dans la cellule (préserve le
 *   format Date de Sheets). Chaîne vide → cellule vide.
 * - Pour les autres champs texte : trim avant écriture pour
 *   garder la feuille propre (même esprit que
 *   `updateArbitreExterne`).
 *
 * Écriture et traçabilité :
 * - `Date_maj = new Date()` au moment de l'écriture
 *   (exigence 5.7). Non journalisé (métadonnée technique).
 * - Réécriture complète de l'onglet via `writeObjectsToSheet`
 *   (même pattern que les autres écritures du dépôt).
 * - `logHistorique` : une entrée par champ réellement
 *   modifié, avec `Objet = "MATCH"`, `Reference = Match_id`
 *   et `Action = "MODIFICATION"` (exigences 12.1, 12.2).
 *
 * Retour (exigence 5.8) :
 *
 *   { success: true, action: "UPDATED" | "UNCHANGED", Match_id }
 */

function updateMatch(payload) {
  requireRole("ADMIN", "BUREAU");

  payload = payload || {};

  const matchId = String(payload.Match_id || "").trim();

  if (!matchId) {
    throw new Error("Le Match_id est obligatoire.");
  }

  /*
   * Validation des ensembles autorisés (avant verrou).
   *
   * Un champ absent du payload n'est pas validé ; une
   * valeur vide est acceptée (effacement explicite). Une
   * valeur non vide hors ensemble lève une erreur.
   */

  const hasLieu = Object.prototype.hasOwnProperty.call(payload, "Lieu");

  const lieuValue = hasLieu
    ? String(payload.Lieu == null ? "" : payload.Lieu).trim()
    : "";

  if (hasLieu && lieuValue && MATCHS_LIEUX.indexOf(lieuValue) === -1) {
    throw new Error("Lieu invalide : " + lieuValue);
  }

  const hasCategorie = Object.prototype.hasOwnProperty.call(
    payload,
    "Categorie",
  );

  const categorieValue = hasCategorie
    ? String(payload.Categorie == null ? "" : payload.Categorie).trim()
    : "";

  if (
    hasCategorie &&
    categorieValue &&
    MATCHS_CATEGORIES.indexOf(categorieValue) === -1
  ) {
    throw new Error("Catégorie invalide : " + categorieValue);
  }

  /*
   * Liste blanche des champs modifiables (exigence 5 +
   * cohérence saisonnière 10.1 : Match_id et Saison_id sont
   * explicitement exclus).
   */

  const WRITABLE_FIELDS = [
    "Date",
    "Equipe1",
    "Equipe2",
    "Domicile_exterieur",
    "Categorie",
    "Score",
    "Lieu",
    "Responsable_salle",
  ];

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const matchsSheet = getRequiredSheet(sportSpreadsheet, SHEETS.MATCHS);

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    /*
     * Relecture sous verrou : garantit que la comparaison
     * champ par champ et l'écriture utilisent les valeurs
     * les plus récentes de la feuille.
     */

    const data = readSheetAsObjects(matchsSheet);

    const headers = data.headers;

    const rows = data.rows;

    const matchRow = rows.find(
      (row) => String(row.Match_id || "").trim() === matchId,
    );

    if (!matchRow) {
      throw new Error("Match introuvable : " + matchId);
    }

    /*
     * Détection des changements. Un champ n'est considéré
     * que s'il est présent dans le payload (hasOwnProperty) :
     * un champ absent conserve sa valeur courante.
     *
     * `normalizeHistoryValue` rend comparables un `Date`
     * côté feuille et une chaîne ISO côté payload parsée en
     * `Date` : les deux sont ramenés à `getTime()`.
     */

    const changes = [];

    WRITABLE_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) {
        return;
      }

      const oldValue = matchRow[field];

      let newValue = payload[field];

      /*
       * Normalisation côté écriture :
       * - Date : ISO string → Date instance ; vide → "".
       * - Autres : trim de la chaîne pour écriture propre.
       */

      if (field === "Date") {
        if (newValue instanceof Date) {
          // conserver tel quel
        } else if (typeof newValue === "string") {
          const trimmed = newValue.trim();

          if (!trimmed) {
            newValue = "";
          } else {
            const parsed = new Date(trimmed);

            if (!isNaN(parsed.getTime())) {
              newValue = parsed;
            } else {
              newValue = trimmed;
            }
          }
        } else if (newValue == null) {
          newValue = "";
        }
      } else {
        newValue = String(newValue == null ? "" : newValue).trim();
      }

      if (normalizeHistoryValue(oldValue) === normalizeHistoryValue(newValue)) {
        return;
      }

      changes.push({
        field: field,

        oldValue: oldValue,

        newValue: newValue,
      });
    });

    /*
     * Idempotence : aucun champ ne change après
     * normalisation → on ne touche ni la feuille ni
     * l'historique (exigence 5.9).
     */

    if (changes.length === 0) {
      return {
        success: true,

        action: "UNCHANGED",

        Match_id: matchId,
      };
    }

    /*
     * Application des changements, horodatage automatique
     * de Date_maj (exigence 5.7) et réécriture complète.
     */

    changes.forEach((change) => {
      matchRow[change.field] = change.newValue;
    });

    matchRow.Date_maj = new Date();

    writeObjectsToSheet(matchsSheet, headers, rows);

    /*
     * Journalisation : une entrée par champ réellement
     * modifié (exigences 12.1, 12.2). `Date_maj` n'est pas
     * journalisée : il s'agit d'une métadonnée technique
     * commune à toute modification.
     */

    logHistorique(
      changes.map((change) => ({
        objet: "MATCH",

        reference: matchId,

        action: "MODIFICATION",

        field: change.field,

        oldValue: change.oldValue,

        newValue: change.newValue,
      })),
    );

    return {
      success: true,

      action: "UPDATED",

      Match_id: matchId,
    };
  } finally {
    lock.releaseLock();
  }
}

/*
 * ============================================================
 * ASSIGN AFFECTATION
 * ============================================================
 *
 * Crée une affectation (arbitre, OTM, responsable de salle)
 * d'une personne sur un match, sous verrou LockService.
 *
 * Accès : réservé aux rôles éditeurs (ADMIN, BUREAU). Le
 * contrôle est appliqué en premier (exigences 6.2, 8.2, 9.5).
 *
 * Validation des entrées (exigences 11.1, 11.2, 11.3) :
 * - `matchId`, `personneId` et `role` doivent être fournis
 *   et non vides (après trim) ; sinon erreur explicite.
 * - `role` est normalisé en majuscules et doit appartenir à
 *   `AFFECTATION_ROLES` ; sinon erreur « Rôle d'affectation
 *   invalide ».
 *
 * Vérifications d'existence (exigences 6.3, 6.4, 8.3, 11.4) :
 * - Le match doit exister dans l'onglet `Matchs` du classeur
 *   SPORT ; sinon erreur « Match introuvable ». Le
 *   `Saison_id` de l'affectation est hérité du match
 *   (exigences 10.1, 10.2 : cohérence saisonnière, jamais de
 *   saison codée en dur ni fournie par l'appelant).
 * - La personne doit être présente dans le vivier du rôle
 *   pour la saison du match. Déléguée à
 *   `assertPersonneDansVivier`, qui lève une erreur sinon.
 *   Pour `RESPONSABLE_SALLE`, aucun vivier n'est géré par ce
 *   module : la validation est un no-op (le responsable de
 *   salle est un champ texte libre côté `updateMatch` ; cette
 *   branche reste disponible pour les cas où l'UI
 *   déciderait d'affecter une personne du vivier à ce rôle).
 *
 * Verrou + relecture (exigences 6.7, 8.4) :
 * - `LockService.getScriptLock().waitLock(30000)` avant la
 *   lecture, afin que toute écriture concurrente achève sa
 *   transaction avant que nous ne relisions.
 * - La table `Affectations_matchs` est relue sous verrou
 *   via `readSheetAsObjects` pour :
 *     1. détecter correctement un doublon créé entre notre
 *        validation initiale et notre écriture ;
 *     2. calculer `getNextAffectationId` sur l'état le plus
 *        récent de la feuille.
 * - `releaseLock()` est appelé dans un `finally`.
 *
 * Idempotence (exigences 6.6, 8.5) :
 * - Si une ligne existe déjà avec le même triplet fonctionnel
 *   `(Match_id, Personne_id, Role)`, aucune nouvelle ligne
 *   n'est écrite et aucun historique n'est généré.
 * - Le retour reprend l'`Affectation_id` existant pour
 *   permettre à l'UI de rafraîchir sans ambiguïté.
 *
 * Écriture et traçabilité :
 * - Génération d'un `Affectation_id` au format
 *   `AFF-######` via `getNextAffectationId` (exigence 11.5),
 *   calculé sur les lignes relues sous verrou.
 * - Ligne complète écrite : `Affectation_id, Saison_id,
 *   Match_id, Personne_id, Role, Date_maj` (exigences 6.5,
 *   8.4, 10.1, 10.2). `Date_maj = new Date()` horodate la
 *   création.
 * - Réécriture complète de l'onglet via
 *   `writeObjectsToSheet` (même pattern que les autres
 *   écritures du dépôt).
 * - `logHistorique` : une entrée `Objet = "AFFECTATION"`,
 *   `Reference = Affectation_id`, `Action = "CREATION"` et
 *   `Champ = "Role"` (ancienne valeur vide, nouvelle valeur
 *   = rôle créé) — exigences 12.1, 12.2.
 *
 * Retour :
 *
 *   {
 *     success: true,
 *     action: "CREATED" | "ALREADY_EXISTS",
 *     Affectation_id, Match_id, Personne_id, Role
 *   }
 */

function assignAffectation(matchId, personneId, role) {
  requireRole("ADMIN", "BUREAU");

  const normalizedMatchId = String(matchId || "").trim();

  const normalizedPersonneId = String(personneId || "").trim();

  const normalizedRole = String(role || "")
    .trim()
    .toUpperCase();

  if (!normalizedMatchId) {
    throw new Error("Le Match_id est obligatoire.");
  }

  if (!normalizedPersonneId) {
    throw new Error("Le Personne_id est obligatoire.");
  }

  if (!normalizedRole) {
    throw new Error("Le rôle est obligatoire.");
  }

  if (AFFECTATION_ROLES.indexOf(normalizedRole) === -1) {
    throw new Error("Rôle d'affectation invalide : " + normalizedRole);
  }

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const matchsSheet = getRequiredSheet(sportSpreadsheet, SHEETS.MATCHS);

  /*
   * Résolution du match (hors verrou) : on lit la table
   * `Matchs` pour vérifier l'existence et récupérer le
   * `Saison_id` de rattachement. Cette lecture ne nécessite
   * pas d'être sous verrou — le `Saison_id` d'un match ne
   * change pas (champ non modifiable par `updateMatch`), et
   * la seule exigence de concurrence porte sur la table
   * `Affectations_matchs` que nous relirons sous verrou plus
   * bas.
   */

  const matchRow = readSheetAsObjects(matchsSheet).rows.find(
    (row) => String(row.Match_id || "").trim() === normalizedMatchId,
  );

  if (!matchRow) {
    throw new Error("Match introuvable : " + normalizedMatchId);
  }

  const saisonId = String(matchRow.Saison_id || "").trim();

  /*
   * Vérification de la personne dans le vivier correspondant
   * au rôle, pour la saison du match. Déléguée à
   * `assertPersonneDansVivier` qui applique aussi les
   * validations de présence/rôle valides (défense en
   * profondeur avec les contrôles ci-dessus).
   */

  assertPersonneDansVivier(normalizedPersonneId, normalizedRole, saisonId);

  const affectationsSheet = getRequiredSheet(
    sportSpreadsheet,
    SHEETS.AFFECTATIONS_MATCHS,
  );

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    /*
     * Relecture sous verrou : garantit que la détection de
     * doublon et la génération d'`Affectation_id` utilisent
     * l'état le plus récent de la feuille.
     */

    const data = readSheetAsObjects(affectationsSheet);

    const headers = data.headers;

    const rows = data.rows;

    const existing = rows.find(
      (row) =>
        String(row.Match_id || "").trim() === normalizedMatchId &&
        String(row.Personne_id || "").trim() === normalizedPersonneId &&
        String(row.Role || "")
          .trim()
          .toUpperCase() === normalizedRole,
    );

    /*
     * Idempotence : triplet fonctionnel déjà présent → on
     * ne crée pas de doublon et on ne journalise pas. Le
     * retour reprend l'`Affectation_id` existant pour que
     * l'UI puisse rafraîchir sans ambiguïté.
     */

    if (existing) {
      return {
        success: true,

        action: "ALREADY_EXISTS",

        Affectation_id: String(existing.Affectation_id || "").trim(),

        Match_id: normalizedMatchId,

        Personne_id: normalizedPersonneId,

        Role: normalizedRole,
      };
    }

    const affectationId = getNextAffectationId(rows);

    const now = new Date();

    rows.push({
      Affectation_id: affectationId,

      Saison_id: saisonId,

      Match_id: normalizedMatchId,

      Personne_id: normalizedPersonneId,

      Role: normalizedRole,

      Date_maj: now,
    });

    writeObjectsToSheet(affectationsSheet, headers, rows);

    logHistorique([
      {
        objet: "AFFECTATION",

        reference: affectationId,

        action: "CREATION",

        field: "Role",

        oldValue: "",

        newValue: normalizedRole,
      },
    ]);

    return {
      success: true,

      action: "CREATED",

      Affectation_id: affectationId,

      Match_id: normalizedMatchId,

      Personne_id: normalizedPersonneId,

      Role: normalizedRole,
    };
  } finally {
    lock.releaseLock();
  }
}

/*
 * ============================================================
 * REMOVE AFFECTATION
 * ============================================================
 *
 * Retire une affectation existante par son `Affectation_id`,
 * sous verrou LockService.
 *
 * Accès : réservé aux rôles éditeurs (ADMIN, BUREAU). Le
 * contrôle est appliqué en premier (exigences 7.1, 8.6, 9.5).
 *
 * Validation des entrées (exigences 11.1, 11.2) :
 * - `affectationId` doit être fourni et non vide (après
 *   trim) ; sinon erreur explicite. Appliquée avant toute
 *   acquisition de verrou pour échouer vite.
 *
 * Verrou + relecture (exigence 7.4) :
 * - `LockService.getScriptLock().waitLock(30000)` avant la
 *   lecture, afin que toute écriture concurrente achève sa
 *   transaction avant que nous ne relisions.
 * - La table `Affectations_matchs` est relue sous verrou
 *   via `readSheetAsObjects` pour détecter correctement
 *   une suppression intervenue entre un appel précédent et
 *   le nôtre (idempotence sans faux positif).
 * - `releaseLock()` est appelé dans un `finally`.
 *
 * Idempotence (exigence 7.3) :
 * - Si aucune ligne ne porte l'`Affectation_id` demandé,
 *   aucune écriture ni journalisation n'a lieu. Retour
 *   `{ success: true, action: "ALREADY_ABSENT", Affectation_id }`
 *   sans erreur.
 *
 * Suppression (exigence 7.2) :
 * - Ligne trouvée → `splice` dans le tableau `rows`,
 *   réécriture complète via `writeObjectsToSheet` (même
 *   pattern que les autres écritures du dépôt).
 * - `logHistorique` : une entrée symétrique de la création
 *   produite par `assignAffectation`, avec
 *   `Objet = "AFFECTATION"`, `Reference = Affectation_id`,
 *   `Action = "SUPPRESSION"`, `Champ = "Role"`, ancienne
 *   valeur = rôle supprimé, nouvelle valeur vide
 *   (exigences 12.1, 12.2).
 *
 * Retour (exigence 7.5) :
 *
 *   { success: true, action: "DELETED" | "ALREADY_ABSENT", Affectation_id }
 */

function removeAffectation(affectationId) {
  requireRole("ADMIN", "BUREAU");

  const normalizedAffectationId = String(affectationId || "").trim();

  if (!normalizedAffectationId) {
    throw new Error("L'Affectation_id est obligatoire.");
  }

  const sportSpreadsheet = SpreadsheetApp.openById(SPREADSHEETS.SPORT);

  const affectationsSheet = getRequiredSheet(
    sportSpreadsheet,
    SHEETS.AFFECTATIONS_MATCHS,
  );

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    /*
     * Relecture sous verrou : garantit que la détection de
     * la ligne et sa suppression utilisent l'état le plus
     * récent de la feuille (exigence 7.4).
     */

    const data = readSheetAsObjects(affectationsSheet);

    const headers = data.headers;

    const rows = data.rows;

    const index = rows.findIndex(
      (row) =>
        String(row.Affectation_id || "").trim() === normalizedAffectationId,
    );

    /*
     * Idempotence : ligne absente → retour explicite sans
     * écriture ni historique (exigence 7.3).
     */

    if (index === -1) {
      return {
        success: true,

        action: "ALREADY_ABSENT",

        Affectation_id: normalizedAffectationId,
      };
    }

    const removedRow = rows[index];

    const removedRole = String(removedRow.Role || "")
      .trim()
      .toUpperCase();

    rows.splice(index, 1);

    writeObjectsToSheet(affectationsSheet, headers, rows);

    logHistorique([
      {
        objet: "AFFECTATION",

        reference: normalizedAffectationId,

        action: "SUPPRESSION",

        field: "Role",

        oldValue: removedRole,

        newValue: "",
      },
    ]);

    return {
      success: true,

      action: "DELETED",

      Affectation_id: normalizedAffectationId,
    };
  } finally {
    lock.releaseLock();
  }
}

/*
 * ============================================================
 * TESTS
 * ============================================================
 *
 * Exécutables manuellement depuis l'éditeur Apps Script.
 */

function testGetActiveSaison() {
  const saison = getActiveSaison();

  console.log(JSON.stringify(saison, null, 2));
}

function testListSaisons() {
  const saisons = listSaisons();

  console.log(JSON.stringify(saisons, null, 2));
}

function testListMatchs() {
  const saison = getActiveSaison();

  if (!saison) {
    console.log("Aucune saison active.");

    return;
  }

  const matchs = listMatchs(saison.Saison_id);

  console.log("Saison : " + saison.Saison_id);

  console.log("Nombre de matchs : " + matchs.length);

  console.log(JSON.stringify(matchs.slice(0, 5), null, 2));
}
