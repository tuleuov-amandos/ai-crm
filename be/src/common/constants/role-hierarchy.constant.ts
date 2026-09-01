import { ROLE } from './role.constanst'

// Weight of built-in system roles, used to prevent privilege escalation
// (e.g. a MANAGER inviting/promoting someone to ADMIN).
export const ROLE_WEIGHT: Record<string, number> = {
  [ROLE.ADMIN]: 3,
  [ROLE.MANAGER]: 2,
  [ROLE.SALES_REP]: 1,
}

// Weight of a role being *assigned/targeted*. Unknown/custom roles fail
// closed to the highest weight — only ADMIN can grant them.
export function getRoleWeight(roleName: string): number {
  return ROLE_WEIGHT[roleName] ?? ROLE_WEIGHT[ROLE.ADMIN]
}

// Weight of the *requesting* user's own role. Unknown/custom roles must
// fail closed to the lowest weight here — defaulting to ADMIN would let
// a requester with an unrecognized role bypass the hierarchy check above.
export function getRequesterRoleWeight(roleName: string): number {
  return ROLE_WEIGHT[roleName] ?? 0
}
