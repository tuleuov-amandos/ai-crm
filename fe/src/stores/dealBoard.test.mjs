// Unit tests for the pure board helpers behind dealCards-store.
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/stores/dealBoard.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAllDeals,
  findColumnByDealId,
  moveDealBetweenColumns,
  rollbackDealMove,
  reorderDealInColumn,
  replaceDeal,
  removeDealFromColumns,
} from "./dealBoard.ts";

const stage = (id, kind = "OPEN", order = 0) => ({
  id,
  name: id,
  color: "blue",
  order,
  kind,
  probability: 10,
});

const deal = (id, stageId) => ({
  id,
  tenantId: "t1",
  contactId: "c1",
  ownerId: "u1",
  title: `Deal ${id}`,
  value: 100,
  stage: "PROSPECT",
  stageId,
  isPaid: false,
  closeDate: new Date("2026-01-01"),
  note: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  contact: { id: "c1", name: "Contact", company: null },
  owner: { id: "u1", name: "Owner" },
});

// Lead (2 deals), a custom stage (1 deal, stageId null like an old card the
// backend placed by legacy key), Won (empty), Lost (empty).
const board = () => [
  { stage: stage("lead", "OPEN", 0), deals: [deal("d1", "lead"), deal("d2", "lead")] },
  { stage: stage("custom", "OPEN", 1), deals: [deal("d3", null)] },
  { stage: stage("won", "WON", 2), deals: [] },
  { stage: stage("lost", "LOST", 3), deals: [] },
];

const ids = (columns, stageId) =>
  columns.find((c) => c.stage.id === stageId).deals.map((d) => d.id);

test("getAllDeals flattens columns in board order", () => {
  assert.deepEqual(
    getAllDeals(board()).map((d) => d.id),
    ["d1", "d2", "d3"],
  );
  assert.deepEqual(getAllDeals([]), []);
});

test("findColumnByDealId returns the column holding the deal", () => {
  assert.equal(findColumnByDealId(board(), "d3").stage.id, "custom");
  assert.equal(findColumnByDealId(board(), "missing"), undefined);
});

test("moveDealBetweenColumns moves the deal to the top of the target and sets stageId", () => {
  const before = board();
  const after = moveDealBetweenColumns(before, "d2", "lead", "custom");
  assert.deepEqual(ids(after, "lead"), ["d1"]);
  assert.deepEqual(ids(after, "custom"), ["d2", "d3"]);
  assert.equal(findColumnByDealId(after, "d2").deals[0].stageId, "custom");
  // input is not mutated
  assert.deepEqual(ids(before, "lead"), ["d1", "d2"]);
});

test("moveDealBetweenColumns into an empty column", () => {
  const after = moveDealBetweenColumns(board(), "d3", "custom", "won");
  assert.deepEqual(ids(after, "custom"), []);
  assert.deepEqual(ids(after, "won"), ["d3"]);
  assert.equal(after[2].deals[0].stageId, "won");
});

test("moveDealBetweenColumns ignores unknown stages, unknown deals and same-column moves", () => {
  const before = board();
  assert.equal(moveDealBetweenColumns(before, "d1", "lead", "nope"), before);
  assert.equal(moveDealBetweenColumns(before, "d1", "nope", "won"), before);
  assert.equal(moveDealBetweenColumns(before, "missing", "lead", "won"), before);
  assert.equal(moveDealBetweenColumns(before, "d1", "lead", "lead"), before);
});

test("rollbackDealMove puts the deal back into the origin column", () => {
  const moved = moveDealBetweenColumns(board(), "d1", "lead", "won");
  const rolledBack = rollbackDealMove(moved, "d1", "lead", "won");
  assert.deepEqual(ids(rolledBack, "won"), []);
  assert.deepEqual(ids(rolledBack, "lead"), ["d2", "d1"]);
  assert.equal(findColumnByDealId(rolledBack, "d1").stage.id, "lead");
  assert.equal(
    rolledBack[0].deals.find((d) => d.id === "d1").stageId,
    "lead",
  );
});

test("rollbackDealMove ignores a deal that is no longer in the target column", () => {
  const before = board();
  assert.equal(rollbackDealMove(before, "d1", "custom", "won"), before);
  assert.equal(rollbackDealMove(before, "d1", "nope", "lead"), before);
});

test("removeDealFromColumns removes from the given column", () => {
  const after = removeDealFromColumns(board(), "d1", "lead");
  assert.deepEqual(ids(after, "lead"), ["d2"]);
  assert.deepEqual(ids(after, "custom"), ["d3"]);
});

test("removeDealFromColumns finds the deal when the stage is unknown or missing", () => {
  assert.deepEqual(ids(removeDealFromColumns(board(), "d3", "nope"), "custom"), []);
  assert.deepEqual(ids(removeDealFromColumns(board(), "d3", null), "custom"), []);
  assert.deepEqual(ids(removeDealFromColumns(board(), "d3"), "custom"), []);
  const before = board();
  assert.equal(removeDealFromColumns(before, "missing", "lead"), before);
});

test("replaceDeal updates the deal in whatever column holds it", () => {
  const updated = { ...deal("d3", null), title: "Renamed" };
  const after = replaceDeal(board(), updated);
  assert.equal(findColumnByDealId(after, "d3").stage.id, "custom");
  assert.equal(after[1].deals[0].title, "Renamed");
  const before = board();
  assert.equal(replaceDeal(before, deal("missing", "lead")), before);
});

test("reorderDealInColumn moves a deal within its column", () => {
  const after = reorderDealInColumn(board(), "lead", 0, 1);
  assert.deepEqual(ids(after, "lead"), ["d2", "d1"]);
  assert.deepEqual(ids(after, "custom"), ["d3"]);
});

test("reorderDealInColumn ignores unknown stages and out-of-range indexes", () => {
  const before = board();
  assert.equal(reorderDealInColumn(before, "nope", 0, 1), before);
  assert.equal(reorderDealInColumn(before, "lead", 0, 5), before);
  assert.equal(reorderDealInColumn(before, "lead", -1, 0), before);
  assert.equal(reorderDealInColumn(before, "won", 0, 0), before);
  assert.equal(reorderDealInColumn(before, "lead", 1, 1), before);
});
