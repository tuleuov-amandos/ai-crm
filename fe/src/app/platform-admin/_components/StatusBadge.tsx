type TenantStatus = "ACTIVE" | "PENDING" | "SUSPENDED";

const STATUS_STYLES: Record<TenantStatus, { bg: string; text: string; label: string }> = {
  ACTIVE: { bg: "#F0F9E6", text: "#3B6D11", label: "Активна" },
  PENDING: { bg: "#FEF3E2", text: "#854F0B", label: "На рассмотрении" },
  SUSPENDED: { bg: "#FDF0F0", text: "#A32D2D", label: "Приостановлена" },
};

export function StatusBadge({ status }: { status: TenantStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full whitespace-nowrap font-medium"
      style={{ fontSize: 12, background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}
