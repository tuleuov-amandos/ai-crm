export function formatDate(dateStr: string | Date, locale: string = "ru-RU"): string {
  const date = new Date(dateStr);
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getInitials(name: string): string {
  // Split name into parts by whitespace
  const parts = name.trim().split(/\s+/);
  // If only 1 word, take first 2 characters: "NGUYỄN" -> "NG"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  
  // Take first character of last 2 words: "NGUYỄN MINH THUẬN" -> "M" + "T" = "MT"
  const second = parts[parts.length - 2];
  const last   = parts[parts.length - 1];
  return (second[0] + last[0]).toUpperCase();
}

export function formatCurrency(value: number, locale = "ru-KZ", currency = "KZT"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

export const AVATAR_COLORS = [
  { bg: '#D4F5E4', color: '#1A5C38' }, // Greenish
  { bg: '#D4E8F5', color: '#1A4C6A' }, // Bluish
  { bg: '#F5D4D4', color: '#6A1A1A' }, // Reddish
  { bg: '#FFF0D4', color: '#6A400A' }, // Orangish
  { bg: '#EEE8FD', color: '#3D2D8A' }, // Purplish
];

export function getAvatarColors(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export const STAGE_COLORS = {
  PROSPECT: { funnel: '#C4C0F0', bg: '#EEEDFE', text: '#534AB7', label: 'Prospect' },
  QUALIFIED: { funnel: '#9B94E3', bg: '#E6F4D7', text: '#3B6D11', label: 'Qualified' },
  PROPOSAL: { funnel: '#7168CC', bg: '#FEF3E2', text: '#854F0B', label: 'Proposal' },
  CLOSED_WON: { funnel: '#534AB7', bg: '#DCFCE7', text: '#166534', label: 'Closed Won' },
  CLOSED_LOST: { funnel: '#E11D48', bg: '#FEE2E2', text: '#A32D2D', label: 'Closed Lost' },
} as const;

export const ACTIVITY_CONFIG = {
  CALL: { bg: '#E6F4D7', color: '#3B6D11', label: 'Call' },
  EMAIL: { bg: '#EEEDFE', color: '#534AB7', label: 'Email' },
  MEETING: { bg: '#FEF3E2', color: '#854F0B', label: 'Meeting' },
  NOTE: { bg: '#F1EFE8', color: '#6B6B67', label: 'Note' },
} as const;

export interface ShortValueUnits {
  billion: string;
  million: string;
  thousand: string;
}

/**
 * Compact number formatting with localizable unit words.
 * Prefer the `useShortValue` hook (src/lib/format.ts) in components — it wires
 * `units` from the `common.units` messages automatically.
 */
export function formatShortValue(
  value: number | null | undefined,
  units: ShortValueUnits,
): string {
  if (value == null) return "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${Number((value / 1e9).toFixed(1))} ${units.billion}`;
  if (abs >= 1e6) return `${Number((value / 1e6).toFixed(1))} ${units.million}`;
  if (abs >= 1e3) return `${Number((value / 1e3).toFixed(1))} ${units.thousand}`;
  return `${value}`;
}