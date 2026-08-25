import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

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
    // 后端不在此处启动：档案库为根（ADR-0001）后数据全局共享，每个用例
    // 经 tests/e2e/backend.ts 拉起独占 8010 的一次性隔离后端（空库）。
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
