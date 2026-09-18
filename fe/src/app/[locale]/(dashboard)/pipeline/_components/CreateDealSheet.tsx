"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDebounceValue } from "usehooks-ts";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ContactDialog from "@/app/[locale]/(dashboard)/contacts/_components/ContactDialog";
import type { Stage } from "./types";
import { useGetContacts } from "@/hooks/useContacts";
import { useCreateDeal } from "@/hooks/useDeals";
import { useGetUsers } from "@/hooks/useUsers";
import { Contact } from "@/lib/validations/contacts.scheme";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const buildCreateDealSchema = (tv: (key: string) => string) =>
  z.object({
    title: z
      .string()
      .min(1, tv("nameRequired"))
      .max(200, tv("nameMax")),
    contactId: z.string().min(1, tv("contactRequired")),
    ownerId: z.string().min(1, tv("ownerRequired")),
    value: z.number().nonnegative(tv("valueNonNegative")),
    closeDate: z.string().optional(),
    note: z.string().optional(),
  });

type CreateDealFormValues = z.infer<ReturnType<typeof buildCreateDealSchema>>;

interface CreateDealSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStage?: Stage;
}

export function CreateDealSheet({
  open,
  onOpenChange,
  defaultStage,
}: CreateDealSheetProps) {
  const t = useTranslations("pipeline.form");
  const tv = useTranslations("pipeline.form.validation");
  const tCommon = useTranslations("common");
  const tContact = useTranslations("contacts.form");
  const createDealFormSchema = useMemo(() => buildCreateDealSchema(tv), [tv]);
  const createDeal = useCreateDeal();
  const [contactSearch, setContactSearch] = useState("");
  const [debouncedContactSearch] = useDebounceValue(contactSearch, 300);
  const contactsQuery = useGetContacts({
    limit: 100,
    search: debouncedContactSearch,
  });
  const usersQuery = useGetUsers();
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [isContactRequisitesOpen, setIsContactRequisitesOpen] = useState(false);
  const [createdContacts, setCreatedContacts] = useState<Contact[]>([]);

  const fetchedContacts = useMemo(
    () => contactsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [contactsQuery.data],
  );
  const contacts = useMemo(() => {
    const contactMap = new Map<string, Contact>();

    for (const contact of fetchedContacts) {
      contactMap.set(contact.id, contact);
    }

    for (const contact of createdContacts) {
      contactMap.set(contact.id, contact);
    }

    return Array.from(contactMap.values());
  }, [createdContacts, fetchedContacts]);
  const users = usersQuery.data ?? [];

  const form = useForm<CreateDealFormValues>({
    resolver: zodResolver(createDealFormSchema),
    defaultValues: {
      title: "",
      contactId: "",
      ownerId: "",
      value: 0,
      closeDate: "",
      note: "",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        title: "",
        contactId: "",
        ownerId: "",
        value: 0,
        closeDate: "",
        note: "",
      });
    }
  }, [form, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCreatedContacts([]);
      setContactDialogOpen(false);
    }

    onOpenChange(nextOpen);
  };

  const handleContactCreated = (contact: Contact) => {
    setCreatedContacts((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== contact.id);
      return [contact, ...withoutDuplicate];
    });
    form.setValue("contactId", contact.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onSubmit = async (values: CreateDealFormValues) => {
    await createDeal.mutateAsync({
      title: values.title,
      contactId: values.contactId,
      ownerId: values.ownerId,
      value: values.value,
      closeDate: values.closeDate ? new Date(values.closeDate) : new Date(),
      note: values.note?.trim() ? values.note.trim() : undefined,
      stage: defaultStage,
    });

    handleOpenChange(false);
  };

  const isPending = createDeal.isPending;
  const contactsLoading = contactsQuery.isLoading;
  const usersLoading = usersQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[480px] overflow-y-auto p-5 bg-white dark:bg-card border dark:border-border">
        <DialogHeader className="pb-4 border-b dark:border-border mb-4">
          <DialogTitle className="text-foreground" style={{ fontSize: 15, fontWeight: 600 }}>
            {t("createTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={{ fontSize: 12 }}>
                    {t("nameLabel")} <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("namePlaceholder")}
                      {...field}
                      style={{ fontSize: 13 }}
                      className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground"
                    />
                  </FormControl>
                  <FormMessage style={{ fontSize: 11 }} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactId"
              render={({ field }) => {
                const selectedContact = contacts.find(
                  (contact) => contact.id === field.value,
                );
                return (
                  <FormItem>
                    <FormLabel style={{ fontSize: 12 }}>
                      {t("contactLabel")} <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover
                      open={contactPopoverOpen}
                      onOpenChange={(nextOpen) => {
                        setContactPopoverOpen(nextOpen);
                        if (!nextOpen) {
                          setContactSearch("");
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={contactsLoading || isPending}
                            style={{ fontSize: 13 }}
                            className="w-full h-8 justify-between font-normal bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground hover:bg-gray-100 dark:hover:bg-muted"
                          >
                            <span
                              className={cn(
                                "truncate text-left",
                                !selectedContact && "text-muted-foreground",
                              )}
                            >
                              {selectedContact
                                ? `${selectedContact.name}${
                                    selectedContact.company
                                      ? ` - ${selectedContact.company}`
                                      : ""
                                  }`
                                : contactsLoading
                                  ? tCommon("loading")
                                  : t("selectContact")}
                            </span>
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent
                        matchTriggerWidth
                        className="p-2 bg-background border-border"
                        align="start"
                      >
                        <Input
                          autoFocus
                          value={contactSearch}
                          onChange={(event) => setContactSearch(event.target.value)}
                          placeholder={t("selectContact")}
                          style={{ fontSize: 13 }}
                          className="mb-2 bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground"
                        />
                        <div
                          className="max-h-[250px] overflow-y-auto"
                          onWheel={(event) => event.stopPropagation()}
                          onTouchMove={(event) => event.stopPropagation()}
                        >
                          {contacts.length === 0 ? (
                            <p
                              className="text-muted-foreground px-2 py-1.5"
                              style={{ fontSize: 13 }}
                            >
                              {t("contactsNotFound")}
                            </p>
                          ) : (
                            contacts.map((contact) => (
                              <button
                                key={contact.id}
                                type="button"
                                onClick={() => {
                                  field.onChange(contact.id);
                                  setContactPopoverOpen(false);
                                }}
                                style={{ fontSize: 13 }}
                                className="w-full text-left rounded-sm px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-muted text-foreground"
                              >
                                {contact.name}
                                {contact.company ? ` - ${contact.company}` : ""}
                              </button>
                            ))
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {(selectedContact?.address || selectedContact?.city) && (
                      <p
                        className="text-muted-foreground mt-1"
                        style={{ fontSize: 12 }}
                      >
                        {selectedContact?.address && `${t("contactAddress")} `}
                        {[selectedContact?.address, selectedContact?.city]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {selectedContact &&
                      (selectedContact.bin ||
                        selectedContact.legalAddress ||
                        selectedContact.bankAccount ||
                        selectedContact.bik) && (
                        <div className="mt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setIsContactRequisitesOpen((isOpen) => !isOpen)
                            }
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            style={{ fontSize: 12 }}
                          >
                            {tContact("requisitesHeading")}
                            {isContactRequisitesOpen ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                          {isContactRequisitesOpen && (
                            <div
                              className="mt-1 space-y-0.5 text-muted-foreground"
                              style={{ fontSize: 12 }}
                            >
                              {selectedContact.bin && (
                                <p>
                                  {tContact("binLabel")}: {selectedContact.bin}
                                </p>
                              )}
                              {selectedContact.legalAddress && (
                                <p>
                                  {tContact("legalAddressLabel")}: {selectedContact.legalAddress}
                                </p>
                              )}
                              {selectedContact.bankAccount && (
                                <p>
                                  {tContact("bankAccountLabel")}: {selectedContact.bankAccount}
                                </p>
                              )}
                              {selectedContact.bik && (
                                <p>
                                  {tContact("bikLabel")}: {selectedContact.bik}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs text-primary bg-[#F8F8F7] dark:bg-muted hover:bg-gray-100 dark:hover:bg-muted/80 border border-[#E8E7E2] dark:border-border mt-1.5"
                      disabled={isPending}
                      onClick={() => setContactDialogOpen(true)}
                    >
                      {t("createContact")}
                    </Button>
                    <FormMessage style={{ fontSize: 11 }} />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="ownerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={{ fontSize: 12 }}>
                    {t("ownerLabel")} <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={usersLoading || isPending}
                  >
                    <FormControl>
                      <SelectTrigger size="sm" style={{ fontSize: 13 }} className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground">
                        <SelectValue
                          placeholder={
                            usersLoading ? tCommon("loading") : t("selectOwner")
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background border-border">
                      {users.map((user) => (
                        <SelectItem
                          key={user.id}
                          value={user.id}
                          style={{ fontSize: 13 }}
                        >
                          {user.name} - {user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage style={{ fontSize: 11 }} />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
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
                        onChange={(event) =>
                          field.onChange(event.target.valueAsNumber)
                        }
                        style={{ fontSize: 13 }}
                        className="bg-[#F8F8F7] dark:bg-card border-[#E8E7E2] dark:border-border text-foreground"
                      />
                    </FormControl>
                    <FormMessage style={{ fontSize: 11 }} />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="closeDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel style={{ fontSize: 12, lineHeight: 1 }}>
                      {t("closeDateLabel")}
                    </FormLabel>
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
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1 text-xs"
                disabled={isPending}
              >
                {isPending ? t("creating") : t("createCta")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      <ContactDialog
        isOpen={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        onCreated={handleContactCreated}
      />
    </Dialog>
  );
}
  