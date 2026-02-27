import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../server/static",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/ws": {
        target: "http://192.168.3.2:8080",
        ws: true,
      },
      "/video": "http://192.168.3.2:8080",
      "/update": "http://192.168.3.2:8080",
      "/gripper": "http://192.168.3.2:8080",
      "/reset": "http://192.168.3.2:8080",
      "/sync": "http://192.168.3.2:8080",
      "/diagnostics": "http://192.168.3.2:8080",
      "/api": "http://192.168.3.2:8080",
    },
  },
});
