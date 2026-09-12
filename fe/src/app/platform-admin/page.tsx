"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Clock, XCircle } from "lucide-react";
import logoImg from "@/app/favicon.ico";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "./_components/StatCard";
import { StatusBadge } from "./_components/StatusBadge";
import { Tenant, useLogout, useMe, useTenants, useUpdateTenantStatus } from "./_lib/hooks";

const STATUS_OPTIONS: { value: Tenant["status"]; label: string }[] = [
  { value: "ACTIVE", label: "Активна" },
  { value: "SUSPENDED", label: "Приостановлена" },
  { value: "PENDING", label: "На рассмотрении" },
];

export default function PlatformAdminTenantsPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: tenants, isLoading } = useTenants();
  const updateStatus = useUpdateTenantStatus();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    router.push("/platform-admin/login");
  };

  const totalCount = tenants?.length ?? 0;
  const activeCount = tenants?.filter((t) => t.status === "ACTIVE").length ?? 0;
  const pendingCount = tenants?.filter((t) => t.status === "PENDING").length ?? 0;
  const suspendedCount = tenants?.filter((t) => t.status === "SUSPENDED").length ?? 0;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-screen">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header className="h-14 shrink-0 border-b bg-background flex items-center justify-between px-6 gap-3">
        <div className="flex items-center gap-2">
          <Image
            src={logoImg}
            alt="NSTORE"
            width={24}
            height={24}
            unoptimized
            className="rounded-[6px] shrink-0"
          />
          <span
            className="text-foreground"
            style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}
          >
            NSTORE
          </span>
          <span className="text-muted-foreground" style={{ fontSize: 12 }}>
            Admin Panel
          </span>
        </div>

        <div className="flex items-center gap-3">
          {me?.email && (
            <span className="text-muted-foreground" style={{ fontSize: 13 }}>
              {me.email}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleLogout} disabled={logout.isPending}>
            Выйти
          </Button>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 p-6 space-y-5 bg-[#F8F8F7] dark:bg-background">
        {/* ── Stat cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Всего компаний" value={totalCount} icon={Building2} />
          <StatCard
            label="Активные"
            value={activeCount}
            icon={CheckCircle2}
            iconBg="#F0F9E6"
            iconColor="#3B6D11"
          />
          <StatCard
            label="На рассмотрении"
            value={pendingCount}
            icon={Clock}
            iconBg="#FEF3E2"
            iconColor="#854F0B"
          />
          <StatCard
            label="Приостановлены"
            value={suspendedCount}
            icon={XCircle}
            iconBg="#FDF0F0"
            iconColor="#A32D2D"
          />
        </div>

        {/* ── Tenants table ──────────────────────────────────────────────── */}
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Загрузка...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border/60">
                  <TableHead
                    className="px-4 py-3 text-muted-foreground uppercase"
                    style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    Компания
                  </TableHead>
                  <TableHead
                    className="px-4 py-3 text-muted-foreground uppercase"
                    style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    Владелец
                  </TableHead>
                  <TableHead
                    className="px-4 py-3 text-muted-foreground uppercase"
                    style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    Тариф
                  </TableHead>
                  <TableHead
                    className="px-4 py-3 text-muted-foreground uppercase"
                    style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    Контакты
                  </TableHead>
                  <TableHead
                    className="px-4 py-3 text-muted-foreground uppercase"
                    style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    Сделки
                  </TableHead>
                  <TableHead
                    className="px-4 py-3 text-muted-foreground uppercase"
                    style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    Дата регистрации
                  </TableHead>
                  <TableHead
                    className="px-4 py-3 text-muted-foreground uppercase"
                    style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    Статус
                  </TableHead>
                  <TableHead
                    className="px-4 py-3 text-muted-foreground uppercase"
                    style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    Действие
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants?.map((tenant) => (
                  <TableRow
                    key={tenant.id}
                    className="hover:bg-muted/30 cursor-pointer border-b border-border/40"
                    onClick={() => router.push(`/platform-admin/tenants/${tenant.id}`)}
                  >
                    <TableCell className="px-4 py-3 text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>
                      {tenant.name}
                    </TableCell>
                    <TableCell className="px-4 py-3" style={{ fontSize: 13 }}>
                      {tenant.adminName ? (
                        <div>
                          <div className="text-foreground">{tenant.adminName}</div>
                          <div className="text-muted-foreground" style={{ fontSize: 11 }}>
                            {tenant.adminEmail ?? "—"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                      {tenant.plan}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                      {tenant.contactCount}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                      {tenant.dealCount}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground whitespace-nowrap" style={{ fontSize: 13 }}>
                      {new Date(tenant.createdAt).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusBadge status={tenant.status} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={tenant.status}
                          onValueChange={(value) =>
                            updateStatus.mutateAsync({ id: tenant.id, status: value as Tenant["status"] })
                          }
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
