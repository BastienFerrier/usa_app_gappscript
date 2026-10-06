/**
 * Retourne toutes les données nécessaires
 * au module Planning.
 */
function getPlanningData() {
  requireAuthorizedUser();

  const entrainementsRaw = getSheetData("SPORT", "Entrainements");

  const disponibilitesRaw = getSheetData("SPORT", "Gymnase_dispo");

  const gymnasesRaw = getSheetData("SPORT", "Gymnases");

  const couleursEquipesRaw = getSheetData("SPORT", "equipes_couleurs");

  const entraineursRaw = getSheetData("SPORT", "Entraineurs");

  // ... le reste de la fonction ne change pas

  /*
   * ENTRAINEMENTS
   */

  const entrainements = entrainementsRaw

    .filter(
      (item) =>
        item["Jour"] &&
        item["Heure début"] &&
        item["Heure fin"] &&
        item["Lieu"],
    )

    .map((item) => ({
      reference: item["Référence"] ? item["Référence"].toString().trim() : "",

      equipe: item["Equipe"] ? item["Equipe"].toString().trim() : "",

      jour: normalizeDay(item["Jour"]),

      debut: parseTime(item["Heure début"]),

      fin: parseTime(item["Heure fin"]),

      lieu: item["Lieu"] ? item["Lieu"].toString().trim() : "",

      entraineur: item["Entraineur"]
        ? item["Entraineur"].toString().trim()
        : "",
    }));

  /*
   * DISPONIBILITES GYMNASES
   */

  const disponibilites = disponibilitesRaw

    .filter((item) => item["Jour"] && item["heure début"] && item["heure fin"])

    .map((item) => ({
      lieu: item["Référence"] ? item["Référence"].toString().trim() : "",

      jour: normalizeDay(item["Jour"]),

      debut: parseTime(item["heure début"]),

      fin: parseTime(item["heure fin"]),
    }));

  /*
   * GYMNASES
   */

  const gymnases = gymnasesRaw

    .filter(
      (item) =>
        item["Référence"] &&
        item["Nom"] &&
        item["Actif"] &&
        item["Actif"].toString().trim().toLowerCase() === "oui",
    )

    .map((item) => ({
      reference: item["Référence"].toString().trim(),

      nom: item["Nom"].toString().trim(),
    }));

  /*
   * COULEURS EQUIPES
   */

  const couleursEquipes = couleursEquipesRaw

    .filter((item) => item["Equipe"])

    .map((item) => ({
      equipe: item["Equipe"].toString().trim(),

      couleurFond: item["Couleur_fond"]
        ? item["Couleur_fond"].toString().trim()
        : "",

      couleurTexte: item["Couleur_texte"]
        ? item["Couleur_texte"].toString().trim()
        : "",
    }));

  /*
   * ENTRAINEURS
   */

  const entraineurs = entraineursRaw

    .filter(
      (item) =>
        item["Référence"] &&
        item["Actif"] &&
        item["Actif"].toString().trim().toLowerCase() === "oui",
    )

    .map((item) => ({
      reference: item["Référence"].toString().trim(),

      nom: item["Nom"] ? item["Nom"].toString().trim() : "",

      prenom: item["Prénom"] ? item["Prénom"].toString().trim() : "",
    }));

  return {
    entrainements: entrainements,

    disponibilites: disponibilites,

    gymnases: gymnases,

    couleursEquipes: couleursEquipes,

    entraineurs: entraineurs,
  };
}

/**
 * Test depuis Apps Script.
 */
function testPlanningData() {
  const data = getPlanningData();

  console.log(JSON.stringify(data, null, 2));
}
