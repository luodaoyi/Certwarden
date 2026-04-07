# 部署说明

## 1Panel

第一版部署方式为 **Compose 导入**：

1. 在 1Panel 中新建编排
2. 导入仓库根目录 `docker-compose.yml`
3. 按需修改环境变量
4. 启动服务

## 默认部署模式

- 默认数据库：SQLite
- 数据文件位置：`/data/certwarden.db`
- HTTP 服务端口：`8080`

如果你希望切换到 MySQL 或 PostgreSQL，只需将 `DB_DRIVER` 与 `DATABASE_URL` 调整为对应值，并确保目标数据库已可访问。
