import type { Metadata, Viewport } from "next";
import { DevServiceWorkerReset } from "@/components/dev-service-worker-reset";
import { LocalServiceWorkerReset } from "@/components/local-service-worker-reset";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "CryoCord Parking",
  title: {
    default: "CryoCord Parking",
    template: "%s · CryoCord Parking",
  },
  description:
    "Car park access control for CryoCord HQ — plate capture, QR passes, and occupancy. ICS parking module.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CC Parking",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192.svg" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#C8102E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-ink">
        {process.env.NODE_ENV === "development" && <DevServiceWorkerReset />}
        {process.env.NEXT_PUBLIC_DISABLE_PWA === "true" && <LocalServiceWorkerReset />}
        {children}
      </body>
    </html>
  );
}
