"use client";
import { useTranslations } from "next-intl";
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

// Confirmation before archiving a deal on an open stage (see
// needsArchiveConfirm): the deal stays in reports and the forecast.
// With dealCount it confirms a bulk archive (always asked); the warning is
// shown when openCount of the deals are on open stages.
export function ArchiveDealDialog({
  open,
  onOpenChange,
  onConfirm,
  ...deals
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
} & ({ dealTitle: string } | { dealCount: number; openCount: number })) {
  const t = useTranslations("pipeline.archive.dialog");
  const tCommon = useTranslations("common");
  const bulk = "dealCount" in deals ? deals : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ fontSize: 15 }}>
            {bulk ? t("bulkTitle", { count: bulk.dealCount }) : t("title")}
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: 13 }}>
            {bulk
              ? t("bulkDescription")
              : t.rich("description", {
                  title: "dealTitle" in deals ? deals.dealTitle : "",
                  b: (chunks) => <strong>{chunks}</strong>,
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {(!bulk || bulk.openCount > 0) && (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
            style={{ fontSize: 13 }}
          >
            {bulk ? t("bulkOpenWarning", { count: bulk.openCount }) : t("warning")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel style={{ fontSize: 13 }}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} style={{ fontSize: 13 }}>
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
