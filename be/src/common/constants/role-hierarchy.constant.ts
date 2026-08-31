import { ROLE } from './role.constanst'

// Weight of built-in system roles, used to prevent privilege escalation
// (e.g. a MANAGER inviting/promoting someone to ADMIN).
export const ROLE_WEIGHT: Record<string, number> = {
  [ROLE.ADMIN]: 3,
  [ROLE.MANAGER]: 2,
  [ROLE.SALES_REP]: 1,
}

// Tenant-defined custom roles have no known weight, so they fail closed
// to the highest weight — only ADMIN can assign them.
export function getRoleWeight(roleName: string): number {
  return ROLE_WEIGHT[roleName] ?? ROLE_WEIGHT[ROLE.ADMIN]
}
