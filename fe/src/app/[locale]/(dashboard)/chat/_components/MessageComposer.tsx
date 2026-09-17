"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSendMessage, useUploadAttachments } from "@/hooks/useChat";
import {
  ACTIVITY_ATTACHMENT_ACCEPT,
  validateActivityAttachmentFile,
} from "@/lib/activity-attachment";

// Not confirmed with the backend team beyond what chat.service enforces
// server-side (CHAT_ATTACHMENTS_MAX_COUNT) — kept in sync manually.
const CHAT_ATTACHMENTS_MAX_COUNT = 5;

interface MessageComposerProps {
  channelId: string;
}

export default function MessageComposer({ channelId }: MessageComposerProps) {
  const t = useTranslations("chat.composer");
  const tAttachment = useTranslations("chat.attachment");
  const sendMessage = useSendMessage(channelId);
  const uploadAttachments = useUploadAttachments();

  const [content, setContent] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPending = sendMessage.isPending || uploadAttachments.isPending;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const accepted: File[] = [];
    for (const file of files) {
      const error = validateActivityAttachmentFile(file);
      if (error) {
        toast.error(tAttachment(`errors.${error}`));
        continue;
      }
      accepted.push(file);
    }

    setPendingFiles((prev) => {
      const merged = [...prev, ...accepted];
      if (merged.length > CHAT_ATTACHMENTS_MAX_COUNT) {
        toast.error(tAttachment("errors.tooMany"));
        return merged.slice(0, CHAT_ATTACHMENTS_MAX_COUNT);
      }
      return merged;
    });
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || isPending) return;

    try {
      const message = await sendMessage.mutateAsync(trimmed);
      setContent("");
      const files = pendingFiles;
      setPendingFiles([]);
      if (files.length > 0) {
        await uploadAttachments.mutateAsync({ messageId: message.id, files });
      }
    } catch {
      // failure toast already shown inside the mutation hooks
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 border-t border-border p-3">
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {pendingFiles.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="flex items-center gap-1 bg-muted rounded-md px-2 py-1 text-muted-foreground"
              style={{ fontSize: 12 }}
            >
              <Paperclip size={11} />
              <span className="max-w-[140px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => removePendingFile(index)}
                className="hover:text-foreground bg-transparent border-0 cursor-pointer p-0"
                aria-label={tAttachment("remove")}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACTIVITY_ATTACHMENT_ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending || pendingFiles.length >= CHAT_ATTACHMENTS_MAX_COUNT}
        >
          <Paperclip size={14} />
        </Button>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          className="min-h-[38px] max-h-32 resize-none"
          style={{ fontSize: 13 }}
          disabled={isPending}
        />

        <Button
          type="button"
          size="icon"
          className="size-9 shrink-0"
          onClick={handleSubmit}
          disabled={isPending || !content.trim()}
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </Button>
      </div>
    </div>
  );
}
