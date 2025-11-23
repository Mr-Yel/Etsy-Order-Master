// Cookie 对比工具
let cookie1 =
  "_fbp=fb.1.1757561741334.2112913474150747; _pin_unauth=dWlkPU1tWXhOVFZtWlRNdFlUVTRZaTAwWkdNM0xUazBNall0TTJNd05XSmhNREEzTVRjeA; _ga_9R0G7V6NFT=GS2.1.s1758694412$o9$g0$t1758694412$j60$l0$h0; _ga_C1HTJ0Z50X=GS2.1.s1758621492$o6$g0$t1758621492$j60$l0$h0; _ga=GA1.1.487560733.1757561749; _ga_PFCE2BSYLL=GS2.1.s1757660154$o1$g1$t1757660184$j30$l0$h0; _ga_RNXEBK8XXK=GS2.1.s1758697562$o2$g0$t1758697562$j60$l0$h0; _ga_TZRV1MQDN7=GS2.1.s1758697563$o2$g0$t1758697563$j60$l0$h0; _ga_X9FB5QWEHM=GS2.1.s1758508069$o3$g0$t1758508784$j58$l0$h0; LD=1; gifting_mission_module_occasion={"occasionId":1268340382082,"seenTimestamps":[1757562117043]}; search_results_for_user=6da3jcAk-TwzeHFDd7lM8GyQ0AhjZACCjGeSWyG05n9DW4M6I1sGAA..; exp_ebid=m=1jfWxwXbyzBvU8GdX7Y4A69Vbz%2FQQ8aWPw%2FOCDUV1go%3D,v=OoWFJAfVaK3jNQDXNLO1Yr2KoK2Uo9DA; fve=1757561741.0; user_prefs=yonAbfx9orNicdMsLhHXEzZOXz1jZACCjEPOvTA6WsnD20VJJ680J0dHKTVPNzRYSQcoBBUxglC4iFgGAA..; wedding_session=4fDrHyIj43f4VkFxbXO2q0nMTgpjZACCjDOvmuE0AA..; ua=531227642bc86f3b5fd7103a0c0b4fd6; daily_deals_listings=1887551309,1109609416,1814809427,1800643886,1717255193,1873317928,4333135666,1430311268,1186563967,1261994355,1560564873,1748581321,1800737020,4346116347,1576451873; dashboard_stats_range=last_7; ship_by_date_seller_v_client_timezone_analytics=true; lantern=7168a8ae-7696-4398-b524-e90b81c746f7; _ga_91C9TBEPW1=GS2.1.s1761789898$o1$g0$t1761789898$j60$l0$h0; _ga_YV6D5X0VRL=GS2.1.s1761893991$o1$g0$t1761893996$j55$l0$h0; _ga_EGSHPLQQQ6=GS2.1.s1762151597$o1$g0$t1762151599$j58$l0$h0; _aw_j_6220={"id":"cd14eff7-e91e-40b1-89b2-18649259fe06-1","expiration":1770102050}; listing_page_seen=true; uaid=YCxJkMoZMCEJlzbbV7iOwHRmzjhjZACCjEPOvSA6U66utFqpNDEzRclKydG9yrM0KjwkzCjKJT8qIzLPJ7vCPLPQz7kkw1yplgEA; _gcl_au=1.1.753133236.1757561748.1232915154.1763789611.1763789610; et-v1-1-1-_etsy_com=2%3A1663cf70384377dae85a1dcec99a9e71a1c4fd06%3A1763789651%3A1763789651%3A__athena_compat-1133073005-1432896269815-27164eed2bbb97b6c96f19d561d413434340243bf0ba84dabf353432e02ebef622b5ba777f331c7a; session-key-www=1133073005-1432896269815-4fe7feac2a817149c351596e38c099a6261d613c8ca7f0fadb204854|1771565651; session-key-apex=1133073005-1432896269815-14bae8aae6f6fd23fbef288cb71ec9f4322197f48f5c5970207e6082|1771565651; gtm_deferred=%5B%5D; _uetsid=9ef10e80c35011f0ac9855c2156b42ff; _uetvid=6b0099f08ec011f0a5aa9f45177083e0; QSI_HistorySession=https%3A%2F%2Fwww.etsy.com%2Fyour%2Fshops%2Fme%2Fdashboard~1763792338516%7Chttps%3A%2F%2Fwww.etsy.com%2Fyour%2Forders%2Fsold%3Fref%3Dseller-platform-mcnav~1763792346435; _ga_KR3J610VYM=GS2.1.s1763792338$o141$g1$t1763792347$j51$l0$h0; datadome=p1lpItRGM2XIYfaSdl8Of2uLRLJJf7Og_HEleIJnc2MUOJLHZgsdEkUuYKdzrCnrdYR5OMURjFHLburZH0mcufZZlCUiAXfuZv2wteIdEy54kcBRABPhIlJ7At21FBOQ";
