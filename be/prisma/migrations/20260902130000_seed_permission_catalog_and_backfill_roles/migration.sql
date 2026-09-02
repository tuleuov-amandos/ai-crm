-- ============================================================================
-- Seed the GLOBAL Permission catalog + backfill RolePermission for tenants
-- whose default roles were provisioned while the catalog was empty.
--
-- Root cause: the Permission catalog is only ever populated by prisma/seed.ts
-- (a destructive demo seeder never run against staging/prod). The deploy
-- pipeline runs `prisma migrate deploy` only. With an empty catalog, both
-- self-service registration paths silently skipped permission assignment
-- (`if (systemManageAll)` / empty findMany) -> every self-registered ADMIN got
-- zero permissions -> CASL ability empty -> `ability.cannot('read','Deal')`
-- -> 403 DASHBOARD_FORBIDDEN (and every other permission-gated endpoint).
--
-- Fully idempotent: re-running inserts nothing new.
-- ============================================================================

-- ─── 1. Permission catalog ──────────────────────────────────────────────────
-- Source of truth: prisma/seed.ts permissionsList (lines 88-113).
-- Deterministic ids (perm_<md5(action:subject)>) so even a manual re-run before
-- the unique (action, subject) index can't create duplicates.
INSERT INTO "Permission" ("id", "action", "subject", "description", "createdAt")
SELECT
  'perm_' || md5(v.action || ':' || v.subject),
  v.action, v.subject, v.description, CURRENT_TIMESTAMP
FROM (VALUES
  ('manage', 'all',       'Quản trị hệ thống toàn quyền'),
  ('create', 'Contact',   'Tạo liên hệ mới'),
  ('read',   'Contact',   'Xem thông tin liên hệ'),
  ('update', 'Contact',   'Sửa thông tin liên hệ'),
  ('delete', 'Contact',   'Xóa liên hệ'),
  ('create', 'Deal',      'Tạo Deal mới'),
  ('read',   'Deal',      'Xem Deal'),
  ('update', 'Deal',      'Cập nhật Deal'),
  ('delete', 'Deal',      'Xóa Deal'),
  ('create', 'Task',      'Tạo Task mới'),
  ('read',   'Task',      'Xem Task'),
  ('update', 'Task',      'Cập nhật Task'),
  ('delete', 'Task',      'Xóa Task'),
  ('create', 'Activity',  'Tạo Hoạt động mới'),
  ('read',   'Activity',  'Xem Hoạt động'),
  ('update', 'Activity',  'Sửa Hoạt động'),
  ('delete', 'Activity',  'Xóa Hoạt động'),
  ('read',   'Report',    'Xem phân tích & báo cáo chuyên sâu'),
  ('read',   'KpiTarget', 'Xem chỉ tiêu doanh số'),
  ('update', 'KpiTarget', 'Cập nhật chỉ tiêu doanh số')
) AS v(action, subject, description)
ON CONFLICT ("action", "subject") DO NOTHING;

-- ─── 2. Backfill: ADMIN roles with ZERO permissions -> manage:all ────────────
-- Guard: only roles that currently have NO RolePermission rows. A role with any
-- permission was either seeded correctly or customised by a tenant admin and
-- must not be touched here.
INSERT INTO "RolePermission" ("roleId", "permissionId", "conditions")
SELECT r."id", p."id", NULL
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" = 'ADMIN'
  AND p."action" = 'manage' AND p."subject" = 'all'
  AND NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id")
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- ─── 3. Backfill: MANAGER roles with ZERO permissions ───────────────────────
-- Mirrors SharedUserRepository.createTenantIncludeUser: every CRUD action on
-- Contact / Deal / Task / Activity, no ABAC conditions. (Report/KpiTarget are
-- NOT granted on the registration path — only prisma/seed.ts does that.)
INSERT INTO "RolePermission" ("roleId", "permissionId", "conditions")
SELECT r."id", p."id", NULL
FROM "Role" r
JOIN "Permission" p ON p."subject" IN ('Contact', 'Deal', 'Task', 'Activity')
WHERE r."name" = 'MANAGER'
  AND NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id")
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- ─── 4. Backfill: SALES_REP roles with ZERO permissions (ABAC-scoped) ───────
-- Mirrors SharedUserRepository.createTenantIncludeUser:
--   Contact / Deal -> {"ownerId": "${user.id}"}
--   Activity       -> {"userId":  "${user.id}"}
--   Task           -> no conditions
-- The ${user.id} placeholder is interpolated per-request by
-- interpolateConditions() in casl-ability.factory.ts.
INSERT INTO "RolePermission" ("roleId", "permissionId", "conditions")
SELECT
  r."id", p."id",
  CASE
    WHEN p."subject" = 'Activity'           THEN '{"userId": "${user.id}"}'::jsonb
    WHEN p."subject" IN ('Contact', 'Deal') THEN '{"ownerId": "${user.id}"}'::jsonb
    ELSE NULL
  END
FROM "Role" r
JOIN "Permission" p ON p."subject" IN ('Contact', 'Deal', 'Task', 'Activity')
WHERE r."name" = 'SALES_REP'
  AND NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id")
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
