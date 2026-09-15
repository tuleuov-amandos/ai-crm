"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MyTaskItem } from "@/lib/validations/tasks.schema";

interface MyTasksTableProps {
  tasks: MyTaskItem[];
  isLoading?: boolean;
  onToggleDone: (task: MyTaskItem) => void;
}

export function MyTasksTable({ tasks, isLoading, onToggleDone }: MyTasksTableProps) {
  const t = useTranslations("tasks.table");
  const locale = useLocale();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground" style={{ fontSize: 13 }}>
          {t("empty")}
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead style={{ width: 36 }} />
          <TableHead style={{ fontSize: 12 }}>{t("colTask")}</TableHead>
          <TableHead style={{ fontSize: 12 }}>{t("colDeal")}</TableHead>
          <TableHead style={{ fontSize: 12 }}>{t("colDueDate")}</TableHead>
          <TableHead style={{ width: 40 }} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id} className={cn(task.done && "opacity-60")}>
            <TableCell>
              <Checkbox
                checked={task.done}
                onCheckedChange={() => onToggleDone(task)}
                className="cursor-pointer"
              />
            </TableCell>
            <TableCell
              className={cn(task.done && "line-through")}
              style={{ fontSize: 13, fontWeight: 500 }}
            >
              {task.title}
            </TableCell>
            <TableCell style={{ fontSize: 13 }}>
              <Link
                href={`/pipeline/${task.deal.id}`}
                className="text-primary hover:underline"
                style={{ textDecoration: "none" }}
              >
                {task.deal.title}
              </Link>
              {task.deal.contact && (
                <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                  {" "}
                  · {task.deal.contact.name}
                </span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground" style={{ fontSize: 12 }}>
              {task.dueDate ? new Date(task.dueDate).toLocaleDateString(locale) : t("noDueDate")}
            </TableCell>
            <TableCell>
              <Link href={`/pipeline/${task.deal.id}`}>
                <ChevronRight size={14} className="text-muted-foreground" />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
