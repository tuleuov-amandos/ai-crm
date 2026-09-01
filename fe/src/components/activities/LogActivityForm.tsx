"use client";
import {
  ActivityType,
  ActivityTypeEnum,
  CreateActivityForContactBodyType,
} from "@/lib/validations/activities.scheme";
import { useTranslations } from "next-intl";
import { z } from "zod";
import {
  Phone,
  Mail,
  Users,
  FileText,
  Clock,
  ChevronDown,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export type ActivityTab = ActivityType;

const TABS: { key: ActivityTab; icon: typeof Phone }[] = [
  { key: ActivityType.CALL, icon: Phone },
  { key: ActivityType.EMAIL, icon: Mail },
  { key: ActivityType.MEETING, icon: Users },
  { key: ActivityType.NOTE, icon: FileText },
];

const buildLogActivitySchema = (tv: (key: string) => string) =>
  z
    .object({
      type: ActivityTypeEnum,
      title: z.string().nullable().optional(),
      note: z.string().min(1, tv("noteRequired")),
      date: z.coerce.date().optional(),
    })
    .strict();

interface LogActivityFormProps {
  onSubmit: (data: CreateActivityForContactBodyType, reset: () => void) => void;
  isPending?: boolean;
  entityType?: "contact" | "deal";
}

function LogActivityForm({ onSubmit, isPending, entityType = "contact" }: LogActivityFormProps) {
  const t = useTranslations("activities.log");
  const tType = useTranslations("activities.types");
  const logActivitySchema = useMemo(
    () => buildLogActivitySchema((key) => t(`validation.${key}`)),
    [t],
  );
  const [activeTab, setActiveTab] = useState<ActivityTab>(
    ActivityType.CALL,
  );

  const form = useForm({
    resolver: zodResolver(logActivitySchema),
    defaultValues: {
      title: "",
      note: "",
      date: new Date(),
      type: ActivityType.CALL as ActivityType,
    },
  });

  const note = useWatch({ control: form.control, name: "note" });
  const selectedDateRaw = form.watch("date");
  const selectedDate = selectedDateRaw instanceof Date ? selectedDateRaw : new Date(selectedDateRaw ? String(selectedDateRaw) : Date.now());

  const handleTabChange = (tab: ActivityTab) => {
    setActiveTab(tab);
    form.reset({
      title: "",
      note: "",
      date: new Date(),
      type: tab,
    });
  };

  const handleSubmit = (data: CreateActivityForContactBodyType) => {
    const reset = () =>
      form.reset({ title: "", note: "", date: new Date(), type: activeTab });
    
    const payload = {
      ...data,
      title: data.title?.trim() ? data.title.trim() : null,
    };
    onSubmit(payload, reset);
  };

  const PLACEHOLDER: Record<ActivityTab, string> = {
    [ActivityType.CALL]: t("placeholder.call"),
    [ActivityType.EMAIL]: t("placeholder.email"),
    [ActivityType.MEETING]: t("placeholder.meeting"),
    [ActivityType.NOTE]:
      entityType === "deal"
        ? t("placeholder.noteDeal")
        : t("placeholder.noteContact"),
  };

  return (
    <div className="mx-6 mt-5 mb-0 bg-background rounded-xl border border-border overflow-hidden shrink-0">
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        {/* Tab selector */}
        <div className="flex border-b border-border">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 py-2.5 border-0 cursor-pointer transition-all",
                  "-mb-px border-b-2",
                  isActive
                    ? "bg-secondary/40 text-primary border-b-primary"
                    : "bg-transparent text-muted-foreground border-b-transparent hover:text-foreground hover:bg-muted/30",
                )}
                style={{ fontSize: 12, fontWeight: isActive ? 500 : 400 }}
              >
                <Icon size={12} strokeWidth={isActive ? 2.2 : 1.7} />
                {tType(tab.key.toLowerCase() as Lowercase<ActivityType>)}
              </button>
            );
          })}
        </div>

        {/* Title input */}
        <div className="px-4 pt-3">
          <Input
            {...form.register("title")}
            value={form.watch("title") || ""}
            placeholder={t("titlePlaceholder")}
            className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground text-sm"
            style={{ fontSize: 13 }}
          />
        </div>
    
        {/* Textarea */}
        <div className="px-4 py-2">
          <Textarea
            {...form.register("note")}
            value={form.watch("note") || ""}
            placeholder={PLACEHOLDER[activeTab]}
            rows={3}
            className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground text-sm resize-none"
            style={{ fontSize: 13, lineHeight: 1.6 }}
          />
        </div>

        {/* Form footer */}
        <div className="flex items-center justify-between px-3.5 py-2 border-t border-border">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border border-border bg-background text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <Clock size={11} />
                {selectedDate.toISOString().split('T')[0]}
                <ChevronDown size={10} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 bg-white dark:bg-card border dark:border-border flex flex-col gap-2" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (!date) return;
                  const currentHour = selectedDate.getHours();
                  const currentMinute = selectedDate.getMinutes();
                  const newDate = new Date(date);
                  newDate.setHours(currentHour);
                  newDate.setMinutes(currentMinute);
                  newDate.setSeconds(0);
                  form.setValue("date", newDate);
                }}
              />
              <div className="flex items-center justify-between border-t border-border pt-2 gap-2">
                <span className="text-[11px] text-muted-foreground font-medium">{t("activityTime")}</span>
                <div className="flex items-center gap-1">
                  {/* Hours Select */}
                  <select
                    value={selectedDate.getHours().toString().padStart(2, "0")}
                    onChange={(e) => {
                      const newDate = new Date(selectedDate);
                      newDate.setHours(parseInt(e.target.value, 10));
                      form.setValue("date", newDate);
                    }}
                    className="text-xs bg-[#F8F8F7] dark:bg-muted border border-border dark:border-border text-foreground rounded px-1.5 py-1 outline-none font-mono"
                  >
                    {Array.from({ length: 24 }).map((_, i) => {
                      const val = i.toString().padStart(2, "0");
                      return <option key={val} value={val} className="bg-white dark:bg-card text-foreground">{val}</option>;
                    })}
                  </select>
                  <span className="text-muted-foreground text-xs">:</span>
                  {/* Minutes Select */}
                  <select
                    value={selectedDate.getMinutes().toString().padStart(2, "0")}
                    onChange={(e) => {
                      const newDate = new Date(selectedDate);
                      newDate.setMinutes(parseInt(e.target.value, 10));
                      form.setValue("date", newDate);
                    }}
                    className="text-xs bg-[#F8F8F7] dark:bg-muted border border-border dark:border-border text-foreground rounded px-1.5 py-1 outline-none font-mono"
                  >
                    {Array.from({ length: 60 }).map((_, i) => {
                      const val = i.toString().padStart(2, "0");
                      return <option key={val} value={val} className="bg-white dark:bg-card text-foreground">{val}</option>;
                    })}
                  </select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="submit"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={!note?.trim() || isPending}
          >
            <Send size={11} />
            {isPending ? t("saving") : t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default LogActivityForm;
