# 字渡 SubFerry 软件设计方案（Web 服务版）

> 版本：v2.1　｜　形态：部署在 Linux 服务器上的 Web 服务，通过浏览器或 REST API 使用
> 前端：React + Vite，基础组件用 shadcn/ui，动效用 motion-primitives（见第 8 章）
> 功能：用大语言模型把外语字幕（韩语、意大利语等）翻译为中文，时间轴原样保留
> 相对 v1.0（Tauri 桌面版）的主要变化见第 2 章；翻译核心逻辑与 v1.0 一致。v2.1 重写了第 8 章前端设计。

---

## 1. 目标与原则

### 1.1 目标

在 Linux 服务器上以单个 Docker 容器运行，提供三种使用方式：

1. **网页界面**：上传字幕、配置翻译服务、查看进度、在线校对、下载结果。
2. **REST API**：供脚本和其他程序调用，例如用 `curl` 提交字幕并取回译文。
3. **监控目录**：挂载媒体库目录，自动发现外语字幕，并在同目录生成中文字幕，与 Jellyfin、Plex、Emby 等媒体服务器配合使用。

软件支持 SRT、ASS/SSA、WebVTT 格式。输出文件的时间轴、样式和位置信息与原文件完全一致。

### 1.2 非目标（第一版不做）

以下内容可作为后续扩展，但不进入核心架构：语音识别生成字幕、调轴、字幕压制、多节点分布式部署。

### 1.3 三条核心原则

**第一，时间轴只由程序管理。** 模型永远看不到时间码。写出文件时，程序把原始时间字符串逐字写回。

**第二，模型只见文本，按编号回填。** 每条字幕分配一个 id，模型按 id 返回译文。这样任何格式错乱都只会表现为“某个 id 缺失或异常”，可以检测，也可以补救。

**第三，一切可校验、可恢复。** 每批结果都要经过校验；失败时自动重试、拆分、补译。任务进度实时写入数据库，服务重启后会从断点继续。

---

## 2. 从桌面版到 Web 服务的调整

### 2.1 为什么这次改动成本不高

v1.0 已经把翻译逻辑放在一个无 UI 依赖的纯 TypeScript 核心包（`packages/core`）里，并通过依赖注入提供 HTTP 客户端。改成 Web 服务时，核心包原样复用，只需替换它下面的“系统层”和上面的“界面层”：

| 部分 | 桌面版（v1.0） | Web 服务版（v2.0） |
|---|---|---|
| 运行形态 | Tauri 桌面应用 | Node.js 服务端 + 浏览器单页应用 |
| 核心翻译逻辑 | `packages/core` | **不变**，直接复用 |
| 编码检测与转码 | Rust：`chardetng` + `encoding_rs` | Node：`chardet` + `iconv-lite` |
| 语言检测 | Rust：`whatlang` | Node：`franc-min` |
| HTTP 客户端 | Tauri HTTP 插件（绕过 CORS） | Node 原生 fetch（undici），支持代理 |
| API Key 存储 | 系统钥匙串 | 数据库中以 AES-256-GCM 加密，主密钥来自环境变量 |
| 任务执行 | 前端进程内 | 服务端后台调度器，浏览器关闭后任务照常运行 |
| 进度推送 | 前端状态 | SSE（Server-Sent Events） |
| 访问控制 | 无需 | 登录认证 + API Token |
| pot 插件兼容 | 计划支持 | **取消**，理由见 2.3 |
| 新增能力 | — | REST API、监控目录、多用户（可选）、文件保留策略 |

### 2.2 对 pot 翻译框架的借鉴（保持不变）

以下设计继续沿用 pot-desktop 翻译部分的思路：

- **一服务一目录。** 每个服务包含 info、配置 schema 和翻译逻辑，并在注册表中统一登记。
- **语言映射。** 使用统一语言键（`zh_cn`、`ko`、`it` 等），每个服务再维护自己的语言映射表。
- **多实例。** 服务实例键形如 `name@id`，同一服务可以配置多份，并组成故障切换链。
- **提示词模板。** 使用可编辑的 `$变量` 提示词模板，并扩展了字幕专用变量。

扩展与改造的部分也与 v1.0 一致，包括：新增 `translateBatch` 批量接口、`capabilities` 能力声明、用 `AbortSignal` 支持取消、配置面板由 `configSchema` 自动生成。

另外，pot 本身提供了一个本地 HTTP 接口（默认端口 60828），供其他软件调用翻译。Web 版的 REST API 可以看作这个思路的延伸：翻译功能天然就是一个可被调用的服务。

### 2.3 为什么取消 pot 插件兼容

pot 加载插件的方式，是读取插件的 `main.js` 后直接 `eval` 执行，并允许插件运行本地二进制文件。在个人电脑上，这相当于“用户自己决定信任某个插件”。但在服务器上，这等于允许远程上传并执行任意代码，风险不可接受。

替代方案是：内置的“OpenAI 兼容”服务已覆盖绝大多数大模型接口，另外再提供一个“通用 HTTP 模板”服务。管理员可以通过配置请求地址、请求体模板和结果提取路径来接入其他接口，全程无需执行任何外部代码。

### 2.4 许可证提示

pot-desktop 采用 GPL-3.0 许可证。直接复制其代码并对外分发，通常需要以兼容方式开源；只借鉴架构、代码自行编写，一般不受此约束。

需要注意的是，GPL-3.0 对“仅在自己服务器上运行、不分发”的情况约束较宽松；如果将来改用 AGPL 代码，则情况不同。项目如有商业化或闭源打算，建议先咨询专业意见。

---

## 3. 总体架构

### 3.1 分层结构

```
       浏览器（React SPA）           脚本 / curl            媒体库目录
              │                        │                      │
              │ HTTPS                  │ Bearer Token          │ 挂载卷
┌─────────────▼────────────────────────▼──────────────────────▼─────┐
│  反向代理（Caddy / Nginx，负责 HTTPS）                                │
└─────────────┬─────────────────────────────────────────────────────┘
              │ HTTP :8080
┌─────────────▼─────────────────────────────────────────────────────┐
│  apps/server（Node.js + Fastify）                                   │
│                                                                    │
│  API 层   认证 │ 服务实例 │ 任务 │ 条目校对 │ 术语表 │ SSE │ 静态资源  │
│  ────────────────────────────────────────────────────────────────  │
│  调度层   任务调度器 │ 全局限流器（按服务实例）│ 启动恢复 │ 目录扫描器   │
│  ────────────────────────────────────────────────────────────────  │
│  核心层   packages/core（与桌面版相同）                               │
│           解析 → 预处理 → 分批编排 → 校验/重试 → 后处理 → 写出         │
│           翻译服务：OpenAI 兼容 │ Claude │ Gemini │ Ollama │ DeepL │ 通用HTTP │
│  ────────────────────────────────────────────────────────────────  │
│  基础层   编码检测 │ 文件存储 │ SQLite │ 密钥加密 │ 出站代理 │ 日志     │
└─────────────┬─────────────────────────────────────────────────────┘
              │
        /data（数据卷）：subferry.db │ uploads/ │ outputs/
```

