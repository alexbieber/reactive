import { BUILDER_PREVIEW_PHASES } from "./projectBuildConstants";
import SnackWebPreview from "../snack/SnackWebPreview";

type Props = {
  previewLoading: boolean;
  previewPhase: number;
  snackKey: number;
  snackFiles: { path: string; content: string }[];
  previewAbsUrl: string | null;
  qrDataUrl: string | null;
  previewError: string | null;
  showLocalhostQrHint: boolean;
  onSnackReady: () => void;
  onSnackError: (msg: string) => void;
  onExpoGoUrl: (url: string | null) => void;
  onRebuildPreview: () => void;
  onCopyPreviewLink: () => void;
};

export default function BuilderPreviewPanel({
  previewLoading,
  previewPhase,
  snackKey,
  snackFiles,
  previewAbsUrl,
  qrDataUrl,
  previewError,
  showLocalhostQrHint,
  onSnackReady,
  onSnackError,
  onExpoGoUrl,
  onRebuildPreview,
  onCopyPreviewLink,
}: Props) {
  const phaseLabel = BUILDER_PREVIEW_PHASES[previewPhase % BUILDER_PREVIEW_PHASES.length];
  const splitWithQr = Boolean(previewAbsUrl && !previewLoading);
  const showSnack = snackKey > 0 && snackFiles.length > 0;

  return (
    <section className="builder-preview-section" aria-labelledby="builder-preview-title">
      <div className="builder-preview-head">
        <h2 id="builder-preview-title">Expo web preview</h2>
        <p className="builder-preview-lead">
          Powered by <strong>Expo Snack</strong> in your browser (works on Vercel). Scan the QR with{" "}
          <strong>Expo Go</strong> for a native preview, or use the embedded web player. For full fidelity, download the ZIP
          and run <code className="inline-code">npx expo start</code>.
        </p>
        <div className="builder-preview-actions">
          <button type="button" className="btn primary" disabled={previewLoading} onClick={() => onRebuildPreview()}>
            {previewLoading ? "Starting Snack…" : "Rebuild preview"}
          </button>
        </div>
      </div>
      {previewError && (
        <div className="error-banner builder-flow__err" role="alert">
          {previewError}
        </div>
      )}
      <div
        className={`studio-preview-split builder-preview-split${splitWithQr ? " studio-preview-split--with-qr" : ""}`}
      >
        <div className="studio-preview-frame-col">
          <div className="studio-frame-wrap builder-preview-frame-wrap">
            {previewLoading && (
              <div className="studio-preview-overlay">
                <div className="studio-preview-spinner" aria-hidden />
                <p>{phaseLabel}</p>
              </div>
            )}
            {showSnack ? (
              <SnackWebPreview
                key={snackKey}
                files={snackFiles}
                onError={onSnackError}
                onExpoGoUrl={onExpoGoUrl}
                onPreviewReady={onSnackReady}
              />
            ) : (
              !previewLoading && (
                <div className="studio-frame-placeholder">
                  <p className="studio-frame-placeholder-title">Preview starts after generation</p>
                  <p className="builder-preview-placeholder-sub">
                    If it doesn’t start, tap <strong>Rebuild preview</strong>.
                  </p>
                </div>
              )
            )}
          </div>
        </div>
        {splitWithQr && previewAbsUrl && (
          <aside className="studio-qr-aside" aria-label="Phone preview">
            {showLocalhostQrHint && (
              <div className="studio-qr-warn">
                <strong>Localhost.</strong> Use your machine’s LAN IP in the URL (or set{" "}
                <code className="inline-code">VITE_PUBLIC_PREVIEW_ORIGIN</code>) so the QR opens on your phone.
              </div>
            )}
            {qrDataUrl && (
              <div className="studio-qr-wrap">
                <img src={qrDataUrl} width={200} height={200} alt="QR code for Expo Go URL" className="studio-qr-img" />
              </div>
            )}
            <button type="button" className="btn studio-qr-copy" onClick={() => void onCopyPreviewLink()}>
              Copy Expo Go link
            </button>
            <div className="studio-qr-url">
              <code>{previewAbsUrl}</code>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
