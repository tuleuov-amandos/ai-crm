// Unit tests for the calendar-day helpers (see dateOnly.ts).
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/lib/dateOnly.test.mjs
// Node re-reads process.env.TZ on assignment, so one run covers several zones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toDateOnly, fromDateOnly } from "./dateOnly.ts";

const ZONES = ["Asia/Almaty", "UTC", "America/New_York", "Pacific/Kiritimati"];
// A mid-month day, month/year boundaries, and the US DST switch day.
const DAYS = [
  [2026, 6, 15],
  [2026, 3, 1],
  [2026, 3, 31],
  [2026, 1, 1],
  [2026, 12, 31],
  [2026, 3, 8],
];

const pad = (n) => String(n).padStart(2, "0");
const iso = ([y, m, d]) => `${y}-${pad(m)}-${pad(d)}`;

function inEachZone(fn) {
  const original = process.env.TZ;
  try {
    for (const tz of ZONES) {
      process.env.TZ = tz;
      fn(tz);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

test("toDateOnly keeps the day the calendar gave (local midnight) in every zone", () => {
  inEachZone((tz) => {
    for (const day of DAYS) {
      const picked = new Date(day[0], day[1] - 1, day[2]); // what DayPicker yields
      assert.equal(toDateOnly(picked), iso(day), `${tz} ${iso(day)}`);
    }
  });
});

test("fromDateOnly returns local midnight of the same day in every zone", () => {
  inEachZone((tz) => {
    for (const day of DAYS) {
      const date = fromDateOnly(iso(day));
      assert.ok(date instanceof Date, `${tz} ${iso(day)}`);
      assert.deepEqual(
        [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()],
        [day[0], day[1], day[2], 0, 0],
        `${tz} ${iso(day)}`,
      );
    }
  });
});

test("toDateOnly and fromDateOnly round-trip", () => {
  inEachZone((tz) => {
    for (const day of DAYS) {
      assert.equal(toDateOnly(fromDateOnly(iso(day))), iso(day), `${tz} ${iso(day)}`);
    }
  });
});

test("a time of day does not move the day", () => {
  inEachZone((tz) => {
    assert.equal(toDateOnly(new Date(2026, 5, 15, 23, 59, 59)), "2026-06-15", tz);
    assert.equal(toDateOnly(new Date(2026, 5, 15, 0, 0, 1)), "2026-06-15", tz);
  });
});

test("fromDateOnly rejects empty and invalid input", () => {
  for (const bad of ["", null, undefined, "garbage", "2026-13-40", "2026-02-30", "15/06/2026"]) {
    assert.equal(fromDateOnly(bad), undefined, String(bad));
  }
});
