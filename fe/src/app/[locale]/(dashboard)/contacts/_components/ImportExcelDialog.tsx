"use client";
import React, { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { useApiError } from "@/hooks/useApiError";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBulkImportContacts } from "@/hooks/useContacts";
import { contactsService } from "@/services/contacts.service";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload, AlertCircle, CheckCircle, Trash2, Loader2, ArrowLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";

interface ImportExcelDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  rowNum: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  tags: string[];
  ownerEmail: string | null;
  dealTitle: string | null;
  dealValue: number | null;
  dealStage: string | null;
  dealNote: string | null;
  isValid: boolean;
  errors: string[];
}

const SYSTEM_FIELD_KEYS = [
  "name",
  "email",
  "phone",
  "company",
  "position",
  "tags",
  "ownerEmail",
  "dealTitle",
  "dealValue",
  "dealStage",
  "dealNote",
] as const;

export default function ImportExcelDialog({ isOpen, onOpenChange }: ImportExcelDialogProps) {
  const t = useTranslations("contacts.import");
  const tCommon = useTranslations("common");
  const getApiError = useApiError();

  const systemFieldsList = SYSTEM_FIELD_KEYS.map((key) => ({
    key,
    label: t(`fields.${key}`),
    required: key === "name",
  }));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [aiMappings, setAiMappings] = useState<Record<string, string | null>>({});
  const [customMappings, setCustomMappings] = useState<Record<string, string>>({});
  const [isMappingPending, setIsMappingPending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [rawExcelRows, setRawExcelRows] = useState<any[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const { mutateAsync: bulkImport, isPending } = useBulkImportContacts();

  // 1. Automatically generate sample Excel file and download client-side
  const handleDownloadTemplate = () => {
    const H = {
      name: t("template.headerName"),
      email: t("template.headerEmail"),
      phone: t("template.headerPhone"),
      company: t("template.headerCompany"),
      position: t("template.headerPosition"),
      tags: t("template.headerTags"),
      ownerEmail: t("template.headerOwnerEmail"),
      dealTitle: t("template.headerDealTitle"),
      dealValue: t("template.headerDealValue"),
      dealStage: t("template.headerDealStage"),
      dealNote: t("template.headerDealNote"),
    };

    const templateData = [
      {
        [H.name]: t("template.row1Name"),
        [H.email]: "example@example.com",
        [H.phone]: "0987654321",
        [H.company]: t("template.row1Company"),
        [H.position]: t("template.row1Position"),
        [H.tags]: "Vip, Tiềm năng",
        [H.ownerEmail]: "sales_member@example.com",
        [H.dealTitle]: t("template.row1DealTitle"),
        [H.dealValue]: 15000000,
        [H.dealStage]: t("template.row1DealStage"),
        [H.dealNote]: t("template.row1DealNote"),
      },
      {
        [H.name]: t("template.row2Name"),
        [H.email]: "example2@example.com",
        [H.phone]: "0912345678",
        [H.company]: "",
        [H.position]: "",
        [H.tags]: "Enterprise",
        [H.ownerEmail]: "",
        [H.dealTitle]: "",
        [H.dealValue]: 0,
        [H.dealStage]: "",
        [H.dealNote]: "",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, t("template.sheetName"));
    XLSX.writeFile(workbook, t("template.fileName"));
    toast.success(t("toasts.templateDownloaded"));
  };

  // Automatch columns using local synonyms algorithm first
  const autoMatchSynonyms = (headers: string[]) => {
    const mapped: Record<string, string | null> = {};
    const systemFields = [
      { key: "name", synonyms: ["Họ và tên", "Tên liên hệ", "Name", "Tên", "Họ tên", "Имя и фамилия", "Имя", "ФИО", "Контакт"] },
      { key: "email", synonyms: ["Email", "Địa chỉ email", "Hòm thư", "Эл. почта", "Почта"] },
      { key: "phone", synonyms: ["Số điện thoại", "Điện thoại", "Phone", "SĐT", "Телефон", "Номер телефона", "Тел"] },
      { key: "company", synonyms: ["Công ty", "Company", "Doanh nghiệp", "Компания", "Организация"] },
      { key: "position", synonyms: ["Chức vụ", "Position", "Vai trò", "Должность"] },
      { key: "tags", synonyms: ["Tags", "Nhãn", "Tag", "Теги", "Метки"] },
      { key: "ownerEmail", synonyms: ["Email người sở hữu", "Owner Email", "Chủ sở hữu", "Email ответственного", "Ответственный"] },
      { key: "dealTitle", synonyms: ["Tên Deal đi kèm", "Tên Deal", "Deal Title", "Cơ hội", "Название связанной сделки", "Название сделки", "Сделка"] },
      { key: "dealValue", synonyms: ["Giá trị Deal (VND)", "Giá trị Deal", "Giá trị", "Value", "Giá trị cơ hội", "Сумма сделки (VND)", "Сумма сделки", "Сумма", "Стоимость"] },
      { key: "dealStage", synonyms: ["Trạng thái Deal", "Trạng thái", "Stage", "Trạng thái cơ hội", "Этап сделки", "Этап", "Статус сделки"] },
      { key: "dealNote", synonyms: ["Ghi chú Deal", "Ghi chú", "Note", "Заметка по сделке", "Заметка", "Комментарий"] }
    ];

    let allMatched = true;
    for (const field of systemFields) {
      const match = headers.find(h =>
        field.synonyms.some(syn => h.toLowerCase().trim() === syn.toLowerCase() || h.toLowerCase().trim().includes(syn.toLowerCase()))
      );
      if (match) {
        mapped[field.key] = match;
      } else {
        mapped[field.key] = null;
        if (field.key === "name") allMatched = false;
      }
    }

    const matchedHeadersCount = Object.values(mapped).filter(Boolean).length;
    if (matchedHeadersCount < headers.length * 0.7) {
      allMatched = false;
    }

    return { mapped, allMatched };
  };

  // Receive Excel file and parse column structure
  const handleUploadFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (rawJson.length === 0) {
          toast.error(t("toasts.emptyFile"));
          return;
        }

        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
        const firstRow = rawRows[0] as string[];
        const headers = firstRow ? firstRow.filter(Boolean).map(String) : [];

        if (headers.length === 0) {
          toast.error(t("toasts.noHeaders"));
          return;
        }

        setRawHeaders(headers);
        setRawExcelRows(rawJson);

        // Run fast matching
        const { mapped, allMatched } = autoMatchSynonyms(headers);

        if (allMatched) {
          // Perfect match, move straight to Preview screen
          const cleanMappings: Record<string, string> = {};
          Object.entries(mapped).forEach(([key, val]) => {
            if (val) cleanMappings[key] = val;
          });
          setCustomMappings(cleanMappings);
          parseExcelRows(rawJson, cleanMappings);
          setStep("preview");
        } else {
          // Not 100% match with default columns -> Call AI to analyze and display Mapping UI
          setIsMappingPending(true);
          try {
            const aiRes = await contactsService.aiMapColumns(headers);
            setAiMappings(aiRes.mappings);

            const initialCustomMappings: Record<string, string> = {};
            Object.entries(aiRes.mappings).forEach(([key, val]) => {
              if (val) initialCustomMappings[key] = val;
            });

            // Merge with what autoMatch found if AI missed it
            Object.entries(mapped).forEach(([key, val]) => {
              if (val && !initialCustomMappings[key]) {
                initialCustomMappings[key] = val;
              }
            });

            setCustomMappings(initialCustomMappings);
            setStep("mapping");
          } catch (err) {
            console.error("AI auto-mapping error:", err);
            // Fallback to manual mapping
            setAiMappings({});
            setStep("mapping");
          } finally {
            setIsMappingPending(false);
          }
        }
      } catch (err) {
        console.error("File read error:", err);
        toast.error(t("toasts.readError"));
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Function to parse row data based on selected column mapping
  const parseExcelRows = (rawJson: Record<string, unknown>[], mappings: Record<string, string>) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allowedTags = ["Enterprise", "Vip", "Tiềm năng"];

    const parsedRows: ParsedRow[] = rawJson.map((row, index) => {
      const rowNum = index + 2;

      const nameVal = mappings["name"] ? row[mappings["name"]] : undefined;
      const emailVal = mappings["email"] ? row[mappings["email"]] : undefined;
      const phoneVal = mappings["phone"] ? row[mappings["phone"]] : undefined;
      const companyVal = mappings["company"] ? row[mappings["company"]] : undefined;
      const positionVal = mappings["position"] ? row[mappings["position"]] : undefined;
      const tagsVal = mappings["tags"] ? row[mappings["tags"]] : undefined;
      const ownerEmailVal = mappings["ownerEmail"] ? row[mappings["ownerEmail"]] : undefined;
      const dealTitleVal = mappings["dealTitle"] ? row[mappings["dealTitle"]] : undefined;
      const dealValueRaw = mappings["dealValue"] ? row[mappings["dealValue"]] : undefined;
      const dealStageVal = mappings["dealStage"] ? row[mappings["dealStage"]] : undefined;
      const dealNoteVal = mappings["dealNote"] ? row[mappings["dealNote"]] : undefined;

      const errors: string[] = [];

      // Validate Name is required
      if (!nameVal || String(nameVal).trim() === "") {
        errors.push(t("rowErrors.nameRequired"));
      }

      // Validate Email format
      const emailStr = emailVal ? String(emailVal).trim() : "";
      if (emailStr && !emailRegex.test(emailStr)) {
        errors.push(t("rowErrors.emailFormat", { email: emailStr }));
      }

      // Validate Owner Email format
      const ownerEmailStr = ownerEmailVal ? String(ownerEmailVal).trim() : "";
      if (ownerEmailStr && !emailRegex.test(ownerEmailStr)) {
        errors.push(t("rowErrors.ownerEmailFormat", { email: ownerEmailStr }));
      }

      // Validate Deal Value
      let dealValue = null;
      if (dealValueRaw !== undefined && dealValueRaw !== "") {
        dealValue = Number(dealValueRaw);
        if (isNaN(dealValue) || dealValue < 0) {
          errors.push(t("rowErrors.dealValue"));
          dealValue = null;
        }
      }

      // Validate Tags
      const tags = tagsVal
        ? String(tagsVal).split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      tags.forEach(tag => {
        if (!allowedTags.includes(tag)) {
          errors.push(t("rowErrors.tagInvalid", { tag, allowed: allowedTags.join(", ") }));
        }
      });

      return {
        rowNum,
        name: nameVal ? String(nameVal).trim() : "",
        email: emailStr || null,
        phone: phoneVal ? String(phoneVal).trim() : null,
        company: companyVal ? String(companyVal).trim() : null,
        position: positionVal ? String(positionVal).trim() : null,
        tags,
        ownerEmail: ownerEmailStr || null,
        dealTitle: dealTitleVal ? String(dealTitleVal).trim() : null,
        dealValue,
        dealStage: dealStageVal ? String(dealStageVal).trim() : null,
        dealNote: dealNoteVal ? String(dealNoteVal).trim() : null,
        isValid: errors.length === 0,
        errors,
      };
    });

    setRows(parsedRows);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleUploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    if (fileExtension !== "xlsx" && fileExtension !== "xls" && fileExtension !== "csv") {
      toast.error(t("toasts.unsupportedFormat"));
      return;
    }

    handleUploadFile(file);
  };

  const handleReset = () => {
    setFileName(null);
    setRows([]);
    setRawHeaders([]);
    setRawExcelRows([]);
    setAiMappings({});
    setCustomMappings({});
    setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleApplyMapping = () => {
    if (!customMappings["name"]) {
      toast.error(t("toasts.nameFieldRequired"));
      return;
    }
    parseExcelRows(rawExcelRows, customMappings);
    setStep("preview");
  };

  const handleConfirmImport = async () => {
    const validRows = rows.filter(r => r.isValid);
    if (validRows.length === 0) {
      toast.error(t("toasts.noValidRows"));
      return;
    }

    try {
      const result = await bulkImport(validRows);
      toast.success(t("toasts.importSuccess", { count: result.count }));
      handleReset();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiError(error, t("toasts.importError")));
    }
  };

  const totalRows = rows.length;
  const validRowsCount = rows.filter(r => r.isValid).length;
  const invalidRowsCount = totalRows - validRowsCount;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleReset();
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <span>{t("title")}</span>
            {step === "mapping" && <span className="text-xs font-normal bg-primary/10 text-primary px-2.5 py-0.5 rounded-full border border-primary/20">{t("badgeMapping")}</span>}
            {step === "preview" && <span className="text-xs font-normal bg-green-50 text-green-700 px-2.5 py-0.5 rounded-full border border-green-200">{t("badgePreview")}</span>}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {/* ──────── STEP 1: UPLOAD FILE ──────── */}
        {step === "upload" && !isMappingPending && (
          <div className="flex flex-col gap-3 my-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("chooseOrDrag")}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="gap-1.5 text-xs h-8 cursor-pointer border-border text-muted-foreground hover:text-foreground"
              >
                <Download size={13} />
                {t("downloadTemplate")}
              </Button>
            </div>

            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all duration-200 ${
                isDragging
                  ? "border-primary bg-primary/5 scale-[0.99] shadow-inner"
                  : "border-border hover:border-primary/50 hover:bg-muted/40"
              }`}
            >
              <Upload size={32} className={`mb-3 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground/60"}`} />
              <p className="text-xs font-medium text-foreground mb-1">
                {t("dropzoneTitle")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {t.rich("dropzoneHint", {
                  browse: (chunks) => (
                    <span className="text-primary hover:underline font-semibold">{chunks}</span>
                  ),
                })}
              </p>
            </div>
          </div>
        )}

        {/* AI Loading State */}
        {isMappingPending && (
          <div className="flex flex-col items-center justify-center p-12 bg-muted/20 border border-dashed rounded-xl my-6 shrink-0">
            <Loader2 className="animate-spin text-primary mb-3" size={32} />
            <p className="text-xs font-semibold text-foreground">{t("aiProcessing")}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{t("aiProcessingHint")}</p>
          </div>
        )}

        {/* ──────── STEP 2: MAPPING SCREEN (MAPPING UI) ──────── */}
        {step === "mapping" && (
          <div className="flex-1 overflow-y-auto space-y-4 my-2">
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 flex items-start gap-3">
              <FileSpreadsheet size={20} className="text-primary mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-foreground">{t("mappingDoneTitle")}</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t("mappingDoneHint")}
                </p>
              </div>
            </div>

            <div className="border border-border/80 rounded-xl bg-background overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted text-muted-foreground font-semibold border-b border-border/75">
                  <tr>
                    <th className="p-3 w-1/3">{t("colCrmField")}</th>
                    <th className="p-3">{t("colExcelColumn")}</th>
                    <th className="p-3 text-center w-24">{t("colStatus")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {systemFieldsList.map((field) => {
                    const mappedValue = customMappings[field.key] || "";
                    const isMatchedByAi = aiMappings[field.key] !== null && aiMappings[field.key] !== undefined;

                    return (
                      <tr key={field.key} className="hover:bg-muted/15 transition-colors">
                        <td className="p-3 font-semibold text-foreground">
                          {field.label}
                        </td>
                        <td className="p-3">
                          <select
                            value={mappedValue}
                            onChange={(e) => setCustomMappings({ ...customMappings, [field.key]: e.target.value })}
                            className="w-full max-w-md h-9 px-3 rounded-lg border border-border bg-background text-xs focus:ring-1 focus:ring-primary focus:border-primary outline-none cursor-pointer"
                          >
                            <option value="">{t("skipColumn")}</option>
                            {rawHeaders.map((header) => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-center">
                          {mappedValue ? (
                            isMatchedByAi ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] bg-green-50 text-green-700 border border-green-200 font-semibold shadow-2xs">
                                {t("statusAiMatch")}
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] bg-sky-50 text-sky-700 border border-sky-200 font-semibold shadow-2xs">
                                {t("statusManual")}
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">{t("statusEmpty")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ──────── STEP 3: PREVIEW TABLE ──────── */}
        {step === "preview" && (
          <>
            {/* Current file tag */}
            <div className="flex items-center justify-between bg-muted/40 p-3 rounded-xl border border-border/80 text-xs mb-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={20} className="text-green-600 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground max-w-[260px] truncate">{fileName}</span>
                  <span className="text-[10px] text-muted-foreground">{t("mappedSuccess")}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer gap-1.5"
              >
                <Trash2 size={13} />
                {t("chooseAnotherFile")}
              </Button>
            </div>

            {/* Data quality summary */}
            {totalRows > 0 && (
              <div className="flex gap-4 p-3 bg-muted/50 rounded-lg border text-xs mb-3 shrink-0 font-medium">
                <div className="flex items-center gap-1.5 text-foreground">
                  <span>{t("summaryTotal")}</span>
                  <strong className="text-sm font-semibold">{t("summaryRows", { count: totalRows })}</strong>
                </div>
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle size={14} />
                  <span>{t("summaryValid")}</span>
                  <strong className="text-sm font-semibold">{validRowsCount}</strong>
                </div>
                {invalidRowsCount > 0 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle size={14} />
                    <span>{t("summaryInvalid")}</span>
                    <strong className="text-sm font-semibold">{invalidRowsCount}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Preview Table */}
            <div className="flex-1 min-h-[250px] overflow-auto border rounded-lg bg-background">
              {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                  <FileSpreadsheet size={44} className="stroke-[1.2] mb-3 text-muted-foreground/60" />
                  <p className="text-xs">{t("noPreviewData")}</p>
                </div>
              ) : (
                <table className="w-full text-[11px] text-left border-collapse min-w-[800px]">
                  <thead className="bg-muted sticky top-0 font-semibold border-b text-muted-foreground uppercase tracking-wider h-8">
                    <tr>
                      <th className="px-3 border-r w-12 text-center">{t("previewColRow")}</th>
                      <th className="px-3 border-r">{t("previewColName")}</th>
                      <th className="px-3 border-r">{t("previewColEmail")}</th>
                      <th className="px-3 border-r">{t("previewColPhone")}</th>
                      <th className="px-3 border-r">{t("previewColCompany")}</th>
                      <th className="px-3 border-r">{t("previewColDealTitle")}</th>
                      <th className="px-3 border-r text-right">{t("previewColDealValue")}</th>
                      <th className="px-3 border-r text-center">{t("previewColDealStage")}</th>
                      <th className="px-3 text-center">{t("previewColRowStatus")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? "hover:bg-muted/30" : "bg-destructive/10 hover:bg-destructive/15"}>
                        <td className="px-3 py-1.5 border-r text-center text-muted-foreground font-medium">{row.rowNum}</td>
                        <td className="px-3 py-1.5 border-r font-medium text-foreground">{row.name}</td>
                        <td className="px-3 py-1.5 border-r text-muted-foreground">{row.email || "-"}</td>
                        <td className="px-3 py-1.5 border-r text-muted-foreground">{row.phone || "-"}</td>
                        <td className="px-3 py-1.5 border-r text-muted-foreground">{row.company || "-"}</td>
                        <td className="px-3 py-1.5 border-r text-muted-foreground font-medium">{row.dealTitle || "-"}</td>
                        <td className="px-3 py-1.5 border-r text-right text-muted-foreground">
                          {row.dealValue !== null ? row.dealValue.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-1.5 border-r text-center">
                          {row.dealStage ? (
                            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] bg-sky-50 text-sky-700 border border-sky-200">
                              {row.dealStage}
                            </span>
                          ) : "-"}
                        </td>
                        <td className="px-3 py-1.5">
                          {row.isValid ? (
                            <span className="flex items-center justify-center text-green-600 gap-1 font-semibold text-[10px]">
                              <CheckCircle size={12} /> {t("rowValid")}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-0.5 text-destructive font-medium text-[10px]">
                              {row.errors.map((err, eIdx) => (
                                <span key={eIdx} className="flex items-center gap-1">
                                  <AlertCircle size={10} /> {err}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ──────── ACTION BUTTON CONTROLS ──────── */}
        <div className="shrink-0 flex items-center justify-between pt-4 border-t mt-4">
          <div>
            {step === "mapping" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="text-xs h-9 cursor-pointer gap-1.5 border-border"
              >
                <ArrowLeft size={13} />
                {t("backToUpload")}
              </Button>
            )}
            {step === "preview" && rawHeaders.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("mapping")}
                className="text-xs h-9 cursor-pointer gap-1.5 border-border"
              >
                <ArrowLeft size={13} />
                {t("editMapping")}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                handleReset();
                onOpenChange(false);
              }}
              className="text-xs h-9 cursor-pointer border border-transparent hover:bg-muted"
            >
              {tCommon("cancel")}
            </Button>

            {step === "mapping" && (
              <Button
                variant="default"
                size="sm"
                onClick={handleApplyMapping}
                className="text-xs h-9 cursor-pointer gap-1.5 bg-primary text-white"
              >
                {t("previewCta")}
                <ChevronRight size={13} />
              </Button>
            )}

            {step === "preview" && (
              <Button
                variant="default"
                size="sm"
                onClick={handleConfirmImport}
                disabled={isPending || validRowsCount === 0}
                className="text-xs h-9 cursor-pointer bg-primary text-white"
              >
                {isPending ? t("importing") : t("confirmImport", { count: validRowsCount })}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
