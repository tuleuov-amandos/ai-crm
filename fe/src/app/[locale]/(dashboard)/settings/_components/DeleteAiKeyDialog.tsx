"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRemoveAiSettings } from "@/hooks/useAiSettings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAiKeyDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("settings.integrations.deleteDialog");
  const tCommon = useTranslations("common");
  const removeKey = useRemoveAiSettings();

  const handleOpenChange = (next: boolean) => {
    if (!next && removeKey.isPending) return;
    onOpenChange(next);
  };

  const handleDelete = () => {
    removeKey.mutate(undefined, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeKey.isPending}>{tCommon("cancel")}</AlertDialogCancel>
          {/* Not AlertDialogAction: it would close the dialog before the request settles. */}
          <Button
            onClick={handleDelete}
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={removeKey.isPending}
          >
            {removeKey.isPending && <Loader2 size={14} className="animate-spin" />}
            {t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
