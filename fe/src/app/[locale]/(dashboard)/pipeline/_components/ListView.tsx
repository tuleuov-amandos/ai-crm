"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/ui/StageBadge";
import { useDealPipelineStore } from "@/stores/dealCards-store";
import { useGetPipeline, useDeleteDeal } from "@/hooks/useDeals";
import { formatCurrency } from "@/lib/helper";
import { useRelativeTime } from "@/lib/format";
import { STAGES, type Deal } from "./types";
import { EditDealSheet } from "./EditDealSheet";

type SortKey = "title" | "value" | "closeDate";
type SortState = { key: SortKey; direction: "asc" | "desc" } | null;

export function ListView({ ownerId }: { ownerId?: string }) {
  const t = useTranslations("pipeline");
  const tCommon = useTranslations("common");
  const relativeTime = useRelativeTime();

  const { pipeline } = useDealPipelineStore();
  // react-query dedupes this against KanbanBoard's call (same queryKey)
  const { isLoading, isError, error } = useGetPipeline({ ownerId });
  const deleteDealMutation = useDeleteDeal();

  const [sort, setSort] = useState<SortState>(null);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);

  const deals = useMemo(() => STAGES.flatMap((s) => pipeline[s]), [pipeline]);

  const sortedDeals = useMemo(() => {
    if (!sort) return deals;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...deals].sort((a, b) => {
      let cmp = 0;
      if (sort.key === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sort.key === "value") {
        cmp = a.value - b.value;
      } else {
        cmp =
          new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime();
      }
      return cmp * factor;
    });
  }, [deals, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const handleDelete = () => {
    if (deletingDeal) {
      deleteDealMutation.mutate({
        id: deletingDeal.id,
        stage: deletingDeal.stage,
      });
      setDeletingDeal(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 size={24} className="animate-spin" />
          <p style={{ fontSize: 13 }}>{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2 text-center max-w-xs">
          <p
            className="text-destructive"
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            {t("loadError")}
          </p>
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>
            {(error as Error)?.message ?? tCommon("unknownError")}
          </p>
        </div>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center text-center max-w-xs">
          <p
            className="text-foreground mb-2"
            style={{ fontSize: 16, fontWeight: 600 }}
          >
            {t("empty.title")}
          </p>
          <p
            className="text-muted-foreground leading-relaxed"
            style={{ fontSize: 13 }}
          >
            {t("empty.description")}
          </p>
        </div>
      </div>
    );
  }

  const headerClass = "px-4 py-3 text-muted-foreground uppercase";
  const headerStyle = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
  } as const;

  const sortIcon = (key: SortKey) => {
    if (sort?.key !== key) {
      return <ChevronsUpDown size={12} className="opacity-40" />;
    }
    return sort.direction === "asc" ? (
      <ChevronUp size={12} />
    ) : (
      <ChevronDown size={12} />
    );
  };

  const sortableHead = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className="flex items-center gap-1 uppercase cursor-pointer hover:text-foreground transition-colors"
      style={headerStyle}
    >
      {label}
      {sortIcon(key)}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto rounded-lg border border-border/60 bg-background">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border/60">
            <TableHead className={headerClass} style={headerStyle}>
              {sortableHead("title", t("listView.colDeal"))}
            </TableHead>
            <TableHead className={headerClass} style={headerStyle}>
              {t("listView.colContact")}
            </TableHead>
            <TableHead className={headerClass} style={headerStyle}>
              {t("listView.colOwner")}
            </TableHead>
            <TableHead className={headerClass} style={headerStyle}>
              {sortableHead("value", t("listView.colValue"))}
            </TableHead>
            <TableHead className={headerClass} style={headerStyle}>
              {t("listView.colStage")}
            </TableHead>
            <TableHead className={headerClass} style={headerStyle}>
              {sortableHead("closeDate", t("listView.colCloseDate"))}
            </TableHead>
            <TableHead
              className={`${headerClass} w-[90px] text-right`}
              style={headerStyle}
            >
              {t("listView.colActions")}
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {sortedDeals.map((deal) => (
            <TableRow
              key={deal.id}
              className="group border-b border-border/40 hover:bg-muted/30"
            >
              {/* ── Deal ── */}
              <TableCell className="px-4 py-3">
                <Link
                  href={`/pipeline/${deal.id}`}
                  className="block text-foreground hover:text-primary transition-colors"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {deal.title}
                </Link>
                {deal.contact.company ? (
                  <p
                    className="text-muted-foreground"
                    style={{ fontSize: 11 }}
                  >
                    {deal.contact.company}
                  </p>
                ) : null}
              </TableCell>

              {/* ── Contact ── */}
              <TableCell className="px-4 py-3" style={{ fontSize: 12 }}>
                <Link
                  href={`/contacts/${deal.contactId}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  style={{ textDecoration: "none" }}
                >
                  {deal.contact.name}
                </Link>
              </TableCell>

              {/* ── Owner ── */}
              <TableCell
                className="px-4 py-3 text-muted-foreground"
                style={{ fontSize: 12 }}
              >
                {deal.owner.name}
              </TableCell>

              {/* ── Value ── */}
              <TableCell
                className="px-4 py-3 text-foreground whitespace-nowrap"
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                {formatCurrency(deal.value)}
              </TableCell>

              {/* ── Stage ── */}
              <TableCell className="px-4 py-3">
                <StageBadge stage={deal.stage} />
              </TableCell>

              {/* ── Close date ── */}
              <TableCell
                className="px-4 py-3 text-muted-foreground whitespace-nowrap"
                style={{ fontSize: 11 }}
              >
                {relativeTime(deal.closeDate)}
              </TableCell>

              {/* ── Actions (show on row hover) ── */}
              <TableCell className="px-3 py-3 w-[90px]">
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    onClick={() => setEditingDeal(deal)}
                    title={t("card.editDeal")}
                  >
                    <Pencil size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-muted/60"
                    onClick={() => setDeletingDeal(deal)}
                    title={t("card.deleteDeal")}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editingDeal && (
        <EditDealSheet
          deal={editingDeal}
          open={!!editingDeal}
          onOpenChange={(open) => {
            if (!open) setEditingDeal(null);
          }}
        />
      )}

      <AlertDialog
        open={!!deletingDeal}
        onOpenChange={(open) => {
          if (!open) setDeletingDeal(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontSize: 15 }}>
              {t("deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: 13 }}>
              {t.rich("deleteDialog.description", {
                title: deletingDeal?.title ?? "",
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ fontSize: 13 }}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              style={{ fontSize: 13 }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t("deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
