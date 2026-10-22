/* =============================================================================
 *  两页导航：鱼小铺(shop.html)  ⇄  小铺数据(index.html)
 * =============================================================================
 *  为什么单独写一个文件：
 *    1. shop 页的 bundle 用 createRoot(document.body) 接管整个 body，
 *       所以导航节点只能挂在 <html> 上（body 的兄弟），否则会被 React 冲掉。
 *    2. 官方按钮点下去走的是 kun / megability 的原生跳转，在浏览器里是空操作，
 *       所以这里在“官方按钮”的位置上再叠一层热区 / 直接挂 capture 监听。
 *  使用：页面里先设 window.MOYU_PAGE = 'shop' | 'compass'，再引本文件。
 * ========================================================================== */
(function () {
  'use strict';

  var PAGES = { shop: 'shop.html', compass: 'index.html' };
  var cur = window.MOYU_PAGE || (location.pathname.indexOf('shop') >= 0 ? 'shop' : 'compass');
  var TARGETS = { shop: 'compass', compass: 'shop' };   // 本页的“上一层/下一层”
  var LABEL = { shop: '小铺数据', compass: '鱼小铺' };

  /* ---------- ① ?page= 路由（两页共用，避免两个 bundle 抢同一个 body） ---------- */
  try {
    var q = new URLSearchParams(location.search);
    var want = q.get('page');
    if (want && PAGES[want] && want !== cur) {
      location.replace(PAGES[want] + location.hash);
      return;
    }
  } catch (e) { }

  function go(where) {
    if (!PAGES[where]) return;
    location.href = PAGES[where];
  }

  /* ---------- ② 根容器（挂在 <html> 上，避开 React 对 body 的接管） ---------- */
  var host = document.getElementById('moyu-nav-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'moyu-nav-host';
    document.documentElement.appendChild(host);
  }

  /* ---------- ③ 右下角悬浮兜底按钮 ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '#moyu-nav-host .moyu-nav-hot{',
    '  position:fixed;z-index:2147483000;background:transparent;',
    '  -webkit-tap-highlight-color:transparent;cursor:pointer;',
    '}',
    '#moyu-nav-host .moyu-nav-tip{',
    '  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);',
    '  z-index:2147483001;background:rgba(0,0,0,.8);color:#fff;',
    '  font:400 13px/1.5 -apple-system,"PingFang SC",sans-serif;',
    '  padding:10px 16px;border-radius:8px;max-width:70vw;text-align:center;',
    '}'
  ].join('');
  document.documentElement.appendChild(css);

  /* ---------- ③ 右下角悬浮按钮已移除 ----------
   * 用户要求：不要悬浮返回按钮，小铺数据页直接点官方左上角返回箭头回鱼小铺。
   * 所以这里不再创建 .moyu-nav-chip，跳转全部走 ④ 的官方入口绑定。 */
  var chip = null;

  /* ---------- ④ 把官方入口接上 ----------
   * shop  页：「小铺昨日数据 / 查看完整数据」= <span class*="DataPreview--header-link">
   * compass页：左上角返回 = <div class*="web--header"> 里第一个可点区域（class 名随版本变，
   *            所以用固定位置的透明热区盖住左上角 44×44）
   */
  var BOUND = 'data-moyu-nav-bound';

  function bindLink(el, where) {
    if (!el || el.getAttribute(BOUND)) return;
    el.setAttribute(BOUND, '1');
    el.style.cursor = 'pointer';
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      go(where || 'compass');
    }, true);
  }

  function scan() {
    if (cur === 'shop') {
      // 鱼小铺 →「小铺昨日数据 / 查看完整数据」→ 小铺数据
      var links = document.querySelectorAll('[class*="DataPreview--header-link"]');
      for (var i = 0; i < links.length; i++) bindLink(links[i], 'compass');
    } else {
      // 小铺数据 → 左上角返回箭头 → 鱼小铺
      // 真实结构：<div class="nav--left--XXXX"><img class="nav--back--XXXX"></div>
      // 两个都绑（img 是点击目标，div 是容器），并且额外盖一个热区兜底
      var backs = document.querySelectorAll('[class*="nav--back"], [class*="nav--left"]');
      for (var j = 0; j < backs.length; j++) bindLink(backs[j], 'shop');
    }
  }

  // 页面是异步渲染的，元素出现时间不定 → 定时 + DOM 变化双保险
  setInterval(scan, 700);
  try {
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { }
  window.addEventListener('load', scan);
  scan();

  /* ---------- ④b 小铺数据页：左上角返回热区（兜底，保证"灵敏"） ----------
   * 真实结构是 <div class="nav--left--XXX"><img class="nav--back--XXX"></div>，
   * 直接给 img/div 绑 click 有时会点不中（img 只有 18pt 宽、还可能被别的层压住），
   * 所以再盖一个 56×48 的透明热区，无论点到图标还是它周围空白都能返回。
   * 热区自己带 BOUND 标记，全局跳转拦截会自动放行。 */
  if (cur === 'compass') {
    var backHot = document.createElement('div');
    backHot.className = 'moyu-nav-hot';
    backHot.style.left = '0';
    backHot.style.top = '0';
    backHot.style.width = '56px';
    backHot.style.height = '48px';
    backHot.style.zIndex = '2147483000';
    backHot.setAttribute(BOUND, '1');
    backHot.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      go('shop');
    }, true);
    host.appendChild(backHot);
  }

  /* ---------- ⑤ 关闭其余所有跳转入口 ----------
   * 用户要求：除了「鱼小铺 → 小铺数据」这一条，其它点击入口全部关掉。
   * 注意：只拦「跳转/导航」类，页面内交互（tab 切换、日期切换、滚动、弹窗）必须保留，
   *      否则页面就点不动了。
   * 拦法：
   *   · <a href> 且不是页内锚点 → preventDefault
   *   · <form> 提交 → preventDefault
   *   · 兜底：拦截 window.open / location 赋值
   */
  function isAllowedNav(el) {
    if (!el || !el.closest) return false;
    return !!el.closest('[' + BOUND + '="1"]');
  }

  document.addEventListener('click', function (ev) {
    if (isAllowedNav(ev.target)) return;          // 白名单：鱼小铺的「查看完整数据」
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (a) {
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;  // 页内锚点/伪链接放行
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);

  document.addEventListener('submit', function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }, true);

  try {
    var _open = window.open;
    window.open = function () { return null; };
  } catch (e) { }

  window.MOYU_NAV = { go: go, cur: cur, scan: scan };
})();
