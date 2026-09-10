# 监控目录模式（M3）

对应 readme.md 7.3。M1 不实现：扫描器（scanner.ts，用 chokidar 监控媒体库目录）、
文件指纹去重（fingerprint.ts）、`watch_rules` 表和相关路由都留到 M3 一起做。
