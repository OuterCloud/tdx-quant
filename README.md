# tdx-quant

他都行量化选股系统 — 基于 FastAPI + React 的全栈量化分析平台。

## 技术栈

- **后端**: Python 3.13 / FastAPI / SQLAlchemy 2.0 (async) / Polars / PostgreSQL 16 / Redis 7
- **前端**: React 19 / TypeScript / Vite / Tailwind CSS v4 / Shadcn/ui
- **工具链**: uv / pnpm / Ruff / Biome / Docker Compose

## 生产部署

服务器只需安装 Docker，无需 Node.js、Python 等运行时。

```bash
# 克隆代码
git clone <your-repo-url> tdx-quant && cd tdx-quant

# 一键部署（自动检测环境 → 生成配置 → 构建镜像 → 启动服务 → 数据库迁移）
chmod +x deploy.sh
./deploy.sh
```

部署完成后通过 `http://<服务器IP>` 访问（默认 80 端口，可在 `.env` 中修改 `HTTP_PORT`）。

### 部署管理命令

```bash
./deploy.sh              # 首次部署
./deploy.sh update       # 代码更新后重新构建部署
./deploy.sh status       # 查看服务状态
./deploy.sh logs         # 查看全部日志
./deploy.sh logs backend # 查看后端日志
./deploy.sh stop         # 停止服务
./deploy.sh clean        # 停止并清除所有数据（慎用）
```

## 本地开发

### 前置条件

- Python 3.13+
- Node.js 22+ & pnpm 11+
- Docker & Docker Compose
- uv (`pip install uv`)

### 启动开发环境

```bash
# 1. 启动数据库服务
make dev-services

# 2. 启动后端（新终端）
make backend

# 3. 启动前端（新终端）
make frontend
```

### 服务管理（service.sh）

也可以通过 `service.sh` 一键管理所有服务：

```bash
./service.sh start              # 启动全部（基础设施 + 后端 + 前端）
./service.sh stop               # 停止全部
./service.sh restart            # 重启全部
./service.sh restart backend    # 仅重启后端
./service.sh restart frontend   # 仅重启前端
./service.sh status             # 查看服务状态
./service.sh logs backend       # 查看后端日志
```

### 访问

- 前端: http://localhost:5173
- 后端 API 文档: http://localhost:8001/docs
- 健康检查: http://localhost:8001/api/health

## 项目结构

```
tdx-quant/
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── api/          # 路由
│   │   ├── core/         # 配置、数据库、Redis
│   │   ├── models/       # SQLAlchemy 模型
│   │   └── schemas/      # Pydantic schemas
│   ├── alembic/          # 数据库迁移
│   └── Dockerfile
├── frontend/             # React 前端
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── api/
│   └── Dockerfile
├── docker-compose.yaml       # 开发编排（旧）
├── docker-compose.dev.yaml   # 开发基础设施（Postgres + Redis）
├── docker-compose.prod.yaml  # 生产编排（全栈容器化）
├── nginx.conf                # 反向代理配置
├── deploy.sh                 # 生产一键部署脚本
├── service.sh                # 本地开发服务管理
└── Makefile                  # 开发快捷命令
```
