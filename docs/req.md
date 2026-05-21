# tdx-quant — 通达信量化选股与仓位管理系统

## 1. 项目愿景

建立一个自动化量化选股漏斗，融合通达信行情数据、技术指标、两融杠杆资金动向以及动态仓位管理，解决"选股难、买卖盲目、风险失控"的痛点。

产品形态为 **Web 应用**（前后端分离），提供可视化看板与交互式操作界面。

---

## 2. 核心功能模块

### 模块一：数据底座 (Data Engine)

| 数据类型 | 数据源 | 说明 |
|----------|--------|------|
| 日K线/分钟K线 | eltdx (TDX 协议) | 全市场股票 OHLCV 数据 |
| 即时行情 | eltdx | 五档盘口、最新价 |
| 融资融券明细 | AKShare (交易所) | 每日盘后 T+1 数据，含融资余额/买入额、融券余量等 |
| 行业/概念板块 | eltdx + AKShare | 通达信行业分类、概念板块归属 |
| 基本面 | AKShare | 市值、市盈率、ST 标记、停牌状态 |
| 交易日历 | exchange_calendars | 处理节假日、非交易日 |

**数据存储方案：**

- **日K线数据** → Parquet 文件（按股票代码，一股一文件）
  - 通过 Polars 原生读写，零拷贝、惰性求值
  - 路径：`data/kline/{stock_code}.parquet`
- **两融数据** → Parquet 文件（按日期分区）
  - 路径：`data/margin/{date}.parquet`
- **应用数据** → PostgreSQL
  - 股票列表、板块归属、选股结果历史、策略配置、任务日志
- **缓存层** → Redis
  - API 响应缓存、最新指标快照、WebSocket 消息通道
- **预估存储**：5000股 × 10年 K线 ≈ Parquet 压缩后 ~150MB；PostgreSQL ~500MB

**数据更新策略：**

- 初始化：一次性全量下载历史数据（约 15-30 分钟）
- 日常：每日盘后增量追加当天数据（约 3-5 分钟）
- 两融数据：每日 20:00 后拉取当天数据
- 定时任务通过 APScheduler（Redis 持久化 job store）自动执行，支持页面手动触发

---

### 模块二：指标与公式引擎 (Indicator Engine)

**核心方案：MyTT 为主 + TA-Lib 为辅**

| 库 | 定位 | 使用场景 |
|----|------|----------|
| MyTT (fork 到项目内) | 主力指标引擎 | MACD、KDJ、均线、BOLL 等 TDX 公式复刻 |
| TA-Lib | 补充引擎 | K线形态识别、性能瓶颈场景 |

**为什么 fork MyTT：**

1. MyTT 是单文件库（~300行），API 直接映射 TDX 公式语法（`CROSS(MA(C,5), MA(C,20))`）
2. 存在已知 bug（SAR/BOLL/KDJ），需对照 TDX 导出数据修正
3. fork 后可自由扩展自定义指标

**指标计算流程：**

```
Parquet 文件
    → Polars LazyFrame 惰性加载
    → 转 NumPy 数组喂入 MyTT/TA-Lib
    → 输出"最新指标快照" (5000行 × N列)
    → 写入 Redis 缓存 + 供筛选漏斗过滤
```

**性能预估（全市场 5000 股）：**

| 操作 | MyTT (NumPy 向量化) | TA-Lib (C) |
|------|---------------------|------------|
| 单股全套指标（10个） | ~2ms | ~0.2ms |
| 5000 股全量扫描 | **~10 秒** | **~1 秒** |

盘后批量计算场景，MyTT 性能完全足够。

---

### 模块三：多维过滤选股漏斗 (Strategy Filter)

采用自上而下的三层过滤机制，每日盘后选出目标个股：

**第一层 — 初选（硬性过滤）：**
- 剔除 ST / *ST 股票
- 剔除停牌股票
- 剔除北交所（8开头）、科创板（688开头）
- 锁定特定概念板块（可配置）

**第二层 — 精选（基本面 + 技术指标）：**
- 市值范围：如 50-200 亿（可配置）
- 成交额下限：如 > 2 亿（可配置）
- 技术指标条件（可配置组合）：
  - 均线多头排列（MA5 > MA10 > MA20 > MA60）
  - MACD 金叉 / 零轴上方
  - 量价配合（放量突破）

**第三层 — 终选（两融量价形态）：**
- 加分：融资买入量价齐升（融资买入额连续增长 + 股价上行）
- 减分/剔除：融资余额暴增但股价滞涨（资金背离）
- 减分/剔除：融券余量大幅增加（做空力量增强）

