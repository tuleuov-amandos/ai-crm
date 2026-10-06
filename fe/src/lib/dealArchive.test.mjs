// Unit tests for the deal archive helpers (see dealArchive.ts).
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/lib/dealArchive.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDealArchived, needsArchiveConfirm } from "./dealArchive.ts";

test("isDealArchived: true only for a set archivedAt", () => {
  assert.equal(isDealArchived({ archivedAt: "2026-10-01T10:00:00.000Z" }), true);
  assert.equal(isDealArchived({ archivedAt: null }), false);
  // Mutation responses may come without the field.
  assert.equal(isDealArchived({}), false);
  assert.equal(isDealArchived({ archivedAt: undefined }), false);
});

test("needsArchiveConfirm: open stage asks before archiving", () => {
  assert.equal(needsArchiveConfirm("OPEN"), true);
});

test("needsArchiveConfirm: won and lost stages archive at once", () => {
  assert.equal(needsArchiveConfirm("WON"), false);
  assert.equal(needsArchiveConfirm("LOST"), false);
});

test("needsArchiveConfirm: unknown stage asks (stages still loading)", () => {
  assert.equal(needsArchiveConfirm(undefined), true);
  assert.equal(needsArchiveConfirm(null), true);
});
