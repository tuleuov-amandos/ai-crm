"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
import { Tenant, useLogout, useMe, useTenants, useUpdateTenantStatus } from "./_lib/hooks";

const STATUS_OPTIONS: { value: Tenant["status"]; label: string }[] = [
  { value: "ACTIVE", label: "Активна" },
  { value: "SUSPENDED", label: "Приостановлена" },
  { value: "PENDING", label: "На рассмотрении" },
];

const STATUS_BADGE_VARIANT: Record<Tenant["status"], "default" | "destructive" | "secondary"> = {
  ACTIVE: "default",
  SUSPENDED: "destructive",
  PENDING: "secondary",
};

const STATUS_BADGE_CLASS: Record<Tenant["status"], string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  SUSPENDED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

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

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Панель суперадмина</h1>
        <div className="flex items-center gap-3">
          {me?.email && <span className="text-sm text-muted-foreground">{me.email}</span>}
          <Button variant="outline" onClick={handleLogout} disabled={logout.isPending}>
            Выйти
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Компания</TableHead>
              <TableHead>Владелец</TableHead>
              <TableHead>Тариф</TableHead>
              <TableHead>Контакты</TableHead>
              <TableHead>Сделки</TableHead>
              <TableHead>Дата регистрации</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Действие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants?.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">{tenant.name}</TableCell>
                <TableCell>
                  {tenant.adminName ? (
                    <div>
                      <div>{tenant.adminName}</div>
                      <div className="text-xs text-muted-foreground">
                        {tenant.adminEmail ?? "—"}
                      </div>
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{tenant.plan}</TableCell>
                <TableCell>{tenant.contactCount}</TableCell>
                <TableCell>{tenant.dealCount}</TableCell>
                <TableCell>
                  {new Date(tenant.createdAt).toLocaleDateString("ru-RU")}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[tenant.status]}
                    className={STATUS_BADGE_CLASS[tenant.status]}
                  >
                    {STATUS_OPTIONS.find((o) => o.value === tenant.status)?.label}
                  </Badge>
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
