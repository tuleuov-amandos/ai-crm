// Unit tests for the deal/contact quick-action helpers (see dealQuickActions.ts).
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/lib/dealQuickActions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTelHref,
  buildWhatsAppHref,
  isClosingStage,
} from "./dealQuickActions.ts";

test("buildTelHref keeps digits and a leading plus", () => {
  assert.equal(buildTelHref("+7 (777) 123-45-67"), "tel:+77771234567");
  assert.equal(buildTelHref("  +7 777 123 45 67 "), "tel:+77771234567");
  assert.equal(buildTelHref("8 777 123 45 67"), "tel:87771234567");
  assert.equal(buildTelHref("87771234567"), "tel:87771234567");
  assert.equal(buildTelHref("(727) 250-00-00"), "tel:7272500000");
});

test("buildTelHref drops a plus that is not leading", () => {
  assert.equal(buildTelHref("7+777"), "tel:7777");
});

test("buildTelHref returns null without digits", () => {
  assert.equal(buildTelHref(""), null);
  assert.equal(buildTelHref("   "), null);
  assert.equal(buildTelHref("+"), null);
  assert.equal(buildTelHref("()- +"), null);
  assert.equal(buildTelHref(null), null);
  assert.equal(buildTelHref(undefined), null);
});

test("buildWhatsAppHref keeps only digits", () => {
  assert.equal(buildWhatsAppHref("+7 (777) 123-45-67"), "https://wa.me/77771234567");
  assert.equal(buildWhatsAppHref("7-777-123-45-67"), "https://wa.me/77771234567");
  assert.equal(buildWhatsAppHref("  77771234567 "), "https://wa.me/77771234567");
});

test("buildWhatsAppHref turns a Kazakh 8... number into 7...", () => {
  assert.equal(buildWhatsAppHref("87778889933"), "https://wa.me/77778889933");
  assert.equal(buildWhatsAppHref("8 777 123 45 67"), "https://wa.me/77771234567");
  assert.equal(buildWhatsAppHref("8 (777) 123-45-67"), "https://wa.me/77771234567");
  assert.equal(buildWhatsAppHref(" 8-727-250-00-00 "), "https://wa.me/77272500000");
});

test("buildWhatsAppHref leaves other numbers as digits", () => {
  // Not 11 digits: no rewrite.
  assert.equal(buildWhatsAppHref("8 777 123 45"), "https://wa.me/877712345");
  assert.equal(buildWhatsAppHref("877712345678"), "https://wa.me/877712345678");
  // An explicit "+8..." is a foreign country code (+81 Japan), not a local 8.
  assert.equal(buildWhatsAppHref("+81 3 1234 5678"), "https://wa.me/81312345678");
  assert.equal(buildWhatsAppHref("+49 30 1234567"), "https://wa.me/49301234567");
  assert.equal(buildWhatsAppHref("+1 (212) 555-0100"), "https://wa.me/12125550100");
});

test("buildWhatsAppHref returns null without digits", () => {
  assert.equal(buildWhatsAppHref(""), null);
  assert.equal(buildWhatsAppHref("   "), null);
  assert.equal(buildWhatsAppHref("—"), null);
  assert.equal(buildWhatsAppHref("()- +"), null);
  assert.equal(buildWhatsAppHref(null), null);
  assert.equal(buildWhatsAppHref(undefined), null);
});

test("isClosingStage is true only for WON and LOST", () => {
  assert.equal(isClosingStage("WON"), true);
  assert.equal(isClosingStage("LOST"), true);
  assert.equal(isClosingStage("OPEN"), false);
  assert.equal(isClosingStage(undefined), false);
  assert.equal(isClosingStage(null), false);
});
