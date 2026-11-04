// Sign-in artwork: a classical courthouse under a globe, with a flight path
// between the firm's two offices (Frisco, TX and New York, NY). Drawn as SVG so
// it stays sharp at any size and needs no image licence. Decorative only.

const COLUMNS = Array.from({ length: 6 }, (_, i) => 246 + i * 58);

// A plane pointing right (along the path); animateMotion turns it with the curve.
const PLANE = "M-16 0 L16 0 M2 0 L-8 -12 M2 0 L-8 12 M-14 0 L-19 -6 M-14 0 L-19 6";

// Width of a meridian over half a turn: 250 * |cos|, so the globe seems to spin.
const MERIDIAN = Array.from({ length: 13 }, (_, i) => (250 * Math.abs(Math.cos((i * Math.PI) / 12))).toFixed(1)).join(";");

// [x, y, radius, delay in seconds]
const STARS: [number, number, number, number][] = [
  [92, 120, 1.6, 0],
  [700, 90, 1.4, 1.1],
  [735, 420, 1.8, 2.3],
  [60, 470, 1.3, 0.6],
  [655, 560, 1.2, 1.7],
  [140, 40, 1.2, 2.9],
];

export function LoginIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 900" className={className} role="presentation" aria-hidden fill="none">
      <defs>
        <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.96" />
          <stop offset="1" stopColor="#c5d3e6" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="column" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="0.55" stopColor="#e3eaf3" stopOpacity="0.95" />
          <stop offset="1" stopColor="#98b0cf" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.45" r="0.5">
          <stop offset="0" stopColor="#d6b25a" stopOpacity="0.32" />
          <stop offset="0.6" stopColor="#d6b25a" stopOpacity="0.1" />
          <stop offset="1" stopColor="#d6b25a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="globeFill" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#456794" stopOpacity="0.35" />
          <stop offset="1" stopColor="#18263d" stopOpacity="0" />
        </radialGradient>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#ffffff" fillOpacity="0.07" />
        </pattern>
      </defs>

      {/* Dotted texture */}
      <rect width="800" height="900" fill="url(#dots)" />

      {/* A few stars twinkling behind the globe */}
      <g fill="#ffffff">
        {STARS.map(([x, y, r, delay]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} className="twinkle" style={{ animationDelay: `${delay}s` }} />
        ))}
      </g>

      {/* Globe: the meridians sweep across, so it slowly turns */}
      <g stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.2">
        <circle cx="400" cy="300" r="250" fill="url(#globeFill)" />
        <ellipse cx="400" cy="300" rx="250" ry="90" />
        <ellipse cx="400" cy="300" rx="250" ry="175" />
        <line x1="150" y1="300" x2="650" y2="300" />
        <g className="motion-only">
          {[0, 6, 12, 18].map((offset) => (
            <ellipse key={offset} cx="400" cy="300" rx="250" ry="250">
              <animate attributeName="rx" values={MERIDIAN} dur="24s" begin={`-${offset}s`} repeatCount="indefinite" />
            </ellipse>
          ))}
        </g>
        <g className="motion-static">
          <ellipse cx="400" cy="300" rx="90" ry="250" />
          <ellipse cx="400" cy="300" rx="175" ry="250" />
          <line x1="400" y1="50" x2="400" y2="550" />
        </g>
      </g>

      {/* Flight path between the two offices: the dots flow towards New York */}
      <path id="flight-route" d="M190 360 Q 400 120 615 285" className="flight-path" stroke="#d6b25a" strokeWidth="2.5" strokeDasharray="2 10" strokeLinecap="round" />

      {/* The two offices, each sending out a soft ping */}
      <g fill="#d6b25a">
        {[
          [190, 360, "0s"],
          [615, 285, "1.2s"],
        ].map(([cx, cy, begin]) => (
          <g key={String(cx)}>
            <circle cx={cx} cy={cy} r="15" fillOpacity="0.25" />
            <circle cx={cx} cy={cy} r="7" />
            <circle cx={cx} cy={cy} r="7" fillOpacity="0" stroke="#d6b25a" strokeWidth="2" className="motion-only">
              <animate attributeName="r" values="7;34" dur="2.4s" begin={String(begin)} repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.8;0" dur="2.4s" begin={String(begin)} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </g>

      {/* The plane flies the route, Frisco to New York, then starts again */}
      <g className="motion-only" opacity="0">
        <path d={PLANE} stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <animateMotion dur="7s" repeatCount="indefinite" rotate="auto" keyPoints="0;1;1" keyTimes="0;0.8;1" calcMode="linear">
          <mpath href="#flight-route" />
        </animateMotion>
        <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.08;0.72;0.8;1" dur="7s" repeatCount="indefinite" />
      </g>
      <g className="motion-static" transform="translate(408 198) rotate(10)">
        <path d={PLANE} stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
      </g>

      <g fontFamily="var(--font-geist-sans), system-ui, sans-serif" fontSize="15" fontWeight="600" fill="#e3eaf3" letterSpacing="0.5">
        <text x="150" y="398">FRISCO, TX</text>
        <text x="562" y="323">NEW YORK, NY</text>
      </g>

      {/* Soft light behind the building, gently breathing */}
      <ellipse cx="400" cy="640" rx="380" ry="260" fill="url(#glow)" className="glow-breathe" />

      {/* City silhouettes */}
      <g fill="#ffffff" fillOpacity="0.07">
        <rect x="40" y="640" width="46" height="210" />
        <rect x="92" y="590" width="38" height="260" />
        <rect x="136" y="660" width="52" height="190" />
        <rect x="612" y="650" width="50" height="200" />
        <rect x="668" y="580" width="36" height="270" />
        <rect x="710" y="630" width="54" height="220" />
      </g>

      {/* Courthouse */}
      <g>
        {/* Pediment */}
        <path d="M200 520 L400 420 L600 520 Z" fill="url(#stone)" />
        <path d="M232 510 L400 436 L568 510 Z" stroke="#d6b25a" strokeOpacity="0.9" strokeWidth="2" />
        {/* Emblem: scales of justice */}
        <g stroke="#a37e2b" strokeWidth="2.4" strokeLinecap="round">
          <line x1="400" y1="456" x2="400" y2="494" />
          <line x1="380" y1="464" x2="420" y2="464" />
          <path d="M380 464 L372 480 M380 464 L388 480 M366 480 Q 380 490 394 480" />
          <path d="M420 464 L412 480 M420 464 L428 480 M406 480 Q 420 490 434 480" />
          <line x1="392" y1="494" x2="408" y2="494" />
        </g>

        {/* Entablature */}
        <rect x="208" y="520" width="384" height="16" fill="url(#stone)" />
        <rect x="216" y="536" width="368" height="22" fill="#e3eaf3" fillOpacity="0.92" />
        <line x1="216" y1="547" x2="584" y2="547" stroke="#98b0cf" strokeOpacity="0.8" />

        {/* Columns */}
        {COLUMNS.map((x) => (
          <g key={x}>
            <rect x={x - 6} y="558" width="40" height="10" rx="1" fill="#ffffff" fillOpacity="0.95" />
            <rect x={x} y="568" width="28" height="194" fill="url(#column)" />
            <line x1={x + 9} y1="574" x2={x + 9} y2="756" stroke="#98b0cf" strokeOpacity="0.6" />
            <line x1={x + 19} y1="574" x2={x + 19} y2="756" stroke="#98b0cf" strokeOpacity="0.6" />
            <rect x={x - 6} y="762" width="40" height="10" rx="1" fill="#ffffff" fillOpacity="0.95" />
          </g>
        ))}

        {/* Door, between the middle columns */}
        <rect x="378" y="676" width="44" height="86" rx="2" fill="#18263d" fillOpacity="0.55" />
        <rect x="378" y="676" width="44" height="86" rx="2" stroke="#d6b25a" strokeOpacity="0.7" />

        {/* Base and steps */}
        <rect x="200" y="772" width="400" height="14" fill="url(#stone)" />
        <rect x="184" y="786" width="432" height="14" fill="#e3eaf3" fillOpacity="0.9" />
        <rect x="168" y="800" width="464" height="14" fill="#c5d3e6" fillOpacity="0.85" />
        <rect x="152" y="814" width="496" height="14" fill="#98b0cf" fillOpacity="0.75" />
      </g>

      {/* Ground line */}
      <line x1="60" y1="850" x2="740" y2="850" stroke="#d6b25a" strokeOpacity="0.5" strokeWidth="1.5" />
    </svg>
  );
}
