# go-check-ssl

一个基于 **Go + React + Tailwind** 的多租户 SSL 证书过期检测平台。

## 功能概览

- 用户注册、登录、邮箱验证、忘记密码/重置密码
- 域名管理与手动/自动证书检测
- 通知渠道：Email、Telegram、Generic Webhook
- 用户默认通知策略 + 域名级覆盖
- 管理员可控制是否开放注册，并代管用户域名与通知配置
- 默认 SQLite，一键切换 MySQL / PostgreSQL
- 单 `docker-compose.yml` 部署，适配 1Panel Compose 导入

## 仓库结构

```text
.
├─ apps/
│  ├─ api/     # Go API + scheduler + worker pool
│  └─ web/     # React + Vite + Tailwind + shadcn 风格 UI
├─ deploy/     # 部署说明与示例
├─ .github/
│  └─ workflows/
├─ docker-compose.yml
└─ Dockerfile
```

## 本地开发

1. 复制环境变量：

   ```bash
   cp .env.example .env
   ```

2. 启动后端：

   ```bash
   cd apps/api
   go run ./cmd/server
   ```

3. 启动前端：

   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

## 验证命令

```bash
make api-test
make web-test
make lint
make build
```

## Docker Compose

默认使用 SQLite：

```bash
docker compose up --build
```

应用会监听 `8080` 端口，并在存在前端产物时同时提供静态站点服务。


## SQLite 说明

当前 Go 后端通过 GORM 的 SQLite 驱动提供默认 SQLite 支持。
在本地直接运行 Go 测试或构建时，如果你的环境关闭了 CGO，SQLite 相关测试可能需要启用带 C toolchain 的 Go 环境；Docker 构建已在镜像内补齐所需编译工具。
