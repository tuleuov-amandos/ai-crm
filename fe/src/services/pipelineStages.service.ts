import { axiosInstance } from "@/lib/api";
import {
  CreatePipelineStageBodyType,
  GetPipelineStagesResSchema,
  PipelineStage,
  ReorderPipelineStagesBodyType,
  UpdatePipelineStageBodyType,
} from "@/lib/validations/pipelineStages.schema";

export const pipelineStagesService = {
  getAll: async (): Promise<PipelineStage[]> => {
    const res = await axiosInstance.get("pipeline-stages");
    return GetPipelineStagesResSchema.parse(res.data);
  },

  create: async (data: CreatePipelineStageBodyType): Promise<PipelineStage> => {
    const res = await axiosInstance.post("pipeline-stages", data);
    return res.data;
  },

  update: async (
    id: string,
    data: UpdatePipelineStageBodyType,
  ): Promise<PipelineStage> => {
    const res = await axiosInstance.patch(`pipeline-stages/${id}`, data);
    return res.data;
  },

  reorder: async (data: ReorderPipelineStagesBodyType): Promise<PipelineStage[]> => {
    const res = await axiosInstance.patch("pipeline-stages/reorder", data);
    return res.data;
  },

  // targetStageId receives the stage's deals, soft-deleted ones included.
  delete: async (id: string, targetStageId: string): Promise<void> => {
    await axiosInstance.delete(`pipeline-stages/${id}`, {
      params: { targetStageId },
    });
  },
};
