"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";

/**
 * Offline indicator. When the network drops, the guard can keep logging entries;
 * writes land in the IndexedDB queue and flush on reconnect (background sync).
 * Queue depth is surfaced here. The queue itself is wired in lib/offline-queue.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [queued] = useState(0); // TODO: read live depth from the IndexedDB queue

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

  if (online) return null;

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500/90 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
      <CloudOff className="h-4 w-4" />
      Offline — {queued} {queued === 1 ? "entry" : "entries"} queued
      <RefreshCw className="h-3.5 w-3.5 opacity-80" />
    </div>
  );
}
