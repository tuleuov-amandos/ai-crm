// Links and checks for the quick actions on the deal and contact cards
// (call, WhatsApp, stage change). Pure functions, tested in
// dealQuickActions.test.mjs.

/** `tel:` link: digits plus a leading "+"; null when the phone has no digits. */
export function buildTelHref(phone: string | null | undefined): string | null {
  const value = (phone ?? "").trim();
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${value.startsWith("+") ? "+" : ""}${digits}`;
}

/**
 * wa.me link with the phone's digits; null when there are none. A Kazakh
 * local number (11 digits starting with 8, no leading "+") becomes 7...,
 * since wa.me needs the country code. "+8..." is a foreign code, kept as is.
 */
export function buildWhatsAppHref(phone: string | null | undefined): string | null {
  const value = (phone ?? "").trim();
  let digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (!value.startsWith("+") && digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  }
  return `https://wa.me/${digits}`;
}

/** Moving a deal to a WON or LOST stage closes it and is confirmed first. */
export function isClosingStage(kind: string | null | undefined): boolean {
  return kind === "WON" || kind === "LOST";
}
