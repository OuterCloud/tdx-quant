# tdx-quant

他都行量化选股系统 — 基于 FastAPI + React 的全栈量化分析平台。

## 技术栈

- **后端**: Python 3.13 / FastAPI / SQLAlchemy 2.0 (async) / Polars / PostgreSQL 16 / Redis 7
- **前端**: React 19 / TypeScript / Vite / Tailwind CSS v4 / Shadcn/ui
- **工具链**: uv / pnpm / Ruff / Biome / Docker Compose

## 快速开始

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
- 后端 API 文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/api/health

## 项目结构

```
tdx-quant/
├── backend/          # FastAPI 后端
│   ├── app/
│   │   ├── api/      # 路由
│   │   ├── core/     # 配置、数据库、Redis
│   │   ├── models/   # SQLAlchemy 模型
│   │   └── schemas/  # Pydantic schemas
│   └── alembic/      # 数据库迁移
├── frontend/         # React 前端
│   └── src/
│       ├── components/
│       ├── pages/
│       └── api/
├── docker-compose.yaml
├── docker-compose.dev.yaml
└── Makefile
```
