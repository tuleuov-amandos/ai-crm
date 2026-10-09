// Unit tests for the pure helpers behind Settings → Integrations (AI key).
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/lib/aiSettings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_KEY_MAX_LENGTH,
  AI_KEY_MIN_LENGTH,
  AI_PROVIDER_OPTIONS,
  isApiKeyLengthValid,
  maskKeyLast4,
  providerLabel,
  providerPlaceholder,
} from "./aiSettings.ts";

// ─── providers ───────────────────────────────────────────────────────────────
test("provider options are openai, groq, anthropic in that order", () => {
  assert.deepEqual(
    AI_PROVIDER_OPTIONS.map((p) => p.value),
    ["openai", "groq", "anthropic"],
  );
});

test("providerLabel returns the display name of a provider", () => {
  assert.equal(providerLabel("openai"), "OpenAI");
  assert.equal(providerLabel("groq"), "Groq");
  assert.equal(providerLabel("anthropic"), "Anthropic");
});

test("providerLabel is empty for no provider", () => {
  assert.equal(providerLabel(null), "");
  assert.equal(providerLabel(undefined), "");
});

test("providerPlaceholder shows the key prefix of each provider", () => {
  assert.equal(providerPlaceholder("openai"), "sk-…");
  assert.equal(providerPlaceholder("groq"), "gsk_…");
  assert.equal(providerPlaceholder("anthropic"), "sk-ant-…");
});

test("providerPlaceholder is empty for no provider", () => {
  assert.equal(providerPlaceholder(null), "");
  assert.equal(providerPlaceholder(undefined), "");
});

// ─── maskKeyLast4 ────────────────────────────────────────────────────────────
test("maskKeyLast4 prefixes the last four characters with dots", () => {
  assert.equal(maskKeyLast4("1234"), "····1234");
});

test("maskKeyLast4 falls back to dots only when the tail is unknown", () => {
  assert.equal(maskKeyLast4(null), "····");
  assert.equal(maskKeyLast4(undefined), "····");
  assert.equal(maskKeyLast4(""), "····");
});

// ─── isApiKeyLengthValid ─────────────────────────────────────────────────────
test("limits mirror the backend (10..500)", () => {
  assert.equal(AI_KEY_MIN_LENGTH, 10);
  assert.equal(AI_KEY_MAX_LENGTH, 500);
});

test("isApiKeyLengthValid accepts the boundaries", () => {
  assert.equal(isApiKeyLengthValid("a".repeat(10)), true);
  assert.equal(isApiKeyLengthValid("a".repeat(500)), true);
});

test("isApiKeyLengthValid rejects too short and too long keys", () => {
  assert.equal(isApiKeyLengthValid("a".repeat(9)), false);
  assert.equal(isApiKeyLengthValid("a".repeat(501)), false);
  assert.equal(isApiKeyLengthValid(""), false);
});

test("isApiKeyLengthValid measures the trimmed key, like the backend", () => {
  assert.equal(isApiKeyLengthValid("  " + "a".repeat(9) + "  "), false);
  assert.equal(isApiKeyLengthValid("  " + "a".repeat(10) + "  "), true);
  assert.equal(isApiKeyLengthValid(" ".repeat(20)), false);
});
