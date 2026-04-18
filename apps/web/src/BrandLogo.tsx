/**
 * Product mark — uses processed PNG (transparent bg) from /reactive-logo.png.
 */
type BrandLogoProps = {
  /** nav: top bar · hero: landing hero · studio / wizard: app chrome */
  variant: "nav" | "hero" | "studio" | "wizard";
  className?: string;
};

const SRC = "/reactive-logo.png";

export default function BrandLogo({ variant, className = "" }: BrandLogoProps) {
  const base = `brand-logo brand-logo--${variant}`.trim();
  const cls = className ? `${base} ${className}` : base;

  if (variant === "hero") {
    return (
      <div className={cls}>
        <img
          src={SRC}
          alt="REACTIVE — App Spec to Expo, React Native"
          className="brand-logo-hero-img"
          decoding="async"
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
