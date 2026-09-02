import { z } from "zod";

// Stable keys stored on the workspace row; the UI maps each to a localized
// label (see messages `settings.workspace.industryOptions` / `sizeOptions` /
// `languageOptions`). Mirror of the backend `tenants.dto.ts`.
export const INDUSTRY_KEYS = [
  "it",
  "finance",
  "retail",
  "healthcare",
  "manufacturing",
  "other",
] as const;

export const COMPANY_SIZE_KEYS = ["xs", "sm", "md", "lg", "xl"] as const;

export const WORKSPACE_LOCALE_KEYS = ["ru", "en"] as const;

// Curated IANA zone shortlist for the picker. The stored value is the IANA id;
// the "(GMT±hh:mm)" label is computed at render time from the browser.
export const TIMEZONE_OPTIONS = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Almaty",
  "Asia/Tashkent",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
] as const;

// Validation messages are i18n keys resolved via
// `t('settings.workspace.validation.<key>')` — same pattern as the auth forms.
export const WorkspaceFormSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120, "nameMax"),
  website: z
    .string()
    .trim()
    .max(200, "websiteMax")
    .refine((v) => v === "" || /^https?:\/\/.+/i.test(v), "websiteInvalid"),
  address: z.string().trim().max(500, "addressMax"),
  companySize: z.string(),
  industry: z.string(),
  timezone: z.string(),
  defaultLocale: z.enum(WORKSPACE_LOCALE_KEYS),
});

export type WorkspaceFormValues = z.infer<typeof WorkspaceFormSchema>;

// Logo upload constraints — mirror the backend (CloudinaryService).
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
