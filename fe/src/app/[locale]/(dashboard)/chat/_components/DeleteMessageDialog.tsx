"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
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

interface DeleteMessageDialogProps {
  open: boolean;
  hasAttachments: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DeleteMessageDialog({
  open,
  hasAttachments,
  isPending,
  onConfirm,
  onClose,
}: DeleteMessageDialogProps) {
  const t = useTranslations("chat.messages");

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !next && !isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteDescription")}
            {hasAttachments && ` ${t("deleteAttachmentsNote")}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={isPending}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="cursor-pointer"
            disabled={isPending}
            onClick={(e) => {
              // Stay open until the request settles; the parent closes it.
              e.preventDefault();
              onConfirm();
            }}
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            {t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
