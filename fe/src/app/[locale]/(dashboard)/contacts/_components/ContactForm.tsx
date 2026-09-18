import { Controller, useForm } from "react-hook-form";
import {
  Contact,
  CreateContactBodyType,
  ContactTagConst,
  ContactTagType,
  ContactChannelConst,
} from "@/lib/validations/contacts.scheme";
import { KZ_CITIES } from "@/lib/kz-cities";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronUp, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const buildContactFormSchema = (tv: (key: string) => string) =>
  z
    .object({
      name: z
        .string()
        .min(2, tv("nameMin"))
        .max(100, tv("nameMax")),
      email: z
        .string()
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, tv("emailInvalid"))
        .optional()
        .or(z.literal(""))
        .nullable(),
      phone: z
        .string()
        .min(1, tv("phoneRequired"))
        .regex(/^\+?[0-9\s\-()]{7,20}$/, tv("phoneInvalid")),
      company: z.string().optional().nullable(),
      position: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      bin: z.string().optional().nullable(),
      legalAddress: z.string().optional().nullable(),
      bankAccount: z.string().optional().nullable(),
      bik: z.string().optional().nullable(),
      channel: z
        .enum(Object.values(ContactChannelConst) as [string, ...string[]])
        .optional()
        .nullable(),
      tags: z
        .array(
          z.enum([
            ContactTagConst.Enterprise,
            ContactTagConst.Vip,
            ContactTagConst.Potential,
          ]),
        )
        .optional(),
    })
    .strict();

type ContactFormValues = z.infer<ReturnType<typeof buildContactFormSchema>>;

interface ContactFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateContactBodyType) => void;
  isPending?: boolean;
  defaultValues?: Partial<Contact>;
}

const CONTACT_TAG_COLOR: Record<ContactTagType, string> = {
  [ContactTagConst.Enterprise]: "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  [ContactTagConst.Vip]: "bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  [ContactTagConst.Potential]: "bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
};

