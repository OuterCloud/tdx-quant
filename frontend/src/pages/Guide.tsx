export default function Guide() {
  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold">功能说明</h2>

      {/* 系统概览 */}
      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="text-lg font-semibold">系统概览</h3>
        <p className="text-sm text-muted-foreground">
          TDX 量化选股系统是一个面向 A
          股市场的量化分析工具，帮助投资者通过技术指标和多层筛选逻辑，从数千只股票中系统性地筛选出符合条件的标的。
        </p>
        <p className="text-sm text-muted-foreground">整体使用流程：</p>
        <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
          <li>
            <strong>数据初始化</strong> —
            在系统设置中同步股票日线数据和板块数据
          </li>
          <li>
            <strong>配置选股策略</strong> —
            设置筛选条件、调整各层参数和评分权重
          </li>
          <li>
            <strong>执行筛选</strong> — 运行选股策略，查看评分排名结果
          </li>
          <li>
            <strong>回测验证</strong> —
            对策略进行历史回测，验证策略有效性
          </li>
        </ol>
      </section>

      {/* 模块功能说明 */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-lg font-semibold">模块功能说明</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icon: "📊",
              title: "市场总览",
              desc: "展示市场整体状态、今日买入推荐列表和数据同步状态，快速了解当前市场概况。",
            },
            {
              icon: "📈",
              title: "股票数据",
              desc: "浏览所有股票的基础数据和技术指标，支持搜索、排序和详情查看。",
            },
            {
              icon: "🏷️",
              title: "板块数据",
              desc: "查看行业板块和概念板块的分类数据，了解板块资金流向和热度。",
            },
            {
              icon: "🔍",
              title: "选股策略",
              desc: "配置和执行多层筛选策略，通过4层过滤逻辑和评分体系从全市场中精选标的。",
            },
            {
              icon: "📉",
              title: "回测分析",
              desc: "对选股策略进行历史数据回测，评估策略在不同市场环境下的表现和收益情况。",
            },
            {
              icon: "⚙️",
              title: "系统设置",
              desc: "管理数据同步、配置系统参数，包括股票日线数据和板块数据的初始化与更新。",
            },
          ].map((m) => (
            <div key={m.title} className="rounded border border-border p-3">
              <p className="font-medium">
                {m.icon} {m.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 核心指标术语 */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-lg font-semibold">核心指标术语</h3>
        <div className="space-y-2 text-sm">
          {[
            {
              term: "MA（移动平均线）",
              desc: "将一定周期内的收盘价取平均值连成曲线。MA5/MA10/MA20分别反映近5日、10日、20日的平均持仓成本。短期均线上穿长期均线为金叉（看多信号），反之为死叉。",
            },
            {
              term: "MACD（指数平滑异同移动平均线）",
              desc: "由DIF线（快线与慢线之差）和DEA线（DIF的9日平均）组成。DIF上穿DEA为金叉买入信号；柱状图（MACD柱）由负转正表示多头动能增强。",
            },
            {
              term: "KDJ（随机指标）",
              desc: "衡量股价相对于近期高低点的位置。K值>80为超买区间，K值<20为超卖区间。K线上穿D线为买入信号。J值的灵敏度最高，常用于捕捉短线拐点。",
            },
            {
              term: "RSI（相对强弱指数）",
              desc: "衡量价格上涨与下跌动量的比值，取值0-100。RSI>70为超买，RSI<30为超卖。常用RSI6（短期）和RSI12（中期）组合判断。",
            },
            {
              term: "ADX（平均趋向指数）",
              desc: "衡量趋势强度，不区分方向。ADX>25表示趋势明确，ADX<20表示盘整状态。配合+DI和-DI判断多空方向。",
            },
            {
              term: "布林带（BOLL）",
              desc: "由中轨（20日均线）、上轨（中轨+2倍标准差）、下轨（中轨-2倍标准差）组成。股价触及上轨可能回调，触及下轨可能反弹。带宽收窄预示变盘。",
            },
            {
              term: "量比",
              desc: "当日成交量与过去5日平均成交量的比值。量比>1.5表示明显放量，量比<0.5表示明显缩量。放量突破关键位置的可靠性更高。",
            },
          ].map((item) => (
            <div key={item.term} className="rounded border border-border p-2">
              <p className="font-medium">{item.term}</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 4层筛选逻辑 */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-lg font-semibold">4层筛选逻辑</h3>
        <p className="text-sm text-muted-foreground">
          系统采用逐层过滤的方式，每一层淘汰不符合条件的股票，最终留下高质量标的：
        </p>
        <div className="space-y-2 text-sm">
          {[
            {
              layer: "第1层：基础过滤",
              desc: "排除ST股、停牌股、上市不足60日的次新股，过滤成交额过低（不活跃）的标的。确保进入后续分析的股票具备基本的交易条件。",
            },
            {
              layer: "第2层：技术形态筛选",
              desc: "基于均线多头排列（MA5>MA10>MA20）、MACD金叉/柱状图转正、KDJ金叉等技术信号进行筛选。要求股票处于技术面向好的状态。",
            },
            {
              layer: "第3层：趋势强度确认",
              desc: "通过ADX趋势强度、RSI动量方向、布林带位置等确认上涨趋势的可靠性。排除虽有技术信号但趋势不明确的标的。",
            },
            {
              layer: "第4层：量价配合验证",
              desc: "验证成交量是否配合价格上涨（放量上攻），检查量比是否达标。量价配合是趋势持续的重要条件。",
            },
          ].map((item) => (
            <div key={item.layer} className="rounded border border-border p-2">
              <p className="font-medium">{item.layer}</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 评分体系 */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-lg font-semibold">评分体系</h3>
        <p className="text-sm text-muted-foreground">
          通过4层筛选的股票会获得一个综合评分（0-100分），评分维度包括：
        </p>
        <div className="space-y-2 text-sm">
          <div className="rounded border border-border p-2">
            <p className="font-medium">评分维度</p>
            <ul className="text-muted-foreground text-xs mt-1 list-disc list-inside space-y-0.5">
              <li>均线形态得分 — 多头排列程度、均线斜率</li>
              <li>MACD动能得分 — 金叉强度、柱状图增长趋势</li>
              <li>KDJ/RSI位置得分 — 是否处于合理区间（非超买）</li>
              <li>趋势强度得分 — ADX数值和方向</li>
              <li>量价配合得分 — 放量程度和持续性</li>
            </ul>
          </div>
          <div className="rounded border border-border p-2">
            <p className="font-medium">分数区间含义</p>
            <ul className="text-muted-foreground text-xs mt-1 list-disc list-inside space-y-0.5">
              <li>
                <strong>80-100分</strong> —
                强势标的，各项指标优秀，可重点关注
              </li>
              <li>
                <strong>60-79分</strong> —
                较好标的，多数指标达标，可纳入观察池
              </li>
              <li>
                <strong>40-59分</strong> —
                一般标的，部分指标不理想，建议等待更好时机
              </li>
              <li>
                <strong>40分以下</strong> —
                较弱标的，不建议当前介入
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
