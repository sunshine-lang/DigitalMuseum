import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const e2eDir = join(rootDir, ".e2e");

// E2E 使用独立端口与临时数据库，避免与 8010/3001 上的日常开发实例
// 以及 data/ 中的真实档案互相干扰。
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3002",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // 前端 dev 模式只在构建时内联 NEXT_PUBLIC_*，实际始终请求默认的
      // 8010 端口，因此 E2E 后端必须占用 8010（数据库与上传目录仍隔离）。
      command: [
        "UV_CACHE_DIR=../.sites-runtime/uv-cache",
        `DIGITAL_MUSEUM_DATABASE_URL=sqlite:///${join(e2eDir, "digital-museum.db")}`,
        `DIGITAL_MUSEUM_UPLOAD_DIR=${join(e2eDir, "uploads")}`,
        'DIGITAL_MUSEUM_CORS_ORIGINS=\'["http://127.0.0.1:3002","http://localhost:3002"]\'',
        "uv run uvicorn app.main:app --host 127.0.0.1 --port 8010",
      ].join(" "),
      cwd: join(rootDir, "backend"),
      url: "http://127.0.0.1:8010/api/v1/health",
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: [
        "WRANGLER_LOG_PATH=.wrangler/wrangler.log",
        "node_modules/.bin/vite --port 3002 --strictPort",
      ].join(" "),
      cwd: rootDir,
      url: "http://127.0.0.1:3002",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
