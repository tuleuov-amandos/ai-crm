"use client";

import {
  Plus,
  LayoutGrid,
  List,
  ChevronDown,
  Check,
  Calendar,
  Search,
  Archive,
  ListChecks,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useTranslations } from "next-intl";
import { useDebounceValue } from "usehooks-ts";
import { KanbanBoard } from "@/app/[locale]/(dashboard)/pipeline/_components/KanbanBoard";
import { ListView } from "@/app/[locale]/(dashboard)/pipeline/_components/ListView";
import { CreateDealSheet } from "@/app/[locale]/(dashboard)/pipeline/_components/CreateDealSheet";
import { DealBulkActionBar } from "@/app/[locale]/(dashboard)/pipeline/_components/DealBulkActionBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useGetUsers } from "@/hooks/useUsers";
import { dealBulkArchiveKey } from "@/hooks/useDeals";
import { useDealSelectionStore } from "@/stores/dealSelection-store";
import { DesktopOnly } from "@/components/desktop-only";
import { MOBILE_BREAKPOINT } from "@/hooks/use-mobile";

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
            "flex items-center gap-1 h-6 max-md:min-h-10 px-2.5 rounded-full border border-border bg-background transition-colors cursor-pointer",
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

// ─── PAYMENT STATUS FILTER ────────────────────────────────────────────────────
function PaymentStatusFilter({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
}) {
  const t = useTranslations("pipeline");
  const [open, setOpen] = useState(false);

  const label =
    value === undefined
      ? t("toolbar.paymentStatusAll")
      : value
        ? t("toolbar.paymentStatusPaid")
        : t("toolbar.paymentStatusUnpaid");

  const options: { label: string; value: boolean | undefined }[] = [
    { label: t("toolbar.paymentStatusAll"), value: undefined },
    { label: t("toolbar.paymentStatusPaid"), value: true },
    { label: t("toolbar.paymentStatusUnpaid"), value: false },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1 border-border text-xs",
            value !== undefined
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="max-w-[140px] truncate">{label}</span>
          <ChevronDown size={12} className="shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1.5">
        <div className="space-y-0.5">
          {options.map((opt) => (
            <RepRow
              key={String(opt.value)}
              label={opt.label}
              active={value === opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            />
          ))}
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
  const [createDefaultStageId, setCreateDefaultStageId] = useState<
    string | undefined
  >(undefined);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | undefined>(
    undefined,
  );
  const [selectedOwnerName, setSelectedOwnerName] = useState<string | undefined>(
    undefined,
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isPaidFilter, setIsPaidFilter] = useState<boolean | undefined>(undefined);
  // Shared by the board and the list: both read the same GET /deals/board query
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounceValue(search, 300);

  const dateFrom = dateRange?.from
    ? format(dateRange.from, "yyyy-MM-dd")
    : undefined;
  const dateTo = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  // На телефоне воронка открывается списком. Решаем один раз после монтирования
  // (useIsMobile на первом рендере всегда false, а на SSR ширины нет); дальше выбор
  // пользователя не трогаем.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-mount read of the viewport width (SSR-safe hydration)
    if (window.innerWidth < MOBILE_BREAKPOINT) setViewMode("list");
  }, []);

  // ── Selection mode (board and list) ─────────────────────────────────────
  const selectionMode = useDealSelectionStore((s) => s.selectionMode);
  const enterSelection = useDealSelectionStore((s) => s.enterSelection);
  const exitSelection = useDealSelectionStore((s) => s.exitSelection);
  const clearSelection = useDealSelectionStore((s) => s.clearSelection);
  const bulkPending = useIsMutating({ mutationKey: dealBulkArchiveKey }) > 0;

  // Other deals are listed after any of these changes: drop the selection,
  // keep the mode. Search counts once debounced, when the query changes.
  useEffect(() => {
    clearSelection();
  }, [selectedOwnerId, dateFrom, dateTo, debouncedSearch, isPaidFilter, showArchived, viewMode, clearSelection]);

  // The store outlives the page: leave the mode when navigating away
  useEffect(() => exitSelection, [exitSelection]);

  // Esc leaves the mode. Radix calls preventDefault when Esc closes a dialog,
  // popover or menu, so that Esc only closes the layer.
  useEffect(() => {
    if (!selectionMode || bulkPending) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) exitSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectionMode, bulkPending, exitSelection]);

  function handleAddDealInStage(stageId?: string) {
    setCreateDefaultStageId(stageId);
    setCreateOpen(true);
  }

  return (
    <div className="flex h-full flex-col flex-1 min-w-0 overflow-hidden">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b bg-background flex items-center justify-between px-6 gap-3 max-md:h-auto max-md:min-h-14 max-md:flex-wrap max-md:px-3 max-md:py-2">
        {/* Left: title + period selector */}
        <div className="flex items-center gap-3 max-md:w-full max-md:flex-wrap">
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
        <div className="flex items-center gap-2 max-md:w-full max-md:flex-wrap">
          {/* View toggle */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              title="Kanban"
              onClick={() => setViewMode("kanban")}
              className={`px-2.5 py-1.5 flex items-center max-md:justify-center max-md:min-h-10 max-md:min-w-10 border-0 cursor-pointer ${
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
              className={`px-2.5 py-1.5 flex items-center max-md:justify-center max-md:min-h-10 max-md:min-w-10 border-0 border-l border-border cursor-pointer ${
                viewMode === "list"
                  ? "bg-secondary text-primary"
                  : "bg-background text-muted-foreground hover:bg-muted transition-colors"
              }`}
            >
              <List size={13} />
            </button>
          </div>

          <Separator orientation="vertical" className="h-5 max-md:hidden" />

          <div className="relative max-md:w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("toolbar.searchPlaceholder")}
              className="h-8 pl-8 w-44 max-md:w-full text-xs bg-background border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <RepFilter
            selectedOwnerId={selectedOwnerId}
            selectedOwnerName={selectedOwnerName}
            onOwnerChange={(ownerId, ownerName) => {
              setSelectedOwnerId(ownerId);
              setSelectedOwnerName(ownerName);
            }}
          />

          <PaymentStatusFilter value={isPaidFilter} onChange={setIsPaidFilter} />

          <Button
            variant="outline"
            size="sm"
            aria-pressed={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className={cn(
              "h-8 gap-1 border-border text-xs",
              showArchived
                ? "bg-secondary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Archive size={12} className="shrink-0" />
            {t("archive.showArchive")}
          </Button>

          <DesktopOnly feature="deal-selection">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={selectionMode}
              disabled={bulkPending}
              onClick={selectionMode ? exitSelection : enterSelection}
              className={cn(
                "h-8 gap-1 border-border text-xs",
                selectionMode
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {selectionMode ? (
                <X size={12} className="shrink-0" />
              ) : (
                <ListChecks size={12} className="shrink-0" />
              )}
              {selectionMode ? t("archive.cancelSelect") : t("archive.select")}
            </Button>
          </DesktopOnly>

          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              setCreateDefaultStageId(undefined);
              setCreateOpen(true);
            }}
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
              search={debouncedSearch}
              isPaid={isPaidFilter}
              includeArchived={showArchived}
              onAddDeal={handleAddDealInStage}
            />
          </div>
        ) : (
          <div className="h-full">
            <ListView
              ownerId={selectedOwnerId}
              dateFrom={dateFrom}
              dateTo={dateTo}
              search={debouncedSearch}
              isPaid={isPaidFilter}
              includeArchived={showArchived}
            />
          </div>
        )}
      </main>

      <DealBulkActionBar />

      <CreateDealSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultStageId={createDefaultStageId}
      />
    </div>
  );
}
