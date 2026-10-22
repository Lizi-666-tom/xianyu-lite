/* =============================================================================
 *  鱼小铺 · 工作台 —— mtop 拦截层 / 环境桩（一般不用改）
 * =============================================================================
 *  与 operate-compass 那一页的差异：
 *    1. 这一页的请求帮助函数是 sh({api,data,v,type}) -> res，页面读 res.data 当负载，
 *       所以 mock 响应的 data 直接放负载（不再套一层 .data.data）
 *    2. 它用 createRoot(document.body) 挂载 —— 整个 body 都是 React 根节点
 *    3. 它要 window.__fetch_preload_scripts__（否则会去 CDN 拉 lib-login）
 * ========================================================================== */
(function () {
  'use strict';

  var MOCK = window.WB_MOCK || {};
  var calls = [];
  var reqs = [];

  function clone(v) {
    if (v === null || typeof v !== 'object') return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  var MOCK_REQUEST = function (opt) {
    var api = (opt && opt.api) || '(no api)';
    calls.push(api);
    reqs.push({ api: api, data: clone((opt || {}).data), v: (opt || {}).v, type: (opt || {}).type });
    if (calls.length > 300) calls.shift();
    var p = MOCK[api] || {};
    var payload = p.data !== undefined ? clone(p.data) : {};
    // 有些调用点的 data 形态不定（比如 perf.action.query 会传数组），原样返回
    return Promise.resolve({
      api: api,
      v: (opt && opt.v) || '1.0',
      ret: ['SUCCESS::调用成功'],
      data: payload
    });
  };

  window.__WB_CALLS__ = calls;
  window.__WB_REQS__ = reqs;
  window.__WB_MOCK_REQUEST__ = MOCK_REQUEST;

  /* ---------- 锁住 window.lib.mtop（bundle 内部会整块覆盖它） ---------- */
  var holder = function mtopHolder() { return {}; };
  var proxy = new Proxy(holder, {
    get: function (t, k) {
      if (k === 'request' || k === 'H5Request' || k === 'loginRequest' ||
        k === 'antiFloodRequest' || k === 'antiCreepRequest') return MOCK_REQUEST;
      if (k === 'config') return t[k] || (t[k] = {});
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

  /* ---------- 登录预加载（避免 bundle 去 CDN 拉 lib-login） ---------- */
  var FAKE_USER = { userNumId: 10000001, nick: '闲鱼小铺', userId: 10000001 };
  window.__fetch_preload_scripts__ = Promise.resolve([
    proxy,
    {
      isLogin: function (cb) { cb && cb(true, { data: FAKE_USER }); },
      getUserInfo: function (cb) { cb && cb({ isLogin: true, info: FAKE_USER }); },
      config: { loginCheckMtopConf: {} }
    }
  ]);

  /* ---------- 页面配置（原来是服务端下发的 $pegasus） ---------- */
  window.$pegasus = window.$pegasus || {
    spma: 'a2170',
    spmb: '28358589',
    components: [],
    schemaVersion: 'local-mock'
  };
  window.globalSpmA = 'a2170';
  window.globalSpmB = '28358589';
  window.globalPageName = window.globalPageName || '/seller.workbench';

  /* ---------- 埋点桩 ---------- */
  window.goldlog = window.goldlog || { record: function () { } };
  window.goldlog_queue = window.goldlog_queue || [];
  window.aplus = window.aplus || { record: function () { } };
  window.aplus_queue = window.aplus_queue || [];
  window.__trackerSPMStamp = 0;

  /* ---------- 客户端原生能力桩 ----------
   * 这里出现的「数字」全部从 window.WB_ENV 读（定义在 mock/wb-data.js 顶部），
   * 本文件不写死任何界面上能看到的数值。
   */
  var ENV = window.WB_ENV || {};
  function envNum(key, dft) {
    var v = ENV[key];
    var n = Number(v);
    return (v === undefined || v === '' || isNaN(n)) ? dft : n;
  }
  var UNREAD = envNum('unreadNum', 0);          // 未读消息数
  var BAR_H = envNum('statusBarHeight', 40);    // 状态栏留白（rpx）

  if (!window.WindVane) {
    window.WindVane = {
      call: function (cls, method, params, success, fail) {
        var m = String(method || '');
        if (typeof success === 'function') {
          if (/getSystemInfo|getStatusBarHeight/i.test(m)) {
            success({ statusBarHeight: BAR_H, windowWidth: 390, windowHeight: 844 });
          } else if (/isAppWidgetInstalled/i.test(m)) {
            success({ result: true });
          } else if (/fishMessageUnread/i.test(m)) {
            /* 工作台「未读消息」走这个原生能力 → 数字来自 mock/wb-data.js 的 WB_ENV.unreadNum */
            success({ unread_num: UNREAD });
          } else if (/getUserInfo/i.test(m)) {
            success(FAKE_USER);
          } else {
            success({});
          }
        } else if (typeof fail === 'function') {
          fail({});
        }
      },
      /* ⚠ call2 的参数顺序和 call 不一样。实测日志（bundle 里的 Tf.call 走这条）：
       *     WindVane.call2('WVIdleFishApi.fishMessageUnread', {}, resolve, reject)
       *   即：(1) 方法是「模块.方法」拼成一整串  (2) params  (3) 成功回调  (4) 失败回调
       *   原来写成 (cls, method, params, success) → params 被当成方法名、resolve 被当成 params，
       *   永远落到 else 分支 resolve({})，于是「未读消息」数字一直显示 0。 */
      call2: function (method, params, success, fail) {
        if (typeof success !== 'function') return;
        var m = String(method || '');
        if (/fishMessageUnread/i.test(m)) {
          success({ unread_num: UNREAD });
        } else if (/getSystemInfo|getStatusBarHeight/i.test(m)) {
          success({ statusBarHeight: BAR_H, windowWidth: 390, windowHeight: 844 });
        } else if (/getUserInfo/i.test(m)) {
          success(FAKE_USER);
        } else {
          success({});
        }
      }
    };
  }
  if (!window.WVIdleFishApi) {
    window.WVIdleFishApi = {
      getSystemInfo: function (cb) { cb && cb({ statusBarHeight: BAR_H }); },
      setNavigationBarVisible: function () { },
      getUserInfo: function (cb) { cb && cb(FAKE_USER); },
      /* 未读消息数：页面 Tf.call('WVIdleFishApi','fishMessageUnread',{}) 后面 .then 取 unread_num
       * 两种调用风格都兜住：回调式 (params, success, fail) 和 Promise 式;
       * 少了回调这条，页面的 .then 拿到的是 undefined，未读数字会一直是 0 */
      fishMessageUnread: function (params, success, fail) {
        var r = { unread_num: UNREAD, success: true, errorCode: 0, errorMsg: '' };
        if (typeof success === 'function') { try { success(r); } catch (e) { } }
        return Promise.resolve(r);
      }
    };
  }
  if (lib && !lib.windvane) lib.windvane = window.WindVane;
  if (!window.lib.windvane) window.lib.windvane = window.WindVane;

  /* ---------- localStorage 兜底（file:// 下可能抛） ---------- */
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

  window.__WB_READY__ = true;

  /* ---------- 原生能力兜底（配合 patch_workbench.py 的两处替换） ----------
   *  bundle 里所有 App 原生调用（KV 存储 / 状态栏 / 埋点 / 小组件）在浏览器里都会
   *  throw FishApiError「该环境下 api 不支持」。patch 把其中两个入口指到这里，
   *  返回一个 thenable 的空结果，让页面继续往下渲染。
   *  已经通过 WindVane 桩能走通的调用（getSystemInfo 等）不受影响。
   */
  window.__WB_NATIVE__ = function () {
    var r = { data: '{}', result: {}, success: true, statusCode: 0, errorCode: 0 };
    r.then = function (cb) {
      try { cb && cb({ data: '{}', result: {}, success: true, statusCode: 0, errorCode: 0 }); } catch (e) { }
      return r;
    };
    r.catch = function () { return r; };
    r.finally = function (cb) { try { cb && cb(); } catch (e) { } return r; };
    return r;
  };

  /* ---------- KV 存储（原来走 WVIdleFishApi.takeKV / saveKV） ---------- */
  var KV_PREFIX = 'wb_kv:';
  var kvMem = {};
  /* 首启默认值：页面 utilsTab（常用工具）的「已见过」基线。
   * bundle 的写法是 JSON.parse(v).utilsTabObj → 直接 .forEach，
   * 传 "[]" 会得到 undefined 并抛 TypeError（被它自己的 .catch 吞掉后 console.log 出来）。
   * 给一个形状对的空对象，页面就会走「首次保存」分支，之后正常走差异比对。 */
  var KV_DEFAULTS = { utilsTabObj: '{"utilsTabObj":[]}' };
  function kvGet(k) {
    try { return window.localStorage.getItem(KV_PREFIX + k); } catch (e) { return kvMem[k] || null; }
  }
  function kvSet(k, v) {
    try { window.localStorage.setItem(KV_PREFIX + k, v); } catch (e) { kvMem[k] = v; }
  }
  window.__WB_KV_TAKE__ = function (opt) {
    var key = (opt && opt.key) || '';
    var def = opt && (opt.defaultValue !== undefined ? opt.defaultValue : '');
    if (KV_DEFAULTS[key] !== undefined) def = KV_DEFAULTS[key];
    var v = kvGet(key);
    if (v === null || v === undefined) v = def;
    return Promise.resolve({ data: v, result: { value: v }, success: true, statusCode: 0 });
  };
  window.__WB_KV_SAVE__ = function (opt) {
    var key = (opt && opt.key) || '';
    kvSet(key, (opt && opt.value !== undefined) ? String(opt.value) : '');
    return Promise.resolve({ data: '{}', result: {}, success: true, statusCode: 0 });
  };
})();
