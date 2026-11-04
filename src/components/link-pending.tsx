"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "./spinner";

/**
 * Put inside a <Link>: shows a small spinner while that link's page loads.
 * It fades in after a short delay, so fast pages don't flicker.
 */
export function LinkPending({ className = "h-3.5 w-3.5" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="animate-[fadein_0.2s_ease-in_0.15s_both]" role="status" aria-label="Loading">
      <Spinner className={className} />
    </span>
  );
}
