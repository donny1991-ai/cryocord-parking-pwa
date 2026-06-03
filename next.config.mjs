import withPWAInit from "@ducanh2912/next-pwa";

const disablePWA =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_DISABLE_PWA === "true";

const withPWA = withPWAInit({
  dest: "public",
  // Disable the service worker in dev/local Docker so local rebuilds are not
  // intercepted by cached navigation or static assets.
  disable: disablePWA,
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
  output: "standalone",
  ...(process.env.NODE_ENV === "development"
    ? { allowedDevOrigins: ["*.trycloudflare.com"] }
    : {}),
  serverExternalPackages: ["typeorm", "pg"],
  images: {
    // Azure Blob (MY West) is the only allowed image origin in production.
    remotePatterns: [
      { protocol: "https", hostname: "*.blob.core.windows.net" },
    ],
  },
};

export default withPWA(nextConfig);
