"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Hash, Lock, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import { useMe } from "@/hooks/useAuth";
import {
  useAddChannelMembers,
  useChannels,
  useCreateChannel,
  useDeleteChannel,
} from "@/hooks/useChat";
import { useGetUsers } from "@/hooks/useUsers";
import { UserOption } from "@/lib/validations/users.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChannelListProps {
  selectedChannelId: string | undefined;
  onSelect: (channelId: string | undefined) => void;
}

// Dropdown-of-checkboxes multiselect, same pattern the contact form used to
// use for tags (removed in fix/contact-remove-tags-field) — reused here for
// picking channel members instead. Keeps the menu open across selections
// (onSelect preventDefault) since, unlike a 3-value tag list, the user list
// can be long enough that reopening the menu per pick would be tedious.
function MemberMultiSelect({
  id,
  users,
  selectedIds,
  onChange,
  placeholder,
  emptyLabel,
  selectedLabel,
}: {
  id?: string;
  users: UserOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  emptyLabel: string;
  selectedLabel: (count: number) => string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          id={id}
          className="flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-colors hover:bg-accent/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {selectedIds.length > 0 ? (
            <span className="truncate">{selectedLabel(selectedIds.length)}</span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Users className="size-4 opacity-50" />
              {placeholder}
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 max-h-64 overflow-y-auto" align="start">
        {users.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground" style={{ fontSize: 12 }}>
            {emptyLabel}
          </p>
        ) : (
          users.map((user) => {
            const checked = selectedIds.includes(user.id);
            return (
              <DropdownMenuCheckboxItem
                key={user.id}
                checked={checked}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(isChecked) => {
                  onChange(
                    isChecked
                      ? [...selectedIds, user.id]
                      : selectedIds.filter((existingId) => existingId !== user.id),
                  );
                }}
              >
                {user.name}
              </DropdownMenuCheckboxItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ChannelList({
  selectedChannelId,
  onSelect,
}: ChannelListProps) {
  const t = useTranslations("chat.channels");
  const tCommon = useTranslations("common");
  const { data: me } = useMe();
  const isAdmin = me?.role === "ADMIN";
  const { data: channels, isLoading } = useChannels();
  const { data: users } = useGetUsers();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();
  const addChannelMembers = useAddChannelMembers();

  const otherUsers = useMemo(
    () => (users ?? []).filter((user) => user.id !== me?.id),
    [users, me?.id],
  );

  const [isCreating, setIsCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelIsPrivate, setNewChannelIsPrivate] = useState(false);
  const [newChannelMemberIds, setNewChannelMemberIds] = useState<string[]>([]);
  const [deletingChannel, setDeletingChannel] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [addingMembersTo, setAddingMembersTo] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [addMemberIds, setAddMemberIds] = useState<string[]>([]);

  const closeCreateForm = () => {
    setIsCreating(false);
    setNewChannelName("");
    setNewChannelIsPrivate(false);
    setNewChannelMemberIds([]);
  };

  const handleCreate = () => {
    const name = newChannelName.trim();
    if (!name || createChannel.isPending) return;
    createChannel.mutate(
      {
        name,
        isPrivate: isAdmin ? newChannelIsPrivate : undefined,
        memberIds: isAdmin && newChannelIsPrivate ? newChannelMemberIds : undefined,
      },
      { onSuccess: closeCreateForm },
    );
  };

  const handleConfirmDelete = () => {
    if (!deletingChannel) return;
    deleteChannel.mutate(deletingChannel.id, {
      onSuccess: () => {
        if (deletingChannel.id === selectedChannelId) {
          onSelect(undefined);
        }
        setDeletingChannel(null);
      },
    });
  };

  const closeAddMembers = () => {
    setAddingMembersTo(null);
    setAddMemberIds([]);
  };

  const handleConfirmAddMembers = () => {
    if (!addingMembersTo || addMemberIds.length === 0) return;
    addChannelMembers.mutate(
      { channelId: addingMembersTo.id, userIds: addMemberIds },
      { onSuccess: closeAddMembers },
    );
  };

  const canDelete = (createdById: string) =>
    me?.id === createdById || isAdmin;

  const canManageMembers = (createdById: string) =>
    me?.id === createdById || isAdmin;

  return (
    <div className="w-[260px] min-w-[220px] bg-background border-r border-border flex flex-col overflow-hidden shrink-0">
      <div className="h-11 shrink-0 border-b border-border flex items-center justify-between px-3">
        <span
          className="text-muted-foreground uppercase tracking-wide"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {t("title")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => setIsCreating((v) => !v)}
        >
          <Plus size={14} />
        </Button>
      </div>

      {isCreating && (
        <div className="flex flex-col gap-2 p-2 border-b border-border">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
                if (e.key === "Escape") closeCreateForm();
              }}
              placeholder={t("namePlaceholder")}
              className="h-8 text-xs"
              disabled={createChannel.isPending}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={closeCreateForm}
              disabled={createChannel.isPending}
            >
              <X size={13} />
            </Button>
          </div>

          {isAdmin && (
            <label className="flex items-center gap-1.5 px-0.5 cursor-pointer select-none">
              <Checkbox
                checked={newChannelIsPrivate}
                onCheckedChange={(checked) => setNewChannelIsPrivate(checked === true)}
                disabled={createChannel.isPending}
              />
              <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("private")}
              </span>
            </label>
          )}

          {isAdmin && newChannelIsPrivate && (
            <MemberMultiSelect
              users={otherUsers}
              selectedIds={newChannelMemberIds}
              onChange={setNewChannelMemberIds}
              placeholder={t("membersPlaceholder")}
              emptyLabel={t("noUsers")}
              selectedLabel={(count) => t("membersSelected", { count })}
            />
          )}

          <Button
            size="sm"
            className="h-7 text-xs self-end"
            onClick={handleCreate}
            disabled={!newChannelName.trim() || createChannel.isPending}
          >
            {tCommon("add")}
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1.5">
        {isLoading ? (
          <p
            className="px-3 py-2 text-muted-foreground"
            style={{ fontSize: 12 }}
          >
            {tCommon("loading")}
          </p>
        ) : channels && channels.length > 0 ? (
          channels.map((channel) => {
            const active = channel.id === selectedChannelId;
            const ChannelIcon = channel.isPrivate ? Lock : Hash;
            return (
              <div
                key={channel.id}
                className={cn(
                  "group flex items-center gap-1.5 mx-1.5 rounded-lg px-2 py-1.5 cursor-pointer transition-colors",
                  active
                    ? "bg-[#EEEDFE] text-[#534AB7]"
                    : "text-[#495057] hover:bg-[#E9ECEF] hover:text-[#212529]",
                )}
                onClick={() => onSelect(channel.id)}
              >
                <ChannelIcon size={13} className="shrink-0 opacity-70" />
                <span
                  className="flex-1 min-w-0 truncate"
                  style={{ fontSize: 13, fontWeight: active ? 500 : 400 }}
                >
                  {channel.name}
                </span>
                {channel.unreadCount > 0 && (
                  <Badge
                    variant="default"
                    className="h-[18px] min-w-[18px] px-1 justify-center rounded-full border-0 shrink-0"
                    style={{ fontSize: 10 }}
                  >
                    {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
                  </Badge>
                )}
                {channel.isPrivate && canManageMembers(channel.createdById) && (
                  <button
                    type="button"
                    aria-label={t("addMembersAction")}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground bg-transparent border-0 cursor-pointer p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingMembersTo({ id: channel.id, name: channel.name });
                    }}
                  >
                    <UserPlus size={12} />
                  </button>
                )}
                {canDelete(channel.createdById) && (
                  <button
                    type="button"
                    aria-label={t("deleteTitle")}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive bg-transparent border-0 cursor-pointer p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingChannel({ id: channel.id, name: channel.name });
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p
            className="px-3 py-2 text-muted-foreground"
            style={{ fontSize: 12 }}
          >
            {t("empty")}
          </p>
        )}
      </div>

      <AlertDialog
        open={!!deletingChannel}
        onOpenChange={(open) => !open && setDeletingChannel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { name: deletingChannel?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              className="cursor-pointer"
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!addingMembersTo}
        onOpenChange={(open) => !open && closeAddMembers()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addMembersTitle")}</DialogTitle>
            <DialogDescription>
              {t("addMembersDescription", { name: addingMembersTo?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>{t("membersLabel")}</Label>
            <MemberMultiSelect
              users={otherUsers}
              selectedIds={addMemberIds}
              onChange={setAddMemberIds}
              placeholder={t("membersPlaceholder")}
              emptyLabel={t("addMembersEmpty")}
              selectedLabel={(count) => t("membersSelected", { count })}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={closeAddMembers}
              disabled={addChannelMembers.isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              className="cursor-pointer"
              onClick={handleConfirmAddMembers}
              disabled={addMemberIds.length === 0 || addChannelMembers.isPending}
            >
              {t("addMembersSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
