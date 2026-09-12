"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Users, Wallet, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "../../_components/StatCard";
import { StatusBadge } from "../../_components/StatusBadge";
import { useTenantDetail } from "../../_lib/hooks";

export default function TenantDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: tenant, isLoading } = useTenantDetail(id);

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-screen">
      <header className="h-14 shrink-0 border-b bg-background flex items-center px-6 gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2"
          onClick={() => router.push("/platform-admin")}
        >
          <ArrowLeft size={14} />
          Назад к списку
        </Button>
      </header>

      <main className="flex-1 p-6 space-y-5 bg-[#F8F8F7] dark:bg-background">
        {isLoading || !tenant ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : (
          <>
            {/* ── Company summary ──────────────────────────────────────── */}
            <div className="bg-background border border-border rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-foreground" style={{ fontSize: 20, fontWeight: 600 }}>
                  {tenant.name}
                </h1>
                <StatusBadge status={tenant.status} />
              </div>
              <p className="text-muted-foreground" style={{ fontSize: 13 }}>
                {tenant.slug}
              </p>
              <div className="flex items-center gap-4 flex-wrap text-muted-foreground" style={{ fontSize: 13 }}>
                <span>
                  Тариф: <span className="text-foreground font-medium">{tenant.plan}</span>
                </span>
                <span>
                  Дата регистрации:{" "}
                  <span className="text-foreground font-medium">
                    {new Date(tenant.createdAt).toLocaleDateString("ru-RU")}
                  </span>
                </span>
              </div>
            </div>

            {/* ── Counters ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Контакты" value={tenant.contactCount} icon={Wallet} />
              <StatCard label="Сделки" value={tenant.dealCount} icon={GitBranch} />
              <StatCard label="Пользователи" value={tenant.userCount} icon={Users} />
            </div>

            {/* ── Users table ──────────────────────────────────────────── */}
            <div className="bg-background border border-border rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border/60">
                    <TableHead
                      className="px-4 py-3 text-muted-foreground uppercase"
                      style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                    >
                      Имя
                    </TableHead>
                    <TableHead
                      className="px-4 py-3 text-muted-foreground uppercase"
                      style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                    >
                      Email
                    </TableHead>
                    <TableHead
                      className="px-4 py-3 text-muted-foreground uppercase"
                      style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                    >
                      Роль
                    </TableHead>
                    <TableHead
                      className="px-4 py-3 text-muted-foreground uppercase"
                      style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
                    >
                      Дата регистрации
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.users.map((user) => (
                    <TableRow key={user.id} className="border-b border-border/40">
                      <TableCell className="px-4 py-3 text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>
                        {user.name}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                        {user.email}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                        {user.roleName}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground whitespace-nowrap" style={{ fontSize: 13 }}>
                        {new Date(user.createdAt).toLocaleDateString("ru-RU")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
