/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Full site origin for QR preview links when not using the browser’s origin (e.g. https://app.example.com) */
  readonly VITE_PUBLIC_PREVIEW_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
