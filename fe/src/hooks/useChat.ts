"use client";

import { chatService } from "@/services/chat.service";
import { ApiError } from "@/types/error.type";
import { useApiError } from "@/hooks/useApiError";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

// ─────────────────────────────────────────
// QUERY KEYS
// ─────────────────────────────────────────
export const chatKeys = {
  all: ["chat"] as const,
  channels: () => [...chatKeys.all, "channels"] as const,
  messages: (channelId: string) =>
    [...chatKeys.all, "channel", channelId, "messages"] as const,
};

const MESSAGES_PAGE_LIMIT = 30;

// GET /chat/channels — short staleTime, real-time (socket) keeps it fresh
export const useChannels = () => {
  return useQuery({
    queryKey: chatKeys.channels(),
    queryFn: () => chatService.getChannels(),
    staleTime: 15_000,
    select: (data) => data.data,
  });
};

export const useCreateChannel = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("chat.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (name: string) => chatService.createChannel(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.channels() });
      toast.success(t("createChannelSuccess"));
    },
    onError: (error: ApiError) => {
      toast.error(getApiError(error, t("createChannelError")));
    },
  });
};

export const useDeleteChannel = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("chat.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (channelId: string) => chatService.deleteChannel(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.channels() });
      toast.success(t("deleteChannelSuccess"));
    },
    onError: (error: ApiError) => {
      toast.error(getApiError(error, t("deleteChannelError")));
    },
  });
};

// GET /chat/channels/:id/messages — infinite scroll, newest-first pages
export const useMessages = (channelId: string | undefined) => {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(channelId ?? ""),
    queryFn: ({ pageParam }) =>
      chatService.getMessages(channelId as string, {
        page: pageParam,
        limit: MESSAGES_PAGE_LIMIT,
      }),
    enabled: !!channelId,
    staleTime: 15_000,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.limit);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
  });
};

// POST /chat/channels/:id/messages — no optimistic update: the socket's
// `newMessage` event upserts the cache almost immediately, so doing it twice
// here would race and could duplicate the message in the list.
export const useSendMessage = (channelId: string) => {
  const t = useTranslations("chat.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (content: string) =>
      chatService.sendMessage(channelId, content),
    onError: (error: ApiError) => {
      toast.error(getApiError(error, t("sendMessageError")));
    },
  });
};

// POST /chat/messages/:id/attachments
export const useUploadAttachments = () => {
  const t = useTranslations("chat.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: ({
      messageId,
      files,
    }: {
      messageId: string;
      files: File[];
      // True when the message this upload targets has no text of its own,
      // i.e. the attachments ARE the message — the generic error toast would
      // leave the user thinking nothing happened, when in fact an empty
      // message was already created and now has no attachments either.
      isAttachmentOnlyMessage?: boolean;
    }) => chatService.uploadAttachments(messageId, files),
    onError: (error: ApiError, variables) => {
      const fallback = variables.isAttachmentOnlyMessage
        ? t("uploadAttachmentsAfterEmptyMessageError")
        : t("uploadAttachmentsError");
      toast.error(getApiError(error, fallback));
    },
  });
};
