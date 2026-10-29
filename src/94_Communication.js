/**
 * =========================
 * COMMUNICATION
 * =========================
 */

function getCommunicationCategories(saisonId) {
  requirePermission("COMMUNICATION");

  const normalizedSaisonId = String(saisonId || "").trim();

  if (!normalizedSaisonId) {
    throw new Error("Saison Communication manquante.");
  }

  const spreadsheet = getSpreadsheet("ADHESIONS");

  const adhesionsSheet = spreadsheet.getSheetByName("Adhesions");

  if (!adhesionsSheet) {
    throw new Error("Onglet Adhesions introuvable.");
  }

  ensureAdhesionStatusColumn(adhesionsSheet);

  const categories = new Set();

  readSheetAsObjects(adhesionsSheet)
    .rows.filter(
      (adhesion) =>
        String(adhesion.Saison_id || "").trim() === normalizedSaisonId &&
        String(adhesion.Statut_adhesion || "ACTIVE").trim() !== "ANNULEE",
    )
    .forEach((adhesion) => {
      const category = String(adhesion.Categorie || "").trim();

      if (category) {
        categories.add(category);
      }
    });

  return Array.from(categories).sort((a, b) =>
    a.localeCompare(b, "fr", { numeric: true }),
  );
}

function getCommunicationRecipients(saisonId, categories) {
  requirePermission("COMMUNICATION");

  const normalizedSaisonId = String(saisonId || "").trim();

  if (!normalizedSaisonId) {
    throw new Error("Saison Communication manquante.");
  }

  const selectedCategories = Array.isArray(categories)
    ? categories.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  const spreadsheet = getSpreadsheet("ADHESIONS");

  const contactsSheet = spreadsheet.getSheetByName("Contacts");

  const adhesionsSheet = spreadsheet.getSheetByName("Adhesions");

  const importSheet = spreadsheet.getSheetByName("Import_Assoconnect");

  if (!contactsSheet) {
    throw new Error("Onglet Contacts introuvable.");
  }

  if (!adhesionsSheet) {
    throw new Error("Onglet Adhesions introuvable.");
  }

  ensureAdhesionStatusColumn(adhesionsSheet);

  const contactsById = {};

  readSheetAsObjects(contactsSheet).rows.forEach((contact) => {
    const contactId = String(contact.Contact_id || "").trim();

    if (contactId) {
      contactsById[contactId] = contact;
    }
  });

  const assoById = {};

  if (importSheet) {
    readSheetAsObjects(importSheet)
      .rows.filter(
        (row) => String(row.Saison_id || "").trim() === normalizedSaisonId,
      )
      .forEach((row) => {
        const assoId = String(row.Assoconnect_id || "").trim();

        if (!assoId) {
          return;
        }

        const current = assoById[assoId];

        const currentResponsibleCount = current
          ? countCommunicationResponsibleEmails(current)
          : -1;

        if (
          !current ||
          countCommunicationResponsibleEmails(row) > currentResponsibleCount
        ) {
          assoById[assoId] = row;
        }
      });
  }

  const emails = new Set();
  const adhesionIds = [];

  readSheetAsObjects(adhesionsSheet)
    .rows.filter(
      (adhesion) =>
        String(adhesion.Saison_id || "").trim() === normalizedSaisonId &&
        String(adhesion.Statut_adhesion || "ACTIVE").trim() !== "ANNULEE" &&
        (selectedCategories.length === 0 ||
          selectedCategories.includes(String(adhesion.Categorie || "").trim())),
    )
    .forEach((adhesion) => {
      const contactId = String(adhesion.Contact_id || "").trim();

      const contact = contactsById[contactId] || {};

      const assoId = String(contact.Assoconnect_id || "").trim();

      const imported = assoById[assoId] || {};

      addCommunicationEmail(emails, contact.Email);
      addCommunicationEmail(emails, contact.Email_responsable_1);
      addCommunicationEmail(emails, contact.Email_responsable_2);
      addCommunicationEmail(emails, imported.Email_responsable_1);
      addCommunicationEmail(emails, imported.Email_responsable_2);

      adhesionIds.push(adhesion.Adhesion_id || "");
    });

  const sortedEmails = Array.from(emails).sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  return {
    success: true,
    saisonId: normalizedSaisonId,
    categories: selectedCategories,
    adhesions: adhesionIds.length,
    emails: sortedEmails.join(", "),
    emailCount: sortedEmails.length,
  };
}

function addCommunicationEmail(emails, value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    emails.add(normalized);
  }
}

function countCommunicationResponsibleEmails(row) {
  return [row.Email_responsable_1, row.Email_responsable_2].filter(
    (value) => String(value || "").trim() !== "",
  ).length;
}
