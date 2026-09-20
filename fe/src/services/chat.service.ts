import { axiosInstance } from "@/lib/api";
import {
  Channel,
  GetChannelsResType,
  GetMessagesParamsType,
  GetMessagesPaginatedResType,
  Message,
} from "@/lib/validations/chat.scheme";

export const chatService = {
  // GET /chat/channels
  getChannels: async (): Promise<GetChannelsResType> => {
    const res = await axiosInstance.get("chat/channels");
    return res.data;
  },

  // POST /chat/channels
  createChannel: async (name: string): Promise<Channel> => {
    const res = await axiosInstance.post("chat/channels", { name });
    return res.data;
  },

  // DELETE /chat/channels/:id
  deleteChannel: async (channelId: string): Promise<{ message: string }> => {
    const res = await axiosInstance.delete(`chat/channels/${channelId}`);
    return res.data;
  },

  // POST /chat/channels/:id/join
  joinChannel: async (channelId: string): Promise<{ message: string }> => {
    const res = await axiosInstance.post(`chat/channels/${channelId}/join`);
    return res.data;
  },

  // POST /chat/channels/:id/leave
  leaveChannel: async (channelId: string): Promise<{ message: string }> => {
    const res = await axiosInstance.post(`chat/channels/${channelId}/leave`);
    return res.data;
  },

  // POST /chat/channels/:id/read
  markChannelRead: async (channelId: string): Promise<{ message: string }> => {
    const res = await axiosInstance.post(`chat/channels/${channelId}/read`);
    return res.data;
  },

  // GET /chat/channels/:id/messages
  getMessages: async (
    channelId: string,
    params?: GetMessagesParamsType,
  ): Promise<GetMessagesPaginatedResType> => {
    const res = await axiosInstance.get(
      `chat/channels/${channelId}/messages`,
      { params },
    );
    return res.data;
  },

  // POST /chat/channels/:id/messages
  sendMessage: async (channelId: string, content: string): Promise<Message> => {
    const res = await axiosInstance.post(
      `chat/channels/${channelId}/messages`,
      { content },
    );
    return res.data;
  },

  // POST /chat/messages/:id/attachments — multipart, field "files" (plural)
  uploadAttachments: async (
    messageId: string,
    files: File[],
  ): Promise<Message> => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const res = await axiosInstance.post(
      `chat/messages/${messageId}/attachments`,
      form,
      { headers: { "Content-Type": "multipart/form-data" }, timeout: 30_000 },
    );
    return res.data;
  },
};
