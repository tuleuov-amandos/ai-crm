import { axiosInstance } from "@/lib/api";
import {
  GetMyTasksQueryType,
  GetMyTasksResSchema,
  GetMyTasksResType,
} from "@/lib/validations/tasks.schema";

export const tasksService = {
  getMine: async (params?: GetMyTasksQueryType): Promise<GetMyTasksResType> => {
    const res = await axiosInstance.get("tasks/mine", { params });
    return GetMyTasksResSchema.parse(res.data);
  },
};
