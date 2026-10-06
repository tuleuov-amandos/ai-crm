// Unit tests for the pure helpers behind Settings → Sales pipeline.
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/lib/pipelineStageSettings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_OPEN_STAGES,
  splitStages,
  moveStageId,
  isOrderChanged,
  applyOpenStageOrder,
  canAddStage,
  canDeleteStage,
  deleteTargets,
  defaultDeleteTarget,
  changedStageFields,
} from "./pipelineStageSettings.ts";

const stage = (id, kind = "OPEN", order = 0, extra = {}) => ({
  id,
  name: id,
  color: "blue",
  order,
  probability: 20,
  kind,
  legacyKey: null,
  ...extra,
});

// Unsorted on purpose: helpers must sort by order themselves.
const pipeline = () => [
  stage("won", "WON", 3, { color: "green", probability: 100 }),
  stage("b", "OPEN", 1),
  stage("lost", "LOST", 4, { color: "red", probability: 0 }),
  stage("a", "OPEN", 0),
  stage("c", "OPEN", 2),
];

const ids = (list) => list.map((s) => s.id);

// ─── splitStages ─────────────────────────────────────────────────────────────
test("splitStages returns open stages by order, then WON and LOST", () => {
  const { open, closed } = splitStages(pipeline());
  assert.deepEqual(ids(open), ["a", "b", "c"]);
  assert.deepEqual(ids(closed), ["won", "lost"]);
});

// ─── moveStageId ─────────────────────────────────────────────────────────────
test("moveStageId moves an id down to the position of the target", () => {
  assert.deepEqual(moveStageId(["a", "b", "c"], "a", "c"), ["b", "c", "a"]);
});

test("moveStageId moves an id up to the position of the target", () => {
  assert.deepEqual(moveStageId(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
});

test("moveStageId does not mutate the input", () => {
  const input = ["a", "b", "c"];
  moveStageId(input, "a", "c");
  assert.deepEqual(input, ["a", "b", "c"]);
});

test("moveStageId returns the same array when dropped on itself or nowhere", () => {
  const input = ["a", "b", "c"];
  assert.equal(moveStageId(input, "b", "b"), input);
  assert.equal(moveStageId(input, "b", null), input);
  assert.equal(moveStageId(input, "b", undefined), input);
});

test("moveStageId ignores unknown ids (e.g. a WON/LOST stage)", () => {
  const input = ["a", "b", "c"];
  assert.equal(moveStageId(input, "won", "a"), input);
  assert.equal(moveStageId(input, "a", "won"), input);
});

// ─── isOrderChanged ──────────────────────────────────────────────────────────
test("isOrderChanged is false for the same order", () => {
  assert.equal(isOrderChanged(["a", "b"], ["a", "b"]), false);
});

test("isOrderChanged is true when two ids swap", () => {
  assert.equal(isOrderChanged(["a", "b"], ["b", "a"]), true);
});

test("isOrderChanged is true when the length differs", () => {
  assert.equal(isOrderChanged(["a", "b"], ["a"]), true);
});

// ─── applyOpenStageOrder ─────────────────────────────────────────────────────
test("applyOpenStageOrder renumbers open stages and keeps WON/LOST last", () => {
  const result = applyOpenStageOrder(pipeline(), ["c", "a", "b"]);
  const byId = Object.fromEntries(result.map((s) => [s.id, s.order]));
  assert.deepEqual(byId, { c: 0, a: 1, b: 2, won: 3, lost: 4 });
});

test("applyOpenStageOrder keeps other stage fields and does not mutate input", () => {
  const input = pipeline();
  const result = applyOpenStageOrder(input, ["c", "a", "b"]);
  assert.equal(input.find((s) => s.id === "c").order, 2);
  assert.equal(result.find((s) => s.id === "won").probability, 100);
});

// ─── canAddStage ─────────────────────────────────────────────────────────────
test("canAddStage allows up to 12 open stages", () => {
  assert.equal(MAX_OPEN_STAGES, 12);
  assert.equal(canAddStage(11), true);
  assert.equal(canAddStage(12), false);
  assert.equal(canAddStage(13), false);
});

// ─── canDeleteStage ──────────────────────────────────────────────────────────
test("canDeleteStage allows an open stage while another open stage remains", () => {
  assert.equal(canDeleteStage(stage("a"), 2), true);
});

test("canDeleteStage forbids the last open stage", () => {
  assert.equal(canDeleteStage(stage("a"), 1), false);
});

test("canDeleteStage forbids WON and LOST stages", () => {
  assert.equal(canDeleteStage(stage("won", "WON"), 5), false);
  assert.equal(canDeleteStage(stage("lost", "LOST"), 5), false);
});

// ─── delete targets ──────────────────────────────────────────────────────────
test("deleteTargets lists every other stage, WON/LOST included, by order", () => {
  assert.deepEqual(ids(deleteTargets(pipeline(), "b")), ["a", "c", "won", "lost"]);
});

test("defaultDeleteTarget is the first other open stage", () => {
  assert.equal(defaultDeleteTarget(pipeline(), "a"), "b");
  assert.equal(defaultDeleteTarget(pipeline(), "b"), "a");
});

test("defaultDeleteTarget falls back to WON when no other open stage exists", () => {
  const stages = [stage("a", "OPEN", 0), stage("won", "WON", 1), stage("lost", "LOST", 2)];
  assert.equal(defaultDeleteTarget(stages, "a"), "won");
});

test("defaultDeleteTarget is empty when there is nothing else", () => {
  assert.equal(defaultDeleteTarget([stage("a")], "a"), "");
});

// ─── changedStageFields ──────────────────────────────────────────────────────
const initial = { name: "Lead", color: "blue", probability: 20 };

test("changedStageFields returns only the changed fields of an open stage", () => {
  assert.deepEqual(
    changedStageFields(initial, { name: "Lead", color: "teal", probability: 20 }, "OPEN"),
    { color: "teal" },
  );
  assert.deepEqual(
    changedStageFields(initial, { name: "Hot lead", color: "blue", probability: 35 }, "OPEN"),
    { name: "Hot lead", probability: 35 },
  );
});

test("changedStageFields trims the name and ignores whitespace-only edits", () => {
  assert.deepEqual(
    changedStageFields(initial, { name: "  Lead  ", color: "blue", probability: 20 }, "OPEN"),
    {},
  );
  assert.deepEqual(
    changedStageFields(initial, { name: " New ", color: "blue", probability: 20 }, "OPEN"),
    { name: "New" },
  );
});

test("changedStageFields sends only the name for WON/LOST stages", () => {
  const won = { name: "Won", color: "green", probability: 100 };
  assert.deepEqual(
    changedStageFields(won, { name: "Closed", color: "blue", probability: 0 }, "WON"),
    { name: "Closed" },
  );
  assert.deepEqual(
    changedStageFields(won, { name: "Won", color: "blue", probability: 0 }, "LOST"),
    {},
  );
});
