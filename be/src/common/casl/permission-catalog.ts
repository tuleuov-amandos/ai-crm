/**
 * The global Permission catalog is populated exclusively by migration
 * 20260902130000_seed_permission_catalog_and_backfill_roles — never by the
 * request path. Tenant-provisioning transactions must fail loudly if it is
 * missing: silently creating a tenant whose ADMIN role has zero permissions
 * yields a 403 on /dashboard (and everywhere else) that only surfaces later,
 * for the end user.
 */

// Contact / Deal / Task / Activity × {create, read, update, delete}
export const EXPECTED_DOMAIN_PERMISSION_COUNT = 16

export const PERMISSION_CATALOG_NOT_SEEDED =
  'Permission catalog is not seeded (missing `manage:all` and/or domain permissions). ' +
  'Apply migration 20260902130000_seed_permission_catalog_and_backfill_roles ' +
  'before provisioning new tenants.'
