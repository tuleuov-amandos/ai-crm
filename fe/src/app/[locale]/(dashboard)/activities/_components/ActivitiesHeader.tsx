"use client";

import { useState } from "react";
import { Calendar, ChevronDown, Plus } from "lucide-react";
import { format, startOfToday, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";

export function ActivitiesHeader({
  dateRange,
  onDateRangeChange,
  onNewActivity,
}: {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onNewActivity?: () => void;
}) {
  const t = useTranslations("activities");
  const [open, setOpen] = useState(false);

  const rangeLabel =
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "dd/MM/yyyy")} – ${format(dateRange.to, "dd/MM/yyyy")}`
      : dateRange?.from
        ? format(dateRange.from, "dd/MM/yyyy")
        : t("dateRangeAll");

  const presets: { label: string; range: DateRange | undefined }[] = [
    { label: t("datePresets.allTime"), range: undefined },
    {
      label: t("datePresets.today"),
      range: { from: startOfToday(), to: startOfToday() },
    },
    {
      label: t("datePresets.last7Days"),
      range: { from: subDays(startOfToday(), 6), to: startOfToday() },
    },
    {
      label: t("datePresets.last30Days"),
      range: { from: subDays(startOfToday(), 29), to: startOfToday() },
    },
  ];

  function applyPreset(range: DateRange | undefined) {
    onDateRangeChange(range);
    setOpen(false);
  }

  return (
    <header className="h-14 shrink-0 border-b bg-background flex items-center justify-between px-6 gap-4">
      <h2
        className="text-foreground"
        style={{ fontSize: 15, fontWeight: 600, margin: 0 }}
      >
        {t("title")}
      </h2>

      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border bg-background transition-colors cursor-pointer",
                dateRange?.from
                  ? "border-primary/50 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40",
              )}
              style={{ fontSize: 12 }}
            >
              <Calendar size={12} />
              {rangeLabel}
              <ChevronDown size={11} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
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
              defaultMonth={dateRange?.from}
            />
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          className="h-8 gap-1.5"
          style={{ fontSize: 12 }}
          onClick={onNewActivity}
        >
          <Plus size={13} />
          {t("newActivity")}
        </Button>
      </div>
    </header>
  );
}
