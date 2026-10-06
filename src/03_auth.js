/**
 * Retourne l'identité Google
 * de l'utilisateur connecté.
 */
function getCurrentUserEmail() {
  const user = Session.getActiveUser();

  if (!user) {
    return "";
  }

  return user.getEmail().toString().trim().toLowerCase();
}

/**
 * Retourne l'utilisateur de l'application
 * correspondant au compte Google connecté.
 */
function getCurrentUser() {
  const email = getCurrentUserEmail();

  if (!email) {
    return {
      authenticated: false,
      authorized: false,
      email: "",
      nom: "",
      prenom: "",
      role: "",
    };
  }

  const utilisateurs = getSheetData("ADMINISTRATION", "Utilisateurs");

  const utilisateur = utilisateurs.find((item) => {
    const itemEmail = item["Email"]
      ? item["Email"].toString().trim().toLowerCase()
      : "";

    const actif = item["Actif"]
      ? item["Actif"].toString().trim().toLowerCase()
      : "";

    return itemEmail === email && actif === "oui";
  });

  /*
   * Compte Google identifié
   * mais absent de la liste
   * des utilisateurs autorisés.
   */

  if (!utilisateur) {
    return {
      authenticated: true,
      authorized: false,
      email: email,
      nom: "",
      prenom: "",
      role: "",
    };
  }

  /*
   * Utilisateur autorisé.
   */

  return {
    authenticated: true,

    authorized: true,

    email: email,

    nom: utilisateur["Nom"] ? utilisateur["Nom"].toString().trim() : "",

    prenom: utilisateur["Prenom"]
      ? utilisateur["Prenom"].toString().trim()
      : "",

    role: utilisateur["Role"]
      ? utilisateur["Role"].toString().trim().toUpperCase()
      : "",
  };
}

/**
 * Vérifie que l'utilisateur connecté
 * est autorisé à utiliser l'application.
 *
 * Retourne l'utilisateur si autorisé.
 * Sinon lève une erreur.
 */
function requireAuthorizedUser() {
  const user = getCurrentUser();

  if (!user.authenticated) {
    throw new Error("Impossible d'identifier votre compte Google.");
  }

  if (!user.authorized) {
    throw new Error("Vous n'êtes pas autorisé à accéder à cette application.");
  }

  return user;
}

/**
 * Vérifie que l'utilisateur connecté
 * possède l'un des rôles autorisés.
 *
 * Exemple :
 * requireRole("ADMIN");
 *
 * ou :
 * requireRole("ADMIN", "BUREAU");
 */
function requireRole(...allowedRoles) {
  const user = requireAuthorizedUser();

  const normalizedRoles = allowedRoles.map((role) =>
    role.toString().trim().toUpperCase(),
  );

  if (!normalizedRoles.includes(user.role)) {
    throw new Error(
      "Vous n'avez pas les droits nécessaires pour effectuer cette action.",
    );
  }

  return user;
}

/**
 * Test depuis l'éditeur Apps Script.
 */
function testCurrentUser() {
  const user = getCurrentUser();

  console.log(JSON.stringify(user, null, 2));
}
