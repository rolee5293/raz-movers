import type { SaveState } from "@/types";

/* ================= 段位（Valorant 排位制） ================= */

export interface RankDef {
  idx: number; // 0-26
  tier: string; // EN
  cn: string;
  sub: 1 | 2 | 3;
  name: string; // e.g. "GOLD II"
  cnName: string; // e.g. "黄金 II"
  color: string;
  minXp: number;
  nextXp: number | null; // xp needed for next sub-rank (null = max)
}

const TIERS: Array<{ tier: string; cn: string; color: string }> = [
  { tier: "IRON", cn: "黑铁", color: "#5A6068" },
  { tier: "BRONZE", cn: "青铜", color: "#A97C50" },
  { tier: "SILVER", cn: "白银", color: "#C4CDD4" },
  { tier: "GOLD", cn: "黄金", color: "#FFC24B" },
  { tier: "PLATINUM", cn: "铂金", color: "#3DDBD9" },
  { tier: "DIAMOND", cn: "钻石", color: "#C38BF5" },
  { tier: "ASCENDANT", cn: "超凡", color: "#6FD66F" },
  { tier: "IMMORTAL", cn: "神话", color: "#E5484D" },
  { tier: "RADIANT", cn: "辐能战魂", color: "#FFF3B0" },
];

const ROMAN = ["I", "II", "III"] as const;

// 每小阶所需累计 XP：200 + i*80，27 阶共 31200 到 RADIANT III（与 ielts-protocol 统一）
const THRESHOLDS: number[] = (() => {
  const arr: number[] = [];
  let c = 0;
  for (let i = 0; i < 27; i++) {
    arr.push(c);
    c += 200 + i * 80;
  }
  return arr;
})();

export const MAX_XP = THRESHOLDS[26];

export const RANKS: RankDef[] = THRESHOLDS.map((minXp, i) => {
  const t = TIERS[Math.floor(i / 3)];
  const sub = ((i % 3) + 1) as 1 | 2 | 3;
  return {
    idx: i,
    tier: t.tier,
    cn: t.cn,
    sub,
    name: `${t.tier} ${ROMAN[sub - 1]}`,
    cnName: `${t.cn} ${ROMAN[sub - 1]}`,
    color: t.color,
    minXp,
    nextXp: i < 26 ? THRESHOLDS[i + 1] : null,
  };
});

export function rankForXp(xp: number): RankDef {
  let idx = 0;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (xp >= THRESHOLDS[i]) idx = i;
  }
  return RANKS[idx];
}

/* ================= 勋章 ================= */

export interface BadgeDef {
  id: string;
  icon: string;
  name: string;
  en: string;
  desc: string;
  cond: (s: SaveState, helpers: BadgeHelpers) => boolean;
}

export interface BadgeHelpers {
  streak: number;
  maxStreak: number;
}

export const BADGES: BadgeDef[] = [
  { id: "first-blood", icon: "🩸", name: "首战告捷", en: "FIRST BLOOD", desc: "完成首日全部任务", cond: (s) => s.stats.perfectDays >= 1 },
  { id: "week-ops", icon: "🔥", name: "七日无休", en: "7-DAY OPS", desc: "连续打卡 7 天", cond: (_s, h) => h.maxStreak >= 7 },
  { id: "month-ops", icon: "🗓️", name: "双周连胜", en: "14-DAY OPS", desc: "连续打卡 14 天", cond: (_s, h) => h.maxStreak >= 14 },
  { id: "centurion", icon: "⚔️", name: "五十词斩", en: "WORD-50", desc: "累计掌握 50 词", cond: (s) => s.stats.masteredCount >= 50 },
  { id: "half-k", icon: "🛡️", name: "二百词库", en: "ARSENAL-200", desc: "累计掌握 200 词", cond: (s) => s.stats.masteredCount >= 200 },
  { id: "war-stock", icon: "🏭", name: "五百军火库", en: "WAR STOCK", desc: "累计掌握 500 词", cond: (s) => s.stats.masteredCount >= 500 },
  { id: "deadeye", icon: "🎯", name: "神枪手", en: "DEADEYE", desc: "单次测验 10/10 满分", cond: (s) => s.stats.perfectQuizzes >= 1 },
  { id: "marksman", icon: "🏅", name: "王牌射手", en: "MARKSMAN", desc: "累计 5 次测验满分", cond: (s) => s.stats.perfectQuizzes >= 5 },
  { id: "combo-five", icon: "⚡", name: "五连绝世", en: "COMBO x5", desc: "测验连击达到 5 连击", cond: (s) => s.stats.bestCombo >= 5 },
  { id: "reader-ace", icon: "📖", name: "阅读大师", en: "READER ACE", desc: "累计 10 篇阅读全对", cond: (s) => s.stats.readingsPerfect >= 10 },
  { id: "scholar", icon: "🎓", name: "战术学者", en: "TACTICIAN", desc: "完成全部 41 篇阅读", cond: (s) => s.stats.readingsDone >= 41 },
  { id: "gold-op", icon: "🥇", name: "黄金特工", en: "GOLD AGENT", desc: "段位达到黄金", cond: (s) => rankForXp(s.xp).idx >= 9 },
  { id: "diamond-op", icon: "💎", name: "钻石特工", en: "DIAMOND AGENT", desc: "段位达到钻石", cond: (s) => rankForXp(s.xp).idx >= 15 },
  { id: "radiant-one", icon: "👑", name: "辐能战魂", en: "RADIANT", desc: "段位达到辐能战魂", cond: (s) => rankForXp(s.xp).idx >= 24 },
];

