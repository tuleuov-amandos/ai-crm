"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { Activity, CheckSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChartCard } from "./ChartCard";
import { EmptyState } from "./EmptyState";
import { reportsService } from "@/services/reports.service";

import { CustomTooltipProps } from "@/lib/types/chart";

// Backend returns Vietnamese status names; map them to localized labels for display.
const RAW_STATUS = {
  done: "Đã xong",
  overdue: "Quá hạn",
  pending: "Đang chờ",
} as const;

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-card border border-[#E8E7E2] dark:border-border rounded-lg shadow-md px-3 py-2.5 text-xs text-left">
      <p className="text-[#1A1A18] dark:text-foreground mb-1.5" style={{ fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between items-center gap-6 mb-1 last:mb-0">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full shrink-0" style={{ background: p.fill }} />
            <span className="text-[#6B6B67] dark:text-muted-foreground">{p.name}:</span>
          </div>
          <span className="text-[#1A1A18] dark:text-foreground font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const STATUS_COLORS: Record<string, string> = {
  [RAW_STATUS.done]: "#1D9E75",
  [RAW_STATUS.overdue]: "#D85A30",
  [RAW_STATUS.pending]: "#FBBF24",
};

interface ActivityReportTabProps {
  startDate?: string;
  endDate?: string;
}

export function ActivityReportTab({ startDate, endDate }: ActivityReportTabProps) {
  const t = useTranslations("reports.activityTab");

  const LEGEND = [
    { color: "#534AB7", key: "Calls", name: t("seriesCalls") },
    { color: "#7F77DD", key: "Emails", name: t("seriesEmails") },
    { color: "#AFA9EC", key: "Meetings", name: t("seriesMeetings") },
    { color: "#1D9E75", key: "Tasks", name: t("seriesTasks") },
  ];

  const statusLabel = (name: string) =>
    name === RAW_STATUS.done ? t("statusDone")
      : name === RAW_STATUS.overdue ? t("statusOverdue")
        : name === RAW_STATUS.pending ? t("statusPending")
          : name;

  // Query backend activities statistics
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "activities", startDate, endDate],
    queryFn: () => reportsService.getActivities({ startDate, endDate }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[350px]">
        <span className="text-[#6B6B67] text-sm">{t("loading")}</span>
      </div>
    );
  }

  if (!data) return null;

  // Calculate dynamic metrics from trends
  const totalCalls = data.trend.reduce((sum, item) => sum + item.Calls, 0);
  const totalMeetings = data.trend.reduce((sum, item) => sum + item.Meetings, 0);
  const totalTasks = data.trend.reduce((sum, item) => sum + item.Tasks, 0);

  // Call / Meeting ratio
  const callMeetingRatio = totalMeetings > 0 ? (totalCalls / totalMeetings).toFixed(1) : totalCalls.toString();

  // Find overdue task percentage from status distribution
  const overduePercentItem = data.statusDistribution.find(d => d.name === RAW_STATUS.overdue);
  const overduePercent = overduePercentItem ? overduePercentItem.value : 0;

  const isTrendEmpty = !data.trend || data.trend.length === 0 || (totalCalls === 0 && totalMeetings === 0 && totalTasks === 0);
  const isStatusEmpty = !data.statusDistribution || data.statusDistribution.length === 0 || data.statusDistribution.every(d => d.value === 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-card rounded-[10px] border border-[#E8E7E2] dark:border-border p-4 flex flex-col gap-1.5 shadow-sm">
          <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 11 }}>{t("kpiCallMeetingRatio")}</span>
          <span className="text-[#1A1A18] dark:text-foreground font-bold" style={{ fontSize: 20 }}>{callMeetingRatio} : 1</span>
          <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 10 }}>{t("kpiCallMeetingHint")}</span>
        </div>
        <div className="bg-white dark:bg-card rounded-[10px] border border-[#E8E7E2] dark:border-border p-4 flex flex-col gap-1.5 shadow-sm">
          <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 11 }}>{t("kpiTotalMeetings")}</span>
          <span className="text-[#1A1A18] dark:text-foreground font-bold" style={{ fontSize: 20 }}>{totalMeetings}</span>
          <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 10 }}>{t("kpiTotalMeetingsHint")}</span>
        </div>
        <div className="bg-white dark:bg-card rounded-[10px] border border-[#E8E7E2] dark:border-border p-4 flex flex-col gap-1.5 shadow-sm">
          <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 11 }}>{t("kpiTasksDone")}</span>
          <span className="text-[#1A1A18] dark:text-foreground font-bold" style={{ fontSize: 20 }}>{totalTasks}</span>
          <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 10 }}>{t("kpiTasksDoneHint")}</span>
        </div>
        <div className="bg-white dark:bg-card rounded-[10px] border border-[#E8E7E2] dark:border-border p-4 flex flex-col gap-1.5 shadow-sm">
          <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 11 }}>{t("kpiOverdue")}</span>
          <span className="text-[#D85A30] font-bold" style={{ fontSize: 20 }}>{overduePercent}%</span>
          <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 10 }}>{t("kpiOverdueHint")}</span>
        </div>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Trend Bar Chart */}
        <div className="md:col-span-2">
          <ChartCard
            title={t("trendTitle")}
            subtitle={t("trendSubtitle")}
            action={
              !isTrendEmpty && (
                <div className="flex items-center gap-3 mr-1">
                  {LEGEND.map((l) => (
                    <div key={l.key} className="flex items-center gap-1">
                      <div className="size-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
                      <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 11 }}>{l.name}</span>
                    </div>
                  ))}
                </div>
              )
            }
          >
            {isTrendEmpty ? (
              <EmptyState
                icon={Activity}
                title={t("trendEmptyTitle")}
                description={t("trendEmptyDescription")}
                height={240}
              />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.trend} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Calls" stackId="activities" name={t("seriesCalls")} fill="#534AB7" />
                  <Bar dataKey="Emails" stackId="activities" name={t("seriesEmails")} fill="#7F77DD" />
                  <Bar dataKey="Meetings" stackId="activities" name={t("seriesMeetings")} fill="#AFA9EC" />
                  <Bar dataKey="Tasks" stackId="activities" name={t("seriesTasks")} fill="#1D9E75" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Task status Donut Chart */}
        <ChartCard
          title={t("statusTitle")}
          subtitle={t("statusSubtitle")}
        >
          {isStatusEmpty ? (
            <EmptyState
              icon={CheckSquare}
              title={t("statusEmptyTitle")}
              description={t("statusEmptyDescription")}
              height={240}
            />
          ) : (
            <div className="flex flex-col items-center gap-2" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={data.statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {data.statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || "#6B6B67"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, statusLabel(String(name))]} />
                </PieChart>
              </ResponsiveContainer>

              {/* Custom status legend labels */}
              <div className="w-full grid grid-cols-3 gap-1 mt-1">
                {data.statusDistribution.map((d) => (
                  <div key={d.name} className="flex flex-col items-center text-center">
                    <div className="flex items-center gap-1 mb-0.5">
                      <div className="size-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[d.name] || "#6B6B67" }} />
                      <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 10 }}>{statusLabel(d.name)}</span>
                    </div>
                    <span className="text-[#1A1A18] dark:text-foreground font-bold" style={{ fontSize: 12 }}>{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
