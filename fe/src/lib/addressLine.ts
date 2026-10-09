// One-line address for the phone list cards ("address, city"). Pure function,
// tested in addressLine.test.mjs.

/**
 * "address, city" without empty parts; null when both are empty, so the card
 * leaves the row out instead of printing a dash. A city the address already
 * names ("Алматы, ул. Абая 10" + "Алматы") is not repeated.
 */
export function formatAddressLine(
  address?: string | null,
  city?: string | null,
): string | null {
  const a = (address ?? "").trim();
  const c = (city ?? "").trim();
  if (!a && !c) return null;
  if (!a) return c;
  if (!c) return a;
  return a.toLocaleLowerCase().includes(c.toLocaleLowerCase()) ? a : `${a}, ${c}`;
}
