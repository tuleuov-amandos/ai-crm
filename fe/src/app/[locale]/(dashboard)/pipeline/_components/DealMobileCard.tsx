"use client";

import { useTranslations } from "next-intl";
import { MapPin, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/ui/StageBadge";
import { ArchivedBadge } from "@/components/ui/ArchivedBadge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/helper";
import { isDealArchived } from "@/lib/dealArchive";
import { buildTelHref } from "@/lib/dealQuickActions";
import { formatAddressLine } from "@/lib/addressLine";
import type { Deal } from "./types";

// GET /deals/board returns only { id, name, company } for the contact today, so
// these three are undefined until the backend adds them; the card then leaves
// the address row and the call button out.
type ContactExtras = {
  phone?: string | null;
  address?: string | null;
  city?: string | null;
};

// Phone-only (< md) card of the pipeline list view. The whole card opens the
// deal through a stretched link on the title (no nested links, the browser
// keeps its link menu); the call link sits above that overlay (z-10), so a tap
// on it dials and does not open the deal.
export function DealMobileCard({
  deal,
  closeDateLabel,
}: {
  deal: Deal;
  closeDateLabel: string;
}) {
  const t = useTranslations("pipeline");
  const contact = deal.contact as Deal["contact"] & ContactExtras;
  const addressLine = formatAddressLine(contact.address, contact.city);
  const telHref = buildTelHref(contact.phone);

  return (
    <li
      className={cn(
        "relative flex flex-col gap-1.5 px-3 py-3 active:bg-muted/40",
        isDealArchived(deal) && "opacity-60",
      )}
    >
      {/* Row 1: title + value */}
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/pipeline/${deal.id}`}
          className="min-w-0 flex-1 truncate text-base font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/50"
        >
          {deal.title}
        </Link>
        <span className="shrink-0 text-base font-semibold text-foreground whitespace-nowrap">
          {formatCurrency(deal.value)}
        </span>
      </div>

      {/* Row 2: contact + company, stage */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">{deal.contact.name}</p>
          {deal.contact.company ? (
            <p className="truncate text-xs text-muted-foreground">
              {deal.contact.company}
            </p>
          ) : null}
        </div>
        <StageBadge
          stageId={deal.stageId}
          legacyStage={deal.stage}
          className="shrink-0"
        />
      </div>

      {/* Row 3: address of the contact, only when there is one */}
      {addressLine ? (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin size={14} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2 min-w-0 break-words">{addressLine}</span>
        </p>
      ) : null}

      {/* Row 4: close date, call */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{closeDateLabel}</span>
          {isDealArchived(deal) && <ArchivedBadge />}
        </div>
        {telHref ? (
          <Button
            asChild
            variant="outline"
            className="relative z-10 h-11 shrink-0 gap-2 px-4 text-sm"
          >
            <a href={telHref}>
              <Phone size={16} />
              {t("detail.call")}
            </a>
          </Button>
        ) : null}
      </div>
    </li>
  );
}
