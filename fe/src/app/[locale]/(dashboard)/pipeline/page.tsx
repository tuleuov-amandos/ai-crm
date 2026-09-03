"use client";

import { Plus, Filter, LayoutGrid, List, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { KanbanBoard } from "@/app/[locale]/(dashboard)/pipeline/_components/KanbanBoard";
import { ListView } from "@/app/[locale]/(dashboard)/pipeline/_components/ListView";
import { CreateDealSheet } from "@/app/[locale]/(dashboard)/pipeline/_components/CreateDealSheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function Pipeline() {
  const t = useTranslations("pipeline");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  return (
    <div className="flex h-full flex-col flex-1 min-w-0 overflow-hidden">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b bg-background flex items-center justify-between px-6 gap-3">
        {/* Left: title + period selector */}
        <div className="flex items-center gap-3">
          <h1
            className="text-foreground tracking-tight"
            style={{ fontSize: 15, fontWeight: 600, lineHeight: 1 }}
          >
            {t("title")}
          </h1>
          <button
            className="flex items-center gap-1 h-6 px-2.5 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            style={{ fontSize: 12 }}
          >
            Q1 2026
            <ChevronDown size={11} />
          </button>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              title="Kanban"
              onClick={() => setViewMode("kanban")}
              className={`px-2.5 py-1.5 flex items-center border-0 cursor-pointer ${
                viewMode === "kanban"
                  ? "bg-secondary text-primary"
                  : "bg-background text-muted-foreground hover:bg-muted transition-colors"
              }`}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              title={t("toolbar.listView")}
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1.5 flex items-center border-0 border-l border-border cursor-pointer ${
                viewMode === "list"
                  ? "bg-secondary text-primary"
                  : "bg-background text-muted-foreground hover:bg-muted transition-colors"
              }`}
            >
              <List size={13} />
            </button>
          </div>

          <Separator orientation="vertical" className="h-5" />

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-border text-muted-foreground hover:text-foreground text-xs"
          >
            <Filter size={13} />
            {t("toolbar.filter")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 border-border text-muted-foreground hover:text-foreground text-xs"
          >
            {t("toolbar.allReps")}
            <ChevronDown size={12} />
          </Button>

          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={13} />
            {t("toolbar.addDeal")}
          </Button>
        </div>
      </header>

      {/* Kanban area */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden p-5 bg-[#F8F8F7] dark:bg-background">
        {viewMode === "kanban" ? (
          <div className="min-w-230 h-full">
            <KanbanBoard />
          </div>
        ) : (
          <div className="h-full">
            <ListView />
          </div>
        )}
      </main>

      <CreateDealSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
