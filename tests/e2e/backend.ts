import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, type TestFixture } from "@playwright/test";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const e2eDir = join(rootDir, ".e2e");
const backendHealthUrl = "http://127.0.0.1:8010/api/v1/health";

// 档案库为根（ADR-0001）后数据全局共享，e2e 用例间必须彻底隔离：
// 每个用例拉起独占 8010 的 uvicorn，指向一次性空库与一次性的会话根目录
// （用例把 fixture 会话写进 e2eEnv 的目录，再触发同步），用毕即焚。
export type E2eEnv = {
  runDir: string;
  claudeProjectsRoot: string;
  codexSessionsRoot: string;
  projectsRoot: string;
};

const e2eEnvFixture: TestFixture<E2eEnv, object> = async ({}, run) => {
  const runDir = join(
    e2eDir,
    `run-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const env: E2eEnv = {
    runDir,
    claudeProjectsRoot: join(runDir, "claude-home", "projects"),
    codexSessionsRoot: join(runDir, "codex-home", "sessions"),
    projectsRoot: join(runDir, "projects"),
  };
  mkdirSync(env.claudeProjectsRoot, { recursive: true });
  mkdirSync(env.codexSessionsRoot, { recursive: true });
  mkdirSync(env.projectsRoot, { recursive: true });

  // detached 建立进程组：退出时 kill(-pid) 把 uvicorn 孙进程一起带走，
  // 避免 8010 被孤儿进程占用、下一个用例误连到残留后端。
  const child: ChildProcess = spawn(
    "uv",
    ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8010"],
    {
      cwd: join(rootDir, "backend"),
      env: {
        ...process.env,
        UV_CACHE_DIR: "../.sites-runtime/uv-cache",
        DIGITAL_MUSEUM_DATABASE_URL: `sqlite:///${join(runDir, "digital-museum.db")}`,
        DIGITAL_MUSEUM_UPLOAD_DIR: join(runDir, "uploads"),
        DIGITAL_MUSEUM_CLAUDE_PROJECTS_ROOT: env.claudeProjectsRoot,
        DIGITAL_MUSEUM_CODEX_SESSIONS_ROOT: env.codexSessionsRoot,
        DIGITAL_MUSEUM_CORS_ORIGINS:
          '["http://127.0.0.1:3002","http://localhost:3002"]',
      },
      stdio: "ignore",
      detached: true,
    },
  );
  let spawnError: Error | null = null;
  child.once("error", (error: Error) => {
    spawnError = error;
  });

  const stop = (signal: "SIGTERM" | "SIGKILL") => {
    try {
      if (child.pid) process.kill(-child.pid, signal);
    } catch {
      // 进程组已不存在（父进程退出的窗口期），回退单进程信号。
      child.kill(signal);
    }
  };

  const deadline = Date.now() + 90_000;
  for (;;) {
    if (spawnError) {
      throw new Error(`e2e 隔离后端无法启动: ${String(spawnError)}`);
    }
    try {
      const response = await fetch(backendHealthUrl);
      if (response.ok) break;
    } catch {
      // 后端还在启动（迁移/监听），继续等。
    }
    if (Date.now() > deadline) {
      stop("SIGKILL");
      throw new Error("e2e 隔离后端 90 秒内未就绪");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // 用例失败也必须回收后端与一次性目录：泄漏的 8010 会污染后续用例。
  try {
    await run(env);
  } finally {
    await new Promise<void>((resolve) => {
      const fallback = setTimeout(resolve, 5000);
      child.once("exit", () => {
        clearTimeout(fallback);
        resolve();
      });
      stop("SIGTERM");
    });
    stop("SIGKILL");
    rmSync(runDir, { recursive: true, force: true });
  }
};

export const test = base.extend<{ e2eEnv: E2eEnv }>({
  e2eEnv: [e2eEnvFixture, { auto: true }],
});

export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";
