// Unit tests for the chat message edit/delete helpers (see chatMessages.ts).
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/lib/chatMessages.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_EDIT_WINDOW_MS,
  applyMessageDeleted,
  applyMessageUpdate,
  canDeleteMessage,
  canEditMessage,
} from "./chatMessages.ts";

const ME = "user-me";
const CREATED_AT = "2026-10-01T10:00:00.000Z";
const CREATED_MS = Date.parse(CREATED_AT);

function message(overrides = {}) {
  return {
    id: "m1",
    channelId: "c1",
    tenantId: "t1",
    senderId: ME,
    content: "hello",
    createdAt: CREATED_AT,
    editedAt: null,
    deletedAt: null,
    sender: { id: ME, name: "Me", avatarUrl: null },
    attachments: [],
    ...overrides,
  };
}

function page(ids, extra = {}) {
  return {
    data: ids.map((id) => message({ id })),
    total: 100,
    page: 1,
    limit: 30,
    ...extra,
  };
}

test("MESSAGE_EDIT_WINDOW_MS is 24 hours", () => {
  assert.equal(MESSAGE_EDIT_WINDOW_MS, 24 * 60 * 60 * 1000);
});

test("canEditMessage / canDeleteMessage: own fresh message", () => {
  const now = new Date(CREATED_MS + 60_000);
  assert.equal(canEditMessage(message(), ME, now), true);
  assert.equal(canDeleteMessage(message(), ME, now), true);
});

test("window boundary: exactly 24 hours is still allowed", () => {
  const now = new Date(CREATED_MS + MESSAGE_EDIT_WINDOW_MS);
  assert.equal(canEditMessage(message(), ME, now), true);
  assert.equal(canDeleteMessage(message(), ME, now), true);
});

test("window boundary: 24 hours + 1 ms is too late", () => {
  const now = new Date(CREATED_MS + MESSAGE_EDIT_WINDOW_MS + 1);
  assert.equal(canEditMessage(message(), ME, now), false);
  assert.equal(canDeleteMessage(message(), ME, now), false);
});

test("now accepts a timestamp in ms as well as a Date", () => {
  assert.equal(canEditMessage(message(), ME, CREATED_MS + 1000), true);
  assert.equal(canDeleteMessage(message(), ME, CREATED_MS + MESSAGE_EDIT_WINDOW_MS + 1), false);
});

test("someone else's message cannot be edited or deleted", () => {
  const now = new Date(CREATED_MS + 1000);
  const other = message({ senderId: "user-other" });
  assert.equal(canEditMessage(other, ME, now), false);
  assert.equal(canDeleteMessage(other, ME, now), false);
});

test("unknown current user (me not loaded yet) gets no actions", () => {
  const now = new Date(CREATED_MS + 1000);
  assert.equal(canEditMessage(message(), undefined, now), false);
  assert.equal(canDeleteMessage(message(), undefined, now), false);
});

test("a deleted message cannot be edited or deleted again", () => {
  const now = new Date(CREATED_MS + 1000);
  const deleted = message({ deletedAt: "2026-10-01T10:00:01.000Z", content: "" });
  assert.equal(canEditMessage(deleted, ME, now), false);
  assert.equal(canDeleteMessage(deleted, ME, now), false);
});

test("deletedAt missing (backend rolling out) counts as not deleted", () => {
  const now = new Date(CREATED_MS + 1000);
  const legacy = message();
  delete legacy.deletedAt;
  assert.equal(canEditMessage(legacy, ME, now), true);
  assert.equal(canDeleteMessage(legacy, ME, now), true);
});

test("message without text (attachments only) can be deleted, not edited", () => {
  const now = new Date(CREATED_MS + 1000);
  const filesOnly = message({ content: "   \n ", attachments: [{ id: "a1" }] });
  assert.equal(canEditMessage(filesOnly, ME, now), false);
  assert.equal(canDeleteMessage(filesOnly, ME, now), true);
  assert.equal(canEditMessage(message({ content: "" }), ME, now), false);
});

