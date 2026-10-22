/* =============================================================================
 *  小铺数据（经营罗盘）—— mtop 拦截层 / 不需要改这里
 * =============================================================================
 *  原理：
 *    1. operate-compass.js 里 aI = window.lib.mtop，初始化时捕获一次，
 *       之后所有请求都走 aI.request(opt)。
 *    2. bundle 自己内置了 universal-mtop 2.7.2，初始化时会把
 *       window.lib.mtop = ... 和 window.lib.mtop.request = ... 整个覆盖掉。
 *       所以这里用 Proxy + defineProperty 先把 lib.mtop 锁住：
 *       读 request 永远返回我们的 mock，写 request 直接吞掉。
 *    3. mock 返回的响应体就是 mtop 的完整响应：
 *       { api, v, ret:['SUCCESS::调用成功'], data:{ data:{...}, extendInfo:{...} } }
 *       ret 里带 SUCCESS 才会被判成功。
 * ========================================================================== */
(function () {
  'use strict';

  var MOCK = window.XY_MOCK || {};
  // 「数据更新至」兜底区间：跟着按日数据源走（有数据的第一天 .. 最新一天）
  var DEFAULT_RANGE = {
    realDateRange: [
      String(window.XY_FIRST_DAY || '2025-01-01').replace(/-/g, ''),
      String(window.XY_LAST_UPDATED || (window.XY_YESTERDAY && window.XY_YESTERDAY()) || '2025-01-07').replace(/-/g, '')
    ]
  };

  // 页面会第一个调 gray.info 做准入判断；返回空就会跳走，所以即使 JSON 里漏配也要兜住
  var FORCED = {
    'mtop.alibaba.idle.seller.common.query.user.gray.info': { data: { gray: true, hasPermission: true } }
  };

  /* ---------------------------------------------------------------------------
   *  动态环比周期文案（cycle）
   *  官方 bundle 里 cycle 是接口直接给的固定串，切换「近7天 / 近30天 / 自定义」
   *  时不会变。mock 层按请求参数算出正确文案，再写回所有卡片。
   *  请求参数：opt.data = { dateType: 'recent1d'|'recent7d'|'recent30d'|'customDate',
   *                        dateRange: 'YYYYMMDD|YYYYMMDD' 或 '' }
   * ------------------------------------------------------------------------ */
  function calcCycle(req) {
    var d = (req && req.data) || {};
    var t = d.dateType;
    if (t === 'recent1d') return '较前1日';
    if (t === 'recent7d') return '较前7日';
    if (t === 'recent30d') return '较前30日';
    if ((t === 'customDate' || t === 'custom') && d.dateRange) {
      var p = String(d.dateRange).split('|');
      var a = p[0], b = p[1];
      if (a && b && a.length === 8 && b.length === 8) {
        var d1 = new Date(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6, 8));
        var d2 = new Date(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8));
        var days = Math.round(Math.abs(d2 - d1) / 86400000) + 1;   // 含首尾
        if (days > 0) return '较前' + days + '日';
      }
      return '较前1日';
    }
    return '较前1日';
  }

  // 深拷贝：避免多次请求互相覆盖同一份 mock 对象
  function clone(v) {
    if (v === null || typeof v !== 'object') return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  // 递归把所有卡片对象上的 cycle 换成动态值（卡片散落在 bannerDataList / 裸对象 / 嵌套层里）
  function applyCycle(node, cycle, depth) {
    if (!node || typeof node !== 'object' || (depth || 0) > 8) return node;
    if (Object.prototype.toString.call(node) === '[object Array]') {
      for (var i = 0; i < node.length; i++) applyCycle(node[i], cycle, (depth || 0) + 1);
      return node;
    }
    for (var k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      var v = node[k];
      if (k === 'cycle' && typeof v === 'string' && v.indexOf('较前') === 0) {
        node[k] = cycle;
      } else if (v && typeof v === 'object') {
        applyCycle(v, cycle, (depth || 0) + 1);
      }
    }
    return node;
  }

  function payloadFor(api, req, cycle) {
    var pay = null;

    /* ① 先问「按日数据源」：mock/data.js 里的 BUILDERS 会按请求的
     *    dateType / dateRange 从 window.XY_DAILY 现算这一天的卡片。
     *    —— 鱼小铺「小铺昨日数据」读的是同一份 XY_DAILY，所以两页永远一致。 */
    if (window.XY_MOCK_FOR) {
      var built = window.XY_MOCK_FOR(api, req);
      if (built) pay = { data: built.data, extendInfo: built.extendInfo || DEFAULT_RANGE };
    }

    /* ② 没有按日生成器的接口（商品表头 / 明细列表 / 分布图之类）走静态 MOCK */
    if (!pay) {
      if (FORCED[api]) {
        pay = { data: FORCED[api].data, extendInfo: DEFAULT_RANGE };
      } else {
        var p = MOCK[api] || {};
        pay = {
          data: (p.data !== undefined ? p.data : {}),
          extendInfo: p.extendInfo || DEFAULT_RANGE
        };
      }
    }

    pay.data = applyCycle(clone(pay.data), cycle);

    /* ③ 「数据更新至」永远取这次请求对应的真实区间（昨日 / 近7天 / 自定义），
     *    不再用写死的 2025.01.07。页面渲染 realDateRange[1]。 */
    if (window.XY_RESOLVE_RANGE) {
      var ctx = window.XY_RESOLVE_RANGE(req || {});
      if (ctx) pay.extendInfo = { realDateRange: [ctx.fromCompact, ctx.toCompact] };
    } else if (req) {
      var rd = (req.data || {});
      if ((rd.dateType === 'customDate' || rd.dateType === 'custom') && rd.dateRange) {
        var rp = String(rd.dateRange).split('|');
        if (rp[0] && rp[1]) pay.extendInfo = { realDateRange: [rp[0], rp[1]] };
      }
    }
    return pay;
  }

  var counter = 0;
  var log = [];
  var reqLog = [];          // { api, dateType, dateRange, cycle } —— 供验证脚本 / 调试读取

  var MOCK_REQUEST = function (opt) {
    var api = (opt && opt.api) || '(no api)';
    counter++;
    log.push(api);
    var cycle = calcCycle(opt);
    var d = (opt && opt.data) || {};
    reqLog.push({ api: api, dateType: d.dateType, dateRange: d.dateRange, cycle: cycle });
    if (reqLog.length > 200) reqLog.shift();
    if (window.__XY_DEBUG__) console.log('[mock mtop #' + counter + '] ' + api + ' cycle=' + cycle, d);
    return Promise.resolve({
      api: api,
      v: (opt && opt.v) || '1.0',
      ret: ['SUCCESS::调用成功'],
      data: payloadFor(api, opt, cycle)
    });
  };

  window.__XY_MTOP_CALLS__ = log;
  window.__XY_MTOP_REQS__ = reqLog;
  window.__XY_CALC_CYCLE__ = calcCycle;
  window.__XY_MOCK_REQUEST__ = MOCK_REQUEST;

  /* ---------- 锁住 window.lib.mtop ---------- */
  var holder = function mtopHolder() { return {}; };
  var proxy = new Proxy(holder, {
    get: function (t, k) {
      if (k === 'request' || k === 'H5Request' ||
        k === 'loginRequest' || k === 'antiFloodRequest' || k === 'antiCreepRequest') return MOCK_REQUEST;
      return t[k];
    },
    set: function (t, k, v) { t[k] = v; return true; },
    has: function (t, k) { return k in t; },
    apply: function () { return {}; }
  });

  var lib = window.lib || (window.lib = {});
  Object.defineProperty(lib, 'mtop', {
    configurable: true,
    enumerable: true,
    get: function () { return proxy; },
    set: function (v) { try { Object.assign(holder, v); } catch (e) { } }
  });

  /* ---------- 其它环境桩 ---------- */
  window.goldlog = window.goldlog || { record: function () { } };
  window.goldlog_queue = window.goldlog_queue || [];
  window.aplus = window.aplus || { record: function () { } };
  window.aplus_queue = window.aplus_queue || [];
  window.globalPageName = window.globalPageName || '/firsthandseller.data';
  window.globalSpmA = window.globalSpmA || 'a2001';
  window.globalSpmB = window.globalSpmB || '30339800';

  // 风控 token（只有 data.asac 存在时才用；给了也不影响）
  window.fyOBJ = window.fyOBJ || {
    getFYToken: function () { return 'LOCAL_FY_TOKEN'; },
    getUidToken: function () { return 'LOCAL_UMID_TOKEN'; }
  };

  // 客户端原生能力桩：消掉 "该环境下 api 不支持" 的 noise，并给出状态栏高度
  if (!window.WindVane) {
    window.WindVane = {
      call: function (cls, method, params, success) {
        if (typeof success === 'function') {
          if (method === 'getSystemInfo' || /getSystemInfo/i.test(String(method))) {
            success({ statusBarHeight: 44, windowWidth: 390, windowHeight: 844 });
          } else {
            success({});
          }
        }
      }
    };
  }
  if (!window.WVIdleFishApi) {
    window.WVIdleFishApi = {
      getSystemInfo: function (cb) { cb && cb({ statusBarHeight: 44 }); },
      setNavigationBarVisible: function () { },
      getUserInfo: function (cb) { cb && cb({ userId: 10000001, nick: '闲鱼卖家' }); }
    };
  }
  // 有些版本读 window.lib.windvane
  if (lib && !lib.windvane) lib.windvane = window.WindVane;

  // file:// 下 localStorage 可能抛异常，包一层
  try {
    window.localStorage.getItem('__t');
    window.localStorage.setItem('__t', '1');
    window.localStorage.removeItem('__t');
  } catch (e) {
    var mem = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: function (k) { return k in mem ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; },
        clear: function () { mem = {}; },
        key: function (i) { return Object.keys(mem)[i] || null; },
        get length() { return Object.keys(mem).length; }
      }
    });
  }

  window.__XY_READY__ = true;
})();
