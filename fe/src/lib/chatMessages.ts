// Edit and soft delete of own chat messages (PATCH / DELETE
// /chat/channels/:id/messages/:messageId). Pure helpers, free of React, so
// they can be unit-tested (chatMessages.test.mjs). The backend stays the
// source of truth: these only decide what the UI offers and how the message
// cache is patched from mutation responses and socket events.
import type { InfiniteData } from "@tanstack/react-query";
import type {
  GetMessagesPaginatedResType,
  Message,
} from "@/lib/validations/chat.scheme";

// Keep in sync with be/src/routes/chat/chat.service.ts.
export const MESSAGE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

type MessagesCache = InfiniteData<GetMessagesPaginatedResType> | undefined;

type MessageRef = Pick<Message, "senderId" | "content" | "createdAt"> & {
  deletedAt?: string | null;
};

// Same boundary as the backend: allowed while createdAt >= now - window.
function isWithinEditWindow(createdAt: string, now: Date | number): boolean {
  const nowMs = typeof now === "number" ? now : now.getTime();
  return nowMs - new Date(createdAt).getTime() <= MESSAGE_EDIT_WINDOW_MS;
}

export function canDeleteMessage(
  message: MessageRef,
  currentUserId: string | undefined,
  now: Date | number,
): boolean {
  return (
    !!currentUserId &&
    message.senderId === currentUserId &&
    message.deletedAt == null &&
    isWithinEditWindow(message.createdAt, now)
  );
}

/** Same as delete, plus the message must have text (files only can't be edited). */
export function canEditMessage(
  message: MessageRef,
  currentUserId: string | undefined,
  now: Date | number,
): boolean {
  return (
    canDeleteMessage(message, currentUserId, now) &&
    message.content.trim().length > 0
  );
}

// Replaces the message with this id in every page. Pages without it keep
// their reference; the same cache object comes back when nothing changed.
function replaceMessage(
  old: MessagesCache,
  messageId: string,
  replace: (current: Message) => Message,
): MessagesCache {
  if (!old) return old;

  let changed = false;
  const pages = old.pages.map((page) => {
    const idx = page.data.findIndex((m) => m.id === messageId);
    if (idx === -1) return page;
    const next = replace(page.data[idx]);
    if (next === page.data[idx]) return page;
    changed = true;
    const data = [...page.data];
    data[idx] = next;
    return { ...page, data };
  });

  return changed ? { ...old, pages } : old;
}

/** Applies a PATCH response or a "messageUpdated" event. */
export function applyMessageUpdate(
  old: MessagesCache,
  message: Message,
): MessagesCache {
  return replaceMessage(old, message.id, (current) =>
    // Deletion is final: a late edit response must not bring the text back.
    current.deletedAt != null && message.deletedAt == null ? current : message,
  );
}

/** Applies a DELETE response or a "messageDeleted" event. */
export function applyMessageDeleted(
  old: MessagesCache,
  { messageId, deletedAt }: { messageId: string; deletedAt: string },
): MessagesCache {
  return replaceMessage(old, messageId, (current) =>
    current.deletedAt != null &&
    current.content === "" &&
    current.attachments.length === 0
      ? current
      : { ...current, deletedAt, content: "", attachments: [] },
  );
}
