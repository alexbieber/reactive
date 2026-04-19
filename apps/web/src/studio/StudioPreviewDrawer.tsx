import { PREVIEW_PHASES } from "./studioConstants";
import SnackWebPreview from "../snack/SnackWebPreview";

type StudioPreviewDrawerProps = {
  previewOpen: boolean;
  onClose: () => void;
  previewBusy: boolean;
  previewPhase: number;
  snackKey: number;
  snackFiles: { path: string; content: string }[] | null;
  previewAbsUrl: string | null;
  specCheckOk: boolean;
  qrDataUrl: string | null;
  showLocalhostQrHint: boolean;
  splitWithQr: boolean;
  onBuildPreview: () => void;
  onCopyPreviewLink: () => void;
  onSnackReady: () => void;
  onSnackError: (msg: string) => void;
  onExpoGoUrl: (url: string | null) => void;
};

export function StudioPreviewDrawer({
  previewOpen,
  onClose,
  previewBusy,
  previewPhase,
  snackKey,
  snackFiles,
  previewAbsUrl,
  specCheckOk,
  qrDataUrl,
  showLocalhostQrHint,
  splitWithQr,
  onBuildPreview,
  onCopyPreviewLink,
  onSnackReady,
  onSnackError,
  onExpoGoUrl,
}: StudioPreviewDrawerProps) {
  if (!previewOpen) return null;

  const showSnack = Boolean(snackFiles?.length && snackKey > 0);

  return (
    <>
      <button type="button" className="studio-mv2-scrim" aria-label="Close preview" onClick={onClose} />
      <div className="studio-mv2-drawer" role="dialog" aria-modal="true" aria-labelledby="studio-preview-title">
        <div className="studio-mv2-drawer-head">
          <h2 id="studio-preview-title">Expo web preview</h2>
          <div className="studio-mv2-drawer-actions">
            <button
              type="button"
              className="studio-mv2-btn-primary"
              disabled={previewBusy || !specCheckOk}
              onClick={onBuildPreview}
            >
              {previewBusy ? "Building…" : "Build preview"}
            </button>
            <button type="button" className="studio-mv2-drawer-x" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        <div className="studio-mv2-drawer-body">
          <p className="studio-mv2-drawer-lead" style={{ marginBottom: "0.75rem", opacity: 0.85 }}>
            Preview runs in <strong>Expo Snack</strong> (embedded). Spec → codegen on the API returns source files;
            the web player loads here.
          </p>
          <div
            className={`studio-preview-split studio-mv2-drawer-split${
              splitWithQr ? " studio-preview-split--with-qr" : ""
            }`}
          >
            <div className="studio-preview-frame-col">
              <div className="studio-frame-wrap studio-mv2-frame">
                {previewBusy && (
                  <div className="studio-preview-overlay">
                    <div className="studio-preview-spinner" aria-hidden />
                    <p>{PREVIEW_PHASES[previewPhase]}</p>
                  </div>
                )}
                {showSnack && snackFiles ? (
                  <SnackWebPreview
                    key={snackKey}
                    files={snackFiles}
                    onError={onSnackError}
                    onExpoGoUrl={onExpoGoUrl}
                    onPreviewReady={onSnackReady}
                  />
                ) : (
                  !previewBusy && (
                    <div className="studio-frame-placeholder">
                      <p className="studio-frame-placeholder-title">No preview yet</p>
                      <ol className="studio-frame-steps">
                        <li>
                          Fix any <strong>Spec</strong> issues in the sidebar or chat, then <strong>Apply</strong>.
                        </li>
                        <li>
                          Tap <strong>Build preview</strong> above — codegen runs on the server, then Snack loads here.
                        </li>
                      </ol>
                    </div>
                  )
                )}
              </div>
            </div>
            {splitWithQr && previewAbsUrl && (
              <aside className="studio-qr-aside studio-mv2-qr" aria-label="Phone preview">
                {showLocalhostQrHint && (
                  <div className="studio-qr-warn">
                    <strong>Localhost.</strong> Use your LAN IP so the QR works on Wi‑Fi.
                  </div>
                )}
                {qrDataUrl && (
                  <div className="studio-qr-wrap">
                    <img
                      src={qrDataUrl}
                      width={200}
                      height={200}
                      alt="QR code for Expo Go URL"
                      className="studio-qr-img"
                    />
                  </div>
                )}
                <button type="button" className="btn studio-qr-copy" onClick={onCopyPreviewLink}>
                  Copy Expo Go link
                </button>
                <div className="studio-qr-url">
                  <code>{previewAbsUrl}</code>
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
