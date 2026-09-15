"use client";
import { GetMyTasksQueryType } from "@/lib/validations/tasks.schema";
import { tasksService } from "@/services/tasks.service";
import { useQuery } from "@tanstack/react-query";

export const myTaskKeys = {
  all: ["myTasks"] as const,
  lists: () => [...myTaskKeys.all, "list"] as const,
  list: (params: GetMyTasksQueryType) => [...myTaskKeys.lists(), params] as const,
};

export const useMyTasks = (params: GetMyTasksQueryType) => {
  return useQuery({
    queryKey: myTaskKeys.list(params),
    queryFn: () => tasksService.getMine(params),
    staleTime: 30_000,
  });
};
