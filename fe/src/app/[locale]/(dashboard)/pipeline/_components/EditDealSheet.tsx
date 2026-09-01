import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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
import { Deal, DealDetail, STAGE_CONFIG, STAGES } from "./types";
import { useUpdateDeal } from "@/hooks/useDeals";
import { useGetUsers } from "@/hooks/useUsers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

const buildFormSchema = (tv: (key: string) => string) =>
  z.object({
    title:     z.string().min(1, tv("nameRequired")),
    stage:     z.enum(STAGES, tv("stageRequired")),
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
  const usersQuery = useGetUsers();
  const users = usersQuery.data ?? [];
  const usersLoading = usersQuery.isLoading;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title:     deal?.title ?? "",
      stage:     "PROSPECT",
      contactId: "",
      ownerId:   "",
      value:     0,
      closeDate: "",
      note:      "",
    },
  });

  // Populate form when deal changes / sheet opens
  useEffect(() => {
    if (deal && open) {
      form.reset({
        title:     deal.title,
        stage:     deal.stage,
        contactId: deal.contactId || "",
        ownerId:   deal.ownerId || "",
        value:     Number(deal.value) || 0,
        closeDate: deal.closeDate ? new Date(deal.closeDate).toISOString().split("T")[0] : "",
        note:      deal.note || "",
      });
    }
  }, [deal, open, form]);

  const onSubmit = (values: FormValues) => {
    if (!deal) return;
    
    updateDeal.mutate({
      title:   values.title,
      ownerId: values.ownerId,
      value:   values.value,
      closeDate: values.closeDate ? new Date(values.closeDate) : undefined,
      note:    values.note,
    });

    toast.success(t("toasts.dealUpdated"));
    onOpenChange(false);
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
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ fontSize: 12 }}>{t("stageLabel")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger size="sm" style={{ fontSize: 13 }} className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s} value={s} style={{ fontSize: 13 }}>
                            {STAGE_CONFIG[s].label}
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
              <Button type="submit" size="sm" className="flex-1 text-xs">
                {t("saveChanges")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
