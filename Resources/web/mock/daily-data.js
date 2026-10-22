/* =============================================================================
 *  mock/daily-data.js —— 按日共享数据源（两页共用：一天一份完整指标）
 * =============================================================================
 *  谁在读这份数据：
 *    · mock/data.js        小铺数据（经营罗盘）：概览/商品/交易/售后/复购/粉丝/客服/推广
 *    · mock/wb-data.js     鱼小铺工作台：「小铺昨日数据」那 4 个指标
 *    · mock/mtop-mock.js   把请求里的 dateType / dateRange 折算成「哪一天」或「哪个区间」
 *  两页读的是同一份 XY_DAILY，所以同一天的数字永远一致 —— 不再各存一份。
 *
 *  ★ 现在数据在服务器上（xianyu-server），本文件只负责把数据灌进来
 *      后端（公开只读，无需登录）：
 *            GET /api/public/xianyu/daily       -> { dates, first, last, today, yesterday, data:{ 'YYYY-MM-DD': {...} } }
 *            GET /api/public/xianyu/dates       -> { dates, first, last, today, yesterday }
 *            GET /api/public/xianyu/daily/range -> 区间聚合（和下面 XY_GET_RANGE 同形）
 *      电脑上打开 域名/admin/  就能改任意一天的数字，手机上刷新页面立刻看到。
 *
 *      开关：window.XY_DAILY_BACKEND = { mode: 'remote', url: 'https://<域名>/api/public/xianyu/daily' }
 *        · 默认 url 固定指向服务器的公开只读接口（匿名可读），不再按当前目录推算
 *        · 'remote' -> 启动时同步拉一次接口，把服务器数据灌进 XY_DAILY
 *        · 'local'  -> 只用本文件里写死的那份（离线/服务器挂了调试用）
 *
 *  ★ 为什么是「同步」拉
 *      两页的 bundle 一加载就会立刻读 XY_GET_DAILY，如果异步拉，首屏必然先渲染成 0。
 *      所以这里用同步 XHR 在脚本返回前把数据准备好 —— 首屏第一帧就是真数据。
 *      （控制台会有一行 "Synchronous XMLHttpRequest ... deprecated" 的提示，
 *        这是提示不是报错，页面功能完全不受影响。）
 *
 *  ★ 兜底
 *      服务器连不上 -> 用 buildFallback() 生成的 61 天全 0 数据，页面照样能开，不会白屏。
 *      XY_DAILY_SOURCE = 'remote' | 'fallback' | 'local'，控制台能直接看现在是哪种。
 *
 *  ★ 鱼小铺「小铺昨日数据」的 4 个指标 = 同一天这 4 个字段（不再单独存一份）
 *      宝贝曝光数 = showPv     宝贝浏览数 = ipv
 *      订单数     = payOrdCnt  支付金额   = payAmt（四舍五入成整数再渲染数字图）
 *
 *  ★ 聚合口径（近7天 / 近30天 / 自定义区间都按这个算，见 XY_GET_RANGE）
 *      求和：访问/曝光/浏览/支付/退款/粉丝新增/复购订单…（ADD_FIELDS）
 *      平均：各种率（曝光点击率 / 浏览支付转化率 / 3分钟响应率 / 粉丝订单占比 / 复购率）
 *      取区间最后一天：在线商品数 / 被浏览商品数 / 动销商品数 / 总粉丝数（存量值）
 *      环比（change / ratioFormat）：和「紧邻前面、同样长度的区间」比
 *      —— 服务器 /api/daily/range 用的是完全相同的三个数组和同样的舍入，两边数字必然一致。
 * ========================================================================== */

