# 精简审计操作手册（Ponytail Audit Playbook）

> 依据 [ponytail](https://github.com/dietrichgebert/ponytail) 的"懒惰阶梯"理念（AGENTS.md「写代码的懒惰阶梯」）对仓库做周期性过度工程审计。
> 首轮执行：2026-08-23（三刀，见文末基线记录）。本文档供以后定期重跑——**审计是只读的，砍不砍、怎么砍永远走三档决策 + 全量测试门禁**。

## 一、何时重跑

- 完成一个大切片（stage 级）合入后；
- 依赖发生增删后；
- 或按日历每 1–2 个月一次；
- 触发式信号：globals.css 或 museum_service.py 再次显著膨胀、同一助手在 ≥3 个测试文件出现、构建产物 CSS 回涨。

## 二、审计方法（可复制执行）

全部只读，不改文件。每条发现必须带证据（grep 计数 / 行号 / 引用清单），不接受"感觉"。

### 1. 死代码
```bash
# CSS：按 class 前缀逐个统计 tsx 引用（0 引用的区块即死区块）
for cls in demo- journey- side-nav curation- museum- phase0- mvp- expo-; do
  echo "== $cls"; grep -rlo "$cls" app --include="*.tsx" | wc -l
done
# 注意假阳性：JS 动态拼接的类名（如 `st-${event.status}`、status:"pending" 字符串）要人工排除；
# 裸元素选择器、@media 内嵌规则需读上下文确认归属区块再整段判定。

# Python：ruff 先行（语法级），语义级靠调用点核对
grep -rn "函数名(" app tests evaluation --include="*.py" | grep -v "def 函数名"
```

### 2. 依赖
```bash
# 前端：逐依赖 grep import；再查是否 postcss/vite 配置在挂载、是否被测试产物消费
npm ls --depth=0
# 后端：逐依赖 grep import；注意隐式必需（python-multipart 由 FastAPI UploadFile 要求，
# httpx2 是 TestClient 后端）——"无直接 import"≠"可删"
cd backend && UV_CACHE_DIR=../.sites-runtime/uv-cache uv tree
```

### 3. 重复实现
- 同构函数并排 diff（本轮案例：三个 `import_*` 脚手架只差 4 个常量；两套导入 handler 只差文案与校验器）；
- 测试基建盘点：`grep -c "def _git\|def _create_stage" backend/tests/*.py`，同一助手 ≥2 份即收敛进 `tests/helpers.py`（fixtures 进 conftest，纯函数进 helpers，显式 `from tests.helpers import ...`）。

### 4. 平台原生替代自问
手写逻辑是否标准库 / SQLAlchemy / FastAPI / CSS 一行能解？（本轮案例：7 个 `if x is not None` 手写展开 → dict 推导一行。）

## 三、三档决策（每条发现必须归档）

| 档 | 判据 | 处理 |
|---|---|---|
| 可立即安全执行 | 有不可达证明 / 引用计数为 0 / 纯等价改写 | 直接做，测试门禁兜底 |
| 需用户决策 | 改结构不改行为、或牺牲某项便利（OpenAPI 命名、显式钉版） | 列影响评估，用户拍板 |
| 维持有理 | 命中下方"不动名单" | 记录理由，不当违规 |

## 四、不动名单（本轮已裁决，勿重复争论）

| 项 | 理由 |
|---|---|
| 照片链路（service+tests） | PRD v0.2 明文"暂缓投入、代码保留" |
| EventReview 审计表、锚点行号+字符双偏移 | PRD 真实性契约；评测基线同时校验两者 |
| evaluation/ 评测护栏 | test:backend 的组成部分 |
| alembic（vs create_all） | 三个迁移对应真实 schema 演进，保"老库原地升级"；数据完整性属永不偷懒例外 |
| uvicorn[standard] | --reload 需要 watchfiles |
| @cloudflare/vite-plugin + worker/index.ts | 构建与测试链路承重（rendered-html.test 直接消费 worker 产物） |
| .openai/hosting.json 及其复制机制 | 运行环境契约，不知全貌不动 |
| install-ci.sh | 不能排除运行平台在用，赌不起 |
| next 依赖 | vinext 以 shim 消费 next/link，删除需改 tsconfig paths，低收益中风险 |
| 6 个展览主题、/stages 三步删除确认 | 用户点名要的功能/交互 |
| serialize_stage 的 N+1 计数查询 | 本地单用户规模无感，优化属过度工程 |

## 五、执行守则（砍的时候必须遵守）

1. **小步提交**：一刀一笔 commit，回滚粒度清晰；
2. **每步全量门禁**：`test:backend` + ruff + `typecheck` + `lint` + `test:local`；动交互链路必跑 `test:e2e`；动样式必做**三页浏览器视觉回归**（/、/stages、/exhibition 截图对比）；
3. **文案零变动**：重构 UI 逻辑时按钮名/提示语逐字符不变（E2E 断言盯着）；合并后做新旧文案多重集合 diff；
4. **等价替换优先于直接删除**：本轮 Tailwind preflight 是"逐条搬进 globals.css 顶部"而非裸删，保证渲染逐像素一致；
5. **已知坑**：
   - 删依赖后 dev 服务器可能报 `.vite/deps_ssr` 缓存缺失——`rm -rf node_modules/.vite` 重启即愈，不代表依赖删错了；
   - 删 ORM 反向关系会改变 SQLAlchemy 单元工作的隐式插入排序——归档导入这类"一次 commit 全插入"的路径需要**显式分阶段 flush**（见 archive_service）；
   - 测试参数化合并后用 `pytest --collect-only -q | wc -l` 核对**场景数只增不减**（函数数减少是目标）。

## 六、基线记录（2026-08-23 首轮三刀）

| 刀 | commit | 内容 | 战果 |
|---|---|---|---|
| 一 | a33dcca | 死 CSS（/demo 遗留 4,103 行 + phase0 264 行）+ 后端死路径 8 项 | 净 -4,406 行 |
| 二 | 281f6b0 / 12df61a | 三 import 合一、path_policy/origins 集中、测试助手收编、错误用例参数化、前端四组重复合一 | 净 -279 行；测试函数 91→86、场景 99→100 |
| 三 | 5f64d32 | Tailwind 全量移除（preflight 等价内置）、vite/worker 部署死分支、6 个冗余依赖 | 净 -538 行；构建 CSS 168.5KB→82.4KB |

合计净删约 5,200 行；行为零变化（后端 100 用例、E2E 7/7 全绿）。

遗留（明确不做，见不动名单）：alembic、uvicorn extra、install-ci.sh、next 依赖、N+1。

## 七、下轮重跑提示

- 优先复查：新增 stage 切片是否又复制了 import 脚手架 / 测试助手；globals.css 是否出现新零引用区块；package.json 是否新增"只用一次"的依赖；
- 若引入模型能力（Phase 0.5+），提示词/解析模板文件也应纳入死代码与重复审计范围。
