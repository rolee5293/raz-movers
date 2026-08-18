/**
 * XP 费率补差迁移。
 * 用例数据是 2026-08-18 云端的真实存档汇总值——补差结果必须逐分对得上，
 * 因为这直接改的是孩子看得见的总分。
 */
import { describe, expect, it } from "vitest";
import { migrateXpRate } from "./storage";
import { mergeSaves } from "./merge";
import type { SaveState } from "@/types";

/** 按弟弟主设备 raz#6e315e02 的真实数据构造存档 */
function legacySave(): SaveState {
  const daily: SaveState["daily"] = {};
  // 19 天新词任务 known 合计 190，19 天复习任务 known 合计 355
  for (let i = 0; i < 19; i++) {
    const d = `2026-07-${String(23 + i).padStart(2, "0")}`;
    daily[d] = {
      date: d,
      xp: 100,
      newTask: { idxs: [], done: true, known: 10 },
      reviewTask: { words: [], done: true, known: i === 0 ? 25 : Math.floor(355 / 19) + (i <= 355 % 19 ? 1 : 0) },
      quizTask: { done: true, locked: false, score: 5, total: 5 },
      readingTask: { passageId: 1, done: true, correct: 3, total: 5 },
      bonusGiven: true,
    };
  }
  // 复习 known 精确凑到 355
  const keys = Object.keys(daily);
  let sum = keys.reduce((a, k) => a + daily[k].reviewTask.known, 0);
  daily[keys[0]].reviewTask.known += 355 - sum;

  return {
    version: 1,
    createdAt: "2026-07-23",
    xp: 20011,
    wordCursor: 150,
    words: {},
    daily,
    badges: [],
    agents: { unlocked: ["sage-01"], current: "sage-01" },
    stats: {
      masteredCount: 0,
      quizzesTaken: 200,
      quizQuestions: 1000,
      quizCorrect: 832,
      perfectQuizzes: 93,
      readingsDone: 723,
      readingsPerfect: 11,
      bestCombo: 5,
      wordsLearned: 160,
      perfectDays: 18,
    },
  };
}

describe("migrateXpRate", () => {
  it("把弟弟 20011 分按哥哥费率重算成 45450", () => {
    const out = migrateXpRate(legacySave());
    expect(out.xp).toBe(45450);
    expect(out.xpRate).toBe(2);
    // 阅读累计答对数由残差反推补齐
    expect(out.stats.readingCorrect).toBe(809);
  });

  it("幂等：已迁移的存档再跑一次不变", () => {
    const once = migrateXpRate(legacySave());
    expect(migrateXpRate(once)).toBe(once);
    expect(migrateXpRate(migrateXpRate(once)).xp).toBe(45450);
  });

  it("合并必须保住 xpRate 标记，否则会重复补差", () => {
    const migrated = migrateXpRate(legacySave());
    const legacyOther = legacySave(); // 另一台还没迁移的设备
    const merged = mergeSaves([migrated, legacyOther])!;
    expect(merged.xpRate).toBe(2);
    expect(merged.xp).toBe(45450);
    // 关键：合并结果再跑迁移必须是 no-op
    expect(migrateXpRate(merged).xp).toBe(45450);
  });

  it("残差为负的异常存档只打标记、不改分", () => {
    const broken = { ...legacySave(), xp: 1 };
    const out = migrateXpRate(broken);
    expect(out.xp).toBe(1);
    expect(out.xpRate).toBe(2);
  });

  it("每日 XP 同步放大，看板柱状图不会与总分脱节", () => {
    const before = legacySave();
    const after = migrateXpRate(before);
    const sumBefore = Object.values(before.daily).reduce((a, r) => a + (r.xp ?? 0), 0);
    const sumAfter = Object.values(after.daily).reduce((a, r) => a + (r.xp ?? 0), 0);
    expect(sumAfter).toBeGreaterThan(sumBefore);
    expect(sumAfter / sumBefore).toBeCloseTo(after.xp / before.xp, 2);
  });
});
