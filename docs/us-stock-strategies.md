# 美股量化选股策略研究

## 技术面策略

### 1. Mark Minervini SEPA 模板
**超级绩效股票筛选，年化收益曾达 220%**

条件：
- 股价 > 150日均线 且 > 200日均线
- 150日均线 > 200日均线
- 200日均线至少上升 1 个月
- 股价距52周高点在 25% 以内
- 股价距52周低点至少上涨 30%+
- RS评级 > 70（相对强度）

核心思想：只买已经证明自己的强势股，不抄底。

---

### 2. Stan Weinstein Stage 2 突破
**经典趋势跟踪，胜率约 60%+**

条件：
- 股价突破 30 周均线并站稳
- 30周均线开始走平或拐头向上
- 突破时成交量放大 > 平均量的 2 倍
- 行业板块配合（同板块多只股票同时突破）

核心思想：只做 Stage 2（上升阶段），严格回避 Stage 3/4。

---

### 3. VCP（Volatility Contraction Pattern）
**Minervini 的进场模型，精确择时**

特征：
- 价格在一段上涨后出现 3-5 次收缩
- 每次回调幅度递减（如 25% → 15% → 8% → 3%）
- 量能逐步萎缩
- 最后在极低量能处突破

实现思路：均线粘合 + 缩量 + BOLL 收窄 → 突破时放量

---

### 4. Dual Momentum（双动量）
**Gary Antonacci，夏普比约 1.0，回撤小**

规则：
- 绝对动量：过去 12 个月回报 > 无风险利率 → 做多
- 相对动量：在资产类别中选相对最强的
- 每月调仓一次

适合 ETF 轮动，非个股。

---

## 基本面量化策略

### 5. Magic Formula（Joel Greenblatt）
**年化 30%+（1988-2004 回测）**

排名公式：
- 盈利收益率 = EBIT / Enterprise Value（越高越好）
- 资本回报率 = EBIT / (Net Working Capital + Net Fixed Assets)
- 两项排名相加，选排名最靠前的 20-30 只

核心：高质量 + 低估值的交集。

---

### 6. Piotroski F-Score
**9 分制财务健康评分**

9 个指标各得 0 或 1 分：
- ROA > 0, 经营现金流 > 0, ROA 增长, 现金流 > 净利润
- 杠杆下降, 流动比率上升, 未增发
- 毛利率上升, 资产周转率上升

8-9 分的低 P/B 股票年化超额 7.5%。

---

### 7. CAN SLIM（William O'Neil / IBD）
**融合基本面 + 技术面，美股最流行的成长股策略**

- **C**：当季 EPS 增长 ≥ 25%
- **A**：年度 EPS 增长 ≥ 25%，持续 3-5 年
- **N**：新产品/新高/新管理层
- **S**：供给紧张（流通盘小 + 机构持仓增加）
- **L**：Leader（RS 评级 ≥ 80）
- **I**：机构认同（基金持仓季度增加）
- **M**：市场方向确认（大盘处于上升趋势）

---

## 因子策略（学术验证最充分）

### 8. Fama-French 多因子

| 因子 | 年化超额 | 逻辑 |
|------|----------|------|
| Value（低P/B） | ~3-5% | 市场过度悲观 |
| Size（小市值） | ~2-3% | 流动性溢价 |
| Momentum（动量） | ~6-8% | 趋势延续 |
| Quality（高ROE） | ~3-4% | 好公司被低估 |
| Low Vol（低波动） | ~2-3% | 彩票效应反转 |

最强组合：Momentum + Quality + Value 三因子叠加

---

## 数据需求分析

### 技术面策略所需数据

| 数据类型 | 具体字段 | 来源 |
|----------|----------|------|
| 日线行情 | OHLCV（开高低收量） | Yahoo Finance / Polygon / Alpha Vantage |
| 周线行情 | 30周MA（Stage Analysis） | 日线聚合 |
| 52周高低点 | 52w_high, 52w_low | 日线计算 |
| 相对强度 | RS Rating（vs SPY） | 需自行计算：个股N日涨幅 / 指数N日涨幅 |
| 成交量均值 | 50日均量 | 日线计算 |

### 基本面策略所需数据

| 数据类型 | 具体字段 | 来源 |
|----------|----------|------|
| 利润表 | Revenue, EBIT, Net Income, EPS | SEC Edgar / FMP / Polygon |
| 资产负债表 | Total Assets, Debt, Book Value, Working Capital | 同上 |
| 现金流量表 | Operating Cash Flow | 同上 |
| 估值指标 | P/E, P/B, EV/EBIT, Market Cap | 实时行情计算 |
| 成长指标 | EPS同比增长, Revenue同比增长 | 季报对比 |

### 机构/情绪数据

| 数据类型 | 具体字段 | 来源 |
|----------|----------|------|
| 机构持仓 | 13F Filing, 基金持仓变动 | SEC Edgar |
| 内部人交易 | Insider Buy/Sell | SEC Form 4 |
| 做空比率 | Short Interest % | FINRA |
| 期权流 | Put/Call Ratio, Unusual Options Activity | CBOE / 付费数据 |

---

## 可用免费/低成本 API

| API | 特点 | 费用 |
|-----|------|------|
| Yahoo Finance (yfinance) | 日线行情、基本面、免费 | 免费（非官方） |
| Alpha Vantage | 行情 + 基本面 + 技术指标 | 免费(5次/min) |
| Polygon.io | 高质量行情、Starter plan 足够 | $29/月 |
| Financial Modeling Prep | 财报 + 估值 + 评级 | 免费(250次/天) |
| SEC EDGAR | 13F + 10-K/Q 原始数据 | 免费 |
| IEX Cloud | 行情 + 基本面 + 新闻 | 按量计费 |

---

## 与 A股系统的对比

| 维度 | A股 (当前系统) | 美股 (扩展) |
|------|----------------|-------------|
| 行情数据 | 通达信本地文件 | API (Yahoo/Polygon) |
| 技术指标 | MA/MACD/KDJ/RSI/ADX/BOLL/WR | 相同 + RS Rating + Stage |
| 基本面 | 暂无 | EPS增长/P/E/ROIC/F-Score |
| 板块分类 | 东方财富概念板块 | GICS行业分类 |
| 交易日历 | A股交易日 | 美股交易日(不同假期) |
| 涨跌限制 | 10%/20%/30% | 无涨跌停（有熔断） |
| 货币 | CNY | USD |
| 更新频率 | 收盘后批量 | 可实时(付费) 或收盘后 |