let cookie2 =
  "_fbp=fb.1.1757561741334.2112913474150747; _pin_unauth=dWlkPU1tWXhOVFZtWlRNdFlUVTRZaTAwWkdNM0xUazBNall0TTJNd05XSmhNREEzTVRjeA; _ga_9R0G7V6NFT=GS2.1.s1758694412$o9$g0$t1758694412$j60$l0$h0; _ga_C1HTJ0Z50X=GS2.1.s1758621492$o6$g0$t1758621492$j60$l0$h0; _ga=GA1.1.487560733.1757561749; _ga_PFCE2BSYLL=GS2.1.s1757660154$o1$g1$t1757660184$j30$l0$h0; _ga_RNXEBK8XXK=GS2.1.s1758697562$o2$g0$t1758697562$j60$l0$h0; _ga_TZRV1MQDN7=GS2.1.s1758697563$o2$g0$t1758697563$j60$l0$h0; _ga_X9FB5QWEHM=GS2.1.s1758508069$o3$g0$t1758508784$j58$l0$h0; LD=1; gifting_mission_module_occasion={"occasionId":1268340382082,"seenTimestamps":[1757562117043]}; search_results_for_user=6da3jcAk-TwzeHFDd7lM8GyQ0AhjZACCjGeSWyG05n9DW4M6I1sGAA..; exp_ebid=m=1jfWxwXbyzBvU8GdX7Y4A69Vbz%2FQQ8aWPw%2FOCDUV1go%3D,v=OoWFJAfVaK3jNQDXNLO1Yr2KoK2Uo9DA; fve=1757561741.0; user_prefs=yonAbfx9orNicdMsLhHXEzZOXz1jZACCjEPOvTA6WsnD20VJJ680J0dHKTVPNzRYSQcoBBUxglC4iFgGAA..; wedding_session=4fDrHyIj43f4VkFxbXO2q0nMTgpjZACCjDOvmuE0AA..; ua=531227642bc86f3b5fd7103a0c0b4fd6; daily_deals_listings=1887551309,1109609416,1814809427,1800643886,1717255193,1873317928,4333135666,1430311268,1186563967,1261994355,1560564873,1748581321,1800737020,4346116347,1576451873; dashboard_stats_range=last_7; ship_by_date_seller_v_client_timezone_analytics=true; lantern=7168a8ae-7696-4398-b524-e90b81c746f7; _ga_91C9TBEPW1=GS2.1.s1761789898$o1$g0$t1761789898$j60$l0$h0; _ga_YV6D5X0VRL=GS2.1.s1761893991$o1$g0$t1761893996$j55$l0$h0; _ga_EGSHPLQQQ6=GS2.1.s1762151597$o1$g0$t1762151599$j58$l0$h0; _aw_j_6220={"id":"cd14eff7-e91e-40b1-89b2-18649259fe06-1","expiration":1770102050}; listing_page_seen=true; uaid=YCxJkMoZMCEJlzbbV7iOwHRmzjhjZACCjEPOvSA6U66utFqpNDEzRclKydG9yrM0KjwkzCjKJT8qIzLPJ7vCPLPQz7kkw1yplgEA; _gcl_au=1.1.753133236.1757561748.1232915154.1763789611.1763789610; et-v1-1-1-_etsy_com=2%3A1663cf70384377dae85a1dcec99a9e71a1c4fd06%3A1763789651%3A1763789651%3A__athena_compat-1133073005-1432896269815-27164eed2bbb97b6c96f19d561d413434340243bf0ba84dabf353432e02ebef622b5ba777f331c7a; session-key-www=1133073005-1432896269815-4fe7feac2a817149c351596e38c099a6261d613c8ca7f0fadb204854|1771565651; session-key-apex=1133073005-1432896269815-14bae8aae6f6fd23fbef288cb71ec9f4322197f48f5c5970207e6082|1771565651; _uetsid=9ef10e80c35011f0ac9855c2156b42ff; _uetvid=6b0099f08ec011f0a5aa9f45177083e0; QSI_HistorySession=https%3A%2F%2Fwww.etsy.com%2Fyour%2Fshops%2Fme%2Fdashboard~1763792338516%7Chttps%3A%2F%2Fwww.etsy.com%2Fyour%2Forders%2Fsold%3Fref%3Dseller-platform-mcnav~1763792346435; _ga_KR3J610VYM=GS2.1.s1763792338$o141$g1$t1763792347$j51$l0$h0; datadome=p1lpItRGM2XIYfaSdl8Of2uLRLJJf7Og_HEleIJnc2MUOJLHZgsdEkUuYKdzrCnrdYR5OMURjFHLburZH0mcufZZlCUiAXfuZv2wteIdEy54kcBRABPhIlJ7At21FBOQ";

