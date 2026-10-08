"use client";

import { useEffect, useState } from "react";
import {
  Building2, Users, Mail, User, Lock, CreditCard, FileText, Bell, Puzzle, BarChart2, Workflow,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/useAuth";
import { MOBILE_BREAKPOINT } from "@/hooks/use-mobile";
import { DesktopOnlyStub } from "@/components/desktop-only";
import { isDesktopOnlySettingsTab } from "@/lib/mobileAccess";

import { WorkspaceInfo } from "./_components/WorkspaceInfo";
import { MembersRoles }  from "./_components/MembersRoles";
import { InvitationsList } from "./_components/InvitationsList";
import { ProfileSettings } from "./_components/ProfileSettings";
import { PasswordSettings } from "./_components/PasswordSettings";
import { PipelineStagesSettings } from "./_components/PipelineStagesSettings";

// ── Nav structure ─────────────────────────────────────────────────────────────
export type SettingsTab =
  | "workspace-info" | "members" | "invitations" | "pipeline-stages"
  | "profile" | "password"
  | "billing" | "invoices"
  | "notifications" | "integrations";

const NAV_GROUPS: {
  labelKey: string;
  // adminOnly items are hidden from other roles and while the user loads
  items: { id: SettingsTab; labelKey: string; Icon: typeof Building2; adminOnly?: boolean }[];
}[] = [
  {
    labelKey: "groupWorkspace",
    items: [
      { id: "workspace-info", labelKey: "workspaceInfo", Icon: Building2 },
      { id: "members",        labelKey: "members",       Icon: Users      },
      { id: "invitations",    labelKey: "invitations",   Icon: Mail       },
      { id: "pipeline-stages", labelKey: "pipelineStages", Icon: Workflow, adminOnly: true },
    ],
  },
  {
    labelKey: "groupAccount",
    items: [
      { id: "profile",  labelKey: "profile",  Icon: User },
      { id: "password", labelKey: "password", Icon: Lock },
    ],
  },
  {
    labelKey: "groupBilling",
    items: [
      { id: "billing",  labelKey: "billing",  Icon: CreditCard },
      { id: "invoices", labelKey: "invoices", Icon: FileText   },
    ],
  },
  {
    labelKey: "groupSystem",
    items: [
      { id: "notifications", labelKey: "notifications", Icon: Bell   },
      { id: "integrations",  labelKey: "integrations",  Icon: Puzzle },
    ],
  },
];

// ── Placeholder for unbuilt tabs ───────────────────────────────────────────────
function ComingSoonContent({ label }: { label: string }) {
  const t = useTranslations("settings");
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: 420 }}>
      <div className="size-14 rounded-full flex items-center justify-center mb-4 bg-[#EEEDFE] dark:bg-secondary">
        <BarChart2 size={24} className="text-[#534AB7] dark:text-primary" />
      </div>
      <p className="text-[#1A1A18] dark:text-foreground mb-1.5" style={{ fontSize: 15, fontWeight: 600 }}>{label}</p>
      <p className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 13 }}>{t("comingSoon")}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const t = useTranslations("settings");
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace-info");
  const { data: me } = useMe();
  const isAdmin = me?.role === "ADMIN";

  // На телефоне стартовая вкладка (workspace-info) недоступна: один раз после
  // монтирования открываем profile. Заглушка ниже остаётся страховкой для
  // случая, когда ширина изменилась уже после выбора вкладки.
  useEffect(() => {
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-mount read of the viewport width (SSR-safe hydration)
      setActiveTab((tab) => (isDesktopOnlySettingsTab(tab) ? "profile" : tab));
    }
  }, []);

  const activeItem = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeTab);
  const activeLabel = activeItem ? t(`nav.${activeItem.labelKey}`) : "";

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 border-b border-[#E8E7E2] dark:border-border bg-white dark:bg-card flex items-center px-6 gap-3"
        style={{ height: 56 }}
      >
        <h1 className="text-[#1A1A18] dark:text-foreground tracking-tight" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1 }}>
          {t("title")}
        </h1>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden bg-[#F8F8F7] dark:bg-background max-md:flex-col">

        {/* ── Settings sub-nav ────────────────────────────────────────────────── */}
        <aside
          className="shrink-0 overflow-y-auto border-r border-[#E8E7E2] dark:border-border bg-white dark:bg-card w-full md:w-[220px] max-md:border-r-0 max-md:border-b"
        >
          <div className="p-4">
            <p className="text-[#1A1A18] dark:text-foreground mb-4" style={{ fontSize: 16, fontWeight: 500 }}>{t("title")}</p>

            <div className="flex flex-col gap-5">
              {NAV_GROUPS.map((group) => (
                <div
                  key={group.labelKey}
                  className={cn(group.items.every((item) => isDesktopOnlySettingsTab(item.id)) && "max-md:hidden")}
                >
                  {/* Group label */}
                  <p
                    className="text-[#6B6B67] dark:text-muted-foreground mb-1.5 tracking-wider"
                    style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}
                  >
                    {t(`nav.${group.labelKey}`)}
                  </p>

                  {/* Items */}
                  <div className="flex flex-col gap-0.5">
                    {group.items.filter((item) => !item.adminOnly || isAdmin).map(({ id, labelKey, Icon }) => {
                      const active = activeTab === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setActiveTab(id)}
                          className={cn(
                            "flex items-center gap-2 w-full px-2.5 py-2 rounded-lg transition-colors text-left cursor-pointer",
                            isDesktopOnlySettingsTab(id) && "max-md:hidden",
                            active
                              ? "bg-[#EEEDFE] dark:bg-secondary text-[#534AB7] dark:text-primary"
                              : "text-[#6B6B67] dark:text-muted-foreground hover:bg-[#F8F8F7] dark:hover:bg-muted hover:text-[#1A1A18] dark:hover:text-foreground"
                          )}
                          style={{ fontSize: 13, fontWeight: active ? 500 : 400, border: "none" }}
                        >
                          <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                          {t(`nav.${labelKey}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Settings content ─────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
          {isDesktopOnlySettingsTab(activeTab) && (
            <div className="flex min-h-[320px] flex-col md:hidden">
              <DesktopOnlyStub />
            </div>
          )}
          <div className={cn(isDesktopOnlySettingsTab(activeTab) && "contents max-md:hidden")}>
            {activeTab === "workspace-info" && <WorkspaceInfo />}
            {activeTab === "members"        && <MembersRoles />}
            {activeTab === "invitations"    && <InvitationsList />}
            {activeTab === "profile"        && <ProfileSettings />}
            {activeTab === "password"       && <PasswordSettings />}
            {activeTab === "pipeline-stages" && isAdmin && <PipelineStagesSettings />}
            {!["workspace-info", "members", "invitations", "pipeline-stages", "profile", "password"].includes(activeTab) && (
              <ComingSoonContent label={activeLabel} />
            )}
          </div>
        </main>

      </div>
    </div>
  );
}
