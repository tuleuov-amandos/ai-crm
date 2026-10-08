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
  // Same as before: the number is not rewritten, 8... stays 8...
  assert.equal(buildWhatsAppHref("8 777 123 45 67"), "https://wa.me/87771234567");
});

test("buildWhatsAppHref returns null without digits", () => {
  assert.equal(buildWhatsAppHref(""), null);
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
