// Built-in roles provisioned for every workspace (see be `shared-user.repo.ts`).
// The backend forbids creating / renaming / deleting a role with one of these
// names, so their description is never user-editable and lives on the client
// only — translated via `common.systemRoleDescription.<name>`, never read from
// `Role.description` in the DB (which historically held Vietnamese seed text).
export const SYSTEM_ROLE_NAMES = ["ADMIN", "MANAGER", "SALES_REP"] as const;

export type SystemRoleName = (typeof SYSTEM_ROLE_NAMES)[number];

export const isSystemRole = (name: string): name is SystemRoleName =>
  (SYSTEM_ROLE_NAMES as readonly string[]).includes(name);

/**
 * Description text shown for a role. For system roles it is always the
 * translated constant; custom roles fall back to their DB description and then
 * to a generic per-name fallback.
 *
 * @param tCommon translator bound to the `common` namespace
 * @param tFallback resolver for the caller's `roleDescFallback` key
 */
export const resolveRoleDescription = (
  name: string,
  dbDescription: string | null | undefined,
  tCommon: (key: string) => string,
  tFallback: (name: string) => string,
): string => {
  if (isSystemRole(name)) return tCommon(`systemRoleDescription.${name}`);
  return dbDescription?.trim() || tFallback(name);
};