整个服务是**单进程**：API 和后台任务运行在同一个 Node 进程中，一个容器就能完成部署。翻译任务的瓶颈在于等待大模型接口返回，而不是本地 CPU，所以单进程足以同时处理多个任务。

### 3.2 技术选型

| 部分 | 选型 | 理由 |
|---|---|---|
| 运行时 | Node.js 22 或 24 LTS | 与核心包同为 TypeScript，前后端共享类型 |
| Web 框架 | Fastify 5 | 性能好，插件生态完整（multipart、static、cookie），自带 pino 日志 |
| 参数校验 | zod | 前后端共享同一套 schema，接口类型自动一致 |
| 数据库 | SQLite（better-sqlite3，WAL 模式） | 单文件、零运维，备份就是复制文件；并发写入需求很低 |
| ORM | Drizzle | 轻量、类型安全；将来需要时可切换到 PostgreSQL |
| 限流 | bottleneck | 按服务实例同时限制并发数和每分钟请求数，所有任务共享 |
| 编码 | chardet + iconv-lite | 覆盖 CP949/EUC-KR、Windows-1252、ISO-8859-15 等老编码 |
| 语言检测 | franc-min | 纯 JS、离线，对整片字幕抽样检测足够准确 |
| 出站代理 | undici `EnvHttpProxyAgent` / `ProxyAgent` | 支持全局 `HTTPS_PROXY`，也支持为单个服务实例单独设置代理 |
| 密码哈希 | @node-rs/argon2 | 预编译二进制，无需编译环境 |
| 目录监控 | chokidar（支持轮询模式） | NAS、SMB、NFS 等网络挂载不支持 inotify，需要轮询 |
| 繁简转换 | opencc-js | 输出繁体中文时使用 |
| 前端框架 | React 19 + Vite + TanStack Router / Query / Virtual | 纯静态产物由 Fastify 提供；校对页用虚拟列表显示上千条字幕 |
| 界面组件 | shadcn/ui（基础组件）+ motion-primitives（动效） | 同一生态，均为复制源码方式，详见第 8 章 |
| 动画引擎 | motion | motion-primitives 的底层依赖 |
| 部署 | Docker / Docker Compose | 另提供 systemd 方式 |

---

## 4. 核心模块设计

本章是字幕翻译的核心逻辑，位于 `packages/core`，与桌面版一致。与 Web 相关的调整会单独注明。

### 4.1 文件接收与编码处理（服务端）

**上传方式。** 浏览器通过 `FormData` 上传原始文件，前端**不要**先用 `FileReader.readAsText` 读成文本，否则非 UTF-8 编码的文件会在浏览器端就被破坏。

**编码检测。** 服务端收到原始字节后：

1. 用 `chardet` 检测编码。
2. 用 `iconv-lite` 转为 UTF-8。
3. 记录原编码、是否带 BOM、换行符类型。

如果检测结果是乱码，用户可以在任务详情页手动指定编码，系统会重新解析。

**上传限制。** 默认单文件不超过 10 MB，只接受 `.srt`、`.ass`、`.ssa`、`.vtt` 扩展名。文件名会做规范化处理，保存到 `/data/uploads/{jobId}/`。

**语言检测。** 对全片文本抽样后用 `franc-min` 检测，结果用于自动填写源语言，用户可以修改。

### 4.2 字幕模型与解析

```ts
interface SubtitleDocument {
  format: 'srt' | 'vtt' | 'ass' | 'ssa';
  sourceEncoding: string;
  eol: '\n' | '\r\n';
  header: string;            // 原样保存：ASS 的 [Script Info]/[V4+ Styles]、VTT 头等
  cues: Cue[];
}

interface Cue {
  id: number;                // 文档内顺序号，也是发给模型的 id
  rawTime: string;           // 原始时间字符串，写出时逐字写回
  startMs: number;           // 仅用于分批与阅读速度计算，只读
  endMs: number;
  speaker?: string;          // ASS 的 Name/Actor 字段，作为说话人提示
  meta: CueMeta;             // ASS 行其余字段、VTT cue settings 等
  leadingTags: string;       // 行首样式标签，如 {\an8}，不交给模型
  source: string;            // 清洗与占位符化后的文本
  placeholders: string[];    // 占位符对应的原始标签
  translatable: boolean;
  target?: string;
  status: 'pending' | 'done' | 'failed' | 'edited' | 'skipped';
  flags: CueFlag[];
}
```

解析器采用无损思路：只抽取文本，其余内容全部原样保存。

- **ASS**：按 `Format:` 行定位字段。Text 是最后一个字段，可能含逗号，因此切分时限定次数。写出时只替换 Text，`Comment:` 行原样保留。
- **VTT**：保留 cue 标识和 cue settings。

基础回归用例是：**不经翻译直接“解析 → 写出”，结果必须与输入逐字节一致。**

在 Web 版中，`Cue` 以行的形式存入数据库的 `cues` 表（见第 6 章）。这样校对页可以分页查询和单条修改，服务重启后也能恢复。

### 4.3 预处理

**标签保护。**
- 行首样式块剥离到 `leadingTags`。
- 行内标签（`{\i1}`、`<i>` 等）替换为 `⟨1⟩` 这样的占位符。
- 如果译文中占位符不对，就去掉行内样式，只保留行首标签，并打上标记。

**换行处理。**
- 单人台词的多行内容先合并为一行再翻译，之后按中文规则重新折行。
- 如果每一行都以 `-` 开头，说明是多人对白，保留原有的行结构。

**过滤。** 以下条目标记为 `skipped` 并原样输出，用户可以在校对页手动恢复翻译：
- 空文本；
- 纯音乐符号行；
- 带 `\k` 的卡拉 OK 特效行；
- 用户排除的 ASS 样式（如 Sign、OP、ED）。

**说话人。** ASS 的 Name 字段不为空时，会随文本一起发给模型，帮助它选择合适的称呼和语气。

### 4.4 翻译服务层（借鉴 pot）

```ts
export interface ServiceInfo {
  name: string;
  displayName: string;
  capabilities: {
    batch: boolean;          // 是否实现 translateBatch
    jsonMode: boolean;       // 是否支持强制 JSON 输出
    stream: boolean;
    maxBatchSize?: number;
    contextWindow?: number;  // 分批时的 token 预算
  };
  configSchema: ConfigField[];   // 前端设置表单由此自动生成；secret 字段加密存储
}

export type LanguageMap = Partial<Record<LangKey, string>>;

export interface CallOptions {
  config: Record<string, unknown>;   // 已解密的实例配置
  http: HttpClient;                  // 注入：undici fetch，按实例配置决定是否走代理
  signal?: AbortSignal;              // 暂停、取消、服务关闭时中断请求
  onProgress?: (partial: string) => void;
}

export interface TranslateService {
  info: ServiceInfo;
  Language: LanguageMap;
  translate(text: string, from: string, to: string, opts: CallOptions): Promise<string>;   // pot 原接口
  translateBatch?(req: BatchRequest, opts: CallOptions): Promise<string>;                  // 批量扩展
}
```

