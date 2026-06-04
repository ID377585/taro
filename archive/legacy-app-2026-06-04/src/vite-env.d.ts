/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_BUCKET?: string
  readonly VITE_SUPABASE_FOLDER_PREFIX?: string
  readonly VITE_SUPABASE_METADATA_TABLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
