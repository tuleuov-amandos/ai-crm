"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { z } from "zod";
import {
  ACTIVITY_ATTACHMENT_ACCEPT,
  validateActivityAttachmentFile,
} from "@/lib/activity-attachment";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  ActivityFormValues,
  ActivityType,
  ActivityTypeEnum,
} from "@/lib/validations/activities.scheme";
import {
  useCreateActivity,
  useCreateContactActivity,
  useCreateDealActivity,
  useDeleteActivityAttachment,
  useUpdateActivity,
  useUploadActivityAttachment,
} from "@/hooks/useActivities";

import type { ActivityItem } from "./types";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type ActivityFormContext =
  | { type: "contact"; contactId: string }
  | { type: "deal"; dealId: string }
  | { type: "global" };

interface ActivityFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If activity exists -> edit mode; if not -> create mode */
  activity?: ActivityItem;
  /** Context to determine endpoint when creating new */
  context: ActivityFormContext;
}

// ─────────────────────────────────────────
// Select options — order for the type dropdown (labels via next-intl)
// ─────────────────────────────────────────
const TYPE_OPTION_VALUES: ActivityType[] = [
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.MEETING,
  ActivityType.NOTE,
];

const buildActivityFormSchema = (tv: (key: string) => string) =>
  z.object({
    type: ActivityTypeEnum,
    title: z.string().nullable().optional(),
    note: z.string().min(1, tv("noteRequired")),
    date: z.date().optional(),
  });

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

/** Convert Date object to value of <input type="datetime-local"> */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

