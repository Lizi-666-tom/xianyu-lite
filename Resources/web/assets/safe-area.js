/* =============================================================================
 *  真实安全区同步（两页共用）
 * =============================================================================
 *  为什么需要它：
 *    1. `env(safe-area-inset-top)` 在 iOS 上有已知 bug —— 页面内部跳转、或者
 *       从别的页面返回后，它会失效成 0，于是顶部直接贴到刘海底下。
 *    2. 纯 CSS 分不清"刘海机型"和"非刘海机型"，只能靠一个固定下限兜底，
 *       结果在非刘海机 / Safari 里会多出一大截空白。
 *
 *  做法：
 *    JS 实测一次 env()，再按屏幕长宽比判断是不是刘海机（≥2 视为全面屏），
 *    取两者较大值写进 CSS 变量 --safe-top，CSS 只读这个变量。
 *    并且在 pageshow / resize / 定时器里重算 —— 解决返回后失效的问题。
 *
 *  CSS 用法：
 *    .xxx { height: var(--safe-top, 47px) !important; }
 * ========================================================================== */
(function () {
  'use strict';

  var ROOT = document.documentElement;

  function measureEnv() {
    var probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);' +
      'visibility:hidden;pointer-events:none;z-index:-1;';
    ROOT.appendChild(probe);
    var h = 0;
    try { h = probe.getBoundingClientRect().height || 0; } catch (e) { h = 0; }
    if (probe.parentNode) probe.parentNode.removeChild(probe);
    return h;
  }

  function isNotchScreen() {
    // iPhone 11: 828×1792 → 2.16；iPhone 6s Plus: 1242×2208 → 1.78
    var sw = window.screen && window.screen.width || 0;
    var sh = window.screen && window.screen.height || 0;
    if (!sw || !sh) return false;
    return (Math.max(sw, sh) / Math.min(sw, sh)) > 2;
  }

  function isStandalone() {
    // 从主屏幕图标打开（全屏）才需要自己补安全区；
    // Safari 里页面本来就在状态栏下方，补了反而多一块空白。
    if (window.navigator && window.navigator.standalone === true) return true;
    try {
      return !!(
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches
      );
    } catch (e) { return false; }
  }

  function sync() {
    var env = measureEnv();
    var standalone = isStandalone();
    var notch = isNotchScreen();
    // 关键：只有「全屏模式 + 刘海机」才补 47pt。
    // Safari / 非刘海机一律只信 env()（通常就是 0），不额外加。
    var fallback = (standalone && notch) ? 47 : 0;
    var safe = Math.max(env, fallback);
    ROOT.style.setProperty('--safe-top', safe + 'px');
    ROOT.style.setProperty('--is-notch', notch ? '1' : '0');
    ROOT.style.setProperty('--is-standalone', standalone ? '1' : '0');
  }

  sync();

  // 返回页面 / 转屏 / 尺寸变化 / 键盘收起 —— 都要重算
  window.addEventListener('pageshow', sync);
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', function () { setTimeout(sync, 120); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) setTimeout(sync, 60);
  });

  // 首屏兜底：有些机型 env() 要等一帧才可用
  setTimeout(sync, 120);
  setTimeout(sync, 600);
  setTimeout(sync, 1500);

  window.__SYNC_SAFE__ = sync;
})();