**内置服务：**
- OpenAI 兼容：覆盖 OpenAI、DeepSeek、通义千问、Kimi、智谱及各类中转站。
- Anthropic Claude。
- Google Gemini。
- Ollama：可以连接同一台服务器或局域网内的本地模型。
- DeepL、Google：作为兜底，通过逐条适配器接入。
- 通用 HTTP 模板：见 2.3。

**故障切换链。** 翻译方案中可以把多个服务实例排成顺序。当前实例连续失败（频繁 429、内容审核拒答、网络不通）时，这一批次会自动交给下一个实例处理。

**Web 版的特殊之处：全局限流。** 服务器上可能同时运行多个任务，而它们共用同一个 API Key。因此，限流器按**服务实例**建立，所有任务共享。每个实例可以配置两项：最大并发数和每分钟请求数。这样既不会触发服务商的速率限制，也能让多个任务公平地轮流推进。

### 4.5 批处理编排

**分批。**
- 默认每批 40 条，可在 20 到 60 条之间浮动，同时受 token 预算约束。
- 切分点优先选在字幕间隔最大的位置，间隔超过 2 秒通常意味着场景切换。

**上下文。** 每批附带前 5 条、后 3 条字幕，作为“仅供参考、不要翻译”的上下文。

**两种模式：**

| 模式 | 批次执行方式 | 上文内容 | 适用场景 |
|---|---|---|---|
| 标准模式（默认） | 同一任务内多批并行（受全局限流约束） | 仅原文 | 速度优先 |
| 精翻模式 | 严格顺序 | 原文 + 已完成的译文 | 质量优先 |

**任务流程：**

```
上传/发现 → 编码检测 → 解析 → 预处理 → [术语提取 → 确认] → 分批
        → 批量翻译（校验/重试/补译）→ [审校轮] → 后处理 → 待校对/完成 → 下载/写回
```

创建任务时，界面会显示请求次数和 token 数的估算值。

### 4.6 校验与重试

**容错解析。** 去掉 Markdown 代码围栏，截取第一个完整的 JSON 对象。

**校验项：**

| 校验项 | 规则 | 不通过时 |
|---|---|---|
| id 完整性 | 返回的 id 集合与输入一致 | 缺失的 id 进入补译 |
| 多余 id | 不能出现输入中没有的 id | 丢弃并记录日志 |
| 非空 | 译文不为空白 | 进入补译 |
| 残留原文 | 韩文字符或大段拉丁字母占比不能过高 | 进入补译 |
| 占位符 | 种类与数量一致 | 回退为去除行内样式，并打标记 |
| 长度比例 | 译文长度不能离谱 | 打标记 |
| 拒答 | 识别拒绝翻译的回复 | 切换备用实例 |

**逐级降级：**

1. **部分接受**：合格条目立即入库，只重新请求缺失或异常的 id。
2. **整批重试**：最多 2 次，并在重试消息中指出上次的具体问题。
3. **二分拆批**：对半拆分后分别请求，递归直到单条。
4. **标记失败**：暂时保留原文，任务继续进行，最后在校对页集中列出。

网络错误（429 和 5xx）按指数退避重试，并遵守服务端返回的 `Retry-After`。

### 4.7 术语表

**自动提取。** 翻译前，把全片原文分段发给模型，提取人名、地名、机构名、专有名词和常用称呼，返回候选译名、类别和说明。

**确认方式：**
- 网页上发起的任务会暂停在“待确认术语”状态，等用户在术语表页修改并确认后再继续。
- 通过 API 或监控目录创建的任务，可以在翻译方案中设置“自动确认”，跳过人工步骤。

**存储与继承。** 在 Web 版中，术语表归属于“项目”（见第 6 章）。同一部剧的各集放在同一个项目下，共用并逐步完善同一份术语表。术语表也支持导入和导出为 JSON。

**用量控制。** 每批只携带本批原文中实际出现的术语。

### 4.8 后处理

- **标点规范**：去掉句末句号；句中逗号可替换为空格；问号、叹号使用全角；数字使用半角。
- **折行**：每行字数上限默认 16 字，超出时在接近中点的空格或标点处折行。
- **阅读速度检查**：默认阈值约 9 字/秒，超出时只打标记，不改动时间轴。
- **繁简转换**：可选 OpenCC。
- **标签还原**：还原占位符，拼回行首标签。

### 4.9 输出

**输出模式：**
- 仅中文；
- 双语，中文在上；
- 双语，原文在上。

ASS 格式的双语字幕会为原文部分添加较小字号的行内样式。

**获取方式：**
- 在网页上下载单个文件，或把整个项目打包成 zip 下载。
- 通过 API 下载。
- 监控目录模式下，直接写回源文件所在目录。

**文件命名。** 默认格式为 `{name}.zh.{ext}`，双语为 `{name}.zh-{src}.{ext}`，媒体服务器可以自动识别语言。命名模板可以配置，程序默认不会覆盖已存在的文件。

---

## 5. 提示词设计

提示词模板使用 `$变量` 语法：`$from`、`$to`、`$synopsis`、`$glossary`、`$items`、`$context_before`、`$context_after`，单条模式保留 `$text`。模板带有版本号。管理员可以在服务实例中覆盖默认模板。

**输出格式**使用“以 id 为键的 JSON 对象”，例如 `{"12": "你要去哪", "13": "回家"}`。这种格式校验简单，省 token，也兼容那些 JSON 模式只接受对象的服务。

**默认系统提示词：**

```
你是一名资深影视字幕译者，负责把$from字幕翻译成$to。

【影片信息】
$synopsis

【术语表，必须严格使用以下译名】
$glossary

【翻译要求】
1. 译文口语化、自然流畅，符合中文影视字幕习惯，意译优先，避免翻译腔。
2. 根据说话人身份和人物关系选择语气与称呼（如韩语敬语/半语、意大利语 Lei/tu）。
3. 俚语、脏话、玩笑按中文的自然说法处理，保留原有的情绪强度。
4. 一句话跨多条字幕时，可以在相邻条目之间调整语序，但每个 id 都必须有译文，不得合并、拆分或留空。
5. 形如 ⟨1⟩ 的占位符必须原样保留在译文中对应的位置。
6. 以 "- " 开头的多人对白，保留每行开头的 "- "，行与行之间用 \n 分隔。
7. 只翻译，不解释，不添加原文没有的信息。

【输出格式】
只输出一个 JSON 对象，键为 id，值为译文，例如 {"12": "译文", "13": "译文"}。
不要输出任何其他内容。
```

**默认用户消息：**

```
【上文，仅供参考，不要翻译】
$context_before

【待翻译】
$items

【下文，仅供参考，不要翻译】
$context_after
```

`$items` 按每行一条渲染，例如 `12 [민수]: 어디 가?`。