export function ActivityForm({
  open,
  onOpenChange,
  activity,
  context,
}: ActivityFormProps) {
  const t = useTranslations("activities.form");
  const tType = useTranslations("activities.types");
  const tAttachment = useTranslations("activities.attachment");
  const tCommon = useTranslations("common");
  const activityFormSchema = useMemo(
    () => buildActivityFormSchema((key) => t(`validation.${key}`)),
    [t],
  );
  const typeOptions = TYPE_OPTION_VALUES.map((value) => ({
    value,
    label: tType(value.toLowerCase() as Lowercase<ActivityType>),
  }));

  const isEditMode = !!activity;

  // ── Mutations — instantiate all, use based on context ──────────────────
  // Need to call hooks unconditionally (rules of hooks)
  const contactId = context.type === "contact" ? context.contactId : "";
  const dealId = context.type === "deal" ? context.dealId : "";

  const createForContact = useCreateContactActivity(contactId);
  const createForDeal = useCreateDealActivity(dealId);
  const createGlobal = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const uploadAttachment = useUploadActivityAttachment();
  const deleteAttachment = useDeleteActivityAttachment();

  // isPending of active mutation
  const isPending =
    createForContact.isPending ||
    createForDeal.isPending ||
    createGlobal.isPending ||
    updateActivity.isPending ||
    uploadAttachment.isPending;

  // ── Attachment — newly picked file (uploaded after the activity is saved) ──
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the picked file whenever the dialog (re)opens — done during render
  // (not in an Effect) per React's "adjusting state based on a prop change"
  // pattern, since it must run before this render commits.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPendingFile(null);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    const error = validateActivityAttachmentFile(file);
    if (error) {
      toast.error(tAttachment(`errors.${error}`));
      return;
    }
    setPendingFile(file);
  };

  // ── Form setup ──────────────────────────────────────────────────────────
  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      type: ActivityType.CALL,
      title: "",
      note: "",
      date: new Date(),
    },
  });

  // ── Pre-populate when edit mode or when dialog reopens ──────────────────
  useEffect(() => {
    if (open) {
      if (activity) {
        // Edit mode — pre-fill from activity
        form.reset({
          type: activity.type,
          title: activity.title ?? "",
          note: activity.note,
          date: new Date(activity.date),
        });
      } else {
        // Create mode — reset to default
        form.reset({
          type: ActivityType.CALL,
          title: "",
          note: "",
          date: new Date(),
        });
      }
    }
  }, [open, activity]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit handler ──────────────────────────────────────────────────────
  async function onSubmit(values: ActivityFormValues) {
    const payload = {
      type: values.type,
      title: values.title || null,
      note: values.note,
      date: values.date,
    };

    try {
      let activityId = activity?.id;

      if (isEditMode && activity) {
        // Edit mode — PATCH /activities/:id
        await updateActivity.mutateAsync({ id: activity.id, body: payload });
      } else {
        // Create mode — select endpoint according to context
        let created;
        if (context.type === "contact") {
          created = await createForContact.mutateAsync(payload);
        } else if (context.type === "deal") {
          created = await createForDeal.mutateAsync(payload);
        } else {
          created = await createGlobal.mutateAsync(payload);
        }
        activityId = created.id;
      }

      if (pendingFile && activityId) {
        await uploadAttachment.mutateAsync({ id: activityId, file: pendingFile });
      }

      // Success -> close form
      onOpenChange(false);
    } catch {
      // Failure -> keep form, toast has been handled in hook
      // Do not call onOpenChange(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 15 }}>
            {isEditMode ? t("editTitle") : t("createTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            {/* Type — required select */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={{ fontSize: 12 }}>
                    {t("typeLabel")} <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder={t("typePlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {typeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage style={{ fontSize: 11 }} />
                </FormItem>
              )}
            />

            {/* Title — optional text */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={{ fontSize: 12 }}>{t("titleLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("titlePlaceholder")}
                      className="h-9"
                      style={{ fontSize: 13 }}
                      disabled={isPending}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage style={{ fontSize: 11 }} />
                </FormItem>
              )}
            />

            {/* Note — required textarea (req 12.2) */}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={{ fontSize: 12 }}>
                    {t("noteLabel")} <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("notePlaceholder")}
                      className="min-h-[96px] resize-none"
                      style={{ fontSize: 13 }}
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  {/* FormMessage automatically displays "Content cannot be blank" from Zod */}
                  <FormMessage style={{ fontSize: 11 }} />
                </FormItem>
              )}
            />

            {/* Date — optional datetime picker */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={{ fontSize: 12 }}>{t("dateLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      className="h-9"
                      style={{ fontSize: 13 }}
                      disabled={isPending}
                      value={
                        field.value
                          ? toDatetimeLocalValue(
                              field.value instanceof Date
                                ? field.value
                                : new Date(field.value),
                            )
                          : ""
                      }
                      onChange={(e) => {
                        field.onChange(
                          e.target.value ? new Date(e.target.value) : undefined,
                        );
                      }}
                    />
                  </FormControl>
                  <FormMessage style={{ fontSize: 11 }} />
                </FormItem>
              )}
            />

            {/* Attachment — optional, at most one file per activity */}
            <FormItem>
              <FormLabel style={{ fontSize: 12 }}>{tAttachment("label")}</FormLabel>
              <div className="flex flex-col gap-1.5">
                {isEditMode && activity?.attachmentUrl && !pendingFile && (
                  <div className="flex items-center gap-2">
                    <a
                      href={activity.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                      style={{ fontSize: 12, textDecoration: "none" }}
                    >
                      <Paperclip size={12} />
                      {tAttachment("view")}
                    </a>
                    <button
                      type="button"
                      onClick={() => deleteAttachment.mutate(activity.id)}
                      disabled={deleteAttachment.isPending || isPending}
                      className="text-muted-foreground hover:text-destructive bg-transparent border-0 cursor-pointer p-0"
                      aria-label={tAttachment("remove")}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACTIVITY_ATTACHMENT_ACCEPT}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isPending}
                  >
                    <Paperclip size={12} />
                    {pendingFile ? tAttachment("change") : tAttachment("add")}
                  </Button>
                  {pendingFile && (
                    <span className="flex items-center gap-1 text-muted-foreground truncate" style={{ fontSize: 12 }}>
                      {pendingFile.name}
                      <button
                        type="button"
                        onClick={() => setPendingFile(null)}
                        className="text-muted-foreground hover:text-foreground bg-transparent border-0 cursor-pointer p-0"
                        aria-label={tAttachment("remove")}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                  {tAttachment("hint")}
                </span>
              </div>
            </FormItem>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                style={{ fontSize: 12 }}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                style={{ fontSize: 12 }}
              >
                {isPending && <Loader2 size={13} className="animate-spin" />}
                {isEditMode ? t("saveChanges") : t("createCta")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
