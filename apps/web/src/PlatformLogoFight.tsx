/**
 * Flutter vs React Native — decorative bout, React Native wins (crown). No weapons.
 */
export default function PlatformLogoFight({ className = "" }: { className?: string }) {
  return (
    <div className={`platform-logo-fight ${className}`.trim()} aria-hidden="true">
      <p className="platform-logo-fight__tag">Flutter vs React Native · RN wins</p>
      <div className="platform-logo-fight__track">
        <div className="platform-logo-fight__side platform-logo-fight__side--flutter">
          <span className="platform-logo-fight__label">Flutter</span>
          <svg className="platform-logo-fight__svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="plf-fl-a" x1="8" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
                <stop stopColor="#54C5F8" />
                <stop offset="1" stopColor="#29B6F6" />
              </linearGradient>
              <linearGradient id="plf-fl-b" x1="20" y1="8" x2="56" y2="44" gradientUnits="userSpaceOnUse">
                <stop stopColor="#01579B" />
                <stop offset="1" stopColor="#0476D0" />
              </linearGradient>
            </defs>
            <path d="M38 8L56 26L26 56L8 38L38 8Z" fill="url(#plf-fl-a)" opacity="0.95" />
            <path d="M8 26L26 8L44 26L26 44L8 26Z" fill="url(#plf-fl-b)" opacity="0.92" />
            <path d="M26 26L44 44L26 62L8 44L26 26Z" fill="#0476D0" opacity="0.85" />
          </svg>
        </div>

        <div className="platform-logo-fight__burst" />
        <div className="platform-logo-fight__burst platform-logo-fight__burst--spark" />

        <div className="platform-logo-fight__side platform-logo-fight__side--rn">
          <span className="platform-logo-fight__label">React Native</span>
          <svg className="platform-logo-fight__svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="plf-rn-ring" x1="32" y1="4" x2="32" y2="60" gradientUnits="userSpaceOnUse">
                <stop stopColor="#087EA4" />
                <stop offset="1" stopColor="#58C4DC" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="28" fill="#0B2A35" opacity="0.35" />
            <circle cx="32" cy="32" r="22" stroke="url(#plf-rn-ring)" strokeWidth="3" fill="#061A22" />
            <ellipse cx="32" cy="32" rx="10" ry="26" stroke="#58C4DC" strokeWidth="2.2" fill="none" opacity="0.95" />
            <ellipse
              cx="32"
              cy="32"
              rx="10"
              ry="26"
              stroke="#58C4DC"
              strokeWidth="2.2"
              fill="none"
              opacity="0.95"
              transform="rotate(60 32 32)"
            />
            <ellipse
              cx="32"
              cy="32"
              rx="10"
              ry="26"
              stroke="#58C4DC"
              strokeWidth="2.2"
              fill="none"
              opacity="0.95"
              transform="rotate(-60 32 32)"
            />
            <circle cx="32" cy="32" r="5" fill="#58C4DC" />
          </svg>
          <span className="platform-logo-fight__crown">♛</span>
        </div>
      </div>
    </div>
  );
}
