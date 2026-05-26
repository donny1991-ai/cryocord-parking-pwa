import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Pretty, locale-stable time for the guard UI (e.g. "14:32"). */
export function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "26 May, 14:32" */
export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human duration since a timestamp, e.g. "3h 12m". */
export function durationSince(from: Date | string, to?: Date): string {
  const start = typeof from === "string" ? new Date(from) : from;
  const end = to ?? new Date();
  const mins = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Normalise a plate the way the DB does: uppercase, strip spaces/dashes. */
export function normalisePlate(plate: string): string {
  return plate.toUpperCase().replace(/[\s-]/g, "");
}