**配置驱动：** 所有筛选参数通过 Web 界面可视化配置，后端持久化到 PostgreSQL。

---

### 模块四：动态仓位管理 (Risk / Position Control)

#### 大盘择时（总仓位控制）

根据市场环境动态调节总仓位比例（0% - 100%）：

| 信号 | 仓位调节 |
|------|----------|
| 全市场上涨股占比 > 60% | 满仓（100%） |
| 上涨股占比 40%-60% | 半仓（50%） |
| 上涨股占比 < 40% | 空仓（0%） |
| 大盘收盘价 > MA20 | 加分 |
| 大盘收盘价 < MA20 | 减分 |

（具体阈值可配置）

#### 个股仓位（ATR 风险平价）

```
单股仓位（股数） = 每股风险预算 / (N × ATR_14)

其中：
- 每股风险预算 = 总资金 × 单股风险比例（如 2%）
- N = ATR 乘数（通常 1-3）
- ATR_14 = 14日平均真实波幅
- 最终结果向下取整到 100 股（一手）
```

**风控规则：**
- 单股最大仓位不超过总资产 10%
- 总持仓股数上限：10 只
- ATR 取 max(当前14日ATR, 60日ATR)，避免低波动期仓位过大
- 成交额校验：买入金额不超过该股当日成交额的 2%

---

## 3. Web 页面设计

### 3.1 页面结构