(function () {
  'use strict';

  /* ===========================================================================
   *  0. 后端开关（放最前面，下面 bootstrap 要读它）
   * ========================================================================= */
  /* ★ 接口地址：展示页（App 内嵌 / /preview/ / file://）统一打服务器的
   *   公开只读接口  /api/public/<pid>/daily  —— 服务端完全不校验身份，读数据不要登录。
   *
   *   为什么必须是绝对地址、不能按当前目录推算：
   *     · App 内嵌时页面是 file:// 打开的，location.origin 是 'null'，相对路径直接废；
   *     · 页面可能挂在 /preview/ 或任意子路径下，按目录拼出来的路径不可靠。
   *
   *   换域名（打包 IPA 时换成自己的接口域名），在 HTML 里、本文件之前加一行：
   *     window.XY_API_ORIGIN = 'https://your-domain';
   *   想省掉跨域（接口和页面同域），把它设成空串：
   *     window.XY_API_ORIGIN = '';      ->  '/api/public/xianyu/daily'
   *   换软件（多 project）：
   *     window.XY_API_PROJECT = 'demo';
   *
   *   HTML 里显式赋值 window.XY_DAILY_BACKEND 时以 HTML 为准（下面的 || 不会覆盖）。 */
  var DEFAULT_API_ORIGIN = 'https://pulm-ai.work';

  function apiOrigin() {
    var o = window.XY_API_ORIGIN;
    if (o === undefined || o === null) o = DEFAULT_API_ORIGIN;
    return String(o).replace(/\/+$/, '');        // '' 保持 ''，'https://x/' 收成 'https://x'
  }

  function defaultBackendUrl() {
    // 展示页可能部署在 /preview/、App 本地 file:// 或任意子路径，
    // 统一指向服务器的公开只读接口
    var ORIGIN = apiOrigin();
    var PROJECT = window.XY_API_PROJECT || 'xianyu';
    return ORIGIN + '/api/public/' + PROJECT + '/daily';
  }

  window.XY_DAILY_BACKEND = window.XY_DAILY_BACKEND || {
    mode: 'remote',                  // 'remote' = 拉接口；'local' = 只用本地兜底数据
    url: defaultBackendUrl()
  };

  /* ===========================================================================
   *  1. 日期工具
   * ========================================================================= */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // 接受 'YYYY-MM-DD' / 'YYYYMMDD' / 'YYYY.MM.DD' / Date
  function parseDate(s) {
    if (s && typeof s === 'object' && typeof s.getFullYear === 'function') return new Date(s.getTime());
    var t = String(s === null || s === undefined ? '' : s).replace(/\s+/g, '');
    var m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(t);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  function normKey(s) { var d = parseDate(s); return d ? fmtDate(d) : null; }
  function addDays(s, n) { var d = parseDate(s); if (!d) return null; d.setDate(d.getDate() + n); return fmtDate(d); }
  function compact(s) { var k = normKey(s); return k ? k.replace(/-/g, '') : ''; }

  window.XY_FMT_DATE = fmtDate;
  window.XY_PARSE_DATE = parseDate;
  window.XY_ADD_DAYS = addDays;
  window.XY_COMPACT_DATE = compact;          // '2026-10-21' -> '20261021'（mtop 的 realDateRange 要这个格式）
  window.XY_TODAY = function () { return fmtDate(new Date()); };
  window.XY_YESTERDAY = function () { return addDays(fmtDate(new Date()), -1); };

  /* ===========================================================================
   *  2. 聚合口径：哪些字段求和 / 取平均 / 取区间最后一天
   *     ★ 改这里必须同时改 xianyu-server/server.js 里的三个同名数组，
   *       否则 /api/daily/range 和前端算出来的数会对不上。
   * ========================================================================= */
  var ADD_FIELDS = ['vstPv', 'vstUv', 'showPv', 'showUv', 'ipv', 'ipvUv', 'payOrdCnt', 'payAmt',
    'payUv', 'chatCnt', 'chatUv', 'newFansCnt', 'rptOrdCnt', 'rptByrCnt', 'rfdOrdCnt', 'rfdAmt',
    'crtDsptCnt', 'succRfdCnt', 'dealingRfdCnt'];
  var RATE_FIELDS = ['uctr', 'ipvPayUcvr', 'rep3minUvRate', 'fansOrdRatio', 'rpr'];
  var STOCK_FIELDS = ['onlCnt', 'ipvItmCnt', 'stItmCnt', 'totalFansCnt'];

  // 一天 28 个字段的全集（顺序 = 后台表单的分组顺序无关，只用来补 0）
  var ALL_FIELDS = ADD_FIELDS.concat(RATE_FIELDS, STOCK_FIELDS);

  window.XY_ADD_FIELDS = ADD_FIELDS;
  window.XY_RATE_FIELDS = RATE_FIELDS;
  window.XY_STOCK_FIELDS = STOCK_FIELDS;

  function num2(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // 环比百分比：除零（或没基数）给 0
  window.XY_RATIO = function (cur, prev) {
    var c = Number(cur), p = Number(prev);
    if (!isFinite(c) || !isFinite(p) || !p) return 0;
    return round1((c - p) / p * 100);
  };

  /* ===========================================================================
   *  3. 空日 / 兜底数据
   * ========================================================================= */
  function emptyDay() {
    var o = {}, i;
    for (i = 0; i < ALL_FIELDS.length; i++) o[ALL_FIELDS[i]] = 0;
    return o;
  }
  window.XY_EMPTY_DAY = emptyDay;

  /* 服务器连不上时用的兜底：61 天全 0（源数据 60 天 2026-08-23~2026-10-21，再补今天） */
  var FALLBACK_FIRST = '2026-08-23';
  var FALLBACK_LAST = '2026-10-22';

  function buildFallback() {
    var map = {}, cur = FALLBACK_FIRST, guard = 0;
    while (cur && cur <= FALLBACK_LAST && guard < 400) {
      map[cur] = emptyDay();
      cur = addDays(cur, 1);
      guard++;
    }
    return map;
  }

  /* 数据本体：bootstrap 会就地替换它的内容（window.XY_DAILY 引用不变） */
  var XY_DAILY = buildFallback();
  window.XY_DAILY = XY_DAILY;

  /* ===========================================================================
   *  4. 远程引导：同步把服务器数据灌进 XY_DAILY
   * ========================================================================= */
  function syncGetJson(url) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, false);                    // 同步：本脚本返回前必须准备好数据
      x.setRequestHeader('Accept', 'application/json');
      x.send(null);
      if (x.status !== 200) {
        window.__log__ && window.__log__('[daily] GET ' + url + ' -> ' + x.status);
        return null;
      }
      return JSON.parse(x.responseText);
    } catch (e) {
      window.__log__ && window.__log__('[daily] GET ' + url + ' 失败: ' + (e && e.message));
      return null;
    }
  }

  (function bootstrap() {
    window.XY_DAILY_SOURCE = 'fallback';

    var be = window.XY_DAILY_BACKEND || {};
    if (be.mode !== 'remote' || !be.url) { window.XY_DAILY_SOURCE = 'local'; return; }

    var url = String(be.url);
    // ① 一次把全部天拉回来（60 天 ~11 KB，比发 60 个请求好得多）
    var bulk = syncGetJson(url);
    if (!bulk || !bulk.data || typeof bulk.data !== 'object') {
      window.__log__ && window.__log__('[daily] 接口不可用，用本地兜底 ' + FALLBACK_FIRST + '~' + FALLBACK_LAST);
      return;
    }

    // 兜底那份先整体清空，完全以接口为准（接口键可能是 'YYYY-MM-DD' 也可能是 'YYYYMMDD'）
    for (var old in XY_DAILY) {
      if (Object.prototype.hasOwnProperty.call(XY_DAILY, old)) delete XY_DAILY[old];
    }

    var n = 0;
    var src = bulk.data;
    for (var rawKey in src) {
      if (!Object.prototype.hasOwnProperty.call(src, rawKey)) continue;
      var k = normKey(rawKey);
      if (!k) continue;
      var day = emptyDay(), one = src[rawKey] || {}, i;
      for (i = 0; i < ALL_FIELDS.length; i++) day[ALL_FIELDS[i]] = num2(one[ALL_FIELDS[i]]);
      XY_DAILY[k] = day;
      n++;
    }
    window.XY_DAILY_SOURCE = 'remote';
    window.__log__ && window.__log__('[daily] 从接口载入 ' + n + ' 天');

    // ② 再问一下日期范围（服务器口径的 first/last/today/yesterday）
    var meta = syncGetJson(url.replace(/\/+daily\/?$/, '/dates'));
    if (meta && meta.dates) window.XY_DAILY_META = meta;
  })();

  /* ===========================================================================
   *  ★ 统一数据入口（两页都用这两个，换后端只改这两个函数）
   * ========================================================================= */

  // 单日：'YYYY-MM-DD'（也吃 'YYYYMMDD'）-> 那一天的完整指标对象
  window.XY_GET_DAILY = function (dateStr) {
    var k = normKey(dateStr);
    if (!k) return null;
    // 接口里没有这一天（比如未来的日期）-> 补一份全 0 并写回缓存。
    // 数据统一由后台管，页面上不该出现"自己长出来的随机数字"。
    if (!XY_DAILY[k]) XY_DAILY[k] = emptyDay();
    return XY_DAILY[k];
  };

  // 一组日期 -> 按口径合并成「单日形状」的对象
  function mergeDays(days) {
    var out = {}, i, j, k, s;
    for (i = 0; i < ADD_FIELDS.length; i++) {
      k = ADD_FIELDS[i]; s = 0;
      for (j = 0; j < days.length; j++) s += num2(window.XY_GET_DAILY(days[j])[k]);
      out[k] = round2(s);
    }
    for (i = 0; i < RATE_FIELDS.length; i++) {
      k = RATE_FIELDS[i]; s = 0;
      for (j = 0; j < days.length; j++) s += num2(window.XY_GET_DAILY(days[j])[k]);
      out[k] = round1(s / (days.length || 1));
    }
    for (i = 0; i < STOCK_FIELDS.length; i++) {
      k = STOCK_FIELDS[i];
      out[k] = num2(window.XY_GET_DAILY(days[days.length - 1] || days[0])[k]);
    }
    return out;
  }
  window.XY_DAILY_MERGE = mergeDays;

  // 区间聚合：XY_GET_RANGE('2026-10-15','2026-10-21')
  //   -> { from, to, fromCompact, toCompact, days[], dayCount,
  //        data:{单日形状的聚合值}, prev:{紧邻前一等长区间的聚合值}, prevFrom, prevTo }
  window.XY_GET_RANGE = function (fromStr, toStr) {
    var from = normKey(fromStr), to = normKey(toStr);
    if (!from || !to) return null;
    if (from > to) { var t = from; from = to; to = t; }

    var days = [], cur = from, guard = 0;
    while (cur <= to && guard < 400) { days.push(cur); cur = addDays(cur, 1); guard++; }
    if (!days.length) return null;

    var len = days.length;
    var prevFrom = addDays(from, -len), prevTo = addDays(from, -1);
    var prevDays = [], c2 = prevFrom, g2 = 0;
    while (c2 <= prevTo && g2 < 400) { prevDays.push(c2); c2 = addDays(c2, 1); g2++; }

    return {
      from: from,
      to: to,
      fromCompact: compact(from),
      toCompact: compact(to),
      days: days,
      dayCount: len,
      data: mergeDays(days),
      prevFrom: prevFrom,
      prevTo: prevTo,
      prev: mergeDays(prevDays)
    };
  };

  // 接口请求 -> 区间上下文。req = { dateType, dateRange } 或 mtop 的 opt（opt.data 里放着它）
  window.XY_RESOLVE_RANGE = function (req) {
    var d = (req && req.data) || req || {};
    var t = d.dateType || (req && req.dateType) || 'recent1d';
    var r = (d.dateRange !== undefined ? d.dateRange : (req && req.dateRange));
    var y = window.XY_YESTERDAY();

    if ((t === 'customDate' || t === 'custom') && r) {
      var p = String(r).split('|');
      var c = window.XY_GET_RANGE(p[0], p[1]);
      if (c) { c.dateType = t; return c; }
    }
    var n = (t === 'recent7d') ? 7 : (t === 'recent30d' ? 30 : 1);
    var ctx = window.XY_GET_RANGE(addDays(y, -(n - 1)), y);
    ctx.dateType = t;
    ctx.dayCount = n;
    return ctx;
  };

  /* ---------- 数据可用范围（自定义日期选择的上下限用得到） ---------- */
  var KEYS = [];
  for (var kk in XY_DAILY) { if (Object.prototype.hasOwnProperty.call(XY_DAILY, kk)) KEYS.push(kk); }
  KEYS.sort();
  var META = window.XY_DAILY_META || {};

  window.XY_DAILY_KEYS = KEYS;
  window.XY_FIRST_DAY = META.first || KEYS[0] || window.XY_TODAY();
  window.XY_LAST_DAY = META.last || KEYS[KEYS.length - 1] || window.XY_YESTERDAY();
  window.XY_LAST_UPDATED = window.XY_LAST_DAY;      // 「数据更新至」= 有数据的最新一天

  /* ===========================================================================
   *  异步入口（需要在页面渲染后主动刷新数据时用；正常首屏走的是同步引导）
   * ========================================================================= */
  window.XY_FETCH_DAILY = function (dateStr) {
    var k = normKey(dateStr);
    var be = window.XY_DAILY_BACKEND || {};
    if (be.mode !== 'remote' || !be.url) return Promise.resolve(window.XY_GET_DAILY(k));
    return fetch(be.url + '?date=' + compact(k), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (obj) {
        if (obj && typeof obj === 'object' && !obj.error) XY_DAILY[k] = obj;
        return XY_DAILY[k];
      });
  };

  window.XY_FETCH_RANGE = function (fromStr, toStr) {
    var be = window.XY_DAILY_BACKEND || {};
    if (be.mode !== 'remote' || !be.url) return Promise.resolve(window.XY_GET_RANGE(fromStr, toStr));
    return fetch(be.url + '/range?from=' + compact(fromStr) + '&to=' + compact(toStr), { cache: 'no-store' })
      .then(function (r) { return r.json(); });
    // 后端返回 { from, to, fromCompact, toCompact, days:[], data:{}, prev:{} } —— 和 XY_GET_RANGE 同形
  };

  window.XY_DAILY_READY = true;
})();
