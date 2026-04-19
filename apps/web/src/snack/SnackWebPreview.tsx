import { Snack, type SnackWindowRef } from "snack-sdk";
import type { SDKVersion } from "snack-content";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildSnackFiles, parseNpmDependencies, parseSdkVersion, type PreviewSourceFile } from "./snackFromFiles";

type Props = {
  files: PreviewSourceFile[];
  onError?: (msg: string) => void;
  /** Expo Go URL for QR (exp://…) when Snack provides it */
  onExpoGoUrl?: (url: string | null) => void;
  /** First time the web iframe URL is ready */
  onPreviewReady?: () => void;
};

/**
 * Expo Snack web preview — runs in the browser via snack.expo.dev web player (works on Vercel).
 */
export default function SnackWebPreview({ files, onError, onExpoGoUrl, onPreviewReady }: Props) {
  const webPreviewRef = useMemo<SnackWindowRef>(() => ({ current: null }), []);
  const [webSrc, setWebSrc] = useState<string | null>(null);
  const readyOnce = useRef(false);
  const onErrorRef = useRef(onError);
  const onExpoGoUrlRef = useRef(onExpoGoUrl);
  const onPreviewReadyRef = useRef(onPreviewReady);
  onErrorRef.current = onError;
  onExpoGoUrlRef.current = onExpoGoUrl;
  onPreviewReadyRef.current = onPreviewReady;

  useLayoutEffect(() => {
    const mapped = buildSnackFiles(files);
    if (Object.keys(mapped).length === 0) {
      onErrorRef.current?.("No files to preview.");
      return;
    }

    const snack = new Snack({
      files: mapped,
      dependencies: parseNpmDependencies(files),
      sdkVersion: parseSdkVersion(files) as SDKVersion,
      webPreviewRef,
      online: true,
    });

    readyOnce.current = false;

    const applyState = (state: { webPreviewURL?: string; url?: string | null }) => {
      if (state.webPreviewURL) {
        setWebSrc(state.webPreviewURL);
        if (!readyOnce.current) {
          readyOnce.current = true;
          onPreviewReadyRef.current?.();
        }
      }
      onExpoGoUrlRef.current?.(state.url ?? null);
    };

    applyState(snack.getState());

    const sub = snack.addStateListener((state) => applyState(state));

    snack.setOnline(true);
    snack.getStateAsync().catch((e) => {
      onErrorRef.current?.(e instanceof Error ? e.message : String(e));
    });

    return () => {
      sub();
      snack.setOnline(false);
      setWebSrc(null);
    };
  }, [files, webPreviewRef]);

  return (
    <iframe
      ref={(el) => {
        webPreviewRef.current = el?.contentWindow ?? null;
      }}
      title="Expo Snack preview"
      className="studio-frame"
      src={webSrc ?? undefined}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      allow="camera; microphone; geolocation"
    />
  );
}
