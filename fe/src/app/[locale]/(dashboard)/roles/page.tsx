"use client";
import React, { useState } from "react";
import { ShieldCheck, UserCheck, Users, Loader2, Pencil, Trash2, Plus, Lock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersService, RoleDto, RolePermission } from "@/services/users.service";
import { useMe } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useApiError } from "@/hooks/useApiError";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const getRoleIcon = (name: string) => {
  if (name === "ADMIN") return { icon: ShieldCheck, color: "#EF4444", bgColor: "#FEF2F2" };
  if (name === "MANAGER") return { icon: UserCheck, color: "#3B82F6", bgColor: "#EFF6FF" };
  return { icon: Users, color: "#10B981", bgColor: "#ECFDF5" };
};

const SUBJECT_KEY: Record<string, string> = {
  Contact: "contact",
  Deal: "deal",
  Task: "task",
  Activity: "activity",
  User: "user",
  Report: "report",
  KpiTarget: "kpiTarget",
  all: "all",
};

type Translate = (key: string) => string;

const formatSubject = (t: Translate, subject: string) => {
  const key = SUBJECT_KEY[subject];
  return key ? t(`subject.${key}`) : subject;
};

// Summarize and group permissions by subject to optimize card display space
const getGroupedPermissionsText = (t: Translate, rolePermissions: RolePermission[]) => {
  const hasManageAll = rolePermissions.some((p) => p.action === "manage" && p.subject === "all");
  if (hasManageAll) {
    return [t("fullAccessText")];
  }

  const groups: Record<string, string[]> = {};
  rolePermissions.forEach((p) => {
    if (!groups[p.subject]) groups[p.subject] = [];
    const isABAC = !!(p.conditions && Object.keys(p.conditions).length > 0);
    const known = ["create", "read", "update", "delete", "manage"].includes(p.action);
    const actionLabel = (known ? t(`action.${p.action}`) : p.action) + (isABAC ? " 🔒" : "");
    groups[p.subject].push(actionLabel);
  });

  return Object.entries(groups).map(([subject, actions]) => {
    const subjectLabel = formatSubject(t, subject);
    const actionsList = actions.join(", ");
    return `${subjectLabel}: ${actionsList}`;
  });
};

