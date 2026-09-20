"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Hash, Plus, Trash2, X } from "lucide-react";
import { useMe } from "@/hooks/useAuth";
import { useChannels, useCreateChannel, useDeleteChannel } from "@/hooks/useChat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface ChannelListProps {
  selectedChannelId: string | undefined;
  onSelect: (channelId: string | undefined) => void;
}

export default function ChannelList({
  selectedChannelId,
  onSelect,
}: ChannelListProps) {
  const t = useTranslations("chat.channels");
  const tCommon = useTranslations("common");
  const { data: me } = useMe();
  const { data: channels, isLoading } = useChannels();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();

  const [isCreating, setIsCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [deletingChannel, setDeletingChannel] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const closeCreateForm = () => {
    setIsCreating(false);
    setNewChannelName("");
  };

  const handleCreate = () => {
    const name = newChannelName.trim();
    if (!name || createChannel.isPending) return;
    createChannel.mutate(name, { onSuccess: closeCreateForm });
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

  const canDelete = (createdById: string) =>
    me?.id === createdById || me?.role === "ADMIN";

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
        <div className="flex items-center gap-1.5 p-2 border-b border-border">
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
                <Hash size={13} className="shrink-0 opacity-70" />
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
    </div>
  );
}
