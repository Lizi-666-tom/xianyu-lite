/* =============================================================================
 *  鱼小铺 · 工作台（Workbench 0.1.89）—— mock 数据（要改数字改这里）
 * =============================================================================
 *  每个 key 是一个 mtop api，value 直接就是响应里的 data 负载。
 *  页面代码的用法：sh({api}).then(res => res.data)  →  res.data 就是这里的 data
 *
 *  字段来源（都是从 assets/workbench.js 里读出来的真实读法，不是猜的）：
 *    basicInfo.shopLevelData.level   → yyt[level].levelIcon   等级图标（必须是 'L1'..'L7'）
 *    basicInfo.shopLevelData.score / nextLevelNeedScore       等级进度
 *    basicInfo.avatar                 空则回落到 ./img/TB1LFGeK...-200-200.png
 *    serviceScoreSummary.totalScore / pendingOptimizationCount / levelStatus / showText
 *        levelStatus 取 'low' | 'mid' | 'high' → 服务分卡片右侧小图标（不填 = 空 src 破图）
 *        pendingOptimizationCount → 卡片右侧「N 项待优化」；showText → 卡片下方说明文案
 *    bulletin                         **数组** [{hint, icon, nextLinkUrl, renderType}]
 *    importantInfo                    {toShip, toRefund, toRate} → 数字用图片精灵渲染
 *    statisticsData1Day               [{name, data, change, type, tabType}]（4 项，见下方注释）
 *    taskCenter                       {usableExposureAmount, taskDetails[]}  ← 曝光/擦亮任务模块，缺了整块不渲染
 *    adBpHomeInfoVO                   {title, subTitle, balance, targetUrl, marketList[]} ← 同上的右半区
 *    serviceInfo / billInfo           服务保障 / 财务卡片
 *    topDomainDo                      {rankDesc, domainRank}  domainRank 用 '·' 分段
 *    clubBattleWorkBenchInfo          {clubInfo:{name}, limitJoin}
 *    improvePackInfoVO                {title,subTitle,needShowImprovePack,valid,benefit[],improvePackRenewInfo}
 *    bizTools                         [{type,name,label,new,tools:[{singleKey,title,isShow,picUrl,...}]}]
 *    dataDialogDesc                   数据弹窗里的口径说明
 * ========================================================================== */
