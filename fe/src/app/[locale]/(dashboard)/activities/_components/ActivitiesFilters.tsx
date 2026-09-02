"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  ExternalLink,
  FileText,
  Mail,
  Phone,
  Users,
  ChevronDown,
  Check,
} from "lucide-react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useGetUsers } from "@/hooks/useUsers";
import { useGetContacts } from "@/hooks/useContacts";

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

const dropdownBtnClass =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-background transition-colors cursor-pointer";

function DropdownBtn({ label }: { label: string }) {
  return (
    <button
      className={cn(
        dropdownBtnClass,
        "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
      style={{ fontSize: 12 }}
    >
      {label}
      <ChevronDown size={11} />
    </button>
  );
}

function DropdownTrigger({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        dropdownBtnClass,
        active
          ? "border-primary/50 text-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
      style={{ fontSize: 12 }}
    >
      <span className="max-w-[160px] truncate">{label}</span>
      <ChevronDown size={11} className="shrink-0" />
    </button>
  );
}

function ListRow({
  label,
  sublabel,
  active,
  onClick,
}: {
  label: string;
  sublabel?: string;
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
      <span className="min-w-0 flex-1 truncate">
        {label}
        {sublabel ? (
          <span className="ml-1 text-muted-foreground/70">{sublabel}</span>
        ) : null}
      </span>
    </button>
  );
}

// ─── STAFF FILTER ─────────────────────────────────────────────────────────────
function StaffFilter({
  selectedUserId,
  onUserChange,
}: {
  selectedUserId: string | undefined;
  onUserChange: (userId: string | undefined) => void;
}) {
  const t = useTranslations("activities");
  const [open, setOpen] = useState(false);
  const { data: users, isLoading } = useGetUsers();

  const selectedUser = users?.find((u) => u.id === selectedUserId);
  const label = selectedUser?.name ?? t("filters.allStaff");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <DropdownTrigger label={label} active={!!selectedUserId} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1.5">
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          <ListRow
            label={t("filters.allStaff")}
            active={!selectedUserId}
            onClick={() => {
              onUserChange(undefined);
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
              <ListRow
                key={u.id}
                label={u.name}
                active={selectedUserId === u.id}
                onClick={() => {
                  onUserChange(u.id);
                  setOpen(false);
                }}
              />
            ))
          ) : (
            <p
              className="px-2 py-1.5 text-muted-foreground"
              style={{ fontSize: 12 }}
            >
              {t("filters.noStaff")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── CONTACT FILTER ───────────────────────────────────────────────────────────
function ContactFilter({
  selectedContactId,
  selectedContactName,
  onContactChange,
}: {
  selectedContactId: string | undefined;
  selectedContactName: string | undefined;
  onContactChange: (
    contactId: string | undefined,
    contactName: string | undefined,
  ) => void;
}) {
  const t = useTranslations("activities");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data, isLoading, isFetching } = useGetContacts({
    search: debouncedSearch || undefined,
    limit: 10,
  });

  const contacts = data?.pages[0]?.data ?? [];
  const label = selectedContactName || t("filters.allContacts");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <DropdownTrigger label={label} active={!!selectedContactId} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("filters.searchContacts")}
          className="mb-1.5 w-full rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:border-primary/50"
          style={{ fontSize: 12 }}
        />
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          <ListRow
            label={t("filters.allContacts")}
            active={!selectedContactId}
            onClick={() => {
              onContactChange(undefined, undefined);
              setOpen(false);
            }}
          />
          {isLoading || isFetching ? (
            <p
              className="px-2 py-1.5 text-muted-foreground"
              style={{ fontSize: 12 }}
            >
              …
            </p>
          ) : contacts.length > 0 ? (
            contacts.map((c) => (
              <ListRow
                key={c.id}
                label={c.name}
                sublabel={c.company ?? undefined}
                active={selectedContactId === c.id}
                onClick={() => {
                  onContactChange(c.id, c.name);
                  setOpen(false);
                }}
              />
            ))
          ) : (
            <p
              className="px-2 py-1.5 text-muted-foreground"
              style={{ fontSize: 12 }}
            >
              {t("filters.noContacts")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ActivitiesFilters({
  activeFilter,
  onFilterChange,
  showEmpty,
  onToggleEmpty,
  selectedUserId,
  onUserChange,
  selectedContactId,
  selectedContactName,
  onContactChange,
}: {
  activeFilter: "all" | ActivityType;
  onFilterChange: (filter: "all" | ActivityType) => void;
  showEmpty: boolean;
  onToggleEmpty: () => void;
  selectedUserId: string | undefined;
  onUserChange: (userId: string | undefined) => void;
  selectedContactId: string | undefined;
  selectedContactName: string | undefined;
  onContactChange: (
    contactId: string | undefined,
    contactName: string | undefined,
  ) => void;
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
        <StaffFilter
          selectedUserId={selectedUserId}
          onUserChange={onUserChange}
        />
        <ContactFilter
          selectedContactId={selectedContactId}
          selectedContactName={selectedContactName}
          onContactChange={onContactChange}
        />
        <DropdownBtn label={t("filters.last7Days")} />
      </div>
    </div>
  );
}