**审校轮（可选）。** 把原文和译文成对发送，要求模型只返回需要修改的条目，格式为 `{"id": {"text": "...", "reason": "..."}}`。

---

## 6. 数据模型

数据库为 SQLite，开启 WAL 模式，文件位于 `/data/subferry.db`。主要表如下：

| 表 | 主要字段 | 说明 |
|---|---|---|
| `users` | id、username、password_hash、role（admin/user） | 单用户模式下只有一个管理员 |
| `api_tokens` | id、user_id、name、token_hash、last_used_at | 供脚本调用，只保存哈希值 |
| `service_instances` | id（`name@xxx`）、service_name、display_name、config_json、secret_enc、rpm、max_concurrency、enabled | 密钥字段加密存储，接口返回时脱敏为 `sk-****abcd` |
| `profiles` | id、name、service_chain、mode、src_lang、tgt_lang、output_mode、glossary_auto_confirm、review_enabled、options_json | 翻译方案：网页、API、监控目录共用的预设 |
| `projects` | id、user_id、name、synopsis | 一部电影或一部剧 |
| `glossary_entries` | id、project_id、source、target、type、note | 术语表 |
| `jobs` | id、project_id、profile_snapshot、file_name、format、encoding、src_lang、status、progress、origin（web/api/watch）、source_path、output_path、error、timestamps | 一个字幕文件对应一个任务；创建时保存方案快照，之后修改方案不影响进行中的任务 |
| `cues` | job_id、idx、raw_time、start_ms、end_ms、speaker、meta_json、leading_tags、source、placeholders_json、target、status、flags_json | 字幕条目 |
| `batches` | id、job_id、id_from、id_to、service_instance、attempt、status、tokens_in、tokens_out、duration_ms、error | 请求日志与用量统计 |
| `watch_rules` | id、root_path、pattern、profile_id、enabled、last_scan_at | 监控目录规则 |
| `settings` | key、value | 全局设置 |

**任务状态：**

```
queued → parsing → awaiting_glossary → translating → reviewing → awaiting_review → done
                                       ↘ paused ↗           ↘ failed    ↘ canceled
```

`awaiting_review`（待校对）是可选状态。如果翻译方案设置了“完成后直接输出”，任务会跳过校对，直接变为 `done`。

---

## 7. 服务端设计

### 7.1 任务调度

**调度器。** 调度器按先进先出的顺序取出 `queued` 状态的任务，同时处理的任务数上限由 `MAX_ACTIVE_JOBS` 控制（默认 2）。每个任务在一个独立的 runner 中执行，内部的批次请求全部经过对应服务实例的全局限流器（见 4.4）。

**进度推送。** 每批完成后，调度器更新 `cues` 和 `jobs` 表，并通过内部事件总线推送进度事件。SSE 接口把这些事件转发给订阅的浏览器。

**暂停与取消。** 通过 `AbortController` 中断进行中的请求。被中断的批次重新标记为待处理，不会产生半截结果。

**启动恢复。** 服务启动时，把所有处于 `translating` 状态的任务中未完成的批次重置为待处理，然后重新排队。

**优雅退出。** 收到 SIGTERM（例如 `docker stop`）时：
1. 停止接收新批次；
2. 等待进行中的请求最多 20 秒；
3. 超时后中断请求并保存状态。

### 7.2 REST API

所有接口都以 `/api` 开头。网页端使用 Cookie 会话认证，脚本使用 `Authorization: Bearer <token>` 认证。

| 方法与路径 | 说明 |
|---|---|
| `POST /api/auth/login`、`POST /api/auth/logout` | 登录与登出 |
| `GET /api/service-types` | 可用服务类型及其 `configSchema`，前端据此生成表单 |
| `GET/POST/PUT/DELETE /api/services[/:id]` | 服务实例管理（仅管理员） |
| `POST /api/services/:id/test` | 用一条示例字幕实际测试连接 |
| `GET/POST/PUT/DELETE /api/profiles[/:id]` | 翻译方案 |
| `GET/POST /api/projects`、`GET/PUT /api/projects/:id` | 项目 |
| `GET/PUT /api/projects/:id/glossary` | 术语表读取与整体保存 |
| `POST /api/jobs` | multipart 上传一个或多个文件，附带 `projectId`、`profileId` 或覆盖参数，返回任务 id 列表 |
| `GET /api/jobs`、`GET /api/jobs/:id` | 任务列表与详情（含进度、用量） |
| `POST /api/jobs/:id/{pause,resume,cancel,retry-failed}` | 任务控制 |
| `POST /api/jobs/:id/reparse` | 指定编码重新解析 |
| `POST /api/jobs/:id/glossary/confirm` | 确认术语，继续翻译 |
| `GET /api/jobs/:id/events` | 单个任务的 SSE 进度流 |
| `GET /api/events` | 当前用户所有任务的汇总 SSE 流（任务列表页使用） |
| `GET /api/jobs/:id/cues?filter=flagged&offset=0&limit=200` | 分页获取条目，供校对页使用 |
| `PATCH /api/jobs/:id/cues/:idx` | 修改单条译文，状态变为 `edited` |
| `POST /api/jobs/:id/cues/retranslate` | 重译指定条目 |
| `GET /api/jobs/:id/download?mode=zh\|zh-top\|src-top` | 下载结果 |
| `GET /api/projects/:id/download.zip` | 打包下载整个项目 |
| `GET/POST/PUT/DELETE /api/watch-rules[/:id]`、`POST /api/watch-rules/:id/scan` | 监控目录（仅管理员） |
| `GET/POST/DELETE /api/tokens[/:id]` | API Token 管理 |
| `GET /api/health` | 健康检查（无需认证，供 Docker 和监控使用） |

**脚本调用示例：**

```bash
# 提交任务
curl -H "Authorization: Bearer $SF_TOKEN" \
     -F "file=@Movie.2024.ko.srt" -F "profileId=default" \
     https://sub.example.com/api/jobs

# 任务完成后下载
curl -H "Authorization: Bearer $SF_TOKEN" -o Movie.2024.zh.srt \
     "https://sub.example.com/api/jobs/<jobId>/download?mode=zh"
```

### 7.3 监控目录模式

这是 Web 服务版特有的功能，适合与媒体服务器配合使用。

**配置。** 管理员添加监控规则时需要指定三项：
- 根目录，必须位于容器挂载的路径之内；
- 文件匹配规则，例如 `*.{ko,kor,it,ita}.{srt,ass}`，或匹配“任意字幕 + 语言检测结果属于指定语言”；
- 使用的翻译方案。

**扫描逻辑。** 扫描器定期（默认每 10 分钟）或实时（本地磁盘用 inotify，网络挂载用轮询）检查目录。当发现符合规则、同目录下还没有中文字幕，并且之前没有处理过的文件时，自动创建任务。

**完成后。** 译文按命名模板写回同一目录，媒体服务器刷新后即可显示中文字幕。

**防重复。** 已处理的文件用“路径 + 文件大小 + 修改时间”作为指纹记录，避免重复翻译。如果目标文件已存在，默认跳过。

