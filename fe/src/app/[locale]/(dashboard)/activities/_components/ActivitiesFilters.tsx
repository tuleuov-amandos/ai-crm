"use client";

import { type ReactNode } from "react";

import {
  ExternalLink,
  FileText,
  Mail,
  Phone,
  Users,
  ChevronDown,
} from "lucide-react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { ActivityType } from "./types";

function FilterPill({
  icon,
  label,
  active,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors cursor-pointer",
        active
          ? "bg-primary text-white border-primary"
          : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
      )}
      style={{ fontSize: 12, fontWeight: active ? 500 : 400 }}
    >
      {icon}
      {label}
    </button>
  );
}

function DropdownBtn({ label }: { label: string }) {
  return (
    <button
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer"
      style={{ fontSize: 12 }}
    >
      {label}
      <ChevronDown size={11} />
    </button>
  );
}

export function ActivitiesFilters({
  activeFilter,
  onFilterChange,
  showEmpty,
  onToggleEmpty,
}: {
  activeFilter: "all" | ActivityType;
  onFilterChange: (filter: "all" | ActivityType) => void;
  showEmpty: boolean;
  onToggleEmpty: () => void;
}) {
  const t = useTranslations("activities");
  const filterPills: {
    key: "all" | ActivityType;
    label: string;
    icon?: ReactNode;
  }[] = [
    { key: "all", label: t("filters.all") },
    { key: "CALL", label: t("types.call"), icon: <Phone size={11} /> },
    { key: "EMAIL", label: t("types.email"), icon: <Mail size={11} /> },
    { key: "MEETING", label: t("types.meeting"), icon: <Users size={11} /> },
    { key: "NOTE", label: t("types.note"), icon: <FileText size={11} /> },
  ];

  return (
    <div className="shrink-0 border-b bg-background px-6 py-3 space-y-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {filterPills.map((pill) => (
          <FilterPill
            key={pill.key}
            icon={pill.icon}
            label={pill.label}
            active={activeFilter === pill.key}
            onClick={() => onFilterChange(pill.key)}
          />
        ))}

        <button
          onClick={onToggleEmpty}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent"
          style={{ fontSize: 11 }}
          title="Toggle empty state (dev)"
        >
          <ExternalLink size={10} />
          {showEmpty ? t("filters.showData") : t("filters.emptyState")}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <DropdownBtn label={t("filters.allStaff")} />
        <DropdownBtn label={t("filters.allContacts")} />
        <DropdownBtn label={t("filters.last7Days")} />
      </div>
    </div>
  );
}
