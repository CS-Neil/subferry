# 出站代理（M2/M3）

对应 readme.md 7.6：全局代理（`HTTPS_PROXY`/`NO_PROXY`，用 undici 的 `EnvHttpProxyAgent`
作为全局 dispatcher）与单实例代理。M1 直接使用 `@subferry/core` 的 `defaultHttpClient`
（全局 `fetch`，不经代理），出站请求走服务器的默认网络路径。海外接口访问受阻是 readme.md
14 章列出的已知风险，M1 的对策是"可以先用国内模型或本地 Ollama"，全局代理支持留到 M2 实现。
