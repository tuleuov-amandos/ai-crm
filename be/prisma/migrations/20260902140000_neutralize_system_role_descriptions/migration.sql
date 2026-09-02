-- ============================================================================
-- Clear the Vietnamese `description` seeded onto the built-in roles.
--
-- Background (same shape as 20260902130000): the default roles are provisioned
-- by three code paths, each with *different* Vietnamese strings:
--
--   Role      seed.ts (demo)       shared-user.repo.ts   auth.service.ts
--                                  (email/password reg)  (Google SSO reg)
--   ADMIN     "Quản trị viên"      "Quản trị viên        "Quản trị viên"
--                                   doanh nghiệp"
--   MANAGER   "Quản lý bán hàng"   "Quản lý đội ngũ"     "Quản lý"
--   SALES_REP "Nhân viên bán hàng" "Nhân viên kinh doanh" "Nhân viên kinh doanh"
--
-- The description of a built-in role (name IN ('ADMIN','MANAGER','SALES_REP'))
-- is not user-editable — the backend rejects createRole/updateRole/deleteRole
-- for those names — and the UI now renders a localized label from
-- `common.systemRoleDescription.<name>` instead of `Role.description`. So the
-- stored prose is dead data in the wrong language: null it out.
--
-- Safety: each UPDATE is scoped to its own role name AND matches only the
-- known historical Vietnamese values for that role. A description that is
-- already NULL, English, or anything a tenant set by hand is left untouched.
-- There is no `isSystem` column; `name` + the unique (tenantId, name) index is
-- the only marker, and a custom role can never take a reserved name.
--
-- Fully idempotent: after the first run every match is NULL, so re-running is a
-- no-op.
-- ============================================================================

UPDATE "Role"
SET "description" = NULL
WHERE "name" = 'ADMIN'
  AND "description" IN ('Quản trị viên', 'Quản trị viên doanh nghiệp');

UPDATE "Role"
SET "description" = NULL
WHERE "name" = 'MANAGER'
  AND "description" IN ('Quản lý bán hàng', 'Quản lý đội ngũ', 'Quản lý');

UPDATE "Role"
SET "description" = NULL
WHERE "name" = 'SALES_REP'
  AND "description" IN ('Nhân viên bán hàng', 'Nhân viên kinh doanh');