/* ================= 特工形象 ================= */

export interface AgentDef {
  id: string;
  codename: string;
  /** 两字中文名。代号是纯英文，孩子念不出来也记不住 */
  cnName: string;
  role: string;
  emoji: string;
  color: string;
  unlockDesc: string;
  cond: (s: SaveState, helpers: BadgeHelpers) => boolean;
}

export const AGENTS: AgentDef[] = [
  { id: "sage-01", codename: "SAGE-01", cnName: "贤者", role: "新兵 / RECRUIT", emoji: "🪖", color: "#3DDBD9", unlockDesc: "初始特工", cond: () => true },
  { id: "recon-x", codename: "RECON-X", cnName: "斥候", role: "侦察 / SCOUT", emoji: "🎯", color: "#A97C50", unlockDesc: "段位达到青铜", cond: (s) => rankForXp(s.xp).idx >= 3 },
  { id: "ghost-0", codename: "GHOST-0", cnName: "幽影", role: "潜入 / INFILTRATOR", emoji: "👻", color: "#C4CDD4", unlockDesc: "段位达到白银", cond: (s) => rankForXp(s.xp).idx >= 6 },
  { id: "blaze-7", codename: "BLAZE-7", cnName: "烈焰", role: "突击 / ASSAULT", emoji: "🔥", color: "#FF4655", unlockDesc: "连续打卡 7 天", cond: (_s, h) => h.maxStreak >= 7 },
  { id: "volt-3", codename: "VOLT-3", cnName: "疾电", role: "先锋 / VANGUARD", emoji: "⚡", color: "#FFC24B", unlockDesc: "段位达到黄金", cond: (s) => rankForXp(s.xp).idx >= 9 },
  { id: "nova-k", codename: "NOVA-K", cnName: "新星", role: "军师 / STRATEGIST", emoji: "🌟", color: "#3DDBD9", unlockDesc: "累计掌握 300 词", cond: (s) => s.stats.masteredCount >= 300 },
  { id: "titan-9", codename: "TITAN-9", cnName: "泰坦", role: "重装 / HEAVY", emoji: "🤖", color: "#C38BF5", unlockDesc: "段位达到钻石", cond: (s) => rankForXp(s.xp).idx >= 15 },
  { id: "phantom-z", codename: "PHANTOM-Z", cnName: "魅影", role: "幻影 / PHANTOM", emoji: "🥷", color: "#6FD66F", unlockDesc: "段位达到神话", cond: (s) => rankForXp(s.xp).idx >= 21 },
  { id: "aether", codename: "AETHER-∞", cnName: "苍穹", role: "传说 / LEGEND", emoji: "🐉", color: "#FFF3B0", unlockDesc: "段位达到辐能战魂", cond: (s) => rankForXp(s.xp).idx >= 24 },
];

/* ================= 巅峰层（RADIANT III 之上） ================= */

/**
 * 2026-08-18 两人同时打满 RADIANT III，段位条焊死在 100%，屏幕上只剩 TOTAL XP
 * 一个裸数字可比——这正是"我加分不如哥哥"的由来。巅峰层在满级之上继续给目标，
 * 但刻意**不做成纯 XP 门槛**：每一级都要 XP 与一个具体挑战同时达成，且逐级解锁。
 * 光靠重复刷题攒 XP 升不上去，必须每天来、必须做难的事。
 */
export interface PeakDef {
  level: number;
  name: string;
  en: string;
  minXp: number;
  /** 给孩子看的挑战说明 */
  challenge: string;
  /** 当前进度 / 目标值，用来在界面上显示"还差多少" */
  progress: (s: SaveState, h: BadgeHelpers) => { cur: number; need: number };
}

/** 巅峰 1 的门槛就是 RADIANT III 的线：满级当天即可入巅峰，补差立刻兑现成看得见的等级 */

const PEAK_XP = [31200, 33560, 36000, 38520, 41120, 43800, 46560, 49400, 52320, 55320];

