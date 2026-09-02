// Shared password-strength heuristic used by the register form and the
// "change password" settings screen. The `labelKey` / criteria `key` values are
// i18n keys under the `auth.register.strength` namespace.

export type StrengthLevel = 0 | 1 | 2 | 3;

export interface StrengthResult {
  level: StrengthLevel;
  labelKey: string;
  colorClass: string;
  bgClass: string;
  criteria: { key: string; met: boolean }[];
}

export function getPasswordStrength(pw: string): StrengthResult {
  const criteria = [
    { key: "min8", met: pw.length >= 8 },
    { key: "digit", met: /\d/.test(pw) },
    { key: "uppercase", met: /[A-Z]/.test(pw) },
  ];
  const metCount = criteria.filter((c) => c.met).length as StrengthLevel;
  const levels: { labelKey: string; colorClass: string; bgClass: string }[] = [
    { labelKey: "", colorClass: "text-muted-foreground", bgClass: "bg-muted" },
    { labelKey: "weak", colorClass: "text-red-500 dark:text-red-400", bgClass: "bg-red-500 dark:bg-red-400" },
    { labelKey: "medium", colorClass: "text-amber-500 dark:text-amber-400", bgClass: "bg-amber-500 dark:bg-amber-400" },
    { labelKey: "strong", colorClass: "text-green-600 dark:text-green-400", bgClass: "bg-green-600 dark:bg-green-400" },
  ];
  return { level: metCount, ...levels[metCount], criteria };
}
