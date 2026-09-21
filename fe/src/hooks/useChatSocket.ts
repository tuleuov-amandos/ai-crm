"use client";

import { useCallback, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";
import { chatKeys } from "@/hooks/useChat";
import {
  GetChannelMembersResType,
  GetChannelsResType,
  GetMessagesPaginatedResType,
  Message,
} from "@/lib/validations/chat.scheme";

const CONNECTION_TOAST_ID = "chat-connection-lost";

/**
 * One socket connection for the whole chat section (mounted once at the page
 * level), independent of which channel is currently selected — switching
 * channels only emits joinChannel/leaveChannel on the same connection.
 *
 * `activeChannelId` is read through a ref inside the socket handler so the
 * effect that opens the connection never has to re-run when it changes.
 *
 * `markChannelRead` comes from the page via useMarkChannelRead — this is a
 * hook, not a component, so it can't call that mutation itself. It's used
 * for the active channel only, to re-mark it read when a new message arrives
 * while the user is already looking at it (otherwise that message would sit
 * as unread until the channel is reopened).
 */
export function useChatSocket(
  activeChannelId: string | undefined,
  markChannelRead: (channelId: string) => void,
) {
  const queryClient = useQueryClient();
  const t = useTranslations("chat.toasts");
  const socketRef = useRef<Socket | null>(null);
  const activeChannelIdRef = useRef(activeChannelId);
  const tRef = useRef(t);
  const markChannelReadRef = useRef(markChannelRead);

  activeChannelIdRef.current = activeChannelId;
  tRef.current = t;
  markChannelReadRef.current = markChannelRead;

  useEffect(() => {
    const socket = io(`${API_BASE_URL}/chat`, { withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      toast.dismiss(CONNECTION_TOAST_ID);
    });

    socket.on("disconnect", (reason: Socket.DisconnectReason) => {
      // "io client disconnect" means we called socket.disconnect() ourselves
      // (e.g. unmounting on navigation) — not a real connection loss.
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
      markChannelReadRef.current(message.channelId);
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
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient]);

  const joinChannel = useCallback((channelId: string) => {
    socketRef.current?.emit("joinChannel", channelId);
  }, []);

  const leaveChannel = useCallback((channelId: string) => {
    socketRef.current?.emit("leaveChannel", channelId);
  }, []);

  return { joinChannel, leaveChannel };
}