test("applyMessageUpdate replaces the message in the right page only", () => {
  const p1 = page(["m5", "m4", "m3"]);
  const p2 = page(["m2", "m1"], { page: 2 });
  const old = { pages: [p1, p2], pageParams: [1, 2] };
  const updated = message({ id: "m2", content: "edited", editedAt: "2026-10-01T11:00:00.000Z" });

  const next = applyMessageUpdate(old, updated);

  assert.notEqual(next, old);
  assert.equal(next.pages[0], p1, "untouched page keeps its reference");
  assert.notEqual(next.pages[1], p2);
  assert.equal(next.pages[1].data[0], updated);
  assert.equal(next.pages[1].data[1], p2.data[1], "other messages keep their reference");
  assert.equal(next.pages[1].total, p2.total);
  assert.equal(next.pages[1].page, 2);
  assert.deepEqual(next.pageParams, [1, 2]);
});

test("applyMessageUpdate does not mutate the input", () => {
  const p1 = page(["m2", "m1"]);
  const old = { pages: [p1], pageParams: [1] };
  const snapshot = structuredClone(old);
  applyMessageUpdate(old, message({ id: "m1", content: "edited" }));
  assert.deepEqual(old, snapshot);
});

test("applyMessageUpdate returns the same object when the message isn't cached", () => {
  const old = { pages: [page(["m2", "m1"])], pageParams: [1] };
  assert.equal(applyMessageUpdate(old, message({ id: "zzz" })), old);
});

test("applyMessageUpdate passes undefined through (query not loaded)", () => {
  assert.equal(applyMessageUpdate(undefined, message()), undefined);
});

test("applyMessageDeleted blanks content and attachments and sets deletedAt", () => {
  const p1 = page(["m3"]);
  const p2 = {
    ...page([], { page: 2 }),
    data: [message({ id: "m2", attachments: [{ id: "a1" }], editedAt: "2026-10-01T10:30:00.000Z" }), message({ id: "m1" })],
  };
  const old = { pages: [p1, p2], pageParams: [1, 2] };
  const deletedAt = "2026-10-01T12:00:00.000Z";

  const next = applyMessageDeleted(old, { messageId: "m2", deletedAt });

  assert.equal(next.pages[0], p1);
  const m2 = next.pages[1].data[0];
  assert.equal(m2.deletedAt, deletedAt);
  assert.equal(m2.content, "");
  assert.deepEqual(m2.attachments, []);
  // Author, time and position stay.
  assert.equal(m2.id, "m2");
  assert.equal(m2.senderId, ME);
  assert.equal(m2.createdAt, CREATED_AT);
  assert.equal(next.pages[1].data[1], p2.data[1]);
  // Input untouched.
  assert.equal(p2.data[0].content, "hello");
  assert.equal(p2.data[0].attachments.length, 1);
  assert.equal(p2.data[0].deletedAt, null);
});

test("applyMessageDeleted returns the same object when the message isn't cached", () => {
  const old = { pages: [page(["m1"])], pageParams: [1] };
  assert.equal(applyMessageDeleted(old, { messageId: "nope", deletedAt: CREATED_AT }), old);
  assert.equal(applyMessageDeleted(undefined, { messageId: "m1", deletedAt: CREATED_AT }), undefined);
});

test("applyMessageDeleted is idempotent (author gets the socket event after the mutation)", () => {
  const old = { pages: [page(["m1"])], pageParams: [1] };
  const deletedAt = "2026-10-01T12:00:00.000Z";
  const once = applyMessageDeleted(old, { messageId: "m1", deletedAt });
  const twice = applyMessageDeleted(once, { messageId: "m1", deletedAt });
  assert.equal(twice, once);
});

test("applyMessageUpdate never brings a deleted message back (stale update after delete)", () => {
  const deleted = message({ id: "m1", content: "", deletedAt: "2026-10-01T12:00:00.000Z" });
  const old = { pages: [{ ...page([]), data: [deleted] }], pageParams: [1] };
  const stale = message({ id: "m1", content: "edited", editedAt: "2026-10-01T11:00:00.000Z" });
  assert.equal(applyMessageUpdate(old, stale), old);
});
