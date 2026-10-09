// Unit tests for the one-line address of the mobile list cards (see addressLine.ts).
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/lib/addressLine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAddressLine } from "./addressLine.ts";

test("formatAddressLine joins address and city with a comma", () => {
  assert.equal(formatAddressLine("ул. Абая 10", "Алматы"), "ул. Абая 10, Алматы");
});

test("formatAddressLine trims both parts", () => {
  assert.equal(formatAddressLine("  ул. Абая 10 ", " Алматы  "), "ул. Абая 10, Алматы");
});

test("formatAddressLine shows the only part that is set", () => {
  assert.equal(formatAddressLine("ул. Абая 10", null), "ул. Абая 10");
  assert.equal(formatAddressLine(undefined, "Алматы"), "Алматы");
  assert.equal(formatAddressLine("ул. Абая 10", "   "), "ул. Абая 10");
  assert.equal(formatAddressLine("", "Алматы"), "Алматы");
});

test("formatAddressLine returns null when there is nothing to show", () => {
  assert.equal(formatAddressLine(null, null), null);
  assert.equal(formatAddressLine(undefined, undefined), null);
  assert.equal(formatAddressLine("  ", ""), null);
  assert.equal(formatAddressLine(), null);
});

test("formatAddressLine does not repeat a city the address already names", () => {
  assert.equal(formatAddressLine("Алматы, ул. Абая 10", "Алматы"), "Алматы, ул. Абая 10");
  assert.equal(formatAddressLine("г. АЛМАТЫ, Абая 10", "Алматы"), "г. АЛМАТЫ, Абая 10");
});