export const PEAKS: PeakDef[] = [
  { level: 1, name: "觉醒", en: "AWAKEN", minXp: PEAK_XP[0], challenge: "累计 15 个完美行动日",
    progress: (s) => ({ cur: s.stats.perfectDays, need: 15 }) },
  { level: 2, name: "精准", en: "PRECISION", minXp: PEAK_XP[1], challenge: "累计 20 次测验满分",
    progress: (s) => ({ cur: s.stats.perfectQuizzes, need: 20 }) },
  { level: 3, name: "铁律", en: "IRON WILL", minXp: PEAK_XP[2], challenge: "连续打卡 10 天",
    progress: (_s, h) => ({ cur: h.maxStreak, need: 10 }) },
  { level: 4, name: "洞察", en: "INSIGHT", minXp: PEAK_XP[3], challenge: "阅读全对累计 40 篇",
    progress: (s) => ({ cur: s.stats.readingsPerfect, need: 40 }) },
  { level: 5, name: "锋刃", en: "EDGE", minXp: PEAK_XP[4], challenge: "单次测验打出 5 连击",
    progress: (s) => ({ cur: s.stats.bestCombo, need: 5 }) },
  { level: 6, name: "熔炼", en: "FORGE", minXp: PEAK_XP[5], challenge: "掌握 150 个单词",
    progress: (s) => ({ cur: s.stats.masteredCount, need: 150 }) },
  { level: 7, name: "无瑕", en: "FLAWLESS", minXp: PEAK_XP[6], challenge: "累计 40 个完美行动日",
    progress: (s) => ({ cur: s.stats.perfectDays, need: 40 }) },
  { level: 8, name: "恒久", en: "ETERNAL", minXp: PEAK_XP[7], challenge: "连续打卡 45 天",
    progress: (_s, h) => ({ cur: h.maxStreak, need: 45 }) },
  { level: 9, name: "通读", en: "SCHOLAR", minXp: PEAK_XP[8], challenge: "阅读全对累计 100 篇",
    progress: (s) => ({ cur: s.stats.readingsPerfect, need: 100 }) },
  { level: 10, name: "传说", en: "LEGEND", minXp: PEAK_XP[9], challenge: "掌握 400 个单词",
    progress: (s) => ({ cur: s.stats.masteredCount, need: 400 }) },
];

/** 某一级是否达成（XP 与挑战都要满足） */
export function peakMet(p: PeakDef, s: SaveState, h: BadgeHelpers): boolean {
  const { cur, need } = p.progress(s, h);
  return s.xp >= p.minXp && cur >= need;
}

/**
 * 当前巅峰等级。逐级解锁——中间任何一级没达成就停在那里，
 * 后面即使 XP 早就够了也不跳级（否则补差会让人一口气连跳好几级，之后再无目标）。
 */
export function peakLevel(s: SaveState, h: BadgeHelpers): number {
  let lv = 0;
  for (const p of PEAKS) {
    if (!peakMet(p, s, h)) break;
    lv = p.level;
  }
  return lv;
}

/** 下一级巅峰及其缺口；已满巅峰返回 null */
export function nextPeak(s: SaveState, h: BadgeHelpers): { def: PeakDef; cur: number; need: number; xpGap: number } | null {
  const lv = peakLevel(s, h);
  const def = PEAKS[lv];
  if (!def) return null;
  const { cur, need } = def.progress(s, h);
  return { def, cur, need, xpGap: Math.max(0, def.minXp - s.xp) };
}

/* ================= 奖励结算 ================= */


export interface RewardFx {
  save: SaveState;
  rankUp: RankDef | null;
  peakUp: PeakDef | null;
  newBadges: BadgeDef[];
  newAgents: AgentDef[];
}

export function applyRewards(prev: SaveState, xpGain: number, helpers: BadgeHelpers): RewardFx {
  let save: SaveState = { ...prev, xp: prev.xp + xpGain };
  const before = rankForXp(prev.xp).idx;
  const after = rankForXp(save.xp).idx;
  const rankUp = after > before ? RANKS[after] : null;
  const peakBefore = peakLevel(prev, helpers);
  const peakAfter = peakLevel(save, helpers);
  const peakUp = peakAfter > peakBefore ? PEAKS[peakAfter - 1] : null;

  const newBadges = BADGES.filter((b) => !save.badges.includes(b.id) && b.cond(save, helpers));
  if (newBadges.length) save = { ...save, badges: [...save.badges, ...newBadges.map((b) => b.id)] };

  const newAgents = AGENTS.filter((a) => !save.agents.unlocked.includes(a.id) && a.cond(save, helpers));
  if (newAgents.length)
    save = { ...save, agents: { ...save.agents, unlocked: [...save.agents.unlocked, ...newAgents.map((a) => a.id)] } };

  return { save, rankUp, peakUp, newBadges, newAgents };
}
