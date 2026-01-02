/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_BANNER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
