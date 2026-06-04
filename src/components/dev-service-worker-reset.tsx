"use client";

import { useEffect } from "react";

const RESET_FLAG = "cryocord-parking-dev-sw-reset-v1";

export function DevServiceWorkerReset() {
  useEffect(() => {
    let cancelled = false;

    async function resetDevServiceWorkers() {
      if (process.env.NODE_ENV !== "development" || !("serviceWorker" in navigator)) {
        return;
      }

      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheNames = "caches" in window ? await window.caches.keys() : [];
      const hadController = Boolean(navigator.serviceWorker.controller);

      await Promise.all(registrations.map((registration) => registration.unregister()));
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));

      if (cancelled) return;

      const clearedStaleDevState = registrations.length > 0 || cacheNames.length > 0 || hadController;
      if (clearedStaleDevState && window.sessionStorage.getItem(RESET_FLAG) !== "done") {
        window.sessionStorage.setItem(RESET_FLAG, "done");
        window.location.reload();
      }
    }

    resetDevServiceWorkers().catch(() => {
      // Dev-only cleanup should never interrupt the app.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
