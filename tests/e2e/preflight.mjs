import { rmSync } from "node:fs";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

function isPortOccupied(host, port) {
  return new Promise((resolve) => {
    const socket = connect(port, host);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

// 必须在 Playwright 启动任何服务之前执行：
// 1. 清空 .e2e/，让后端在全新数据库上启动；
// 2. 确认 8010 空闲。E2E 后端必须独占前端默认请求的 8010 端口，
//    若被日常开发后端占用，Playwright 会误连到真实档案数据库。
rmSync(fileURLToPath(new URL("../../.e2e", import.meta.url)), {
  recursive: true,
  force: true,
});

if (await isPortOccupied("127.0.0.1", 8010)) {
  console.error(
    "端口 8010 已被占用。请先停止正在运行的后端（npm run backend:dev），再执行 npm run test:e2e。",
  );
  process.exit(1);
}
