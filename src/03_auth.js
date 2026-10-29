/**
 * Retourne l'identité Google de l'utilisateur connecté.
 */
function getCurrentUserEmail() {
  const user = Session.getActiveUser();

  if (!user) {
    return "";
  }

  return user.getEmail().toString().trim().toLowerCase();
}

function getApplicationGroupsForUser(userId, email) {
  let rows = [];

  try {
    rows = getSheetData("ADMINISTRATION", SHEETS.UTILISATEURS_GROUPES);
  } catch (error) {
    return [];
  }

  return rows
    .filter((row) => {
      const rowUserId = String(row.Utilisateur_id || "").trim();
      const rowEmail = String(row.Email || "")
        .trim()
        .toLowerCase();
      const actif = String(row.Actif || "")
        .trim()
        .toLowerCase();

      return (
        actif === "oui" &&
        ((userId && rowUserId === userId) || (email && rowEmail === email))
      );
    })
    .map((row) =>
      String(row.Groupe_code || "")
        .trim()
        .toUpperCase(),
    )
    .filter((group) => ACCESS_GROUPS.includes(group));
}

function getPermissionsForGroups(groups) {
  const permissions = new Set();

  groups.forEach((group) => {
    (APP_GROUP_PERMISSIONS[group] || []).forEach((permission) => {
      permissions.add(permission);
    });
  });

  Array.from(permissions).forEach((permission) => {
    if (permission.endsWith("_WRITE")) {
      permissions.add(permission.replace(/_WRITE$/, "_READ"));
    }
  });

  return Array.from(permissions).sort();
}

function hasPermission(user, permission) {
  if (!user || !user.authorized) {
    return false;
  }

  const normalizedPermission = String(permission || "")
    .trim()
    .toUpperCase();

  return (
    user.groups?.includes("ADMIN") ||
    user.permissions?.includes(normalizedPermission)
  );
}

/**
 * Retourne l'utilisateur applicatif avec ses groupes et permissions.
 *
 * La colonne Role est conservée temporairement pour permettre la
 * migration progressive des comptes existants.
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
      groups: [],
      permissions: [],
    };
  }

  const utilisateurs = getSheetData("ADMINISTRATION", "Utilisateurs");
  const utilisateur = utilisateurs.find((item) => {
    const itemEmail = String(item.Email || "")
      .trim()
      .toLowerCase();
    const actif = String(item.Actif || "")
      .trim()
      .toLowerCase();

    return itemEmail === email && actif === "oui";
  });

  if (!utilisateur) {
    return {
      authenticated: true,
      authorized: false,
      email: email,
      nom: "",
      prenom: "",
      role: "",
      groups: [],
      permissions: [],
    };
  }

  const userId = String(utilisateur.Utilisateur_id || "").trim();
  let groups = getApplicationGroupsForUser(userId, email);
  const legacyRole = String(utilisateur.Role || "")
    .trim()
    .toUpperCase();

  // Compatibilité de migration : les anciens ADMIN/COACH continuent
  // à fonctionner tant qu'ils n'ont pas encore été migrés vers la table
  // Utilisateurs_Groupes.
  if (groups.length === 0 && ACCESS_GROUPS.includes(legacyRole)) {
    groups = [legacyRole];
  }

  const permissions = getPermissionsForGroups(groups);

  return {
    authenticated: true,
    authorized: true,
    email: email,
    nom: String(utilisateur.Nom || "").trim(),
    prenom: String(utilisateur.Prenom || "").trim(),
    role: legacyRole || groups[0] || "",
    groups: groups,
    permissions: permissions,
  };
}

/**
 * Vérifie que l'utilisateur connecté est autorisé.
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
 * Vérifie une permission applicative.
 */
function requirePermission(permission) {
  const user = requireAuthorizedUser();

  if (!hasPermission(user, permission)) {
    throw new Error(
      "Vous n'avez pas les droits nécessaires pour effectuer cette action.",
    );
  }

  return user;
}

/**
 * Compatibilité temporaire avec les anciens contrôles par rôle.
 */
function requireRole(...allowedRoles) {
  const user = requireAuthorizedUser();
  const normalizedRoles = allowedRoles.map((role) =>
    role.toString().trim().toUpperCase(),
  );

  if (
    normalizedRoles.some(
      (role) => user.role === role || user.groups?.includes(role),
    )
  ) {
    return user;
  }

  throw new Error(
    "Vous n'avez pas les droits nécessaires pour effectuer cette action.",
  );
}

function testCurrentUser() {
  const user = getCurrentUser();
  console.log(JSON.stringify(user, null, 2));
}
