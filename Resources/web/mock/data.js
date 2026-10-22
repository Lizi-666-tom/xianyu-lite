/* =============================================================================
 *  小铺数据（经营罗盘）—— mock 数据 /  随便改数字即可
 * =============================================================================
 *
 *  文件作用：定义 window.XY_MOCK，一个 api 名 -> mtop 响应 data 的映射。
 *            mock/mtop-mock.js 会把它包装成完整的 mtop 响应喂给页面。
 *
 *  改数字的方法：
 *    1) 卡片类（数据总览 / 商品数据 / 交易数据 / 售后数据 / 复购 / 粉丝 / 客服）
 *       找到 bannerDataList 里对应的 card('字段名', 数值, 环比%, '周期说明')，改第 2 个参数。
 *    2) 分布类（浏览分布 / 粉丝洞察）
 *       找到 profileVal / usrRatio / usrRatioFormat，三个一起改（usrRatio 与 usrRatioFormat 要一致）。
 *    3) 折线图 / 列表
 *       改 graphDataList / list 数组。
 *
 *  字段对照表（中文标签 -> 英文字段）见 README.md
 * ========================================================================== */
(function () {
  'use strict';

  /* ===========================================================================
   *  ★★ 全局可改项（不在接口里、但界面上会显示的，都在这里）★★
   * ========================================================================= */

  /* 「粉丝」tab →「粉丝洞察」右上角那个日期（以及它下面的「数据更新至 xxx」）
   * 官方代码取的是「手机系统时间 - 1 天」，页面上写死改不了；
   * assets/operate-compass.js 已打了一行补丁（脚本：_moyu-tools/patch_fans_date.py），
   * 这里设了就用这里的值，删掉/注释掉就退回「系统时间 - 1 天」。
   * 格式：'YYYY-MM-DD'（必须带横杠，否则日期解析不出来）
   * ★ 现在跟着按日数据源走：= 昨天（和页面其它地方「数据更新至」保持同一天） */
  window.XY_MOCK_FANS_DATE = (window.XY_YESTERDAY && window.XY_YESTERDAY()) || '2025-01-07';

  /* ---------- 工具函数 ---------- */

  // 卡片。参数：字段名, 数值, 环比百分比(带符号), 对比周期说明
  function card(name, value, ratioPct, cycle) {
    var r = (typeof ratioPct === 'number') ? ratioPct : 0;
    return {
      name: name,
      dataStr: String(value),                  // 大部分卡片读这个
      dataFormat: String(value),               // 客服概览那组卡片读的是 dataFormat，两个都给
      data: value,                             // 原始数值（部分组件用它做判断）
      ratio: r / 100,                          // 正数=红色上涨，负数=绿色下跌
      ratioFormat: (r >= 0 ? '+' : '') + r.toFixed(1) + '%',
      cycle: cycle || '较前1日'
    };
  }

  // 分布项。三个值要一致：usrRatio 与 usrRatioFormat 的数字部分
  function dist(profileVal, pct) {
    return { profileVal: profileVal, usrRatio: pct, usrRatioFormat: pct + '%' };
  }

  // 折线图的一行
  function graphRow(ds, map) {
    var o = { ds: ds };
    for (var k in map) o[k] = map[k];
    return o;
  }

  // 接口返回的外壳。约定：XY_MOCK[api] = { data: <业务负载>, extendInfo?: { realDateRange } }
  // 页面读 t.data.data / t.data.extendInfo，mtop-mock.js 负责把这里包成完整响应体
  // ★ realDateRange 默认给「按日数据源」的可用区间（页面「数据更新至」读的是 [1]），
  //   真正发请求时 mtop-mock.js 还会按 dateType/dateRange 再覆盖成实际区间。
  function resp(data, range) {
    var from = (window.XY_FIRST_DAY || '2025-01-01').replace(/-/g, '');
    var to = (window.XY_LAST_UPDATED || window.XY_YESTERDAY && window.XY_YESTERDAY() || '2025-01-07').replace(/-/g, '');
    return {
      data: data,
      extendInfo: { realDateRange: range || [from, to] }
    };
  }

  /* ===========================================================================
   *  ★★ 按日数据源：和「哪一天」有关的卡片全部从 window.XY_DAILY 现算 ★★
   * =========================================================================
   *  mock/daily-data.js（必须在本文件之前加载）提供：
   *    XY_DAILY          { 'YYYY-MM-DD': { vstPv, showPv, payAmt, ... } }  ← 一天一份
   *    XY_GET_DAILY(d)   取某一天（没有就补一份）
   *    XY_GET_RANGE(f,t) 区间聚合 -> { from,to,fromCompact,toCompact,days,data,prev,dayCount }
   *    XY_RESOLVE_RANGE({dateType,dateRange})  把接口参数折算成上面那个上下文
   *    XY_RATIO(cur,prev) 环比百分比（除零给 0）；XY_YESTERDAY() 昨日
   *
   *  下面的 BUILDERS 按接口把「区间上下文」翻译成页面要的卡片，
   *  字段名 / 卡片形状和原来一模一样，页面代码不用改。
   *  两页读同一份 XY_DAILY，所以同一段日期在两页上的数字必然一致。
   * ========================================================================= */

  var XY = window;                          // 别名，避免和本文件的局部变量撞名

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function fmtVal(v, fmt) {
    var n = num(v);
    if (fmt === 'int') return Math.round(n);
    if (fmt === 'r1') return Math.round(n * 10) / 10;
    if (fmt === 'r2') return Math.round(n * 100) / 100;
    return n;
  }

  function cycleOf(ctx) {
    if (!ctx) return '较前1日';
    if (ctx.dateType === 'recent7d') return '较前7日';
    if (ctx.dateType === 'recent30d') return '较前30日';
    if (ctx.dateType === 'customDate' || ctx.dateType === 'custom') {
      return '较前' + (ctx.dayCount || 1) + '日';
    }
    return '较前1日';
  }

  // 接口请求（mtop 的 opt，data 里带 dateType/dateRange）-> 区间上下文
  function dctx(req) {
    if (!XY.XY_RESOLVE_RANGE) return null;
    var ctx = XY.XY_RESOLVE_RANGE(req || {});
    if (!ctx) return null;
    ctx.cycle = cycleOf(ctx);
    return ctx;
  }

  // 直接取某天字段的卡片（环比 = 和对比区间同字段比）
  function cardFrom(ctx, field, fmt) {
    var cur = num(ctx.data[field]);
    var prev = ctx.prev ? num(ctx.prev[field]) : 0;
    return card(field, fmtVal(cur, fmt || 'int'),
      (XY.XY_RATIO ? XY.XY_RATIO(cur, prev) : 0), ctx.cycle);
  }

  // 派生值（XY_DAILY 里没存的那些卡片，用已有字段稳定算出来，换日期就跟着变）
  function extras(o) {
    o = o || {};
    var chatCnt = num(o.chatCnt), chatUv = num(o.chatUv);
    var rep3 = num(o.rep3minUvRate);
    var payAmt = num(o.payAmt), payOrdCnt = num(o.payOrdCnt), onlCnt = num(o.onlCnt);
    var avgResp = Math.round(75 - rep3 * 0.45);        // 响应率越高、平均响应越短
    var actItm = Math.max(1, Math.round(onlCnt * 0.66));   // 活动中商品数
    return {
      actItmCnt: actItm,
      promItmCnt: actItm,
      payQty: payOrdCnt,
      payQuantity: payOrdCnt,
      netPayAmt: Math.round(payAmt * 0.98 * 100) / 100,
      estPayFee: Math.round(payAmt * 0.01 * 100) / 100,
      clickPv: num(o.ipv),
      clickUv: num(o.ipvUv),
      showClickCvr: num(o.uctr),
      clickPayCvr: num(o.ipvPayUcvr),
      consultUv: chatUv,
      manualSessCnt: chatCnt,
      consultItmCnt: num(o.ipvItmCnt),
      visitorCnt: chatCnt,
      avgRespTm: avgResp,
      firstAvgRespTm: Math.round(avgResp * 0.45),
      respRate3min: Math.round(rep3),
      custSatRate: Math.min(100, Math.round(86 + (rep3 - 85) * 1.1))
    };
  }

  function exCur(ctx) { return ctx._exCur || (ctx._exCur = extras(ctx.data)); }
  function exPrev(ctx) { return ctx._exPrev || (ctx._exPrev = extras(ctx.prev)); }

  function cardEx(ctx, name, fmt) {
    var c = exCur(ctx)[name], p = exPrev(ctx)[name];
    return card(name, fmtVal(c, fmt || 'int'),
      (XY.XY_RATIO ? XY.XY_RATIO(c, p) : 0), ctx.cycle);
  }

  /* 折线图：**一天一个点，选几天就给几个点**
   *
   *   近1天   -> 1 个点（当天）
   *   近7天   -> 7 个点（10-15 … 10-21）
   *   近30天  -> 30 个点
   *   自定义N天 -> N 个点
   *
   *   ★ 这里原来是 `(ctx.days || []).slice(-7)` —— 不管选多长的周期都只取最后 7 天，
   *     所以「近30天」也只有 7 个点，和左边卡片的合计口径（整个区间）完全对不上。
   *     现在改成整段区间一天一行，标签用 MM-DD（30 个点也不至于把轴挤爆）。
   *
   *   每一行都带齐 28 个字段 + 派生字段（extras），卡片点哪个指标都能画出完整曲线
   *   （以前行里只有调用方点名的几个字段，点别的卡片就是空图）。
   */
    /* 曲线图取多少个点（用户指定，别改）：
       N <= 6  ->  N + 6
       N >  6  ->  N * 2
     每个点 = 那一天的数据，label 是 MM-DD。
     数据不足的天给 0 点，不跳过（否则点数会变）。 */
  function graphPointCount(n) {
    n = Math.max(1, Math.floor(Number(n) || 1));
    return n <= 6 ? (n + 6) : (n * 2);
  }

function graphFrom(ctx, names) {
    /* 点数按规则算，日期从区间结束日往前推 count 天 */
    var nDays = (ctx && ctx.dayCount) || ((ctx && ctx.days) ? ctx.days.length : 1);
    var count = graphPointCount(nDays);
    var endDate = (ctx && (ctx.to || (ctx.days && ctx.days[ctx.days.length - 1]))) || null;
    var days = [];
    if (endDate && XY.XY_ADD_DAYS) {
      for (var gi = count - 1; gi >= 0; gi--) days.push(XY.XY_ADD_DAYS(endDate, -gi));
    } else {
      days = (ctx && ctx.days) ? ctx.days.slice(-count) : [];
    }
    var kinds = ['XY_ADD_FIELDS', 'XY_RATE_FIELDS', 'XY_STOCK_FIELDS'];
    var allFields = [];
    for (var a = 0; a < kinds.length; a++) {
      var arr = XY[kinds[a]] || [];
      for (var b = 0; b < arr.length; b++) allFields.push(arr[b]);
    }
    var rows = [];
    for (var i = 0; i < days.length; i++) {
      var d = (XY.XY_GET_DAILY ? XY.XY_GET_DAILY(days[i]) : null) || {};
      var row = { ds: String(days[i]).replace(/-/g, '') };   // 2026-10-21 -> 20261021               // 完整日期 YYYY-MM-DD（带年份）      // 'YYYY-MM-DD' -> 'MM-DD'
      for (var f = 0; f < allFields.length; f++) row[allFields[f]] = num(d[allFields[f]]);
      var ex = extras(d);
      for (var k in ex) { if (Object.prototype.hasOwnProperty.call(ex, k) && row[k] === undefined) row[k] = ex[k]; }
      for (var j = 0; j < (names || []).length; j++) {
        if (row[names[j]] === undefined) row[names[j]] = num(d[names[j]]);
      }
      rows.push(row);
    }
    return rows;
  }

  // mtop 响应里的「数据更新至」区间（页面按 realDateRange[1] 显示 xxx）
  function rangeInfo(ctx) {
    return { realDateRange: [ctx.fromCompact, ctx.toCompact] };
  }

  /* 顶部滚动公告（和日期无关，保持原样） */
  var PROMOTION = [
    { type: 'chengdan', promotionContent: '降价起量：预计提升曝光 30%', actionUrl: '#' },
    { type: 'other', promotionContent: '成单宝服务费预估 ¥12.30', actionUrl: '#' }
  ];

  /* ---------- 每个接口怎么从「哪一天/哪个区间」生成卡片 ---------- */
  var BUILDERS = {

    /* 概览 · 数据总览：10 卡 + 折线 */
    'mtop.alibaba.idle.seller.app.datacompass.singleuser.seller.summary': function (ctx) {
      return {
        data: {
          graphBannerBenchData: {
            bannerDataList: [
              cardFrom(ctx, 'vstPv', 'int'),        // 访问次数
              cardFrom(ctx, 'vstUv', 'int'),        // 访问人数
              cardFrom(ctx, 'showPv', 'int'),       // 商品曝光次数
              cardFrom(ctx, 'showUv', 'int'),       // 商品曝光人数
              cardFrom(ctx, 'ipv', 'int'),          // 商品浏览次数
              cardFrom(ctx, 'ipvUv', 'int'),        // 商品浏览人数
              cardFrom(ctx, 'payOrdCnt', 'int'),    // 支付笔数
              cardFrom(ctx, 'payAmt', 'r2'),        // 支付金额（元）
              cardFrom(ctx, 'rfdOrdCnt', 'int'),    // 发起退款笔数
              cardFrom(ctx, 'rfdAmt', 'r2')         // 发起退款金额（元）
            ],
            graphDataList: graphFrom(ctx, ['vstPv', 'vstUv', 'showPv', 'showUv', 'ipv', 'ipvUv',
              'payOrdCnt', 'payAmt', 'rfdOrdCnt', 'rfdAmt'])
          },
          promotionInfoList: PROMOTION
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 概览 · 商品数据 */
    'mtop.alibaba.idle.seller.app.datacompass.singleuser.item.summary': function (ctx) {
      return {
        data: {
          graphBannerBenchData: {
            bannerDataList: [
              cardFrom(ctx, 'onlCnt', 'int'),       // 在线商品数
              cardFrom(ctx, 'ipvItmCnt', 'int'),    // 被浏览的商品数
              cardFrom(ctx, 'stItmCnt', 'int'),     // 动销商品数
              cardEx(ctx, 'actItmCnt', 'int')       // 活动中商品数（派生）
            ],
            graphDataList: []
          }
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 概览 · 交易数据（漏斗 + 两个转化率，裸对象 itemFlowTransferData） */
    'mtop.alibaba.idle.seller.app.datacompass.flow.detail': function (ctx) {
      return {
        data: {
          itemFlowTransferData: {
            showUv: cardFrom(ctx, 'showUv', 'int'),          // 商品曝光人数 ← 漏斗第 1 段
            ipvUv: cardFrom(ctx, 'ipvUv', 'int'),            // 商品浏览人数 ← 漏斗第 2 段
            payUv: cardFrom(ctx, 'payUv', 'int'),            // 支付人数     ← 漏斗第 3 段
            uctr: cardFrom(ctx, 'uctr', 'r1'),               // 曝光点击率（%）
            ipvPayUcvr: cardFrom(ctx, 'ipvPayUcvr', 'r1'),   // 浏览支付转化率（%）
            chatCnt: cardFrom(ctx, 'chatCnt', 'int'),        // 询单人次
            chatUv: cardFrom(ctx, 'chatUv', 'int'),          // 询单人数
            rep3minUvRate: cardFrom(ctx, 'rep3minUvRate', 'int') // 3分钟响应率
          }
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 概览 · 售后数据（裸对象，不是 bannerDataList） */
    'mtop.alibaba.idle.seller.app.datacompass.refund.summary': function (ctx) {
      return {
        data: {
          crtRfdCnt: cardFrom(ctx, 'rfdOrdCnt', 'int'),        // 发起退款笔数
          crtDsptCnt: cardFrom(ctx, 'crtDsptCnt', 'int'),      // 维权笔数
          succRfdCnt: cardFrom(ctx, 'succRfdCnt', 'int'),      // 成功退款笔数
          dealingRfdCnt: cardFrom(ctx, 'dealingRfdCnt', 'int') // 处理中的退款笔数
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 概览 · 复购情况 */
    'mtop.alibaba.idle.seller.app.datacompass.singleuser.repurchase.summary': function (ctx) {
      return {
        data: {
          graphBannerBenchData: {
            bannerDataList: [
              cardFrom(ctx, 'rpr', 'r1'),          // 复购率（%）
              cardFrom(ctx, 'rptOrdCnt', 'int'),   // 复购订单数
              cardFrom(ctx, 'rptByrCnt', 'int')    // 复购人数
            ],
            graphDataList: graphFrom(ctx, ['rpr', 'rptOrdCnt', 'rptByrCnt'])
          }
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 粉丝 tab · 粉丝概览 */
    'mtop.alibaba.idle.seller.app.datacompass.fans.summary': function (ctx) {
      return {
        data: {
          graphBannerBenchData: {
            bannerDataList: [
              cardFrom(ctx, 'newFansCnt', 'int'),    // 新增粉丝数
              cardFrom(ctx, 'totalFansCnt', 'int'),  // 总粉丝数（存量，取区间最后一天）
              cardFrom(ctx, 'fansOrdRatio', 'r1')    // 粉丝订单占比（%）
            ],
            graphDataList: graphFrom(ctx, ['newFansCnt', 'totalFansCnt', 'fansOrdRatio'])
          }
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 客服 tab · 客服数据概览（8 卡，全部由询单/响应率派生） */
    'mtop.alibaba.idle.seller.app.datacompass.cs.overview.summary': function (ctx) {
      return {
        data: {
          graphBannerBenchData: {
            bannerDataList: [
              cardEx(ctx, 'consultUv', 'int'),       // 咨询人数(UV)
              cardEx(ctx, 'manualSessCnt', 'int'),   // 人工会话量
              cardEx(ctx, 'consultItmCnt', 'int'),   // 咨询商品数
              cardEx(ctx, 'visitorCnt', 'int'),      // 接待人数
              cardEx(ctx, 'avgRespTm', 'int'),       // 平均响应时长（秒）
              cardEx(ctx, 'firstAvgRespTm', 'int'),  // 首次平均响应时长（秒）
              cardEx(ctx, 'respRate3min', 'int'),    // 3分钟人工响应率
              cardEx(ctx, 'custSatRate', 'int')      // 客户满意率
            ],
            graphDataList: graphFrom(ctx, ['chatUv', 'chatCnt', 'ipvItmCnt', 'rep3minUvRate'])
          }
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 推广 tab · 推广效果 */
    'mtop.alibaba.idle.seller.app.datacompass.marketing.data.summary': function (ctx) {
      return {
        data: {
          graphBannerBenchData: {
            bannerDataList: [
              cardEx(ctx, 'actItmCnt', 'int'),        // 活动中商品数
              cardFrom(ctx, 'showPv', 'int'),         // 商品曝光次数
              cardFrom(ctx, 'ipv', 'int'),            // 商品浏览次数
              cardFrom(ctx, 'showUv', 'int'),         // 商品曝光人数
              cardFrom(ctx, 'ipvUv', 'int'),          // 商品浏览人数
              cardEx(ctx, 'payQty', 'int'),           // 支付件数
              cardFrom(ctx, 'payAmt', 'r2'),          // 支付金额
              cardEx(ctx, 'netPayAmt', 'r2'),         // 净支付金额
              cardEx(ctx, 'estPayFee', 'r2')          // 预估支付服务费
            ],
            graphDataList: graphFrom(ctx, ['showPv', 'ipv', 'showUv', 'ipvUv', 'payAmt', 'netPayAmt'])
          }
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 推广 tab · 无忧卖 / 成单宝 概览 */
    'mtop.alibaba.idle.seller.app.datacompass.easysale.overview': function (ctx) {
      return {
        data: {
          graphBannerBenchData: {
            bannerDataList: [
              cardEx(ctx, 'promItmCnt', 'int'),       // 活动中商品数
              cardFrom(ctx, 'showPv', 'int'),         // 商品曝光次数
              cardEx(ctx, 'clickPv', 'int'),          // 商品浏览次数 ← 默认选中的卡片，画图看它
              cardFrom(ctx, 'showUv', 'int'),         // 商品曝光人数
              cardEx(ctx, 'clickUv', 'int'),          // 商品浏览人数
              cardEx(ctx, 'payQuantity', 'int'),      // 支付件数
              cardFrom(ctx, 'payOrdCnt', 'int'),      // 支付笔数
              cardFrom(ctx, 'payAmt', 'r2'),          // 支付金额（元）
              cardEx(ctx, 'netPayAmt', 'r2'),         // 净支付金额（元）
              cardEx(ctx, 'showClickCvr', 'r1'),      // 曝光点击率
              cardEx(ctx, 'clickPayCvr', 'r1')        // 浏览支付转化率
            ],
            graphDataList: graphFrom(ctx, ['showPv', 'clickPv', 'showUv', 'clickUv',
              'payAmt', 'netPayAmt', 'showClickCvr', 'clickPayCvr'])
          }
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 浏览分布（分布数据本身和日期无关，但「数据更新至」要跟着区间走） */
    'mtop.alibaba.idle.seller.app.datacompass.singleuser.browse.summary': function (ctx) {
      return {
        data: {
          sceneSourceList: [dist('搜索', 42), dist('推荐', 26), dist('超级擦亮', 18), dist('其他', 14)],
          itemCateList: [dist('手机', 40), dist('数码', 35), dist('服饰', 15), dist('其他', 10)],
          buyerActiveList: [
            dist('8点-10点', 11), dist('10点-12点', 14), dist('12点-14点', 12), dist('14点-16点', 13),
            dist('16点-18点', 15), dist('18点-20点', 16), dist('20点-22点', 12), dist('22点-24点', 7)
          ],
          buyerProvinceList: [
            dist('杭州', 22), dist('上海', 18), dist('北京', 15), dist('广州', 11),
            dist('深圳', 9), dist('成都', 7), dist('南京', 6), dist('武汉', 5), dist('西安', 4), dist('重庆', 3)
          ]
        },
        extendInfo: rangeInfo(ctx)
      };
    },

    /* 粉丝洞察（同上） */
    'mtop.alibaba.idle.seller.app.datacompass.fans.insights.query': function (ctx) {
      return {
        data: {
          buyerGenderList: [dist('M', 62), dist('F', 38)],
          buyerEightTpList: [
            dist('未来之星', 8), dist('学生群体', 12), dist('小康青年', 21), dist('小资青年', 17),
            dist('家有儿女', 11), dist('勤俭持家', 9), dist('资深中产', 15), dist('退休长辈', 7),
            dist('模糊人群', 0)
          ],
          buyerProvinceList: [
            dist('杭州', 31), dist('上海', 24), dist('北京', 18), dist('广州', 12),
            dist('深圳', 9), dist('成都', 6), dist('南京', 5), dist('武汉', 4), dist('西安', 3), dist('重庆', 2)
          ],
          fansTypeList: [
            dist('A_流失粉', 9), dist('B_僵尸粉', 7), dist('C_沉默粉', 20), dist('D_活跃粉', 18),
            dist('E_亲密粉', 14), dist('F_超亲密粉', 6), dist('G_忠诚粉', 26)
          ]
        },
        extendInfo: rangeInfo(ctx)
      };
    }
  };

  /* mtop-mock.js 的入口：有 BUILDERS 的接口按「哪一天/哪个区间」现算，其余走静态 MOCK */
  window.XY_MOCK_FOR = function (api, req) {
    var b = BUILDERS[api];
    if (!b) return null;
    var ctx = dctx(req);
    if (!ctx) return null;
    try {
      return b(ctx);
    } catch (e) {
      if (window.console) console.warn('[mock data] builder failed: ' + api, e);
      return null;
    }
  };
  window.XY_MOCK_BUILDERS = BUILDERS;

  /* ===========================================================================
   *  数据总览（概览 tab 第一块）—— 卡片由上面的 BUILDERS 按日生成
   * ========================================================================= */
  // 列表里用的商品缩略图（本地 360x360，表格按 45x45 cover 渲染）
  // 原来用的是 2x2 占位图 —— 不报错但看起来是一块空白，换成真图
  var ITEM_PIC = './assets/img/O1CN017GHiwa1CFPAvw3rP2__6000000000051-2-tps-360-360.png';
  var ITEM_PIC_B = './assets/img/O1CN01WR3hz124JVvMf9Fyh__6000000007370-2-tps-360-360.png';
  var ITEM_PIC_C = './assets/img/O1CN01fEzTV81VzdhWGjeA8__6000000002724-2-tps-360-360.png';

  var MOCK = {

    /* =========================================================================
     * ① 准入相关（页面加载第一件事，返回空页面就会跳走）
     * ========================================================================= */

    // 灰度/权限查询：data.data 非空 = 放行
    'mtop.alibaba.idle.seller.common.query.user.gray.info': {
      data: { gray: true, hasPermission: true }        // 非空 = 有权限放行
    },

    // 数据起始时间（自定义日期选择器的最早可选日期）—— 跟着按日数据源的第一天走
    'mtop.alibaba.idle.seller.datacompass.get.begin.time': {
      data: (function () {
        var d = window.XY_FIRST_DAY || '2025-01-01';
        var p = d.split('-');
        return new Date(+p[0], +p[1] - 1, +p[2]).getTime();
      })()
    },

    // 商家信息：导航栏副标题 / 库存鱼引导
    'mtop.alibaba.idle.seller.app.datacompass.merchant.info.query': resp({
      sellerNick: '闲鱼小铺（本地演示）',                   // 账号名称
      accountStatus: '正常',                              // 账号状态
      shopDataTimeDescription: '今日数据于明日15点前更新',      // 导航栏下的说明文字
      stockFishMerchantActionUrl: ''                       // 非空会弹库存鱼引导
    }),

    /* =========================================================================
     * ②–⑦ 概览：数据总览 / 商品数据 / 交易数据 / 售后数据 / 复购情况 / 浏览分布
     * ★ 这些接口的卡片已经全部改成「按请求的日期从 window.XY_DAILY 现算」，
     *   生成逻辑在上面 BUILDERS 里（mock/daily-data.js 才是唯一的数字来源）。
     *   所以这里不再保留写死的卡片数值 —— 想改数字，去 mock/daily-data.js 改对应那一天。
     * ========================================================================= */

    /* =========================================================================
     * ⑧ 商品 tab —— 动态表头（服务端下发列定义）
     * ★ data.data 是 [{ subFields:[{name,title},...] }]
     * ======================================================================= */
    'mtop.alibaba.idle.seller.app.datacompass.item.indicators': {
      data: [{
          subFields: [
            { name: 'showPv', title: '商品曝光次数' },     // 曝光次数
            { name: 'showUv', title: '商品曝光人数' },     // 曝光人数
            { name: 'payByrCnt', title: '商品支付人数' },     // 支付人数
            { name: 'showPayCvr', title: '曝光-支付转化率' }, // 曝光→支付转化率
            { name: 'payAmt', title: '支付金额' },        // 支付金额
            { name: 'netPayAmt', title: '净支付金额' },     // 净支付金额
            { name: 'payQuantity', title: '支付件数' },       // 支付件数
            { name: 'payOrdCnt', title: '订单笔数' }       // 订单笔数
          ]
        }]
    },

    /* =========================================================================
     * ⑨ 商品 tab —— 商品效果列表（分页）
     * ======================================================================= */
    'mtop.alibaba.idle.seller.app.datacompass.item.list': resp({
      total: 5,
      list: [
        // 表格 cell 会被直接当 React child 渲染 —— 这里只能是字符串/数字，不能放 card 对象
        item('801234560', 'iPhone 14 Pro 256G 深空黑 国行 无锁', { showPv: '1,820', showUv: '1,420', payByrCnt: '12', showPayCvr: '0.8%', payAmt: '5,599.00', netPayAmt: '5,540.00', payQuantity: '12', payOrdCnt: '12' }),
        item('801234561', 'AirPods Pro 2 全新未拆封', { showPv: '960', showUv: '810', payByrCnt: '8', showPayCvr: '0.9%', payAmt: '1,592.00', netPayAmt: '1,575.00', payQuantity: '8', payOrdCnt: '8' }),
        item('801234562', 'iPad Air 5 64G 蓝色 轻微磕碰', { showPv: '640', showUv: '520', payByrCnt: '3', showPayCvr: '0.5%', payAmt: '2,880.00', netPayAmt: '2,850.00', payQuantity: '3', payOrdCnt: '3' }),
        item('801234563', '小米手环 8 NFC 版 九成新', { showPv: '410', showUv: '360', payByrCnt: '5', showPayCvr: '1.3%', payAmt: '645.00', netPayAmt: '638.00', payQuantity: '5', payOrdCnt: '5' }),
        item('801234564', '罗技 MX Master 3S 静音鼠标', { showPv: '305', showUv: '280', payByrCnt: '2', showPayCvr: '0.7%', payAmt: '718.00', netPayAmt: '710.00', payQuantity: '2', payOrdCnt: '2' })
      ]
    }),

    /* =========================================================================
     * ⑩ 粉丝 tab —— 粉丝概览
     * ★ 卡片按日生成（BUILDERS 里的 fans.summary），这里不再存数字
     * ======================================================================= */

    /* =========================================================================
     * ⑪ 粉丝 tab —— 粉丝洞察（同样是分布 map）
     *
     * ★ key 顺序 = 页面 tab 显示顺序（bundle 里 Jx 的 key 序是 性别/属性/地域/人群，
     *   但真机截图（IMG_0011 y=1346~1348）实测横向中心是
     *   性别(96) → 人群(238) → 地域(380) → 属性(522)，即人群在第 2、属性在第 4。
     *   这里按下发数据的 key 顺序重排，让渲染顺序与真机一致。）
     *     ① buyerGenderList   -> 性别分布
     *     ② buyerEightTpList  -> 人群分布（8 类人群）
     *     ③ buyerProvinceList -> 地域分布（前 10）
     *     ④ fansTypeList      -> 属性分布（7 类粉丝，页面有徽标说明）
     *
     *  ★ 分布的数字本身和「哪一天」无关，但「数据更新至」跟着请求区间走，
     *    所以这一块的 payload 也放进了 BUILDERS（见上方 fans.insights.query）。
     * ======================================================================= */

    /* =========================================================================
     * ⑫ 客服 tab —— 客服数据概览
     *
     *  卡片名严格对齐源码里的 J0 常量：
     *    consultUv 咨询人数(UV) / manualSessCnt 人工会话量 / consultItmCnt 咨询商品数 /
     *    visitorCnt 接待人数 / avgRespTm 平均响应时长 / firstAvgRespTm 首次平均响应时长 /
     *    respRate3min 3分钟人工响应率 / custSatRate 客户满意率
     *  ★ 这一组卡片的数字由「询单人次 / 询单人数 / 3分钟响应率」派生（见 BUILDERS 里
     *    cs.overview.summary + extras()），所以换日期也会跟着变。
     * ======================================================================= */

    // 客服明细数据（分页，pageSize 前端写死 10）
    // 客服明细数据（按客服账号维度；表格 cell 直接渲染，所以都是纯字符串）
    // ★ 第一列「账号名称」读的字段是 acctName（不是 accountName），少了它就整列显示 "-"
    'mtop.alibaba.idle.seller.app.datacompass.cs.detail.list': resp({
      total: 3,
      list: [
        { acctName: '客服小美', accountName: '客服小美', name: '客服小美', nick: '客服小美', subUserName: '客服小美', consultUv: '186', manualSessCnt: '172', visitorCnt: '172', consultItmCnt: '84', avgRespTm: '38', respRate3min: '99%', custSatRate: '97%', custSatCnt: '34', validReviewCnt: '36', validPosReviewCnt: '35', validNegReviewCnt: '1' },
        { acctName: '客服小林', accountName: '客服小林', name: '客服小林', nick: '客服小林', subUserName: '客服小林', consultUv: '140', manualSessCnt: '126', visitorCnt: '126', consultItmCnt: '57', avgRespTm: '47', respRate3min: '96%', custSatRate: '94%', custSatCnt: '23', validReviewCnt: '25', validPosReviewCnt: '23', validNegReviewCnt: '2' },
        { acctName: '未分配', accountName: '未分配', name: '未分配', nick: '未分配', subUserName: '未分配', consultUv: '0', manualSessCnt: '0', visitorCnt: '0', consultItmCnt: '0', avgRespTm: '-', respRate3min: '-', custSatRate: '-', custSatCnt: '0', validReviewCnt: '0', validPosReviewCnt: '0', validNegReviewCnt: '0' }
      ]
    }),

    // 客户评价明细（分页）
    'mtop.alibaba.idle.seller.app.datacompass.cs.evaluation.list': resp({
      total: 4,
      list: [
        { buyerUserName: '闲鱼用户A', buyerNick: 'buyer_a', subUserName: '客服小美', reviewTime: '2025-01-07 10:30', reviewScore: '5', dissatReason: '' },
        { buyerUserName: '闲鱼用户B', buyerNick: 'buyer_b', subUserName: '客服小美', reviewTime: '2025-01-07 11:25', reviewScore: '5', dissatReason: '' },
        { buyerUserName: '闲鱼用户C', buyerNick: 'buyer_c', subUserName: '客服小林', reviewTime: '2025-01-07 14:02', reviewScore: '4', dissatReason: '' },
        { buyerUserName: '闲鱼用户F', buyerNick: 'buyer_f', subUserName: '客服小林', reviewTime: '2025-01-07 17:11', reviewScore: '2', dissatReason: '回复太慢' }
      ]
    }),

    // 客服实时明细（唯一带 ext_headers: idle_site_biz_code=COMMON 的接口）
    'mtop.taobao.idlemessage.customers.data.query': resp({
      total: 3,
      list: [
        { buyerUserName: '闲鱼用户A', buyerNick: 'buyer_a', subUserName: '客服小美', status: '正在接待', lastMsgTime: '2025-01-07 17:20' },
        { buyerUserName: '闲鱼用户G', buyerNick: 'buyer_g', subUserName: '客服小林', status: '正在接待', lastMsgTime: '2025-01-07 17:22' },
        { buyerUserName: '闲鱼用户H', buyerNick: 'buyer_h', subUserName: '-', status: '等待接入', lastMsgTime: '2025-01-07 17:25' }
      ]
    }),

    /* =========================================================================
     * ⑬ 推广 tab —— 推广效果（卡片按日生成，见 BUILDERS 里的 marketing.data.summary）
     * ======================================================================= */

    // 推广商品列表（分页；tabType 传 'all'）
    'mtop.alibaba.idle.seller.app.datacompass.user.market.item.list': resp({
      total: 3,
      list: [
        { itmPicUrl: ITEM_PIC, itmName: 'iPhone 14 Pro 256G 深空黑', itemId: '801234560', itemImgUrl: ITEM_PIC, itemTitle: 'iPhone 14 Pro 256G 深空黑', showPv: '1,820', showUv: '1,420', ipv: '1,180', ipvUv: '960', payQty: '12', payAmt: '5,599.00', netPayAmt: '5,540.00', estPayFee: '55.99' },
        { itmPicUrl: ITEM_PIC_B, itmName: 'AirPods Pro 2 全新未拆封', itemId: '801234561', itemImgUrl: ITEM_PIC_B, itemTitle: 'AirPods Pro 2 全新未拆封', showPv: '960', showUv: '810', ipv: '700', ipvUv: '620', payQty: '8', payAmt: '1,592.00', netPayAmt: '1,575.00', estPayFee: '15.92' },
        { itmPicUrl: ITEM_PIC_C, itmName: '小米手环 8 NFC 版 九成新', itemId: '801234563', itemImgUrl: ITEM_PIC_C, itemTitle: '小米手环 8 NFC 版 九成新', showPv: '410', showUv: '360', ipv: '300', ipvUv: '270', payQty: '5', payAmt: '645.00', netPayAmt: '638.00', estPayFee: '6.45' }
      ]
    }),

    // 无忧卖 / 成单宝 概览 —— 卡片按日生成，见 BUILDERS 里的 easysale.overview

    // 无忧卖 商品明细
    // 推广 tab「商品效果」表格。行是扁平的，单元格直接渲染 → 纯字符串
    'mtop.alibaba.idle.seller.app.datacompass.easysale.item.detail.list': resp({
      total: 3,
      list: [
        { itmPicUrl: ITEM_PIC, itmName: 'iPhone 14 Pro 256G 深空黑', itemId: '801234560', itemImgUrl: ITEM_PIC, itemTitle: 'iPhone 14 Pro 256G 深空黑', showPv: '1,820', showUv: '1,420', payByrCnt: '12', showPayCvr: '0.8%', payAmt: '5,599.00', netPayAmt: '5,540.00', payQuantity: '12', payOrdCnt: '12', actionText: '去降价', actionUrl: '#' },
        { itmPicUrl: ITEM_PIC_B, itmName: 'AirPods Pro 2 全新未拆封', itemId: '801234561', itemImgUrl: ITEM_PIC_B, itemTitle: 'AirPods Pro 2 全新未拆封', showPv: '960', showUv: '810', payByrCnt: '8', showPayCvr: '0.9%', payAmt: '1,592.00', netPayAmt: '1,575.00', payQuantity: '8', payOrdCnt: '8', actionText: '去降价', actionUrl: '#' },
        { itmPicUrl: ITEM_PIC_C, itmName: '小米手环 8 NFC 版 九成新', itemId: '801234563', itemImgUrl: ITEM_PIC_C, itemTitle: '小米手环 8 NFC 版 九成新', showPv: '410', showUv: '360', payByrCnt: '5', showPayCvr: '1.3%', payAmt: '645.00', netPayAmt: '638.00', payQuantity: '5', payOrdCnt: '5', actionText: '已完成', actionUrl: '' }
      ]
    }),

    // 无忧卖 策略信息
    'mtop.alibaba.idle.seller.app.datacompass.easysale.strategy.info': resp({
      strategyList: [
        { strategyType: 'DISCOUNT_BOOSTING_TASK', title: '降价起量', desc: '预计提升曝光 30%' },
        { strategyType: 'DISCOUNT_BOOSTED_TASK', title: '已成单', desc: '保持当前价格' }
      ]
    }),

    // 推广增强信息
    'mtop.taobao.idle.bpro.marketing.info.enhance.query': resp({
      enhanceList: []
    }),

    /* =========================================================================
     * ⑭ 其它（兜底，防止某处取值 undefined）
     * ======================================================================= */
    'mtop.idle.user.simple': { data: { userId: 10000001, nick: '闲鱼卖家' } },
    'mtop.idle.idleadv.tb.applet.device.info': { data: { deviceId: 'LOCAL-DEVICE' } },
    'mtop.idle.idleadv.behavior.event.report': { data: {} },
    'mtop.idle.idleadv.app.launch.report': { data: {} },
    'mtop.taobao.idle.growth.external.action.record': { data: {} },
    'mtop.taobao.idle.adv.appmarket.info.get': { data: { appMarketUrl: '' } },
    'mtop.taobao.idle.check.upgrade.sync': { data: {} },
    'mtop.idle.wx.api.ticket.get': { data: { appId: '', timestamp: '', nonceStr: '', signature: '' } },
    'mtop.alibaba.idle.shop.incentive.task.sync': { data: {} }
  };

  // 商品效果列表的一行。注意：表格 cell 会被直接渲染，所以值必须是字符串/数字
  function item(itmId, itmName, vals) {
    // 两个表头各读一套字段名（商品 tab 读 itmPicUrl/itmName，无忧卖 tab 读 itemImgUrl/itemTitle），
    // 所以这里两套都给，避免其中一列表头取不到值 → <img src={undefined}> 变破图
    var o = { itmId: itmId, itmName: itmName, itmPicUrl: ITEM_PIC, itemId: itmId, itemTitle: itmName, itemImgUrl: ITEM_PIC };
    for (var k in vals) o[k] = vals[k];
    return o;
  }

  window.XY_MOCK = MOCK;
  window.XY_MOCK_CARD = card;
  window.XY_MOCK_DIST = dist;
  window.XY_MOCK_RESP = resp;
})();
