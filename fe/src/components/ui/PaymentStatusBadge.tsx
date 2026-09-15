"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface PaymentStatusBadgeProps {
  isPaid: boolean;
  /** When provided, the badge becomes clickable and toggles on click. */
  onToggle?: () => void;
  disabled?: boolean;
  className?: string;
}

export function PaymentStatusBadge({
  isPaid,
  onToggle,
  disabled,
  className,
}: PaymentStatusBadgeProps) {
  const t = useTranslations("pipeline.paymentStatus");
  const label = isPaid ? t("paid") : t("unpaid");

  const badgeClass = cn(
    "inline-flex items-center rounded-full px-2.5 py-0.5 whitespace-nowrap font-medium",
    isPaid
      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
      : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    className,
  );

  if (!onToggle) {
    return (
      <span className={badgeClass} style={{ fontSize: 12 }}>
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={t("toggleHint")}
      className={cn(
        badgeClass,
        "border-0 cursor-pointer transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50",
      )}
      style={{ fontSize: 12 }}
    >
      {label}
    </button>
  );
}
