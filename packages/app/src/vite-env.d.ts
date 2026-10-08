/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_BANNER?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_PUBLIC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
