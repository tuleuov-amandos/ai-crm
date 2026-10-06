"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ArchiveRestore, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Deal } from "./types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { PaymentStatusBadge } from "@/components/ui/PaymentStatusBadge";
import { ArchivedBadge } from "@/components/ui/ArchivedBadge";
import { isDealArchived } from "@/lib/dealArchive";
import { useMe } from "@/hooks/useAuth";
import { useUpdateDealPaymentStatus } from "@/hooks/useDeals";

interface Props {
  deal: Deal;
  // The column's stage is the WON stage
  isWon?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatValue(value: number, units: { billion: string; million: string }): string {
  if (value === 0) return "—";
  const millions = value / 1_000_000;
  if (millions >= 1000)
    return `${(millions / 1000).toFixed(1).replace(".0", "")} ${units.billion}`;
  return `${millions % 1 === 0 ? millions : millions.toFixed(1)}${units.million}`;
}

export function DealCard({ deal, isWon = false, onEdit, onDelete, onArchive, onUnarchive }: Props) {
  const t = useTranslations("pipeline");
  const units = { billion: t("units.billion"), million: t("units.million") };
  // An archived card is not draggable (no listeners); it stays a drop target
  // so other cards can still be dropped next to it.
  const isArchived = isDealArchived(deal);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: deal.id,
    disabled: isArchived,
  });

  const [hovered, setHovered] = useState(false);

  const { data: me } = useMe();
  const canTogglePayment = me?.role === "ADMIN" || me?.role === "MANAGER";
  const updatePaymentStatus = useUpdateDealPaymentStatus(deal.id);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : isArchived ? 0.6 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "bg-background rounded-lg px-3 py-2 select-none transition-shadow duration-150 relative",
        isArchived ? "cursor-default" : "cursor-grab touch-none",
        isWon ? "border-[1.5px] border-[#3B6D11]" : "border border-border/70",
        !isDragging && hovered
          ? "shadow-[0_2px_10px_rgba(0,0,0,0.07)]"
          : "shadow-none",
      )}
    >
      <div className="flex items-center gap-2 mb-0.5">
        {isWon && (
          <div className="size-4 shrink-0 rounded-full bg-[#3B6D11] flex items-center justify-center">
            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
              <path
                d="M1 3.5L3.5 6L8 1"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
        <Link
          href={`/pipeline/${deal.id}`}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          title={deal.title}
          className={cn(
            "block truncate transition-colors flex-1 min-w-0",
            hovered ? "text-primary" : "text-foreground",
          )}
          style={{
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.4,
            textDecoration: "none",
          }}
        >
          {deal.title}
        </Link>
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className={cn(
            "shrink-0 -my-1 transition-opacity",
            hovered ? "opacity-100" : "opacity-0",
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 border-0 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                style={{ fontSize: 13 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(); 
                }}
              >
                <Pencil size={12} className="mr-2" />
                {t("card.editDeal")}
              </DropdownMenuItem>
              <DropdownMenuItem
                style={{ fontSize: 13 }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isArchived) onUnarchive();
                  else onArchive();
                }}
              >
                {isArchived ? (
                  <ArchiveRestore size={12} className="mr-2" />
                ) : (
                  <Archive size={12} className="mr-2" />
                )}
                {isArchived ? t("archive.unarchive") : t("archive.archive")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                style={{ fontSize: 13 }}
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 size={12} className="mr-2" />
                {t("card.deleteDeal")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p
        className="text-muted-foreground"
        style={{ fontSize: 12, marginBottom: 6 }}
      >
        {deal.contact.name}
        {isArchived && <ArchivedBadge className="ml-1.5" />}
      </p>

      <div className="flex items-center gap-2">
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="min-w-0 shrink"
        >
          <PaymentStatusBadge
            isPaid={deal.isPaid}
            disabled={updatePaymentStatus.isPending}
            onToggle={
              canTogglePayment
                ? () =>
                    updatePaymentStatus.mutate({ isPaid: !deal.isPaid })
                : undefined
            }
            className="block max-w-full truncate"
          />
        </div>

        <span
          className="text-foreground min-w-0 truncate"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          {formatValue(Number(deal.value), units)}
        </span>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <Link
            href={`/pipeline/${deal.id}`}
            onClick={(e) => e.stopPropagation()}
            title={t("card.openDeal")}
            className={cn(
              "flex items-center justify-center size-[18px] rounded-[5px] text-muted-foreground transition-opacity",
              hovered ? "opacity-100" : "opacity-0",
            )}
            style={{ textDecoration: "none" }}
          >
            <ExternalLink size={11} />
          </Link>

          <Avatar className="size-5">
            <AvatarFallback
              className="border-0 bg-primary/10 text-primary"
              style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.02em" }}
            >
              {getInitials(deal.owner.name)}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}
