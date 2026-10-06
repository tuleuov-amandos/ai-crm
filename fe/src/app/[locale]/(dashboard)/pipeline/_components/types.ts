// Re-export from deals.schema for shared use in pipeline components
import type {
  BoardColumn,
  BoardColumnStage,
  DealCard,
  DealDetail,
} from "@/lib/validations/deals.schema";

export type Deal = DealCard;
export type { BoardColumn, BoardColumnStage, DealDetail };

export type Task = {
  id: string;
  title: string;
  done: boolean;
  dueDate: Date | null;
  createdAt: Date;
  assigneeId: string | null;
  assignee: { id: string; name: string; email: string } | null;
};
