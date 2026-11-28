/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_BANNER?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_PUBLIC_URL?: string;
  /** '1' in simulator/emulator app builds: use the App Check debug provider (#243). */
  readonly VITE_APP_CHECK_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
