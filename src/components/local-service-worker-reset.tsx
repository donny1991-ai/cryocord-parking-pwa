"use client";

import { useEffect } from "react";

const RESET_FLAG = "cryocord-parking-local-sw-reset-v1";

export function LocalServiceWorkerReset() {
  useEffect(() => {
    let cancelled = false;

    async function resetLocalServiceWorkers() {
      const shouldReset =
        process.env.NEXT_PUBLIC_DISABLE_PWA === "true" &&
        typeof window !== "undefined" &&
        /^localhost$|^127\.0\.0\.1$/.test(window.location.hostname) &&
        "serviceWorker" in navigator;

      if (!shouldReset) {
        return;
      }

      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheNames = "caches" in window ? await window.caches.keys() : [];
      const hadController = Boolean(navigator.serviceWorker.controller);

      await Promise.all(registrations.map((registration) => registration.unregister()));
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));

      if (cancelled) return;

      const clearedStaleLocalState = registrations.length > 0 || cacheNames.length > 0 || hadController;
      if (clearedStaleLocalState && window.sessionStorage.getItem(RESET_FLAG) !== "done") {
        window.sessionStorage.setItem(RESET_FLAG, "done");
        window.location.reload();
      }
    }

    resetLocalServiceWorkers().catch(() => {
      // Local cleanup should never interrupt the app.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
