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

// 每小阶所需累计 XP：60 + i*25，27 阶总计约 9700 到 Radiant（按每日约 100-150 XP 调校）
const THRESHOLDS: number[] = (() => {
  const arr: number[] = [];
  let c = 0;
  for (let i = 0; i < 27; i++) {
    arr.push(c);
    c += 60 + i * 25;
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
  role: string;
  emoji: string;
  color: string;
  unlockDesc: string;
  cond: (s: SaveState, helpers: BadgeHelpers) => boolean;
}

export const AGENTS: AgentDef[] = [
  { id: "sage-01", codename: "SAGE-01", role: "新兵 / RECRUIT", emoji: "🪖", color: "#3DDBD9", unlockDesc: "初始特工", cond: () => true },
  { id: "recon-x", codename: "RECON-X", role: "侦察 / SCOUT", emoji: "🎯", color: "#A97C50", unlockDesc: "段位达到青铜", cond: (s) => rankForXp(s.xp).idx >= 3 },
  { id: "ghost-0", codename: "GHOST-0", role: "潜入 / INFILTRATOR", emoji: "👻", color: "#C4CDD4", unlockDesc: "段位达到白银", cond: (s) => rankForXp(s.xp).idx >= 6 },
  { id: "blaze-7", codename: "BLAZE-7", role: "突击 / ASSAULT", emoji: "🔥", color: "#FF4655", unlockDesc: "连续打卡 7 天", cond: (_s, h) => h.maxStreak >= 7 },
  { id: "volt-3", codename: "VOLT-3", role: "先锋 / VANGUARD", emoji: "⚡", color: "#FFC24B", unlockDesc: "段位达到黄金", cond: (s) => rankForXp(s.xp).idx >= 9 },
  { id: "nova-k", codename: "NOVA-K", role: "军师 / STRATEGIST", emoji: "🌟", color: "#3DDBD9", unlockDesc: "累计掌握 300 词", cond: (s) => s.stats.masteredCount >= 300 },
  { id: "titan-9", codename: "TITAN-9", role: "重装 / HEAVY", emoji: "🤖", color: "#C38BF5", unlockDesc: "段位达到钻石", cond: (s) => rankForXp(s.xp).idx >= 15 },
  { id: "phantom-z", codename: "PHANTOM-Z", role: "幻影 / PHANTOM", emoji: "🥷", color: "#6FD66F", unlockDesc: "段位达到神话", cond: (s) => rankForXp(s.xp).idx >= 21 },
  { id: "aether", codename: "AETHER-∞", role: "传说 / LEGEND", emoji: "🐉", color: "#FFF3B0", unlockDesc: "段位达到辐能战魂", cond: (s) => rankForXp(s.xp).idx >= 24 },
];

/* ================= 奖励结算 ================= */

export interface RewardFx {
  save: SaveState;
  rankUp: RankDef | null;
  newBadges: BadgeDef[];
  newAgents: AgentDef[];
}

export function applyRewards(prev: SaveState, xpGain: number, helpers: BadgeHelpers): RewardFx {
  let save: SaveState = { ...prev, xp: prev.xp + xpGain };
  const before = rankForXp(prev.xp).idx;
  const after = rankForXp(save.xp).idx;
  const rankUp = after > before ? RANKS[after] : null;

  const newBadges = BADGES.filter((b) => !save.badges.includes(b.id) && b.cond(save, helpers));
  if (newBadges.length) save = { ...save, badges: [...save.badges, ...newBadges.map((b) => b.id)] };

  const newAgents = AGENTS.filter((a) => !save.agents.unlocked.includes(a.id) && a.cond(save, helpers));
  if (newAgents.length)
    save = { ...save, agents: { ...save.agents, unlocked: [...save.agents.unlocked, ...newAgents.map((a) => a.id)] } };

  return { save, rankUp, newBadges, newAgents };
}
