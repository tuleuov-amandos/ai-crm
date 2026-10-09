import { z } from "zod";
import {
  AI_KEY_MAX_LENGTH,
  AI_KEY_MIN_LENGTH,
  AI_PROVIDERS,
} from "@/lib/aiSettings";

// ─── GET /ai/settings, response of PUT /ai/settings ─────────────────────────
// keyLast4 comes to ADMIN only (null while no key is set). The key itself is
// never part of a response.
export const AiSettingsResSchema = z.object({
  configured: z.boolean(),
  provider: z.enum(AI_PROVIDERS).nullable(),
  keyLast4: z.string().nullable().optional(),
});

export type AiSettings = z.infer<typeof AiSettingsResSchema>;

// ─── Settings form — PUT /ai/settings ───────────────────────────────────────
// Mirrors the backend limits. Validation messages are i18n keys resolved via
// `t('settings.integrations.validation.<key>')`.
export const AiSettingsFormSchema = z.object({
  provider: z.enum(AI_PROVIDERS, "providerRequired"),
  apiKey: z
    .string()
    .trim()
    .min(1, "keyRequired")
    .min(AI_KEY_MIN_LENGTH, "keyMin")
    .max(AI_KEY_MAX_LENGTH, "keyMax"),
});

export type AiSettingsFormValues = z.infer<typeof AiSettingsFormSchema>;

export type UpdateAiSettingsBodyType = AiSettingsFormValues;
