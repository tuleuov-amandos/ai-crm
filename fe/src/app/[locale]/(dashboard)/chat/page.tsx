"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useChannels } from "@/hooks/useChat";
import { useChatSocket } from "@/hooks/useChatSocket";
import ChannelList from "./_components/ChannelList";
import MessageList from "./_components/MessageList";
import MessageComposer from "./_components/MessageComposer";

export default function ChatPage() {
  const t = useTranslations("chat");
  const { data: channels } = useChannels();
  const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>(
    undefined,
  );
  const { joinChannel, leaveChannel } = useChatSocket(selectedChannelId);

  // Default to the first channel once the list loads, if nothing picked yet.
  useEffect(() => {
    if (!selectedChannelId && channels && channels.length > 0) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    joinChannel(selectedChannelId);
    return () => leaveChannel(selectedChannelId);
  }, [selectedChannelId, joinChannel, leaveChannel]);

  const selectedChannel = channels?.find((c) => c.id === selectedChannelId);

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <header className="h-14 shrink-0 border-b bg-background flex items-center px-6">
        <h1
          className="text-foreground tracking-tight"
          style={{ fontSize: 15, fontWeight: 600, lineHeight: 1 }}
        >
          {t("title")}
        </h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ChannelList
          selectedChannelId={selectedChannelId}
          onSelect={(id) => setSelectedChannelId(id)}
        />

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {selectedChannelId ? (
            <>
              <div className="h-11 shrink-0 border-b border-border flex items-center px-4">
                <span
                  className="text-foreground truncate"
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
