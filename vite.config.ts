import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/metals": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["tabLogo.png"],
      manifest: {
        name: "MetalPulse",
        short_name: "MetalPulse",
        description: "Live metals spot prices and charts",
        theme_color: "#0b0b0f",
        background_color: "#0b0b0f",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/tabLogo.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/tabLogo.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
