"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UpdateMessageBodySchema } from "@/lib/validations/chat.scheme";

const MESSAGE_MAX_LENGTH = 5000;

interface EditMessageFormProps {
  initialContent: string;
  isPending: boolean;
  // Called with the trimmed text, only when it actually changed.
  onSave: (content: string) => void;
  onCancel: () => void;
}

// Inline edit of an own message's text, in place of the bubble text. Same
// keys as the composer: Enter saves, Shift+Enter adds a line break; Esc
// cancels. The parent closes the form on success (or when the message can't
// be changed anymore); on any other error the text stays here.
export default function EditMessageForm({
  initialContent,
  isPending,
  onSave,
  onCancel,
}: EditMessageFormProps) {
  const t = useTranslations("chat.messages");
  const [draft, setDraft] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSave = UpdateMessageBodySchema.safeParse({ content: draft }).success;

  // Caret at the end of the text when the form opens.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // The textarea is disabled while saving, which drops focus — restore it if
  // the form stays open (the save failed).
  useEffect(() => {
    if (!isPending) textareaRef.current?.focus();
  }, [isPending]);

  const handleSave = () => {
    if (!canSave || isPending) return;
    const trimmed = draft.trim();
    if (trimmed === initialContent.trim()) {
      onCancel();
      return;
    }
    onSave(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (!isPending) onCancel();
    }
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MESSAGE_MAX_LENGTH}
        aria-label={t("editLabel")}
        className="min-h-[38px] max-h-48 resize-none bg-background max-md:text-base!"
        style={{ fontSize: 13 }}
        disabled={isPending}
      />
      <div className="flex justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer max-md:h-10"
          onClick={onCancel}
          disabled={isPending}
        >
          {t("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="cursor-pointer max-md:h-10"
          onClick={handleSave}
          disabled={isPending || !canSave}
        >
          {isPending && <Loader2 size={12} className="animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
