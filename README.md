# 字渡 SubFerry

用大语言模型把外语字幕（韩语、意大利语等）翻译为中文的 Web 服务。完整设计方案见 [`readme.md`](./readme.md)。

**当前状态：M1 最小可用版 + M2 实用版已完成**（见 `readme.md` 第13章的里程碑定义）。范围与
取舍见下方「范围」一节。

## 快速开始（本地开发，不需要 Docker）

```bash
corepack enable          # 激活 pnpm（若已装 pnpm 可跳过）
pnpm install

# 终端 A：启动后端（:8080）
APP_SECRET=$(openssl rand -base64 48) ADMIN_PASSWORD=changeme DATA_DIR=./data \
  pnpm --filter @subferry/server dev

# 终端 B：启动前端（:5173，自动把 /api 代理到 :8080）
pnpm --filter @subferry/web dev
```

浏览器打开 `http://localhost:5173`：首次访问会要求设置管理员密码（若已经设置了
`ADMIN_PASSWORD` 环境变量，服务启动时会自动创建好管理员账号，直接登录即可）。登录后先去
"服务设置"页添加一个翻译服务：
- 本机没有大模型 API Key 时，选择内置的 **mock（模拟服务）**，即可跑通整条翻译流程（不产生
  任何费用，也不需要联网）。
- 有真实 API Key 时，直接选对应的服务商——**OpenAI、DeepSeek、通义千问、Kimi、智谱 GLM、
  豆包、Google Gemini** 都是预设好 baseURL/默认模型的，只需要填 API Key；不在预设列表里的
  中转站/自建代理用 **通用 OpenAI 兼容（自定义地址）**；**Claude** 走的是 Anthropic 官方
  Messages API（不是 OpenAI 协议）。每个实例还可以单独配代理地址（"代理"按钮）。

新建任务支持 SRT/ASS/SSA/VTT，源语言是下拉选择（留空即自动检测）；可以选一个"翻译方案"
（`/profiles`）代替手动逐项设置，也可以关联一个"项目"（`/projects`）以启用术语表自动提取。
高级参数里能选双语输出（中文在上/原文在上）和简繁转换。脚本调用见 `/tokens` 页创建的
API Token（`Authorization: Bearer <token>`）。

## 验证

```bash
pnpm -r build       # 构建全部包
pnpm -r typecheck   # 类型检查
pnpm -r test        # 自动化测试（192 个用例）
```

`packages/core` 的测试里有硬性回归：SRT/ASS/VTT 样本"解析 → 写出"（不经翻译）必须与输入
逐字节一致；以及对 mock 服务注入 7 种故障（漏 id、合并 id、空值、占位符丢失、非 JSON、拒答、
429）分别跑一遍完整流水线，断言任务总能结束、每条字幕最终状态只会是 done/failed/skipped。
`apps/server` 的测试覆盖了鉴权（含 Bearer token）、限流、暂停恢复、断点续传、待校对确认、
术语提取与确认、数据库升级迁移（模拟 M1 旧库打开后自动补列）等场景，全部针对真实 SQLite
文件运行，不是纯 mock。

除了自动化测试，这些流程也在真实起服务（`node dist/index.js`，非测试框架）的前提下用 curl
走过一遍完整闭环：上传 ASS → 触发术语提取 → 确认术语 → 翻译完成 → 双语+ASS内联样式的输出
校验字节级正确；用旧版（M1 期）数据库文件启动新代码，确认自动迁移补列且旧数据不丢。

## Docker 部署

```bash
cd deploy
# 编辑 docker-compose.yml：替换 APP_SECRET、ADMIN_PASSWORD、BASE_URL
docker compose up --build -d
```

**注意**：开发这份代码的环境没有安装 Docker，`Dockerfile`/`docker-compose.yml` 未经过真实的
`docker build`/`docker compose up` 验证，请在有 Docker 的机器上执行后自行核对。构建流程中最
关键的一步（`pnpm --filter @subferry/server deploy --prod`
产出独立可运行目录、前端构建产物由 Fastify 直接托管）已经在不依赖 Docker 的前提下单独验证过，
细节见 [`deploy/README.md`](./deploy/README.md)。

## 范围

按 `readme.md` 第13章的里程碑划分，目前交付了 **M1 最小可用版 + M2 实用版**：

**已实现：**
- 字幕格式：SRT / ASS / SSA / WebVTT 无损解析写出（含 ASS 的 Text 字段逗号安全切分、
  Comment 行透传、`\N` 换行转换；VTT 的 cue 标识与 cue settings 保留）
- 翻译服务：OpenAI、DeepSeek、通义千问、Kimi、智谱 GLM、豆包、Google Gemini（预设 baseURL，
  只需填 API Key）+ 通用 OpenAI 兼容（自定义地址）+ Claude（真正的 Anthropic Messages API）+
  内置 mock。故障切换链、Ollama、DeepL、精翻模式、审校轮是 M3 范围
- 核心流水线：分批编排、id-JSON 协议、逐级降级重试、占位符保护、术语表自动提取（`chat` 通用
  对话接口 + 按批过滤"本批实际出现的术语"）、后处理（标点规范/折行/阅读速度标记/简繁转换/
  双语合并，ASS 双语会给原文加缩放样式）
- 服务端：Fastify + SQLite（WAL）+ Drizzle、单管理员认证 + API Token（Bearer）、
  AES-256-GCM 密钥加密、按服务实例的全局限流、全局代理（`HTTPS_PROXY`）+ 实例代理、
  SSE 进度推送、暂停/恢复/取消、启动恢复（断点续传）、SIGTERM 优雅退出、待校对确认门
  （`awaiting_review`，`skipReview` 可跳过）、项目/术语表/翻译方案 CRUD、数据库自动迁移
  （给已有安装补新列，不需要手动操作）
- 前端：React 19 + Vite + TanStack Router/Query/Virtual + Tailwind v4，10 个路由（登录、
  任务列表、新建任务、任务详情、对照校对页、服务设置、项目、项目详情/术语表、翻译方案、
  API Token），接入全部 15 个 readme.md 8.5 表格里列出的 motion-primitives 组件

**明确跳过（M3 再做）：** 精翻模式（严格顺序+已译上下文）、LLM 审校轮、监控目录、多用户隔离、
故障切换链、Ollama/DeepL 服务、文件保留清理、项目打包下载。数据库结构已经为这些功能预留
了扩展点（`profiles.reviewEnabled` 列已经建好但逻辑未接入）。

**环境相关的已知限制：**
- `npx shadcn@latest add ...` 和 motion-primitives 的组件源码站在本机沙箱里都无法访问
  （SSL 连接失败），因此 `src/components/ui/` 与 `src/components/motion/` 下的组件是手写的
  等价实现（API 形状与官方一致，个别组件做了简化，见 `apps/web/src/components/motion/README.md`
  的"已知简化"一节），未来网络可用时可以直接用官方命令覆盖。
- Docker 相关文件未经容器化实测，见上文「Docker 部署」。

## 目录结构

```
packages/
  shared/   前后端共用的 zod schema
  core/     翻译核心（无 UI/IO 依赖）：subtitle / preprocess / services / pipeline / postprocess
apps/
  server/   Fastify 后端
  web/      React 前端
deploy/     Dockerfile / docker-compose / 反向代理示例 / systemd
```
