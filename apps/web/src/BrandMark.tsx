type Props = {
  /** Wizard / landing: single product name. Studio: split wordmark. */
  variant?: "default" | "studio";
  /** Logo edge length in CSS px */
  size?: number;
  className?: string;
};

export default function BrandMark({ variant = "default", size = 40, className = "" }: Props) {
  const wrap = `brand-mark${className ? ` ${className}` : ""}`;
  if (variant === "studio") {
    return (
      <div className={wrap}>
        <img
          src="/logo.png"
          alt=""
          width={size}
          height={size}
          className="brand-logo"
          decoding="async"
        />
        <h1 className="brand-wordmark brand-wordmark--studio">
          <span className="brand-product">REACTIVE</span>
          <span className="brand-screen">Studio</span>
        </h1>
      </div>
    );
  }
  return (
    <div className={wrap}>
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        className="brand-logo"
        decoding="async"
      />
      <h1 className="brand-wordmark">REACTIVE</h1>
    </div>
  );
}
