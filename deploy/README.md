# 部署说明（M1）

## 状态说明

本目录下的 `Dockerfile`、`docker-compose.yml` 已经过以下验证：

- **未验证**：完整的 `docker build` / `docker compose up`。开发这份代码的环境没有安装 Docker，
  无法在本地实际构建镜像或启动容器，**请在具备 Docker 的机器上执行后自行核对**。
- **已验证**（在不依赖 Docker 的前提下等价核实过）：
  - `pnpm --filter @subferry/server deploy --prod <dir>` 能正确产出一个独立可运行的目录
    （包含 `dist/`、精简后的生产依赖，`@subferry/core`/`@subferry/shared` 以真实文件而非软链
    接的形式打包进去），用 `node dist/index.js` 直接跑通了健康检查。这是 Dockerfile 构建阶段
    的核心步骤，Dockerfile 里的其余部分（多阶段 COPY、非 root 用户、`/data` 卷）是标准写法。
  - `apps/web` 的构建产物（`vite build` 输出）复制到 `public/` 后，由 Fastify（`app.ts` 里的
    `@fastify/static` 注册逻辑）正确地把首页、SPA 客户端路由（如 `/jobs/new`）、静态资源都
    服务出来了，`/api/*` 未匹配路由时仍然返回 JSON 404 而不是 `index.html`。

## 部署步骤（Docker，推荐）

```bash
cd deploy
cp docker-compose.yml docker-compose.local.yml   # 可选，便于本地修改不影响仓库文件
# 编辑 docker-compose.yml：替换 APP_SECRET、ADMIN_PASSWORD、BASE_URL
docker compose up --build -d
docker compose logs -f
curl http://127.0.0.1:8080/api/health
```

请核对：
1. 镜像构建成功，容器启动后 `docker compose ps` 健康检查为 healthy。
2. 浏览器访问反代后的地址（先配置好 `Caddyfile.example` 或 `nginx.conf.example`），能看到登录/初始化页面。
3. `./data` 目录下出现 `subferry.db`（SQLite WAL 模式下还会有 `-wal`/`-shm` 文件）。
4. `docker compose stop` 时，容器能在 20 秒内正常退出（对应 `Scheduler.shutdown` 的优雅退出逻辑）。

## 不使用 Docker（systemd）

```bash
pnpm install --frozen-lockfile
pnpm --filter @subferry/shared --filter @subferry/core --filter @subferry/server --filter @subferry/web build
pnpm --filter @subferry/server deploy --prod /opt/subferry
cp -r apps/web/dist /opt/subferry/public
sudo cp deploy/subferry.service /etc/systemd/system/
sudo useradd -r -s /usr/sbin/nologin subferry || true
sudo mkdir -p /opt/subferry/data && sudo chown -R subferry:subferry /opt/subferry
# 编辑 /etc/subferry.env（PORT/DATA_DIR/APP_SECRET/ADMIN_PASSWORD/...，见根目录 .env.example）
sudo systemctl daemon-reload
sudo systemctl enable --now subferry
```

## 环境变量

见根目录 `.env.example`。`APP_SECRET` 是必填项，生成方法：`openssl rand -base64 48`；
丢失后已保存的服务实例密钥将无法解密，需要重新填写。
