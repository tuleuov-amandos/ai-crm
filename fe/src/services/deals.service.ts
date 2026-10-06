import { axiosInstance } from "@/lib/api";
import {
  CreateDealBodyType,
  UpdateDealBodyType,
  UpdateDealStageBodyType,
  UpdateDealPaymentStatusBodyType,
  DealCard,
  DealDetail,
  BoardRes,
  ArchiveDealsRes,
} from "@/lib/validations/deals.schema";


export const dealsService = {
  getBoard: async (params?: { ownerId?: string; dateFrom?: string; dateTo?: string; search?: string; isPaid?: boolean; includeArchived?: boolean }): Promise<BoardRes> => {
    const res = await axiosInstance.get("deals/board", { params });
    return res.data;
  },

  getById: async (id: string): Promise<DealDetail> => {
    const res = await axiosInstance.get(`deals/${id}`);
    return res.data;
  },

  create: async (data: CreateDealBodyType): Promise<DealCard> => {
    const res = await axiosInstance.post("deals", data);
    return res.data;
  },

  updateStage: async (
    id: string,
    data: UpdateDealStageBodyType,
  ): Promise<DealCard> => {
    const res = await axiosInstance.patch(`deals/${id}/stage`, data);
    return res.data;
  },

  updatePaymentStatus: async (
    id: string,
    data: UpdateDealPaymentStatusBodyType,
  ): Promise<DealCard> => {
    const res = await axiosInstance.patch(`deals/${id}/payment-status`, data);
    return res.data;
  },

  update: async (id: string, data: UpdateDealBodyType): Promise<DealCard> => {
    const res = await axiosInstance.patch(`deals/${id}`, data);
    return res.data;
  },

  delete: async (id: string): Promise<void> => {
    await axiosInstance.delete(`deals/${id}`);
  },

  // Ids the user may not change or already in the target state are skipped,
  // so `updated` can be 0.
  archiveDeals: async (dealIds: string[]): Promise<ArchiveDealsRes> => {
    const res = await axiosInstance.post("deals/archive", { dealIds });
    return res.data;
  },

  unarchiveDeals: async (dealIds: string[]): Promise<ArchiveDealsRes> => {
    const res = await axiosInstance.post("deals/unarchive", { dealIds });
    return res.data;
  },

  analyze: async (id: string, meetingNote: string): Promise<{ jobId: string }> => {
    const res = await axiosInstance.post(`deals/${id}/analyze`, { meetingNote });
    return res.data;
  },

  createTask: async (
    dealId: string,
    title: string,
    dueDate?: string | null,
    assigneeId?: string | null,
  ): Promise<any> => {
    const res = await axiosInstance.post(`deals/${dealId}/tasks`, { title, dueDate, assigneeId });
    return res.data;
  },

  createTasksBulk: async (dealId: string, tasks: Array<{ title: string; dueDate?: string | null }>): Promise<any> => {
    const res = await axiosInstance.post(`deals/${dealId}/tasks/bulk`, { tasks });
    return res.data;
  },

  updateTask: async (
    dealId: string,
    taskId: string,
    data: { title?: string; done?: boolean; dueDate?: string | null; assigneeId?: string | null },
  ): Promise<any> => {
    const res = await axiosInstance.patch(`deals/${dealId}/tasks/${taskId}`, data);
    return res.data;
  },

  deleteTask: async (dealId: string, taskId: string): Promise<any> => {
    const res = await axiosInstance.delete(`deals/${dealId}/tasks/${taskId}`);
    return res.data;
  },
};
