/// <reference types="vite/client" />

interface Window {
  __AOA_CONFIG__?: {
    apiBaseUrl?: string;
    googleClientId?: string;
  };
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
