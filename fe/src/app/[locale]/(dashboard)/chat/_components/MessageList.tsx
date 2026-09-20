"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Paperclip } from "lucide-react";
import { useMessages } from "@/hooks/useChat";
import { useRelativeTime } from "@/lib/format";
import { getAvatarColors, getInitials } from "@/lib/helper";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Message } from "@/lib/validations/chat.scheme";

const NEAR_BOTTOM_THRESHOLD = 80;
const NEAR_TOP_THRESHOLD = 80;

interface MessageListProps {
  channelId: string;
}

export default function MessageList({ channelId }: MessageListProps) {
  const t = useTranslations("chat.messages");
  const relativeTime = useRelativeTime();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useMessages(channelId);

  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevNewestIdRef = useRef<string | undefined>(undefined);
  const prevScrollHeightRef = useRef<number | undefined>(undefined);
  const isLoadingMoreRef = useRef(false);

  // Pages come newest-first from the API; flatten + reverse into
  // chronological (oldest → newest) order for top-to-bottom rendering.
  const messages = useMemo(() => {
    const flat = data?.pages.flatMap((page) => page.data) ?? [];
    return [...flat].reverse();
  }, [data]);

  const newestMessage = messages[messages.length - 1];

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (isLoadingMoreRef.current && prevScrollHeightRef.current !== undefined) {
      // Older messages were prepended at the top — keep the visual scroll
      // position stable instead of jumping.
      el.scrollTop = el.scrollHeight - prevScrollHeightRef.current + el.scrollTop;
      isLoadingMoreRef.current = false;
      prevScrollHeightRef.current = undefined;
      return;
    }

    if (newestMessage?.id !== prevNewestIdRef.current) {
      if (prevNewestIdRef.current === undefined || isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    }
    prevNewestIdRef.current = newestMessage?.id;
  }, [messages, newestMessage]);

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
    fetchNextPage();
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
        messages.map((message) => (
          <MessageRow key={message.id} message={message} relativeTime={relativeTime} />
        ))
      )}
    </div>
  );
}

function MessageRow({
  message,
  relativeTime,
}: {
  message: Message;
  relativeTime: (date?: string | Date | null) => string;
}) {
  const colors = getAvatarColors(message.senderId);

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

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>
            {message.sender.name}
          </span>
          <span className="text-muted-foreground" style={{ fontSize: 11 }}>
            {relativeTime(message.createdAt)}
          </span>
        </div>
        {message.content && (
          <p className="text-foreground whitespace-pre-wrap break-words" style={{ fontSize: 13 }}>
            {message.content}
          </p>
        )}

        {message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1.5">
            {message.attachments.map((attachment) =>
              attachment.mimeType.startsWith("image/") ? (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
                  className="flex items-center gap-1.5 text-primary hover:underline"
                  style={{ fontSize: 12, textDecoration: "none" }}
                >
                  <Paperclip size={12} />
                  {attachment.fileName}
                </a>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