export default function RolesPage() {
  const t = useTranslations("roles");
  const tCommon = useTranslations("common");
  const getApiError = useApiError();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "ADMIN";

  // Queries
  const { data: roles = [], isLoading: isLoadingRoles, refetch: refetchRoles } = useQuery({
    queryKey: ["roles"],
    queryFn: usersService.getRoles,
  });

  const { data: allPermissions = [], isLoading: isLoadingPerms } = useQuery({
    queryKey: ["permissions"],
    queryFn: usersService.getPermissions,
  });

  // Permissions management state
  const [selectedRole, setSelectedRole] = useState<RoleDto | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<string[]>([]);
  const [isPermDialogOpen, setIsPermDialogOpen] = useState(false);

  // State CRUD Role
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDto | null>(null);
  const [editingRoleName, setEditingRoleName] = useState("");
  const [editingRoleDesc, setEditingRoleDesc] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState<RoleDto | null>(null);

  // Matrix Configuration
  const subjects = ['Contact', 'Deal', 'Task', 'Activity', 'User', 'Report', 'KpiTarget', 'all'];
  const actions = ['read', 'create', 'update', 'delete', 'manage'];

  // Mutations
  const updatePermsMutation = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
      usersService.updateRolePermissions(roleId, permissionIds),
    onSuccess: () => {
      toast.success(t("toastPermsSuccess"));
      setIsPermDialogOpen(false);
      refetchRoles();
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err: unknown) => {
      toast.error(getApiError(err, t("toastPermsFail")));
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      usersService.createRole(data),
    onSuccess: () => {
      toast.success(t("toastCreateSuccess"));
      setIsCreateOpen(false);
      setNewRoleName("");
      setNewRoleDesc("");
      refetchRoles();
    },
    onError: (err: unknown) => {
      toast.error(getApiError(err, t("toastCreateFail")));
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ roleId, data }: { roleId: string; data: { name: string; description?: string } }) =>
      usersService.updateRole(roleId, data),
    onSuccess: () => {
      toast.success(t("toastUpdateSuccess"));
      setIsEditOpen(false);
      setEditingRole(null);
      refetchRoles();
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err: unknown) => {
      toast.error(getApiError(err, t("toastUpdateFail")));
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) => usersService.deleteRole(roleId),
    onSuccess: () => {
      toast.success(t("toastDeleteSuccess"));
      setIsDeleteOpen(false);
      setDeletingRole(null);
      refetchRoles();
    },
    onError: (err: unknown) => {
      toast.error(getApiError(err, t("toastDeleteFail")));
    },
  });

  // Handlers
  const handleEditPermsClick = (role: RoleDto) => {
    setSelectedRole(role);
    setSelectedPermIds(role.permissions.map((p) => p.id));
    setIsPermDialogOpen(true);
  };

  const handleTogglePermission = (permId: string) => {
    setSelectedPermIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  };

  const handleSavePerms = () => {
    if (!selectedRole) return;
    updatePermsMutation.mutate({
      roleId: selectedRole.id,
      permissionIds: selectedPermIds,
    });
  };

  const handleCreateRole = () => {
    if (!newRoleName.trim()) {
      toast.error(t("roleNameRequired"));
      return;
    }
    createRoleMutation.mutate({
      name: newRoleName.trim(),
      description: newRoleDesc.trim(),
    });
  };

  const handleEditRoleClick = (role: RoleDto) => {
    setEditingRole(role);
    setEditingRoleName(role.name);
    setEditingRoleDesc(role.description || "");
    setIsEditOpen(true);
  };

  const handleSaveRole = () => {
    if (!editingRole) return;
    if (!editingRoleName.trim()) {
      toast.error(t("roleNameRequired"));
      return;
    }
    updateRoleMutation.mutate({
      roleId: editingRole.id,
      data: {
        name: editingRoleName.trim(),
        description: editingRoleDesc.trim(),
      },
    });
  };

  const handleDeleteRoleClick = (role: RoleDto) => {
    setDeletingRole(role);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deletingRole) return;
    deleteRoleMutation.mutate(deletingRole.id);
  };

  if (isLoadingRoles || isLoadingPerms) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="animate-spin text-primary" size={32} />
          <span className="text-sm text-muted-foreground">{t("loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <header className="h-14 shrink-0 border-b flex items-center justify-between px-6 bg-background">
        <h1 className="text-[#1A1A18] dark:text-foreground text-sm font-semibold tracking-tight">{t("title")}</h1>
        {isAdmin && (
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="h-8 text-xs gap-1.5 bg-[#534AB7] hover:bg-[#4840A0] text-white rounded-[8px]"
          >
            <Plus size={14} />
            {t("createRole")}
          </Button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto bg-[#F8F8F7] dark:bg-background p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {roles.map((item: RoleDto) => {
            const { icon: Icon, color, bgColor } = getRoleIcon(item.name);
            const isSystemRole = ["ADMIN", "MANAGER", "SALES_REP"].includes(item.name);
            const summarizedPermissions = getGroupedPermissionsText(t, item.permissions);

            return (
              <div key={item.id} className="bg-background border border-border/70 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between" style={{ minHeight: 280 }}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="size-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: bgColor, color }}
                      >
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base text-[#1A1A18] dark:text-foreground flex items-center gap-1.5">
                          {item.name}
                          {isSystemRole && (
                            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                              {t("badgeSystem")}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {item.description || t("roleDescFallback", { name: item.name })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <hr className="border-border/50" />

                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-[#868E96] dark:text-muted-foreground uppercase tracking-wider block">
                      {t("permissionsCount", { count: item.permissions.length })}
                    </span>
                    {item.name === "ADMIN" ? (
                      <ul className="space-y-1.5 pl-4 list-disc text-xs text-primary font-medium">
                        <li>{t("adminBullet1")}</li>
                        <li>{t("adminBullet2")}</li>
                      </ul>
                    ) : item.permissions.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic block">{t("noPermissions")}</span>
                    ) : (
                      <ul className="space-y-1.5 pl-4 list-disc text-xs text-[#495057] dark:text-muted-foreground leading-relaxed">
                        {summarizedPermissions.map((txt, idx) => (
                          <li key={idx}>
                            {txt.includes("manage:all") ? (
                              <strong className="text-primary">{txt}</strong>
                            ) : (
                              <span>{txt}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="pt-3 flex gap-2 border-t border-border/30">
                    <Button
                      variant="outline"
                      className="flex-1 text-xs h-9 gap-1.5 text-[#534AB7] dark:text-primary border-[#534AB7]/20 hover:bg-[#EEEDFE] dark:hover:bg-muted hover:text-[#534AB7] dark:hover:text-primary"
                      onClick={() => handleEditPermsClick(item)}
                      disabled={item.name === "ADMIN"}
                    >
                      <Lock size={13} />
                      {t("editPerms")}
                    </Button>

                    {!isSystemRole && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9 shrink-0 text-[#6B6B67] dark:text-muted-foreground hover:bg-[#EEEDFE] dark:hover:bg-muted hover:text-[#534AB7] dark:hover:text-primary border-border/70"
                          onClick={() => handleEditRoleClick(item)}
                          title={t("editRoleTitle")}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9 shrink-0 text-[#6B6B67] dark:text-muted-foreground hover:bg-[#FEE2E2] dark:hover:bg-destructive/20 hover:text-[#A32D2D] dark:hover:text-destructive border-border/70"
                          onClick={() => handleDeleteRoleClick(item)}
                          title={t("deleteRoleTitle")}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Dialog: Edit permissions (Minimal Table Matrix Interface) */}
      <Dialog open={isPermDialogOpen} onOpenChange={setIsPermDialogOpen}>
        <DialogContent className="md:max-w-3xl lg:max-w-4xl max-h-[85vh] flex flex-col p-0 rounded-[10px] overflow-hidden bg-background">
          <DialogHeader className="p-6 border-b shrink-0 bg-background">
            <DialogTitle>{t("permDialogTitle", { role: selectedRole?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {t.rich("permDialogDescription", {
                lock: (chunks) => <span className="text-amber-600 font-semibold">{chunks}</span>,
              })}
            </DialogDescription>
          </DialogHeader>

          {/* Body wrapping permissions matrix scroll area */}
          <div className="flex-1 overflow-y-auto p-6 max-h-[50vh]">
            <div className="border border-slate-200 dark:border-border rounded-lg overflow-hidden bg-background">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-border bg-slate-50/75 dark:bg-muted/50">
                    <th className="p-3.5 text-xs font-semibold text-slate-500 dark:text-muted-foreground uppercase tracking-wider w-1/4">{t("matrixColResource")}</th>
                    <th className="p-3.5 text-xs font-semibold text-slate-500 dark:text-muted-foreground uppercase tracking-wider text-center w-[15%]">{t("matrixColView")}</th>
                    <th className="p-3.5 text-xs font-semibold text-slate-500 dark:text-muted-foreground uppercase tracking-wider text-center w-[15%]">{t("matrixColAdd")}</th>
                    <th className="p-3.5 text-xs font-semibold text-slate-500 dark:text-muted-foreground uppercase tracking-wider text-center w-[15%]">{t("matrixColEdit")}</th>
                    <th className="p-3.5 text-xs font-semibold text-slate-500 dark:text-muted-foreground uppercase tracking-wider text-center w-[15%]">{t("matrixColDelete")}</th>
                    <th className="p-3.5 text-xs font-semibold text-slate-500 dark:text-muted-foreground uppercase tracking-wider text-center w-[15%]">{t("matrixColManage")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-border">
                  {subjects.map((subj) => (
                    <tr key={subj} className="hover:bg-slate-50/20 dark:hover:bg-muted/30 transition-colors">
                      <td className="p-4 text-xs font-bold text-slate-700 dark:text-foreground bg-slate-50/10 dark:bg-muted/10 border-b border-slate-100 dark:border-border">
                        {formatSubject(t, subj)}
                      </td>
                      {actions.map((act) => {
                        const perm = allPermissions.find(p => p.subject === subj && p.action === act);
                        if (!perm) {
                          return <td key={act} className="p-4 text-center text-slate-300 dark:text-muted/40 text-xs font-semibold border-b border-slate-100 dark:border-border">—</td>;
                        }
                        const isChecked = selectedPermIds.includes(perm.id);
                        const rolePerm = selectedRole?.permissions.find(
                          (p) => p.subject === subj && p.action === act
                        );
                        const isABAC = !!(rolePerm?.conditions && Object.keys(rolePerm.conditions).length > 0) || 
                          (selectedRole?.name === 'SALES_REP' && 
                           ['Contact', 'Deal', 'Activity', 'KpiTarget', 'Report'].includes(subj) && 
                           ['read', 'update', 'delete'].includes(act));

                        return (
                          <td
                            key={act}
                            className="p-4 text-center align-middle border-b border-slate-100 dark:border-border cursor-pointer hover:bg-slate-50/80 dark:hover:bg-muted/40 transition-colors"
                            onClick={() => handleTogglePermission(perm.id)}
                          >
                            <div className="flex items-center justify-center gap-1.5 pointer-events-none">
                              <Checkbox
                                checked={isChecked}
                              />
                              {isABAC && isChecked && (
                                <span className="text-amber-500 text-xs shrink-0 select-none" title={t("abacTitle")}>
                                  🔒
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="p-6 border-t shrink-0 flex items-center justify-end gap-2 bg-[#F8F8F7] dark:bg-muted/30">
            <Button variant="ghost" onClick={() => setIsPermDialogOpen(false)} disabled={updatePermsMutation.isPending}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSavePerms} disabled={updatePermsMutation.isPending} className="gap-1.5 bg-[#534AB7] hover:bg-[#4840A0] text-white">
              {updatePermsMutation.isPending && <Loader2 className="animate-spin" size={14} />}
              {tCommon("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Create new role */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[460px] p-0 rounded-[10px] overflow-hidden" aria-describedby={undefined}>
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#E8E7E2] dark:border-border">
            <DialogTitle className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 16, fontWeight: 600 }}>
              {t("createRoleTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("roleNameLabel")}</Label>
              <Input
                type="text"
                placeholder={t("roleNamePlaceholder")}
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]"
                style={{ fontSize: 13 }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("roleDescLabel")}</Label>
              <Input
                type="text"
                placeholder={t("roleDescPlaceholder")}
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]"
                style={{ fontSize: 13 }}
              />
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="h-9 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#6B6B67] dark:text-muted-foreground hover:bg-[#F8F8F7] dark:hover:bg-muted" style={{ fontSize: 13 }}>{tCommon("cancel")}</Button>
            <Button
              onClick={handleCreateRole}
              disabled={createRoleMutation.isPending}
              className="h-9 rounded-[10px] bg-[#534AB7] hover:bg-[#4840A0] text-white"
              style={{ fontSize: 13 }}
            >
              {createRoleMutation.isPending ? t("creating") : t("confirmCreate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit role info (Name/Description) */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[460px] p-0 rounded-[10px] overflow-hidden" aria-describedby={undefined}>
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#E8E7E2] dark:border-border">
            <DialogTitle className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 16, fontWeight: 600 }}>
              {t("editRoleDialogTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("roleNameLabel")}</Label>
              <Input
                type="text"
                value={editingRoleName}
                onChange={(e) => setEditingRoleName(e.target.value)}
                className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]"
                style={{ fontSize: 13 }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("roleDescLabel")}</Label>
              <Input
                type="text"
                value={editingRoleDesc}
                onChange={(e) => setEditingRoleDesc(e.target.value)}
                className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]"
                style={{ fontSize: 13 }}
              />
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="h-9 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#6B6B67] dark:text-muted-foreground hover:bg-[#F8F8F7] dark:hover:bg-muted" style={{ fontSize: 13 }}>{tCommon("cancel")}</Button>
            <Button
              onClick={handleSaveRole}
              disabled={updateRoleMutation.isPending}
              className="h-9 rounded-[10px] bg-[#534AB7] hover:bg-[#4840A0] text-white"
              style={{ fontSize: 13 }}
            >
              {updateRoleMutation.isPending ? tCommon("saving") : tCommon("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirm role deletion */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-[10px] bg-background" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 15, fontWeight: 600 }}>
              {t("deleteRoleDialogTitle", { role: deletingRole?.name ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 13 }}>
              {t("deleteRoleBody")}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)} className="h-9 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#6B6B67] dark:text-muted-foreground hover:bg-[#F8F8F7] dark:hover:bg-muted" style={{ fontSize: 13 }}>{tCommon("cancel")}</Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={deleteRoleMutation.isPending}
              className="h-9 rounded-[10px] bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              style={{ fontSize: 13 }}
            >
              {deleteRoleMutation.isPending ? tCommon("deleting") : t("confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