**安全。** 所有路径都会解析为真实路径，并校验是否位于配置的根目录之内，防止路径穿越。

**权限提示。** 容器内的用户需要对媒体目录有写权限，通过 compose 中的 `user` 或 `PUID/PGID` 设置（见 10.2）。

### 7.4 安全设计

**认证模式**由环境变量 `AUTH_MODE` 控制：
- `single`（默认）：单管理员。首次启动时使用 `ADMIN_PASSWORD` 创建账号，也可以在首次访问时通过初始化页面设置。
- `multi`：多用户。任务、项目按用户隔离，服务实例和监控目录只有管理员可以管理。
- `none`：关闭认证，仅适用于只在可信内网访问的场景。启用时日志会给出醒目警告。

**会话。** 使用 httpOnly、SameSite=Lax 的签名 Cookie。登录接口有失败次数限制，防止暴力破解。

**密钥保护：**
- 服务实例中的 secret 字段使用 AES-256-GCM 加密后入库，主密钥来自环境变量 `APP_SECRET`。
- 接口永远不返回明文密钥。
- 日志中会自动脱敏 Authorization 头和密钥字段。

**SSRF 防护。** 服务实例的请求地址由用户填写，服务器可能被诱导去访问内网地址。因此，多用户模式下只有管理员可以创建或修改服务实例。

**上传安全。** 限制文件大小和扩展名，文件名做规范化处理；文件内容只按文本解析，不执行任何内容。

**传输安全。** 服务本身只监听 HTTP，对外暴露时必须经过反向代理启用 HTTPS。

### 7.5 文件保留与清理

上传的原文件和生成的译文默认保留 30 天（`FILE_RETENTION_DAYS`），每天清理一次过期文件。数据库中的任务记录和用量统计会保留，只是显示“文件已清理”。监控目录模式写回媒体库的文件不受这项清理影响。

### 7.6 网络与代理

服务器访问海外模型接口时常常需要代理，支持两种方式：

1. **全局代理。** 设置 `HTTPS_PROXY`（和 `NO_PROXY`）环境变量。服务启动时会用 undici 的 `EnvHttpProxyAgent` 作为全局 dispatcher，因此对所有出站请求生效。
2. **实例代理。** 在单个服务实例中填写代理地址，只对该实例生效。例如海外服务走代理，国内模型和本地 Ollama 直连。

---

## 8. 前端设计

### 8.1 motion-primitives 是什么，适合承担什么角色

motion-primitives（github.com/ibelick/motion-primitives，MIT 许可证）是一套**动效组件**库，目前约 33 个组件，基于 Motion（原 framer-motion）和 Tailwind CSS 构建。

它的分发方式与 shadcn/ui 相同：没有需要安装的 npm 包，而是通过 shadcn CLI 把组件源码复制到你的项目里。依赖只有四样：`motion`、Tailwind CSS、`lucide-react`，以及工具函数 `cn()`（位于 `lib/utils.ts`）。

它的组件主要分三类：
- **文字动效**：TextEffect、TextShimmer、TextScramble、TextMorph、TextLoop 等。
- **数字动效**：AnimatedNumber、SlidingNumber。
- **交互容器**：MorphingDialog、TransitionPanel、AnimatedBackground、Disclosure、Toolbar 等。

它**不包含**业务界面最基本的构件：表格、输入框、下拉选择、表单校验、Toast 提示、分页等。因此前端采用两层组合：

| 层 | 选型 | 负责 |
|---|---|---|
| 基础组件层 | shadcn/ui（Radix UI） | 按钮、输入框、选择器、表单、表格、标签页、Toast、确认对话框等，保证可访问性（键盘操作、焦点管理、读屏） |
| 动效层 | motion-primitives | 状态反馈、进度数字、页面与面板切换、详情展开、浮动工具栏等，负责“动起来”的部分 |

这两者属于同一个生态：分发机制、`components.json` 配置、`cn()` 工具函数、Tailwind v4 主题变量都通用。motion-primitives 自己的文档站就是用 shadcn 配置搭建的，所以放在一起不会有风格冲突。

需要注意，motion-primitives 仍标注为 beta 阶段，组件可能会有较大改动。好在它采用复制源码的方式，组件一旦加入项目就归你所有，上游改动不会影响已有代码，需要时再手动同步即可。

### 8.2 前端技术栈

| 部分 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite | 产出纯静态文件，由 Fastify 直接提供，与后端同一个容器部署 |
| 框架 | React 19 + TypeScript | motion-primitives 组件带有 `'use client'` 指令，这是为 Next.js 准备的，在 Vite 中会被忽略，不影响使用 |
| 路由 | TanStack Router | 路由参数有类型约束，与 TanStack Query 配合顺手 |
| 数据请求 | TanStack Query | 缓存与重新拉取；SSE 事件到达时直接更新查询缓存 |
| 长列表 | TanStack Virtual | 校对页需要流畅显示上千条字幕 |
| 样式 | Tailwind CSS v4 | motion-primitives 与 shadcn/ui 的共同基础 |
| 基础组件 | shadcn/ui | 复制源码到 `src/components/ui/` |
| 动效组件 | motion-primitives + `motion` | 复制源码到 `src/components/motion/` |
| 图标 | lucide-react | 两个组件库共用 |
| 表单 | react-hook-form + zod | 复用 `packages/shared` 中与后端一致的 schema；服务设置表单由 `configSchema` 动态生成 |
| 主题 | 自行实现浅色/深色切换 | 不需要 next-themes；通过 `class="dark"` 切换 |

**为什么不用 Next.js。** motion-primitives 的文档站虽然用 Next.js 搭建，但这个项目不需要它：
- 这是一个需要登录的工具型应用，没有 SEO 和服务端渲染的需求；
- 后端已经是 Fastify，Vite 构建出的静态文件由它直接提供，整个服务保持单进程、单容器；
- 如果改用 Next.js，就要多运行一个 Node 服务，还得处理两个服务之间的路由和认证。

### 8.3 集成方式

**初始化：**

```bash
cd apps/web
pnpm create vite@latest . --template react-ts
pnpm add tailwindcss @tailwindcss/vite motion lucide-react clsx tailwind-merge
npx shadcn@latest init          # 生成 components.json 和 src/lib/utils.ts（含 cn）
```

**`components.json` 要点。** Vite 项目需要调整两处：
- 设置 `rsc: false`；
- CSS 路径指向 `src/index.css`。

**路径别名。** 在 `vite.config.ts` 和 `tsconfig.json` 中把 `@/` 映射到 `src/`，因为 motion-primitives 组件内部是通过 `@/lib/utils`、`@/hooks/...` 来引用依赖的。

**添加组件：**

