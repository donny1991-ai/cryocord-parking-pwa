import type { Purpose, Status, VisitType, OwnerType } from "./enums";

/** snake_case → "Title Case", with acronym/special overrides. */
const OVERRIDES: Record<string, string> = {
  vip: "VIP",
  vvip: "VVIP",
};

export function labelize(value: string): string {
  if (OVERRIDES[value]) return OVERRIDES[value];
  return value
    .split("_")
    .map((w) => (OVERRIDES[w] ? OVERRIDES[w] : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export const visitTypeLabel = (v: VisitType) => labelize(v);
export const purposeLabel = (p: Purpose) => labelize(p);
export const ownerTypeLabel = (o: OwnerType) => labelize(o);
export const statusLabel = (s: Status) => labelize(s);

/** Status → glass pill styling (translucent brand-aware tints). */
export const STATUS_STYLE: Record<Status, { dot: string; pill: string }> = {
  pending: {
    dot: "bg-sky-500",
    pill: "bg-sky-500/12 text-sky-700 border-sky-500/25",
  },
  inside: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-500/12 text-emerald-700 border-emerald-500/25",
  },
  exited: {
    dot: "bg-ink-faint",
    pill: "bg-ink-faint/10 text-ink-soft border-ink-faint/25",
  },
  overstayed: {
    dot: "bg-amber-500",
    pill: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  },
  flagged: {
    dot: "bg-brand",
    pill: "bg-brand/12 text-brand border-brand/30",
  },
};
