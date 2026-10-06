import { axiosInstance } from "@/lib/api";
import {
  GetPipelineStagesResSchema,
  PipelineStage,
} from "@/lib/validations/pipelineStages.schema";

export const pipelineStagesService = {
  getAll: async (): Promise<PipelineStage[]> => {
    const res = await axiosInstance.get("pipeline-stages");
    return GetPipelineStagesResSchema.parse(res.data);
  },
};
