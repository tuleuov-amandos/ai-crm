// Unit tests for the report month labels (see monthLabel.ts).
//   cd fe && node --test src/lib/monthLabel.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMonthLabel, parseMonth } from "./monthLabel.ts";

const ZONES = ["Asia/Almaty", "UTC", "America/New_York", "Pacific/Kiritimati"];

test("parseMonth reads YYYY-MM and T{n} as numbers", () => {
  assert.deepEqual(parseMonth("2026-09"), { year: 2026, month: 9 });
  assert.deepEqual(parseMonth("T12"), { month: 12 });
  assert.deepEqual(parseMonth("T1"), { month: 1 });
});

test("axis label is the short month name", () => {
  assert.equal(formatMonthLabel("T9", "en"), "Sep");
  assert.equal(formatMonthLabel("2026-09", "en"), "Sep");
  assert.match(formatMonthLabel("2026-09", "ru"), /^сен/);
});

test("tooltip label is the full month name with year when known", () => {
  assert.equal(formatMonthLabel("2026-09", "en", "long"), "September 2026");
  assert.match(formatMonthLabel("2026-09", "ru", "long"), /^Сентябрь 2026/);
  assert.equal(formatMonthLabel("T9", "en", "long", 2026), "September 2026");
});

test("T{n} without a known year shows the month name only", () => {
  assert.equal(formatMonthLabel("T9", "en", "long"), "September");
  assert.equal(formatMonthLabel("T9", "ru", "long"), "Сентябрь");
});

test("year boundaries: January and December", () => {
  assert.equal(formatMonthLabel("2026-01", "en", "long"), "January 2026");
  assert.equal(formatMonthLabel("2026-12", "en", "long"), "December 2026");
  assert.equal(formatMonthLabel("2026-01", "en"), "Jan");
  assert.equal(formatMonthLabel("2026-12", "en"), "Dec");
  assert.equal(formatMonthLabel("T1", "ru", "long"), "Январь");
  assert.equal(formatMonthLabel("T12", "ru", "long"), "Декабрь");
});

test("result does not depend on the process time zone", () => {
  for (const tz of ZONES) {
    process.env.TZ = tz;
    assert.equal(formatMonthLabel("2026-01", "en", "long"), "January 2026", tz);
    assert.equal(formatMonthLabel("2026-12", "en", "long"), "December 2026", tz);
    assert.equal(formatMonthLabel("T3", "en"), "Mar", tz);
  }
});

test("unexpected input is returned unchanged and never throws", () => {
  assert.equal(formatMonthLabel("", "en"), "");
  assert.equal(formatMonthLabel("foo", "en"), "foo");
  assert.equal(formatMonthLabel("2026-13", "en"), "2026-13");
  assert.equal(formatMonthLabel("T0", "en"), "T0");
  assert.equal(formatMonthLabel("T13", "en", "long"), "T13");
  assert.equal(formatMonthLabel(undefined, "en"), "");
  assert.equal(formatMonthLabel(null, "en"), "");
  assert.equal(formatMonthLabel("T9", "not a locale!!"), "T9");
});
