import { createZodDto } from 'nestjs-zod'
import z from 'zod'

// Stable keys the frontend maps to localized labels (settings.workspace.*).
export const INDUSTRY_KEYS = ['it', 'finance', 'retail', 'healthcare', 'manufacturing', 'other'] as const
export const COMPANY_SIZE_KEYS = ['xs', 'sm', 'md', 'lg', 'xl'] as const
export const WORKSPACE_LOCALE_KEYS = ['ru', 'en'] as const

/** True for an IANA zone the runtime recognises (`Intl` throws otherwise). */
function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Optional free-text field. Semantics:
 *  - key omitted        → field left unchanged
 *  - "" (or whitespace) → field cleared (stored as NULL)
 *  - null               → field cleared
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()

// PATCH /tenants/me — every field optional so the client can send a partial
// patch; `.strict()` rejects unknown keys (e.g. `id`, `slug`, `status`, which
// are not user-editable).
export const UpdateTenantSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    website: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v.length === 0 || /^https?:\/\/.+/i.test(v), { message: 'invalid_url' })
      .transform((v) => (v.length === 0 ? null : v))
      .nullable()
      .optional(),
    address: optionalText(500),
    companySize: z.enum(COMPANY_SIZE_KEYS).nullable().optional(),
    industry: z.enum(INDUSTRY_KEYS).nullable().optional(),
    timezone: z
      .string()
      .trim()
      .max(64)
      .refine((v) => v.length === 0 || isValidTimeZone(v), { message: 'invalid_timezone' })
      .transform((v) => (v.length === 0 ? null : v))
      .nullable()
      .optional(),
    defaultLocale: z.enum(WORKSPACE_LOCALE_KEYS).nullable().optional(),
  })
  .strict()

export class UpdateTenantDto extends createZodDto(UpdateTenantSchema) {}
export type UpdateTenantType = z.infer<typeof UpdateTenantSchema>
