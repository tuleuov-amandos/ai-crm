"use client";

import type { ReactNode } from "react";
import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, ShieldAlert, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe, useLogout } from "@/hooks/useAuth";

/**
 * Gates the dashboard behind the workspace approval status. A workspace that is
 * not yet ACTIVE (PENDING approval, or SUSPENDED) never reaches the real UI —
 * the backend also enforces this with TenantStatusGuard, this is the matching
 * client-side screen so the user sees an explanation instead of a wall of 403s.
 */
export function TenantStatusGate({ children }: { children: ReactNode }) {
  const { data: me, isLoading, isError, error } = useMe();

  // While we don't know yet, render nothing rather than flashing the dashboard.
  if (isLoading) return <FullScreenSpinner />;

  // 401 → the axios layer is already doing window.location.href = "/login".
  // Hold the spinner while that navigation is in flight instead of briefly
  // flashing the dashboard markup.
  if (isError && isAxiosError(error) && error.response?.status === 401) {
    return <FullScreenSpinner />;
  }

  // Any other error (500 / network / backend down) falls through to the
  // children so the user sees a real error and can retry, rather than being
  // stuck on an infinite spinner thinking the site hung.
  if (!isError && me?.tenantStatus === "PENDING") return <PendingScreen />;
  if (!isError && me?.tenantStatus === "SUSPENDED") return <SuspendedScreen />;

  return <>{children}</>;
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#F8F8F7] dark:bg-background">
      <RefreshCw className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function PendingScreen() {
  const t = useTranslations("tenantPending.pending");
  const queryClient = useQueryClient();
  const logout = useLogout();

  return (
    <StatusShell
      icon={<Clock className="size-6" />}
      tone="pending"
      title={t("title")}
      description={t("description")}
    >
      <Button
        variant="outline"
        onClick={() => queryClient.invalidateQueries({ queryKey: ["auth", "me"] })}
      >
        <RefreshCw className="size-4" />
        {t("refresh")}
      </Button>
      <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
        <LogOut className="size-4" />
        {t("logout")}
      </Button>
    </StatusShell>
  );
}

function SuspendedScreen() {
  const t = useTranslations("tenantPending.suspended");
  const logout = useLogout();

  return (
    <StatusShell
      icon={<ShieldAlert className="size-6" />}
      tone="suspended"
      title={t("title")}
      description={t("description")}
    >
      <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
        <LogOut className="size-4" />
        {t("logout")}
      </Button>
    </StatusShell>
  );
}

function StatusShell({
  icon,
  tone,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  tone: "pending" | "suspended";
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#F8F8F7] p-6 dark:bg-background">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-8 text-center shadow-sm">
        <div
          className={
            "mx-auto flex size-12 items-center justify-center rounded-full " +
            (tone === "suspended"
              ? "bg-destructive/10 text-destructive"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-500")
          }
        >
          {icon}
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">{children}</div>
      </div>
    </div>
  );
}
