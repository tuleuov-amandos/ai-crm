"use client";

import { useCallback, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";
import { chatKeys } from "@/hooks/useChat";
import { GetMessagesPaginatedResType, Message } from "@/lib/validations/chat.scheme";

const CONNECTION_TOAST_ID = "chat-connection-lost";

/**
 * One socket connection for the whole chat section (mounted once at the page
 * level), independent of which channel is currently selected — switching
 * channels only emits joinChannel/leaveChannel on the same connection.
 *
 * `activeChannelId` is read through a ref inside the socket handler so the
 * effect that opens the connection never has to re-run when it changes.
 */
export function useChatSocket(activeChannelId: string | undefined) {
  const queryClient = useQueryClient();
  const t = useTranslations("chat.toasts");
  const socketRef = useRef<Socket | null>(null);
  const activeChannelIdRef = useRef(activeChannelId);
  const tRef = useRef(t);

  activeChannelIdRef.current = activeChannelId;
  tRef.current = t;

  useEffect(() => {
    const socket = io(`${API_BASE_URL}/chat`, { withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      toast.dismiss(CONNECTION_TOAST_ID);
    });

    socket.on("disconnect", () => {
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
      // Ignore messages for a channel that isn't currently open — no unread
      // badges in this version, so there's nothing else to do with them.
      if (message.channelId !== activeChannelIdRef.current) return;

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
    });

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
