import { useId } from "react";

/**
 * The UOA Legal emblem: a gold courthouse (pediment and columns) on a navy
 * tile with a fine gold inner border. Drawn in SVG so it is sharp at any size.
 */
export function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const gold = `gold${id}`;
  const navy = `navy${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="UOA Legal" className={`shrink-0 drop-shadow-sm ${className}`}>
      <defs>
        <linearGradient id={navy} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b4263" />
          <stop offset="1" stopColor="#0f1828" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e2a6" />
          <stop offset="0.55" stopColor="#d6b25a" />
          <stop offset="1" stopColor="#a37e2b" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="9" fill={`url(#${navy})`} />
      <rect x="2.5" y="2.5" width="35" height="35" rx="7" fill="none" stroke={`url(#${gold})`} strokeOpacity="0.55" strokeWidth="0.8" />
      <g fill={`url(#${gold})`}>
        <path d="M20 8.5 31.5 15.5H8.5Z" />
        <rect x="9.5" y="16.6" width="21" height="1.9" rx="0.4" />
        <rect x="11.2" y="19.7" width="2.3" height="9.3" rx="0.5" />
        <rect x="16.1" y="19.7" width="2.3" height="9.3" rx="0.5" />
        <rect x="21.6" y="19.7" width="2.3" height="9.3" rx="0.5" />
        <rect x="26.5" y="19.7" width="2.3" height="9.3" rx="0.5" />
        <rect x="9.5" y="30.2" width="21" height="1.7" rx="0.4" />
        <rect x="8" y="32.8" width="24" height="1.5" rx="0.4" />
      </g>
      <circle cx="20" cy="13.4" r="1.1" fill="#18263d" />
    </svg>
  );
}