function ContactForm({ onSubmit, isPending, defaultValues }: ContactFormProps) {
  const t = useTranslations("contacts.form");
  const tCommon = useTranslations("common");
  const tv = useTranslations("contacts.form.validation");
  const tChannels = useTranslations("contacts.channels");
  const contactFormSchema = useMemo(() => buildContactFormSchema(tv), [tv]);
  const CHANNEL_LABELS: Record<string, string> = {
    [ContactChannelConst.CategoryA]: tChannels("CATEGORY_A"),
    [ContactChannelConst.CategoryB]: tChannels("CATEGORY_B"),
    [ContactChannelConst.CategoryC]: tChannels("CATEGORY_C"),
    [ContactChannelConst.HoReCa]: tChannels("HORECA"),
    [ContactChannelConst.Office]: tChannels("OFFICE"),
    [ContactChannelConst.Pharmacy]: tChannels("PHARMACY"),
    [ContactChannelConst.Wholesale]: tChannels("WHOLESALE"),
    [ContactChannelConst.Retail]: tChannels("RETAIL"),
  };
  const [isRequisitesOpen, setIsRequisitesOpen] = useState(() =>
    Boolean(
      defaultValues?.bin ||
        defaultValues?.legalAddress ||
        defaultValues?.bankAccount ||
        defaultValues?.bik,
    ),
  );
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      company: defaultValues?.company ?? "",
      position: defaultValues?.position ?? "",
      address: defaultValues?.address ?? "",
      city: defaultValues?.city ?? "",
      bin: defaultValues?.bin ?? "",
      legalAddress: defaultValues?.legalAddress ?? "",
      bankAccount: defaultValues?.bankAccount ?? "",
      bik: defaultValues?.bik ?? "",
      channel: defaultValues?.channel ?? null,
      tags: defaultValues?.tags ?? [],
    },
  });

  useEffect(() => {
    form.reset({
      name: defaultValues?.name ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      company: defaultValues?.company ?? "",
      position: defaultValues?.position ?? "",
      address: defaultValues?.address ?? "",
      city: defaultValues?.city ?? "",
      bin: defaultValues?.bin ?? "",
      legalAddress: defaultValues?.legalAddress ?? "",
      bankAccount: defaultValues?.bankAccount ?? "",
      bik: defaultValues?.bik ?? "",
      channel: defaultValues?.channel ?? null,
      tags: defaultValues?.tags ?? [],
    });
  }, [defaultValues]);

  return (
    <form id="form-rhf-contact" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <FieldGroup className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name - Full width */}
        <div className="md:col-span-2">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="form-rhf-contact-name">
                  {t("nameLabel")} <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  id="form-rhf-contact-name"
                  aria-invalid={fieldState.invalid}
                  placeholder={t("namePlaceholder")}
                  autoComplete="off"
                  className="w-full"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        {/* Email */}
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="form-rhf-contact-email">{t("emailLabel")}</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id="form-rhf-contact-email"
                aria-invalid={fieldState.invalid}
                placeholder={t("emailPlaceholder")}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Phone */}
        <Controller
          name="phone"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="form-rhf-contact-phone">
                {t("phoneLabel")} <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id="form-rhf-contact-phone"
                aria-invalid={fieldState.invalid}
                placeholder={t("phonePlaceholder")}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Company */}
        <Controller
          name="company"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="form-rhf-contact-company">
                {t("companyLabel")}
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id="form-rhf-contact-company"
                aria-invalid={fieldState.invalid}
                placeholder={t("companyPlaceholder")}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Position */}
        <Controller
          name="position"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="form-rhf-contact-position">
                {t("positionLabel")}
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id="form-rhf-contact-position"
                aria-invalid={fieldState.invalid}
                placeholder={t("positionPlaceholder")}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Address */}
        <Controller
          name="address"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="form-rhf-contact-address">
                {t("addressLabel")}
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id="form-rhf-contact-address"
                aria-invalid={fieldState.invalid}
                placeholder={t("addressPlaceholder")}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* City (combobox: pick from KZ cities or type a custom value) */}
        <Controller
          name="city"
          control={form.control}
          render={({ field, fieldState }) => {
            const filteredCities = KZ_CITIES.filter((city) =>
              city.toLowerCase().includes(citySearch.trim().toLowerCase()),
            );
            const trimmedSearch = citySearch.trim();
            const hasExactMatch = KZ_CITIES.some(
              (city) => city.toLowerCase() === trimmedSearch.toLowerCase(),
            );

            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="form-rhf-contact-city">{t("cityLabel")}</FieldLabel>
                <Popover
                  open={cityPopoverOpen}
                  onOpenChange={(nextOpen) => {
                    setCityPopoverOpen(nextOpen);
                    if (!nextOpen) setCitySearch("");
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      id="form-rhf-contact-city"
                      aria-invalid={fieldState.invalid}
                      className="w-full h-9 justify-between font-normal"
                    >
                      <span
                        className={cn(
                          "truncate text-left",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        {field.value || t("cityPlaceholder")}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-2"
                    align="start"
                  >
                    <Input
                      autoFocus
                      value={citySearch}
                      onChange={(event) => setCitySearch(event.target.value)}
                      placeholder={t("cityPlaceholder")}
                      className="mb-2"
                    />
                    <div className="max-h-[220px] overflow-y-auto">
                      {trimmedSearch && !hasExactMatch && (
                        <button
                          type="button"
                          onClick={() => {
                            field.onChange(trimmedSearch);
                            setCityPopoverOpen(false);
                            setCitySearch("");
                          }}
                          className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          {t("cityUseCustom", { value: trimmedSearch })}
                        </button>
                      )}
                      {filteredCities.map((city) => (
                        <button
                          key={city}
                          type="button"
                          onClick={() => {
                            field.onChange(city);
                            setCityPopoverOpen(false);
                            setCitySearch("");
                          }}
                          className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          {city}
                        </button>
                      ))}
                      {filteredCities.length === 0 && !trimmedSearch && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                          {t("cityNotFound")}
                        </p>
                      )}
                    </div>
                    {field.value && (
                      <button
                        type="button"
                        onClick={() => {
                          field.onChange("");
                          setCityPopoverOpen(false);
                          setCitySearch("");
                        }}
                        className="w-full text-left rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent mt-1 border-t border-border pt-2"
                      >
                        {t("cityClear")}
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            );
          }}
        />

        {/* Channel (single-select) */}
        <Controller
          name="channel"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="form-rhf-contact-channel">{t("channelLabel")}</FieldLabel>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger id="form-rhf-contact-channel" size="sm">
                  <SelectValue placeholder={t("channelPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Tags (Dropmenu Multi-select) - Full width */}
        <div className="md:col-span-2">
          <Controller
            name="tags"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="form-rhf-contact-tags">{t("tagsLabel")}</FieldLabel>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      id="form-rhf-contact-tags"
                      className="flex min-h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 text-left cursor-pointer"
                    >
                      {field.value && field.value.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {field.value.map((tag) => (
                            <span
                              key={tag}
                              className={`inline-block px-2 py-0.5 rounded-full ${CONTACT_TAG_COLOR[tag as ContactTagType]}`}
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Tag className="size-4 opacity-50" />
                          {t("tagsPlaceholder")}
                        </span>
                      )}
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="start">
                    {Object.values(ContactTagConst).map((tagOption) => {
                      const isChecked = field.value?.includes(tagOption) || false;
                      return (
                        <DropdownMenuCheckboxItem
                          key={tagOption}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const currentValues = field.value || [];
                            const nextValues = checked
                              ? [...currentValues, tagOption]
                              : currentValues.filter((v) => v !== tagOption);
                            field.onChange(nextValues);
                          }}
                        >
                          {tagOption}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>
      </FieldGroup>

      {/* Requisites (БИН/ИИН, юр. адрес, расчётный счёт, БИК) — collapsed by default */}
      <FieldSet className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setIsRequisitesOpen((open) => !open)}
          className="flex items-center justify-between w-full cursor-pointer"
        >
          <FieldLegend variant="label" className="mb-0">
            {t("requisitesHeading")}
          </FieldLegend>
          {isRequisitesOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {isRequisitesOpen && (
          <FieldGroup className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Controller
              name="bin"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-rhf-contact-bin">{t("binLabel")}</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="form-rhf-contact-bin"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("binPlaceholder")}
                    autoComplete="off"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="legalAddress"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-rhf-contact-legalAddress">
                    {t("legalAddressLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="form-rhf-contact-legalAddress"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("legalAddressPlaceholder")}
                    autoComplete="off"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="bankAccount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-rhf-contact-bankAccount">
                    {t("bankAccountLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="form-rhf-contact-bankAccount"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("bankAccountPlaceholder")}
                    autoComplete="off"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="bik"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-rhf-contact-bik">{t("bikLabel")}</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="form-rhf-contact-bik"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("bikPlaceholder")}
                    autoComplete="off"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        )}
      </FieldSet>

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => form.reset()}
          className="cursor-pointer"
        >
          {tCommon("reset")}
        </Button>
        <Button
          type="submit"
          form="form-rhf-contact"
          disabled={isPending}
          className="cursor-pointer"
        >
          {isPending ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

export default ContactForm;
