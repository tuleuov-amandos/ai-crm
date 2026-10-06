// Unit tests for the bulk deal selection helpers (see dealBulk.ts).
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/lib/dealBulk.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BULK_BATCH_SIZE,
  chunkIds,
  splitSelection,
  stageKindByDealId,
  countOpenStage,
  selectAllState,
  toggleAll,
  toggleOne,
  sumUpdated,
  runInBatches,
} from "./dealBulk.ts";
import { isDealArchived, needsArchiveConfirm } from "./dealArchive.ts";

const ids = (n, prefix = "d") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const deal = (id, archivedAt = null) => ({ id, archivedAt });
const column = (kind, dealIds) => ({
  stage: { id: `s-${kind}-${dealIds.join("")}`, kind },
  deals: dealIds.map((id) => deal(id)),
});

test("chunkIds: batches of 200 in order", () => {
  assert.equal(BULK_BATCH_SIZE, 200);
  assert.deepEqual(chunkIds([]), []);
  assert.deepEqual(chunkIds(ids(3)), [ids(3)]);
  assert.deepEqual(chunkIds(ids(200)).map((c) => c.length), [200]);
  assert.deepEqual(chunkIds(ids(201)).map((c) => c.length), [200, 1]);
  const all = ids(450);
  const chunks = chunkIds(all);
  assert.deepEqual(chunks.map((c) => c.length), [200, 200, 50]);
  assert.deepEqual(chunks.flat(), all);
});

test("chunkIds: custom size", () => {
  assert.deepEqual(chunkIds(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
});

test("splitSelection: archived and active ids in board order", () => {
  const deals = [deal("a"), deal("b", "2026-10-01T00:00:00.000Z"), deal("c"), deal("d", "2026-10-02T00:00:00.000Z")];
  const result = splitSelection(deals, new Set(["d", "a", "b"]));
  assert.deepEqual(result, { active: ["a"], archived: ["b", "d"] });
});

test("splitSelection: ids no longer on the board are dropped", () => {
  const result = splitSelection([deal("a")], new Set(["a", "gone"]));
  assert.deepEqual(result, { active: ["a"], archived: [] });
  assert.deepEqual(splitSelection([], new Set(["x"])), { active: [], archived: [] });
});

test("splitSelection: archived rule matches isDealArchived", () => {
  const deals = [deal("a"), deal("b", "2026-10-01T00:00:00.000Z"), { id: "c" }];
  const { archived } = splitSelection(deals, new Set(["a", "b", "c"]));
  assert.deepEqual(archived, deals.filter(isDealArchived).map((d) => d.id));
});

test("stageKindByDealId: kind of the column holding the deal", () => {
  const map = stageKindByDealId([column("OPEN", ["a", "b"]), column("WON", ["c"])]);
  assert.equal(map.get("a"), "OPEN");
  assert.equal(map.get("b"), "OPEN");
  assert.equal(map.get("c"), "WON");
  assert.equal(map.get("x"), undefined);
});

test("countOpenStage: open and unknown stages count, won and lost do not", () => {
  const kinds = new Map([
    ["open", "OPEN"],
    ["won", "WON"],
    ["lost", "LOST"],
    ["nullKind", null],
  ]);
  assert.equal(countOpenStage(["open", "won", "lost"], kinds), 1);
  // Not on the board / no stage known: treated as open.
  assert.equal(countOpenStage(["missing", "nullKind"], kinds), 2);
  assert.equal(countOpenStage([], kinds), 0);
});

test("countOpenStage: same rule as needsArchiveConfirm", () => {
  const kinds = new Map([
    ["a", "OPEN"],
    ["b", "WON"],
    ["c", "LOST"],
    ["d", null],
    ["e", undefined],
  ]);
  for (const [id, kind] of kinds) {
    assert.equal(countOpenStage([id], kinds), needsArchiveConfirm(kind) ? 1 : 0, id);
  }
});

test("selectAllState: none / some / all of the visible ids", () => {
  const visible = ["a", "b", "c"];
  assert.equal(selectAllState(new Set(), visible), "none");
  assert.equal(selectAllState(new Set(["b"]), visible), "some");
  assert.equal(selectAllState(new Set(["a", "b", "c"]), visible), "all");
  // Ids outside the visible set do not count.
  assert.equal(selectAllState(new Set(["x"]), visible), "none");
  assert.equal(selectAllState(new Set(["a", "b", "c", "x"]), visible), "all");
  // An empty column has nothing to select.
  assert.equal(selectAllState(new Set(["x"]), []), "none");
});

test("toggleAll: selects all visible from none or some, keeps others", () => {
  const visible = ["a", "b"];
  assert.deepEqual([...toggleAll(new Set(["x"]), visible)].sort(), ["a", "b", "x"]);
  assert.deepEqual([...toggleAll(new Set(["a", "x"]), visible)].sort(), ["a", "b", "x"]);
});

test("toggleAll: deselects visible when all are selected, keeps others", () => {
  assert.deepEqual([...toggleAll(new Set(["a", "b", "x"]), ["a", "b"])], ["x"]);
});

test("toggleAll / toggleOne: return a new set, input untouched", () => {
  const selected = new Set(["a"]);
  const all = toggleAll(selected, ["a", "b"]);
  const one = toggleOne(selected, "b");
  assert.notEqual(all, selected);
  assert.notEqual(one, selected);
  assert.deepEqual([...selected], ["a"]);
  assert.equal(toggleAll(new Set(), []).size, 0);
});

test("toggleOne: adds a missing id, removes a selected one", () => {
  assert.deepEqual([...toggleOne(new Set(["a"]), "b")].sort(), ["a", "b"]);
  assert.deepEqual([...toggleOne(new Set(["a", "b"]), "a")], ["b"]);
});

test("sumUpdated: sum of updated over responses", () => {
  assert.equal(sumUpdated([]), 0);
  assert.equal(sumUpdated([{ updated: 200 }, { updated: 3 }, { updated: 0 }]), 203);
});

test("runInBatches: sends batches one after another and sums updated", async () => {
  const sent = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const send = async (batch) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight -= 1;
    sent.push(batch);
    // The backend skips deals already in the target state.
    return { updated: batch.length - 1 };
  };
  const all = ids(450);
  const result = await runInBatches(all, send);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(sent.map((b) => b.length), [200, 200, 50]);
  assert.deepEqual(sent.flat(), all);
  assert.deepEqual(result, { ok: true, updated: 447 });
});

test("runInBatches: no ids, no requests", async () => {
  let calls = 0;
  const result = await runInBatches([], async () => {
    calls += 1;
    return { updated: 1 };
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { ok: true, updated: 0 });
});

test("runInBatches: stops at the first failed batch", async () => {
  const failure = new Error("boom");
  let calls = 0;
  const result = await runInBatches(ids(650), async (batch) => {
    calls += 1;
    if (calls === 2) throw failure;
    return { updated: batch.length };
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: false, updated: 200, error: failure });
});

test("runInBatches: first batch fails, nothing updated", async () => {
  const failure = new Error("403");
  const result = await runInBatches(ids(5), async () => {
    throw failure;
  });
  assert.deepEqual(result, { ok: false, updated: 0, error: failure });
});
