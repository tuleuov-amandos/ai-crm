"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { useChannels } from "@/hooks/useChat";
import { useChatSocketContext } from "@/hooks/useChatSocket";
import ChannelList from "./_components/ChannelList";
import MessageList from "./_components/MessageList";
import MessageComposer from "./_components/MessageComposer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PHONE_MEDIA_QUERY } from "@/lib/viewport";

export default function ChatPage() {
  const t = useTranslations("chat");
  const { data: channels } = useChannels();
  const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>(
    undefined,
  );
  // Phones (< md) show one column: the channel list, or the open channel after
  // a tap on it. Only CSS reads this, so desktop always shows both columns.
  // Kept apart from selectedChannelId, which the effect below auto-fills.
  const [isMobileChannelOpen, setIsMobileChannelOpen] = useState(false);
  const { joinChannel, setActiveChannelId, markChannelRead } =
    useChatSocketContext();

  // Default to the first channel once the list loads, if nothing picked yet.
  useEffect(() => {
    if (!selectedChannelId && channels && channels.length > 0) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    // Don't leave the socket room: the backend auto-joins all channels on
    // connect so unread notifications keep arriving outside this channel/page.
    joinChannel(selectedChannelId);
  }, [selectedChannelId, joinChannel]);

  // A channel becomes active (and read) only while it is on screen. On a phone
  // that is after a tap, not while the auto-picked first channel sits behind
  // the list. The width is read here and not in render (hydration); the
  // listener re-applies it if the window crosses 768 px (rotation, resize).
  useEffect(() => {
    if (!selectedChannelId) return;
    const mql = window.matchMedia(PHONE_MEDIA_QUERY);
    let active = false;
    const apply = () => {
      const shouldBeActive = !mql.matches || isMobileChannelOpen;
      if (shouldBeActive === active) return;
      active = shouldBeActive;
      if (active) {
        setActiveChannelId(selectedChannelId);
        markChannelRead(selectedChannelId);
      } else {
        setActiveChannelId(undefined);
      }
    };
    apply();
    mql.addEventListener("change", apply);
    return () => {
      mql.removeEventListener("change", apply);
      setActiveChannelId(undefined);
    };
  }, [selectedChannelId, isMobileChannelOpen, setActiveChannelId, markChannelRead]);

  const selectedChannel = channels?.find((c) => c.id === selectedChannelId);
  const showChannelOnMobile = isMobileChannelOpen && !!selectedChannelId;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
      <header
        className={cn(
          "h-14 shrink-0 border-b bg-background flex items-center px-6 max-md:px-3",
          showChannelOnMobile && "max-md:hidden",
        )}
      >
        <h1
          className="text-foreground tracking-tight"
          style={{ fontSize: 15, fontWeight: 600, lineHeight: 1 }}
        >
          {t("title")}
        </h1>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ChannelList
          selectedChannelId={selectedChannelId}
          onSelect={(id) => {
            setSelectedChannelId(id);
            setIsMobileChannelOpen(id !== undefined);
          }}
          className={cn(showChannelOnMobile && "max-md:hidden")}
        />

        <div
          className={cn(
            "flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden",
            !showChannelOnMobile && "max-md:hidden",
          )}
        >
          {selectedChannelId ? (
            <>
              <div className="h-11 shrink-0 border-b border-border flex items-center px-4 max-md:h-12 max-md:gap-1 max-md:px-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 md:hidden"
                  aria-label={t("backToChannels")}
                  onClick={() => setIsMobileChannelOpen(false)}
                >
                  <ArrowLeft size={18} />
                </Button>
                <span
                  className="min-w-0 text-foreground truncate"
                  style={{ fontSize: 13, fontWeight: 500 }}
                >
                  # {selectedChannel?.name}
                </span>
              </div>
              <MessageList channelId={selectedChannelId} />
              <MessageComposer channelId={selectedChannelId} />
            </>
          ) : (
            <div
              className="flex flex-1 items-center justify-center text-muted-foreground"
              style={{ fontSize: 13 }}
            >
              {t("selectChannel")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
