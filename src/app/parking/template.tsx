"use client";

/**
 * App Router `template.tsx` remounts on every navigation within /parking, so
 * this entrance animation replays as the guard moves between screens — giving
 * the app a consistent, deliberate flow instead of abrupt swaps.
 */
export default function ParkingTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter">{children}</div>;
}
