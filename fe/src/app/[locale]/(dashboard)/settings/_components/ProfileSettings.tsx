"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2, Upload, Trash2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useMe } from "@/hooks/useAuth";
import { useUpdateProfile, useUploadAvatar, useRemoveAvatar } from "@/hooks/useProfile";
import {
  ProfileFormSchema,
  type ProfileFormValues,
  AVATAR_MAX_BYTES,
  AVATAR_ALLOWED_MIME,
} from "@/lib/validations/profile.schema";

function getInitials(name?: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0] ? parts[0][0].toUpperCase() : "";
}

function SectionCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-card rounded-[10px] border border-[#E8E7E2] dark:border-border p-5">
      <h2 className="text-[#1A1A18] dark:text-foreground mb-4" style={{ fontSize: 14, fontWeight: 500 }}>{title}</h2>
      <div className="border-t border-[#E8E7E2] dark:border-border pt-4">{children}</div>
    </div>
  );
}

export function ProfileSettings() {
  const t = useTranslations("settings.account.profile");
  const { data: me } = useMe();

  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(ProfileFormSchema),
    values: { name: me?.name ?? "" },
  });

  const onSubmit = (values: ProfileFormValues) => {
    updateProfile.mutate(values, { onSuccess: () => reset(values) });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    if (!AVATAR_ALLOWED_MIME.includes(file.type)) {
      toast.error(t("avatarInvalidType"));
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(t("avatarTooLarge"));
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    const clear = () => {
      setPreview(null);
      URL.revokeObjectURL(url);
    };
    uploadAvatar.mutate(file, { onSuccess: clear, onError: clear });
  };

  const avatarBusy = uploadAvatar.isPending || removeAvatar.isPending;
  const shownAvatar = preview ?? me?.avatarUrl ?? undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* Content header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{t("heading")}</h1>
          <p className="text-[#6B6B67] dark:text-muted-foreground mt-1.5" style={{ fontSize: 13 }}>{t("subtitle")}</p>
        </div>
        <Button
          onClick={handleSubmit(onSubmit)}
          disabled={!isDirty || updateProfile.isPending}
          className="h-9 rounded-[10px] bg-[#534AB7] hover:bg-[#4840A0] text-white shrink-0"
          style={{ fontSize: 13 }}
        >
          {updateProfile.isPending && <Loader2 size={14} className="animate-spin" />}
          {t("save")}
        </Button>
      </div>

      <SectionCard title={t("sectionTitle")}>
        <div className="flex gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center shrink-0 gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
              className="group relative size-[100px] rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-[#E8E7E2] dark:border-border transition-colors disabled:cursor-not-allowed"
              title={t("uploadAvatar")}
            >
              <Avatar className="size-full rounded-full">
                {shownAvatar && <AvatarImage src={shownAvatar} alt={me?.name ?? ""} />}
                <AvatarFallback
                  className="border-0 rounded-full"
                  style={{ background: "#D4E8F5", color: "#1A5C7A", fontSize: 28, fontWeight: 600 }}
                >
                  {getInitials(me?.name)}
                </AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                {avatarBusy ? (
                  <Loader2 size={18} className="animate-spin text-white" />
                ) : (
                  <Upload size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={AVATAR_ALLOWED_MIME.join(",")}
              className="hidden"
              onChange={handleFile}
            />
            <p className="text-[#6B6B67] dark:text-muted-foreground text-center" style={{ fontSize: 10 }}>{t("avatarHint")}</p>
            {me?.avatarUrl && (
              <button
                type="button"
                onClick={() => removeAvatar.mutate()}
                disabled={avatarBusy}
                className="flex items-center gap-1 text-[#B42318] dark:text-red-400 hover:underline disabled:opacity-50 bg-transparent border-0 cursor-pointer"
                style={{ fontSize: 11 }}
              >
                <Trash2 size={11} />
                {t("removeAvatar")}
              </button>
            )}
          </div>

          {/* Fields */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("name")}</Label>
              <Input
                {...register("name")}
                className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]"
                style={{ fontSize: 13 }}
              />
              {errors.name?.message && (
                <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{t(`validation.${errors.name.message}`)}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("email")}</Label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B67] dark:text-muted-foreground pointer-events-none" />
                <Input
                  value={me?.email ?? ""}
                  readOnly
                  disabled
                  className="h-10 pl-9 rounded-[10px] border-[#E8E7E2] dark:border-border bg-[#F8F8F7] dark:bg-muted text-[#6B6B67] dark:text-muted-foreground"
                  style={{ fontSize: 13 }}
                />
              </div>
              <p className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 11 }}>{t("emailHint")}</p>
            </div>
          </form>
        </div>
      </SectionCard>
    </div>
  );
}
