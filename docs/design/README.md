# 基于 Product Brief 的项目记忆原型

本目录交付 DigitalMuseum Product Brief v1.0 与 MVP 功能清单对应的 **F01–F12 浏览器交互原型**，视觉参考 Rome Travel App 的暖色暗场、玻璃导航与聚焦卡片。

## 打开原型

克隆仓库后，用浏览器打开本目录的 [index.html](index.html)，点击“从 F01 开始完整体验”。保留仓库目录结构，页面会使用 `../../public/gallery/` 中的装饰插画，无需启动后端。

- [全部功能与范围](mvp-function-map.md)
- [视觉规范](project-memory-visual-spec-v1.md)
- [完整项目页：F05–F12](f05-f08-project-museum-prototype.html)
- [操作说明、验收记录与限制](prototype-acceptance.md)
- [与原有 v0.3 版本的对比及四张截图](comparison-2026-09-24/comparison.md)

## 验证

安装仓库依赖和 Playwright Chromium 后，在仓库根目录执行：

```bash
node docs/design/verify-prototype.mjs
```

脚本使用独立临时浏览器配置，验证主流程、人工修订、版本保存、异常与移动端，并更新本目录的验收截图。

## 交付边界

页面里的项目、会话、读取结果和模型生成均为合成演示。版本与修订真实保存到当前浏览器的本地存储；没有连接真实 Agent 目录、模型接口或正式档案数据库。

本目录是新版设计与交互提案。仓库 `app/` 与 `backend/` 仍是原有 v0.3 产品实现；本原型不代表新版后端能力已经完成。
