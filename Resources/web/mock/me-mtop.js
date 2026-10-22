/* =============================================================================
 *  「我的」页（idle-personal-home 0.2.36）—— 通用 mtop 拦截层（先跑起来用）
 * =============================================================================
 *  这一版只求「能不能渲染出来」：所有 mtop 都返回 SUCCESS + 空 data，
 *  真正的字段级 mock 等页面跑通后再按需补（结构同 wb-data.js）。
 * ========================================================================== */
(function () {
  'use strict';

  var MOCK = window.ME_MOCK || {};
  var calls = [];
  window.__ME_CALLS__ = calls;

  function clone(v) {
    if (v === null || typeof v !== 'object') return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  var MOCK_REQUEST = function (opt) {
    var api = (opt && opt.api) || '(no api)';
    calls.push(api);
    if (calls.length > 300) calls.shift();
    var p = MOCK[api];
    return Promise.resolve({
      api: api,
      v: (opt && opt.v) || '1.0',
      ret: ['SUCCESS::调用成功'],
      data: p !== undefined ? clone(p) : {}
    });
  };

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
    configurable: true, enumerable: true,
    get: function () { return proxy; },
    set: function (v) { try { Object.assign(holder, v); } catch (e) { } }
  });

  var FAKE_USER = { userNumId: 10000001, nick: '闲鱼号用户', userId: 10000001 };
  window.__fetch_preload_scripts__ = Promise.resolve([
    proxy,
    {
      isLogin: function (cb) { cb && cb(true, { data: FAKE_USER }); },
      getUserInfo: function (cb) { cb && cb({ isLogin: true, info: FAKE_USER }); },
      config: { loginCheckMtopConf: {} }
    }
  ]);

  window.$pegasus = window.$pegasus || { spma: 'a2170', spmb: '28380769', components: [], schemaVersion: 'local-mock' };
  window.globalSpmA = 'a2170';
  window.globalSpmB = '28380769';
  window.globalPageName = window.globalPageName || '/user.home';

  window.goldlog = window.goldlog || { record: function () { } };
  window.goldlog_queue = window.goldlog_queue || [];
  window.aplus = window.aplus || { record: function () { } };
  window.aplus_queue = window.aplus_queue || [];
  window.__trackerSPMStamp = 0;

  if (!window.WindVane) {
    window.WindVane = {
      call: function (cls, method, params, success, fail) {
        var m = String(method || '');
        if (typeof success === 'function') {
          if (/getSystemInfo|getStatusBarHeight/i.test(m)) {
            success({ statusBarHeight: 40, windowWidth: 390, windowHeight: 844 });
          } else if (/getUserInfo/i.test(m)) {
            success(FAKE_USER);
          } else {
            success({});
          }
        } else if (typeof fail === 'function') { fail({}); }
      },
      call2: function (cls, method, params, success) { if (typeof success === 'function') success({}); }
    };
  }
  if (!window.WVIdleFishApi) {
    window.WVIdleFishApi = {
      getSystemInfo: function (cb) { cb && cb({ statusBarHeight: 40 }); },
      setNavigationBarVisible: function () { },
      getUserInfo: function (cb) { cb && cb(FAKE_USER); }
    };
  }
  if (lib && !lib.windvane) lib.windvane = window.WindVane;

  window.__WB_NATIVE__ = function () {
    var r = { data: '{}', result: {}, success: true, statusCode: 0, errorCode: 0 };
    r.then = function (cb) { try { cb && cb({ data: '{}', result: {}, success: true }); } catch (e) { } return r; };
    r.catch = function () { return r; };
    r.finally = function (cb) { try { cb && cb(); } catch (e) { } return r; };
    return r;
  };
  window.__WB_KV_TAKE__ = function (o) { return Promise.resolve({ data: (o && o.defaultValue) || '[]' }); };
  window.__WB_KV_SAVE__ = function () { return Promise.resolve({ data: '{}' }); };

  window.__ME_READY__ = true;
})();
