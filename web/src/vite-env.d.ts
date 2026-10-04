/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_LIFF_ID: string;
  readonly VITE_LINE_OA_BASIC_ID?: string;
  readonly VITE_MINIAPP_URL?: string;
  readonly VITE_PHASE?: string;
  readonly VITE_DEMO?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
