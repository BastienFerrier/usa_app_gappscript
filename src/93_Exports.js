/**
 * =========================
 * EXPORTS D'IMAGES
 * =========================
 */

const IMAGE_EXPORT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Envoie une image exportée par email.
 *
 * L'image est transmise par le navigateur sous
 * forme base64 puis envoyée comme pièce jointe.
 */
function sendImageExportEmail(payload) {
  requireRole("ADMIN", "BUREAU");

  payload = payload || {};

  const recipient = String(payload.recipient || "").trim();
  const subject = String(payload.subject || "").trim();
  const body = String(payload.body || "").trim();
  const fileName = sanitizeImageExportFileName(payload.fileName);
  const mimeType = String(payload.mimeType || "image/png").trim().toLowerCase();
  const imageBase64 = String(payload.imageBase64 || "").trim();

  if (!isValidImageExportEmail(recipient)) {
    throw new Error("Adresse email destinataire invalide.");
  }

  if (!subject) {
    throw new Error("Objet de l'email obligatoire.");
  }

  if (subject.length > 200) {
    throw new Error("Objet de l'email trop long.");
  }

  if (body.length > 10000) {
    throw new Error("Message de l'email trop long.");
  }

  if (mimeType !== "image/png") {
    throw new Error("Format d'image non pris en charge.");
  }

  if (!imageBase64) {
    throw new Error("Image exportée manquante.");
  }

  let bytes;

  try {
    bytes = Utilities.base64Decode(imageBase64);
  } catch (error) {
    throw new Error("Image exportée invalide.");
  }

  if (!bytes || bytes.length === 0) {
    throw new Error("Image exportée vide.");
  }

  if (bytes.length > IMAGE_EXPORT_MAX_BYTES) {
    throw new Error("Image trop volumineuse pour être envoyée par email.");
  }

  const attachment = Utilities.newBlob(bytes, mimeType, fileName);

  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    body: body || "Veuillez trouver le tableau exporté en pièce jointe.",
    attachments: [attachment],
  });

  return {
    success: true,
    recipient: recipient,
    fileName: fileName,
  };
}

function isValidImageExportEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeImageExportFileName(value) {
  const fileName = String(value || "tableau-export.png")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 120);

  return fileName || "tableau-export.png";
}
