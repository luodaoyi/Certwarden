# Certwarden

<p align="center">
  <a href="./README.md">English</a> · <a href="./README-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="docs/branding/certwarden-banner.svg" alt="Certwarden banner" />
</p>

<p align="center">
  <strong>面向团队、平台和托管场景的多租户 SSL/TLS 证书监控系统。</strong>
</p>

<p align="center">
  公开状态页 · 用户名优先认证 · Email / Telegram / Webhook · Go 协程池 · React 管理台
</p>

<p align="center">
  <a href="https://github.com/luodaoyi/Certwarden/releases/tag/v1.0.1"><img src="https://img.shields.io/github/v/release/luodaoyi/Certwarden?display_name=tag&style=flat-square" alt="Latest release" /></a>
  <a href="https://github.com/luodaoyi/Certwarden/releases/tag/v1.0.1"><img src="https://img.shields.io/github/release-date/luodaoyi/Certwarden?style=flat-square" alt="Release date" /></a>
  <a href="https://github.com/luodaoyi/Certwarden/actions/workflows/ci.yml"><img src="https://github.com/luodaoyi/Certwarden/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/luodaoyi/Certwarden/actions/workflows/docker.yml"><img src="https://github.com/luodaoyi/Certwarden/actions/workflows/docker.yml/badge.svg" alt="Docker" /></a>
  <a href="https://github.com/luodaoyi/Certwarden/pkgs/container/certwarden"><img src="https://img.shields.io/badge/container-ghcr.io%2Fluodaoyi%2Fcertwarden-2496ED?style=flat-square&logo=docker&logoColor=white" alt="GHCR image" /></a>
  <a href="https://github.com/luodaoyi/Certwarden/stargazers"><img src="https://img.shields.io/github/stars/luodaoyi/Certwarden?style=flat-square" alt="GitHub stars" /></a>
  <a href="https://github.com/luodaoyi/Certwarden/forks"><img src="https://img.shields.io/github/forks/luodaoyi/Certwarden?style=flat-square" alt="GitHub forks" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/luodaoyi/Certwarden?style=flat-square" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go" alt="Go 1.25" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111827" alt="React 19" />
  <img src="https://img.shields.io/badge/Tailwind-v4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=0f172a" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/Database-SQLite%20%7C%20MySQL%20%7C%20PostgreSQL-8b5cf6?style=flat-square" alt="SQLite MySQL PostgreSQL" />
</p>

<p align="center">
  <a href="#快速开始"><strong>快速开始</strong></a> ·
  <a href="https://github.com/luodaoyi/Certwarden/releases/tag/v1.0.1"><strong>版本发布</strong></a> ·
  <a href="https://github.com/luodaoyi/Certwarden/pkgs/container/certwarden"><strong>容器镜像</strong></a> ·
  <a href="./README.md"><strong>English README</strong></a>
</p>

---

## 项目简介

Certwarden 是一个自托管的 SSL/TLS 证书监控平台，面向多租户运维场景设计。它可以持续检测证书健康状态与有效期，记录历史结果，驱动告警通知，并为每个租户生成独立的公开状态页。

它适合这些团队和场景：

- 需要统一管理大量 HTTPS 域名证书的企业与运维团队
- 需要租户隔离的 SaaS / 托管平台
- 需要对外展示证书状态的客户状态页场景
- 希望用单个 `docker-compose.yml` 快速部署的自托管用户

## 为什么选择 Certwarden

| 监控 | 告警 | 展示 |
| --- | --- | --- |
| 检测证书到期时间、颁发机构、CN、SAN、指纹与有效期窗口。 | 通过 Email、Telegram、Webhook 发送租户级或域名级告警。 | 为每个租户生成独立公开状态页，并支持自定义标题与副标题。 |

| 调度 | 隔离 | 部署 |
| --- | --- | --- |
| 使用 Go 调度器与协程池执行定时检测。 | 在共享数据库中通过 `tenant_id` 隔离数据。 | 默认 SQLite，支持单文件 Compose 启动，也可切换 MySQL / PostgreSQL。 |

## 核心能力

- **多租户架构**：单库共享表 + `tenant_id` 隔离，账号即租户
- **用户名优先认证**：注册仅需用户名和密码，邮箱是可选绑定信息
- **丰富证书详情**：生效时间、到期时间、颁发机构、主题、CN、SAN、序列号、SHA-256 指纹、签名算法
- **目标 IP 指定检测**：可固定检测 IP，同时保留主机名作为 SNI
- **租户公开状态页**：每个租户自动拥有 `/status/{tenantId}` 页面
- **通知端点测试**：可在界面中直接测试 Email、Telegram、Webhook 是否可达
- **租户自定义 Telegram Bot**：每个 Telegram 端点可单独配置 Bot Token 与 Chat ID
- **管理员后台**：支持租户管理、禁用访问、删除租户、重置密码
- **多语言界面**：English、简体中文、繁體中文、Español、Français、Deutsch、Русский、العربية、Português、日本語、한국어、हिन्दी、Italiano

