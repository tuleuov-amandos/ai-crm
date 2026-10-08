"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  MoreHorizontal,
  Share2,
  Plus,
  Bell,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/ui/StageBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DealLeftPanel }  from "../_components/DealLeftPanel";
import { DealRightPanel } from "../_components/DealRightPanel";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useDeleteDeal,
  useGetDealDetail,
  useArchiveDeals,
  useUnarchiveDeals,
} from "@/hooks/useDeals";
import { useDealActivities } from "@/hooks/useActivities";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { isDealArchived, needsArchiveConfirm } from "@/lib/dealArchive";
import { EditDealSheet } from "../_components/EditDealSheet";
import { ArchiveDealDialog } from "../_components/ArchiveDealDialog";
import {
  MobileDetailTabs,
  mobileTabPanelClass,
  type MobileDetailTab,
} from "@/components/mobile-detail-tabs";

export default function DealDetail() {
  const t = useTranslations("pipeline");
  const tCommon = useTranslations("common");
  const params = useParams();
  const id = params.id as string;

  const router = useRouter();
  
  const deal = useGetDealDetail(id).data;
  const deleteDeal = useDeleteDeal();
  const activitiesQuery = useDealActivities(id);
  const activities = activitiesQuery?.data || [];

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileDetailTab>("info");
  const archiveDeals = useArchiveDeals();
  const unarchiveDeals = useUnarchiveDeals();
  const { getDealStage } = usePipelineStages();

  const handleDelete = () => {
    if (deal) deleteDeal.mutate({ id, stageId: deal.stageId });
    router.push("/pipeline");
  };

  const archivePending = archiveDeals.isPending || unarchiveDeals.isPending;

  // Header button and the phone menu item. Open stage (or stages not loaded
  // yet): confirm first; won/lost: at once.
  const handleArchiveClick = () => {
    if (!deal) return;
    if (isDealArchived(deal)) unarchiveDeals.mutate([id]);
    else if (needsArchiveConfirm(getDealStage(deal)?.kind)) setArchiveOpen(true);
    else archiveDeals.mutate([id]);
  };

  if (!deal) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className="text-muted-foreground" style={{ fontSize: 14 }}>
          {t("notFound")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="h-14 shrink-0 border-b bg-background flex items-center justify-between px-6 gap-3 max-md:h-auto max-md:min-h-14 max-md:px-3 max-md:py-2">

        {/* Left: back + breadcrumb (on phones: back, title, stage) */}
        <div className="flex items-center gap-2.5 max-md:min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="size-7 border-border text-muted-foreground hover:text-foreground shrink-0 max-md:size-10"
            asChild
          >
            <Link href="/pipeline">
              <ArrowLeft size={13} />
            </Link>
          </Button>

          <div className="flex items-center gap-1.5 max-md:min-w-0">
            <Link
              href="/pipeline"
              className="text-muted-foreground hover:text-foreground transition-colors max-md:hidden"
              style={{ textDecoration: "none", fontSize: 13 }}
            >
              {t("title")}
            </Link>
            <span className="text-muted-foreground/40 max-md:hidden" style={{ fontSize: 12 }}>/</span>
            <Link
              href={`/contacts/${deal?.contact.id ?? ""}`}
              className="text-muted-foreground hover:text-foreground transition-colors max-md:hidden"
              style={{ textDecoration: "none", fontSize: 13 }}
            >
              {deal?.contact.name ?? ""}
            </Link>
            <span className="text-muted-foreground/40 max-md:hidden" style={{ fontSize: 12 }}>/</span>
            <span className="text-foreground max-md:truncate" style={{ fontSize: 13, fontWeight: 500 }}>
              {deal?.title ?? ""}
            </span>
            <StageBadge stageId={deal.stageId} legacyStage={deal.stage} className="ml-0.5 max-md:shrink-0" />
          </div>
        </div>

        {/* Right: action buttons (on phones only the menu) */}
        <div className="flex items-center gap-2 max-md:shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-border text-muted-foreground hover:text-foreground text-xs max-md:hidden"
          >
            <Bell size={12} />
            {t("detail.follow")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-border text-muted-foreground hover:text-foreground text-xs max-md:hidden"
          >
            <Share2 size={12} />
            {t("detail.share")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-border text-muted-foreground hover:text-foreground text-xs max-md:hidden"
            disabled={archivePending}
            onClick={handleArchiveClick}
          >
            {isDealArchived(deal) ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            {isDealArchived(deal) ? t("archive.unarchive") : t("archive.archive")}
          </Button>

          <Button size="sm" className="h-8 gap-1.5 text-xs max-md:hidden">
            <Plus size={13} />
            {t("detail.addActivity")}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-8 border-border text-muted-foreground hover:text-foreground max-md:size-10"
              >
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                style={{ fontSize: 13 }}
                onClick={() => setEditOpen(true)}
              >
                <Pencil size={12} className="mr-2" />
                {t("detail.editDeal")}
              </DropdownMenuItem>
              {/* Phones: the archive button of the header lives here */}
              <DropdownMenuItem
                style={{ fontSize: 13 }}
                className="md:hidden"
                disabled={archivePending}
                onClick={handleArchiveClick}
              >
                {isDealArchived(deal) ? (
                  <ArchiveRestore size={12} className="mr-2" />
                ) : (
                  <Archive size={12} className="mr-2" />
                )}
                {isDealArchived(deal) ? t("archive.unarchive") : t("archive.archive")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                style={{ fontSize: 13 }}
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={12} className="mr-2" />
                {t("detail.deleteDeal")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <MobileDetailTabs value={mobileTab} onChange={setMobileTab} />

      {/* ── Split content (on phones one tab at a time) ──────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <DealLeftPanel
          deal={deal}
          onEdit={() => setEditOpen(true)}
          className={mobileTabPanelClass(mobileTab, "info")}
        />
        <DealRightPanel
          dealId={id}
          activities={activities}
          className={mobileTabPanelClass(mobileTab, "activity")}
        />
      </div>

      {/* Edit sheet */}
      <EditDealSheet deal={deal} open={editOpen} onOpenChange={setEditOpen} />

      <ArchiveDealDialog
        dealTitle={deal.title}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={() => {
          archiveDeals.mutate([id]);
          setArchiveOpen(false);
        }}
      />

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontSize: 15 }}>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: 13 }}>
              {t.rich("deleteDialog.description", {
                title: deal?.title ?? "",
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ fontSize: 13 }}>{tCommon("cancel")}</AlertDialogCancel>
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
