"use client";

import {
  Plus,
  Filter,
  LayoutGrid,
  List,
  ChevronDown,
  Check,
  Calendar,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useTranslations } from "next-intl";
import { KanbanBoard } from "@/app/[locale]/(dashboard)/pipeline/_components/KanbanBoard";
import { ListView } from "@/app/[locale]/(dashboard)/pipeline/_components/ListView";
import { CreateDealSheet } from "@/app/[locale]/(dashboard)/pipeline/_components/CreateDealSheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useGetUsers } from "@/hooks/useUsers";

// ─── PERIOD FILTER ────────────────────────────────────────────────────────────
function PeriodFilter({
  dateRange,
  onDateRangeChange,
}: {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  const label =
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "dd/MM/yyyy")} – ${format(dateRange.to, "dd/MM/yyyy")}`
      : dateRange?.from
        ? format(dateRange.from, "dd/MM/yyyy")
        : "Весь период";

  const presets: { label: string; range: DateRange | undefined }[] = [
    { label: "Весь период", range: undefined },
    {
      label: "Q1 2026",
      range: { from: new Date(2026, 0, 1), to: new Date(2026, 2, 31) },
    },
    {
      label: "Q2 2026",
      range: { from: new Date(2026, 3, 1), to: new Date(2026, 5, 30) },
    },
    {
      label: "Q3 2026",
      range: { from: new Date(2026, 6, 1), to: new Date(2026, 8, 30) },
    },
    {
      label: "Q4 2026",
      range: { from: new Date(2026, 9, 1), to: new Date(2026, 11, 31) },
    },
  ];

  function applyPreset(range: DateRange | undefined) {
    onDateRangeChange(range);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 h-6 px-2.5 rounded-full border border-border bg-background transition-colors cursor-pointer",
            dateRange?.from
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          style={{ fontSize: 12 }}
        >
          <Calendar size={11} />
          {label}
          <ChevronDown size={11} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-wrap gap-1.5 border-b p-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset.range)}
              className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer"
              style={{ fontSize: 11 }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <CalendarPicker
          mode="range"
          selected={dateRange}
          onSelect={onDateRangeChange}
          numberOfMonths={2}
          defaultMonth={dateRange?.from ?? new Date(2026, 0, 1)}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── REP FILTER ───────────────────────────────────────────────────────────────
function RepFilter({
  selectedOwnerId,
  selectedOwnerName,
  onOwnerChange,
}: {
  selectedOwnerId: string | undefined;
  selectedOwnerName: string | undefined;
  onOwnerChange: (
    ownerId: string | undefined,
    ownerName: string | undefined,
  ) => void;
}) {
  const t = useTranslations("pipeline");
  const [open, setOpen] = useState(false);
  const { data: users, isLoading } = useGetUsers();

  const label = selectedOwnerId
    ? selectedOwnerName ?? t("toolbar.allReps")
    : t("toolbar.allReps");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1 border-border text-xs",
            selectedOwnerId
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="max-w-[140px] truncate">{label}</span>
          <ChevronDown size={12} className="shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5">
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          <RepRow
            label={t("toolbar.allReps")}
            active={!selectedOwnerId}
            onClick={() => {
              onOwnerChange(undefined, undefined);
              setOpen(false);
            }}
          />
          {isLoading ? (
            <p
              className="px-2 py-1.5 text-muted-foreground"
              style={{ fontSize: 12 }}
            >
              …
            </p>
          ) : users && users.length > 0 ? (
            users.map((u) => (
              <RepRow
                key={u.id}
                label={u.name}
                active={selectedOwnerId === u.id}
                onClick={() => {
                  onOwnerChange(u.id, u.name);
                  setOpen(false);
                }}
              />
            ))
          ) : (
            <p
              className="px-2 py-1.5 text-muted-foreground"
              style={{ fontSize: 12 }}
            >
              {t("toolbar.noReps")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RepRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      style={{ fontSize: 12 }}
    >
      <Check
        size={13}
        className={cn("shrink-0", active ? "opacity-100" : "opacity-0")}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export default function Pipeline() {
  const t = useTranslations("pipeline");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | undefined>(
    undefined,
  );
  const [selectedOwnerName, setSelectedOwnerName] = useState<string | undefined>(
    undefined,
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const dateFrom = dateRange?.from
    ? format(dateRange.from, "yyyy-MM-dd")
    : undefined;
  const dateTo = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

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
          <PeriodFilter
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
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

          <RepFilter
            selectedOwnerId={selectedOwnerId}
            selectedOwnerName={selectedOwnerName}
            onOwnerChange={(ownerId, ownerName) => {
              setSelectedOwnerId(ownerId);
              setSelectedOwnerName(ownerName);
            }}
          />

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
            <KanbanBoard
              ownerId={selectedOwnerId}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          </div>
        ) : (
          <div className="h-full">
            <ListView
              ownerId={selectedOwnerId}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          </div>
        )}
      </main>

      <CreateDealSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