## 界面预览

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/login.png" alt="Certwarden 登录页" width="100%" />
      <br />
      <sub><strong>登录页</strong> —— 用户名优先认证入口，适合团队和平台统一接入。</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/dashboard.png" alt="Certwarden 租户后台" width="100%" />
      <br />
      <sub><strong>租户后台</strong> —— 在一个工作台中查看域名状态、到期窗口和完整证书详情。</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/public-status.png" alt="Certwarden 公开状态页" width="100%" />
      <br />
      <sub><strong>公开状态页</strong> —— 为租户生成独立状态页，并支持自定义标题与副标题。</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/admin.png" alt="Certwarden 管理后台" width="100%" />
      <br />
      <sub><strong>管理后台</strong> —— 统一管理租户、访问控制和密码重置等运维操作。</sub>
    </td>
  </tr>
</table>

## 快速上手路径

| 方式 | 适合场景 | 你需要做什么 |
| --- | --- | --- |
| Docker Compose | 快速自托管上线 | 复制 `.env.example`，执行 `docker compose up -d` |
| 1Panel | 面板化运维部署 | 直接导入仓库里的 Compose 文件，并在面板中填写环境变量 |
| 本地开发 | 功能开发与调试 | 分别启动 `apps/api` 与 `apps/web` |

## 文档导航

- [English README](./README.md)
- [简体中文 README](./README-CN.md)
- [v1.0.1 版本说明](https://github.com/luodaoyi/Certwarden/releases/tag/v1.0.1)
- [GHCR 容器镜像](https://github.com/luodaoyi/Certwarden/pkgs/container/certwarden)

## 系统架构

```mermaid
flowchart LR
    Browser["Web UI / Public Status"] --> API["Certwarden API"]
    API --> Auth["Auth & Session"]
    API --> Domains["Domain Management"]
    API --> Policies["Notification Policies"]
    API --> Admin["Admin Controls"]
    API --> Scheduler["Scheduler"]
    Scheduler --> Pool["Worker Pool"]
    Pool --> TLS["TLS Certificate Checker"]
    API --> DB["SQLite / MySQL / PostgreSQL"]
    Scheduler --> DB
    Policies --> Notify["Notifier"]
    Notify --> Email["Email"]
    Notify --> Telegram["Telegram"]
    Notify --> Webhook["Webhook"]
```

## 部署模型

```mermaid
flowchart LR
    Operator["运维人员 / 1Panel / Docker Compose"] --> Compose["docker-compose.yml"]
    Compose --> App["Certwarden 容器"]
    App --> UI["内置 React 前端"]
    App --> Core["Go API + 调度器 + 协程池"]
    Core --> SQLite["SQLite 数据卷（默认）"]
    Core -. 可选 .-> MySQL["MySQL"]
    Core -. 可选 .-> PostgreSQL["PostgreSQL"]
    Core --> Notify["Email / Telegram / Webhook"]
```

## 快速开始

### 使用 Docker Compose 部署

```bash
cp .env.example .env
docker compose up -d
```

如果你希望固定版本镜像：

```bash
CERTWARDEN_IMAGE=ghcr.io/luodaoyi/certwarden:v1.0.0
```

默认对外端口：

- `8080`：前端 + API

### 使用 1Panel 部署

Certwarden 第一版保持对 Compose 的直接兼容，因此可以直接把仓库内的 `docker-compose.yml` 导入 1Panel，而不需要额外制作应用市场包。

推荐流程：

1. 导入 `docker-compose.yml`
2. 参考 `.env.example` 补齐环境变量
3. 设置 `APP_BASE_URL`、数据库参数和初始化管理员账号
4. 在 1Panel 内启动服务

### 本地开发

```bash
cp .env.example .env
```

后端：

```bash
cd apps/api
go run ./cmd/server
```

前端：

```bash
cd apps/web
npm install
npm run dev
```

## 默认初始化管理员

示例环境变量会默认初始化一个超级管理员：

- 用户名：`admin`
- 密码：`admin`

生产环境部署前请务必修改。

## 关键环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `CERTWARDEN_IMAGE` | Compose 使用的镜像地址 | `ghcr.io/luodaoyi/certwarden:latest` |
| `APP_ADDR` | HTTP 监听地址 | `:8080` |
| `APP_BASE_URL` | 对外访问地址 | `http://localhost:8080` |
| `DB_DRIVER` | 数据库驱动 | `sqlite` |
| `DATABASE_URL` | 数据库连接串或文件路径 | `data/certwarden.db` |
| `ALLOW_REGISTRATION` | 是否允许公开注册 | `true` |
| `BOOTSTRAP_ADMIN_USERNAME` | 初始管理员用户名 | `admin` |
| `BOOTSTRAP_ADMIN_EMAIL` | 初始管理员联系邮箱 | 空 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 初始管理员密码 | `admin` |
| `SCAN_CONCURRENCY` | 检测协程池大小 | `5` |
| `SCAN_INTERVAL` | 调度器扫描周期 | `1h` |
| `SMTP_*` | SMTP 配置 | 空 |
| `TELEGRAM_BOT_TOKEN` | 可选全局 Telegram Token | 空 |
| `WEBHOOK_TIMEOUT` | Webhook 超时 | `5s` |

## 仓库结构

```text
.
├─ apps/
│  ├─ api/     # Go API + scheduler + worker pool
│  └─ web/     # React + Vite + Tailwind 前端
├─ docs/
│  ├─ branding/
│  └─ screenshots/
├─ deploy/
├─ .github/workflows/
├─ docker-compose.yml
└─ Dockerfile
```

## 许可证

本项目使用 [MIT License](./LICENSE)。
