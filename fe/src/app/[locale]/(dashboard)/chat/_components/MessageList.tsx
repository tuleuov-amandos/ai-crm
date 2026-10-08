"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { isToday, isYesterday, isSameDay } from "date-fns";
import { Check, Loader2, Paperclip } from "lucide-react";
import {
  isStaleMessageError,
  useChannelMembers,
  useDeleteMessage,
  useMessages,
  useUpdateMessage,
} from "@/hooks/useChat";
import { useMe } from "@/hooks/useAuth";
import { useRelativeTime } from "@/lib/format";
import { getAvatarColors, getInitials } from "@/lib/helper";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChannelMember, Message } from "@/lib/validations/chat.scheme";
import { canDeleteMessage, canEditMessage } from "@/lib/chatMessages";
import { ApiError } from "@/types/error.type";
import MessageActions from "./MessageActions";
import EditMessageForm from "./EditMessageForm";
import DeleteMessageDialog from "./DeleteMessageDialog";

const NEAR_BOTTOM_THRESHOLD = 80;
const NEAR_TOP_THRESHOLD = 80;
// How often the 24h edit window is re-checked, so the actions menu goes away
// on its own once a message gets too old.
const NOW_TICK_MS = 60_000;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

interface MessageListProps {
  channelId: string;
}

export default function MessageList({ channelId }: MessageListProps) {
  const t = useTranslations("chat.messages");
  const relativeTime = useRelativeTime();
  const format = useFormatter();
  const { data: me } = useMe();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useMessages(channelId);
  const { data: members } = useChannelMembers(channelId);
  const updateMessage = useUpdateMessage(channelId);
  const deleteMessage = useDeleteMessage(channelId);
  const now = useNow();

  // One message at a time is edited / confirmed for deletion. The channel id
  // is stored alongside so switching channels drops both without an effect.
  const [editing, setEditing] = useState<{ channelId: string; messageId: string } | null>(null);
  const [deleting, setDeleting] = useState<{ channelId: string; message: Message } | null>(null);
  const editingId = editing?.channelId === channelId ? editing.messageId : null;
  const deletingMessage = deleting?.channelId === channelId ? deleting.message : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevNewestIdRef = useRef<string | undefined>(undefined);
  const prevOldestIdRef = useRef<string | undefined>(undefined);
  const prevScrollHeightRef = useRef<number | undefined>(undefined);
  const isLoadingMoreRef = useRef(false);

  // Pages come newest-first from the API; flatten + reverse into
  // chronological (oldest → newest) order for top-to-bottom rendering.
  const messages = useMemo(() => {
    const flat = data?.pages.flatMap((page) => page.data) ?? [];
    return [...flat].reverse();
  }, [data]);

  const newestMessage = messages[messages.length - 1];
  const oldestMessageId = messages[0]?.id;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (
      isLoadingMoreRef.current &&
      prevScrollHeightRef.current !== undefined &&
      // Only once the older page has actually landed: an edit/delete patching
      // the cache meanwhile must not consume this adjustment.
      oldestMessageId !== prevOldestIdRef.current
    ) {
      // Older messages were prepended at the top — keep the visual scroll
      // position stable instead of jumping.
      el.scrollTop = el.scrollHeight - prevScrollHeightRef.current + el.scrollTop;
      isLoadingMoreRef.current = false;
      prevScrollHeightRef.current = undefined;
      prevOldestIdRef.current = oldestMessageId;
      return;
    }
    prevOldestIdRef.current = oldestMessageId;

    if (newestMessage?.id !== prevNewestIdRef.current) {
      if (prevNewestIdRef.current === undefined || isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    }
    prevNewestIdRef.current = newestMessage?.id;
  }, [messages, newestMessage, oldestMessageId]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  };

  const handleLoadMore = () => {
    const el = containerRef.current;
    if (el) prevScrollHeightRef.current = el.scrollHeight;
    isLoadingMoreRef.current = true;
    fetchNextPage().then((result) => {
      // Nothing was prepended — drop the pending scroll adjustment.
      if (result.isError) {
        isLoadingMoreRef.current = false;
        prevScrollHeightRef.current = undefined;
      }
    });
  };

  const closeEditing = () => setEditing(null);
  // A late response must not close the form of another message opened since.
  const closeEditingOf = (messageId: string) =>
    setEditing((current) => (current?.messageId === messageId ? null : current));

  const handleSaveEdit = (messageId: string, content: string) => {
    updateMessage.mutate(
      { messageId, content },
      {
        onSuccess: () => closeEditingOf(messageId),
        onError: (error: ApiError) => {
          if (isStaleMessageError(error)) closeEditingOf(messageId);
        },
      },
    );
  };

  const closeDeleting = () => setDeleting(null);

  const handleConfirmDelete = () => {
    if (!deletingMessage) return;
    const messageId = deletingMessage.id;
    deleteMessage.mutate(messageId, {
      onSuccess: () => {
        closeDeleting();
        closeEditingOf(messageId);
      },
      onError: (error: ApiError) => {
        if (isStaleMessageError(error)) closeDeleting();
      },
    });
  };

  const formatDayLabel = (date: Date): string => {
    if (isToday(date)) return t("today");
    if (isYesterday(date)) return t("yesterday");
    return format.dateTime(date, { day: "numeric", month: "long", year: "numeric" });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3"
    >
      {hasNextPage && (
        <div className="flex justify-center pb-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage && <Loader2 size={12} className="animate-spin" />}
            {t("loadMore")}
          </Button>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground" style={{ fontSize: 13 }}>
          {t("empty")}
        </div>
      ) : (
        messages.map((message, index) => {
          const prevMessage = messages[index - 1];
          const showDateSeparator =
            !prevMessage ||
            !isSameDay(new Date(prevMessage.createdAt), new Date(message.createdAt));

          return (
            <div key={message.id} className="flex flex-col gap-3">
              {showDateSeparator && (
                <div className="flex justify-center">
                  <span
                    className="bg-muted text-muted-foreground rounded-full px-3 py-1"
                    style={{ fontSize: 11 }}
                  >
                    {formatDayLabel(new Date(message.createdAt))}
                  </span>
                </div>
              )}
              <MessageRow
                message={message}
                relativeTime={relativeTime}
                isOwn={message.senderId === me?.id}
                members={members}
                canEdit={canEditMessage(message, me?.id, now)}
                canDelete={canDeleteMessage(message, me?.id, now)}
                isEditing={editingId === message.id}
                isSaving={updateMessage.isPending}
                onEdit={() => setEditing({ channelId, messageId: message.id })}
                onCancelEdit={closeEditing}
                onSaveEdit={(content) => handleSaveEdit(message.id, content)}
                onDelete={() => setDeleting({ channelId, message })}
              />
            </div>
          );
        })
      )}

      <DeleteMessageDialog
        open={!!deletingMessage}
        hasAttachments={(deletingMessage?.attachments.length ?? 0) > 0}
        isPending={deleteMessage.isPending}
        onConfirm={handleConfirmDelete}
        onClose={closeDeleting}
      />
    </div>
  );
}

