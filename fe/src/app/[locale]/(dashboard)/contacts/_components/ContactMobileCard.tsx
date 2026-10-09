"use client";

import { useTranslations } from "next-intl";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/helper";
import { buildTelHref, buildWhatsAppHref } from "@/lib/dealQuickActions";
import { formatAddressLine } from "@/lib/addressLine";
import type { GetContactWithDealsActivitiesResType } from "@/lib/validations/contacts.scheme";

// Phone-only (< md) card of the contacts list. The whole card opens the contact
// through a stretched link on the name; the phone, call and WhatsApp links sit
// above that overlay (z-10), so a tap on them does not open the contact.
export function ContactMobileCard({
  contact,
}: {
  contact: GetContactWithDealsActivitiesResType;
}) {
  const t = useTranslations("contacts.table");
  const telHref = buildTelHref(contact.phone);
  const whatsAppHref = buildWhatsAppHref(contact.phone);
  const addressLine = formatAddressLine(contact.address, contact.city);

  return (
    <li className="relative flex flex-col gap-2 px-3 py-3 active:bg-muted/40">
      {/* Row 1: avatar, name, company */}
      <div className="flex items-center gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarFallback
            className="border-0"
            style={{
              background: "#C7C3F4",
              color: "#6B6B67",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {getInitials(contact.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Link
            href={`/contacts/${contact.id}`}
            className="block truncate text-base font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/50"
          >
            {contact.name}
          </Link>
          {contact.company ? (
            <p className="truncate text-sm text-muted-foreground">
              {contact.company}
            </p>
          ) : null}
        </div>
      </div>

      {/* Row 2: phone and the two 44 px buttons, only when there is a phone */}
      {telHref ? (
        <div className="flex items-center justify-between gap-3">
          <a
            href={telHref}
            className="relative z-10 flex min-h-11 min-w-0 items-center whitespace-nowrap text-base text-foreground"
          >
            {contact.phone}
          </a>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="relative z-10 size-11"
            >
              <a href={telHref} aria-label={t("call")} title={t("call")}>
                <Phone size={18} />
              </a>
            </Button>
            {whatsAppHref ? (
              <Button
                asChild
                variant="outline"
                className="relative z-10 size-11"
              >
                <a
                  href={whatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("whatsapp")}
                  title={t("whatsapp")}
                >
                  <MessageCircle size={18} style={{ color: "#25D366" }} />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Row 3: address, only when there is one */}
      {addressLine ? (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin size={14} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2 min-w-0 break-words">{addressLine}</span>
        </p>
      ) : null}
    </li>
  );
}
