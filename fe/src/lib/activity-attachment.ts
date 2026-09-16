// Mirrors be/src/common/services/cloudinary.service.ts
// (ACTIVITY_ATTACHMENT_MAX_BYTES / ACTIVITY_ATTACHMENT_ALLOWED_MIME) so the
// client can reject an obviously bad file before hitting the network.
export const ACTIVITY_ATTACHMENT_ACCEPT = "application/pdf,image/jpeg,image/png";
export const ACTIVITY_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const HEIC_MIME_TYPES = ["image/heic", "image/heif"];
const HEIC_EXTENSIONS = [".heic", ".heif"];

export type ActivityAttachmentValidationError = "heic" | "invalidType" | "tooLarge";

/**
 * iPhones sometimes send an empty/generic `file.type` for HEIC photos, so the
 * extension is checked in addition to the MIME type — matches the backend's
 * "explicit HEIC rejection, no auto-convert" rule.
 */
export function validateActivityAttachmentFile(
  file: File,
): ActivityAttachmentValidationError | null {
  const lowerName = file.name.toLowerCase();
  const isHeic =
    HEIC_MIME_TYPES.includes(file.type) ||
    HEIC_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (isHeic) return "heic";
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return "invalidType";
  if (file.size > ACTIVITY_ATTACHMENT_MAX_BYTES) return "tooLarge";
  return null;
}