```
┌─────────────────────────────────────────────────────────┐
│  侧边栏导航：Dashboard | 选股结果 | 个股详情 | 策略配置 | 数据管理  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 页面详细设计

#### 页面一：Dashboard（首页看板）

整体概览，一目了然当前市场与系统状态。

| 区域 | 内容 |
|------|------|
| 大盘状态卡片 | 上证/深证涨跌幅、上涨股占比、当前建议总仓位（仪表盘图） |
| 今日选股摘要 | 入选股票数量、漏斗各层通过数（柱状图） |
| 买入清单预览 | 表格：股票代码、名称、建议买入股数、预计金额 |
| 数据更新状态 | 最后更新时间、各数据源健康状态（绿/红灯） |

#### 页面二：选股结果

展示每日选股漏斗的完整输出。

| 区域 | 内容 |
|------|------|
| 日期选择器 | 查看历史任意交易日的选股结果 |
| 漏斗可视化 | 漏斗图：全市场 → 初选 → 精选 → 终选（每层数量） |
| 结果表格 | 可排序/筛选/分页表格：代码、名称、行业、市值、关键指标、两融评分、建议仓位 |
| 导出功能 | 导出为 CSV / Excel |

#### 页面三：个股详情

点击任意股票进入详情页，展示深度分析。

| 区域 | 内容 |
|------|------|
| K线图 (ECharts) | 日K线 + 成交量，叠加均线（MA5/10/20/60）、BOLL 等指标 |
| 技术指标面板 | MACD 柱状图、KDJ 曲线、RSI（副图） |
| 两融走势 | 融资余额曲线 vs 股价走势（双Y轴），标注背离/齐升信号 |
| 基本信息 | 市值、PE、所属板块、ST 状态 |
| 选入理由 | 该股通过了哪些筛选条件（清单展示） |

#### 页面四：策略配置

可视化配置筛选参数。

| 区域 | 内容 |
|------|------|
| 初选条件 | 勾选/取消：排除 ST、排除科创板、排除北交所、板块白名单 |
| 精选条件 | 滑块/输入框：市值范围、成交额下限、均线参数 |
| 两融条件 | 阈值配置：背离天数、齐升判定参数 |
| 仓位参数 | 总资金、单股风险比例、ATR 乘数、最大持仓数 |
| 大盘择时 | 上涨股占比阈值、均线参数 |
| 保存/重置 | 保存配置 / 恢复默认 |

#### 页面五：数据管理

数据下载与维护操作台。

| 区域 | 内容 |
|------|------|
| 数据状态 | 各数据类型：最新日期、记录数、存储大小 |
| 手动操作 | 按钮：全量初始化 / 增量更新 / 更新两融 |
| 定时任务 | 定时更新开关、cron 表达式配置、下次执行时间 |
| 运行日志 | 实时滚动日志（WebSocket 推送） |

---

## 4. 技术栈

### 后端 (Python)

| 类别 | 选型 | 说明 |
|------|------|------|
| 语言 | **Python 3.12+** | 最新稳定版，性能改进显著 |
| Web 框架 | **FastAPI** | 异步、高性能、自动生成 OpenAPI 3.1 规范 |
| 数据库 | **PostgreSQL 16** | 生产级关系数据库，JSONB 支持灵活配置存储 |
| ORM | **SQLAlchemy 2.0** (async) + **Alembic** | 类型安全 ORM + 数据库迁移 |
| 缓存/消息 | **Redis 7** | API 缓存、WebSocket pub/sub、调度器 job store |
| 数据处理 | **Polars** (主) + Pandas (指标库兼容) | Polars 比 Pandas 快 5-30x，Rust 实现，惰性求值 |
| 任务调度 | **APScheduler 4** (Redis job store) | 持久化调度，进程重启不丢任务 |
| 行情接口 | **eltdx** | pytdx 现代继承者，Python 3.10+，活跃维护 |
| 两融/基本面 | **AKShare** | 19.5k stars，免费，数据源为交易所官方 |
| 技术指标 | **MyTT** (fork) + **TA-Lib** | MyTT 复刻 TDX 公式，TA-Lib 做形态识别 |
| 数据格式 | **Parquet** (via Polars) | K线列式存储，压缩率高，读取极快 |
| 交易日历 | **exchange_calendars** | 中国市场节假日处理 |
| 数据验证 | **Pydantic v2** | FastAPI 原生集成，高性能序列化 |
| 实时通信 | **WebSocket** (FastAPI native) | 日志推送、任务进度 |
| 日志 | **Loguru** | 结构化日志，支持 JSON 输出 |
| 包管理 | **uv** | Astral 出品，比 pip 快 10-100x，替代 pip + venv |
| 代码规范 | **Ruff** | Astral 出品，Rust 实现，替代 flake8 + isort + black |
| 测试 | **pytest** + **pytest-asyncio** | — |

### 前端 (TypeScript)

| 类别 | 选型 | 说明 |
|------|------|------|
| 框架 | **React 19** + **TypeScript 5.x** | 最新 React，Server Actions / use() hook |
| 构建 | **Vite 6** | 极速 HMR，ESBuild + Rollup |
| 样式 | **Tailwind CSS v4** | 零运行时、原子化 CSS，v4 性能大幅提升 |
| UI 组件 | **Shadcn/ui** | 基于 Radix，可组合、可定制、不锁定 |
| 数据表格 | **TanStack Table v8** | 无头表格，支持排序/筛选/分页/虚拟滚动 |
| 服务端状态 | **TanStack Query v5** | 请求缓存、后台刷新、乐观更新 |
| 客户端状态 | **Zustand** | 极简状态管理，无 boilerplate |
| 路由 | **React Router v7** | 类型安全路由，数据加载 |
| 图表 | **ECharts 5** (echarts-for-react) | K线图、漏斗图、仪表盘、双Y轴 |
| API 客户端 | **openapi-fetch** | 从 FastAPI OpenAPI spec 自动生成类型安全客户端 |
| 包管理 | **pnpm** | 快速、节省磁盘、严格依赖 |
| 代码规范 | **Biome** | Rust 实现，替代 ESLint + Prettier，毫秒级执行 |
| 测试 | **Vitest** | Vite 原生测试框架 |

### 前后端类型同步

```
FastAPI (Pydantic v2 模型)
    → 自动生成 OpenAPI 3.1 JSON spec
    → openapi-typescript 生成 TypeScript 类型
    → openapi-fetch 生成类型安全 API 客户端
    → 前端调用 API 时获得完整类型提示与编译期校验
