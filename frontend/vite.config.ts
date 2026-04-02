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
        target: "http://mecharm.local",
        ws: true,
      },
      "/video": "http://mecharm.local",
      "/snapshot": "http://mecharm.local",
      "/update": "http://mecharm.local",
      "/gripper": "http://mecharm.local",
      "/reset": "http://mecharm.local",
      "/sync": "http://mecharm.local",
      "/coords": "http://mecharm.local",
      "/config": "http://mecharm.local",
      "/diagnostics": "http://mecharm.local",
      "/api": "http://mecharm.local",
    },
  },
});
