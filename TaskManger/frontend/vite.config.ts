import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "ui",
              test: /node_modules\/(@mui|@emotion|stylis)/,
              priority: 30,
            },
            {
              name: "react",
              test: /node_modules\/(react|react-dom|scheduler)\//,
              priority: 20,
            },
            {
              name: "forms",
              test: /node_modules\/(zod|react-hook-form|@hookform)\//,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": { target: process.env.API_PROXY || "http://127.0.0.1:8000" },
      "/ws": {
        target: process.env.API_PROXY || "http://127.0.0.1:8000",
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