/**
 * 解析 cookie 字符串为对象
 * @param {string} cookieString - Cookie 字符串
 * @returns {Object} Cookie 对象
 */
function parseCookie(cookieString) {
  const cookies = {};
  if (!cookieString || typeof cookieString !== "string") {
    return cookies;
  }

  // 分割 cookie 字符串
  const parts = cookieString.split(";").map((part) => part.trim());

  for (const part of parts) {
    if (!part) continue;

    // 处理键值对
    const [key, ...valueParts] = part.split("=");
    const value = valueParts.join("="); // 处理值中可能包含的 = 号

    if (key) {
      cookies[key.trim()] = value || "";
    }
  }

  return cookies;
}

/**
 * 对比两个 cookie 字符串的差异
 * @param {string} cookie1 - 第一个 cookie 字符串
 * @param {string} cookie2 - 第二个 cookie 字符串
 * @returns {Object} 差异结果
 */
function compareCookies(cookie1, cookie2) {
  const parsed1 = parseCookie(cookie1);
  const parsed2 = parseCookie(cookie2);

  const result = {
    added: {}, // cookie2 中新增的
    removed: {}, // cookie1 中有但 cookie2 中没有的
    modified: {}, // 值被修改的
    unchanged: {}, // 未改变的
    summary: {
      total1: Object.keys(parsed1).length,
      total2: Object.keys(parsed2).length,
      addedCount: 0,
      removedCount: 0,
      modifiedCount: 0,
      unchangedCount: 0,
    },
  };

  // 获取所有唯一的键
  const allKeys = new Set([...Object.keys(parsed1), ...Object.keys(parsed2)]);

  for (const key of allKeys) {
    const value1 = parsed1[key];
    const value2 = parsed2[key];

    if (value1 === undefined && value2 !== undefined) {
      // cookie2 中新增的
      result.added[key] = value2;
      result.summary.addedCount++;
    } else if (value1 !== undefined && value2 === undefined) {
      // cookie1 中有但 cookie2 中没有的（被删除）
      result.removed[key] = value1;
      result.summary.removedCount++;
    } else if (value1 !== value2) {
      // 值被修改的
      result.modified[key] = {
        oldValue: value1,
        newValue: value2,
      };
      result.summary.modifiedCount++;
    } else {
      // 未改变的
      result.unchanged[key] = value1;
      result.summary.unchangedCount++;
    }
  }

  return result;
}

/**
 * 主函数：对比 cookie1 和 cookie2
 */
function compareCookie1AndCookie2() {
  if (!cookie1 && !cookie2) {
    console.log("请先设置 cookie1 和 cookie2 的值");
    return null;
  }

  const result = compareCookies(cookie1, cookie2);

  console.log("=== Cookie 对比结果 ===");
  console.log(`\nCookie1 总数: ${result.summary.total1}`);
  console.log(`Cookie2 总数: ${result.summary.total2}`);
  console.log(`\n新增: ${result.summary.addedCount} 个`);
  console.log(`删除: ${result.summary.removedCount} 个`);
  console.log(`修改: ${result.summary.modifiedCount} 个`);
  console.log(`未改变: ${result.summary.unchangedCount} 个`);

  if (result.summary.addedCount > 0) {
    console.log("\n【新增的 Cookie】");
    for (const [key, value] of Object.entries(result.added)) {
      console.log(`  ${key} = ${value}`);
    }
  }

  if (result.summary.removedCount > 0) {
    console.log("\n【删除的 Cookie】");
    for (const [key, value] of Object.entries(result.removed)) {
      console.log(`  ${key} = ${value}`);
    }
  }

  if (result.summary.modifiedCount > 0) {
    console.log("\n【修改的 Cookie】");
    for (const [key, changes] of Object.entries(result.modified)) {
      console.log(`\n  ${key}:`);
      console.log(`  ┌─ Cookie1 (旧值) ──────────────────────────────────────`);
      console.log(`  │ ${changes.oldValue}`);
      console.log(`  └───────────────────────────────────────────────────────`);
      console.log(`  ┌─ Cookie2 (新值) ──────────────────────────────────────`);
      console.log(`  │ ${changes.newValue}`);
      console.log(`  └───────────────────────────────────────────────────────`);
    }
  }

  if (result.summary.unchangedCount > 0) {
    console.log("\n【未改变的 Cookie】");
    for (const [key, value] of Object.entries(result.unchanged)) {
      console.log(`  ${key} = ${value}`);
    }
  }

  return result;
}

// 导出函数（如果使用模块系统）
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    compareCookies,
    compareCookie1AndCookie2,
    parseCookie,
  };
}

// 使用示例：
// cookie1 = 'session_id=abc123; user_id=456; theme=dark';
// cookie2 = 'session_id=abc123; user_id=789; theme=light; lang=en';
compareCookie1AndCookie2();
GS2.1.s1763790574$o106$g1$t1763791596$j17$l0$h0