```

**零手写类型定义，后端改接口前端自动感知。**

### 部署

| 类别 | 方案 |
|------|------|
| 容器化 | **Docker Compose** (FastAPI + PostgreSQL + Redis + Nginx) |
| 反向代理 | **Nginx** (静态资源 + API 代理 + WebSocket 代理) |
| 前端产物 | Vite 构建静态文件，Nginx 直接托管 |
| 进程管理 | **Gunicorn** + Uvicorn workers（生产）|
| 开发模式 | 前端 `vite dev` + 后端 `uvicorn --reload` + Docker (PG + Redis) |

---

## 5. 项目结构

```
tdx-quant/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI 应用入口 + 生命周期
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── router.py            # 路由汇总
│   │   │   ├── dashboard.py         # GET /api/dashboard/*
│   │   │   ├── screening.py         # GET /api/screening/*
│   │   │   ├── stock.py             # GET /api/stock/{code}/*
│   │   │   ├── strategy.py          # GET/PUT /api/strategy/*
│   │   │   ├── data_mgmt.py         # POST /api/data/*
│   │   │   └── ws.py                # WebSocket /ws/logs
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py            # Pydantic Settings (环境变量)
│   │   │   ├── database.py          # SQLAlchemy async engine + session
│   │   │   ├── redis.py             # Redis 连接池
│   │   │   └── scheduler.py         # APScheduler 配置
│   │   ├── models/                   # SQLAlchemy ORM 模型
│   │   │   ├── __init__.py
│   │   │   ├── stock.py
│   │   │   ├── screening.py
│   │   │   └── strategy.py
│   │   ├── schemas/                  # Pydantic v2 请求/响应模型
│   │   │   ├── __init__.py
│   │   │   ├── dashboard.py
│   │   │   ├── screening.py
│   │   │   ├── stock.py
│   │   │   └── strategy.py
│   │   ├── services/                 # 业务逻辑层
│   │   │   ├── __init__.py
│   │   │   ├── data_fetcher.py      # eltdx 行情下载
│   │   │   ├── margin_fetcher.py    # AKShare 两融数据
│   │   │   ├── basic_fetcher.py     # 基本面/板块数据
│   │   │   ├── indicator.py         # 指标计算调度
│   │   │   ├── screener.py          # 三层漏斗主逻辑
│   │   │   ├── margin_signal.py     # 两融量价形态判定
│   │   │   ├── market_timing.py     # 大盘择时
│   │   │   └── position.py          # ATR 仓位计算
│   │   ├── indicators/               # 指标引擎
│   │   │   ├── __init__.py
│   │   │   ├── mytt_fork.py         # MyTT fork（含 bug 修正）
│   │   │   └── patterns.py          # TA-Lib K线形态
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── calendar.py          # 交易日历工具
│   │       └── parquet.py           # Polars Parquet 读写封装
│   ├── alembic/                      # 数据库迁移
│   │   ├── versions/
│   │   └── env.py
│   ├── alembic.ini
│   ├── pyproject.toml                # uv 项目配置
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                     # openapi-fetch 生成的类型安全客户端
│   │   │   ├── client.ts
│   │   │   └── types.ts             # 从 OpenAPI spec 自动生成
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Screening.tsx
│   │   │   ├── StockDetail.tsx
│   │   │   ├── Strategy.tsx
│   │   │   └── DataMgmt.tsx
│   │   ├── components/
│   │   │   ├── ui/                  # Shadcn/ui 组件
│   │   │   ├── charts/
│   │   │   │   ├── KLineChart.tsx
│   │   │   │   ├── FunnelChart.tsx
│   │   │   │   ├── GaugeChart.tsx
│   │   │   │   └── MarginChart.tsx
│   │   │   └── layout/
│   │   │       ├── Sidebar.tsx
│   │   │       └── Header.tsx
│   │   ├── hooks/                   # 自定义 hooks
│   │   │   └── useWebSocket.ts
│   │   ├── store/                   # Zustand stores
│   │   │   └── index.ts
│   │   ├── lib/                     # 工具函数
│   │   │   └── utils.ts
│   │   └── styles/
│   │       └── globals.css          # Tailwind 入口
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── biome.json                   # Biome lint + format 配置
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yaml               # PG + Redis + Backend + Frontend(Nginx)
├── nginx.conf                        # Nginx 反代配置
├── Makefile                          # 常用命令快捷入口
└── README.md
```

---

## 6. API 设计（RESTful + WebSocket）

### Dashboard

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard/market-overview` | 大盘状态、涨跌比、建议仓位 |
| GET | `/api/dashboard/today-summary` | 今日选股摘要（漏斗各层计数） |
| GET | `/api/dashboard/buy-list` | 今日买入清单 |
| GET | `/api/dashboard/data-status` | 数据更新状态 |

### 选股结果

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/screening/{date}` | 指定日期的选股结果（分页） |
| GET | `/api/screening/{date}/funnel` | 漏斗各层统计 |
| GET | `/api/screening/{date}/export` | 导出 CSV |
| GET | `/api/screening/dates` | 可查询的日期列表 |

### 个股详情

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stock/{code}/kline` | K线数据 + 指标叠加（支持区间参数） |
| GET | `/api/stock/{code}/indicators` | 最新技术指标值 |
| GET | `/api/stock/{code}/margin` | 两融走势数据 |
| GET | `/api/stock/{code}/info` | 基本信息 |
| GET | `/api/stock/search?q=` | 股票搜索（代码/名称模糊匹配） |

### 策略配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/strategy/config` | 获取当前配置 |
| PUT | `/api/strategy/config` | 更新配置 |
| POST | `/api/strategy/reset` | 重置为默认 |

