"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
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

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onChange = (next: string) => {
    if (next === locale) return;
    startTransition(() => {
      // pathname здесь уже без префикса локали — next-intl подставит нужный
      router.replace(pathname, { locale: next as Locale });
    });
  };

  return (
    <Select value={locale} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger
        size="sm"
        className="h-8 w-full gap-2 text-xs"
        aria-label="Сменить язык"
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
