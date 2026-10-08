// Unit tests for the "desktop only" config (see mobileAccess.ts).
// fe/ has no test runner yet, so these use Node's built-in runner and Node's
// TypeScript type stripping (Node >= 22.18 / 23.6):
//   cd fe && node --test src/lib/mobileAccess.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESKTOP_ONLY_ROUTES,
  DESKTOP_ONLY_SETTINGS_TABS,
  DESKTOP_ONLY_FEATURES,
  isDesktopOnlyRoute,
  isDesktopOnlySettingsTab,
  isDesktopOnlyFeature,
} from "./mobileAccess.ts";

test("routes: exact match and nested paths are desktop-only", () => {
  for (const route of DESKTOP_ONLY_ROUTES) {
    assert.equal(isDesktopOnlyRoute(route), true, route);
    assert.equal(isDesktopOnlyRoute(`${route}/x`), true, `${route}/x`);
    assert.equal(isDesktopOnlyRoute(`${route}/x/y`), true, `${route}/x/y`);
    assert.equal(isDesktopOnlyRoute(`${route}/`), true, `${route}/`);
  }
});

test("routes: match respects the segment boundary", () => {
  assert.equal(isDesktopOnlyRoute("/roles-x"), false);
  assert.equal(isDesktopOnlyRoute("/rolesx"), false);
  assert.equal(isDesktopOnlyRoute("/audit-logs-old"), false);
  assert.equal(isDesktopOnlyRoute("/reportsx/1"), false);
  assert.equal(isDesktopOnlyRoute("/x/roles"), false);
});

test("routes: regular screens and empty values are not desktop-only", () => {
  assert.equal(isDesktopOnlyRoute(""), false);
  assert.equal(isDesktopOnlyRoute("/"), false);
  for (const path of ["/dashboard", "/pipeline", "/contacts", "/contacts/1", "/tasks", "/activities", "/chat", "/settings"]) {
    assert.equal(isDesktopOnlyRoute(path), false, path);
  }
});

test("routes: the initial list is /roles, /audit-logs, /reports", () => {
  assert.deepEqual([...DESKTOP_ONLY_ROUTES].sort(), ["/audit-logs", "/reports", "/roles"]);
  for (const route of DESKTOP_ONLY_ROUTES) assert.ok(route.startsWith("/") && !route.endsWith("/"), route);
});

test("settings tabs: everything except profile and password", () => {
  assert.ok(DESKTOP_ONLY_SETTINGS_TABS.length > 0);
  for (const tab of [
    "workspace-info", "members", "invitations", "pipeline-stages",
    "billing", "invoices", "notifications", "integrations",
  ]) {
    assert.equal(isDesktopOnlySettingsTab(tab), true, tab);
  }
  assert.equal(isDesktopOnlySettingsTab("profile"), false);
  assert.equal(isDesktopOnlySettingsTab("password"), false);
  assert.equal(isDesktopOnlySettingsTab("unknown"), false);
  assert.equal(isDesktopOnlySettingsTab(""), false);
});

test("features: the list is not empty and has the initial keys", () => {
  assert.ok(DESKTOP_ONLY_FEATURES.length > 0);
  assert.equal(isDesktopOnlyFeature("contacts-import"), true);
  assert.equal(isDesktopOnlyFeature("deal-selection"), true);
  assert.equal(isDesktopOnlyFeature("nope"), false);
  assert.equal(isDesktopOnlyFeature(""), false);
});

test("lists have no duplicates", () => {
  for (const list of [DESKTOP_ONLY_ROUTES, DESKTOP_ONLY_SETTINGS_TABS, DESKTOP_ONLY_FEATURES]) {
    assert.equal(new Set(list).size, list.length);
  }
});
