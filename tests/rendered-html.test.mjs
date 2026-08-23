import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders the value-first AI records MVP workspace", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("phase0", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    testEnvironment,
    testExecutionContext,
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /AI 协作记录体验版/);
  assert.match(html, /把散落的 AI 协作记录/);
  assert.match(html, /导入记录/);
  assert.match(html, /发现经历/);
  assert.match(html, /核对关键内容/);
  assert.match(html, /查看回顾/);
  assert.match(html, /原始记录保存在本地/);
  assert.match(html, /先看草稿/);
  assert.match(html, /原生导出解析、自动策展网页和公开分享尚未实现/);
  assert.doesNotMatch(html, /5 分钟/);
  assert.doesNotMatch(html, /Unknown/);
});

test("retires the static demo route and serves the real exhibition", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("expo", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const demo = await worker.fetch(
    new Request("http://localhost/demo", { headers: { accept: "text/html" } }),
    testEnvironment,
    testExecutionContext,
  );
  assert.equal(demo.status, 404);

  const exhibition = await worker.fetch(
    new Request("http://localhost/exhibition", { headers: { accept: "text/html" } }),
    testEnvironment,
    testExecutionContext,
  );
  const html = await exhibition.text();

  assert.equal(exhibition.status, 200);
  assert.match(html, /正在读取本地回顾档案/);
});

const testEnvironment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const testExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
};
