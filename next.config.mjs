import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // Disable the service worker in dev so HMR isn't intercepted by the cache.
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    // App shell + static assets are precached by next-pwa automatically.
    // Runtime caching keeps the guard UI usable offline; writes go to the
    // IndexedDB queue (see src/lib/offline-queue) and flush on reconnect.
    disableDevLogs: true,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Azure Blob (MY West) is the only allowed image origin in production.
    remotePatterns: [
      { protocol: "https", hostname: "*.blob.core.windows.net" },
    ],
  },
};

export default withPWA(nextConfig);
