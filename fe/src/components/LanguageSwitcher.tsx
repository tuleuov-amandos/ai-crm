"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LABELS: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
};

interface LanguageSwitcherProps {
  /** Overrides the trigger width/spacing. Defaults to a full-width trigger
   *  (sidebar). Pass e.g. "w-auto" for compact navbar/auth placements. */
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const onChange = (next: string) => {
    if (next === locale) return;
    // Keep query params across the locale switch. Reading them here (in the
    // click handler) avoids the useSearchParams() Suspense boundary.
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    startTransition(() => {
      // pathname здесь уже без префикса локали — next-intl подставит нужный
      router.replace(`${pathname}${search}`, { locale: next as Locale });
    });
  };

  return (
    <Select value={locale} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger
        size="sm"
        className={cn("h-8 w-full gap-2 text-xs", className)}
        aria-label={t("switchLanguage")}
      >
        <Languages size={14} className="shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l} className="text-xs">
            {LABELS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