```bash
# shadcn/ui 基础组件
npx shadcn@latest add button input select table tabs form sonner alert-dialog badge progress tooltip

# motion-primitives 动效组件（放到独立目录，避免与 shadcn 同名组件冲突）
npx shadcn@latest add "https://motion-primitives.com/c/text-shimmer.json"   --path src/components/motion
npx shadcn@latest add "https://motion-primitives.com/c/animated-number.json" --path src/components/motion
npx shadcn@latest add "https://motion-primitives.com/c/morphing-dialog.json" --path src/components/motion
# ……其余组件同理
```

**注意同名冲突。** motion-primitives 的组件在注册表中的类型是 `registry:ui`，默认会被放进和 shadcn 相同的 `components/ui/` 目录。而两者都有 `dialog`、`accordion`、`carousel`，同名文件会互相覆盖。因此规定：

- motion-primitives 一律安装到 `src/components/motion/`；
- 表单、确认对话框等需要完整可访问性的场景，一律使用 shadcn 的 Dialog / AlertDialog；
- motion-primitives 的 Dialog 和 Accordion 不引入，只使用 MorphingDialog、Disclosure 这类 shadcn 没有的组件。

**同步与许可。** 在 `src/components/motion/README.md` 中记录每个组件的来源和复制时的上游提交号，方便日后同步，同时保留 MIT 许可声明。

### 8.4 动效使用原则

SubFerry 是工具型应用，用户的注意力在字幕内容上。动效的作用是**反馈状态**和**说明变化**，而不是装饰。具体约定如下：

1. **动效不能拖慢操作。** 常规过渡控制在 150 到 300 毫秒之间。任何操作都不等动画结束后才能执行，动画进行中也允许用户继续点击。
2. **尊重系统的“减少动态效果”设置。** 在应用根部使用 `<MotionConfig reducedMotion="user">`。用户在系统中开启“减少动态效果”后，位移和缩放动画会自动关闭，只保留透明度变化。设置页也提供一个手动开关。
3. **长列表不做逐行动画。** 校对页的虚拟列表在滚动时会不断复用行元素，如果给每行加进场动画，既耗性能，又会在滚动时乱闪。动效只用于状态单元格和刚刚发生变化的行。
4. **高频更新要节流。** SSE 进度事件可能很密集。动画数字的更新最多每秒 4 次，否则数字会一直处于滚动状态，反而看不清。
5. **每个动效只表达一个含义。** 例如 TextShimmer 在全站只表示“正在进行中”，不在其他地方用于装饰，这样用户看到它就知道任务在运行。

### 8.5 组件使用映射

| motion-primitives 组件 | 用在哪里 | 表达的含义 |
|---|---|---|
| **TextShimmer** | 任务状态文字“翻译中”“解析中”“审校中” | 正在进行中（全站唯一用法） |
| **AnimatedNumber** | 进度百分比、已完成条目数、token 用量、预估费用 | 数值随 SSE 事件平滑变化 |
| **SlidingNumber** | 任务列表顶部的统计：运行中、排队中、待校对的任务数 | 计数变化 |
| **BorderTrail** | 运行中任务卡片的边框流光 | 与静止的已完成卡片区分开，扫一眼就能找到活动任务 |
| **AnimatedBackground** | 顶部导航的选中高亮；校对页筛选分段控件（全部 / 有问题 / 失败 / 已编辑 / 审校修改） | 当前选中项，高亮块在选项之间滑动 |
| **TransitionPanel** | 新建任务向导的三步切换（上传文件 → 选择项目与方案 → 确认估算）；服务设置页不同服务类型的表单切换 | 步骤前进或后退的方向感 |
| **AnimatedGroup** | 上传后的文件列表逐个出现；任务列表首次加载 | 新内容进入 |
| **MorphingDialog** | 任务卡片点击后展开为详情浮层；术语条目点击后展开为编辑卡片 | 详情从原位置展开，用户清楚它来自哪一项 |
| **Disclosure** | 新建任务中的“高级参数”；任务详情中的批次日志；服务设置中的提示词模板 | 次要信息默认收起 |
| **TextMorph** | 状态型按钮：“开始翻译 → 暂停 → 继续”、“复制 → 已复制”、“测试连接 → 连接成功” | 按钮文字随状态变化，按钮本身不跳动 |
| **ToolbarExpandable** | 校对页底部浮动工具栏：选中条目后展开“重译所选 / 接受审校修改 / 查找替换” | 可用操作随选择而出现 |
| **TextScramble** | 登录页标题“字渡”；校对页中当前可见的行在收到新译文时，从乱码“解码”为中文（只播放一次） | 呼应“翻译”的产品主题，控制在这两处使用 |
| **GlowEffect** | 上传区域在文件拖入时发光 | 可以在这里放下文件 |
| **ScrollProgress** | 校对页顶部细进度条 | 在全片中的阅读位置 |
| **TextEffect** | 空状态提示（例如“还没有任务，拖入字幕文件开始”） | 首次使用时的引导 |

**不使用的组件**：Tilt、Magnetic、Cursor、Dock、Carousel、InfiniteSlider、SpinningText、ImageComparison、ProgressiveBlur 等。它们偏展示和营销用途，放在工具型界面里会分散注意力。

### 8.6 页面设计

| 页面 | 内容与动效要点 |
|---|---|
| 登录 / 初始化 | 首次访问时设置管理员密码。标题使用 TextScramble，这是全站唯一一处展示性动效 |
| 任务列表 | 卡片或表格两种视图；顶部 SlidingNumber 统计；运行中卡片带 BorderTrail，状态文字用 TextShimmer，进度用 AnimatedNumber；点击卡片通过 MorphingDialog 展开详情 |
| 新建任务 | TransitionPanel 三步向导；拖入文件时 GlowEffect 高亮；文件列表用 AnimatedGroup；高级参数放在 Disclosure 中；最后一步用 AnimatedNumber 显示请求次数和 token 估算 |
| 任务详情 | 编码与语言检测结果（可修改后重新解析）、进度、下载按钮；批次日志放在 Disclosure 中；错误信息用 shadcn 的 Alert 显示 |
| 术语表 | 按项目管理；影片简介与人物关系；条目用 MorphingDialog 展开编辑；待确认术语的任务在页面顶部给出提示条和“确认并继续”按钮 |
| 对照校对 | 虚拟滚动表格：时间（只读）、原文、译文（可直接编辑）；AnimatedBackground 分段筛选；多选后出现 ToolbarExpandable；顶部 ScrollProgress；按问题类型用颜色标记（失败、占位符异常、阅读速度过快、审校修改） |
| 服务设置 | 服务实例列表，支持拖动排序（决定故障切换顺序）；表单由 `configSchema` 动态生成；密钥输入框只显示脱敏值；测试连接按钮使用 TextMorph（仅管理员可见） |
| 翻译方案 | 管理预设：服务切换链、模式、输出、是否自动确认术语和跳过校对 |
| 监控目录 | 规则管理、手动扫描、最近发现与处理记录（仅管理员可见） |
| 系统设置 | 全局参数、API Token（创建后只显示一次，复制按钮使用 TextMorph）、用户管理、界面主题与“减少动效”开关 |

### 8.7 实时进度的数据流

