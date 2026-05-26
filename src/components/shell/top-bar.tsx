"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { LiveClock } from "./live-clock";

/** Glass top bar: brand, live clock, connection status, on-duty guard. */
export function TopBar({ guardName }: { guardName: string }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <header className="glass-bar sticky top-0 z-30 border-b">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Logo size={26} />
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 rounded-full bg-white/55 px-2.5 py-1 text-xs font-semibold text-ink-soft"
            title={online ? "Online" : "Offline — entries are queued locally"}
          >
            {online ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-amber-600" />
            )}
            <LiveClock className="tabular-nums" />
          </span>
          <div className="flex items-center gap-2">
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-semibold text-ink">{guardName}</span>
              <span className="block text-ink-faint">Parking Guard · on duty</span>
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
              {guardName.slice(0, 1)}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
