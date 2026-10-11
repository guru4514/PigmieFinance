import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Isolated synthetic-data check: production configuration never loads these mocks.
export default defineConfig({
  root: path.resolve(import.meta.dirname, ".."),
  cacheDir: "node_modules/.vite-collection-check",
  optimizeDeps: { entries: ["test-browser/index.html"] },
  plugins: [
    {
      name: "collection-check-mocks",
      enforce: "pre",
      resolveId(source) {
        if (
          source.endsWith("/use-auth") ||
          source.endsWith("/api-client") ||
          source.endsWith("/supabase")
        ) {
          return path.resolve(import.meta.dirname, "mocks.ts");
        }
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../src") } },
  server: { host: "127.0.0.1", port: 4175, strictPort: true },
});
