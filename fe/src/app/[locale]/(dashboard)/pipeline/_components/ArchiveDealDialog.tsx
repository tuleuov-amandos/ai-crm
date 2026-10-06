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
export function ArchiveDealDialog({
  dealTitle,
  open,
  onOpenChange,
  onConfirm,
}: {
  dealTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("pipeline.archive.dialog");
  const tCommon = useTranslations("common");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ fontSize: 15 }}>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: 13 }}>
            {t.rich("description", {
              title: dealTitle,
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
          style={{ fontSize: 13 }}
        >
          {t("warning")}
        </p>
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