(function () {
  'use strict';

  var TS = 1735689600000;   // 2025-01-01 00:00:00 UTC，页面按 dataTimestamp-5h 推算「数据」日期

  /* ---------- 工具图标（全部本地化后的 ./img/ 路径） ---------- */
  var ICON = {
    finance: './img/O1CN011ieqOO1tv6ZuUppKC__6000000005963-2-tps-72-72.png',
    school: './img/O1CN015VVA751Ti7c1FYH6W__6000000002415-2-tps-72-72.png',
    rate: './img/O1CN018XxhqY1tDb5SVjMqT__6000000005868-2-tps-72-72.png',
    market: './img/O1CN01KnOlNf1gj7TYFXbjF__6000000004177-2-tps-72-72.png',
    service: './img/O1CN01TWcpsu1cL3xdkKn7I__6000000003583-2-tps-72-72.png',
    decorate: './img/O1CN01fQzzHl1kInAhdJixm__6000000004661-2-tps-72-72.png',
    diagnose: './img/O1CN01k0iS6o1i93NtiRp2p__6000000004369-2-tps-72-72.png',
    deposit: './img/O1CN01pBB7Zr1c99mKHsaQH__6000000003557-2-tps-72-72.png',
    tool: './img/O1CN01pfeBy41LbEebQmcpy__6000000001317-2-tps-72-72.png',
    promotion: './img/O1CN01swX5OL1wiE630gRlR__6000000006341-2-tps-72-72.png'
  };

  /* ---------- 热门工具里的 10 个图标 ----------
   * 真机（IMG_0006 y=1599/1815/2031）这四个图标在官方 CDN 上找不到对得上的版本，
   * 全部从真机截图按 96×96 绘制框（=32pt）原样裁下来，落在 img/local-tool-*.png。
   * 角标压住的那一小块（红/粉像素）在裁剪时涂成白色，之后由 CSS 的 .ribbon 盖回去。
   */
  var TOOL_ICON = {
    pcWorkbench: './img/local-tool-pc-workbench.png',
    operatePack: './img/local-tool-operate-pack.png',
    itemSelect: './img/local-tool-item-select.png',
    knife2: './img/local-tool-knife-2.png',
    fansPrice: './img/local-tool-fans-price.png',
    fansLottery: './img/local-tool-fans-lottery.png',
    superRub: './img/local-tool-super-rub.png',
    coinDeduct: './img/local-tool-coin-deduct.png',
    compliance: './img/local-tool-compliance.png',
    huabei: './img/local-tool-huabei.png'
  };

  /* ===========================================================================
   *  ★★ 原生能力类数据（不在 mtop 接口里，但界面上会显示数字的，都放这里）★★
   * =========================================================================
   *  这些值真机上要走闲鱼 App 的原生能力（WindVane / WVIdleFishApi），浏览器里没有，
   *  由 mock/wb-mtop.js 按下面的值假装返回：
   *    unreadNum        → 「重要待办 · 未读消息」下面那个数字（0 或正整数）
   *    statusBarHeight  → 顶部状态栏留白高度（纯布局，不是文案）
   *  改完刷新页面即可；mock/wb-mtop.js 里没有写死任何数字，全部读这里。
   */
  window.WB_ENV = window.WB_ENV || {};
  /* 真机（IMG_0007 y=1088）：未读消息 = 30 */
  window.WB_ENV.unreadNum = 30;
  window.WB_ENV.statusBarHeight = 40;

  /* ---------- 提效包「运营提效包」推广弹窗的免打扰开关 ----------
   * bundle（DataPreview 组件里）：
   *   var _ = improvePackInfoVO.valid;
   *   useEffect(function () {
   *     if (!_ && void 0 !== _ && w) {                      // valid === false 才会弹
   *       var t = localStorage.getItem("efficiency_mask");
   *       if (t) { dayjs().diff(dayjs(Number(t)), "month") > 30 && show(); }
   *       else   { show(); localStorage.setItem("efficiency_mask", Date.now()); }
   *     }
   *   }, [m]);
   * 也就是说：真机上这个「运营提效包 / 助力订单嘎嘎涨 … 去开通」的大图弹窗**只弹一次**，
   * 点掉/看过之后 localStorage 里留了 efficiency_mask，之后就不再弹。
   * 我们截图里没有这个弹窗（说明真机已经弹过了），所以这里把时间戳种进去复现同一状态——
   * 而不是去改 bundle 或加 CSS 强隐藏。
   * 想再看弹窗：清掉这条 localStorage 即可（或把下面这行删掉）。 */
  try {
    if (!window.localStorage.getItem('efficiency_mask')) {
      window.localStorage.setItem('efficiency_mask', String(Date.now()));
    }
  } catch (e) { }

  function tool(singleKey, title, pic, extra) {
    var t = {
      singleKey: singleKey,
      title: title,
      isShow: 'true',
      picUrl: pic,
      grayPicUrl: pic,
      jumpUrl: '',
      ribbonText: '',
      isNoText: ''
    };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) t[k] = extra[k]; } }
    return t;
  }

  /* ===========================================================================
   *  ★ 小铺昨日数据 = 按日数据源里的「昨天」 ★
   * =========================================================================
   *  数据不再写在 wb-data.js 里，而是从 mock/daily-data.js 的 window.XY_DAILY 派生：
   *      宝贝曝光数 = showPv     宝贝浏览数 = ipv
   *      订单数     = payOrdCnt  支付金额   = payAmt
   *  小铺数据页（index.html，近1天）读的是同一份 XY_DAILY[昨天]，
   *  所以两页上「同一天」的这 4 个数字必然一致。
   *  想改数字：改 mock/daily-data.js 里昨天那一段。
   * ========================================================================= */
  function xyDailyOf(dateStr) {
    if (window.XY_GET_DAILY) return window.XY_GET_DAILY(dateStr) || {};
    return {};
  }

  /* 环比（%）：((今天 - 上一期) / 上一期) * 100，除零给 0。
   * 页面只用它的正负来决定箭头（0 = 不显示箭头），所以给百分比字符串化前的数字就行 */
  function xyChange(cur, prev) {
    var c = Number(cur), p = Number(prev);
    if (!isFinite(c) || !isFinite(p) || !p) return 0;
    return Math.round((c - p) / p * 1000) / 10;
  }

  /* 4 个指标。data 必须是整数：数字是位图渲染（amt 图集里没有 '.'），带小数会破图 */
  function yesterdayStats() {
    var yday = (window.XY_YESTERDAY && window.XY_YESTERDAY()) || null;
    var pday = (yday && window.XY_ADD_DAYS) ? window.XY_ADD_DAYS(yday, -1) : null;
    var cur = xyDailyOf(yday);
    var prev = xyDailyOf(pday);
    function int(v) { var n = Number(v); return isFinite(n) ? Math.round(n) : 0; }

    return [
      { name: '宝贝曝光数', data: int(cur.showPv), change: xyChange(cur.showPv, prev.showPv), type: 'INTEGER', tabType: 'EXPOSURE' },
      { name: '宝贝浏览数', data: int(cur.ipv), change: xyChange(cur.ipv, prev.ipv), type: 'INTEGER', tabType: 'SCAN' },
      { name: '订单数', data: int(cur.payOrdCnt), change: xyChange(cur.payOrdCnt, prev.payOrdCnt), type: 'INTEGER', tabType: 'TRADE' },
      { name: '支付金额', data: int(cur.payAmt), change: xyChange(cur.payAmt, prev.payAmt), type: 'ORDER_AMOUNT', tabType: 'DEAL_AMOUNT' }
    ];
  }

  /* ---------- 1) 工作台主信息（准入门槛） ---------- */
  function workbenchInfo() {
    return {
      /* 身份 */
      userId: 10000001,
      userNumId: 10000001,
      /* 真机（IMG_0007 y=247 / x=222）：店名很长，被 .UserInfo--name 的
       * max-width:34.93333vw(=144.6px) + ellipsis 截成「南宋悠哉悠哉的…」。
       * 这里给一个同样长度的长名字，截断效果和真机一致（改短就变成「小铺的店」那种短名）。 */
      nick: '南宋悠哉悠哉的鱼小铺',
      displayNick: '南宋悠哉悠哉的鱼小铺',
      headPicLink: '',
      sellerNick: '闲鱼小铺',
      sceneFrom: 'workspace',

      /* 店铺基础信息（页面读 basicInfo.shopLevelData 渲染等级图标 + 等级进度） */
      basicInfo: {
        nick: '南宋悠哉悠哉的鱼小铺',
        avatar: '',
        shopLevelData: {
          /* ⚠ 等级决定「超赞俱乐部」那一行走哪个分支（bundle：
           *     C = yyt[level].currentLevel >= 5
           *     C  -> '加入超赞俱乐部 分1亿曝光'
           *     !C -> '超赞俱乐部' + 'L5等级以上专享'   ← 真机（IMG_0007 y=419/424）是这个
           * 真机既显示「超赞俱乐部 / L5 等级以上专享」，说明当前等级 < L5，所以这里是 L4。
           * 等级图标跟着 yyt[level].levelIcon 走，L1..L7 都已在 img/ 里全量落地。 */
          level: 'L4',
          score: 3260,
          nextLevelNeedScore: 5000,
          praiseUrl: '',
          levelStatus: '',
          linkUrl: '',
          levelUrl: '',
          rankInfo: { domainId: '50000001', praiseId: '70000001' }
        }
      },

      /* 服务分卡片：levelStatus 决定标题右侧小图标（low/mid/high）
       * 卡片右侧渲染 = (pendingOptimizationCount, '项待优化') + arrow，卡片下方 desc = showText
       *   bundle: servicePoints--cardTitleRight（count + '\u9879\u5f85\u4f18\u5316'）
       *           servicePoints--cardDesc <- showText
       * 真机（IMG_0007 y=549 / 556 / 611）：
       *   '小铺服务分 5.7 〔中〕'（〔中〕就是 levelStatus=mid 的那张 30×30 徽标图）
       *   '1 项待优化 〉'
       *   '提升分数至 4.8，每日曝光平均 +20%'
       * levelStatus 三档对应的图（bundle 内写死）：
       *   low  -> O1CN01iMUDgi...-tps-45-45.png
       *   mid  -> O1CN016I74Qw...-tps-45-45.png    ← 真机的「〔中〕」
       *   high -> O1CN01M3U3pL...-tps-45-45.png
       */
      serviceScoreSummary: {
        totalScore: 5.0,
        pendingOptimizationCount: 1,
        levelStatus: 'high',
        showText: '恭喜你！综合分高，请继续保持！'
      },

      /* 公告轮播（**数组**，页面做 h.length / h.map）
       * 真机第一条 = '共 5 个待优化项，点击查看'（dataPreview 里的 banner，位置在「曝光模块」正上方）
       *
       * ⚠ icon 这个字段是**服务端下发**的，bundle 里是
       *     cmt(ea,{width:40,height:40,src:t.icon})
       *   也就是说「待优化项前面的那个警报图标」不是写死的资源，是数据里的 URL。
       *   之前这里填的是 img/O1CN01q8YmtL21KU7VlWsnc__...-2-tps-24-24.png ——
       *   那张图实际是一枚**黑色「V」碎片**（24×24 只有 86 个不透明像素），
       *   所以在页面上看起来就是个残缺的黑折线，用户反馈「优化项前面的警报图标不完整」。
       *
       *   真机（IMG_0005.PNG，iPhone 11 / 3x）同位置的图标是**红色铃铛（警报/通知）**，
       *   实测合成色 rgb(249,69,70) ≈ #F94546。官方 CDN 上这张图没有可用的原始地址
       *   （-tps-96-96 / -tps-48-48 变体全部 404），所以直接按 40rpx(=22.08css) 的绘制框
       *   从真机截图里取了 66×66 设备像素、按白底反预乘还原成带 alpha 的 PNG，
       *   落到 img/local-bell-alert-66.png（assets/img/ 同步一份）。
       *   换回官方原图时只改这一行即可。
       */
      bulletin: [
        {
          hint: '共 5 个待优化项，点击查看',
          icon: './img/local-bell-alert-66.png',
          nextLinkUrl: '',
          renderType: 'text'
        }
      ],

      trackParams: { bucketId: 1 },

      /* ---------- 运营提效包（右侧那张 33.33333vw 宽的小卡）----------
       * bundle:  const g=a.improvePackInfoVO, S=(g||{}), k=S.benefit, E=S.valid,
       *               T=S.subTitle, N=S.improvePackRenewInfo;
       *   <div improvePackInfo>
       *     <img 200rpx×40rpx  src="O1CN01hgtzSq...-tps-300-60.png" />   ← 卡片顶部那张「运营提效包」标
       *     E && <div validWrap>{T}<arrow/></div>                       ← 只有 valid=true 才渲染
       *     N && <div renewBtn>去续费</div>
       *     !N && k.length && <Swiper 202rpx×64rpx marginTop:16rpx>      ← 权益图，跟 valid 无关
       *     !E && <div validBtn>去开通</div>
       *
       * 真机（IMG_0007）实测：顶部标在 y=249（124.5pt），紧接着是一张
       * 两行字的权益图（「发布数据至 / 0 / 3000」），最下面是「去开通」(y=413 / 206.5pt)。
       *   · 没有「已开通 · 剩余 23 天」那一行  -> valid = false
       *   · 有「去开通」                        -> valid = false（!E 分支）
       *   · 没有「去续费」                      -> improvePackRenewInfo = null
       * 权益图（server 下发，官方 CDN 上没有可用的原图）按真机上那个
       * 202rpx×64rpx = 111.5×35.3pt 的绘制框从真机截图原样裁下来，
       * 落到 img/local-pack-benefit.png（223×70 @2x，零外链）。
       */
      improvePackInfoVO: {
        title: '运营提效包',
        subTitle: '',
        needShowImprovePack: true,
        valid: false,
        benefit: [
          { picUrl: './img/local-pack-benefit.png', targetUrl: '' }
        ],
        showVersion: '2',
        improvePackRenewInfo: null
      },

      statisticsUrl: '',
      levelUrl: 'https://h5.m.goofish.com/wow/moyu/moyu-project/fish-shop-data/pages/service-points',

      /* 榜单入口（.UserInfo--rankContent 那枚胶囊）
       * bundle: M = rankDesc!=='未上榜' && domainRank && domainRank.split('·') || []
       *         O = M.slice(0,-1).join('·')       ← 前半段（灰色部分）
       *         P = M[M.length-1]                 ← 末段（名次）
       *         渲染 = 图标 + O + (M.length===1 ? P : '·'+P)
       * 真机（IMG_0007 y=310 / x=267 = 133.5pt）这枚胶囊里就是「查看闲鱼榜单」这一句话
       * （不再是「数码·手机·第 12 名」），所以 domainRank 给单段：
       *   M = ['查看闲鱼榜单'] → O='' , P='查看闲鱼榜单' → 渲染出来正好是 6 个字、无前缀点。
       */
      topDomainDo: {
        rankDesc: '闲鱼榜单',
        domainRank: '查看闲鱼榜单',
        domainTargetUrl: ''
      },

      /* 俱乐部 */
      clubBattleWorkBenchInfo: {
        clubInfo: { name: '超赞俱乐部' },
        limitJoin: false
      },

      dataDialogDesc: '数据口径：昨日 0:00–24:00 的自然日统计，含自然流量与推广流量；' +
        '支付订单金额为买家实付金额，已剔除退款。数据每日 8:00 前更新。',
      widgetTitle: '',
      tips: '',

      /* 重要待办：值是「数字字符串」，页面按位拆成数字图片渲染（L(v, amt)）
       *   toShip → 待发货 / toRefund → 退款中 / toRate → 待评价
       *   未读消息那个数不在 mtop 里，走原生能力 → window.WB_ENV.unreadNum
       * 假值 → 渲染一个 '-'（OCR 读不到，视觉上就是空的）
       * 真机（IMG_0007 y=1088）：30 / 2 / (空) / (空)
       */
      importantInfo: {
        toShip: '2',
        toRefund: '',
        toRate: ''
      },

      /* 服务保障：s>0 显示「保证金待缴停」，否则「已开通N个服务」
       * 真机（IMG_0008 y=1689）= 「已开通 0 个服务」，所以 serviceOpened = 0 */
      serviceInfo: {
        balance: '0.00',
        quotaToBePaid: '0',
        debtAmount: '0',
        status: 'ACCOUNT_OPEN',
        serviceOpened: 0
      },

      /* 财务卡片
       *  ★ 卡片下面那行文字读的是 billInfo.description（不是 balance！balance 页面上根本不显示）
       *    真机（IMG_0008 y=1688）= 「本月收入 ¥0」 */
      billInfo: {
        description: '本月收入 ¥0',
        balance: '0',
        jumpUrl: ''
      },

      /* 小铺昨日数据 —— bundle 的渲染顺序 = 埋点 if/else 链的顺序：
       *   '\u5b9d\u8d1d\u66dd\u5149\u6570'（宝贝曝光数）→ '\u5b9d\u8d1d\u6d4f\u89c8\u6570'（宝贝浏览数）
       *   → '\u8ba2\u5355\u6570'（订单数）→ '\u652f\u4ed8\u91d1\u989d'（支付金额）
       * 真机 4 块（IMG_0005 y=1117）：宝贝曝光数 x=80 / 宝贝浏览数 x=377 / 订单数 x=713 / 支付金额 x=990
       * 4 列等宽（data-block width:23.93333vw），每块 = name + data(数字图) + change(箭头图)
       * ⚠ data 必须是整数：数字用 amt 图集按位渲染，表里没有 '.'，带小数会破图
       * ⚠ type='ORDER_AMOUNT' 会先四舍五入（bundle: L(t.data, amt, t.type)）
       *
       * ★ 现在这 4 个数来自 yesterdayStats()（= mock/daily-data.js 里昨天那一段），
       *   和小铺数据页「近1天」读的是同一份数据源，改数据只改 daily-data.js。
       */
      statisticsData1Day: yesterdayStats(),

      /* ---------- 曝光 / 擦亮任务模块（组件 id="exposure"，CSS 前缀 Exposure--） ----------
       * bundle: const ymt = function(t){ ... var s = i.taskCenter, u = i.adBpHomeInfoVO;
       *                                   if (s) { return <div id="exposure" className={Exposure--Box}> ... } }
       *   → taskCenter 缺失时整个模块 return undefined（这就是之前整块不见的原因，不是条件显示）
       * 渲染映射（全部来自 bundle 读法，不是猜的）：
       *   header-title      '可用曝光'（写死）
       *   header 数字       taskCenter.usableExposureAmount，按 smt 图集逐位渲染（只支持 0-9，无 '万' 无 '.'）
       *   header-action     '去使用'（写死）
       *   scroll-container  taskCenter.taskDetails.map → scroll-item{picUrl,title,subTitle} + 右箭头
       *   rightBox.exposureTopBox  adBpHomeInfoVO.title      + 右箭头    ← 真机 '超强擦亮'
       *   rightBox.balanceText     adBpHomeInfoVO.subTitle             ← 真机 '当前擦亮余额'
       *   rightBox.amount          ¥图 + adBpHomeInfoVO.balance 按 hmt 图集渲染（支持 0-9 . 万）
       *   banner.marketing         adBpHomeInfoVO.marketList[0].text   ← 真机 '立即去擦亮'
       * ⚠ marketList 必须给数组：bundle 里 onClick 直接读 u.marketList[0].url，缺数组点一下就报错
       *
       * ⚠ 卡片尺寸是 CSS 定死的 scroll-item：43.46667vw × 17.06667vw（=180×70.7pt），
       *   scroll-container 是横向滚动 + 左栏只有 60.26667vw 宽 → 一屏只露 1 张整卡 + 第 2 张的左半截。
       *   真机（IMG_0006）左栏可见文案 = 第 1 张'做任务领曝光 / 查看全部任务'、第 2 张只剩图标和 '+50'，
       *   所以 taskDetails 按这个顺序给：title 是主文案，subTitle 是下面那行灰字。
       *   图标 picUrl 也是从真机抠的（一张 119×59，奶黄底反预乘成透明）。
       */
      taskCenter: {
        usableExposureAmount: '2500',
        taskDetails: [
          {
            title: '做任务领曝光',
            subTitle: '查看全部任务',
            picUrl: './img/local-task-do.png',
            targetUrl: ''
          },
          {
            title: '做任务领曝光',
            subTitle: '+ 50',
            picUrl: './img/local-task-50.png',
            targetUrl: ''
          }
        ]
      },

      adBpHomeInfoVO: {
        title: '超强擦亮',
        subTitle: '当前擦亮余额',
        balance: '1596',
        targetUrl: '',
        marketList: [
          { text: '立即去擦亮', url: '' }
        ]
      },

      /* ---------- 营销卖场（组件 Bmt，CSS 前缀 MarketingStore--） ----------
       * bundle: const Bmt = function(){
       *   var e = t.info, r = e.promotionInfos, i = r && r.length >= 3;
       *   if (r && 0 !== r.length) return <div id="exposure" className={MarketingStore--Box}> ...
       *     scroll-item: <img className={productImgs} src={t.pictureUrl}>  ← 只有图，没有文字
       *   }
       *   → promotionInfos 缺失/空数组 = 整块不渲染（和之前 taskCenter 一个套路）
       * 每个 item 的字段：{name, pictureUrl, targetUrl, customerType, expGoldKey, clkGoldKey}
       *   · name 只用于埋点和「加入线索通」特判（点进去要拼 &fromScene=fishShopMarket）
       *   · 卡片上的「托管无忧卖 / 亿级流量扶持」「加入线索通 / 高效留资拿商机」全在 pictureUrl 这张图里
       * 真机（IMG_0006 y=833..1044）两张卡：540×212 @3x = 180pt×70.7pt（= 43.46667vw × 17.06667vw）
       *   两张图都是从真机截图按卡片框原样裁下来的本地文件（零外链）
       */
      promotionInfos: [
        {
          name: '托管无忧卖',
          pictureUrl: './img/local-market-1.png',
          targetUrl: '',
          customerType: 'seller',
          expGoldKey: '',
          clkGoldKey: ''
        },
        {
          name: '加入线索通',
          pictureUrl: './img/local-market-2.png',
          targetUrl: '',
          customerType: 'seller',
          expGoldKey: '',
          clkGoldKey: ''
        }
      ],

      /* ---------- 常用工具（组件 Ryt / id="utilTab"，CSS 前缀 UtilTab--） ----------
       * bundle: var l = a.bizTools, d = useState(l), p = d[0];
       *   tab-header: p.map(t => <tab-button>{t.name}</tab-button>)     ← t.name 就是 tab 文案
       *   tab-content: p.find(t => t.type === r).tools.map(t =>
       *       <item>{t.title}{t.ribbonText && <div class="ribbon">{t.ribbonText}</div>}</item>)
       *   默认激活 tab 的 type 是 'hot'（(vo||{}).tabTo || "hot"）
       * 真机 4 个分类 tab：热门工具 / 宝贝工具 / 营销工具 / 其他工具
       *   激活态胶囊图 Ayt[0..3] 是 bundle 里写死的本地图（331×156 / 397×156），已落地
       * tools[].ribbonText = 图标右上角那个红色角标文案（新上线 / 卖更多 / 新升级）
       * tools[].isShow 必须是字符串 'true'，否则 Lyt 直接 return false
       */
      bizTools: [
        {
          type: 'hot',
          name: '热门工具',
          label: '热门工具',
          new: false,
          tools: [
            tool('pcWorkbench', 'PC工作台', TOOL_ICON.pcWorkbench, { ribbonText: '新上线' }),
            tool('operatePack', '运营提效包', TOOL_ICON.operatePack, { ribbonText: '新上线' }),
            tool('itemSelect', '选品中心', TOOL_ICON.itemSelect, { ribbonText: '新上线' }),
            tool('knife2', '2人小刀', TOOL_ICON.knife2, { ribbonText: '卖更多' }),
            tool('fansPrice', '粉丝价', TOOL_ICON.fansPrice),
            tool('fansLottery', '粉丝抽奖', TOOL_ICON.fansLottery),
            /* 真机（IMG_0008 y=1375 / x=461）这里就是 4 个字的「超强擦亮」
             * （写成 3 个字的「超强擦」会因为它居中而整体右移 13pt） */
            tool('superRub', '超强擦亮', TOOL_ICON.superRub, { ribbonText: '新升级' }),
            tool('coinDeduct', '闲鱼币抵扣', TOOL_ICON.coinDeduct),
            tool('compliance', '合规管理', TOOL_ICON.compliance),
            tool('huabei', '花呗分期', TOOL_ICON.huabei)
          ]
        },
        {
          type: 'goods',
          name: '宝贝工具',
          label: '宝贝工具',
          new: false,
          tools: [
            tool('itemManage', '宝贝管理', ICON.promotion),
            tool('publish', '发布宝贝', ICON.decorate),
            tool('showcase', '橱窗推荐', ICON.market),
            tool('itemDiagnose', '宝贝诊断', ICON.diagnose)
          ]
        },
        {
          type: 'promotion',
          name: '营销工具',
          label: '营销工具',
          new: false,
          tools: [
            tool('coupon', '优惠券', ICON.rate),
            tool('spread', '推广', ICON.promotion),
            tool('live', '店铺直播', ICON.service),
            tool('marketQuote', '行情', ICON.market)
          ]
        },
        {
          type: 'else',
          name: '其他工具',
          label: '其他工具',
          new: false,
          tools: [
            tool('finance', '财务', ICON.finance),
            tool('sellerSchool', '卖家学堂', ICON.school),
            tool('deposit', '保证金', ICON.deposit),
            tool('serviceCenter', '客服中心', ICON.service),
            tool('feedback', '意见反馈', ICON.tool)
          ]
        }
      ]
    };
  }

  /* ---------- 2) 小铺诊断 ---------- */
  function diagnostic() {
    return {
      // 顶部汇总
      diagnosticModule: {
        allOptimizedCount: 8,
        toBeOptimizedCount: 5,
        tipsText: '还有 5 项可优化，优化后预计带来更多流量',
        // 四个分组的 tab（宝贝力 / 服务力 / 互动力 / 吸粉力）
        optimizationGroup: []
      },
      // 下列字段用于「本周表现」之类的模块，先留空
      center: null
    };
  }

  /* ---------- 3) 数据看板（粉丝 / 交易） ---------- */
  function dataDetail() {
    return {
      dataTimestamp: TS,
      statisticsChartVOList: [],
      blockList: []
    };
  }

  /* ---------- 4) 商品列表 ---------- */
  function itemQuery() {
    return {
      dataTimestamp: TS,
      hasNextPage: false,
      itemInfoVOList: []
    };
  }

  window.WB_MOCK = {
    'mtop.taobao.idle.pro.workbench.info.get': { data: workbenchInfo() },
    'mtop.taobao.idle.pro.diagnostic.center.detail.info': { data: diagnostic() },
    'mtop.taobao.idle.pro.data.center.data.detail': { data: dataDetail() },
    'mtop.taobao.idle.pro.data.center.item.query': { data: itemQuery() },
    'mtop.taobao.idle.pro.diagnostic.center.perf.action.query': { data: {} },
    'mtop.taobao.idle.workbench.widget': { data: { needWidget: false } },
    'mtop.alibaba.idle.shop.incentive.task.sync': { data: {} },
    /* 订阅服务号：bundle 读 data.subscribe，true → 顶部显示「已订阅」，false → 「订阅服务号」
     * 真机（IMG_0005 y=116）显示「已订阅」，所以这里给 true */
    'mtop.taobao.idle.subscribe.get': { data: { subscribe: true } },
    'mtop.taobao.idle.subscribe.edit': { data: { subscribe: true } },
    'mtop.idle.user.simple': { data: { userNumId: 10000001, nick: '闲鱼小铺', userId: 10000001 } },
    'mtop.user.getUserSimple': { data: { userNumId: 10000001, nick: '闲鱼小铺' } },
    /* 页面配置（mtop.gaia.nodejs.gaia.idle.data.gw.v2.index.get → data.pageConfInfo）
     * 页面组件 Kyt 里：var e = (t||{}).data || {}, n = e.banner, r = e.pop, i = e.baseConfig;
     *   ... null != n && n.length ? <rmt data={n}/> : null      ← 营销卖场下面那个「留资卡」轮播
     * rmt = Swiper 轮播（tmt = Swiper + Slide），每个 slide 就是一张 <img>：
     *   n.slice(0,3).map(t => <Slide><img src={t.img} onClick→t.url style={{objectFit:'cover',borderRadius:'24rpx'}} /></Slide>)
     *   → item 字段：{img, url, bannerId}（img 是整张 banner 图，'去开启' 和文案都在图里，bundle 里没有这些字）
     * 真机（IMG_0006 y=1108..1340）这张卡 = 1189×232 @3x = 718rpx×140rpx = 95.73333vw × 18.66667vw，
     *   所以图也是按这个框从真机截图原样裁的（零外链）。
     * ⚠ swiper 的宽高是 bundle 里的内联 rpx（浏览器不认 rpx 会整条丢掉），
     *   所以真正的尺寸由 shop.html 里的 local-overrides 补上。
     */
    'mtop.gaia.nodejs.gaia.idle.data.gw.v2.index.get': {
      data: {
        pageConfInfo: {
          banner: [
            {
              img: './img/local-banner-lead.png',
              url: '',
              bannerId: 'leadcard-1'
            }
          ]
        }
      }
    }
  };
})();