function MessageRow({
  message,
  relativeTime,
  isOwn,
  members,
  canEdit,
  canDelete,
  isEditing,
  isSaving,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  message: Message;
  relativeTime: (date?: string | Date | null) => string;
  isOwn: boolean;
  members: ChannelMember[] | undefined;
  canEdit: boolean;
  canDelete: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (content: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("chat.messages");
  const colors = getAvatarColors(message.senderId);
  const isDeleted = message.deletedAt != null;
  // A message deleted meanwhile (another tab) closes its edit form.
  const showEditForm = isOwn && isEditing && !isDeleted;

  const deletedPlaceholder = (
    <div className="rounded-2xl border border-border px-3 py-2 min-w-0 inline-block">
      <p className="text-muted-foreground italic" style={{ fontSize: 13 }}>
        {t("deleted")}
      </p>
    </div>
  );

  const editedMark = message.editedAt && !isDeleted && (
    <span
      className="text-muted-foreground"
      style={{ fontSize: 11 }}
      title={t("editedAt", { time: relativeTime(message.editedAt) })}
    >
      {t("edited")}
    </span>
  );

  const attachments = message.attachments.length > 0 && (
    <div className="flex flex-wrap gap-2 mt-1.5">
      {message.attachments.map((attachment) =>
        attachment.mimeType.startsWith("image/") ? (
          <a key={attachment.id} href={attachment.url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.url}
              alt={attachment.fileName}
              className="max-h-32 rounded-md border border-border object-cover"
            />
          </a>
        ) : (
          <a
            key={attachment.id}
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className={
              isOwn
                ? "flex items-center gap-1.5 text-primary-foreground hover:underline"
                : "flex items-center gap-1.5 text-primary hover:underline"
            }
            style={{ fontSize: 12, textDecoration: "none" }}
          >
            <Paperclip size={12} />
            {attachment.fileName}
          </a>
        ),
      )}
    </div>
  );

  if (isOwn) {
    return (
      <div className="group flex items-start justify-end gap-2.5">
        <div className={cn("flex flex-col items-end max-w-[75%]", showEditForm && "w-full")}>
          {isDeleted ? (
            deletedPlaceholder
          ) : showEditForm ? (
            <>
              <EditMessageForm
                initialContent={message.content}
                isPending={isSaving}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
              />
              {attachments && (
                <div className="bg-primary text-primary-foreground rounded-2xl px-3 py-2 mt-1.5 min-w-0">
                  {attachments}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1 max-w-full">
              {canDelete && (
                <MessageActions canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
              )}
              <div className="bg-primary text-primary-foreground rounded-2xl px-3 py-2 min-w-0">
                {message.content && (
                  <p className="whitespace-pre-wrap break-words" style={{ fontSize: 13 }}>
                    {message.content}
                  </p>
                )}
                {attachments}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-foreground" style={{ fontSize: 11 }}>
              {relativeTime(message.createdAt)}
            </span>
            {editedMark}
            {!isDeleted && <ReadReceipt message={message} members={members} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <Avatar className="size-8 shrink-0">
        {message.sender.avatarUrl && (
          <AvatarImage src={message.sender.avatarUrl} alt={message.sender.name} />
        )}
        <AvatarFallback
          className="border-0"
          style={{ background: colors.bg, color: colors.color, fontSize: 11, fontWeight: 600 }}
        >
          {getInitials(message.sender.name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 max-w-[75%]">
        <div className="flex items-baseline gap-2">
          <span className="text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>
            {message.sender.name}
          </span>
          <span className="text-muted-foreground" style={{ fontSize: 11 }}>
            {relativeTime(message.createdAt)}
          </span>
          {editedMark}
        </div>

        {isDeleted ? (
          <div className="mt-1">{deletedPlaceholder}</div>
        ) : (
          <div className="bg-muted rounded-2xl px-3 py-2 mt-1 min-w-0 inline-block">
            {message.content && (
              <p className="text-foreground whitespace-pre-wrap break-words" style={{ fontSize: 13 }}>
                {message.content}
              </p>
            )}
            {attachments}
          </div>
        )}
      </div>
    </div>
  );
}

// Only ever rendered for the current user's own messages (see MessageRow
// above) — Y is every other channel member (all of `members` except the
// sender), X is how many of them have lastReadAt >= this message's
// createdAt. Renders nothing when there are no other members at all, per the
// spec (a channel where the sender is the only member shows no receipt).
function ReadReceipt({
  message,
  members,
}: {
  message: Message;
  members: ChannelMember[] | undefined;
}) {
  const t = useTranslations("chat.messages");

  const otherMembers = useMemo(
    () => (members ?? []).filter((member) => member.userId !== message.senderId),
    [members, message.senderId],
  );

  const messageCreatedAt = useMemo(
    () => new Date(message.createdAt).getTime(),
    [message.createdAt],
  );

  const readByIds = useMemo(
    () =>
      new Set(
        otherMembers
          .filter(
            (member) =>
              member.lastReadAt !== null &&
              new Date(member.lastReadAt).getTime() >= messageCreatedAt,
          )
          .map((member) => member.userId),
      ),
    [otherMembers, messageCreatedAt],
  );

  if (otherMembers.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:underline"
          style={{ fontSize: 11 }}
        >
          {t("readStatus", { count: readByIds.size, total: otherMembers.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="text-muted-foreground px-1 pb-2" style={{ fontSize: 11, fontWeight: 500 }}>
          {t("readByTitle")}
        </p>
        <div className="flex flex-col gap-0.5">
          {otherMembers.map((member) => {
            const isRead = readByIds.has(member.userId);
            const colors = getAvatarColors(member.userId);
            return (
              <div key={member.userId} className="flex items-center gap-2 px-1 py-1">
                <Avatar className="size-6 shrink-0">
                  {member.avatarUrl && (
                    <AvatarImage src={member.avatarUrl} alt={member.name} />
                  )}
                  <AvatarFallback
                    className="border-0"
                    style={{ background: colors.bg, color: colors.color, fontSize: 10, fontWeight: 600 }}
                  >
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "flex-1 truncate",
                    isRead ? "text-foreground" : "text-muted-foreground",
                  )}
                  style={{ fontSize: 12 }}
                >
                  {member.name}
                </span>
                {isRead ? (
                  <Check size={14} className="text-primary shrink-0" />
                ) : (
                  <span className="text-muted-foreground shrink-0" style={{ fontSize: 10 }}>
                    {t("unread")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
