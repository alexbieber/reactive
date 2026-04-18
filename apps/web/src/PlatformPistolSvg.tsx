/**
 * Simplified semi-auto pistol side profile (decorative). Not a specific real-world model.
 */
type Props = { className?: string; variant: "flutter" | "rn" };

export default function PlatformPistolSvg({ className = "", variant }: Props) {
  const pre = variant === "flutter" ? "plf-pf" : "plf-pr";
  return (
    <svg
      className={className}
      viewBox="0 0 128 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${pre}-metal`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a5e66" />
          <stop offset="35%" stopColor="#3a3e46" />
          <stop offset="70%" stopColor="#2a2d34" />
          <stop offset="100%" stopColor="#181a1f" />
        </linearGradient>
        <linearGradient id={`${pre}-slide`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4a4e56" />
          <stop offset="40%" stopColor="#353940" />
          <stop offset="100%" stopColor="#25282e" />
        </linearGradient>
        <linearGradient id={`${pre}-grip`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2c3038" />
          <stop offset="100%" stopColor="#14161a" />
        </linearGradient>
        <linearGradient id={`${pre}-barrel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4f58" />
          <stop offset="100%" stopColor="#282c32" />
        </linearGradient>
      </defs>
      {/* Barrel + muzzle */}
      <rect x="0" y="18.5" width="34" height="7" rx="1.2" fill={`url(#${pre}-barrel)`} />
      <rect x="30" y="17.5" width="6" height="9" rx="0.8" fill="#1f2228" opacity="0.85" />
      {/* Slide */}
      <path
        d="M26 14h52c2.2 0 4 1.8 4 4v8c0 2.2-1.8 4-4 4H34l-8-8V18l8-4z"
        fill={`url(#${pre}-slide)`}
        stroke="#1a1c22"
        strokeWidth="0.5"
      />
      <line x1="38" y1="17" x2="68" y2="17" stroke="#5a6068" strokeWidth="0.4" opacity="0.5" />
      {/* Frame */}
      <path
        d="M34 26h38v6c0 3-2.5 5.5-5.5 5.5H42l-10-6V26z"
        fill={`url(#${pre}-metal)`}
        stroke="#121418"
        strokeWidth="0.4"
      />
      {/* Trigger guard */}
      <path
        d="M52 28c0 4-3 7-7 7v-2c2.5 0 4.5-2 4.5-4.5"
        stroke="#25282e"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="48" cy="29" rx="2" ry="3.5" fill="#1a1d22" />
      {/* Grip */}
      <path
        d="M70 26l18 2 8 14c1 2-0.5 4-2.8 4H76l-8-16v-4z"
        fill={`url(#${pre}-grip)`}
        stroke="#0e1014"
        strokeWidth="0.5"
      />
      <line x1="78" y1="30" x2="88" y2="38" stroke="#2a2e36" strokeWidth="0.6" opacity="0.6" />
      <line x1="80" y1="28" x2="90" y2="36" stroke="#2a2e36" strokeWidth="0.6" opacity="0.45" />
      {/* Magazine base */}
      <rect x="82" y="40" width="10" height="3" rx="0.5" fill="#1a1e26" />
      {/* Front sight */}
      <path d="M26 14l2-3h4l2 3" fill="#2e323a" stroke="#1a1c20" strokeWidth="0.3" />
    </svg>
  );
}
