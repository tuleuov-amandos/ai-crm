import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Основная аудитория — Казахстан/СНГ, поэтому дефолт ru.
  locales: ["ru", "en"],
  defaultLocale: "ru",
  // Всегда показываем префикс локали в URL: / -> /ru
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