### 数据管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/data/status` | 各数据源状态（最新日期、大小） |
| POST | `/api/data/init` | 触发全量初始化（异步任务） |
| POST | `/api/data/update` | 触发增量更新（异步任务） |
| GET | `/api/data/tasks` | 运行中/历史任务列表 |
| GET | `/api/data/scheduler` | 定时任务配置与状态 |
| PUT | `/api/data/scheduler` | 更新定时任务配置 |

### WebSocket

| 路径 | 说明 |
|------|------|
| `/ws/logs` | 实时日志流（数据更新进度、错误信息） |
| `/ws/task/{task_id}` | 特定任务进度推送 |

---

## 7. 迭代路线图

### 阶段 1 — MVP（后端核心 + 基础页面）

- [ ] 项目骨架搭建
  - [ ] 后端：uv 初始化、FastAPI 应用、Docker Compose (PG + Redis)
  - [ ] 前端：pnpm + Vite + React 19 + Tailwind v4 + Shadcn/ui
  - [ ] OpenAPI → TypeScript 类型生成 pipeline
- [ ] 数据层
  - [ ] eltdx 日K线下载 + Polars Parquet 存储
  - [ ] PostgreSQL 模型 + Alembic 迁移
- [ ] 指标引擎
  - [ ] fork MyTT，实现 MA / MACD / KDJ
- [ ] 选股逻辑
  - [ ] 初选 + 精选两层过滤
- [ ] Web 页面
  - [ ] Dashboard（大盘状态 + 选股摘要 + 买入清单表格）
  - [ ] 数据管理页（手动触发下载 + 状态 + 日志流）

**交付物：** Web 页面展示均线选股结果，可手动触发数据更新并实时看到日志。

### 阶段 2 — 两融增强 + 个股详情

- [ ] 接入 AKShare 两融数据
- [ ] 两融量价形态判定算法
- [ ] 第三层过滤（两融终选）
- [ ] 基本面数据完善（市值、板块）
- [ ] 个股详情页
  - [ ] ECharts K线图（含均线、BOLL 叠加）
  - [ ] MACD / KDJ 副图
  - [ ] 两融走势双Y轴图
- [ ] 选股结果页（漏斗图 + TanStack Table + 导出）

**交付物：** 完整三层选股漏斗 + 可视化个股分析图表。

### 阶段 3 — 全面风控 + 策略配置

- [ ] 大盘择时模块
- [ ] ATR 仓位计算（一手取整、总仓位约束）
- [ ] 策略配置页面（可视化表单 → 后端持久化）
- [ ] Dashboard 仪表盘（仓位建议 Gauge、风控信号）
- [ ] APScheduler 定时任务（盘后自动更新 + 自动选股）
- [ ] 历史选股记录与日期回溯

**交付物：** 每日自动运行，Web 展示完整买入清单与仓位建议。

### 阶段 4 — 生产加固

- [ ] Nginx 反代 + HTTPS
- [ ] Docker Compose 一键生产部署
- [ ] Gunicorn 多 worker 生产配置
- [ ] 错误监控与告警
- [ ] 消息推送（微信/钉钉/邮件）
- [ ] 深色模式
- [ ] 策略回测框架（可选）

---

## 8. 关键风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| eltdx 服务器不稳定/被封 IP | 无法获取行情 | 内置重试 + 连接池 + AKShare fallback |
| MyTT 指标与 TDX 有偏差 | 选股结果不准 | 逐一对照 TDX 导出数据交叉验证 |
| 两融数据延迟/缺失 | 当日无法终选 | 降级为二层过滤，页面提示数据状态 |
| AKShare 接口变更 | 数据拉取失败 | 关注更新日志 + 版本锁定 + 异常告警 |
| ATR 低波动期仓位过大 | 风险暴露过高 | max(短期ATR, 长期ATR) + 单股仓位硬上限 |
| PostgreSQL/Redis 宕机 | 服务不可用 | Docker 健康检查 + 自动重启策略 |

---

## 9. 开发规范

| 项目 | 规范 |
|------|------|
| Python 代码风格 | Ruff 格式化 + lint（pyproject.toml 统一配置） |
| TypeScript 代码风格 | Biome 格式化 + lint |
| Git 提交 | Conventional Commits（feat/fix/chore/docs） |
| 分支策略 | main + feature branches，PR 合入 |
| API 版本 | URL 前缀 `/api/v1/`（后续升级不破坏） |
| 环境变量 | `.env` 文件 + Pydantic Settings 强类型校验 |
| 测试覆盖 | 后端 pytest，前端 Vitest，核心逻辑必须有单测 |
