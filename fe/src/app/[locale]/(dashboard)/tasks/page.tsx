"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ListTodo } from "lucide-react";
import { useMyTasks, myTaskKeys } from "@/hooks/useMyTasks";
import { dealsService } from "@/services/deals.service";
import type { MyTaskItem } from "@/lib/validations/tasks.schema";
import { MyTasksTable } from "./_components/MyTasksTable";

const PAGE_LIMIT = 20;

export default function TasksPage() {
  const t = useTranslations("tasks");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useMyTasks({ page, limit: PAGE_LIMIT, sort: "dueDate_asc" });
  const tasks = data?.data ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const handleToggleDone = async (task: MyTaskItem) => {
    try {
      await dealsService.updateTask(task.deal.id, task.id, { done: !task.done });
      await queryClient.invalidateQueries({ queryKey: myTaskKeys.lists() });
    } catch (err) {
      console.error("Failed to update task:", err);
      toast.error(t("toasts.updateError"));
    }
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ListTodo size={18} className="text-primary" />
          <h1 className="text-foreground" style={{ fontSize: 18, fontWeight: 700 }}>
            {t("title")}
          </h1>
        </div>
        <p className="text-muted-foreground mt-1" style={{ fontSize: 13 }}>
          {t("subtitle")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#F8F8F7] dark:bg-background">
        <div className="mx-auto p-6" style={{ maxWidth: 900 }}>
          <div className="bg-white dark:bg-card rounded-xl border border-border overflow-hidden">
            <MyTasksTable tasks={tasks} isLoading={isLoading} onToggleDone={handleToggleDone} />
          </div>

          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={12} />
              </Button>
              <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("pageOf", { page, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={12} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