1. 页面订阅 `GET /api/jobs/:id/events`（任务列表页订阅汇总流 `GET /api/events`）。
2. 收到事件后，调用 `queryClient.setQueryData` 更新对应任务的缓存，不重新请求接口。
3. 进度数值经过 250 毫秒节流后交给 AnimatedNumber，状态变化触发 TextShimmer 与 BorderTrail 的出现或消失。
4. 连接断开时，浏览器的 EventSource 会自动重连；重连成功后主动拉取一次任务详情，补齐断线期间错过的状态。
5. 校对页收到“某批完成”事件后，只对当前可见区域内受影响的行播放 TextScramble，其余行静默更新数据。

### 8.8 前端目录结构

```
apps/web/
├─ components.json                 # shadcn 配置（rsc: false）
├─ vite.config.ts                  # @ 别名；开发时把 /api 代理到 http://localhost:8080
└─ src/
   ├─ main.tsx                     # MotionConfig reducedMotion="user"、QueryClientProvider、Router
   ├─ index.css                    # Tailwind v4 与主题变量（浅色/深色）
   ├─ lib/
   │  ├─ utils.ts                  # cn()，两套组件共用
   │  ├─ api.ts                    # 基于 fetch 的 API 客户端，类型来自 packages/shared
   │  └─ sse.ts                    # EventSource 封装：重连、节流、写入 Query 缓存
   ├─ hooks/                       # useClickOutside 等（motion-primitives 依赖）
   ├─ components/
   │  ├─ ui/                       # shadcn/ui 基础组件
   │  ├─ motion/                   # motion-primitives 动效组件 + README（来源与上游提交号）
   │  └─ app/                      # 业务组件：JobCard、CueTable、GlossaryEditor、SchemaForm、DropZone …
   └─ routes/                      # login  jobs  jobs.$id  jobs.new  review.$id  glossary  services  profiles  watch  settings
```

---

## 9. 项目目录结构

```
subferry/
├─ packages/
│  ├─ core/                          # 翻译核心，与桌面版相同
│  │  ├─ src/subtitle/               # model  srt  vtt  ass  writer
│  │  ├─ src/preprocess/             # tags  linebreak  filters
│  │  ├─ src/services/               # 借鉴 pot：index（注册表） types  instance
│  │  │  ├─ openai/  anthropic/  gemini/  ollama/  deepl/  generic-http/
│  │  │  └─ adapters/single-to-batch.ts
│  │  ├─ src/pipeline/               # chunker  context  runner  validator  retry  glossary  review
│  │  ├─ src/postprocess/            # zh-rules  reflow  cps  opencc  bilingual
│  │  ├─ src/prompts/
│  │  └─ test/
│  └─ shared/                        # zod schema 与 API 类型，前后端共用
├─ apps/
│  ├─ server/                        # Fastify
│  │  ├─ src/routes/                 # auth  services  profiles  projects  jobs  cues  events  watch  tokens  health
│  │  ├─ src/worker/                 # scheduler  job-runner  limiter  recovery  events-bus
│  │  ├─ src/watch/                  # scanner  fingerprint
│  │  ├─ src/io/                     # encoding  storage  cleanup
│  │  ├─ src/security/               # crypto（AES-GCM） auth  redact
│  │  ├─ src/net/                    # undici dispatcher 与代理
│  │  └─ src/db/                     # drizzle schema  migrations
│  ├─ web/                           # React + Vite + shadcn/ui + motion-primitives（结构见 8.8）
│  └─ cli/                           # 可选：本地命令行，直接调用 core
├─ deploy/
│  ├─ Dockerfile
│  ├─ docker-compose.yml
│  ├─ Caddyfile.example
│  ├─ nginx.conf.example
│  └─ subferry.service               # systemd 部署方式
└─ package.json                      # pnpm workspace
```

---

## 10. 部署方案

### 10.1 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 8080 | 监听端口 |
| `DATA_DIR` | /data | 数据库与文件目录 |
| `APP_SECRET` | 无，**必填** | 32 字节以上随机串，用于加密密钥和签名会话。丢失后已保存的 API Key 无法解密 |
| `AUTH_MODE` | single | single / multi / none |
| `ADMIN_PASSWORD` | 空 | 为空时首次访问进入初始化页面 |
| `BASE_URL` | 空 | 对外访问地址，用于生成下载链接和 Cookie 设置 |
| `MAX_ACTIVE_JOBS` | 2 | 同时执行的任务数 |
| `FILE_RETENTION_DAYS` | 30 | 上传与输出文件保留天数，0 表示永久保留 |
| `HTTPS_PROXY` / `NO_PROXY` | 空 | 全局出站代理 |
| `WATCH_ROOTS` | 空 | 允许配置为监控目录的根路径白名单，逗号分隔 |
| `LOG_LEVEL` | info | 日志级别 |
| `TZ` | UTC | 时区，例如 Asia/Shanghai |

生成 `APP_SECRET` 的方法：`openssl rand -base64 48`

### 10.2 Docker Compose（推荐）

```yaml
services:
  subferry:
    image: subferry:latest
    build: .
    container_name: subferry
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"        # 只监听本机，由反向代理对外
    environment:
      APP_SECRET: "请替换为随机字符串"
      ADMIN_PASSWORD: "请替换"
      TZ: Asia/Shanghai
      BASE_URL: https://sub.example.com
      WATCH_ROOTS: /media
      # HTTPS_PROXY: http://172.17.0.1:7890
      # NO_PROXY: localhost,127.0.0.1,ollama
    volumes:
      - ./data:/data
      - /srv/media:/media              # 可选：媒体库，用于监控目录
    user: "1000:1000"                  # 与媒体文件属主一致，才能写回字幕
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

如果要使用本地模型，可以在同一个 compose 文件中增加 `ollama` 服务，然后在 SubFerry 中把 Ollama 实例的地址填为 `http://ollama:11434`。

### 10.3 Dockerfile（多阶段构建）

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm -r build \
 && pnpm --filter server deploy --prod /out

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
COPY --from=build /out ./
COPY --from=build /app/apps/web/dist ./public
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
```

说明：`better-sqlite3` 是原生模块，通常可以直接下载预编译二进制。如果目标架构没有预编译包（例如某些 ARM 设备），需要在构建阶段安装 `python3`、`make`、`g++`。

### 10.4 反向代理

**Caddy**（最简单，自动申请 HTTPS 证书，并能正确转发 SSE）：

```
sub.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

**Nginx：**

```nginx
server {
    listen 443 ssl http2;
    server_name sub.example.com;
    # ssl_certificate ...; ssl_certificate_key ...;

    client_max_body_size 50m;          # 允许一次上传多个字幕

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 1h;         # SSE 长连接
    }
}
```

服务端在 SSE 响应中会带上 `X-Accel-Buffering: no` 头，Nginx 看到后会自动关闭该响应的缓冲，因此不需要为 SSE 单独写 location。服务端还会每 15 秒发送一次心跳注释，防止中间设备断开空闲连接。

