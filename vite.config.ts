import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// アプリの版：Cloudflare のビルドではコミットの先頭7文字、手元ではビルドした日時（UTC）
const appVersion =
  process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ??
  process.env.GITHUB_SHA?.slice(0, 7) ??
  new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    rolldownOptions: {
      output: {
        // ライブラリをアプリ本体と分ける。配信のたびに変わるのは本体だけになり、
        // LINE で開き直したときにライブラリは端末に残ったものを使える（public/_headers で1年キャッシュ）
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'liff', test: /node_modules[\\/]@line[\\/]/ },
            { name: 'qrcode', test: /node_modules[\\/](qrcode|pngjs|dijkstrajs|encode-utf8)[\\/]/ },
          ],
        },
      },
    },
  },
})
