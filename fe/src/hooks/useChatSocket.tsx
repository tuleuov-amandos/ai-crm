"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";
import { chatKeys, useMarkChannelRead } from "@/hooks/useChat";
import {
  GetChannelMembersResType,
  GetChannelsResType,
  GetMessagesPaginatedResType,
  Message,
} from "@/lib/validations/chat.scheme";

const CONNECTION_TOAST_ID = "chat-connection-lost";

interface ChatSocketContextValue {
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  setActiveChannelId: (channelId: string | undefined) => void;
  markChannelRead: (channelId: string) => void;
}

const ChatSocketContext = createContext<ChatSocketContextValue | null>(null);

/**
 * Owns the single chat socket connection for the whole dashboard (mounted in
 * the dashboard layout), so unread badges stay live on every page, not only
 * on /chat. Switching channels only emits joinChannel/leaveChannel on the
 * same connection.
 *
 * The active channel lives in a ref inside the provider, so the effect that
 * opens the connection never re-runs when it changes. When no channel is
 * active (user is outside the chat page) every incoming message counts as
 * unread.
 */
export function ChatSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const t = useTranslations("chat.toasts");
  const markRead = useMarkChannelRead();
  const socketRef = useRef<Socket | null>(null);
  const activeChannelIdRef = useRef<string | undefined>(undefined);
  // TEMP diagnostics: instance id changes on remount, render count on re-render
  const instanceId = useId();
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  console.log("[ChatSocket] render #", renderCountRef.current, "instance:", instanceId);
  const tRef = useRef(t);
  const markReadRef = useRef(markRead.mutate);

  useEffect(() => {
    tRef.current = t;
    markReadRef.current = markRead.mutate;
  });

  const markChannelRead = useCallback((channelId: string) => {
    markReadRef.current(channelId);
  }, []);

  const setActiveChannelId = useCallback((channelId: string | undefined) => {
    activeChannelIdRef.current = channelId;
  }, []);

  useEffect(() => {
    // TEMP diagnostics
    console.log(
      "[ChatSocket] connecting...",
      new Date().toISOString(),
      "provider instance:",
      instanceId,
    );
    const socket = io(`${API_BASE_URL}/chat`, { withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      // TEMP diagnostics
      console.log("[ChatSocket] connected", socket.id, new Date().toISOString());
      toast.dismiss(CONNECTION_TOAST_ID);
    });

    socket.on("disconnect", (reason: Socket.DisconnectReason) => {
      // TEMP diagnostics
      console.log(
        "[ChatSocket] disconnected, reason:",
        reason,
        new Date().toISOString(),
      );
      // "io client disconnect" means we called socket.disconnect() ourselves
      // (e.g. provider unmount on logout) — not a real connection loss.
      if (reason === "io client disconnect") return;
      toast.error(tRef.current("connectionLost"), { id: CONNECTION_TOAST_ID });
    });

    socket.on("connect_error", () => {
      toast.error(tRef.current("connectionLost"), { id: CONNECTION_TOAST_ID });
    });

    socket.on("error", (payload: { message?: string }) => {
      toast.error(payload?.message || tRef.current("connectionLost"), {
        id: CONNECTION_TOAST_ID,
      });
    });

    socket.on("newMessage", (message: Message) => {
      // A message for a channel that isn't currently open bumps that
      // channel's unread count in the channel-list cache instead of
      // touching its (unmounted) message list.
      if (message.channelId !== activeChannelIdRef.current) {
        queryClient.setQueryData<GetChannelsResType>(
          chatKeys.channels(),
          (old) => {
            if (!old) return old;
            return {
              ...old,
              data: old.data.map((channel) =>
                channel.id === message.channelId
                  ? { ...channel, unreadCount: channel.unreadCount + 1 }
                  : channel,
              ),
            };
          },
        );
        return;
      }

      queryClient.setQueryData<InfiniteData<GetMessagesPaginatedResType>>(
        chatKeys.messages(message.channelId),
        (old) => {
          if (!old) return old;

          let found = false;
          const pages = old.pages.map((page) => {
            const idx = page.data.findIndex((m) => m.id === message.id);
            if (idx === -1) return page;
            found = true;
            const data = [...page.data];
            data[idx] = message;
            return { ...page, data };
          });

          if (found) return { ...old, pages };

          // Newest first: a brand-new message goes to the front of page 1.
          const [firstPage, ...rest] = pages;
          const updatedFirst = {
            ...firstPage,
            data: [message, ...firstPage.data],
            total: firstPage.total + 1,
          };
          return { ...old, pages: [updatedFirst, ...rest] };
        },
      );

      // The user is already looking at this channel — a message arriving
      // for it shouldn't be able to accumulate as unread.
      markReadRef.current(message.channelId);
    });

    // A member (possibly on another device/tab) just marked the channel
    // read — update their lastReadAt in the members cache so read receipts
    // under the current user's own messages reflect it without a refetch.
    socket.on(
      "channelRead",
      (payload: { channelId: string; userId: string; lastReadAt: string }) => {
        queryClient.setQueryData<GetChannelMembersResType>(
          chatKeys.members(payload.channelId),
          (old) => {
            if (!old) return old;
            return {
              ...old,
              data: old.data.map((member) =>
                member.userId === payload.userId
                  ? { ...member, lastReadAt: payload.lastReadAt }
                  : member,
              ),
            };
          },
        );
      },
    );

    return () => {
      // TEMP diagnostics
      console.log(
        "[ChatSocket] effect cleanup — disconnecting",
        new Date().toISOString(),
      );
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TEMP diagnostics: instanceId is log-only
  }, [queryClient]);

  const joinChannel = useCallback((channelId: string) => {
    socketRef.current?.emit("joinChannel", channelId);
  }, []);

  const leaveChannel = useCallback((channelId: string) => {
    socketRef.current?.emit("leaveChannel", channelId);
  }, []);

  const value = useMemo(
    () => ({ joinChannel, leaveChannel, setActiveChannelId, markChannelRead }),
    [joinChannel, leaveChannel, setActiveChannelId, markChannelRead],
  );

  return (
    <ChatSocketContext.Provider value={value}>
      {children}
    </ChatSocketContext.Provider>
  );
}

export function useChatSocketContext() {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) {
    throw new Error("useChatSocketContext must be used within ChatSocketProvider");
  }
  return ctx;
}
