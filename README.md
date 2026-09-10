# 字渡 SubFerry

用大语言模型把外语字幕（韩语、意大利语等）翻译为中文的 Web 服务。完整设计方案见 [`readme.md`](./readme.md)。

**当前状态：M1 最小可用版已完成**（见 `readme.md` 第13章的里程碑定义）。范围与取舍见下方
「M1 范围」一节；实现计划与设计决策的完整记录在会话中生成的计划文件里，本 README 只总结结果。

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
`ADMIN_PASSWORD` 环境变量，服务启动时会自动创建好管理员账号，直接登录即可）。登录后先在
"新建任务"页创建一个服务实例——本机没有大模型 API Key 时，选择内置的 **mock（模拟服务）**
即可跑通整条翻译流程（不产生任何费用，也不需要联网）；有真实的 OpenAI 兼容接口时，选择
**OpenAI 兼容** 并填写 baseURL / apiKey / model。

## 验证

```bash
pnpm -r build       # 构建全部包
pnpm -r typecheck   # 类型检查
pnpm -r test        # 自动化测试（124 个用例，覆盖核心翻译流水线的故障注入场景、
                     # 服务端的鉴权/限流/暂停恢复/断点续传等）
```

`packages/core` 的测试里有一条硬性回归：任意 SRT 样本"解析 → 写出"（不经翻译）必须与输入
逐字节一致；以及对 mock 服务注入 7 种故障（漏 id、合并 id、空值、占位符丢失、非 JSON、拒答、
429）分别跑一遍完整流水线，断言任务总能结束、每条字幕最终状态只会是 done/failed/skipped。

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

## M1 范围

按 `readme.md` 第13章的里程碑划分，本次交付的是 **M1 最小可用版**，相对完整方案做了以下取舍：

**已实现：**
- 字幕格式：SRT 无损解析/写出（ASS/VTT 接口占位，M2 再实现）
- 翻译服务：OpenAI 兼容 + 内置 mock（Claude/Gemini/Ollama/DeepL/通用HTTP 是 M3 范围）
- 核心流水线：分批编排、id-JSON 协议、逐级降级重试（部分接受→整批重试→二分拆批→标记失败）、
  占位符保护、后处理（标点规范/折行/阅读速度标记）
- 服务端：Fastify + SQLite（WAL）+ Drizzle、单管理员认证、AES-256-GCM 密钥加密、按服务实例的
  全局限流、SSE 进度推送、暂停/恢复/取消、启动恢复（断点续传）、SIGTERM 优雅退出
- 前端：React 19 + Vite + TanStack Router/Query + Tailwind v4，4 个页面（登录初始化、任务列表、
  新建任务、任务详情），接入 TextShimmer/AnimatedNumber 两个动效组件

**明确跳过（M2/M3 再做）：** 术语表、项目管理、双语输出、繁简转换、精翻模式（严格顺序+已译
上下文）、审校轮、监控目录、多用户隔离、API Token、故障切换链、文件保留清理、出站代理。
数据库结构为这些功能预留了扩展点（例如 `jobs.projectId` 列），加这些功能不需要改动已有表结构。

**环境相关的已知限制：**
- `npx shadcn@latest add ...` 和 motion-primitives 的组件源码站在本机沙箱里都无法访问
  （SSL 连接失败），因此 `src/components/ui/` 与 `src/components/motion/` 下的组件是手写的
  等价实现（API 形状与官方一致），未来网络可用时可以直接用官方命令覆盖，细节见
  `apps/web/src/components/motion/README.md`。
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
