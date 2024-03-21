/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IS_ZIP: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
