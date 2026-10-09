// Unit tests for the "Analyze with AI" button state (see aiAnalyzeState.ts):
//   cd fe && node --test src/lib/aiAnalyzeState.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_SETTINGS_HREF,
  getAiAnalyzeState,
  parseSettingsTabParam,
} from "./aiAnalyzeState.ts";

const ROLES = ["ADMIN", "MANAGER", "SALES_REP"];

test("key is set: the button is enabled for every role, no hint", () => {
  for (const role of ROLES) {
    assert.deepEqual(
      getAiAnalyzeState({ role, configured: true, isLoading: false }),
      { disabled: false, hint: "none" },
      role,
    );
  }
});

test("no key: the button is disabled for every role", () => {
  for (const role of ROLES) {
    assert.equal(
      getAiAnalyzeState({ role, configured: false, isLoading: false }).disabled,
      true,
      role,
    );
  }
});

test("no key: ADMIN is told to add the key, other roles to ask the admin", () => {
  const state = (role) => getAiAnalyzeState({ role, configured: false, isLoading: false });
  assert.equal(state("ADMIN").hint, "adminAddKey");
  assert.equal(state("MANAGER").hint, "askAdmin");
  assert.equal(state("SALES_REP").hint, "askAdmin");
  // A custom role is not an admin either.
  assert.equal(state("Intern").hint, "askAdmin");
});

test("loading: disabled and no hint, whatever the other inputs say", () => {
  for (const role of [...ROLES, undefined]) {
    for (const configured of [true, false, undefined]) {
      assert.deepEqual(
        getAiAnalyzeState({ role, configured, isLoading: true }),
        { disabled: true, hint: "none" },
        `${role} ${configured}`,
      );
    }
  }
});

test("no key but the role is not known yet: disabled, no hint (so it does not flip from one text to another)", () => {
  assert.deepEqual(
    getAiAnalyzeState({ role: undefined, configured: false, isLoading: false }),
    { disabled: true, hint: "none" },
  );
});

test("status could not be loaded: the button is left to the backend (it answers AI_KEY_NOT_CONFIGURED), no hint", () => {
  for (const role of ROLES) {
    assert.deepEqual(
      getAiAnalyzeState({ role, configured: undefined, isLoading: false }),
      { disabled: false, hint: "none" },
      role,
    );
  }
});

test("the roles are compared as stored (ADMIN), not by the display name", () => {
  assert.equal(
    getAiAnalyzeState({ role: "Admin", configured: false, isLoading: false }).hint,
    "askAdmin",
  );
});

test("the link opens Settings on the integrations tab", () => {
  assert.equal(AI_SETTINGS_HREF, "/settings?tab=integrations");
});

test("parseSettingsTabParam returns a known tab from the query string", () => {
  const tabs = ["profile", "integrations"];
  assert.equal(parseSettingsTabParam("?tab=integrations", tabs), "integrations");
  assert.equal(parseSettingsTabParam("tab=profile", tabs), "profile");
  assert.equal(parseSettingsTabParam("?x=1&tab=integrations", tabs), "integrations");
});

test("parseSettingsTabParam ignores unknown or missing values", () => {
  const tabs = ["profile", "integrations"];
  assert.equal(parseSettingsTabParam("", tabs), null);
  assert.equal(parseSettingsTabParam("?tab=", tabs), null);
  assert.equal(parseSettingsTabParam("?tab=nope", tabs), null);
  assert.equal(parseSettingsTabParam("?other=integrations", tabs), null);
});
