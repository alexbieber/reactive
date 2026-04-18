/**
 * Product mark — uses processed PNG (transparent bg) from /reactive-logo.png.
 */
type BrandLogoProps = {
  /** nav: top bar · studio / wizard: app chrome */
  variant: "nav" | "studio" | "wizard";
  className?: string;
};

const SRC = "/reactive-logo.png";

export default function BrandLogo({ variant, className = "" }: BrandLogoProps) {
  const base = `brand-logo brand-logo--${variant}`.trim();
  const cls = className ? `${base} ${className}` : base;

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