### 10.5 不使用 Docker（systemd）

在服务器上安装 Node.js LTS，构建后放到 `/opt/subferry`，然后创建 `/etc/systemd/system/subferry.service`：

```ini
[Unit]
Description=SubFerry subtitle translation service
After=network-online.target

[Service]
User=subferry
WorkingDirectory=/opt/subferry
EnvironmentFile=/etc/subferry.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

### 10.6 备份与升级

**备份**只需要备份 `/data` 目录和 `APP_SECRET`。数据库在 WAL 模式下，建议用 SQLite 的在线备份命令导出一致性快照，而不是在运行中直接复制文件。

**升级**时直接拉取新镜像并重启即可。数据库迁移会在启动时自动执行，执行前会在 `/data/backups/` 自动备份一份数据库。

---

## 11. 主要配置项（翻译方案与全局设置）

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `batchSize` | 40 | 每批条目数，实际在 20 到 60 条之间调整 |
| `contextBefore` / `contextAfter` | 5 / 3 | 上下文条数 |
| `mode` | standard | standard（并行）/ fine（顺序精翻） |
| `maxRetries` | 2 | 整批重试次数 |
| `temperature` | 0.3 | 模型温度 |
| `maxCharsPerLine` | 16 | 中文每行字数上限 |
| `maxCharsPerSecond` | 9 | 阅读速度告警阈值 |
| `outputMode` | zh | zh / zh-top / src-top |
| `outputName` | `{name}.zh.{ext}` | 输出命名模板 |
| `outputEncoding` | utf-8-bom | 输出编码 |
| `glossary.autoExtract` / `autoConfirm` | true / false | 术语提取与自动确认 |
| `review.enabled` | false | 审校轮 |
| `skipReview` | false | 翻译完成后跳过待校对，直接完成 |
| `skipStyles` | [] | ASS 中不翻译的样式 |
| 服务实例 `rpm` / `maxConcurrency` | 60 / 3 | 全局限流，所有任务共享 |

---

## 12. 测试策略

**无损往返测试。** 使用各种格式和编码的真实样本，验证“解析 → 写出”的结果逐字节一致；翻译后时间行与样式行也逐字节一致。

**故障注入测试。** 编写一个模拟服务，随机制造漏 id、合并条目、空值、占位符丢失、非 JSON、拒答、429、超时等情况，验证每个任务最终都能结束，且每个条目要么合格，要么被明确标记。

**服务端集成测试：**
- 用 Fastify 的 `inject` 测试 API 与权限；
- 模拟服务在任务中途重启，验证能从断点继续；
- 多个任务共用同一服务实例时，验证限流器不会超出配置；
- 验证 SIGTERM 时的优雅退出。

**安全测试：**
- 监控目录的路径穿越；
- 非管理员修改服务实例；
- 接口响应和日志中是否泄露密钥。

**端到端测试。** 用 Playwright 覆盖上传、确认术语、校对、下载的完整流程。另外在开启 `prefers-reduced-motion` 的条件下再跑一遍，确认关闭动效后所有功能正常，且不存在“要等动画结束才能操作”的情况。

**前端性能检查。** 在校对页加载 2000 条字幕，并模拟每秒多次的 SSE 更新，确认滚动流畅、动画数字不抖动。

**效果评估。** 准备几段有人工中文字幕的韩语、意大利语片段作为参考。每次修改提示词或更换模型后重新跑一遍，对比结果。

---

## 13. 迭代计划

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| **M1 最小可用** | SRT 无损解析；编码检测；OpenAI 兼容服务（批量 + JSON）；校验、部分接受与重试；Fastify 服务端（上传、任务、SSE、下载）；单管理员认证；密钥加密；前端骨架（Vite + Tailwind v4 + shadcn/ui 初始化，接入 TextShimmer、AnimatedNumber 两个动效组件）与上传、进度、下载三个页面；Docker 镜像 | 在服务器上用 `docker compose up` 启动，网页上传一部韩语电影的 SRT，稳定得到时间轴一致、无漏行的中文字幕 |
| **M2 实用版** | ASS、VTT 与标签保护；项目与术语表；后处理；双语输出；对照校对页；断点续传与启动恢复；翻译方案；全局限流；代理支持；API Token 与 REST API | 日常使用完全靠网页即可完成，脚本也能调用；8.5 中的动效组件全部接入 |
| **M3 完善版** | Claude、Gemini、Ollama、DeepL、通用 HTTP 服务；故障切换链；精翻模式；审校轮；监控目录；文件保留清理；多用户模式；项目打包下载 | 与 Jellyfin 等媒体服务器配合，新入库的外语字幕自动生成中文字幕 |
| **M4 扩展（可选）** | 用 ffmpeg 提取 MKV 内封字幕；接入独立部署的 Whisper 服务（如 faster-whisper 容器，有 GPU 更佳），从音轨生成原文字幕 | 没有外挂字幕的影片也能走通流程 |

---

## 14. 风险与对策

| 风险 | 表现 | 对策 |
|---|---|---|
| 模型输出不稳定 | 漏行、合并、格式错乱 | id 键 JSON 协议、逐级降级重试、部分接受、失败条目集中处理 |
| 内容审核拒答 | 暴力、色情、粗口对白被拒绝 | 拒答检测，自动切换备用实例（如本地 Ollama） |
| 服务器访问海外接口受阻 | 请求超时或连接失败 | 全局代理或实例代理；也可以改用国内模型或本地模型 |
| 多任务触发速率限制 | 大量 429 | 按服务实例的全局限流器；遵守 Retry-After |
| 服务暴露公网被滥用 | API Key 被盗用、产生费用 | 默认必须登录；只允许 HTTPS 访问；登录限速；密钥加密且不回显 |
| SSRF | 自定义服务地址被用于探测内网 | 仅管理员可配置服务实例 |
| 路径穿越 | 监控目录规则访问到不该访问的文件 | `WATCH_ROOTS` 白名单 + 真实路径校验 |
| 服务重启中断任务 | 进度丢失或重复计费 | 逐批落库、启动恢复、优雅退出 |
| `APP_SECRET` 丢失 | 已保存的 API Key 无法解密 | 部署文档明确提示随数据一起备份；丢失后需重新填写各实例密钥 |
| 媒体目录权限 | 无法写回字幕 | compose 中设置与媒体文件属主一致的 `user` |
| 编码误判 | 乱码 | 任务详情页可指定编码后重新解析 |
| motion-primitives 处于 beta | 上游组件改名或行为变化 | 源码复制进项目，版本由自己掌控；记录上游提交号，按需手动同步 |
| 组件同名覆盖 | shadcn 与 motion-primitives 的 dialog 等文件互相覆盖 | motion-primitives 统一安装到 `src/components/motion/` |
| 动效影响可用性 | 动画过多、晕动不适、低性能设备卡顿 | 遵循 8.4 的原则；支持“减少动态效果”；长列表不做逐行动画 |
| 许可证 | 复制 pot 代码带来 GPL 义务 | 见 2.4 |
