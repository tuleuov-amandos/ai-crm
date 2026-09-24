"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";
import { useMe } from "@/hooks/useAuth";
import { chatKeys, useMarkChannelRead } from "@/hooks/useChat";
import {
  GetChannelMembersResType,
  GetChannelsResType,
  GetMessagesPaginatedResType,
  Message,
} from "@/lib/validations/chat.scheme";

const CONNECTION_TOAST_ID = "chat-connection-lost";

const SOUND_STORAGE_KEY = "chat-sound-enabled";

function readSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

let audioCtx: AudioContext | null = null;

/** Short, soft two-note "blip" via Web Audio; silently no-ops if blocked. */
function playNotificationSound() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const ctx = audioCtx;
    // Autoplay policy: stays "suspended" until a user gesture; then this is a no-op.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const start = now + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.13);
    });
  } catch {
    // ignore: autoplay blocked or audio unavailable
  }
}

interface ChatSocketContextValue {
  soundEnabled: boolean;
  toggleSound: () => void;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  setActiveChannelId: (channelId: string | undefined) => void;
  markChannelRead: (channelId: string) => void;
}

const ChatSocketContext = createContext<ChatSocketContextValue | null>(null);

/**
 * Owns the single chat socket connection for the whole dashboard (mounted in
 * the dashboard layout), so unread badges stay live on every page, not only
 * on /chat. Switching channels only emits joinChannel on the same
 * connection; the socket stays in all channel rooms (backend auto-join).
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
  const { data: me } = useMe();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const meIdRef = useRef(me?.id);
  const soundEnabledRef = useRef(soundEnabled);
  const socketRef = useRef<Socket | null>(null);
  const activeChannelIdRef = useRef<string | undefined>(undefined);
  const tRef = useRef(t);
  const markReadRef = useRef(markRead.mutate);

  useEffect(() => {
    tRef.current = t;
    markReadRef.current = markRead.mutate;
    meIdRef.current = me?.id;
    soundEnabledRef.current = soundEnabled;
  });

  // Read the persisted value after mount so the server render and the first
  // client render both use the default and hydration stays consistent.
  useEffect(() => {
    const stored = readSoundEnabled();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-mount read of localStorage (SSR-safe hydration)
    if (!stored) setSoundEnabled(false);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_STORAGE_KEY, String(next));
      } catch {
        // ignore unavailable storage
      }
      return next;
    });
  }, []);

  const markChannelRead = useCallback((channelId: string) => {
    markReadRef.current(channelId);
  }, []);

  const setActiveChannelId = useCallback((channelId: string | undefined) => {
    activeChannelIdRef.current = channelId;
  }, []);

  useEffect(() => {
    const socket = io(`${API_BASE_URL}/chat`, { withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      toast.dismiss(CONNECTION_TOAST_ID);
    });

    socket.on("disconnect", (reason: Socket.DisconnectReason) => {
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
      const notify = () => {
        if (
          soundEnabledRef.current &&
          meIdRef.current &&
          message.senderId !== meIdRef.current
        ) {
          playNotificationSound();
        }
      };
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
        notify();
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
      notify();
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

  // Currently unused: leaving a room would cancel the backend auto-join and
  // silence unread notifications. Kept for a possible future explicit unsubscribe.
  const leaveChannel = useCallback((channelId: string) => {
    socketRef.current?.emit("leaveChannel", channelId);
  }, []);

  const value = useMemo(
    () => ({
      joinChannel,
      leaveChannel,
      setActiveChannelId,
      markChannelRead,
      soundEnabled,
      toggleSound,
    }),
    [
      joinChannel,
      leaveChannel,
      setActiveChannelId,
      markChannelRead,
      soundEnabled,
      toggleSound,
    ],
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
