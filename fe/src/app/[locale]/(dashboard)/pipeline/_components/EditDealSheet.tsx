import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Deal, DealDetail } from "./types";
import { dealKeys, useUpdateDeal, useUpdateDealStage } from "@/hooks/useDeals";
import { usePipelineStages, useStageLabel } from "@/hooks/usePipelineStages";
import { useGetUsers } from "@/hooks/useUsers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

const buildFormSchema = (tv: (key: string) => string) =>
  z.object({
    title:     z.string().min(1, tv("nameRequired")),
    stageId:   z.string(),
    contactId: z.string(),
    ownerId:   z.string().min(1, tv("ownerRequired")),
    value:     z.number().nonnegative(tv("valueNonNegative")),
    closeDate: z.string(),
    note:      z.string(),
  });

type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;

interface Props {
  deal: Deal | DealDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDealSheet({ deal, open, onOpenChange }: Props) {
  const t = useTranslations("pipeline.form");
  const tv = useTranslations("pipeline.form.validation");
  const tCommon = useTranslations("common");
  const formSchema = useMemo(() => buildFormSchema(tv), [tv]);
  const updateDeal = useUpdateDeal(deal.id);
  // Same stage move as the board: PATCH /deals/:id/stage with { stageId }
  const updateDealStage = useUpdateDealStage();
  const queryClient = useQueryClient();
  const tToasts = useTranslations("pipeline.toasts");
  const usersQuery = useGetUsers();
  const users = usersQuery.data ?? [];
  const usersLoading = usersQuery.isLoading;
  const { stages, getDealStage, isLoading: stagesLoading } = usePipelineStages();
  const stageLabel = useStageLabel();
  const dealStageId = getDealStage(deal)?.id ?? "";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title:     deal?.title ?? "",
      stageId:   "",
      contactId: "",
      ownerId:   "",
      value:     0,
      closeDate: "",
      note:      "",
    },
  });

  // Populate form when deal changes / sheet opens / stages finish loading
  useEffect(() => {
    if (deal && open) {
      form.reset({
        title:     deal.title,
        stageId:   dealStageId,
        contactId: deal.contactId || "",
        ownerId:   deal.ownerId || "",
        value:     Number(deal.value) || 0,
        closeDate: deal.closeDate ? new Date(deal.closeDate).toISOString().split("T")[0] : "",
        note:      deal.note || "",
      });
    }
  }, [deal, open, form, dealStageId]);

  // Read during render so react-hook-form tracks it
  const { dirtyFields } = form.formState;

  const onSubmit = (values: FormValues) => {
    if (!deal) return;

    // PATCH /deals/:id does not write the stage; a changed stage is saved with
    // its own request after the other fields. stageId is "" until stages load.
    const stageChanged = !!values.stageId && values.stageId !== dealStageId;
    const fieldsChanged = Object.keys(dirtyFields).some((key) => key !== "stageId");

    // Errors toast in useUpdateDealStage; on failure the sheet stays open and
    // the other fields stay saved. The rollback there is a no-op: the deal was
    // not moved on the board optimistically.
    const saveStage = (onlyStage: boolean) =>
      updateDealStage.mutate(
        { id: deal.id, from: dealStageId, to: values.stageId, data: { stageId: values.stageId } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: dealKeys.detail(deal.id) });
            // useUpdateDeal already toasted when the other fields were saved
            if (onlyStage) toast.success(tToasts("updateSuccess"));
            onOpenChange(false);
          },
        },
      );

    if (stageChanged && !fieldsChanged) {
      saveStage(true);
      return;
    }

    updateDeal.mutate(
      {
        title:   values.title,
        ownerId: values.ownerId,
        value:   values.value,
        closeDate: values.closeDate ? new Date(values.closeDate) : undefined,
        note:    values.note,
      },
      {
        // Success toast is owned by useUpdateDeal's onSuccess; only close on success
        onSuccess: () => {
          if (!stageChanged) {
            onOpenChange(false);
            return;
          }
          // The fields are saved: a retry after a failed stage move sends only the stage
          form.reset(values);
          saveStage(false);
        },
      },
    );
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] overflow-y-auto p-5">
        <DialogHeader className="pb-4 border-b mb-4">
          <DialogTitle style={{ fontSize: 15, fontWeight: 600 }}>{t("editTitle")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={{ fontSize: 12 }}>
                    {t("nameLabel")} <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={t("namePlaceholder")} {...field} style={{ fontSize: 13 }} className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground" />
                  </FormControl>
                  <FormMessage style={{ fontSize: 11 }} />
                </FormItem>
              )}
            />

            {/* Stage + Value */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="stageId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ fontSize: 12 }}>{t("stageLabel")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={stagesLoading}>
                      <FormControl>
                        <SelectTrigger size="sm" style={{ fontSize: 13 }} className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground">
                          <SelectValue placeholder={stagesLoading ? tCommon("loading") : undefined} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.id} value={s.id} style={{ fontSize: 13 }}>
                            {stageLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage style={{ fontSize: 11 }} />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ fontSize: 12 }}>{t("valueLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("valuePlaceholder")}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        style={{ fontSize: 13 }}
                        className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground"
                      />
                    </FormControl>
                    <FormMessage style={{ fontSize: 11 }} />
                  </FormItem>
                )}
              />
            </div>

            {/* Owner + Close Date */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ fontSize: 12 }}>{t("ownerLabel")} <span className="text-destructive">*</span></FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={usersLoading}>
                      <FormControl>
                        <SelectTrigger size="sm" style={{ fontSize: 13 }} className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground">
                          <SelectValue placeholder={usersLoading ? tCommon("loading") : t("selectRep")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map((o) => (
                          <SelectItem key={o.id} value={o.id} style={{ fontSize: 13 }}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage style={{ fontSize: 11 }} />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="closeDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel style={{ fontSize: 12, lineHeight: 1 }}>{t("closeDateLabel")}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="w-full h-8 pl-3 text-left font-normal text-xs bg-[#F8F8F7] dark:bg-card border border-[#E8E7E2] dark:border-border text-foreground hover:bg-gray-100 dark:hover:bg-muted"
                          >
                            {field.value ? (
                              format(new Date(field.value), "dd/MM/yyyy")
                            ) : (
                              <span className="text-muted-foreground">{t("pickDate")}</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-white dark:bg-card border dark:border-border" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(date) => {
                            field.onChange(date ? date.toISOString().split("T")[0] : "");
                          }}
                          disabled={(date) =>
                            date < new Date("1900-01-01")
                          }
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage style={{ fontSize: 11 }} />
                  </FormItem>
                )}
              />
            </div>

            {/* Note */}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={{ fontSize: 12 }}>{t("noteLabel")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("notePlaceholder")}
                      rows={4}
                      {...field}
                      style={{ fontSize: 13, resize: "none" }}
                      className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground"
                    />
                  </FormControl>
                  <FormMessage style={{ fontSize: 11 }} />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-3">
              <Button
                type="button" 
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => onOpenChange(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button type="submit" size="sm" className="flex-1 text-xs" disabled={updateDeal.isPending || updateDealStage.isPending}>
                {t("saveChanges")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
