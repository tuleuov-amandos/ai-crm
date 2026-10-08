"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MessageActionsProps {
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

// "⋯" menu on the current user's own messages (rendered only while they can
// still be changed, see canDeleteMessage). Shown on hover / keyboard focus on
// desktop and always on touch screens, where there is no hover.
export default function MessageActions({
  canEdit,
  onEdit,
  onDelete,
}: MessageActionsProps) {
  const t = useTranslations("chat.messages");
  // After picking an action, focus belongs to the edit field or the dialog,
  // not back on this trigger.
  const actionPickedRef = useRef(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("actions")}
          className="cursor-pointer text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
        >
          <MoreHorizontal size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-36"
        onCloseAutoFocus={(e) => {
          if (actionPickedRef.current) {
            e.preventDefault();
            actionPickedRef.current = false;
          }
        }}
      >
        {canEdit && (
          <DropdownMenuItem
            title={t("editHint")}
            className="cursor-pointer"
            onSelect={() => {
              actionPickedRef.current = true;
              onEdit();
            }}
          >
            <Pencil />
            {t("edit")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer"
          onSelect={() => {
            actionPickedRef.current = true;
            onDelete();
          }}
        >
          <Trash2 />
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
