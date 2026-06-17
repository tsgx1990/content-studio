/**
 * Shared zero-dep 中文 marketing-compliance scanner.
 *
 * Two reproducible risk classes that sink ZH marketing content regardless of quality:
 *   - 极限词 (绝对化用语): 《广告法》-banned absolute claims → 限流 / fines.
 *   - 导流 (off-platform contact info): 微信/QQ/二维码/手机号 → the #1 限流/封号 trigger.
 * Plus opt-in INDUSTRY wordlists for high-risk verticals (教育/医疗/金融) where a promise of an
 * outcome (保录取 / 根治 / 保收益) is itself the violation.
 *
 * Lifted out of check-xhsnote.mjs so every ZH vertical (xhs / youtube-script / short-drama) can
 * share ONE source of truth. Rules grounded in docs/research/2026-06-06-xiaohongshu-note-rules.md.
 *
 * Term lists are multi-char on purpose (a bare "最" would false-match 最近/最后).
 */

// 极限词 — absolute-claim words. Default for every scan.
export const EXTREME_TERMS = [
  "最好", "最佳", "最优", "最高级", "最低价", "最便宜", "第一名", "全网第一", "销量第一",
  "100%", "百分百", "国家级", "顶级", "绝无仅有", "独一无二", "永久", "根治", "全国第一", "世界第一",
];

// 导流 — high-confidence off-platform contact markers only (soft signals like 私信/看主页 are
// intentionally excluded — too common in compliant notes). Override per item to tune.
export const DIVERSION_TERMS = [
  "微信", "微信号", "weixin", "wechat", "加微", "vx", "v信", "威信", "薇信",
  "qq号", "扣扣", "公众号", "二维码", "加我好友",
];

// Opt-in, per high-risk industry. A promise of the OUTCOME is the violation here, beyond 极限词.
export const INDUSTRY_TERMS = {
  // 教育 / 升学 / 志愿填报 / 培训
  education: [
    "保录取", "包录取", "确保录取", "保过", "包过", "保上岸", "包上岸", "稳上岸", "保送名校",
    "内部名额", "内部指标", "官方指定", "考试院指定", "教育局指定", "保进", "保上一本", "保上985", "保上211",
    // 升学/招生 承诺/绝对化用语（这类承诺词常滑过通用极限词表，需专门收录）。
    // 刻意只收高置信承诺词：用 "稳上"(不收"稳进")、"不滑档"(不收"不退档"——后者是机制解释、非承诺)、
    // 必上 用具体复合词(不收裸 "必上"，避免误伤 "务必上官网" 这类祈使句)。
    "不滑档", "稳上", "必上岸", "必上本科", "必上一本", "必上名校", "必上重点",
  ],
  // 医疗 / 健康 / 保健品
  medical: [
    "根治", "治愈率", "药到病除", "包治", "包治百病", "无副作用", "纯天然无毒副作用", "100%有效", "永不复发",
  ],
  // 金融 / 理财 / 投资
  finance: [
    "保本", "保收益", "保本保息", "稳赚", "稳赚不赔", "零风险", "无风险", "包赚", "稳赔不赚", "收益最高",
  ],
};

// A bare CN mobile number is a hard 导流 signal regardless of the wordlist.
const PHONE_RE = /(?<![0-9])1[3-9][0-9]{9}(?![0-9])/;

/**
 * Scan text for compliance issues. Returns structured findings; each gate formats its own message.
 * @param {string} text
 * @param {{extremes?:string[], diversion?:string[], industries?:string[], scanPhone?:boolean}} opts
 *   - extremes: 极限词 list (default EXTREME_TERMS; pass [] to disable)
 *   - diversion: 导流 list (default DIVERSION_TERMS; pass [] to disable)
 *   - industries: keys of INDUSTRY_TERMS to ADD (default none)
 *   - scanPhone: scan for a bare mobile number (default true)
 * @returns {{kind:"extreme"|"diversion"|"phone", term:string}[]}
 */
export function findComplianceIssues(text, opts = {}) {
  const {
    extremes = EXTREME_TERMS,
    diversion = DIVERSION_TERMS,
    industries = [],
    scanPhone = true,
  } = opts;
  const hay = String(text == null ? "" : text);
  const low = hay.toLowerCase();
  const findings = [];

  const extremeList = [
    ...(Array.isArray(extremes) ? extremes : []),
    ...industries.flatMap((k) => INDUSTRY_TERMS[k] || []),
  ];
  for (const t of extremeList) {
    if (t && hay.includes(t)) findings.push({ kind: "extreme", term: t });
  }
  for (const t of (Array.isArray(diversion) ? diversion : [])) {
    const tl = String(t).toLowerCase();
    if (tl && low.includes(tl)) findings.push({ kind: "diversion", term: t });
  }
  if (scanPhone) {
    const m = hay.match(PHONE_RE);
    if (m) findings.push({ kind: "phone", term: m[0] });
  }
  return findings;
}
