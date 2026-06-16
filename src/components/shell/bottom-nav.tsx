"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, List, DoorOpen, ShieldCheck, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParkingUserRole } from "@/db/entities";

type NavConfig = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  exact?: boolean;
};

const items: NavConfig[] = [
  { href: "/parking", label: "Live", icon: LayoutGrid, exact: true },
  { href: "/parking/visits", label: "Log", icon: List },
  { href: "/parking/exit", label: "Exit", icon: DoorOpen },
];

const adminItem: NavConfig = { href: "/parking/admin", label: "Admin", icon: ShieldCheck };

export function BottomNav({ guardRole }: { guardRole?: ParkingUserRole }) {
  const pathname = usePathname();
  const visibleItems = guardRole === "admin" ? [...items, adminItem] : items;
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
  const entryActive = pathname.startsWith("/parking/entry");

  return (
    <nav className="glass-bar pb-safe fixed inset-x-0 bottom-0 z-30 border-t shadow-[0_-8px_24px_-12px_rgba(20,22,60,0.18)]">
      <div
        className={cn(
          "mx-auto grid max-w-2xl items-center px-3 pt-2",
          guardRole === "admin" ? "grid-cols-5" : "grid-cols-4",
        )}
      >
        {visibleItems.slice(0, 2).map((it) => (
          <NavItem key={it.href} {...it} active={isActive(it.href, it.exact)} />
        ))}

        {/* Center elevated primary action — Gate Entry */}
        <div className="flex justify-center">
          <Link
            href="/parking/entry"
            aria-label="Gate entry"
            className="relative -mt-8 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-white shadow-glass-red ring-4 ring-canvas/80 transition-transform active:scale-95"
          >
            {entryActive && (
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand/50" />
            )}
            <Plus className="relative h-7 w-7" strokeWidth={2.5} />
            <span className="relative text-[10px] font-bold">Entry</span>
          </Link>
        </div>

        {visibleItems.slice(2).map((it) => (
          <NavItem key={it.href} {...it} active={isActive(it.href, it.exact)} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-semibold transition-colors",
        active ? "text-brand" : "text-ink-faint hover:text-ink-soft",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-12 items-center justify-center rounded-full transition-all",
          active ? "bg-brand/10" : "bg-transparent",
        )}
      >
        <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
      </span>
      {label}
    </Link>
  );
}
