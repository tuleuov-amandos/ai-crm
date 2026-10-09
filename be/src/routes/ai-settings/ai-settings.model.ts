import { z } from 'zod'

// Provider names in the API. The DB enum (AiProvider) holds the same values in
// upper case; the repository maps between the two.
export const AI_PROVIDERS = ['openai', 'groq', 'anthropic'] as const
export type AiProviderApi = (typeof AI_PROVIDERS)[number]

export const AI_KEY_MIN_LENGTH = 10
export const AI_KEY_MAX_LENGTH = 500

// ─────────────────────────────────────────
// GET /ai/settings, response of PUT /ai/settings
// ─────────────────────────────────────────
// keyLast4 goes to ADMIN only (null when no key is set); other roles get the
// object without it. The key itself is never part of a response.
export const AiSettingsResSchema = z.object({
  configured: z.boolean(),
  provider: z.enum(AI_PROVIDERS).nullable(),
  keyLast4: z.string().nullable().optional(),
})
export type AiSettingsRes = z.infer<typeof AiSettingsResSchema>

// ─────────────────────────────────────────
// PUT /ai/settings
// ─────────────────────────────────────────
// No model field: the model is fixed per provider (config.ts).
export const UpdateAiSettingsBodySchema = z
  .object({
    provider: z.enum(AI_PROVIDERS),
    apiKey: z.string().trim().min(AI_KEY_MIN_LENGTH).max(AI_KEY_MAX_LENGTH),
  })
  .strict()
export type UpdateAiSettingsBodyType = z.infer<typeof UpdateAiSettingsBodySchema>
