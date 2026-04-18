/**
 * Product mark — uses processed PNG (transparent bg) from /reactive-logo.png.
 */
type BrandLogoProps = {
  /** landing: centered hero mark · nav: compact · studio / wizard: app chrome */
  variant: "landing" | "nav" | "studio" | "wizard";
  className?: string;
};

const SRC = "/reactive-logo.png";

export default function BrandLogo({ variant, className = "" }: BrandLogoProps) {
  const base = `brand-logo brand-logo--${variant}`.trim();
  const cls = className ? `${base} ${className}` : base;

  if (variant === "landing") {
    return (
      <div className={cls}>
        <img
          src={SRC}
          alt="REACTIVE — App Spec to Expo, React Native"
          className="brand-logo-img brand-logo-img--landing"
          decoding="async"
          fetchPriority="high"
        />
      </div>
    );
  }

  return (
    <div className={cls}>
      <img
        src={SRC}
        alt=""
        className="brand-logo-img"
        decoding="async"
        aria-hidden
      />
    </div>
  );
}
