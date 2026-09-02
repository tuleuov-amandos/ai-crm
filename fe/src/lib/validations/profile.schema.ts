import { z } from "zod";

// Validation messages are stored as i18n keys (namespace
// `settings.account.validation`); the component resolves them with
// `t(errors.<field>.message)` — same pattern as the auth forms.

export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;

export const ProfileFormSchema = z.object({
  name: z.string().trim().min(2, "nameMin").max(80, "nameMax"),
});

export type ProfileFormValues = z.infer<typeof ProfileFormSchema>;

export const ChangePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "currentRequired"),
    newPassword: z
      .string()
      .min(8, "newMin")
      .regex(PASSWORD_COMPLEXITY_REGEX, "newComplexity"),
    confirmPassword: z.string().min(1, "confirmRequired"),
  })
  .superRefine(({ currentPassword, newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({ code: "custom", message: "confirmMismatch", path: ["confirmPassword"] });
    }
    if (currentPassword && newPassword && currentPassword === newPassword) {
      ctx.addIssue({ code: "custom", message: "newSameAsCurrent", path: ["newPassword"] });
    }
  });

export type ChangePasswordFormValues = z.infer<typeof ChangePasswordFormSchema>;

// Avatar upload constraints — mirror the backend (CloudinaryService).
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
